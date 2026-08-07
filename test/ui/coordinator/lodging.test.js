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
import { renderLodgingScreen, validateLodging } from '../../../src/ui/screens/coordinator/lodging.js';
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

describe('validateLodging — validación del formulario de hospedaje (Etapa A, #9)', () => {
  const VALID = {
    hotel: 'Quartz Hotel & Spa',
    reservationCode: 'QZ-8891',
    checkIn: '2026-03-09T15:00-07:00',
    checkOut: '2026-03-12T11:00-07:00',
  };

  test('un hospedaje completo y coherente pasa', () => {
    const result = validateLodging(VALID);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.errors, {});
  });

  test('hotel, check-in y check-out son obligatorios: antes se podía guardar el formulario vacío', () => {
    const result = validateLodging({ hotel: '', reservationCode: '', checkIn: '', checkOut: '' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.errors.hotel, 'required');
    assert.strictEqual(result.errors.checkIn, 'required');
    assert.strictEqual(result.errors.checkOut, 'required');
  });

  test('espacios en blanco no cuentan como valor', () => {
    const result = validateLodging({ ...VALID, hotel: '   ' });
    assert.strictEqual(result.errors.hotel, 'required');
  });

  test('el código de reservación sigue siendo opcional (puede no haberlo todavía)', () => {
    const result = validateLodging({ ...VALID, reservationCode: '' });
    assert.strictEqual(result.ok, true);
  });

  test('una fecha que no se puede interpretar se señala, en vez de guardarse tal cual', () => {
    // Son <input type="text"> (sin date-picker en el proyecto), así que
    // "12 de marzo" o "2026-13-45" llegan igual de fácil que un ISO válido.
    for (const bad of ['12 de marzo', '2026-13-45', 'mañana', '2026-03-09T99:00-07:00']) {
      const result = validateLodging({ ...VALID, checkIn: bad });
      assert.strictEqual(result.ok, false, `debería rechazar checkIn="${bad}"`);
      assert.strictEqual(result.errors.checkIn, 'invalidDate', `motivo equivocado para "${bad}"`);
    }
  });

  test('check-out anterior o igual al check-in se señala: es el error que de verdad rompe la estancia', () => {
    const before = validateLodging({ ...VALID, checkOut: '2026-03-08T11:00-07:00' });
    assert.strictEqual(before.ok, false);
    assert.strictEqual(before.errors.checkOut, 'order');

    const same = validateLodging({ ...VALID, checkOut: VALID.checkIn });
    assert.strictEqual(same.ok, false);
    assert.strictEqual(same.errors.checkOut, 'order');
  });

  test('cada motivo tiene mensaje en los dos idiomas', () => {
    for (const reason of ['required', 'invalidDate', 'order']) {
      for (const lang of ['es', 'en']) {
        const msg = translate(lang, `coordinator.lodging.error.${reason}`);
        assert.ok(typeof msg === 'string' && msg.length > 0, `falta coordinator.lodging.error.${reason} en ${lang}`);
      }
    }
  });

  test('hay confirmación de guardado en los dos idiomas (antes no había ninguna señal de que sirvió)', () => {
    for (const lang of ['es', 'en']) {
      const msg = translate(lang, 'coordinator.lodging.saved');
      assert.ok(typeof msg === 'string' && msg.length > 0, `falta coordinator.lodging.saved en ${lang}`);
    }
  });
});

describe('confirmación de guardado — debe sobrevivir al repintado (Etapa A, #9)', () => {
  // El bug que esto fija: attachLodgingScreen mostraba la confirmación
  // escribiéndola en el DOM y JUSTO DESPUÉS llamaba onChange, que en
  // coordinatorApp.js es render() — repintar la pantalla entera tiraba el
  // mensaje recién puesto. En el navegador la confirmación nunca se veía,
  // aunque el guardado sí ocurría. La confirmación es estado de la
  // pantalla, así que se pinta en render, no se inyecta después.
  const store = createCoordinatorStore();

  function ctx(lang, extra = {}) {
    return { store, visitId: 'v_demo1', lang, t: (k) => translate(lang, k), ...extra };
  }

  test('sin flash no se anuncia nada: abrir la pantalla no es haber guardado', () => {
    const html = renderLodgingScreen(ctx('es'));
    assert.ok(
      !html.includes(translate('es', 'coordinator.lodging.saved')),
      'la pantalla recién abierta no debe decir que guardó'
    );
  });

  test('con flash "saved" el mensaje viene YA en el HTML, no inyectado después', () => {
    for (const lang of ['es', 'en']) {
      const html = renderLodgingScreen(ctx(lang, { flash: 'saved' }));
      assert.ok(
        html.includes(translate(lang, 'coordinator.lodging.saved')),
        `falta la confirmación en ${lang}`
      );
      assert.match(html, /role="status"/, 'debe anunciarse a lectores de pantalla');
    }
  });

  test('un flash que no reconoce no imprime nada raro en pantalla', () => {
    const html = renderLodgingScreen(ctx('es', { flash: 'otra-cosa' }));
    assert.ok(!html.includes('otra-cosa'), 'no debe filtrar el valor crudo del flash al HTML');
    assert.ok(!html.includes(translate('es', 'coordinator.lodging.saved')));
  });
});
