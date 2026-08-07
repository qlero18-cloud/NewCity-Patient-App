// Etapa C — sesión de coordinadora: cookie firmada con HMAC. Se escribe
// antes que src/server/sessions.js (rojo esperado).
//
// La cookie está FIRMADA, no cifrada: cualquiera puede leer quién es, nadie
// puede cambiarlo sin la llave. Hay una prueba abajo que fija eso a
// propósito, para que a nadie se le ocurra guardar ahí algo que deba
// quedarse del lado del servidor.
//
// `now` se inyecta en firmar y en verificar, con la misma disciplina que
// todo el dominio (INV-1): sin eso, probar la caducidad exigiría esperar de
// verdad a que la sesión venza.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSessionSigner,
  serializeSessionCookie,
  clearedSessionCookie,
  readSessionCookie,
  SESSION_COOKIE,
  DEFAULT_TTL_MS,
  MIN_SECRET_LENGTH,
} from '../../src/server/sessions.js';

const SECRET = 'x'.repeat(MIN_SECRET_LENGTH);
const OTRO_SECRET = 'y'.repeat(MIN_SECRET_LENGTH);
const NOW = Date.parse('2026-03-10T10:00:00Z');

describe('createSessionSigner — la llave es obligatoria', () => {
  test('lanza si no hay secreto', () => {
    assert.throws(() => createSessionSigner(undefined), /SESSION_SECRET/);
    assert.throws(() => createSessionSigner(''), /SESSION_SECRET/);
  });

  test('lanza si el secreto es más corto que el mínimo', () => {
    // Fallar fuerte es la decisión: un default silencioso ("dev-secret")
    // significa que la misma llave firma en todos lados y cualquiera que
    // conozca el repo se fabrica una sesión de coordinadora.
    assert.throws(() => createSessionSigner('x'.repeat(MIN_SECRET_LENGTH - 1)), /SESSION_SECRET/);
  });

  test('lanza si el secreto no es texto', () => {
    assert.throws(() => createSessionSigner(42), /SESSION_SECRET/);
    assert.throws(() => createSessionSigner(null), /SESSION_SECRET/);
  });
});

describe('sign / verify', () => {
  test('ida y vuelta: recupera de quién es la sesión', () => {
    const { sign, verify } = createSessionSigner(SECRET);
    const claims = verify(sign({ sub: 'ana' }, NOW), NOW);
    assert.equal(claims.sub, 'ana');
  });

  test('la caducidad sale de now + TTL', () => {
    const { sign, verify } = createSessionSigner(SECRET);
    assert.equal(verify(sign({ sub: 'ana' }, NOW), NOW).exp, NOW + DEFAULT_TTL_MS);
  });

  test('acepta un TTL propio', () => {
    const { sign, verify } = createSessionSigner(SECRET);
    const value = sign({ sub: 'ana' }, NOW, { ttlMs: 60_000 });
    assert.equal(verify(value, NOW).exp, NOW + 60_000);
  });

  test('vale hasta el último milisegundo y no después', () => {
    const { sign, verify } = createSessionSigner(SECRET);
    const value = sign({ sub: 'ana' }, NOW, { ttlMs: 1000 });
    assert.ok(verify(value, NOW + 999), 'a 999 ms debería seguir viva');
    assert.equal(verify(value, NOW + 1000), null, 'justo en exp ya venció');
    assert.equal(verify(value, NOW + 5_000_000), null);
  });

  test('el TTL por defecto es una jornada, no eterno', () => {
    assert.ok(DEFAULT_TTL_MS <= 12 * 60 * 60 * 1000, 'una sesión de más de 12 h sobrevive al turno de quien la abrió');
  });
});

describe('sign / verify — lo que tiene que rechazar', () => {
  test('rechaza si le tocan el contenido', () => {
    const { sign, verify } = createSessionSigner(SECRET);
    const [payload, sig] = sign({ sub: 'ana' }, NOW).split('.');
    const otro = Buffer.from(JSON.stringify({ sub: 'jefa', exp: NOW + 9e9 })).toString('base64url');
    assert.notEqual(otro, payload);
    assert.equal(verify(`${otro}.${sig}`, NOW), null);
  });

  test('rechaza si le tocan la firma', () => {
    const { sign, verify } = createSessionSigner(SECRET);
    const [payload, sig] = sign({ sub: 'ana' }, NOW).split('.');
    // Se toca el PRIMER carácter de la firma, no el último. Una firma de 32
    // bytes ocupa 43 caracteres base64url y el último solo lleva 4 bits
    // útiles: cambiarle 'A' por 'B' mueve bits de relleno que el
    // decodificador tira, así que los mismos 32 bytes seguirían coincidiendo
    // y la prueba pasaría sin probar nada.
    const tocada = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    assert.notEqual(tocada, sig);
    assert.equal(verify(`${payload}.${tocada}`, NOW), null);
  });

  test('una cookie firmada con OTRA llave no vale — la llave sí se usa', () => {
    const firmada = createSessionSigner(OTRO_SECRET).sign({ sub: 'ana' }, NOW);
    assert.equal(createSessionSigner(SECRET).verify(firmada, NOW), null);
  });

  test('devuelve null —no lanza— con cualquier basura', () => {
    const { verify } = createSessionSigner(SECRET);
    const basura = [
      '',
      'sinpunto',
      'a.b.c',
      '.',
      '$$$.$$$',
      Buffer.from('no soy json').toString('base64url') + '.x',
      Buffer.from('[1,2,3]').toString('base64url') + '.x',
      Buffer.from('null').toString('base64url') + '.x',
      null,
      undefined,
      42,
      {},
    ];
    for (const v of basura) {
      assert.equal(verify(v, NOW), null, `${JSON.stringify(v)} debería dar null`);
    }
  });

  test('rechaza una sesión sin sub — firmada pero sin dueño', () => {
    const { sign, verify } = createSessionSigner(SECRET);
    assert.equal(verify(sign({}, NOW), NOW), null);
    assert.equal(verify(sign({ sub: '' }, NOW), NOW), null);
  });
});

describe('la cookie está firmada, NO cifrada', () => {
  test('el contenido se lee sin la llave', () => {
    // Fijado a propósito: quien agregue un campo aquí tiene que ver esta
    // prueba y entender que lo que meta viaja legible en el navegador.
    const value = createSessionSigner(SECRET).sign({ sub: 'ana' }, NOW);
    const claims = JSON.parse(Buffer.from(value.split('.')[0], 'base64url').toString('utf8'));
    assert.equal(claims.sub, 'ana');
  });

  test('la firma no revela el secreto en claro', () => {
    const value = createSessionSigner(SECRET).sign({ sub: 'ana' }, NOW);
    assert.ok(!value.includes(SECRET));
  });
});

describe('serializeSessionCookie', () => {
  test('trae los cuatro atributos que la protegen', () => {
    const cookie = serializeSessionCookie('valor', { maxAgeSec: 3600 });
    assert.match(cookie, /^nc_session=valor;/);
    // HttpOnly: ningún script la lee, así que un XSS no se lleva la sesión.
    assert.match(cookie, /HttpOnly/);
    // Secure: nunca viaja en claro.
    assert.match(cookie, /Secure/);
    // SameSite=Strict: es TODA la defensa contra CSRF de este panel. Un
    // POST desde otro sitio simplemente no lleva la cookie. Funciona porque
    // coordinator.html es estático y no necesita la sesión para cargar: la
    // pide después, por fetch del mismo origen.
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Path=\/;/);
    assert.match(cookie, /Max-Age=3600/);
  });

  test('el nombre de la cookie es el exportado', () => {
    assert.ok(serializeSessionCookie('v', { maxAgeSec: 1 }).startsWith(`${SESSION_COOKIE}=`));
  });

  test('clearedSessionCookie vacía el valor y expira ya', () => {
    const cookie = clearedSessionCookie();
    assert.match(cookie, /^nc_session=;/);
    assert.match(cookie, /Max-Age=0/);
    assert.match(cookie, /HttpOnly/);
  });
});

describe('readSessionCookie', () => {
  test('la encuentra entre otras cookies', () => {
    assert.equal(readSessionCookie('a=1; nc_session=abc.def; z=9'), 'abc.def');
  });

  test('la encuentra si es la única y si no hay espacios', () => {
    assert.equal(readSessionCookie('nc_session=abc.def'), 'abc.def');
    assert.equal(readSessionCookie('a=1;nc_session=abc.def'), 'abc.def');
  });

  test('devuelve null si no está, o si no hay encabezado', () => {
    assert.equal(readSessionCookie('a=1; b=2'), null);
    assert.equal(readSessionCookie(''), null);
    assert.equal(readSessionCookie(null), null);
    assert.equal(readSessionCookie(undefined), null);
  });

  test('no confunde una cookie cuyo nombre TERMINA igual', () => {
    // Un `endsWith`/`includes` mal hecho aceptaría "evil_nc_session" como si
    // fuera la nuestra.
    assert.equal(readSessionCookie('evil_nc_session=robada'), null);
    assert.equal(readSessionCookie('evil_nc_session=robada; nc_session=buena'), 'buena');
  });

  test('devuelve el valor vacío como null, no como cadena vacía', () => {
    assert.equal(readSessionCookie('nc_session='), null);
  });
});
