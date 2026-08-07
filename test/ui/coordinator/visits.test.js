// Fase 09 — pruebas de la pantalla de entrada del panel de coordinación
// (docs/phases/phase-09-coordinator-demo.md). Mismo patrón que
// test/ui/plaza.test.js y test/ui/tabs.test.js: este proyecto no trae un
// DOM falso para node:test, así que lo automatizado aquí son aserciones
// de substring sobre el HTML que devuelve renderVisitsScreen(ctx), no una
// simulación de clic real (eso se confirma en el recorrido manual del
// navegador, según el propio doc de fase 09).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderVisitsScreen, attachVisitsScreen } from '../../../src/ui/screens/coordinator/visits.js';
import { createCoordinatorStore } from '../../../src/ui/coordinatorStore.js';
import { translate } from '../../../src/ui/i18n.js';

function ctx(store, lang) {
  return { store, lang, t: (path) => translate(lang, path) };
}

describe('renderVisitsScreen — estructura del módulo', () => {
  test('regresa un <section class="nc-screen"> con <h1 class="nc-screen-title"> dentro', () => {
    const store = createCoordinatorStore();
    const html = renderVisitsScreen(ctx(store, 'es'));
    assert.match(html, /<section class="nc-screen">/);
    assert.match(html, /<h1 class="nc-screen-title">/);
  });

  test('el título viene de coordinator.visits.title, en los dos idiomas', () => {
    for (const lang of ['es', 'en']) {
      const store = createCoordinatorStore();
      const html = renderVisitsScreen(ctx(store, lang));
      assert.ok(html.includes(translate(lang, 'coordinator.visits.title')), `falta el título en ${lang}`);
    }
  });
});

describe('renderVisitsScreen — estado vacío', () => {
  test('un store real sin visitas muestra coordinator.visits.empty y ninguna tarjeta', () => {
    const store = createCoordinatorStore({}); // fixtures iniciales vacías a propósito
    assert.strictEqual(store.listVisits().length, 0, 'precondición: el store debe estar vacío');

    const html = renderVisitsScreen(ctx(store, 'es'));
    assert.ok(html.includes(translate('es', 'coordinator.visits.empty')), 'falta el mensaje de vacío');
    assert.ok(!html.includes('data-select-visit'), 'no debería haber ninguna tarjeta de visita');
  });

  test('el control "nueva visita" sigue presente aunque no haya visitas', () => {
    const store = createCoordinatorStore({});
    const html = renderVisitsScreen(ctx(store, 'es'));
    assert.match(html, /data-nav="intake"/);
  });
});

describe('renderVisitsScreen — store poblado', () => {
  test('una tarjeta con data-select-visit="<id>" por cada visita del store (fixtures + 2 altas nuevas)', () => {
    const store = createCoordinatorStore();
    store.createVisit({ patientFirstName: 'Visita Uno', lang: 'es', startsAt: '2026-04-01T09:00-07:00', endsAt: '2026-04-02T09:00-07:00' });
    store.createVisit({ patientFirstName: 'Visita Dos', lang: 'en', startsAt: '2026-05-01T09:00-07:00', endsAt: '2026-05-02T09:00-07:00' });

    const visits = store.listVisits().map((r) => r.visit);
    assert.ok(visits.length >= 2, 'precondición: debe haber al menos las dos visitas recién creadas');
    assert.ok(visits.every((v) => typeof v.id === 'string' && v.id.length > 0), 'precondición: cada visita debe traer un id real');

    const html = renderVisitsScreen(ctx(store, 'es'));
    for (const v of visits) {
      assert.match(html, new RegExp(`data-select-visit="${v.id}"`), `falta data-select-visit para ${v.id}`);
    }

    const matches = html.match(/data-select-visit="/g) || [];
    assert.strictEqual(matches.length, visits.length, 'debe existir exactamente una tarjeta por visita, ni de más ni de menos');
    assert.ok(!html.includes('data-select-visit="undefined"'), 'ninguna tarjeta debe tener un id sin resolver');
  });

  test('el control "nueva visita" (data-nav="intake") aparece exactamente una vez', () => {
    const store = createCoordinatorStore();
    const html = renderVisitsScreen(ctx(store, 'es'));
    const matches = html.match(/data-nav="intake"/g) || [];
    assert.strictEqual(matches.length, 1);
  });

  test('cada tarjeta muestra patientFirstName, lang, startsAt y endsAt de la visita (dato crudo, sin formatear)', () => {
    const store = createCoordinatorStore();
    const demo1 = store.getVisit('v_demo1').visit;
    const html = renderVisitsScreen(ctx(store, 'es'));
    assert.ok(html.includes(demo1.patientFirstName), 'falta patientFirstName');
    assert.ok(html.includes(demo1.lang), 'falta lang');
    assert.ok(html.includes(demo1.startsAt), 'falta startsAt (ISO crudo)');
    assert.ok(html.includes(demo1.endsAt), 'falta endsAt (ISO crudo)');
  });
});

describe('renderVisitsScreen — convención data-nav (D28)', () => {
  test('nunca usa data-tab, data-route ni data-target para navegar', () => {
    const store = createCoordinatorStore();
    const html = renderVisitsScreen(ctx(store, 'es'));
    assert.doesNotMatch(html, /data-tab=/);
    assert.doesNotMatch(html, /data-route=/);
    assert.doesNotMatch(html, /data-target=/);
  });
});

describe('attachVisitsScreen — exportado por consistencia de interfaz', () => {
  test('se exporta como función y no lanza al invocarse (no-op: la selección de visita y "nueva visita" las cablea el router central)', () => {
    assert.strictEqual(typeof attachVisitsScreen, 'function');
    assert.doesNotThrow(() => attachVisitsScreen({}, {}));
  });
});
