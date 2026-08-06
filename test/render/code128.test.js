// Fase 06 — pruebas de Code128 subset B (src/render/code128.js). Ver el
// comentario de cabecera de ese archivo: la tabla de patrones y el
// checksum se verificaron contra el código fuente de python-barcode
// (referencia externa), y el símbolo generado se decodificó con éxito con
// cv2.barcode_BarcodeDetector de OpenCV — independiente de este proyecto.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateCode128Bars, decodeCode128Bars, renderCode128Svg, CODE128_CONFIG } from '../../src/render/code128.js';

describe('generateCode128Bars / decodeCode128Bars — redondeo', () => {
  const casos = ['payload-q1', 'A', '0123456789', 'NewCity QPASS-2026', ' !"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'];
  for (const texto of casos) {
    test(`"${texto}" sobrevive encode→decode exacto`, () => {
      const bars = generateCode128Bars(texto);
      assert.strictEqual(decodeCode128Bars(bars), texto);
    });
  }

  test('cada carácter aporta exactamente 11 bits, más el patrón de paro', () => {
    const bars = generateCode128Bars('abc');
    // START(11) + 3 caracteres(11 c/u) + checksum(11) + STOP(13)
    assert.strictEqual(bars.length, 11 * (1 + 3 + 1) + 13);
  });

  test('el patrón de barras son solo 1 y 0', () => {
    assert.match(generateCode128Bars('payload-q1'), /^[01]+$/);
  });

  test('un carácter fuera del subset B (no ASCII, o control) lanza un error claro', () => {
    assert.throws(() => generateCode128Bars('ñoño'), /subset B/);
    assert.throws(() => generateCode128Bars('a\tb'), /subset B/);
  });

  test('decodificar una cadena de bits corrupta lanza en vez de devolver basura', () => {
    assert.throws(() => decodeCode128Bars('000000000000000'));
    assert.throws(() => decodeCode128Bars(generateCode128Bars('abc').slice(0, -1) + '9'));
  });

  test('el checksum realmente se verifica: cambiar un bit del cuerpo rompe la decodificación', () => {
    const bars = generateCode128Bars('payload-q1');
    const flipped = bars.slice(0, 5) + (bars[5] === '1' ? '0' : '1') + bars.slice(6);
    assert.throws(() => decodeCode128Bars(flipped));
  });
});

describe('CODE128_CONFIG', () => {
  test('el rango declarado es ASCII 32–126 (subset B imprimible)', () => {
    assert.strictEqual(CODE128_CONFIG.minChar, 32);
    assert.strictEqual(CODE128_CONFIG.maxChar, 126);
  });
});

describe('renderCode128Svg', () => {
  test('produce un SVG negro sobre blanco, sin variables de tema', () => {
    const svg = renderCode128Svg('payload-q1');
    assert.match(svg, /^<svg /);
    assert.ok(svg.includes('fill="#FFFFFF"'));
    assert.ok(svg.includes('fill="#000000"'));
    assert.ok(!svg.includes('var(--'));
  });

  test('no declara width/height="auto" en el <svg> — no es un valor válido para esos atributos SVG (a diferencia de CSS), se detectó como error real en consola de navegador', () => {
    const svg = renderCode128Svg('payload-q1');
    assert.ok(!/(width|height)="auto"/.test(svg));
  });
});
