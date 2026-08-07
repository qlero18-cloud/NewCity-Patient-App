// Fase 09 (D28) — attachNav(root) es el helper compartido que app.js y
// coordinatorApp.js usan para conectar clic a navegación por hash. Existe
// por D28: dos archivos implementando la misma idea de forma independiente
// (src/ui/app.js con querySelectorAll('[data-nav]') inline, src/ui/
// components/tabs.js emitiendo un atributo distinto que nada escuchaba) es
// justo como se coló ese bug — un solo lugar que las dos entradas de la
// app importan no puede volver a divergir en el nombre del atributo.
//
// Este proyecto no trae un DOM falso para node:test (ver la nota en
// test/ui/plaza.test.js) — pero a diferencia de un render*Screen (que solo
// devuelve un string y se prueba por substring), attachNav ES la lógica de
// cableado que D28 probó que puede fallar en silencio, así que aquí sí
// vale la pena un doble mínimo de DOM (mismo criterio ya usado por
// createHighlighter en test/map/ids.test.js: no una librería de DOM
// general, un objeto a mano con solo la forma exacta que este archivo
// necesita) — probar el comportamiento real de clic→hash, no solo que el
// HTML "se ve bien".

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { attachNav } from '../../src/ui/nav.js';

// Doble mínimo de <button data-nav="...">: solo lo que attachNav de verdad
// usa (dataset.nav, addEventListener('click', fn)), nada más.
function fakeNavButton(nav) {
  const listeners = [];
  return {
    dataset: { nav },
    addEventListener(type, fn) {
      if (type === 'click') listeners.push(fn);
    },
    click() {
      listeners.forEach((fn) => fn());
    },
  };
}

function fakeRoot(navValues) {
  const buttons = navValues.map(fakeNavButton);
  return {
    buttons,
    querySelectorAll(selector) {
      return selector === '[data-nav]' ? buttons : [];
    },
  };
}

describe('attachNav(root)', () => {
  beforeEach(() => {
    // Mismo criterio que el stub de localStorage en test/e2e/patient-
    // journey.mjs: un doble mínimo de global, solo lo que el código de
    // verdad toca (location.hash), no un DOM completo.
    globalThis.location = { hash: '' };
  });

  test('clic en un botón [data-nav="x"] pone location.hash en "#/x"', () => {
    const root = fakeRoot(['plaza']);
    attachNav(root);
    root.buttons[0].click();
    assert.strictEqual(globalThis.location.hash, '#/plaza');
  });

  test('conecta cada botón [data-nav] de root, no solo el primero', () => {
    const root = fakeRoot(['home', 'itinerary', 'map']);
    attachNav(root);
    root.buttons[1].click();
    assert.strictEqual(globalThis.location.hash, '#/itinerary');
    root.buttons[2].click();
    assert.strictEqual(globalThis.location.hash, '#/map');
  });

  test('root sin ningún [data-nav] no lanza excepción', () => {
    const root = fakeRoot([]);
    assert.doesNotThrow(() => attachNav(root));
  });
});
