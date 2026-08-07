// Etapa C — hasheo de contraseñas. Se escribe antes que
// src/server/passwords.js (rojo esperado).
//
// Casi todas las pruebas inyectan `iterations: 1`. No es hacer trampa: lo
// que se prueba aquí es el FORMATO y la lógica de verificación, y esos no
// cambian con el número de vueltas. Correr las ~15 pruebas a 600 000
// iteraciones sumaría varios segundos a cada `npm test` sin comprobar nada
// que no compruebe una vuelta.
//
// Lo que sí necesita el parámetro real tiene su propia prueba marcada abajo,
// porque es la única que responde "¿el default que decimos usar de verdad
// funciona de punta a punta?".

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  verifyPassword,
  validatePassword,
  DEFAULT_ITERATIONS,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from '../../src/server/passwords.js';

const PASS = 'coordinacion-torre-27';
const FAST = { iterations: 1 };

describe('hashPassword — formato del registro', () => {
  test('devuelve las cuatro partes del formato tipo PHC', async () => {
    const stored = await hashPassword(PASS, FAST);
    const parts = stored.split('$');
    assert.equal(parts.length, 4, `se esperaban 4 campos separados por $, llegó: ${stored}`);
    assert.equal(parts[0], 'pbkdf2-sha256');
  });

  test('graba el número de iteraciones usado, no el default', async () => {
    const stored = await hashPassword(PASS, { iterations: 7 });
    assert.equal(stored.split('$')[1], '7');
  });

  test('la sal y la llave van en base64url, sin relleno', async () => {
    const [, , salt, key] = (await hashPassword(PASS, FAST)).split('$');
    assert.match(salt, /^[A-Za-z0-9_-]+$/, `sal fuera del alfabeto base64url: ${salt}`);
    assert.match(key, /^[A-Za-z0-9_-]+$/, `llave fuera del alfabeto base64url: ${key}`);
  });

  test('dos hasheos de la MISMA contraseña salen distintos — la sal es aleatoria', async () => {
    const a = await hashPassword(PASS, FAST);
    const b = await hashPassword(PASS, FAST);
    assert.notEqual(a, b);
    // Y la diferencia está en la sal, no solo en la llave.
    assert.notEqual(a.split('$')[2], b.split('$')[2]);
  });

  test('el default declarado cumple la recomendación de OWASP para PBKDF2-SHA256', () => {
    assert.ok(
      DEFAULT_ITERATIONS >= 600_000,
      `DEFAULT_ITERATIONS = ${DEFAULT_ITERATIONS}: bajarlo de 600 000 abarata el ataque por diccionario contra el hash robado`,
    );
  });
});

describe('verifyPassword', () => {
  test('acepta la contraseña correcta', async () => {
    const stored = await hashPassword(PASS, FAST);
    assert.equal(await verifyPassword(PASS, stored), true);
  });

  test('rechaza una contraseña equivocada', async () => {
    const stored = await hashPassword(PASS, FAST);
    assert.equal(await verifyPassword('coordinacion-torre-28', stored), false);
  });

  test('rechaza si le cambian un carácter a la llave guardada', async () => {
    const stored = await hashPassword(PASS, FAST);
    const [algo, iter, salt, key] = stored.split('$');
    const tocado = key[0] === 'A' ? `B${key.slice(1)}` : `A${key.slice(1)}`;
    assert.equal(await verifyPassword(PASS, [algo, iter, salt, tocado].join('$')), false);
  });

  test('rechaza si le cambian la sal', async () => {
    const stored = await hashPassword(PASS, FAST);
    const [algo, iter, salt, key] = stored.split('$');
    const tocada = salt[0] === 'A' ? `B${salt.slice(1)}` : `A${salt.slice(1)}`;
    assert.equal(await verifyPassword(PASS, [algo, iter, tocada, key].join('$')), false);
  });

  test('lee las iteraciones del registro, no del default', async () => {
    // Si verifyPassword usara DEFAULT_ITERATIONS en vez del número guardado,
    // este hasheo de 3 vueltas no volvería a coincidir nunca — y subir el
    // default algún día dejaría fuera a todas las cuentas ya existentes.
    const stored = await hashPassword(PASS, { iterations: 3 });
    assert.equal(await verifyPassword(PASS, stored), true);
  });

  test('rechaza un algoritmo que no reconoce, en vez de intentar adivinar', async () => {
    // Un registro editado a mano a "md5$1$..." no debe abrir la puerta.
    const [, iter, salt, key] = (await hashPassword(PASS, FAST)).split('$');
    assert.equal(await verifyPassword(PASS, ['md5', iter, salt, key].join('$')), false);
  });

  test('rechaza iteraciones no numéricas o absurdas sin lanzar', async () => {
    const [algo, , salt, key] = (await hashPassword(PASS, FAST)).split('$');
    for (const iter of ['0', '-1', 'muchas', '', '1e9999']) {
      assert.equal(
        await verifyPassword(PASS, [algo, iter, salt, key].join('$')),
        false,
        `iteraciones "${iter}" deberían rechazarse`,
      );
    }
  });

  test('devuelve false —no lanza— con basura en el registro', async () => {
    for (const basura of ['', 'abc', 'a$b$c', 'a$b$c$d$e', null, undefined, 42, {}]) {
      assert.equal(
        await verifyPassword(PASS, basura),
        false,
        `registro ${JSON.stringify(basura)} debería dar false`,
      );
    }
  });

  test('devuelve false —no lanza— si la contraseña no es texto', async () => {
    const stored = await hashPassword(PASS, FAST);
    for (const basura of [null, undefined, 42, {}, []]) {
      assert.equal(await verifyPassword(basura, stored), false);
    }
  });
});

describe('validatePassword', () => {
  test('acepta una frase larga sin mayúsculas, números ni símbolos', () => {
    // NIST SP 800-63B retiró las reglas de composición: obligan a
    // "Contraseña1!" y prohíben frases largas, que son más difíciles de
    // adivinar. Aquí solo importa el largo.
    assert.deepEqual(validatePassword('caballo correcto grapa'), { ok: true, errors: {} });
  });

  test('rechaza por debajo del mínimo y acepta justo en el mínimo', () => {
    const corta = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    const justa = 'a'.repeat(MIN_PASSWORD_LENGTH);
    assert.equal(validatePassword(corta).ok, false);
    assert.equal(validatePassword(corta).errors.password, 'tooShort');
    assert.equal(validatePassword(justa).ok, true);
  });

  test('rechaza arriba del máximo', () => {
    // El tope no es capricho: PBKDF2 usa la contraseña como llave del HMAC,
    // así que un campo sin límite es trabajo de CPU gratis para quien mande
    // diez megabytes al endpoint de login.
    assert.equal(validatePassword('a'.repeat(MAX_PASSWORD_LENGTH)).ok, true);
    assert.equal(validatePassword('a'.repeat(MAX_PASSWORD_LENGTH + 1)).errors.password, 'tooLong');
  });

  test('rechaza lo que no es texto', () => {
    for (const basura of [null, undefined, 42, {}, []]) {
      assert.equal(validatePassword(basura).ok, false);
    }
  });
});

describe('parámetros reales (lento a propósito)', () => {
  test('con DEFAULT_ITERATIONS el ciclo completo funciona', async () => {
    // La única prueba que corre con los parámetros de producción. Sin ella,
    // todo lo de arriba podría estar verde con un default roto —por ejemplo
    // uno que desborde el largo máximo de llave de PBKDF2— y nadie se
    // enteraría hasta el primer login real.
    const stored = await hashPassword(PASS);
    assert.equal(stored.split('$')[1], String(DEFAULT_ITERATIONS));
    assert.equal(await verifyPassword(PASS, stored), true);
    assert.equal(await verifyPassword(`${PASS} `, stored), false);
  });
});
