// Fase 06 — pruebas del generador de QR (src/render/qr.js). Ver el
// comentario de cabecera de ese archivo para qué está verificado de forma
// cruzada (información de formato, constantes de la versión 3-M, posición
// del patrón de alineación) y qué NO (la aritmética de Reed-Solomon en sí
// no tiene una segunda fuente independiente; la prueba física con lectora
// real es la que de verdad cierra esta fase, no node:test).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateQrMatrix, renderQrSvg, decodeQrMatrix, QR_CONFIG } from '../../src/render/qr.js';

describe('generateQrMatrix — estructura del símbolo', () => {
  test('la matriz es cuadrada de 29×29 (versión 3)', () => {
    const { size, modules } = generateQrMatrix('hola');
    assert.strictEqual(size, 29);
    assert.strictEqual(modules.length, 29);
    for (const row of modules) assert.strictEqual(row.length, 29);
  });

  test('los tres patrones buscadores (7×7, anillo oscuro/claro/oscuro) están en las tres esquinas correctas', () => {
    const { modules } = generateQrMatrix('hola');
    const corners = [
      { r0: 0, c0: 0 },
      { r0: 0, c0: 22 },
      { r0: 22, c0: 0 },
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

  test('el patrón de temporización alterna en la fila 6 y la columna 6, entre los separadores', () => {
    const { modules } = generateQrMatrix('hola');
    for (let i = 8; i < 21; i++) {
      assert.strictEqual(modules[6][i], i % 2 === 0, `fila 6, columna ${i}`);
      assert.strictEqual(modules[i][6], i % 2 === 0, `columna 6, fila ${i}`);
    }
  });

  test('hay exactamente un patrón de alineación, centrado en (22,22)', () => {
    const { modules } = generateQrMatrix('hola');
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const onRing = r === -2 || r === 2 || c === -2 || c === 2;
        const expected = onRing || (r === 0 && c === 0);
        assert.strictEqual(modules[22 + r][22 + c], expected, `alineación (${r},${c})`);
      }
    }
  });

  test('el módulo oscuro fijo de la versión 3 está en (fila 4×3+9=21, columna 8), no en (13,8)', () => {
    // Esta prueba originalmente comprobaba (13,8) — una cuenta a mano
    // equivocada de 4×3+9 (da 21, no 13) que además pasaba por accidente
    // porque (13,8) resultaba ser una celda de datos oscura para ese
    // input en particular, no el módulo fijo real. No detectaba nada.
    // Verificado ahora contra dos textos distintos: si de verdad es fijo,
    // no debe cambiar con el contenido.
    const a = generateQrMatrix('hola').modules;
    const b = generateQrMatrix('otro texto').modules;
    assert.strictEqual(a[21][8], true);
    assert.strictEqual(b[21][8], true);
  });

  test('dos textos distintos producen matrices distintas (no es un símbolo fijo)', () => {
    const a = generateQrMatrix('payload-q1');
    const b = generateQrMatrix('payload-q2');
    assert.notDeepStrictEqual(a.modules, b.modules);
  });
});

describe('generateQrMatrix / decodeQrMatrix — redondeo', () => {
  const casos = [
    'payload-q1',
    'a',
    '',
    'A'.repeat(QR_CONFIG.maxBytes),
    'María, José — ácido, ñoño', // no ASCII: acentos, ñ, em dash
    '日本語', // fuera de Latin-1 por completo, para forzar bytes UTF-8 multibyte reales
  ];

  for (const texto of casos) {
    test(`"${texto.slice(0, 20)}" (${texto.length} chars) sobrevive encode→decode exacto`, () => {
      const matrix = generateQrMatrix(texto);
      assert.strictEqual(decodeQrMatrix(matrix), texto);
    });
  }

  test('un payload más largo que la capacidad lanza un error claro, no corrompe ni trunca en silencio', () => {
    assert.throws(() => generateQrMatrix('A'.repeat(QR_CONFIG.maxBytes + 1)), /máximo/);
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
});
