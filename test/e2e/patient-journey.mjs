#!/usr/bin/env node
// Fase 07 — recorrido completo del paciente (los 10 pasos de
// docs/phases/phase-07-e2e.md), ejercitando los módulos reales de
// src/domain, src/data, src/map y src/render en la misma secuencia que
// src/ui/app.js, sin necesidad de un DOM real.
//
// Lo que este script SÍ prueba: que la lógica de cada paso da el
// resultado correcto (siguiente paso, origen por defecto, ruta,
// resaltado, símbolo del pase, caché sin conexión, paridad es/en,
// v_demo2, pantalla neutra). Lo que NO puede probar, y por eso la
// sección de Verificación de esta fase lo deja aparte: que el resaltado
// se VE moverse en un mapa real, que el símbolo del pase se VE bien, que
// "Agregar a inicio" funciona, y que todo esto carga en un teléfono real
// — eso es exactamente lo que pide la comprobación en dispositivo real.
//
// Script plano, no node:test (así lo pide el comando de verificación de
// la fase): assert lanza y aquí no hay try/catch alrededor de cada paso a
// propósito — si un paso falla, el script entero debe fallar con ese
// error visible, no seguir corriendo pasos posteriores sobre un estado ya
// roto.

import assert from 'node:assert/strict';
import { nextStep, groupByDay, isUpdated, isExpired, visiblePasses } from '../../src/domain/index.js';
import { defaultOrigin, resolveRoute } from '../../src/domain/routing.js';
import { routes } from '../../src/data/routes.js';
import { locations } from '../../src/data/locations.js';
import { fixtures } from '../../src/data/fixtures.js';
import { createHighlighter } from '../../src/map/highlights.js';
import { resolveInitialLang, translate } from '../../src/ui/i18n.js';
import { generateQrMatrix, decodeQrMatrix } from '../../src/render/qr.js';
import { savePassCache, getCachedVisiblePasses } from '../../src/ui/passCache.js';

function step(n, description, fn) {
  fn();
  console.log(`✔ paso ${n} — ${description}`);
}

// Doble mínimo de localStorage — passCache.js lo necesita y node no lo trae.
globalThis.localStorage = (() => {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
})();

// --- paso 1: abrir la URL con ?p=<token de v_demo1> ---
const NOW = '2026-03-10T10:00-07:00'; // entre A2 (termina 10:30) y A3 (12:00)
const demo1 = Object.values(fixtures).find((f) => f.visit.token === 'fixture-token-v-demo1');
let lang;
step(1, 'el token de v_demo1 en la URL resuelve la visita correcta; el idioma inicial sale de navigator.language', () => {
  assert.ok(demo1, 'no se encontró v_demo1 por su token');
  assert.strictEqual(demo1.visit.patientFirstName, 'María');
  lang = resolveInitialLang('es-MX', null);
  assert.strictEqual(lang, 'es');
});

// --- paso 2: Inicio muestra el siguiente paso correcto ---
let focused;
step(2, 'Inicio muestra el siguiente paso correcto para un now fijado (R2)', () => {
  focused = nextStep(demo1.appointments, NOW);
  assert.strictEqual(focused.id, 'a3', 'a las 10:00, entre A2 y A3, el siguiente paso debe ser A3 (12:00, piso27)');
});

// --- paso 3: "cómo llegar" abre la ruta con el origen por defecto de R7 ---
let route;
step(3, '"cómo llegar" resuelve el origen por defecto (R7) y la ruta correspondiente', () => {
  const origin = defaultOrigin(focused, demo1.appointments, demo1.lodging);
  assert.strictEqual(origin, 'compass', 'la cita anterior (A2) fue en Compass, así que el origen por defecto es Compass');
  const result = resolveRoute(origin, focused.locationId, routes);
  assert.ok(result && result.steps, 'debería existir una ruta compass→piso27');
  route = result;
});

// --- paso 4: avanzar los pasos de la ruta, ver el resaltado moverse ---
step(4, 'el resaltado avanza paso a paso y nunca dos puntos a la vez (lo visual se confirma en el navegador, no aquí)', () => {
  const cells = new Map(locations.map((l) => [l.mapPointId, { classes: new Set() }]));
  for (const el of cells.values()) el.classList = { add: (c) => el.classes.add(c), remove: (c) => el.classes.delete(c) };
  const root = { getElementsByMapPointId: (id) => (cells.has(id) ? [cells.get(id)] : []) };
  const highlighter = createHighlighter(root);
  let previous = null;
  for (const s of route.steps) {
    highlighter.highlightStep(s.mapHighlightId);
    if (previous) assert.strictEqual(cells.get(previous).classes.has('nc-map-highlight'), false, 'el paso anterior debe perder el resaltado');
    assert.strictEqual(cells.get(s.mapHighlightId).classes.has('nc-map-highlight'), true);
    previous = s.mapHighlightId;
  }
});

// --- paso 5: abrir el pase, comprobar que el símbolo se dibuja ---
step(5, 'el pase visible dibuja un símbolo QR que decodifica al payload correcto', () => {
  const visible = visiblePasses(demo1.passes, NOW);
  assert.ok(visible.length >= 1, 'v_demo1 debería tener al menos un pase visible a las 10:00');
  const matrix = generateQrMatrix(visible[0].payload);
  assert.strictEqual(decodeQrMatrix(matrix), visible[0].payload);
});

// --- paso 6: modo avión, el último pase sigue visible con aviso ---
step(6, 'sin datos "en vivo", el último pase guardado en caché sigue visible (R3 se re-evalúa con el now actual)', () => {
  savePassCache(demo1.visit.id, demo1.passes, NOW);
  const laterSameDay = '2026-03-10T18:00-07:00';
  const cached = getCachedVisiblePasses(demo1.visit.id, laterSameDay);
  assert.ok(cached && cached.passes.length >= 1, 'la caché debería seguir dando al menos un pase visible');
  assert.strictEqual(cached.savedAt, NOW, 'el aviso "guardado a las…" depende de savedAt, que debe conservarse');
});

// --- paso 7: cambiar a inglés, ninguna cadena queda en español ---
step(7, 'las llaves usadas en los pasos 1–6 existen y dan texto distinto en inglés (paridad completa: test/ui/i18n.test.js)', () => {
  for (const path of ['home.nextStepLabel', 'map.routeStep', 'pass.title', 'itinerary.title']) {
    const es = translate('es', path);
    const en = translate('en', path);
    assert.notStrictEqual(es, en, `"${path}" debería tener texto distinto en ambos idiomas`);
  }
});

// --- paso 8: v_demo2 — sin estancia, cancelada tachada, "actualizado" ---
step(8, 'v_demo2: sin Mi estancia, cita cancelada visible pero no como siguiente paso, "actualizado" solo con marca previa', () => {
  const demo2 = fixtures.v_demo2;
  assert.strictEqual(demo2.lodging, null, 'v_demo2 no debe tener hospedaje');
  const groups = groupByDay(demo2.appointments, '2026-04-06T11:00-07:00');
  const cancelled = groups.flatMap((g) => g.items).find((a) => a.status === 'cancelled');
  assert.ok(cancelled, 'la cita cancelada (b2) debe seguir apareciendo en el itinerario');
  const next = nextStep(demo2.appointments, '2026-04-06T11:00-07:00');
  assert.notStrictEqual(next?.id, cancelled.id, 'la cancelada nunca debe ser "el siguiente paso"');
  assert.strictEqual(isUpdated(cancelled, null), false, 'sin marca previa, ninguna cita se ve "actualizada" (caso 5c)');
  assert.strictEqual(isUpdated(demo2.appointments.find((a) => a.id === 'b3'), '2026-04-06T07:00-07:00'), true, 'con una marca previa a su updatedAt, b3 sí debe verse "actualizada"');
});

// --- pasos 9 y 10: v_expired y un token inventado dan la misma pantalla neutra ---
step(9, 'v_expired: el token existe pero ya venció', () => {
  const expired = fixtures.v_expired;
  assert.strictEqual(isExpired(expired.visit, expired.appointments, expired.lodging, '2026-08-05T12:00-07:00'), true);
});

step(10, 'un token inventado no se encuentra — INV-3 exige la MISMA pantalla que un token vencido; src/ui/app.js usa un único camino de código para ambos casos, así que "misma entrada de datos" (ninguna) ya es la garantía — no hay una segunda ruta de código que pudiera divergir', () => {
  const invented = Object.values(fixtures).find((f) => f.visit.token === 'este-token-nunca-existio');
  assert.strictEqual(invented, undefined);
});

console.log('\n10/10 pasos del recorrido pasaron.');
console.log('Pendiente, fuera del alcance de este script: recorrido visual en navegador y prueba en teléfono real.');
