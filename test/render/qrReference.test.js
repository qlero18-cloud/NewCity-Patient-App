// Etapa E — el generador de QR contra una implementación de referencia.
//
// El encabezado de src/render/qr.js cuenta que la fase 06 se verificó
// comparando módulo a módulo contra nayuki/QR-Code-generator y decodificando
// con OpenCV, y que ahí salieron cuatro bugs reales que las pruebas de
// redondeo propias NUNCA habrían visto: encoder y decoder comparten código,
// así que un malentendido presente en los dos se disfraza de éxito.
//
// Pero esa verificación fue de una sola vez, a mano, fuera del repositorio.
// Nada la volvía a correr, y la Etapa E toca justo la parte más delicada del
// archivo: pasar de un bloque a DOS bloques entrelazados. Un error de
// entrelazado produce un símbolo que se ve perfecto, que mi propio
// decodificador lee sin quejarse —porque de-entrelaza igual de mal— y que
// ningún teléfono puede leer.
//
// Así que la comparación se congela aquí. `qrReference.fixture.js` está
// GENERADO por la referencia, no escrito a mano, y este archivo solo compara.
// Si alguien toca el trazado, el entrelazado, la elección de máscara o las
// tablas de la versión, esto se cae en la misma corrida.
//
// Lo que sigue SIN cubrir: que un lector físico lea el símbolo desde la
// pantalla de un teléfono. Eso no lo prueba node:test y sigue pendiente.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateQrMatrix, decodeQrMatrix, versionForBytes, QR_VERSIONS } from '../../src/render/qr.js';
import { REFERENCIAS } from './qrReference.fixture.js';

describe('generateQrMatrix — módulo a módulo contra nayuki/QR-Code-generator', () => {
  for (const ref of REFERENCIAS) {
    test(`${ref.nombre} (${ref.bytes} bytes, v${ref.version}, máscara ${ref.mask})`, () => {
      const matriz = generateQrMatrix(ref.texto);

      assert.strictEqual(matriz.size, ref.size, 'el tamaño no coincide: se eligió otra versión');
      assert.strictEqual(
        matriz.maskPattern,
        ref.mask,
        'la máscara elegida no coincide: la puntuación de penalización difiere de la referencia',
      );

      // La primera diferencia, con coordenadas: un `deepStrictEqual` sobre
      // 1089 booleanos imprime una pared ilegible y no dice dónde.
      for (let r = 0; r < ref.size; r++) {
        for (let c = 0; c < ref.size; c++) {
          const esperado = ref.modules[r][c] === '1';
          assert.strictEqual(
            matriz.modules[r][c],
            esperado,
            `módulo (${r},${c}): se generó ${matriz.modules[r][c] ? 'oscuro' : 'claro'} y la referencia dice ${esperado ? 'oscuro' : 'claro'}`,
          );
        }
      }
    });
  }
});

describe('versionForBytes — la versión más chica que quepa, no siempre la más grande', () => {
  // El QPASS de la fase 06 sigue pendiente de una prueba con lectora
  // física. Subirlo a v4 en silencio cambiaría justo el símbolo que el
  // cliente está por probar e invalidaría la verificación ya hecha, así que
  // los payloads que cabían en v3 siguen saliendo en v3, idénticos.
  test('hasta 42 bytes es versión 3, como en la fase 06', () => {
    assert.strictEqual(versionForBytes(0), 3);
    assert.strictEqual(versionForBytes(42), 3);
  });

  test('de 43 bytes en adelante sube a versión 4', () => {
    assert.strictEqual(versionForBytes(43), 4);
    assert.strictEqual(versionForBytes(62), 4);
  });

  test('más de 62 bytes no cabe en ninguna de las dos, y se dice con el número', () => {
    assert.throws(() => versionForBytes(63), /63/);
  });

  test('un enlace de visita real cae en v4 y le sobra poco: el margen queda a la vista', () => {
    const enlace = 'https://nchpatient.netlify.app/v/AbCdEfGhIjKlMnOpQrStUv';
    assert.strictEqual(enlace.length, 55);
    assert.strictEqual(versionForBytes(enlace.length), 4);
    assert.ok(
      QR_VERSIONS[4].maxBytes - enlace.length < 10,
      'quedan más de 10 bytes de margen: revisa si el dominio creció y ya no cabe',
    );
  });
});

describe('decodeQrMatrix — de-entrelaza lo que el generador entrelazó', () => {
  // El de-entrelazado es la parte que un test de redondeo propio no puede
  // probar sola: si generar y leer se equivocan igual, el redondeo pasa. Por
  // eso se decodifica la matriz de la REFERENCIA, no la propia.
  for (const ref of REFERENCIAS) {
    test(`la matriz de nayuki para "${ref.texto.slice(0, 24)}…" se lee y da el texto original`, () => {
      const matriz = {
        size: ref.size,
        modules: ref.modules.map((fila) => [...fila].map((ch) => ch === '1')),
      };
      assert.strictEqual(decodeQrMatrix(matriz), ref.texto);
    });
  }
});
