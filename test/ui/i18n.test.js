// Fase 05 — criterio de aceptación: "una prueba compara las llaves de es y
// en y falla si alguna falta". El barrido es recursivo (no solo de primer
// nivel): una llave anidada olvidada en un idioma debe romper esto igual
// que una de primer nivel.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, SUPPORTED_LANGS, DEFAULT_LANG, resolveInitialLang, translate } from '../../src/ui/i18n.js';

// Recolecta rutas "a.b.c" de todas las hojas de un árbol de cadenas.
// Trata funciones (interpolación, p. ej. greeting: (name) => …) como hoja,
// no como algo a recorrer.
function leafPaths(node, prefix = '') {
  if (typeof node !== 'object' || node === null || typeof node === 'function') {
    return [prefix];
  }
  return Object.keys(node).flatMap((key) => leafPaths(node[key], prefix ? `${prefix}.${key}` : key));
}

describe('Paridad de llaves es/en (criterio de aceptación de la fase 05)', () => {
  test('SUPPORTED_LANGS son exactamente las llaves de primer nivel de STRINGS', () => {
    assert.deepStrictEqual([...Object.keys(STRINGS)].sort(), [...SUPPORTED_LANGS].sort());
  });

  test('es y en tienen exactamente el mismo árbol de llaves, sin sobrar ni faltar ninguna', () => {
    const esPaths = leafPaths(STRINGS.es).sort();
    const enPaths = leafPaths(STRINGS.en).sort();

    const faltanEnEn = esPaths.filter((p) => !enPaths.includes(p));
    const faltanEnEs = enPaths.filter((p) => !esPaths.includes(p));

    assert.deepStrictEqual(faltanEnEn, [], `llaves en "es" que faltan en "en": ${faltanEnEn.join(', ')}`);
    assert.deepStrictEqual(faltanEnEs, [], `llaves en "en" que faltan en "es": ${faltanEnEs.join(', ')}`);
  });

  test('ninguna hoja de texto está vacía en ningún idioma', () => {
    for (const lang of SUPPORTED_LANGS) {
      for (const path of leafPaths(STRINGS[lang])) {
        const value = path.split('.').reduce((node, key) => node[key], STRINGS[lang]);
        if (typeof value === 'function') continue; // las funciones de interpolación se prueban aparte
        assert.strictEqual(typeof value, 'string', `${lang}.${path} no es string`);
        assert.ok(value.length > 0, `${lang}.${path} está vacío`);
      }
    }
  });

  test('las funciones de interpolación (greeting, routeTitle, routeStep) existen y funcionan en ambos idiomas', () => {
    for (const lang of SUPPORTED_LANGS) {
      assert.strictEqual(typeof STRINGS[lang].home.greeting, 'function');
      assert.ok(STRINGS[lang].home.greeting('María').includes('María'));
      assert.strictEqual(typeof STRINGS[lang].map.routeTitle, 'function');
      assert.strictEqual(typeof STRINGS[lang].map.routeStep, 'function');
      assert.ok(STRINGS[lang].map.routeStep(1, 3).includes('1'));
    }
  });
});

describe('resolveInitialLang', () => {
  test('idioma guardado válido gana sobre navigator.language', () => {
    assert.strictEqual(resolveInitialLang('en-US', 'es'), 'es');
  });

  test('sin idioma guardado, navigator.language que empieza en "en" da inglés', () => {
    assert.strictEqual(resolveInitialLang('en-GB', null), 'en');
  });

  test('sin idioma guardado y navigator.language en español (o cualquier otro): español por defecto', () => {
    assert.strictEqual(resolveInitialLang('es-MX', null), 'es');
    assert.strictEqual(resolveInitialLang('fr-FR', null), DEFAULT_LANG);
  });

  test('sin ningún dato: español por defecto, no lanza excepción', () => {
    assert.strictEqual(resolveInitialLang(undefined, undefined), DEFAULT_LANG);
  });

  test('idioma guardado con un valor no soportado se ignora, no se usa tal cual', () => {
    assert.strictEqual(resolveInitialLang('en-US', 'fr'), 'en');
  });
});

describe('translate (acceso por ruta de puntos)', () => {
  test('devuelve el valor de hoja para una ruta válida', () => {
    assert.strictEqual(translate('es', 'tabs.home'), 'Inicio');
    assert.strictEqual(translate('en', 'tabs.home'), 'Home');
  });

  test('ruta inexistente lanza en vez de devolver undefined en silencio', () => {
    assert.throws(() => translate('es', 'tabs.no_existe'));
    assert.throws(() => translate('es', 'no.existe.tampoco'));
  });

  test('lang no soportado cae a DEFAULT_LANG en vez de lanzar', () => {
    assert.strictEqual(translate('fr', 'tabs.home'), STRINGS[DEFAULT_LANG].tabs.home);
  });
});
