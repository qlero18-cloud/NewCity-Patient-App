// Etapa F — la pantalla neutra, por fin probada.
//
// Es la mitad visible de INV-3: el paciente no debe poder distinguir "este
// token nunca existió" de "esta visita venció" de "no hay señal y no había
// nada guardado". El servidor cumple su parte con un único 404
// (visitHandler.js) y resolveVisitContext la suya devolviendo null en los
// tres casos (test/ui/visitSource.test.js). Lo que NADIE probaba era el
// último tramo: lo que se pinta cuando llega ese null.
//
// Vivía dentro de boot() en src/ui/app.js, escribiendo innerHTML, así que
// no había forma de mirarla sin DOM. Movida a una función pura que
// devuelve HTML, es el mismo patrón de todas las demás pantallas de este
// proyecto y se prueba igual: por substring.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderNeutralScreen, renderLoadingScreen } from '../../src/ui/screens/neutral.js';
import { STRINGS, SUPPORTED_LANGS } from '../../src/ui/i18n.js';

describe('renderNeutralScreen', () => {
  for (const lang of SUPPORTED_LANGS) {
    test(`muestra título y cuerpo en ${lang}`, () => {
      const html = renderNeutralScreen(lang);
      assert.ok(html.includes(STRINGS[lang].common.neutralTitle), 'falta el título');
      assert.ok(html.includes(STRINGS[lang].common.neutralBody), 'falta el cuerpo');
    });
  }

  test('usa las clases que theme.js ya define', () => {
    // .nc-neutral y sus dos hijos viven en THEME_CSS desde la fase 05. Si
    // esta pantalla se renombra las clases sin tocar el tema, el texto
    // sigue ahí pero sin centrar ni espaciar — se ve como una página rota.
    const html = renderNeutralScreen('es');
    assert.match(html, /class="nc-neutral"/);
    assert.match(html, /class="nc-neutral-title"/);
    assert.match(html, /class="nc-neutral-body"/);
  });

  test('no filtra NADA de la visita: ni token, ni nombre, ni fecha', () => {
    // La razón de ser de esta pantalla. No recibe la visita —no puede
    // filtrarla— y esta prueba fija que la firma siga siendo esa: el día
    // que alguien le pase el expediente "para dar un mensaje mejor", esto
    // falla.
    assert.strictEqual(renderNeutralScreen.length, 1, 'solo debe recibir el idioma');
  });

  test('es idéntica letra por letra para cualquier motivo: no hay motivo que pasarle', () => {
    // INV-3 en una línea. Con un solo argumento, "no existe" y "venció"
    // producen exactamente el mismo HTML porque no hay forma de que no lo
    // hagan.
    assert.strictEqual(renderNeutralScreen('es'), renderNeutralScreen('es'));
  });

  test('escapa el texto traducido', () => {
    // Hoy ninguna de las dos cadenas trae `<`, pero sí trae una comilla
    // tipográfica en inglés ("isn't available"); el día que una traducción
    // traiga un signo de los que sí importan, ya está cubierto.
    assert.ok(!renderNeutralScreen('en').includes('<script'));
  });
});

describe('renderLoadingScreen', () => {
  for (const lang of SUPPORTED_LANGS) {
    test(`muestra "cargando" en ${lang}`, () => {
      assert.ok(renderLoadingScreen(lang).includes(STRINGS[lang].common.loading));
    });
  }

  test('reusa las clases de la neutra en vez de traer estilos propios', () => {
    assert.match(renderLoadingScreen('es'), /class="nc-neutral"/);
  });

  test('no dice ni "no disponible" ni nada parecido: todavía no se sabe', () => {
    // Pintar el mensaje neutro mientras la red contesta le diría al
    // paciente que su enlace no sirve un segundo antes de mostrarle su
    // itinerario. Son dos pantallas distintas a propósito.
    const html = renderLoadingScreen('es');
    assert.ok(!html.includes(STRINGS.es.common.neutralTitle));
    assert.ok(!html.includes(STRINGS.es.common.neutralBody));
  });
});
