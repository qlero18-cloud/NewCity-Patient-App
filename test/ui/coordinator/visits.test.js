// Fase 09 — pruebas de la pantalla de entrada del panel de coordinación
// (docs/phases/phase-09-coordinator-demo.md). Mismo patrón que
// test/ui/plaza.test.js y test/ui/tabs.test.js: este proyecto no trae un
// DOM falso para node:test, así que lo automatizado aquí son aserciones
// de substring sobre el HTML que devuelve renderVisitsScreen(ctx), no una
// simulación de clic real (eso se confirma en el recorrido manual del
// navegador, según el propio doc de fase 09).
//
// Etapa D — ya no hay fixtures: la lista sale de GET /visits. Las pruebas
// se arman contra el handler real (test/helpers/loopback.js) en vez de un
// doble a mano, para que un cambio en lo que devuelve el servidor se vea
// aquí en la misma corrida.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderVisitsScreen, attachVisitsScreen } from '../../../src/ui/screens/coordinator/visits.js';
import { createCoordinatorStore } from '../../../src/ui/coordinatorStore.js';
import { createLoopbackApi } from '../../helpers/loopback.js';
import { translate } from '../../../src/ui/i18n.js';

function ctx(store, lang) {
  return { store, lang, t: (path) => translate(lang, path) };
}

// Un panel conectado y sin nada cargado todavía. La pantalla nunca lo ve
// así en el navegador —coordinatorApp.js pinta la puerta de "cargando…"
// hasta que loadVisits contesta (test/ui/coordinator/gate.test.js)— pero
// aquí sirve como punto de partida limpio.
function panelVacio() {
  const api = createLoopbackApi();
  return { api, store: createCoordinatorStore({ api }) };
}

async function panelCon(...visitas) {
  const { api, store } = panelVacio();
  const creadas = [];
  for (const datos of visitas) {
    const res = await store.createVisit(datos);
    if (!res.ok) throw new Error(`no se creó la visita de prueba: ${JSON.stringify(res)}`);
    creadas.push(res.visit);
  }
  return { api, store, visitas: creadas };
}

const UNA = {
  patientFirstName: 'Visita Uno',
  lang: 'es',
  startsAt: '2026-04-01T09:00-07:00',
  endsAt: '2026-04-02T09:00-07:00',
};
const OTRA = {
  patientFirstName: 'Visita Dos',
  lang: 'en',
  startsAt: '2026-05-01T09:00-07:00',
  endsAt: '2026-05-02T09:00-07:00',
};

describe('renderVisitsScreen — estructura del módulo', () => {
  test('regresa un <section class="nc-screen"> con <h1 class="nc-screen-title"> dentro', async () => {
    const { store } = await panelCon(UNA);
    const html = renderVisitsScreen(ctx(store, 'es'));
    assert.match(html, /<section class="nc-screen">/);
    assert.match(html, /<h1 class="nc-screen-title">/);
  });

  test('el título viene de coordinator.visits.title, en los dos idiomas', async () => {
    for (const lang of ['es', 'en']) {
      const { store } = await panelCon(UNA);
      const html = renderVisitsScreen(ctx(store, lang));
      assert.ok(html.includes(translate(lang, 'coordinator.visits.title')), `falta el título en ${lang}`);
    }
  });
});

describe('renderVisitsScreen — estado vacío', () => {
  test('un store cargado y sin visitas muestra coordinator.visits.empty y ninguna tarjeta', async () => {
    const { store } = panelVacio();
    const carga = await store.loadVisits();
    assert.strictEqual(carga.ok, true, 'precondición: la carga debe haber funcionado');
    assert.strictEqual(store.listVisits().length, 0, 'precondición: el servidor no tiene visitas');

    const html = renderVisitsScreen(ctx(store, 'es'));
    assert.ok(html.includes(translate('es', 'coordinator.visits.empty')), 'falta el mensaje de vacío');
    assert.ok(!html.includes('data-select-visit'), 'no debería haber ninguna tarjeta de visita');
  });

  test('el control "nueva visita" sigue presente aunque no haya visitas', () => {
    const { store } = panelVacio();
    const html = renderVisitsScreen(ctx(store, 'es'));
    assert.match(html, /data-nav="intake"/);
  });
});

describe('renderVisitsScreen — store poblado', () => {
  test('una tarjeta con data-select-visit="<id>" por cada visita del store', async () => {
    const { store } = await panelCon(UNA, OTRA);

    const visits = store.listVisits().map((r) => r.visit);
    assert.strictEqual(visits.length, 2, 'precondición: deben estar las dos visitas recién creadas');
    assert.ok(visits.every((v) => typeof v.id === 'string' && v.id.length > 0), 'precondición: cada visita debe traer un id real');

    const html = renderVisitsScreen(ctx(store, 'es'));
    for (const v of visits) {
      assert.match(html, new RegExp(`data-select-visit="${v.id}"`), `falta data-select-visit para ${v.id}`);
    }

    const matches = html.match(/data-select-visit="/g) || [];
    assert.strictEqual(matches.length, visits.length, 'debe existir exactamente una tarjeta por visita, ni de más ni de menos');
    assert.ok(!html.includes('data-select-visit="undefined"'), 'ninguna tarjeta debe tener un id sin resolver');
  });

  // Etapa D: la prueba que antes no se podía hacer. Las visitas se crean
  // con un store y se listan con OTRO, contra el mismo servidor — que es
  // lo que de verdad pasa al recargar el panel (#16). Con el store en
  // memoria de la fase 09 esto habría dado cero visitas.
  test('otro store contra el mismo servidor ve las mismas visitas tras loadVisits: recargar ya no borra nada', async () => {
    const { api, visitas } = await panelCon(UNA, OTRA);

    const recargado = createCoordinatorStore({ api });
    assert.strictEqual(recargado.listVisits().length, 0, 'precondición: el store nuevo arranca sin nada');
    await recargado.loadVisits();

    const html = renderVisitsScreen(ctx(recargado, 'es'));
    for (const v of visitas) {
      assert.match(html, new RegExp(`data-select-visit="${v.id}"`), `la visita ${v.id} se perdió al recargar`);
    }
  });

  // GET /visits no entrega el token (coordinatorHandler.js lo quita). Si
  // algún día se colara, quedaría impreso en la lista de visitas de una
  // máquina compartida, a la vista de quien pase.
  test('ninguna tarjeta imprime el token de la visita', async () => {
    const { visitas, api } = await panelCon(UNA);
    const store = createCoordinatorStore({ api });
    await store.loadVisits();

    const html = renderVisitsScreen(ctx(store, 'es'));
    assert.ok(visitas[0].token, 'precondición: createVisit sí devuelve el token a quien la creó');
    assert.ok(!html.includes(visitas[0].token), 'el token no debe aparecer en la lista');
  });

  test('el control "nueva visita" (data-nav="intake") aparece exactamente una vez', async () => {
    const { store } = await panelCon(UNA);
    const html = renderVisitsScreen(ctx(store, 'es'));
    const matches = html.match(/data-nav="intake"/g) || [];
    assert.strictEqual(matches.length, 1);
  });

  test('cada tarjeta muestra patientFirstName, lang, startsAt y endsAt de la visita (dato crudo, sin formatear)', async () => {
    const { store, visitas } = await panelCon(UNA);
    const [visita] = visitas;
    const html = renderVisitsScreen(ctx(store, 'es'));
    assert.ok(html.includes(visita.patientFirstName), 'falta patientFirstName');
    assert.ok(html.includes(visita.lang), 'falta lang');
    assert.ok(html.includes(visita.startsAt), 'falta startsAt (ISO crudo)');
    assert.ok(html.includes(visita.endsAt), 'falta endsAt (ISO crudo)');
  });
});

describe('renderVisitsScreen — convención data-nav (D28)', () => {
  test('nunca usa data-tab, data-route ni data-target para navegar', async () => {
    const { store } = await panelCon(UNA);
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
