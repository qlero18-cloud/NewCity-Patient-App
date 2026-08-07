// Etapa C — cuentas de coordinación. Puro, como visitStore: recibe el mismo
// contrato de KV de cuatro métodos y no importa nada de plataforma, así que
// se prueba entero con un Map (test/server/accountStore.test.js).
//
// Trazado de llaves:
//   account/<usuario>  -> { username, displayName, passwordHash, ... }
//
// Elegiste cuentas individuales sobre una contraseña compartida, y eso es lo
// que hace posible el resto: cada mutación de la Etapa D queda sellada con
// `createdBy`/`updatedBy`, y sacar a una persona es borrar su cuenta, no
// cambiarle la contraseña a todo el mundo.
//
// Lo que este módulo NO hace, a propósito: no crea cuentas por su cuenta ni
// tiene un "usuario por defecto". Las altas pasan por
// scripts/create-coordinator.mjs, que corre quien administra el sitio.

import {
  hashPassword as defaultHash,
  verifyPassword as defaultVerify,
  validatePassword,
  DEFAULT_ITERATIONS,
} from './passwords.js';

const ACCOUNT_PREFIX = 'account/';

export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 32;

// Cinco intentos y quince minutos. El bloqueo se levanta solo porque un
// bloqueo permanente convierte a cualquiera en el administrador del sitio:
// bastan cinco intentos fallidos contra el usuario de una coordinadora para
// dejarla fuera hasta que alguien la desbloquee a mano. Con ventana, lo peor
// que consigue quien ataca es un cuarto de hora de molestia — y a cambio
// vuelve inviable el diccionario, que es de lo que se trata.
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

// El usuario es parte de la LLAVE del almacén (`account/<usuario>`), así que
// este patrón no es cosmético: sin él, un usuario con diagonales se sale de
// su prefijo y escribe donde no le toca. Se limita a ASCII a propósito —
// dos formas Unicode distintas que se ven idénticas serían dos cuentas
// distintas, o peor, la misma.
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]*$/;

export function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validateUsername(value) {
  const username = normalizeUsername(value);
  if (username.length < MIN_USERNAME_LENGTH) return { ok: false, errors: { username: 'tooShort' } };
  if (username.length > MAX_USERNAME_LENGTH) return { ok: false, errors: { username: 'tooLong' } };
  if (!USERNAME_RE.test(username)) return { ok: false, errors: { username: 'invalidChars' } };
  return { ok: true, errors: {} };
}

// El hash nunca sale de este módulo. Todo lo que devuelve una cuenta hacia
// afuera pasa por aquí primero.
function publicView(account) {
  const { passwordHash, ...resto } = account;
  return resto;
}

export function createAccountStore(kv, options = {}) {
  const {
    iterations = DEFAULT_ITERATIONS,
    hash = defaultHash,
    verify = defaultVerify,
  } = options;

  const keyOf = (username) => `${ACCOUNT_PREFIX}${username}`;

  async function readAccount(username) {
    return kv.get(keyOf(username));
  }

  return {
    async createAccount({ username, displayName, password } = {}, now) {
      const nombre = normalizeUsername(username);
      const usuario = validateUsername(nombre);
      if (!usuario.ok) {
        throw new Error(`usuario inválido (${usuario.errors.username}): ${JSON.stringify(username)}`);
      }

      const nombreVisible = typeof displayName === 'string' ? displayName.trim() : '';
      if (!nombreVisible) {
        throw new Error('displayName requerido: es lo que aparece en el registro de quién hizo cada cambio');
      }

      const contra = validatePassword(password);
      if (!contra.ok) throw new Error(`contraseña inválida: ${contra.errors.password}`);

      // Sin sobrescribir. Un alta que pisa una cuenta existente es un cambio
      // de contraseña disfrazado, y por accidente.
      if (await readAccount(nombre)) throw new Error(`la cuenta "${nombre}" ya existe`);

      const account = {
        username: nombre,
        displayName: nombreVisible,
        passwordHash: await hash(password, { iterations }),
        createdAt: now,
        lastLoginAt: null,
        failedAttempts: 0,
        lockedUntil: null,
      };
      await kv.set(keyOf(nombre), account);
      return publicView(account);
    },

    async getAccount(username) {
      const nombre = normalizeUsername(username);
      if (!nombre) return null;
      const account = await readAccount(nombre);
      return account ? publicView(account) : null;
    },

    async listAccounts() {
      const keys = await kv.list(ACCOUNT_PREFIX);
      const accounts = await Promise.all(keys.map((k) => kv.get(k)));
      return accounts.filter(Boolean).map(publicView);
    },

    async deleteAccount(username) {
      const nombre = normalizeUsername(username);
      if (!nombre || !(await readAccount(nombre))) return false;
      await kv.delete(keyOf(nombre));
      return true;
    },

    // Devuelve `{ ok: true, account }` o `{ ok: false, reason }`. Los motivos
    // son para el registro del servidor, NO para la respuesta: quien llama
    // tiene que contestar lo mismo en todos los casos, o el mensaje delata
    // qué usuarios existen.
    async authenticate(username, password, nowMs) {
      if (typeof password !== 'string' || !password) return { ok: false, reason: 'invalidInput' };
      const nombre = normalizeUsername(username);
      if (!nombre) return { ok: false, reason: 'invalidInput' };

      const account = await readAccount(nombre);
      if (!account) {
        // Se deriva una llave aunque no haya a quién compararla. Si se
        // saliera aquí, "usuario inexistente" contestaría al instante y
        // "contraseña equivocada" tardaría lo que tarda PBKDF2: esa
        // diferencia, medida con un cronómetro, es una lista de qué cuentas
        // existen.
        await hash(password.slice(0, 200), { iterations });
        return { ok: false, reason: 'unknown' };
      }

      // Antes de derivar: el bloqueo existe precisamente para dejar de
      // gastar CPU. Si siguiera hasheando cada intento, seguiría siendo un
      // canal para tumbar la Function a puro login.
      if (typeof account.lockedUntil === 'number' && nowMs < account.lockedUntil) {
        return { ok: false, reason: 'locked' };
      }

      if (await verify(password, account.passwordHash)) {
        account.failedAttempts = 0;
        account.lockedUntil = null;
        account.lastLoginAt = nowMs;
        await kv.set(keyOf(nombre), account);
        return { ok: true, account: publicView(account) };
      }

      // Dos intentos fallidos a la vez pueden leer el mismo contador y
      // escribir el mismo valor, así que este conteo puede quedarse corto:
      // Blobs no tiene comparar-y-escribir. Se acepta — el bloqueo sigue
      // llegando, tarda un intento más, y la alternativa es un candado
      // distribuido para proteger un contador de cinco.
      account.failedAttempts = (account.failedAttempts || 0) + 1;
      if (account.failedAttempts >= MAX_FAILED_ATTEMPTS) {
        account.lockedUntil = nowMs + LOCKOUT_MS;
        account.failedAttempts = 0; // al vencer la ventana, empieza de nuevo
      }
      await kv.set(keyOf(nombre), account);
      return { ok: false, reason: 'badPassword' };
    },
  };
}
