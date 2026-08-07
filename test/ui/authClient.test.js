// Etapa D — el lado del navegador de la auth que construyó la Etapa C.
// Sin esto el panel no tiene por dónde entrar: /api/coordinator exige
// sesión en TODA ruta, así que un panel sin login contesta 401 a cada
// acción y se ve como si estuviera roto.
//
// La contraseña pasa por aquí y no se guarda en ningún lado: se manda y se
// suelta. El navegador conserva la sesión en la cookie HttpOnly que firma
// el servidor, que es justamente lo que JavaScript no puede leer.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthClient } from '../../src/ui/authClient.js';

const ANA = { username: 'ana.ruiz', displayName: 'Ana Ruiz' };

function apiDoble(respuestas = {}) {
  const llamadas = [];
  return {
    llamadas,
    async request(method, path, body) {
      llamadas.push({ method, path, body });
      const r = respuestas[`${method} ${path}`] ?? { status: 200, body: {} };
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

describe('session()', () => {
  test('con sesión válida devuelve quién es', async () => {
    const api = apiDoble({ 'GET /session': { status: 200, body: { user: ANA } } });
    const res = await createAuthClient({ api }).session();

    assert.deepEqual(res, { ok: true, user: ANA });
    assert.deepEqual(api.llamadas[0], { method: 'GET', path: '/session', body: undefined });
  });

  test('sin sesión NO es un error: es la respuesta esperada al abrir el panel', async () => {
    // Esta llamada se hace al cargar la página, antes de que nadie haya
    // hecho nada. Un 401 aquí es lo normal, no una falla que reportar.
    const api = apiDoble({ 'GET /session': { status: 401, body: { error: 'unauthenticated' } } });
    assert.deepEqual(await createAuthClient({ api }).session(), { ok: false, unauthenticated: true });
  });

  test('el servidor caído se distingue de no tener sesión', async () => {
    // Distinguirlos importa: sin sesión hay que pedir credenciales, con el
    // servidor caído pedirlas no sirve de nada y solo hace que alguien
    // teclee su contraseña tres veces creyendo que se equivocó.
    const api = apiDoble({ 'GET /session': { status: 500, body: { error: 'internal' } } });
    assert.deepEqual(await createAuthClient({ api }).session(), { ok: false, failed: true });

    const caido = apiDoble({ 'GET /session': new TypeError('Failed to fetch') });
    assert.deepEqual(await createAuthClient({ api: caido }).session(), { ok: false, failed: true });
  });
});

describe('signIn()', () => {
  test('manda usuario y contraseña y devuelve quién entró', async () => {
    const api = apiDoble({ 'POST /login': { status: 200, body: { user: ANA } } });
    const res = await createAuthClient({ api }).signIn({ username: 'ana.ruiz', password: 'x' });

    assert.deepEqual(res, { ok: true, user: ANA });
    assert.deepEqual(api.llamadas[0].body, { username: 'ana.ruiz', password: 'x' });
  });

  test('credenciales malas: un solo resultado, sin decir cuál de los dos falló', async () => {
    // El servidor ya contesta lo mismo para usuario inexistente, contraseña
    // mala y cuenta bloqueada (authHandler.js:38). El cliente no inventa
    // una distinción que el servidor se negó a dar.
    const api = apiDoble({ 'POST /login': { status: 401, body: { error: 'invalid_credentials' } } });
    assert.deepEqual(await createAuthClient({ api }).signIn({ username: 'x', password: 'y' }), {
      ok: false,
      invalidCredentials: true,
    });
  });

  test('el servidor caído NO se reporta como contraseña incorrecta', async () => {
    // Sin SESSION_SECRET, las Functions truenan con 500. Decir "contraseña
    // incorrecta" ahí manda a la persona a probar contraseñas durante
    // media hora en vez de a revisar la variable de entorno.
    const api = apiDoble({ 'POST /login': { status: 500, body: { error: 'internal' } } });
    assert.deepEqual(await createAuthClient({ api }).signIn({ username: 'x', password: 'y' }), {
      ok: false,
      failed: true,
    });
  });

  test('la contraseña no se queda en el cliente', async () => {
    // El cliente no tiene estado donde guardarla, y esta prueba lo fija:
    // lo único que sale de signIn es el usuario público. Si algún día
    // alguien agrega un "recordar contraseña", esto se pone rojo.
    const api = apiDoble({ 'POST /login': { status: 200, body: { user: ANA } } });
    const client = createAuthClient({ api });
    const res = await client.signIn({ username: 'ana.ruiz', password: 'secreta' });

    assert.equal(JSON.stringify(res).includes('secreta'), false);
    assert.equal(JSON.stringify(client).includes('secreta'), false);
  });
});

describe('signOut()', () => {
  test('204 es éxito', async () => {
    const api = apiDoble({ 'POST /logout': { status: 204, body: null } });
    const res = await createAuthClient({ api }).signOut();

    assert.deepEqual(res, { ok: true });
    assert.equal(api.llamadas[0].path, '/logout');
  });

  test('si el servidor no contesta, salir igual cuenta como salir', async () => {
    // Quien le dio a "Salir" quiere dejar de tener sesión en esta pantalla.
    // Dejarla abierta porque la red falló es lo contrario de lo que pidió,
    // y en una máquina compartida de coordinación eso sí importa. La cookie
    // sigue viva del lado del servidor hasta que caduque —no hay forma de
    // invalidar una cookie firmada desde aquí— pero el panel se cierra.
    const api = apiDoble({ 'POST /logout': new TypeError('Failed to fetch') });
    assert.deepEqual(await createAuthClient({ api }).signOut(), { ok: true });
  });
});
