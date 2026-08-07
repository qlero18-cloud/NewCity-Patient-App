// Etapa A — encabezado del panel de coordinadores. Cubre tres hallazgos de
// la revisión (#1 sin selector de idioma, #20 "volver a visitas" muerto,
// #13 etiquetas accesibles fijas en español).
//
// renderCoordinatorHeader(route, t) se extrae de boot() por la misma razón
// exacta que ya se extrajo renderVisitSubnav en la fase 09: render() vive
// dentro de boot(), cerrado sobre document/location reales y sin exportar,
// y este proyecto no trae un DOM falso para node:test (ver la nota de
// test/ui/plaza.test.js). La pieza pura sí se puede probar por substring;
// que boot() la inserte y que el clic del toggle de verdad repinte se
// revisa en navegador, como el resto del chrome de este panel.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderCoordinatorHeader } from '../../../src/ui/coordinatorApp.js';
import { translate } from '../../../src/ui/i18n.js';

function t(lang) {
  return (path) => translate(lang, path);
}

describe('renderCoordinatorHeader — selector de idioma (Etapa A, #1)', () => {
  test('trae un botón de idioma en las dos lenguas, con la etiqueta del OTRO idioma', () => {
    for (const lang of ['es', 'en']) {
      const html = renderCoordinatorHeader('visits', t(lang));
      assert.ok(
        html.includes('data-role="lang-toggle"'),
        `falta el botón de idioma en ${lang} — sin él el panel se queda en el idioma que resolvió el navegador`
      );
      assert.ok(
        html.includes(translate(lang, 'common.langToggle')),
        `el botón de idioma no muestra common.langToggle en ${lang}`
      );
    }
  });

  test('reutiliza common.langToggle, la MISMA llave que ya usa el lado paciente (src/ui/app.js), sin cadena nueva', () => {
    // Si alguien inventa una llave propia para el panel, esto lo detecta:
    // el texto del botón tiene que ser exactamente el de common.langToggle.
    assert.strictEqual(translate('es', 'common.langToggle'), 'English');
    assert.strictEqual(translate('en', 'common.langToggle'), 'Español');
  });
});

describe('renderCoordinatorHeader — "volver a visitas" (Etapa A, #20)', () => {
  test('NO aparece estando ya en visits: ahí el clic no navega a ningún lado', () => {
    const html = renderCoordinatorHeader('visits', t('es'));
    assert.ok(
      !html.includes('data-nav="visits"'),
      'el botón "volver a visitas" no debería pintarse en la propia pantalla de visitas (era un control muerto)'
    );
  });

  test('sí aparece en las demás rutas, que es donde de verdad lleva a otro lado', () => {
    for (const route of ['intake', 'itinerary', 'lodging', 'qpass', 'pass-preview']) {
      const html = renderCoordinatorHeader(route, t('es'), { user: { displayName: 'Ana Ruiz' } });
      assert.ok(
        html.includes('data-nav="visits"'),
        `falta "volver a visitas" en la ruta ${route}`
      );
    }
  });

  // Encontrado en navegador, no por los tests: al darle a Salir estando en
  // #/qpass, la pantalla de acceso queda con "Volver a visitas" en el
  // encabezado. El clic cambia el hash y vuelve a pintar... la misma
  // pantalla de acceso, porque sin sesión no hay ruta que valga. Es
  // exactamente el control muerto del #20, reaparecido por la puerta de la
  // Etapa C: el encabezado se pinta igual con sesión y sin ella.
  test('sin sesión NO aparece en ninguna ruta: desde la pantalla de acceso tampoco lleva a ningún lado', () => {
    for (const route of ['intake', 'itinerary', 'lodging', 'qpass', 'pass-preview']) {
      const html = renderCoordinatorHeader(route, t('es'));
      assert.ok(
        !html.includes('data-nav="visits"'),
        `"volver a visitas" pintado sin sesión en la ruta ${route} — ahí el clic no navega a ningún lado`
      );
    }
  });
});

describe('renderCoordinatorHeader — sesión (Etapa D)', () => {
  // Sin esto no hay forma de terminar una sesión. La máquina de
  // coordinación se comparte, y la cookie dura un turno de ocho horas
  // (sessions.js): quien se siente después queda firmando el expediente
  // con la cuenta de quien se levantó.
  test('con sesión abierta, muestra quién es y ofrece salir', () => {
    for (const lang of ['es', 'en']) {
      const html = renderCoordinatorHeader('visits', t(lang), { user: { username: 'ana.ruiz', displayName: 'Ana Ruiz' } });
      assert.ok(html.includes('Ana Ruiz'), `falta el nombre de quien está dentro en ${lang}`);
      assert.match(html, /data-role="sign-out"/, `falta el botón de salir en ${lang}`);
      assert.ok(html.includes(translate(lang, 'coordinator.auth.signOut')), `el botón de salir no usa la llave i18n en ${lang}`);
    }
  });

  test('sin sesión no ofrece salir — el encabezado de la pantalla de acceso no lleva ese botón', () => {
    const html = renderCoordinatorHeader('visits', t('es'));
    assert.doesNotMatch(html, /data-role="sign-out"/);
  });

  test('el nombre de quien está dentro se escapa', () => {
    const html = renderCoordinatorHeader('visits', t('es'), { user: { displayName: '<img src=x onerror=alert(1)>' } });
    assert.ok(!html.includes('<img'));
  });
});

describe('renderCoordinatorHeader — texto traducido (Etapa A, #13/#14)', () => {
  test('el nombre de la app y el botón de volver salen de i18n en los dos idiomas', () => {
    for (const lang of ['es', 'en']) {
      const html = renderCoordinatorHeader('itinerary', t(lang), { user: { displayName: 'Ana Ruiz' } });
      assert.ok(html.includes(translate(lang, 'coordinator.appName')), `falta appName en ${lang}`);
      assert.ok(html.includes(translate(lang, 'coordinator.backToVisits')), `falta backToVisits en ${lang}`);
    }
  });

  test('ninguna etiqueta accesible queda fija en español cuando el panel está en inglés', () => {
    const html = renderCoordinatorHeader('itinerary', t('en'));
    const ariaLabels = [...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]);
    for (const label of ariaLabels) {
      assert.ok(
        !/Navegación|Idioma|Volver/.test(label),
        `aria-label en español dentro del panel en inglés: "${label}"`
      );
    }
  });
});
