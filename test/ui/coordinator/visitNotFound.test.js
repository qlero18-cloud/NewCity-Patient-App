// Etapa A (#11) — "visita no encontrada" se comportaba distinto en cada
// pantalla que necesita una visita seleccionada:
//   - itinerary.js y qpass.js: literal fijo, con un `lang === 'en' ? … : …`
//     escrito a mano en cada archivo (la única traducción del proyecto
//     hecha fuera de i18n.js).
//   - lodging.js: NADA. Devolvía solo el <h1>, así que la coordinadora veía
//     una pantalla vacía sin explicación.
//
// Las tres deben decir lo mismo, desde la misma llave de i18n. Este archivo
// prueba las tres juntas a propósito: el hallazgo es la INCONSISTENCIA
// entre ellas, no el texto de ninguna por separado, y probarlas en tres
// archivos distintos es justo lo que dejó que se separaran.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderItineraryScreen } from '../../../src/ui/screens/coordinator/itinerary.js';
import { renderLodgingScreen } from '../../../src/ui/screens/coordinator/lodging.js';
import { renderQpassScreen } from '../../../src/ui/screens/coordinator/qpass.js';
import { translate } from '../../../src/ui/i18n.js';

// Store mínima: la visita pedida no existe, que es todo el caso bajo prueba.
const emptyStore = {
  getVisit: () => null,
  getVisitWithPasses: () => null,
};

const SCREENS = [
  ['itinerary', renderItineraryScreen],
  ['lodging', renderLodgingScreen],
  ['qpass', renderQpassScreen],
];

function ctx(lang) {
  return { store: emptyStore, visitId: 'v_no_existe', lang, t: (path) => translate(lang, path) };
}

describe('Visita inexistente — las tres pantallas responden igual (Etapa A, #11)', () => {
  for (const [name, render] of SCREENS) {
    test(`${name}: muestra el mensaje de coordinator.visitNotFound en los dos idiomas`, () => {
      for (const lang of ['es', 'en']) {
        const html = render(ctx(lang));
        assert.ok(
          html.includes(translate(lang, 'coordinator.visitNotFound')),
          `${name} no muestra coordinator.visitNotFound en ${lang}`
        );
      }
    });
  }

  test('ninguna pantalla trae ya su propia traducción a mano (lang === "en" ? … : …)', () => {
    // El texto en inglés no debe aparecer cuando el panel está en español,
    // ni al revés: eso pasaría si alguien vuelve a dejar el literal fijo.
    for (const [name, render] of SCREENS) {
      const es = render(ctx('es'));
      const en = render(ctx('en'));
      assert.ok(!es.includes('Visit not found'), `${name} filtra el literal inglés estando en español`);
      assert.ok(!en.includes('Visita no encontrada'), `${name} filtra el literal español estando en inglés`);
    }
  });

  test('ninguna pinta el formulario de captura de una visita que no existe', () => {
    for (const [name, render] of SCREENS) {
      const html = render(ctx('es'));
      assert.doesNotMatch(html, /<form/, `${name} pinta un formulario para una visita inexistente`);
    }
  });
});
