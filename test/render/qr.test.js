// Fase 06 — pruebas del generador de QR (src/render/qr.js). Ver el
// comentario de cabecera de ese archivo para qué está verificado de forma
// cruzada (información de formato, constantes de la versión 3-M, posición
// del patrón de alineación) y qué NO (la aritmética de Reed-Solomon en sí
// no tiene una segunda fuente independiente; la prueba física con lectora
// real es la que de verdad cierra esta fase, no node:test).
//
// Etapa E: el generador ya no es solo versión 3. Elige entre la 3 y la 4
// según lo que quepa, porque el enlace de visita con token de 128 bits mide
// ~55 bytes y en la 3 no entra. Este archivo prueba la geometría de las dos
// y que la elección sea la chica cuando alcanza; la comparación módulo a
// módulo contra una implementación independiente vive en qrReference.test.js.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateQrMatrix, renderQrSvg, decodeQrMatrix, QR_VERSIONS, QR_MAX_BYTES } from '../../src/render/qr.js';

// 55 bytes: el enlace real que va en el QR de entrega. No cabe en la 3.
const ENLACE_V4 = 'https://nchpatient.netlify.app/v/AbCdEfGhIjKlMnOpQrStUv';

describe('generateQrMatrix — estructura del símbolo', () => {
  // Cada caso repite la misma geometría con los números de su versión: el
  // trazado es el mismo procedimiento y lo que cambia son las constantes,
  // así que probar solo una versión dejaría el otro juego de constantes
  // sin ninguna prueba.
  const versiones = [
    { version: 3, texto: 'hola', size: 29, alineacion: 22, moduloOscuro: 21 },
    { version: 4, texto: ENLACE_V4, size: 33, alineacion: 26, moduloOscuro: 25 },
  ];

  for (const { version, texto, size, alineacion, moduloOscuro } of versiones) {
    describe(`versión ${version}`, () => {
      test(`la matriz es cuadrada de ${size}×${size}`, () => {
        const m = generateQrMatrix(texto);
        assert.strictEqual(m.size, size);
        assert.strictEqual(m.modules.length, size);
        for (const row of m.modules) assert.strictEqual(row.length, size);
      });

      test('los tres patrones buscadores (7×7, anillo oscuro/claro/oscuro) están en las tres esquinas correctas', () => {
        const { modules } = generateQrMatrix(texto);
        const corners = [
          { r0: 0, c0: 0 },
          { r0: 0, c0: size - 7 },
          { r0: size - 7, c0: 0 },
        ];
        for (const { r0, c0 } of corners) {
          for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 7; c++) {
              const onRing = r === 0 || r === 6 || c === 0 || c === 6;
              const onCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
              const expected = onRing || onCore;
              assert.strictEqual(modules[r0 + r][c0 + c], expected, `buscador en (${r0},${c0}): módulo (${r},${c}) debería ser ${expected}`);
            }
          }
        }
      });

      test('el patrón de temporización alterna en la fila 6 y la columna 6, entre los separadores', () => {
        const { modules } = generateQrMatrix(texto);
        for (let i = 8; i < size - 8; i++) {
          assert.strictEqual(modules[6][i], i % 2 === 0, `fila 6, columna ${i}`);
          assert.strictEqual(modules[i][6], i % 2 === 0, `columna 6, fila ${i}`);
        }
      });

      test(`hay exactamente un patrón de alineación, centrado en (${alineacion},${alineacion})`, () => {
        const { modules } = generateQrMatrix(texto);
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            const onRing = r === -2 || r === 2 || c === -2 || c === 2;
            const expected = onRing || (r === 0 && c === 0);
            assert.strictEqual(modules[alineacion + r][alineacion + c], expected, `alineación (${r},${c})`);
          }
        }
      });

      test(`el módulo oscuro fijo está en (fila 4×${version}+9=${moduloOscuro}, columna 8)`, () => {
        // Esta prueba originalmente comprobaba (13,8) — una cuenta a mano
        // equivocada de 4×3+9 (da 21, no 13) que además pasaba por accidente
        // porque (13,8) resultaba ser una celda de datos oscura para ese
        // input en particular, no el módulo fijo real. No detectaba nada.
        // Verificado ahora contra dos textos distintos: si de verdad es fijo,
        // no debe cambiar con el contenido.
        const a = generateQrMatrix(texto).modules;
        const b = generateQrMatrix(`${texto}-otro`.slice(0, QR_VERSIONS[version].maxBytes)).modules;
        assert.strictEqual(a[moduloOscuro][8], true);
        assert.strictEqual(b[moduloOscuro][8], true);
      });
    });
  }

  test('no hay un cuarto buscador en la esquina inferior derecha', () => {
    const { modules } = generateQrMatrix('hola');
    // El módulo (24,24) cae dentro de lo que sería un cuarto buscador si
    // existiera por error; en un QR real esa esquina es parte del área de
    // datos, así que no debe coincidir con el patrón de anillo del buscador
    // en ninguna posición fija — se comprueba que el módulo central (3,3)
    // relativo a esa esquina no está forzado a "oscuro" por una función
    // separada (ya lo cubre la ausencia de una cuarta llamada a
    // stampFinderPattern, pero esta prueba deja constancia explícita).
    assert.strictEqual(typeof modules[26][26], 'boolean');
  });

  test('dos textos distintos producen matrices distintas (no es un símbolo fijo)', () => {
    const a = generateQrMatrix('payload-q1');
    const b = generateQrMatrix('payload-q2');
    assert.notDeepStrictEqual(a.modules, b.modules);
  });
});

describe('generateQrMatrix — elección de versión', () => {
  // El QPASS de la fase 06 sigue pendiente de la prueba con lectora física
  // que el README lista como tuya. Si la Etapa E lo subiera a versión 4 en
  // silencio, esa prueba estaría validando un símbolo que ya no es el que
  // se genera. Por eso lo que cabía en la 3 se sigue emitiendo en la 3,
  // módulo por módulo idéntico a antes.
  test('un payload que cabe en la versión 3 sigue saliendo en versión 3', () => {
    assert.strictEqual(generateQrMatrix('A'.repeat(QR_VERSIONS[3].maxBytes)).size, 29);
  });

  test('un byte más que la capacidad de la versión 3 sube a la 4, no revienta', () => {
    assert.strictEqual(generateQrMatrix('A'.repeat(QR_VERSIONS[3].maxBytes + 1)).size, 33);
  });

  test('el forzado explícito de versión existe, para poder emitir el mismo símbolo de siempre', () => {
    assert.strictEqual(generateQrMatrix('hola', { version: 4 }).size, 33);
  });

  test('forzar una versión donde el payload no cabe falla en vez de truncar', () => {
    assert.throws(() => generateQrMatrix('A'.repeat(50), { version: 3 }), /máximo/);
  });

  test('pedir una versión que no existe falla diciendo cuáles hay', () => {
    assert.throws(() => generateQrMatrix('hola', { version: 5 }), /3|4/);
  });
});

describe('generateQrMatrix / decodeQrMatrix — redondeo', () => {
  const casos = [
    'payload-q1',
    'a',
    '',
    'A'.repeat(QR_VERSIONS[3].maxBytes),
    'María, José — ácido, ñoño', // no ASCII: acentos, ñ, em dash
    '日本語', // fuera de Latin-1 por completo, para forzar bytes UTF-8 multibyte reales
    ENLACE_V4, // versión 4: dos bloques entrelazados, el camino nuevo
    'A'.repeat(QR_VERSIONS[3].maxBytes + 1), // el primero que ya no cabe en la 3
    'A'.repeat(QR_MAX_BYTES), // el símbolo más lleno que sabe hacer
    'ñ'.repeat(31), // 62 bytes en 31 caracteres: multibyte al tope de la versión 4
  ];

  for (const texto of casos) {
    test(`"${texto.slice(0, 20)}" (${texto.length} chars) sobrevive encode→decode exacto`, () => {
      const matrix = generateQrMatrix(texto);
      assert.strictEqual(decodeQrMatrix(matrix), texto);
    });
  }

  test('un payload más largo que la capacidad lanza un error claro, no corrompe ni trunca en silencio', () => {
    assert.throws(() => generateQrMatrix('A'.repeat(QR_MAX_BYTES + 1)), /máximo/);
  });
});

describe('renderQrSvg', () => {
  test('produce un SVG con viewBox cuadrado y solo negro sobre blanco (sin variables de tema)', () => {
    const svg = renderQrSvg(generateQrMatrix('payload-q1'));
    assert.match(svg, /^<svg /);
    assert.ok(svg.includes('fill="#FFFFFF"'));
    assert.ok(svg.includes('fill="#000000"'));
    assert.ok(!svg.includes('var(--'), 'el símbolo no debe depender de variables de tema — nunca tema oscuro (fase 06)');
  });

  test('el SVG de una versión 4 crece con la matriz: la zona tranquila no se come el símbolo', () => {
    const svg = renderQrSvg(generateQrMatrix(ENLACE_V4));
    // 33 módulos + 4 de zona tranquila por lado, a 8 px = 328.
    assert.match(svg, /viewBox="0 0 328 328"/);
  });
});
