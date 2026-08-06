// Fase 05 — la barra de pestañas inferior. Bug real encontrado en fase 07
// (reportado por el cliente en producción — "el menu inferior no
// funciona" — no por ninguna prueba automatizada): renderTabBar emitía
// data-tab="id" pero src/ui/app.js solo conecta el clic a [data-nav]
// (root.querySelectorAll('[data-nav]'), el mismo patrón que ya usan los
// accesos rápidos de home.js). La barra inferior nunca navegó al
// tocarla, en ningún despliegue, desde que existe — un botón sin
// listener sigue recibiendo el foco visual del navegador al tocarlo, por
// eso el bug no saltaba a la vista en una captura de pantalla estática.
//
// Este proyecto no trae un DOM falso para node:test (ver la nota en
// test/ui/plaza.test.js) — la prueba real de "el clic navega" solo se
// puede hacer en el navegador. Pero SÍ se puede probar, sin DOM, que el
// HTML que produce renderTabBar usa el mismo nombre de atributo que
// app.js consulta para conectar el clic. Esta prueba habría atrapado el
// bug el día que se escribió tabs.js.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderTabBar } from '../../src/ui/components/tabs.js';
import { translate } from '../../src/ui/i18n.js';

const TAB_IDS = ['home', 'itinerary', 'map', 'plaza', 'help'];

function t(path) {
  return translate('es', path);
}

describe('renderTabBar — conexión con el enrutador de src/ui/app.js', () => {
  test('cada botón trae data-nav="<id>", el atributo que app.js conecta a clic', () => {
    const html = renderTabBar('home', t);
    for (const id of TAB_IDS) {
      assert.match(
        html,
        new RegExp(`data-nav="${id}"`),
        `falta data-nav="${id}" — sin esto el tab no navega al tocarlo (bug real de fase 07)`
      );
    }
  });

  test('no usa data-tab (nombre viejo, no conectado a ningún listener en app.js)', () => {
    const html = renderTabBar('home', t);
    assert.doesNotMatch(html, /data-tab=/);
  });

  test('marca exactamente la pestaña activa con aria-selected="true"', () => {
    const html = renderTabBar('map', t);
    assert.match(html, /data-nav="map"[^>]*aria-selected="true"/);
    for (const id of TAB_IDS.filter((i) => i !== 'map')) {
      assert.match(html, new RegExp(`data-nav="${id}"[^>]*aria-selected="false"`));
    }
  });

  test('con activeTab vacío (pantallas que no son pestaña, p. ej. Mi pase) ninguna queda seleccionada', () => {
    const html = renderTabBar('', t);
    for (const id of TAB_IDS) {
      assert.match(html, new RegExp(`data-nav="${id}"[^>]*aria-selected="false"`));
    }
  });
});
