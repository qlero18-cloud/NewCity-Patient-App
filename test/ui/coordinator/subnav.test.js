// Fase 09 — fix de bug real reportado por el cliente ("solo veo visits, no
// veo lodging ni qpass"): no existía ningún [data-nav] que llevara de
// Itinerario a Hospedaje o QPASS (o viceversa) para una misma visita, solo
// el botón "volver a visitas" del encabezado (ver docs/DECISIONS.md D36).
// Este archivo prueba renderVisitSubnav(route, t) (src/ui/coordinatorApp.
// js), la pieza pura que arma esos tres botones. Mismo criterio que el
// resto de test/ui/coordinator/*.test.js (ver la nota en
// test/ui/plaza.test.js): este proyecto no trae un DOM falso para
// node:test, así que lo que se prueba aquí son aserciones de substring
// sobre el HTML devuelto. La aserción que de verdad habría atrapado el bug
// original es la primera de abajo: las tres rutas deben aparecer SIEMPRE,
// sin importar cuál esté activa — el bug real era que ninguna aparecía
// nunca, en ninguna de las tres pantallas.
//
// Lo que este archivo NO prueba (a propósito): que coordinatorApp.js de
// verdad inserte este subnav en su render() solo cuando hay una visita
// seleccionada y la ruta es itinerary/lodging/qpass — render() vive dentro
// de boot(), cerrado sobre document/location reales, sin exportar, y este
// proyecto no trae un DOM falso completo (ver arriba); esa parte se
// verifica a mano en navegador con clics reales, no con hash escrito por
// código — precisamente la distinción que esta sesión pasó por alto la
// primera vez.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderVisitSubnav } from '../../../src/ui/coordinatorApp.js';
import { translate } from '../../../src/ui/i18n.js';

const ROUTES = ['itinerary', 'lodging', 'qpass'];

describe('renderVisitSubnav — las tres rutas siempre presentes, en los dos idiomas', () => {
  test('trae data-nav="itinerary", data-nav="lodging" y data-nav="qpass" sin importar cuál esté activa', () => {
    for (const lang of ['es', 'en']) {
      const t = (path) => translate(lang, path);
      for (const active of ROUTES) {
        const html = renderVisitSubnav(active, t);
        assert.ok(html.includes('data-nav="itinerary"'), `falta data-nav="itinerary" (activo: ${active}, ${lang})`);
        assert.ok(html.includes('data-nav="lodging"'), `falta data-nav="lodging" (activo: ${active}, ${lang})`);
        assert.ok(html.includes('data-nav="qpass"'), `falta data-nav="qpass" (activo: ${active}, ${lang})`);
      }
    }
  });

  test('usa el mismo título que cada pantalla ya usa en su <h1>, sin cadenas nuevas', () => {
    for (const lang of ['es', 'en']) {
      const t = (path) => translate(lang, path);
      const html = renderVisitSubnav('itinerary', t);
      assert.ok(html.includes(translate(lang, 'coordinator.itinerary.title')), `falta el título de itinerario en ${lang}`);
      assert.ok(html.includes(translate(lang, 'coordinator.lodging.title')), `falta el título de hospedaje en ${lang}`);
      assert.ok(html.includes(translate(lang, 'coordinator.qpass.title')), `falta el título de qpass en ${lang}`);
    }
  });
});

describe('renderVisitSubnav — estado activo', () => {
  test('aria-selected="true" solo en la ruta activa, "false" en las otras dos', () => {
    const t = (path) => translate('es', path);
    const html = renderVisitSubnav('lodging', t);
    assert.match(html, /data-nav="lodging"[^>]*aria-selected="true"/);
    assert.match(html, /data-nav="itinerary"[^>]*aria-selected="false"/);
    assert.match(html, /data-nav="qpass"[^>]*aria-selected="false"/);
  });

  test('cada una de las tres rutas puede quedar activa', () => {
    const t = (path) => translate('es', path);
    for (const active of ROUTES) {
      const html = renderVisitSubnav(active, t);
      assert.match(html, new RegExp(`data-nav="${active}"[^>]*aria-selected="true"`), `${active} debería quedar activa`);
    }
  });

  test('una ruta ajena (p.ej. "visits") no marca ninguna de las tres como activa', () => {
    const t = (path) => translate('es', path);
    const html = renderVisitSubnav('visits', t);
    for (const route of ROUTES) {
      assert.match(html, new RegExp(`data-nav="${route}"[^>]*aria-selected="false"`), `${route} no debería quedar activa`);
    }
  });
});

describe('renderVisitSubnav — convención data-nav (D28)', () => {
  test('nunca usa data-tab, data-route ni data-target para navegar', () => {
    const t = (path) => translate('es', path);
    const html = renderVisitSubnav('itinerary', t);
    assert.doesNotMatch(html, /data-tab=/);
    assert.doesNotMatch(html, /data-route=/);
    assert.doesNotMatch(html, /data-target=/);
  });
});
