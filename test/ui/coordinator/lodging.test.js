// Fase 09 — pruebas de la pantalla de Hospedaje del panel de
// coordinadores (registro/edición de Lodging para una visita). Mismo
// patrón que test/ui/plaza.test.js y test/ui/tabs.test.js: este proyecto
// no trae un DOM falso para node:test, así que lo automatizado aquí son
// aserciones de substring sobre el HTML que devuelve renderLodgingScreen
// — ningún test simula un submit real de formulario, eso se comprueba en
// el navegador (ver "Verificación" en docs/phases/phase-09-coordinator-
// demo.md).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderLodgingScreen } from '../../../src/ui/screens/coordinator/lodging.js';
import { createCoordinatorStore } from '../../../src/ui/coordinatorStore.js';
import { translate } from '../../../src/ui/i18n.js';

const FIELD_NAMES = ['hotel', 'reservationCode', 'checkIn', 'checkOut', 'breakfastIncluded', 'recoveryRoom'];
const LABEL_KEYS = [
  'coordinator.lodging.hotelLabel',
  'coordinator.lodging.reservationCodeLabel',
  'coordinator.lodging.checkInLabel',
  'coordinator.lodging.checkOutLabel',
  'coordinator.lodging.breakfastLabel',
  'coordinator.lodging.recoveryLabel',
];

function ctx(store, visitId, lang) {
  return { store, visitId, lang, t: (path) => translate(lang, path) };
}

describe('renderLodgingScreen — formulario, en los dos idiomas', () => {
  test('título, las seis etiquetas y el botón guardar aparecen, en es y en', () => {
    for (const lang of ['es', 'en']) {
      const store = createCoordinatorStore();
      const html = renderLodgingScreen(ctx(store, 'v_demo2', lang));

      assert.ok(html.includes(translate(lang, 'coordinator.lodging.title')), `falta el título en ${lang}`);
      for (const key of LABEL_KEYS) {
        assert.ok(html.includes(translate(lang, key)), `falta la etiqueta "${key}" en ${lang}`);
      }
      assert.ok(html.includes(translate(lang, 'coordinator.lodging.save')), `falta el botón de guardar en ${lang}`);
    }
  });

  test('los seis campos traen su atributo name, en los dos idiomas', () => {
    for (const lang of ['es', 'en']) {
      const store = createCoordinatorStore();
      const html = renderLodgingScreen(ctx(store, 'v_demo2', lang));
      for (const name of FIELD_NAMES) {
        assert.ok(html.includes(`name="${name}"`), `falta name="${name}" en ${lang}`);
      }
    }
  });

  test('el formulario trae data-role="lodging-form"', () => {
    const store = createCoordinatorStore();
    const html = renderLodgingScreen(ctx(store, 'v_demo2', 'es'));
    assert.ok(html.includes('data-role="lodging-form"'), 'falta data-role="lodging-form"');
  });

  test('breakfastIncluded y recoveryRoom son checkboxes', () => {
    const store = createCoordinatorStore();
    const html = renderLodgingScreen(ctx(store, 'v_demo2', 'es'));
    assert.match(html, /<input[^>]*name="breakfastIncluded"[^>]*type="checkbox"|<input[^>]*type="checkbox"[^>]*name="breakfastIncluded"/);
    assert.match(html, /<input[^>]*name="recoveryRoom"[^>]*type="checkbox"|<input[^>]*type="checkbox"[^>]*name="recoveryRoom"/);
  });
});

describe('renderLodgingScreen — prellenado (edición de un hospedaje existente)', () => {
  test('sin lodging previo (v_demo2, lodging: null en las fixtures), ningún checkbox aparece marcado', () => {
    const store = createCoordinatorStore();
    const html = renderLodgingScreen(ctx(store, 'v_demo2', 'es'));
    assert.ok(!/name="breakfastIncluded"[^>]*checked|checked[^>]*name="breakfastIncluded"/.test(html), 'breakfastIncluded no debería venir marcado');
    assert.ok(!/name="recoveryRoom"[^>]*checked|checked[^>]*name="recoveryRoom"/.test(html), 'recoveryRoom no debería venir marcado');
  });

  test('con store.setLodging(...) ya llamado sobre la visita, el formulario se prellena con esos valores', () => {
    const store = createCoordinatorStore();
    store.setLodging('v_demo2', {
      hotel: 'Hotel Prueba Suite',
      reservationCode: 'RC-TEST-9911',
      checkIn: '2026-04-06T15:00-07:00',
      checkOut: '2026-04-07T12:00-07:00',
      breakfastIncluded: true,
      recoveryRoom: true,
    });

    const html = renderLodgingScreen(ctx(store, 'v_demo2', 'es'));

    assert.ok(html.includes('value="Hotel Prueba Suite"'), 'el value de hotel debería aparecer prellenado');
    assert.ok(html.includes('value="RC-TEST-9911"'), 'el value de reservationCode debería aparecer prellenado');
    assert.ok(html.includes('value="2026-04-06T15:00-07:00"'), 'el value de checkIn debería aparecer prellenado');
    assert.ok(html.includes('value="2026-04-07T12:00-07:00"'), 'el value de checkOut debería aparecer prellenado');
    assert.ok(/name="breakfastIncluded"[^>]*checked|checked[^>]*name="breakfastIncluded"/.test(html), 'breakfastIncluded debería venir marcado');
    assert.ok(/name="recoveryRoom"[^>]*checked|checked[^>]*name="recoveryRoom"/.test(html), 'recoveryRoom debería venir marcado');
  });

  test('una visita con lodging ya existente en las fixtures (v_demo1) también se prellena, sin llamar setLodging', () => {
    const store = createCoordinatorStore();
    const html = renderLodgingScreen(ctx(store, 'v_demo1', 'es'));
    assert.ok(html.includes('value="Quartz Hotel &amp; Spa"') || html.includes('value="Quartz Hotel & Spa"'), 'el hotel de v_demo1 debería aparecer prellenado');
    assert.ok(html.includes('value="QZ-8841-MX"'), 'el reservationCode de v_demo1 debería aparecer prellenado');
  });
});

describe('renderLodgingScreen — visita inexistente', () => {
  test('no lanza, y no pinta el formulario', () => {
    const store = createCoordinatorStore();
    assert.doesNotThrow(() => renderLodgingScreen(ctx(store, 'no_existe', 'es')));
    const html = renderLodgingScreen(ctx(store, 'no_existe', 'es'));
    assert.ok(!html.includes('data-role="lodging-form"'), 'no debería haber formulario para una visita inexistente');
  });
});

// Fix (revisión adversarial, fase 09): este era el único de los cinco
// archivos de test/ui/coordinator/ sin la aserción negativa de D28 — el
// código de lodging.js ya era compatible (no trae ningún data-tab/
// data-route/data-target), pero le faltaba el resguardo de regresión que
// sí tienen visits.test.js/intake.test.js/itinerary.test.js/qpass.test.js.
describe('renderLodgingScreen — convención data-nav (D28)', () => {
  test('nunca usa data-tab, data-route ni data-target para navegar', () => {
    const store = createCoordinatorStore();
    const html = renderLodgingScreen(ctx(store, 'v_demo2', 'es'));
    assert.doesNotMatch(html, /data-tab=/);
    assert.doesNotMatch(html, /data-route=/);
    assert.doesNotMatch(html, /data-target=/);
  });
});
