// Etapa D — el transporte HTTP del panel. Diez líneas de lógica, pero son
// las diez que deciden si la cookie de sesión viaja y si un 502 con página
// de error de Netlify se confunde con un éxito.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHttpApi, createAuthApi, createVisitApi, AUTH_BASE, COORDINATOR_BASE, VISIT_PATH, VISIT_TOKEN_HEADER } from '../../src/ui/api.js';
import { LOGIN_PATH, LOGOUT_PATH, SESSION_PATH } from '../../src/server/authHandler.js';
import { COORDINATOR_PREFIX } from '../../src/server/coordinatorHandler.js';
import { TOKEN_HEADER } from '../../src/server/visitHandler.js';
import { config as visitFunctionConfig } from '../../netlify/functions/visit.mjs';

const TOKEN_DE_PRUEBA = 'tok1'.padEnd(22, 'x');

const expedienteOk = () => ({
  visit: { id: 'v_1', lang: 'es', patientFirstName: 'Ana', status: 'active' },
  appointments: [],
  passes: [],
  lodging: null,
});

const JSON_OK = (body, status = 200) => ({
  status,
  headers: new Headers({ 'content-type': 'application/json; charset=utf-8' }),
  json: async () => body,
  text: async () => JSON.stringify(body),
});

function fetchDoble(respuesta) {
  const llamadas = [];
  return {
    llamadas,
    fn: async (url, init) => {
      llamadas.push({ url, init });
      return typeof respuesta === 'function' ? respuesta(url, init) : respuesta;
    },
  };
}

describe('createHttpApi', () => {
  test('arma la URL sobre el prefijo y manda la cookie de sesión', async () => {
    // same-origin y no 'omit': la cookie de sesión es HttpOnly, el
    // navegador la manda solo si se le pide. Sin esto, TODO responde 401 y
    // el síntoma —"el panel no guarda nada"— no apunta para acá.
    const f = fetchDoble(JSON_OK({ visits: [] }));
    const api = createHttpApi({ fetch: f.fn });

    await api.request('GET', '/visits');

    assert.equal(f.llamadas[0].url, '/api/coordinator/visits');
    assert.equal(f.llamadas[0].init.credentials, 'same-origin');
    assert.equal(f.llamadas[0].init.method, 'GET');
  });

  test('un GET no lleva cuerpo ni content-type', async () => {
    // `new Request` prohíbe cuerpo en GET, y mandar content-type sin cuerpo
    // convierte peticiones simples en preflight sin ganar nada.
    const f = fetchDoble(JSON_OK({}));
    await createHttpApi({ fetch: f.fn }).request('GET', '/visits');

    assert.equal(f.llamadas[0].init.body, undefined);
    assert.equal(f.llamadas[0].init.headers, undefined);
  });

  test('un POST serializa el cuerpo como JSON', async () => {
    const f = fetchDoble(JSON_OK({ visit: { id: 'v_1' } }, 201));
    const res = await createHttpApi({ fetch: f.fn }).request('POST', '/visits', { patientFirstName: 'Ana' });

    assert.equal(f.llamadas[0].init.body, '{"patientFirstName":"Ana"}');
    assert.equal(f.llamadas[0].init.headers['content-type'], 'application/json');
    assert.deepEqual(res, { status: 201, body: { visit: { id: 'v_1' } } });
  });

  test('un error con cuerpo JSON conserva status Y cuerpo', async () => {
    // El 422 sin su cuerpo sería un "algo salió mal" genérico; con él, el
    // formulario sabe qué campo marcar.
    const f = fetchDoble(JSON_OK({ error: 'invalid', errors: { lang: 'unsupported' } }, 422));
    const res = await createHttpApi({ fetch: f.fn }).request('POST', '/visits', {});

    assert.deepEqual(res, { status: 422, body: { error: 'invalid', errors: { lang: 'unsupported' } } });
  });

  test('un error SIN cuerpo JSON conserva el status', async () => {
    // La página de error de Netlify o un 502 del proxy vienen en HTML. El
    // status es lo único útil ahí, y basta: 401 sigue siendo 401 aunque
    // llegue envuelto en una página.
    const f = fetchDoble({
      status: 401,
      headers: new Headers({ 'content-type': 'text/html' }),
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
      text: async () => '<html>...</html>',
    });
    const res = await createHttpApi({ fetch: f.fn }).request('GET', '/visits');

    assert.deepEqual(res, { status: 401, body: null });
  });

  test('un 200 con cuerpo ilegible TRUENA en vez de fingir éxito', async () => {
    // Este es el caso que importa. Un 2xx cuyo cuerpo no se puede leer no
    // es un éxito con datos vacíos: es un servidor roto o un proxy
    // metiéndose en medio. Devolver `{status:200, body:null}` haría que el
    // store cachee un expediente vacío y lo pinte como si fuera cierto.
    const f = fetchDoble({
      status: 200,
      headers: new Headers({ 'content-type': 'text/html' }),
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
      text: async () => '<html>login</html>',
    });

    await assert.rejects(() => createHttpApi({ fetch: f.fn }).request('GET', '/visits'), /respuesta/i);
  });

  test('un 204 sin cuerpo es éxito, no un cuerpo ilegible', async () => {
    // logout contesta 204. No tiene cuerpo que leer y eso está bien.
    const f = fetchDoble({ status: 204, headers: new Headers(), json: async () => null, text: async () => '' });
    const res = await createHttpApi({ fetch: f.fn }).request('POST', '/logout');

    assert.deepEqual(res, { status: 204, body: null });
  });

  test('el prefijo se puede cambiar: auth y coordinación son dos APIs', async () => {
    const f = fetchDoble(JSON_OK({}));
    await createHttpApi({ fetch: f.fn, base: '/api/auth' }).request('POST', '/login', { username: 'ana.ruiz' });

    assert.equal(f.llamadas[0].url, '/api/auth/login');
  });
});

// Etapa D, hallazgo del navegador — el panel entraba a
// /api/coordinator/login en vez de /api/auth/login: boot() reusaba el
// MISMO api para el store y para authClient, y ese trae base
// '/api/coordinator'. La pantalla de acceso se veía perfecta y ningún test
// se quejaba, porque authClient.test.js inyecta un doble que no sabe de
// bases y solo mira '/login'.
//
// Estas dos pruebas atan el cliente a las constantes que exporta el propio
// servidor: si alguien mueve una ruta de un lado, el otro se entera aquí.
describe('bases de la API — el acceso NO cuelga del prefijo de coordinación', () => {
  test('createAuthApi pega en las mismas rutas que exporta authHandler', async () => {
    const doble = fetchDoble(JSON_OK({}));
    const api = createAuthApi({ fetch: doble.fn });

    await api.request('GET', '/session');
    await api.request('POST', '/login', { username: 'a', password: 'b' });
    await api.request('POST', '/logout');

    assert.deepStrictEqual(
      doble.llamadas.map((l) => l.url),
      [SESSION_PATH, LOGIN_PATH, LOGOUT_PATH],
      'el cliente de auth debe apuntar a /api/auth/*, no al prefijo de coordinación'
    );
  });

  test('createHttpApi sigue colgando del prefijo que atiende coordinatorHandler', async () => {
    const doble = fetchDoble(JSON_OK({ visits: [] }));
    await createHttpApi({ fetch: doble.fn }).request('GET', '/visits');
    assert.strictEqual(doble.llamadas[0].url, `${COORDINATOR_PREFIX}/visits`);
  });

  test('las dos bases son distintas: una sola no puede atender los dos handlers', () => {
    assert.notStrictEqual(AUTH_BASE, COORDINATOR_BASE);
    assert.strictEqual(COORDINATOR_BASE, COORDINATOR_PREFIX);
    assert.ok(SESSION_PATH.startsWith(AUTH_BASE), 'AUTH_BASE debe ser el prefijo real de las rutas de auth');
  });
});

// Etapa E — el cliente del paciente. No comparte código con createHttpApi
// a propósito: manda encabezado en vez de cookie, y traduce el status a un
// resultado en vez de devolverlo crudo, porque del lado paciente no hay un
// store que interprete. Son ocho líneas; compartirlas costaría más de lo
// que ahorra.
describe('createVisitApi', () => {
  test('pide /api/visit con el token en el encabezado y NUNCA en la query string', async () => {
    // Un token en la URL se va al historial del navegador, a los logs del
    // CDN y al Referer. Es la credencial completa de la visita.
    const f = fetchDoble(JSON_OK(expedienteOk()));
    await createVisitApi({ fetch: f.fn }).getVisit(TOKEN_DE_PRUEBA);

    const { url, init } = f.llamadas[0];
    assert.strictEqual(url, VISIT_PATH);
    assert.ok(!url.includes(TOKEN_DE_PRUEBA), 'el token no puede aparecer en la URL');
    assert.strictEqual(init.headers[VISIT_TOKEN_HEADER], TOKEN_DE_PRUEBA);
  });

  test('la ruta y el encabezado son los que de verdad publica y lee el servidor', async () => {
    // Las dos puntas de este contrato viven en archivos distintos y nada
    // más que esto las mantiene juntas: si alguien renombra el encabezado
    // en visitHandler.js, el paciente ve "enlace no disponible" y nada
    // falla en local.
    assert.strictEqual(VISIT_PATH, visitFunctionConfig.path);
    assert.strictEqual(VISIT_TOKEN_HEADER, TOKEN_HEADER);
  });

  test('no manda cookies: la sesión de la coordinadora no tiene nada que hacer aquí', async () => {
    const f = fetchDoble(JSON_OK(expedienteOk()));
    await createVisitApi({ fetch: f.fn }).getVisit(TOKEN_DE_PRUEBA);
    assert.strictEqual(f.llamadas[0].init.credentials, 'omit');
  });

  test('200 con expediente válido devuelve ok', async () => {
    const f = fetchDoble(JSON_OK(expedienteOk()));
    const r = await createVisitApi({ fetch: f.fn }).getVisit(TOKEN_DE_PRUEBA);

    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.record.visit.id, 'v_1');
  });

  test('404 se distingue de una falla: es "esta visita ya no existe", no "no se pudo preguntar"', async () => {
    // La diferencia decide si la caché local se borra o se usa.
    const r = await createVisitApi({ fetch: fetchDoble(JSON_OK({ error: 'not_found' }, 404)).fn }).getVisit(TOKEN_DE_PRUEBA);

    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.notFound, true);
    assert.notStrictEqual(r.failed, true);
  });

  test('500 es falla, no "no existe"', async () => {
    const r = await createVisitApi({ fetch: fetchDoble(JSON_OK({ error: 'internal' }, 500)).fn }).getVisit(TOKEN_DE_PRUEBA);

    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.failed, true);
    assert.notStrictEqual(r.notFound, true);
  });

  test('si fetch rechaza (sin señal) devuelve falla en vez de lanzar', async () => {
    // Aquí sí se atrapa, al revés que en createHttpApi: del lado paciente
    // no hay store que envuelva la llamada, y una excepción suelta deja la
    // página en blanco sin pantalla neutra.
    const api = createVisitApi({ fetch: async () => { throw new TypeError('Failed to fetch'); } });
    const r = await api.getVisit(TOKEN_DE_PRUEBA);

    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.failed, true);
  });

  test('un 200 ilegible no es un expediente vacío', async () => {
    // Página de error de un proxy o de un portal cautivo de wifi de
    // hospital: 200, HTML, y cero relación con la visita.
    const r = await createVisitApi({
      fetch: async () => ({ status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } }),
    }).getVisit(TOKEN_DE_PRUEBA);

    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.failed, true);
  });

  test('un 200 con JSON que no tiene forma de expediente se rechaza', async () => {
    // Sin este guard, un `{}` se guarda en caché y revienta después dentro
    // de renderHomeScreen, donde el error ya no dice de dónde salió.
    const api = createVisitApi({ fetch: fetchDoble(JSON_OK({ ok: true })).fn });
    assert.strictEqual((await api.getVisit(TOKEN_DE_PRUEBA)).ok, false);

    const sinCitas = createVisitApi({ fetch: fetchDoble(JSON_OK({ visit: { id: 'v_1' }, passes: [] })).fn });
    assert.strictEqual((await sinCitas.getVisit(TOKEN_DE_PRUEBA)).ok, false);
  });
});
