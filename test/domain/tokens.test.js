// Etapa B — token de visita, PRD §6.1: "un token aleatorio de 128 bits",
// §7: "token  string  128 bits, base64url".
//
// Se escribe antes que src/domain/tokens.js: debe fallar ahora porque el
// módulo no existe (rojo esperado), no por un error de sintaxis.
//
// Hasta hoy el panel acuñaba `demo-token-${id}` (coordinatorStore.js) —
// adivinable de memoria, que es exactamente lo que D02 rechazó cuando
// descartó "QR general + apellido y fecha de nacimiento" por ser adivinable.
// Un token de demo era aceptable mientras nada persistía; deja de serlo en
// cuanto el token abre datos de salud reales por red.
//
// La aleatoriedad se inyecta, igual que `now` se inyecta en todo el dominio
// (INV-1): sin eso no hay forma de probar el codificado de verdad, solo de
// mirar 22 caracteres al azar y confiar.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { newToken, isValidToken, TOKEN_BYTES, TOKEN_LENGTH } from '../../src/domain/tokens.js';

// Generador determinista: bytes 0,1,2,...  No es aleatorio a propósito —
// sirve para fijar el codificado, no la entropía.
function counterBytes(n) {
  return Uint8Array.from({ length: n }, (_, i) => i);
}

function fixedBytes(value) {
  return (n) => new Uint8Array(n).fill(value);
}

describe('constantes del token (PRD §6.1)', () => {
  test('son 16 bytes = 128 bits', () => {
    assert.equal(TOKEN_BYTES, 16);
    assert.equal(TOKEN_BYTES * 8, 128);
  });

  test('22 caracteres: lo que miden 16 bytes en base64url sin relleno', () => {
    // ceil(16/3)*4 = 24 con relleno; se le quitan los dos '=' finales.
    assert.equal(TOKEN_LENGTH, 22);
  });
});

describe('newToken', () => {
  test('mide TOKEN_LENGTH caracteres', () => {
    assert.equal(newToken(counterBytes).length, TOKEN_LENGTH);
  });

  test('pide exactamente TOKEN_BYTES bytes al generador', () => {
    let asked = null;
    newToken((n) => {
      asked = n;
      return new Uint8Array(n);
    });
    assert.equal(asked, TOKEN_BYTES);
  });

  test('codifica en base64url: nada de +, / ni relleno =', () => {
    // 0xFB 0xFF... produce '+' y '/' en base64 estándar; aquí no deben salir.
    const token = newToken(fixedBytes(0xfb));
    assert.doesNotMatch(token, /[+/=]/, `base64 estándar filtrado: ${token}`);
    assert.match(token, /^[A-Za-z0-9_-]+$/);
  });

  test('el codificado es el de base64url, byte a byte (vector fijo)', () => {
    // Los bytes 0..15 en base64url. Comprobado contra el propio Node:
    // Buffer.from([0..15]).toString('base64url')
    const expected = Buffer.from(Array.from({ length: 16 }, (_, i) => i)).toString('base64url');
    assert.equal(newToken(counterBytes), expected);
    assert.equal(expected.length, TOKEN_LENGTH);
  });

  test('dos bytes distintos dan tokens distintos (no ignora su entrada)', () => {
    assert.notEqual(newToken(fixedBytes(0)), newToken(fixedBytes(1)));
  });

  test('sin argumento usa el azar real y no repite en 1000 tiradas', () => {
    const seen = new Set();
    for (let i = 0; i < 1000; i++) seen.add(newToken());
    assert.equal(seen.size, 1000, 'colisión en 1000 tiradas: el generador no es aleatorio');
  });

  test('el azar real produce los 22 caracteres y ninguno fuera del alfabeto', () => {
    for (let i = 0; i < 200; i++) {
      const token = newToken();
      assert.equal(token.length, TOKEN_LENGTH, `token corto: ${token}`);
      assert.ok(isValidToken(token), `token fuera de formato: ${token}`);
    }
  });
});

describe('isValidToken', () => {
  test('acepta lo que produce newToken', () => {
    assert.ok(isValidToken(newToken(counterBytes)));
  });

  test('rechaza los tokens de demo que acuñaba el panel hasta hoy', () => {
    assert.equal(isValidToken('demo-token-v_1'), false);
    assert.equal(isValidToken('fixture-token-v-demo1'), false);
  });

  test('rechaza por longitud, aunque el alfabeto sea correcto', () => {
    assert.equal(isValidToken('a'.repeat(TOKEN_LENGTH - 1)), false);
    assert.equal(isValidToken('a'.repeat(TOKEN_LENGTH + 1)), false);
    assert.equal(isValidToken(''), false);
  });

  test('rechaza caracteres fuera de base64url', () => {
    for (const bad of ['+', '/', '=', '.', ' ', '%', '\n', 'ñ']) {
      const token = 'a'.repeat(TOKEN_LENGTH - 1) + bad;
      assert.equal(isValidToken(token), false, `aceptó un token con ${JSON.stringify(bad)}`);
    }
  });

  test('rechaza cualquier cosa que no sea string, sin lanzar', () => {
    // Esto lo va a llamar una Function con lo que traiga la query string:
    // reventar ahí sería un 500 donde corresponde un 404.
    for (const bad of [null, undefined, 42, {}, [], true, Symbol('x')]) {
      assert.equal(isValidToken(bad), false, `aceptó ${String(bad)}`);
    }
  });

  test('no se deja engañar por saltos de línea (el ancla debe ser estricta)', () => {
    // /^...$/ sin la bandera m deja pasar un \n final en JavaScript.
    const valid = newToken(counterBytes);
    assert.equal(isValidToken(`${valid}\n`), false);
    assert.equal(isValidToken(`\n${valid}`), false);
  });
});
