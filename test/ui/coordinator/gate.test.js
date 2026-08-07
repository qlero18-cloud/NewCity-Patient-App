// Etapa D — los tres estados que el panel puede tener ANTES de poder
// pintar una pantalla: verificando la sesión, esperando datos, o sin haber
// podido traerlos.
//
// Antes ninguno existía: el store era una copia en memoria de las
// fixtures, así que siempre había datos que pintar desde el primer
// milisegundo. Con la API de por medio hay un hueco entre abrir el panel y
// tener el expediente, y ese hueco no puede verse como "esta visita no
// tiene citas" — que es exactamente lo que se vería si se pintara la
// pantalla vacía mientras llega la respuesta.
//
// Se prueba aquí, y no dentro de boot(), porque boot() vive cerrado sobre
// document/location: sin DOM falso no se puede llamar. Misma razón por la
// que renderVisitSubnav y renderCoordinatorHeader también son piezas puras
// exportadas (test/ui/coordinator/subnav.test.js, header.test.js).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderCoordinatorGate } from '../../../src/ui/coordinatorApp.js';
import { translate } from '../../../src/ui/i18n.js';

const t = (lang) => (path) => translate(lang, path);

describe('renderCoordinatorGate', () => {
  for (const lang of ['es', 'en']) {
    test(`verificando sesión se anuncia, en ${lang}`, () => {
      const html = renderCoordinatorGate({ kind: 'checking' }, t(lang));
      assert.ok(html.includes(translate(lang, 'coordinator.auth.checking')));
    });

    test(`esperando datos se anuncia, en ${lang}`, () => {
      const html = renderCoordinatorGate({ kind: 'loading' }, t(lang));
      assert.ok(html.includes(translate(lang, 'coordinator.loading')));
    });
  }

  // role="status" y no role="alert": "cargando" no es una alerta, y
  // anunciarlo como tal interrumpe lo que el lector de pantalla esté
  // diciendo. aria-live sí hace falta — el texto aparece sin que nadie
  // mueva el foco.
  test('los estados de espera se anuncian como status, no como alerta', () => {
    for (const kind of ['checking', 'loading']) {
      assert.match(renderCoordinatorGate({ kind }, t('es')), /role="status"/, kind);
      assert.doesNotMatch(renderCoordinatorGate({ kind }, t('es')), /role="alert"/, kind);
    }
  });

  test('un fallo de carga dice qué pasó y ofrece reintentar', () => {
    const html = renderCoordinatorGate({ kind: 'error', code: 'network' }, t('es'));
    assert.ok(html.includes(translate('es', 'coordinator.error.network')), 'falta el motivo');
    assert.match(html, /data-role="retry"/, 'falta el botón de reintentar');
    assert.match(html, /role="alert"/, 'un fallo sí debe anunciarse como alerta');
  });

  // Reintentar una visita que ya no existe no la va a resucitar. Ofrecer el
  // botón invita a picarle diez veces contra un 404.
  test('una visita que ya no existe NO ofrece reintentar', () => {
    const html = renderCoordinatorGate({ kind: 'error', code: 'gone' }, t('es'));
    assert.ok(html.includes(translate('es', 'coordinator.error.gone')));
    assert.doesNotMatch(html, /data-role="retry"/);
  });

  test('un código desconocido no truena', () => {
    assert.doesNotThrow(() => renderCoordinatorGate({ kind: 'error', code: 'sabrá' }, t('es')));
  });
});
