// Fase 09 — fix de bug real reportado por el cliente ("solo veo visits, no
// veo lodging ni qpass"): no existía ningún [data-nav] que llevara de
// Itinerario a Hospedaje o QPASS (o viceversa) para una misma visita, solo
// el botón "volver a visitas" del encabezado (ver docs/DECISIONS.md D36).
// Este archivo prueba renderVisitSubnav(route, t) (src/ui/coordinatorApp.
// js), la pieza pura que arma esos botones. La Etapa E agregó un cuarto,
// 'handoff' (Enviar al paciente), sin tocar renderVisitSubnav: la lista
// sale de SCREENS, así que basta con registrar la pantalla. Mismo criterio que el
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

// Escrita a mano y NO derivada de SCREENS a propósito: derivarla de la
// misma fuente que la implementación haría que la prueba pasara sola al
// agregar una pantalla y no verificaría nada. Se actualiza a mano cada vez
// que se agrega una ruta de visita — la Etapa G agregó 'transfers'.
const ROUTES = ['itinerary', 'lodging', 'transfers', 'qpass', 'handoff'];

describe('renderVisitSubnav — todas las rutas siempre presentes, en los dos idiomas', () => {
  test('trae un data-nav por cada ruta de visita sin importar cuál esté activa', () => {
    for (const lang of ['es', 'en']) {
      const t = (path) => translate(lang, path);
      for (const active of ROUTES) {
        const html = renderVisitSubnav(active, t);
        for (const route of ROUTES) {
          assert.ok(html.includes(`data-nav="${route}"`), `falta data-nav="${route}" (activo: ${active}, ${lang})`);
        }
      }
    }
  });

  test('usa el mismo título que cada pantalla ya usa en su <h1>, sin cadenas nuevas', () => {
    for (const lang of ['es', 'en']) {
      const t = (path) => translate(lang, path);
      const html = renderVisitSubnav('itinerary', t);
      for (const route of ROUTES) {
        // Cada botón reusa el <h1> de su propia pantalla; una llave nueva
        // aquí significaría dos textos para lo mismo.
        assert.ok(html.includes(translate(lang, `coordinator.${route}.title`)), `falta el título de ${route} en ${lang}`);
      }
    }
  });
});

describe('renderVisitSubnav — estado activo', () => {
  test('aria-selected="true" solo en la ruta activa, "false" en las demás', () => {
    const t = (path) => translate('es', path);
    const html = renderVisitSubnav('lodging', t);
    assert.match(html, /data-nav="lodging"[^>]*aria-selected="true"/);
    for (const route of ROUTES.filter((r) => r !== 'lodging')) {
      assert.match(html, new RegExp(`data-nav="${route}"[^>]*aria-selected="false"`), `${route} no debería quedar activa`);
    }
  });

  test('cada una de las rutas puede quedar activa', () => {
    const t = (path) => translate('es', path);
    for (const active of ROUTES) {
      const html = renderVisitSubnav(active, t);
      assert.match(html, new RegExp(`data-nav="${active}"[^>]*aria-selected="true"`), `${active} debería quedar activa`);
    }
  });

  test('una ruta ajena (p.ej. "visits") no marca ninguna como activa', () => {
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

describe('renderVisitSubnav — etiqueta accesible traducida (Etapa A, #13)', () => {
  test('el aria-label del <nav> sale de i18n y cambia con el idioma', () => {
    for (const lang of ['es', 'en']) {
      const html = renderVisitSubnav('itinerary', (path) => translate(lang, path));
      assert.ok(
        html.includes(`aria-label="${translate(lang, 'coordinator.subnavLabel')}"`),
        `el aria-label del subnav no sale de coordinator.subnavLabel en ${lang}`
      );
    }
  });

  test('la etiqueta de verdad está traducida: es y en no son la misma cadena', () => {
    assert.notStrictEqual(
      translate('es', 'coordinator.subnavLabel'),
      translate('en', 'coordinator.subnavLabel'),
      'coordinator.subnavLabel quedó igual en los dos idiomas — vuelve a ser una etiqueta fija'
    );
  });
});
