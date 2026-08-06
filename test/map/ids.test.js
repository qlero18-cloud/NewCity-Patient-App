// Fase 04 — pruebas de correspondencia de identificadores del mapa
// (mapPointId) contra el catálogo de rutas de la fase 02 y las ubicaciones
// de la fase 03, más un smoke test estructural del SVG generado y de la
// lógica pura de resaltado. Rojo esperado: src/map/complexMap.js y
// src/map/highlights.js todavía no existen.
//
// Lo visual (contraste, tamaño real de área tocable a 375px de ancho, que
// el resaltado avanza al tocar en un navegador real) NO se prueba aquí —
// la fase 04 lo deja explícito en su propia sección de Verificación: eso
// se revisa abriendo src/map/demo.html en el navegador integrado, no con
// node:test.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAP_POINT_IDS,
  MAP_VIEWBOX,
  getMapPointMeta,
  renderComplexMapSvg,
  renderFichaHtml,
} from '../../src/map/complexMap.js';
import { computeHighlightChange, createHighlighter, HIGHLIGHT_CLASS } from '../../src/map/highlights.js';
import { routes, MAP_HIGHLIGHT_IDS } from '../../src/data/routes.js';
import { locations } from '../../src/data/locations.js';

// Lista fija de docs/phases/phase-04-map-svg.md — si ese archivo cambia,
// esta prueba y MAP_POINT_IDS deben actualizarse juntos (mismo patrón que
// ya usa test/domain/routing.test.js para MAP_HIGHLIGHT_IDS).
const KNOWN_FROM_PHASE_04 = ['mp_parking', 'mp_lobby', 'mp_compass', 'mp_floor27', 'mp_quartz', 'mp_level1', 'mp_pharmacy'];

describe('Identificadores del mapa (docs/phases/phase-04-map-svg.md)', () => {
  test('MAP_POINT_IDS es exactamente la tabla de la fase 04, sin sobrar ni faltar', () => {
    assert.deepStrictEqual([...MAP_POINT_IDS].sort(), [...KNOWN_FROM_PHASE_04].sort());
    assert.strictEqual(MAP_POINT_IDS.length, 7);
    assert.strictEqual(new Set(MAP_POINT_IDS).size, 7, 'no debe haber mapPointId repetidos');
  });

  test('MAP_POINT_IDS coincide exactamente con MAP_HIGHLIGHT_IDS del catálogo de rutas (fase 02)', () => {
    assert.deepStrictEqual([...MAP_POINT_IDS].sort(), [...MAP_HIGHLIGHT_IDS].sort());
  });

  test('todo mapHighlightId usado de verdad en los pasos de routes.js existe en MAP_POINT_IDS (barrido genérico, no confía solo en la constante declarada)', () => {
    const usados = new Set();
    for (const route of routes) {
      for (const step of route.steps) usados.add(step.mapHighlightId);
    }
    for (const id of usados) {
      assert.ok(MAP_POINT_IDS.includes(id), `mapHighlightId "${id}" usado en routes.js pero ausente de MAP_POINT_IDS`);
    }
    for (const id of MAP_POINT_IDS) {
      assert.ok(usados.has(id), `mapPointId "${id}" no se usa en ningún paso de ninguna ruta del catálogo actual`);
    }
  });

  test('todo mapPointId de locations.js (fase 03) corresponde uno a uno con MAP_POINT_IDS, sin sobrar ni faltar', () => {
    const deLocations = locations.map((l) => l.mapPointId);
    assert.deepStrictEqual([...deLocations].sort(), [...MAP_POINT_IDS].sort());
    assert.strictEqual(new Set(deLocations).size, locations.length, 'locations.js no debe repetir mapPointId entre ubicaciones distintas');
  });
});

describe('getMapPointMeta', () => {
  test('devuelve nombre, "qué hay ahí" y horario de cada uno de los 7 puntos, en es y en', () => {
    for (const id of MAP_POINT_IDS) {
      for (const lang of ['es', 'en']) {
        const meta = getMapPointMeta(id, lang);
        assert.ok(meta, `sin meta para ${id}/${lang}`);
        assert.strictEqual(meta.id, id);
        assert.strictEqual(typeof meta.name, 'string');
        assert.ok(meta.name.length > 0, `nombre vacío para ${id}/${lang}`);
        assert.strictEqual(typeof meta.blurb, 'string');
        assert.ok(meta.blurb.length > 0, `"qué hay ahí" vacío para ${id}/${lang}`);
        assert.ok(meta.hours, `sin hours para ${id}`);
      }
    }
  });

  test('id desconocido devuelve null, no lanza excepción', () => {
    assert.strictEqual(getMapPointMeta('mp_no_existe'), null);
  });

  test('farmacia queda marcada unconfirmed a nivel de ubicación completa (PRD §15.6), no solo el horario', () => {
    const meta = getMapPointMeta('mp_pharmacy');
    assert.strictEqual(meta.unconfirmed, true);
  });

  test('un punto con ubicación normal (no farmacia) no queda marcado unconfirmed a nivel de ubicación', () => {
    const meta = getMapPointMeta('mp_parking');
    assert.strictEqual(meta.unconfirmed, false);
  });
});

describe('renderComplexMapSvg', () => {
  test('el viewBox declarado es MAP_VIEWBOX', () => {
    const svg = renderComplexMapSvg();
    assert.ok(svg.includes(`viewBox="${MAP_VIEWBOX}"`), 'el SVG no declara el viewBox esperado');
  });

  test('existen los siete puntos, cada uno tocable (role=button, tabindex=0) e identificado por data-map-point-id', () => {
    const svg = renderComplexMapSvg();
    for (const id of MAP_POINT_IDS) {
      assert.ok(svg.includes(`data-map-point-id="${id}"`), `falta data-map-point-id="${id}"`);
    }
    assert.strictEqual((svg.match(/data-map-point-id="/g) || []).length, 7, 'debe haber exactamente 7 puntos, ni más ni menos');
    assert.strictEqual((svg.match(/role="button"/g) || []).length, 7);
    assert.strictEqual((svg.match(/tabindex="0"/g) || []).length, 7);
  });

  test('el mismo mapPointId nunca aparece dos veces en el SVG generado', () => {
    const svg = renderComplexMapSvg();
    for (const id of MAP_POINT_IDS) {
      const count = (svg.match(new RegExp(`data-map-point-id="${id}"`, 'g')) || []).length;
      assert.strictEqual(count, 1, `"${id}" aparece ${count} veces, debería ser 1`);
    }
  });

  test('queda etiquetado visiblemente como esquema referencial, en es y en', () => {
    assert.match(renderComplexMapSvg({ lang: 'es' }), /esquema referencial/i);
    assert.match(renderComplexMapSvg({ lang: 'en' }), /reference(d)? schematic|schematic reference/i);
  });

  test('por defecto (sin lang) renderiza en español', () => {
    assert.match(renderComplexMapSvg(), /esquema referencial/i);
  });
});

describe('renderFichaHtml', () => {
  test('incluye nombre y el botón "cómo llegar" con el id correcto para cada uno de los 7 puntos', () => {
    for (const id of MAP_POINT_IDS) {
      const html = renderFichaHtml(id, 'es');
      assert.ok(html, `sin ficha para ${id}`);
      assert.ok(html.includes(`data-directions-for="${id}"`), `falta el botón "cómo llegar" para ${id}`);
    }
  });

  test('todo horario se muestra con el distintivo [POR CONFIRMAR] (o [TO CONFIRM] en inglés) mientras locations.js lo marque unconfirmed', () => {
    for (const id of MAP_POINT_IDS) {
      const loc = locations.find((l) => l.mapPointId === id);
      assert.ok(loc.hours.unconfirmed, `fixture inesperada: ${id} ya no tiene horario unconfirmed — revisar esta prueba`);
      assert.match(renderFichaHtml(id, 'es'), /POR CONFIRMAR/);
      assert.match(renderFichaHtml(id, 'en'), /TO CONFIRM/);
    }
  });

  test('id desconocido devuelve null, no lanza excepción', () => {
    assert.strictEqual(renderFichaHtml('mp_no_existe', 'es'), null);
  });
});

describe('computeHighlightChange (lógica pura detrás de highlightStep)', () => {
  test('primera llamada: nada que quitar, agrega el nuevo', () => {
    assert.deepStrictEqual(computeHighlightChange(null, 'mp_parking'), { remove: null, add: 'mp_parking' });
  });

  test('llamada siguiente: quita el anterior y agrega el nuevo', () => {
    assert.deepStrictEqual(computeHighlightChange('mp_parking', 'mp_lobby'), { remove: 'mp_parking', add: 'mp_lobby' });
  });

  test('resaltar el mismo punto otra vez: se quita y se vuelve a agregar a sí mismo', () => {
    assert.deepStrictEqual(computeHighlightChange('mp_compass', 'mp_compass'), { remove: 'mp_compass', add: 'mp_compass' });
  });
});

describe('createHighlighter (envoltorio sobre un doble de DOM mínimo, sin dependencias)', () => {
  function fakeRoot(ids) {
    const byId = new Map(ids.map((id) => [id, { classes: new Set() }]));
    for (const el of byId.values()) {
      el.classList = {
        add: (c) => el.classes.add(c),
        remove: (c) => el.classes.delete(c),
        contains: (c) => el.classes.has(c),
      };
    }
    return {
      getElementsByMapPointId(id) {
        const el = byId.get(id);
        return el ? [el] : [];
      },
      has(id, cls) {
        return byId.get(id)?.classes.has(cls) ?? false;
      },
    };
  }

  test('resaltar A y luego B: A pierde la clase, B la tiene, A ya no la tiene', () => {
    const root = fakeRoot(MAP_POINT_IDS);
    const highlighter = createHighlighter(root);

    highlighter.highlightStep('mp_parking');
    assert.strictEqual(root.has('mp_parking', HIGHLIGHT_CLASS), true);
    assert.strictEqual(highlighter.currentHighlightId(), 'mp_parking');

    highlighter.highlightStep('mp_lobby');
    assert.strictEqual(root.has('mp_parking', HIGHLIGHT_CLASS), false, 'el resaltado anterior debe quitarse');
    assert.strictEqual(root.has('mp_lobby', HIGHLIGHT_CLASS), true);
    assert.strictEqual(highlighter.currentHighlightId(), 'mp_lobby');
  });

  test('resaltar un id que el root no conoce no lanza excepción', () => {
    const root = fakeRoot(MAP_POINT_IDS);
    const highlighter = createHighlighter(root);
    assert.doesNotThrow(() => highlighter.highlightStep('mp_no_existe'));
  });

  test('recorrido completo de una ruta real (estacionamiento→compass): el resaltado avanza paso a paso y nunca deja dos puntos resaltados a la vez', () => {
    const route = routes.find((r) => r.id === 'r_estacionamiento_compass');
    assert.ok(route, 'fixture inesperada: no existe r_estacionamiento_compass en el catálogo — revisar esta prueba');
    const root = fakeRoot(MAP_POINT_IDS);
    const highlighter = createHighlighter(root);
    let previous = null;
    for (const step of route.steps) {
      highlighter.highlightStep(step.mapHighlightId);
      if (previous !== null && previous !== step.mapHighlightId) {
        assert.strictEqual(root.has(previous, HIGHLIGHT_CLASS), false, `paso ${step.order}: "${previous}" debería haber perdido el resaltado`);
      }
      assert.strictEqual(root.has(step.mapHighlightId, HIGHLIGHT_CLASS), true, `paso ${step.order}: "${step.mapHighlightId}" debería estar resaltado`);
      previous = step.mapHighlightId;
    }
  });
});
