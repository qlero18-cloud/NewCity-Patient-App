// Etapa C — el manejador de login/logout/sesión. Se escribe antes que
// src/server/authHandler.js (rojo esperado).
//
// Igual que visitHandler: `Request` y `Response` estándar, los dos globales
// en Node ≥18, así que se prueba de verdad —armando la petición y leyendo la
// respuesta, encabezados incluidos— sin levantar Netlify ni instalar nada.
//
// La propiedad que más pruebas ocupa aquí no es el camino feliz: es que los
// TRES fallos —usuario inexistente, contraseña equivocada y cuenta
// bloqueada— contesten exactamente lo mismo. Si difieren en algo, el
// endpoint es un directorio de quién trabaja en coordinación.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleAuthRequest,
  readSession,
  requireCoordinator,
  LOGIN_PATH,
  LOGOUT_PATH,
  SESSION_PATH,
} from '../../src/server/authHandler.js';
import { createAccountStore, MAX_FAILED_ATTEMPTS } from '../../src/server/accountStore.js';
import { createSessionSigner, SESSION_COOKIE, MIN_SECRET_LENGTH } from '../../src/server/sessions.js';

const ORIGIN = 'https://nchpatient.netlify.app';
const SECRET = 'x'.repeat(MIN_SECRET_LENGTH);
const NOW = Date.parse('2026-03-10T10:00:00Z');
const PASS = 'coordinacion-torre-27';

function memoryKv() {
  const data = new Map();
  return {
    async get(key) {
      return data.has(key) ? structuredClone(data.get(key)) : null;
    },
    async set(key, value) {
      data.set(key, structuredClone(value));
    },
    async delete(key) {
      data.delete(key);
    },
    async list(prefix) {
      return [...data.keys()].filter((k) => k.startsWith(prefix));
    },
  };
}

async function seeded() {
  const accounts = createAccountStore(memoryKv(), { iterations: 1 });
  await accounts.createAccount({ username: 'ana', displayName: 'Ana Ruiz', password: PASS }, NOW);
  const signer = createSessionSigner(SECRET);
  return { accounts, signer, deps: { accounts, signer, nowMs: NOW } };
}

function post(path, body, { cookie } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function get(path, { cookie } = {}) {
  return new Request(`${ORIGIN}${path}`, { method: 'GET', headers: cookie ? { cookie } : {} });
}

// De un `Set-Cookie` a algo que se pueda mandar de vuelta como `Cookie`.
function cookieDe(res) {
  const set = res.headers.get('set-cookie');
  return set ? set.split(';')[0] : null;
}

describe('login — camino feliz', () => {
  test('devuelve 200 con quién entró, y nada más', async () => {
    const { deps } = await seeded();
    const res = await handleAuthRequest(post(LOGIN_PATH, { username: 'ana', password: PASS }), deps);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { user: { username: 'ana', displayName: 'Ana Ruiz' } });
  });

  test('la respuesta no lleva el hash ni la contraseña', async () => {
    const { deps } = await seeded();
    const res = await handleAuthRequest(post(LOGIN_PATH, { username: 'ana', password: PASS }), deps);
    const texto = await res.text();
    assert.ok(!texto.includes(PASS), 'la respuesta repite la contraseña');
    assert.ok(!texto.includes('pbkdf2'), 'la respuesta lleva el hash');
  });

  test('manda la cookie con los cuatro atributos que la protegen', async () => {
    const { deps } = await seeded();
    const res = await handleAuthRequest(post(LOGIN_PATH, { username: 'ana', password: PASS }), deps);
    const set = res.headers.get('set-cookie');
    assert.ok(set.startsWith(`${SESSION_COOKIE}=`));
    for (const attr of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) {
      assert.ok(set.includes(attr), `falta ${attr} en: ${set}`);
    }
  });

  test('la cookie que manda es una sesión que de verdad verifica', async () => {
    const { signer, deps } = await seeded();
    const res = await handleAuthRequest(post(LOGIN_PATH, { username: 'ana', password: PASS }), deps);
    const valor = cookieDe(res).slice(`${SESSION_COOKIE}=`.length);
    assert.equal(signer.verify(valor, NOW).sub, 'ana');
  });

  test('acepta el usuario con otra caja y espacios', async () => {
    const { deps } = await seeded();
    const res = await handleAuthRequest(post(LOGIN_PATH, { username: ' ANA ', password: PASS }), deps);
    assert.equal(res.status, 200);
  });
});

describe('login — los tres fallos son indistinguibles', () => {
  async function respuestaDe(deps, body) {
    const res = await handleAuthRequest(post(LOGIN_PATH, body), deps);
    return { status: res.status, texto: await res.text(), cookie: res.headers.get('set-cookie') };
  }

  test('contraseña equivocada, usuario inexistente y cuenta bloqueada contestan lo mismo', async () => {
    const { accounts, signer } = await seeded();
    const deps = { accounts, signer, nowMs: NOW };

    const mala = await respuestaDe(deps, { username: 'ana', password: 'no-es-la-buena' });
    const nadie = await respuestaDe(deps, { username: 'fantasma', password: PASS });

    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      await respuestaDe(deps, { username: 'ana', password: 'no-es-la-buena' });
    }
    const bloqueada = await respuestaDe(deps, { username: 'ana', password: PASS });

    assert.equal(mala.status, 401);
    assert.deepEqual(nadie, mala, 'usuario inexistente se distingue de contraseña equivocada');
    assert.deepEqual(bloqueada, mala, 'cuenta bloqueada se distingue de contraseña equivocada');
  });

  test('ningún fallo manda cookie', async () => {
    const { deps } = await seeded();
    const { cookie } = await respuestaDe(deps, { username: 'ana', password: 'no-es-la-buena' });
    assert.equal(cookie, null);
  });

  test('el cuerpo del error no dice cuál de los tres fue', async () => {
    const { deps } = await seeded();
    const { texto } = await respuestaDe(deps, { username: 'fantasma', password: PASS });
    assert.deepEqual(JSON.parse(texto), { error: 'invalid_credentials' });
    for (const filtracion of ['unknown', 'locked', 'badPassword', 'fantasma']) {
      assert.ok(!texto.includes(filtracion), `el error filtra "${filtracion}"`);
    }
  });
});

describe('login — peticiones mal formadas', () => {
  test('400 si el cuerpo no es JSON', async () => {
    const { deps } = await seeded();
    const res = await handleAuthRequest(post(LOGIN_PATH, 'no soy json'), deps);
    assert.equal(res.status, 400);
  });

  test('400 si faltan campos o no son texto', async () => {
    const { deps } = await seeded();
    for (const body of [{}, { username: 'ana' }, { password: PASS }, { username: 42, password: PASS }, [], null]) {
      const res = await handleAuthRequest(post(LOGIN_PATH, body), deps);
      assert.equal(res.status, 400, `cuerpo ${JSON.stringify(body)}`);
    }
  });

  test('405 si no es POST', async () => {
    const { deps } = await seeded();
    assert.equal((await handleAuthRequest(get(LOGIN_PATH), deps)).status, 405);
  });
});

describe('logout', () => {
  test('borra la cookie y contesta 204', async () => {
    const { deps } = await seeded();
    const res = await handleAuthRequest(post(LOGOUT_PATH, {}), deps);
    assert.equal(res.status, 204);
    assert.match(res.headers.get('set-cookie'), /Max-Age=0/);
  });

  test('funciona igual sin sesión — salir es idempotente', async () => {
    const { deps } = await seeded();
    const res = await handleAuthRequest(post(LOGOUT_PATH, {}), deps);
    assert.equal(res.status, 204);
    assert.match(res.headers.get('set-cookie'), /HttpOnly/);
  });

  test('después de salir, la cookie borrada ya no abre nada', async () => {
    const { deps } = await seeded();
    const salida = await handleAuthRequest(post(LOGOUT_PATH, {}), deps);
    const res = await handleAuthRequest(get(SESSION_PATH, { cookie: cookieDe(salida) }), deps);
    assert.equal(res.status, 401);
  });
});

describe('GET sesión', () => {
  async function conSesion() {
    const { accounts, signer, deps } = await seeded();
    const login = await handleAuthRequest(post(LOGIN_PATH, { username: 'ana', password: PASS }), deps);
    return { accounts, signer, deps, cookie: cookieDe(login) };
  }

  test('con cookie válida dice quién es', async () => {
    const { deps, cookie } = await conSesion();
    const res = await handleAuthRequest(get(SESSION_PATH, { cookie }), deps);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { user: { username: 'ana', displayName: 'Ana Ruiz' } });
  });

  test('sin cookie, 401', async () => {
    const { deps } = await seeded();
    const res = await handleAuthRequest(get(SESSION_PATH), deps);
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: 'unauthenticated' });
  });

  test('con la cookie vencida, 401', async () => {
    const { deps, cookie } = await conSesion();
    const tarde = { ...deps, nowMs: NOW + 9 * 60 * 60 * 1000 };
    assert.equal((await handleAuthRequest(get(SESSION_PATH, { cookie }), tarde)).status, 401);
  });

  test('con la cookie manipulada, 401', async () => {
    const { deps, cookie } = await conSesion();
    const [payload, sig] = cookie.split('.');
    const tocada = `${payload}.${(sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)}`;
    assert.equal((await handleAuthRequest(get(SESSION_PATH, { cookie: tocada }), deps)).status, 401);
  });

  test('con una cookie firmada por otra llave, 401', async () => {
    const { accounts, deps } = await seeded();
    const ajena = createSessionSigner('z'.repeat(MIN_SECRET_LENGTH)).sign({ sub: 'ana' }, NOW);
    const res = await handleAuthRequest(get(SESSION_PATH, { cookie: `${SESSION_COOKIE}=${ajena}` }), deps);
    assert.equal(res.status, 401);
    assert.ok(accounts, 'la cuenta existe: lo que falla es la firma, no el usuario');
  });

  test('si borraron la cuenta, la cookie deja de servir ANTES de que venza', async () => {
    // Esta es la razón de que la sesión se revise contra el almacén y no
    // solo con la firma. Sin esto, sacar a alguien no surtiría efecto hasta
    // ocho horas después, que es justo cuando no sirve de nada.
    const { accounts, deps, cookie } = await conSesion();
    await accounts.deleteAccount('ana');
    assert.equal((await handleAuthRequest(get(SESSION_PATH, { cookie }), deps)).status, 401);
  });
});

describe('encabezados y ruteo', () => {
  test('ninguna respuesta de auth se puede cachear', async () => {
    const { deps } = await seeded();
    const respuestas = [
      await handleAuthRequest(post(LOGIN_PATH, { username: 'ana', password: PASS }), deps),
      await handleAuthRequest(post(LOGIN_PATH, { username: 'ana', password: 'mala' }), deps),
      await handleAuthRequest(post(LOGOUT_PATH, {}), deps),
      await handleAuthRequest(get(SESSION_PATH), deps),
    ];
    for (const res of respuestas) {
      assert.equal(res.headers.get('cache-control'), 'no-store', `status ${res.status} sin no-store`);
    }
  });

  test('una ruta que no existe da 404', async () => {
    const { deps } = await seeded();
    assert.equal((await handleAuthRequest(post('/api/auth/otra', {}), deps)).status, 404);
  });
});

describe('readSession / requireCoordinator', () => {
  async function conSesion() {
    const { accounts, signer, deps } = await seeded();
    const login = await handleAuthRequest(post(LOGIN_PATH, { username: 'ana', password: PASS }), deps);
    return { accounts, signer, deps, cookie: cookieDe(login) };
  }

  test('readSession devuelve las claims sin tocar el almacén', async () => {
    const { signer, cookie } = await conSesion();
    assert.equal(readSession(get('/x', { cookie }), signer, NOW).sub, 'ana');
    assert.equal(readSession(get('/x'), signer, NOW), null);
  });

  test('requireCoordinator entrega la cuenta cuando la sesión es buena', async () => {
    const { deps, cookie } = await conSesion();
    const res = await requireCoordinator(get('/x', { cookie }), deps);
    assert.equal(res.ok, true);
    assert.equal(res.account.username, 'ana');
    assert.equal(res.account.displayName, 'Ana Ruiz');
    assert.equal(res.account.passwordHash, undefined);
  });

  test('requireCoordinator devuelve un 401 listo para responder cuando no', async () => {
    const { deps } = await seeded();
    const res = await requireCoordinator(get('/x'), deps);
    assert.equal(res.ok, false);
    assert.equal(res.response.status, 401);
    assert.equal(res.response.headers.get('cache-control'), 'no-store');
  });

  test('requireCoordinator rechaza la sesión de una cuenta borrada', async () => {
    const { accounts, deps, cookie } = await conSesion();
    await accounts.deleteAccount('ana');
    assert.equal((await requireCoordinator(get('/x', { cookie }), deps)).ok, false);
  });
});
