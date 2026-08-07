// Etapa D — el transporte HTTP del panel. Diez líneas de lógica, pero son
// las diez que deciden si la cookie de sesión viaja y si un 502 con página
// de error de Netlify se confunde con un éxito.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHttpApi, createAuthApi, AUTH_BASE, COORDINATOR_BASE } from '../../src/ui/api.js';
import { LOGIN_PATH, LOGOUT_PATH, SESSION_PATH } from '../../src/server/authHandler.js';
import { COORDINATOR_PREFIX } from '../../src/server/coordinatorHandler.js';

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
