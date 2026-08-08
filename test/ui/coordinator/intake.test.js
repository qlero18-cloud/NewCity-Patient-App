// Fase 09 — Alta de visita (docs/phases/phase-09-coordinator-demo.md).
// Mismo patrón que test/ui/plaza.test.js y test/ui/tabs.test.js: este
// proyecto no trae un DOM falso para node:test, así que lo automatizado
// aquí son aserciones de substring sobre el HTML que devuelve
// renderIntakeScreen(ctx) — el envío real del formulario (FormData, click
// real) se revisa en navegador, no aquí. El único aspecto de
// attachIntakeScreen que sí se prueba sin DOM real es que no truene con
// un rootEl mínimo (querySelector no-op), mismo criterio defensivo que ya
// usa este proyecto (optional chaining alrededor de addEventListener, ver
// attachStayScreen en src/ui/screens/stay.js).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderIntakeScreen, attachIntakeScreen } from '../../../src/ui/screens/coordinator/intake.js';
import { translate } from '../../../src/ui/i18n.js';

function ctx(lang) {
  return { t: (path) => translate(lang, path) };
}

describe('renderIntakeScreen — formulario de alta de visita', () => {
  test('título, los cuatro campos etiquetados y el botón de guardar aparecen, en los dos idiomas', () => {
    for (const lang of ['es', 'en']) {
      const html = renderIntakeScreen(ctx(lang));
      assert.ok(html.includes(translate(lang, 'coordinator.intake.title')), `falta el título en ${lang}`);
      assert.ok(html.includes(translate(lang, 'coordinator.intake.firstNameLabel')), `falta firstNameLabel en ${lang}`);
      assert.ok(html.includes(translate(lang, 'coordinator.intake.langLabel')), `falta langLabel en ${lang}`);
      assert.ok(html.includes(translate(lang, 'coordinator.intake.startsAtLabel')), `falta startsAtLabel en ${lang}`);
      assert.ok(html.includes(translate(lang, 'coordinator.intake.endsAtLabel')), `falta endsAtLabel en ${lang}`);
      assert.ok(html.includes(translate(lang, 'coordinator.intake.save')), `falta el botón de guardar en ${lang}`);
    }
  });

  test('trae <form data-role="intake-form"> con los cuatro campos por su atributo name', () => {
    const html = renderIntakeScreen(ctx('es'));
    assert.match(html, /<form[^>]*data-role="intake-form"/);
    assert.match(html, /name="patientFirstName"/);
    assert.match(html, /name="lang"/);
    assert.match(html, /name="startsAt"/);
    assert.match(html, /name="endsAt"/);
  });

  test('el campo lang es un <select> con opciones es/en', () => {
    const html = renderIntakeScreen(ctx('es'));
    assert.match(html, /<select[^>]*name="lang"[\s\S]*?<\/select>/);
    assert.match(html, /<option value="es">/);
    assert.match(html, /<option value="en">/);
  });

  test('el botón de guardar es type="submit" dentro del form', () => {
    const html = renderIntakeScreen(ctx('es'));
    assert.match(html, /type="submit"/);
  });

  test('no usa data-tab ni data-route (D28) — esta pantalla no navega por sí misma', () => {
    const html = renderIntakeScreen(ctx('es'));
    assert.doesNotMatch(html, /data-tab=/);
    assert.doesNotMatch(html, /data-route=/);
  });

  test('raíz <section class="nc-screen"> con <h1 class="nc-screen-title">, mismo patrón que las demás pantallas', () => {
    const html = renderIntakeScreen(ctx('es'));
    assert.match(html, /<section class="nc-screen">/);
    assert.match(html, /<h1 class="nc-screen-title">/);
  });
});

describe('attachIntakeScreen — cableado defensivo sin DOM real', () => {
  test('no truena con un rootEl mínimo (querySelector no-op) y sin ctx', () => {
    const rootEl = { querySelector: () => null };
    assert.doesNotThrow(() => attachIntakeScreen(rootEl, {}));
  });

  test('no truena si ctx no trae store ni onCreated', () => {
    const rootEl = { querySelector: () => null };
    assert.doesNotThrow(() => attachIntakeScreen(rootEl, { store: undefined, onCreated: undefined }));
  });
});

describe('renderIntakeScreen — idioma del paciente sin códigos crudos (Etapa A, #14)', () => {
  test('las opciones muestran el nombre del idioma, no "es"/"en" en pantalla', () => {
    for (const lang of ['es', 'en']) {
      const html = renderIntakeScreen(ctx(lang));
      assert.doesNotMatch(
        html,
        /<option value="es">\s*es\s*<\/option>/,
        `la opción "es" sigue mostrando el código crudo en ${lang}`
      );
      assert.doesNotMatch(
        html,
        /<option value="en">\s*en\s*<\/option>/,
        `la opción "en" sigue mostrando el código crudo en ${lang}`
      );
    }
  });

  test('el value sigue siendo el código (lo que guarda la store), solo cambia lo que se lee', () => {
    const html = renderIntakeScreen(ctx('es'));
    assert.match(html, /<option value="es">/, 'el value de la opción española debe seguir siendo "es"');
    assert.match(html, /<option value="en">/, 'el value de la opción inglesa debe seguir siendo "en"');
  });

  test('el nombre de cada idioma se muestra en ese idioma (endónimo), igual en los dos idiomas de la interfaz', () => {
    // Un selector de idioma se lee mejor con el endónimo: quien busca
    // "Español" lo reconoce aunque el panel esté en inglés. Por eso
    // common.langName.* es idéntico en es y en, a propósito.
    for (const lang of ['es', 'en']) {
      const html = renderIntakeScreen(ctx(lang));
      assert.ok(html.includes(translate(lang, 'common.langName.es')), `falta el nombre del español en ${lang}`);
      assert.ok(html.includes(translate(lang, 'common.langName.en')), `falta el nombre del inglés en ${lang}`);
    }
    assert.strictEqual(translate('es', 'common.langName.es'), translate('en', 'common.langName.es'));
    assert.strictEqual(translate('es', 'common.langName.en'), translate('en', 'common.langName.en'));
  });
});

// Etapa H (D75) — las dos fechas de la visita dejan de ser texto libre. Aquí
// son <input type="date"> y no datetime-local: "del 10 al 12 de marzo" es un
// dato de días, y ninguna pantalla del paciente muestra una hora sacada de
// visit.startsAt/endsAt (solo las usa el panel, y ahora la ventana min/max
// de citas y hospedaje).
describe('renderIntakeScreen — las fechas se capturan con el control nativo', () => {
  test('inicio y fin de la visita son <input type="date">', () => {
    const html = renderIntakeScreen(ctx('es'));
    assert.match(html, /<input[^>]*type="date"[^>]*name="startsAt"|<input[^>]*name="startsAt"[^>]*type="date"/);
    assert.match(html, /<input[^>]*type="date"[^>]*name="endsAt"|<input[^>]*name="endsAt"[^>]*type="date"/);
  });

  test('ninguna de las dos sigue siendo type="text"', () => {
    const html = renderIntakeScreen(ctx('es'));
    for (const name of ['startsAt', 'endsAt']) {
      const campo = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? '';
      assert.doesNotMatch(campo, /type="text"/, `${name} sigue siendo texto libre`);
    }
  });

  // El placeholder con un ISO de ejemplo era la muleta de un campo de texto:
  // decía cómo teclear lo que ya no se teclea. Dejarlo puesto sobre un
  // control nativo solo estorba (los navegadores lo ignoran o lo pintan
  // encima de su propio formato).
  test('ya no quedan placeholders con ISO de ejemplo', () => {
    const html = renderIntakeScreen(ctx('es'));
    assert.doesNotMatch(html, /placeholder="20\d\d-/);
  });
});
