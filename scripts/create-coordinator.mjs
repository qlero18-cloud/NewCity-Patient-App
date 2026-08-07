#!/usr/bin/env node
// Etapa C — alta, baja y listado de cuentas de coordinación.
//
// Este script lo corres TÚ, no yo. Yo construí el mecanismo; las cuentas
// reales y sus contraseñas no pasan por mí ni quedan en esta conversación.
//
//   node scripts/create-coordinator.mjs --gen-secret
//   node scripts/create-coordinator.mjs --username ana.ruiz --name "Ana Ruiz"
//   node scripts/create-coordinator.mjs --list
//   node scripts/create-coordinator.mjs --delete ana.ruiz
//
// La contraseña NO se puede pasar por argumento, y eso es deliberado: la
// línea de comandos queda en el historial de la shell y la ve cualquiera que
// corra `ps` mientras el script trabaja. Se pide por teclado, sin eco, y se
// confirma dos veces.
//
// Para hablar con el Blobs del sitio desde tu máquina hacen falta dos
// variables de entorno (el runtime de Netlify las inyecta solo cuando el
// código corre allá, no aquí):
//
//   NETLIFY_SITE_ID      Site configuration -> General -> Site ID
//   NETLIFY_AUTH_TOKEN   User settings -> Applications -> Personal access tokens
//
// Ese token es de administración del sitio: no lo pegues en el repo, no lo
// mandes por chat y bórralo de Netlify cuando termines de dar de alta.
//
// Se ejecuta contra el sitio de PRODUCCIÓN. No hay confirmación al crear
// —crear de más es reversible con --delete— pero sí al borrar.

import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createAccountStore } from '../src/server/accountStore.js';
import { validatePassword, MIN_PASSWORD_LENGTH } from '../src/server/passwords.js';
import { blobsKv, ACCOUNTS_STORE } from '../netlify/functions/_kv.mjs';

const VALUE_FLAGS = new Set(['username', 'name', 'delete']);
const BOOL_FLAGS = new Set(['list', 'gen-secret', 'help']);

// Pura y exportada para poder probarla: `--delete` borra una cuenta, así que
// leer mal un argumento no es un detalle cosmético
// (test/server/createCoordinatorArgs.test.js).
export function parseArgs(argv) {
  const fail = (error) => ({ command: 'error', username: null, displayName: null, error });
  const flags = new Map();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (typeof arg !== 'string' || !arg.startsWith('--')) {
      return fail(`argumento suelto: "${arg}". Todo lleva bandera; corre --help.`);
    }

    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);

    if (name === 'password') {
      return fail(
        '--password no existe a propósito: la línea de comandos queda en el historial ' +
          'de la shell y la ve cualquiera que corra `ps`. El script la pide por teclado.',
      );
    }

    if (BOOL_FLAGS.has(name)) {
      if (eq !== -1) return fail(`--${name} no lleva valor`);
      flags.set(name, true);
      continue;
    }
    if (!VALUE_FLAGS.has(name)) return fail(`bandera desconocida: --${name}`);

    let value;
    if (eq !== -1) {
      value = arg.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      // `--delete --list` no se lee como "borra la cuenta llamada --list".
      if (next === undefined || next.startsWith('--')) return fail(`--${name} necesita un valor`);
      value = next;
      i += 1;
    }
    if (!value.trim()) return fail(`--${name} necesita un valor`);
    flags.set(name, value.trim());
  }

  if (flags.has('help') || flags.size === 0) {
    return { command: 'help', username: null, displayName: null, error: null };
  }

  const comandos = [];
  if (flags.has('list')) comandos.push('--list');
  if (flags.has('gen-secret')) comandos.push('--gen-secret');
  if (flags.has('delete')) comandos.push('--delete');
  if (flags.has('username') || flags.has('name')) comandos.push('alta');

  if (comandos.length > 1) return fail(`solo un comando a la vez; llegaron: ${comandos.join(', ')}`);

  if (comandos[0] === 'alta') {
    if (!flags.has('username')) return fail('falta --username');
    if (!flags.has('name')) return fail('falta --name (es lo que se ve en el registro de quién hizo cada cambio)');
    return {
      command: 'create',
      username: flags.get('username'),
      displayName: flags.get('name'),
      error: null,
    };
  }
  if (comandos[0] === '--delete') {
    return { command: 'delete', username: flags.get('delete'), displayName: null, error: null };
  }
  return { command: comandos[0] === '--list' ? 'list' : 'gen-secret', username: null, displayName: null, error: null };
}

const HELP = `
Cuentas de coordinación — NewCity Patient App

  --gen-secret                       genera un SESSION_SECRET para pegar en Netlify
  --username <u> --name "<Nombre>"   da de alta (pide la contraseña por teclado)
  --list                             lista las cuentas (nunca muestra hashes)
  --delete <u>                       da de baja (pide confirmación)

Variables de entorno para todo menos --gen-secret:
  NETLIFY_SITE_ID      Site configuration -> General -> Site ID
  NETLIFY_AUTH_TOKEN   User settings -> Applications -> Personal access tokens
`.trim();

// Lee sin eco. `readline` no sabe hacerlo, así que se pone la terminal en
// modo crudo y se procesa carácter por carácter — incluido el caso de pegar,
// que llega como un solo bloque.
//
// Las teclas de control se construyen con fromCharCode y no como literal. Un
// control crudo en el fuente es invisible en el editor y se pierde al copiar;
// un escape \u.... sobrevive, pero se lee igual de mal y varias herramientas
// lo reescriben. Ninguna de las dos formas se distingue a ojo de una cadena
// vacía —`JSON.stringify` tampoco escapa U+007F— y ahí está el riesgo: si DEL
// se perdiera, la rama de borrado nunca se activaría y, como DEL pasa el
// filtro `ch >= ' '`, la tecla de borrar AGREGARÍA un carácter a la contraseña
// en vez de quitarlo. Sin eco, nadie lo notaría hasta no poder entrar.
const CTRL_C = String.fromCharCode(0x03);
const EOF = String.fromCharCode(0x04); // Ctrl-D
const ESC = String.fromCharCode(0x1b);
const DEL = String.fromCharCode(0x7f); // la tecla de borrar manda DEL, no backspace

// Estado inicial de una lectura. Congelado: `applyKey` nunca muta, siempre
// devuelve uno nuevo, así que dos lecturas seguidas no se contaminan.
export const INITIAL_KEYS = Object.freeze({ value: '', esc: false });

// Reductor puro (estado, tecla) -> { state, action }, separado del manejo de
// la terminal justo para poder probarlo: sin eco y en modo crudo, esta lógica
// es invisible tanto al usarla como al revisarla
// (test/server/createCoordinatorArgs.test.js).
export function applyKey(state, ch) {
  // Dentro de una secuencia CSI —flechas, inicio, fin, suprimir— se descarta
  // hasta la letra o '~' que la cierra. Sin esto, una flecha mete "[A" en la
  // contraseña: el ESC se ignora por ser control y los otros dos se acumulan.
  if (state.esc) {
    return { state: { ...state, esc: !/[A-Za-z~]/.test(ch) }, action: 'continue' };
  }
  if (ch === ESC) return { state: { ...state, esc: true }, action: 'continue' };

  if (ch === '\r' || ch === '\n' || ch === EOF) return { state, action: 'submit' };
  if (ch === CTRL_C) return { state: INITIAL_KEYS, action: 'abort' };

  // Antes del filtro de imprimibles, no después: DEL vale 0x7f y lo pasaría.
  if (ch === DEL || ch === '\b') {
    return { state: { ...state, value: state.value.slice(0, -1) }, action: 'continue' };
  }
  if (ch >= ' ') return { state: { ...state, value: state.value + ch }, action: 'continue' };

  return { state, action: 'continue' }; // cualquier otro control, ignorado
}

function promptHidden(question) {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) {
    return Promise.reject(
      new Error('la contraseña se escribe en una terminal interactiva; no se acepta por tubería ni por argumento'),
    );
  }

  return new Promise((resolve) => {
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let state = INITIAL_KEYS;
    const terminar = (resultado) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      stdout.write('\n');
      resolve(resultado);
    };

    const onData = (chunk) => {
      for (const ch of chunk) {
        const { state: siguiente, action } = applyKey(state, ch);
        state = siguiente;
        if (action === 'submit') return terminar(state.value);
        if (action === 'abort') {
          // Ctrl-C en modo crudo no lo maneja nadie más: hay que salir aquí,
          // o la terminal se queda sin eco después de matar el proceso.
          stdin.setRawMode(false);
          stdout.write('\n');
          process.exit(130);
        }
      }
      return undefined;
    };

    stdin.on('data', onData);
  });
}

function requireEnv() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (!siteID || !token) {
    throw new Error(
      'faltan NETLIFY_SITE_ID y/o NETLIFY_AUTH_TOKEN.\n' +
        'Sin ellas este script no sabe con qué sitio hablar — el runtime de Netlify\n' +
        'las inyecta solo cuando el código corre allá. Ver --help.',
    );
  }
  return { siteID, token };
}

function accountStore() {
  return createAccountStore(blobsKv(ACCOUNTS_STORE, requireEnv()));
}

async function comandoCrear(username, displayName) {
  const store = accountStore();

  const password = await promptHidden(`Contraseña para "${username}" (mínimo ${MIN_PASSWORD_LENGTH}): `);
  const check = validatePassword(password);
  if (!check.ok) throw new Error(`contraseña rechazada: ${check.errors.password}`);

  const otraVez = await promptHidden('Otra vez para confirmar: ');
  if (password !== otraVez) throw new Error('las dos contraseñas no coinciden; no se creó nada');

  const cuenta = await store.createAccount({ username, displayName, password }, Date.now());
  console.log(`Cuenta creada: ${cuenta.username} (${cuenta.displayName}).`);
  console.log('Entrégale la contraseña por un canal aparte, no por el mismo donde mandas el usuario.');
}

async function comandoListar() {
  const cuentas = await accountStore().listAccounts();
  if (cuentas.length === 0) {
    console.log('No hay cuentas todavía.');
    return;
  }
  for (const c of cuentas.sort((a, b) => a.username.localeCompare(b.username))) {
    const ultimo = c.lastLoginAt ? new Date(c.lastLoginAt).toISOString() : 'nunca';
    const bloqueada = c.lockedUntil && Date.now() < c.lockedUntil ? '  [BLOQUEADA]' : '';
    console.log(`${c.username.padEnd(24)} ${c.displayName.padEnd(28)} último acceso: ${ultimo}${bloqueada}`);
  }
}

async function comandoBorrar(username) {
  const store = accountStore();
  const cuenta = await store.getAccount(username);
  if (!cuenta) throw new Error(`no existe la cuenta "${username}"`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const respuesta = await rl.question(`Borrar a ${cuenta.username} (${cuenta.displayName})? Escribe el usuario para confirmar: `);
  rl.close();

  // Se pide teclear el usuario completo, no "s/n": borrar una cuenta saca a
  // esa persona del panel de inmediato (requireCoordinator la revisa contra
  // el almacén en cada mutación), y un enter de más no debería lograrlo.
  if (respuesta.trim() !== cuenta.username) {
    console.log('No coincide. No se borró nada.');
    return;
  }
  await store.deleteAccount(username);
  console.log(`Cuenta borrada: ${cuenta.username}. Su sesión deja de servir en la siguiente petición.`);
}

function comandoSecreto() {
  console.log(randomBytes(32).toString('hex'));
  console.log('');
  console.log('Pégalo en Netlify como SESSION_SECRET (Site configuration -> Environment variables).');
  console.log('No lo commitees. Cambiarlo cierra la sesión de todas las coordinadoras al instante,');
  console.log('que es justo lo que quieres si crees que se filtró.');
}

async function main(argv) {
  const { command, username, displayName, error } = parseArgs(argv);

  if (command === 'error') {
    console.error(`Error: ${error}\n`);
    console.error(HELP);
    process.exitCode = 2;
    return;
  }
  if (command === 'help') {
    console.log(HELP);
    return;
  }

  try {
    if (command === 'gen-secret') comandoSecreto();
    else if (command === 'list') await comandoListar();
    else if (command === 'delete') await comandoBorrar(username);
    else await comandoCrear(username, displayName);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  }
}

// Solo corre si se invocó como programa. Importado desde la suite, exporta
// parseArgs y nada más.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main(process.argv.slice(2));
}
