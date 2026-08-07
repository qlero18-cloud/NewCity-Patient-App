#!/usr/bin/env node
// La única prueba que corre contra el Blobs de VERDAD.
//
//   node scripts/smoke-blobs.mjs --site https://tu-sitio.netlify.app --username ana.ruiz
//
// Por qué existe, si ya hay 645 tests: porque ninguno de ellos toca Netlify.
// La suite corre contra un Map en memoria (D45) y test/deploy/blobsKv.test.js
// corre contra un BlobsServer local, que es un directorio en disco. Ninguno de
// los dos tiene lo que hace peligroso al Blobs de producción: DOS direcciones
// de edge, una con caché y otra sin ella. Ahí es donde un adaptador que lee
// con consistencia eventual pierde datos, y ahí es donde nada local lo ve.
//
// Qué comprueba, en orden de lo que costaría no verlo:
//
//   1. Que dos cambios seguidos sobre la misma visita sobrevivan los dos.
//      Es LA prueba. Todo el servidor es leer-modificar-escribir, así que si
//      la lectura sirve caché, la segunda escritura pisa a la primera y
//      nadie recibe un error: la coordinadora captura dos citas, ve dos
//      citas, y al día siguiente hay una. Ver netlify/functions/_kv.mjs.
//   2. Que lo que contestó la API de verdad quedó en Blobs, leyéndolo por
//      fuera con las credenciales del sitio en vez de volver a preguntarle
//      al mismo servidor que acaba de decir que sí.
//   3. Que el token que sale al crear la visita abre el endpoint del
//      paciente. Es el enlace que va dentro del QR: si eso no funciona, el
//      resto da igual.
//
// Escribe en producción, así que:
//
//   - Todo lo que crea va marcado PRUEBA-SMOKE y se borra al terminar,
//     también si algo falla a la mitad (el borrado va en un finally).
//   - Exige NETLIFY_SITE_ID y NETLIFY_AUTH_TOKEN aunque hable por HTTP, y se
//     niega a empezar sin ellas: la API no tiene DELETE de visitas, así que
//     el borrado va directo a Blobs. Sin esas variables, correr esto dejaría
//     un expediente de mentira suelto en un sistema de salud para siempre.
//   - La contraseña se teclea, no se pasa por argumento. Mismo motivo que en
//     create-coordinator.mjs: historial de la shell y `ps`.
//
// Sale con 0 si todo pasó y con 1 si algo falló. No borra nada que no haya
// creado él mismo.

import { pathToFileURL } from 'node:url';
import { createVisitStore } from '../src/server/visitStore.js';
import { blobsKv, VISITS_STORE } from '../netlify/functions/_kv.mjs';
import { promptHidden } from './create-coordinator.mjs';

// La marca va en todos los campos de texto que se crean. Si el borrado falla
// —se cae la red justo al final, se acaba el token— quien vea esto en el
// panel tiene que poder decidir en un segundo que se puede tirar.
const MARCA = 'PRUEBA-SMOKE';

const HELP = `
Comprueba contra el sitio desplegado que Netlify Blobs conserva dos cambios
seguidos sobre la misma visita. Crea un expediente de mentira y lo borra.

  node scripts/smoke-blobs.mjs --site https://tu-sitio.netlify.app --username ana.ruiz

Banderas:
  --site <url>        el sitio desplegado, con https://
  --username <user>   una cuenta de coordinación ya creada
  --help

Variables de entorno (las mismas que create-coordinator.mjs):
  NETLIFY_SITE_ID      Site configuration -> General -> Site ID
  NETLIFY_AUTH_TOKEN   User settings -> Applications -> Personal access tokens

Hacen falta aunque este script hable por HTTP: la API no expone borrado de
visitas, así que la limpieza va directa a Blobs. Sin ellas no corre.
`.trim();

// Pura y exportada: decide si el smoke pasa o falla, y un smoke que da verde
// pase lo que pase es peor que no tenerlo (test/deploy/smokeBlobs.test.js).
export function parseArgs(argv) {
  const fail = (error) => ({ command: 'error', site: null, username: null, error });
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
    if (name === 'help') {
      return { command: 'help', site: null, username: null, error: null };
    }
    if (name !== 'site' && name !== 'username') return fail(`bandera desconocida: --${name}`);

    const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
    if (typeof value !== 'string' || value === '' || value.startsWith('--')) {
      return fail(`--${name} necesita un valor`);
    }
    flags.set(name, value);
  }

  const site = flags.get('site');
  const username = flags.get('username');
  if (!site) return fail('falta --site: no hay sitio por defecto, y no debería haberlo.');
  if (!username) return fail('falta --username: hace falta una cuenta de coordinación ya creada.');

  // Se valida el protocolo ANTES de nada porque a esta dirección se le manda
  // una contraseña. Un `--site ejemplo.netlify.app` sin esquema lo
  // interpretaría `new URL` como un error, pero un `javascript:` o un `ftp:`
  // no, y ninguno de los dos debe ver esa contraseña.
  let url;
  try {
    url = new URL(site);
  } catch {
    return fail(`--site no es una URL: "${site}". Va completa, con https://`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return fail(`--site tiene que ser http(s), no "${url.protocol}" — ahí se manda una contraseña.`);
  }

  return {
    command: 'run',
    // Sin diagonal final: todo lo demás se arma como `${site}/api/...` y si
    // no, quedan dos diagonales en medio.
    site: site.replace(/\/+$/, ''),
    username,
    error: null,
  };
}

// El juicio, aparte de la red para poder probarlo con registros rotos a mano.
// Devuelve la lista de problemas; vacía quiere decir que pasó.
export function revisarRegistro(registro, esperado) {
  const problemas = [];

  if (!registro?.visit) {
    problemas.push('no se pudo leer la visita recién creada, o vino sin `visit`');
    return problemas;
  }

  if (registro.visit.token !== esperado.token) {
    problemas.push(
      `el token guardado (${registro.visit.token}) no es el que devolvió la creación (${esperado.token}): ` +
        'el enlace del QR apuntaría a otra cosa',
    );
  }

  const presentes = new Set((registro.appointments ?? []).map((a) => a.id));
  for (const id of esperado.appointmentIds) {
    if (!presentes.has(id)) {
      // Una cita por línea, no una queja agregada: cuál falta importa. Si
      // falta la PRIMERA y está la segunda, el patrón es exactamente el de
      // la consistencia eventual, y quien lea esto tiene que poder verlo sin
      // saberse el proyecto de memoria.
      problemas.push(
        `la cita ${id} se creó (la API contestó 201) pero no está en el registro guardado. ` +
          'Es el síntoma de leer con consistencia EVENTUAL: la segunda escritura partió de una ' +
          'versión anterior a la primera y la pisó. Revisa `consistency` en netlify/functions/_kv.mjs.',
      );
    }
  }

  if (!registro.lodging) {
    problemas.push('el hospedaje se guardó (la API contestó 200) pero el registro no lo trae');
  } else if (registro.lodging.hotel !== esperado.hotel) {
    problemas.push(
      `el hospedaje guardado dice "${registro.lodging.hotel}" y se mandó "${esperado.hotel}": ` +
        'llegó otra escritura, no la nuestra',
    );
  }

  return problemas;
}

function requireEnv() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (!siteID || !token) {
    throw new Error(
      'faltan NETLIFY_SITE_ID y/o NETLIFY_AUTH_TOKEN.\n' +
        'Este script las necesita para BORRAR lo que crea: la API no tiene DELETE de\n' +
        'visitas. Sin ellas se quedaría un expediente de mentira en producción, así que\n' +
        'ni empieza. Ver --help.',
    );
  }
  return { siteID, token };
}

let pasos = 0;
const paso = (texto) => {
  pasos += 1;
  console.log(`  ${String(pasos).padStart(2)}. ${texto}`);
};

// Un cliente diminuto que arrastra la cookie de sesión. `fetch` de Node no
// tiene tarro de cookies, y sin arrastrarla toda mutación contestaría 401.
function crearCliente(site) {
  let cookie = null;

  return {
    get cookie() {
      return cookie;
    },
    async pedir(method, path, body, extraHeaders = {}) {
      const headers = { ...extraHeaders };
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (cookie) headers.cookie = cookie;

      const res = await fetch(`${site}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual',
      });

      // Solo la cookie de sesión, y solo su par nombre=valor: reenviar los
      // atributos (Path, HttpOnly, SameSite) en el encabezado Cookie manda
      // basura que el servidor tiene que ignorar.
      const puestas = res.headers.getSetCookie?.() ?? [];
      for (const linea of puestas) {
        const par = linea.split(';')[0];
        if (par.startsWith('nc_session=')) cookie = par;
      }

      const texto = await res.text();
      let json = null;
      try {
        json = texto ? JSON.parse(texto) : null;
      } catch {
        json = null;
      }
      return { status: res.status, json, texto };
    },
  };
}

function exigir(res, esperado, queEra) {
  if (res.status !== esperado) {
    const detalle = res.texto ? ` — ${res.texto.slice(0, 300)}` : '';
    throw new Error(`${queEra}: se esperaba HTTP ${esperado} y llegó ${res.status}${detalle}`);
  }
  return res.json;
}

async function correr({ site, username }) {
  // Antes de pedir la contraseña: si faltan las variables, que se entere
  // ahora y no después de teclearla.
  const credenciales = requireEnv();

  const password = await promptHidden(`Contraseña de "${username}" en ${site}: `);
  if (!password) throw new Error('contraseña vacía; no se intentó nada');

  const cliente = crearCliente(site);
  const kv = blobsKv(VISITS_STORE, credenciales);
  const store = createVisitStore(kv);

  // El día de hoy y pasado mañana: la visita no debe estar vencida, o el
  // endpoint del paciente contestaría 404 por la regla R1 y el paso 8
  // fallaría por un motivo que no es el que se está probando.
  const ahora = new Date();
  const enHoras = (h) => new Date(ahora.getTime() + h * 3600_000).toISOString();

  let visitId = null;
  let token = null;

  try {
    paso(`entrando como ${username}…`);
    const sesion = await cliente.pedir('POST', '/api/auth/login', { username, password });
    exigir(sesion, 200, 'login');
    if (!cliente.cookie) throw new Error('el login contestó 200 pero no mandó cookie de sesión');

    paso('creando una visita marcada PRUEBA-SMOKE…');
    const creada = exigir(
      await cliente.pedir('POST', '/api/coordinator/visits', {
        patientFirstName: MARCA,
        lang: 'es',
        startsAt: enHoras(1),
        endsAt: enHoras(48),
      }),
      201,
      'crear visita',
    );
    visitId = creada?.visit?.id;
    token = creada?.visit?.token;
    if (!visitId || !token) throw new Error(`la creación no devolvió id y token: ${JSON.stringify(creada)}`);
    console.log(`      visita ${visitId}`);

    // Las dos escrituras seguidas, sin pausa entre ellas: es justo la ventana
    // en la que una lectura cacheada devuelve la versión anterior. Una pausa
    // aquí escondería el bug que este script existe para encontrar.
    paso('agregando la cita A…');
    const citaA = exigir(
      await cliente.pedir('POST', `/api/coordinator/visits/${visitId}/appointments`, {
        serviceName: `${MARCA} A`,
        startsAt: enHoras(2),
        durationMin: 30,
        locationId: 'piso27',
      }),
      201,
      'agregar cita A',
    );

    paso('agregando la cita B inmediatamente después (aquí es donde se pierden datos)…');
    const citaB = exigir(
      await cliente.pedir('POST', `/api/coordinator/visits/${visitId}/appointments`, {
        serviceName: `${MARCA} B`,
        startsAt: enHoras(4),
        durationMin: 45,
        locationId: 'plaza',
      }),
      201,
      'agregar cita B',
    );

    paso('guardando el hospedaje…');
    exigir(
      await cliente.pedir('PUT', `/api/coordinator/visits/${visitId}/lodging`, {
        hotel: MARCA,
        checkIn: enHoras(1),
        checkOut: enHoras(48),
      }),
      200,
      'guardar hospedaje',
    );

    const esperado = {
      token,
      appointmentIds: [citaA.appointment.id, citaB.appointment.id],
      hotel: MARCA,
    };

    paso('releyendo la visita por la API…');
    const porApi = exigir(await cliente.pedir('GET', `/api/coordinator/visits/${visitId}`), 200, 'releer visita');
    const problemasApi = revisarRegistro(porApi, esperado);

    // Por fuera de la Function, con las credenciales del sitio. Si la API
    // dice que sí y esto dice que no, lo que contestó la API no llegó a
    // Blobs — y eso no se distingue preguntándole otra vez a la API.
    paso('releyendo la MISMA visita directo de Blobs, sin pasar por la Function…');
    const porBlobs = await store.getVisit(visitId);
    const problemasBlobs = revisarRegistro(porBlobs, esperado).map((p) => `[directo de Blobs] ${p}`);

    paso('resolviendo el token como lo haría el teléfono del paciente…');
    const delPaciente = await fetch(`${site}/api/visit`, { headers: { 'X-Visit-Token': token } });
    const problemasPaciente = [];
    if (delPaciente.status !== 200) {
      problemasPaciente.push(
        `el endpoint del paciente contestó ${delPaciente.status} con el token recién emitido: ` +
          'el enlace del QR no abriría nada',
      );
    } else {
      const cuerpo = await delPaciente.json();
      if (cuerpo?.visit?.patientFirstName !== MARCA) {
        problemasPaciente.push(`el token resolvió a otra visita: ${JSON.stringify(cuerpo?.visit?.id)}`);
      }
      if ((cuerpo?.appointments ?? []).length !== 2) {
        problemasPaciente.push(
          `el paciente ve ${(cuerpo?.appointments ?? []).length} citas de las 2 que se capturaron`,
        );
      }
    }

    const problemas = [...problemasApi, ...problemasBlobs, ...problemasPaciente];
    if (problemas.length > 0) {
      console.log('');
      console.error(`FALLÓ. ${problemas.length} problema(s):`);
      for (const p of problemas) console.error(`  - ${p}`);
      return false;
    }

    console.log('');
    console.log('Pasó: las dos citas, el hospedaje y el token sobrevivieron, tanto por la API');
    console.log('como leyendo Blobs por fuera. La consistencia fuerte está haciendo su trabajo.');
    return true;
  } finally {
    // También si algo tronó a la mitad. Lo que se creó se borra: es un
    // expediente de mentira en un sistema que va a guardar expedientes de
    // verdad. Se borran las dos llaves (registro e índice del token) porque
    // deleteVisit las conoce; borrar solo el registro dejaría un token vivo.
    if (visitId) {
      try {
        const borrada = await store.deleteVisit(visitId);
        paso(borrada ? `limpieza: visita ${visitId} borrada de Blobs` : `limpieza: la visita ${visitId} ya no estaba`);
      } catch (err) {
        console.error('');
        console.error(`AVISO: no se pudo borrar la visita de prueba ${visitId}: ${err.message}`);
        console.error(`Bórrala a mano desde el panel — es la que dice ${MARCA}.`);
      }
    }
  }
}

async function main(argv) {
  const { command, site, username, error } = parseArgs(argv);

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

  console.log(`Smoke contra ${site} — escribe y borra en PRODUCCIÓN.`);
  console.log('');

  try {
    const ok = await correr({ site, username });
    if (!ok) process.exitCode = 1;
  } catch (err) {
    console.error('');
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main(process.argv.slice(2));
}
