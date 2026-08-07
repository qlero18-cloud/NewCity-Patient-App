// Fase 09 (D29) — pruebas de renderQpassScreen: emisión de QPASS
// format:'image' (la coordinadora sube una imagen ya existente del pase,
// no un payload corto para qr.js/code128.js — ver "Emisión de QPASS:
// imagen subida por el coordinador" en docs/phases/phase-09-coordinator-
// demo.md). Mismo patrón que test/ui/plaza.test.js y test/ui/tabs.test.js:
// este proyecto no trae un DOM falso para node:test (nota al inicio de
// plaza.test.js), así que lo que se prueba aquí es el HTML que devuelve
// renderQpassScreen(ctx) — aserciones de substring, nunca un clic real ni
// una carga de archivo real (FileReader no existe en este entorno; eso se
// revisa en el navegador).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderQpassScreen } from '../../../src/ui/screens/coordinator/qpass.js';
import { createCoordinatorStore } from '../../../src/ui/coordinatorStore.js';
import { translate } from '../../../src/ui/i18n.js';

const NOW = '2026-03-10T10:00-07:00';

function ctx(lang, store, visitId) {
  return { store, visitId, lang, t: (path) => translate(lang, path) };
}

function issueImagePass(store, visitId = 'v_demo1') {
  return store.issueQpass(visitId, { format: 'image', payload: 'data:image/png;base64,AAAA', scope: 'torre' }, NOW);
}

describe('renderQpassScreen — título, en los dos idiomas, antes y después de emitir', () => {
  test('coordinator.qpass.title aparece siempre, sin importar el estado', () => {
    for (const lang of ['es', 'en']) {
      const store = createCoordinatorStore();
      assert.ok(renderQpassScreen(ctx(lang, store, 'v_demo1')).includes(translate(lang, 'coordinator.qpass.title')));

      issueImagePass(store);
      assert.ok(renderQpassScreen(ctx(lang, store, 'v_demo1')).includes(translate(lang, 'coordinator.qpass.title')));
    }
  });
});

describe('renderQpassScreen — formulario de carga (todavía sin QPass format:"image" emitido)', () => {
  test('trae el input de archivo con accept="image/*" y data-role="qpass-image-input"', () => {
    for (const lang of ['es', 'en']) {
      const store = createCoordinatorStore();
      const html = renderQpassScreen(ctx(lang, store, 'v_demo1'));
      assert.match(html, /<input[^>]*type="file"[^>]*>/, 'falta <input type="file">');
      assert.match(html, /data-role="qpass-image-input"/);
      assert.match(html, /accept="image\/\*"/);
    }
  });

  test('el select de alcance trae data-role="qpass-scope-select" y las tres opciones de pass.scope.*, traducidas en los dos idiomas', () => {
    for (const lang of ['es', 'en']) {
      const store = createCoordinatorStore();
      const html = renderQpassScreen(ctx(lang, store, 'v_demo1'));
      assert.match(html, /data-role="qpass-scope-select"/);
      for (const scope of ['torre', 'piso27', 'estacionamiento']) {
        assert.match(html, new RegExp(`<option value="${scope}"`), `falta <option value="${scope}">`);
        assert.ok(html.includes(translate(lang, `pass.scope.${scope}`)), `falta el texto traducido de pass.scope.${scope} en ${lang}`);
      }
    }
  });

  test('el botón "Emitir" trae data-role="issue-qpass" y el atributo disabled antes de subir imagen', () => {
    const store = createCoordinatorStore();
    const html = renderQpassScreen(ctx('es', store, 'v_demo1'));
    assert.match(html, /data-role="issue-qpass"[^>]*disabled/, 'el botón de emitir debería venir disabled sin imagen subida');
    assert.ok(html.includes(translate('es', 'coordinator.qpass.issue')));
  });

  test('la vista previa (data-role="qpass-preview") muestra coordinator.qpass.noImage antes de subir nada', () => {
    for (const lang of ['es', 'en']) {
      const store = createCoordinatorStore();
      const html = renderQpassScreen(ctx(lang, store, 'v_demo1'));
      assert.match(html, /data-role="qpass-preview"/);
      assert.ok(html.includes(translate(lang, 'coordinator.qpass.noImage')));
      assert.ok(!html.includes('<img'), 'no debería haber ninguna <img> antes de subir una imagen');
    }
  });

  test('no muestra el distintivo de emitido ni el control data-nav="pass-preview" antes de emitir', () => {
    const store = createCoordinatorStore();
    const html = renderQpassScreen(ctx('es', store, 'v_demo1'));
    assert.ok(!html.includes(translate('es', 'coordinator.qpass.issuedBadge')));
    assert.ok(!html.includes('data-nav="pass-preview"'));
  });

  test('un QPass qr/code128 ya existente en las fixtures (v_demo1 trae q1/q2) NO cuenta como "emitido" para este flujo', () => {
    // v_demo1 en src/data/fixtures.js ya trae pases qr/code128 (q1, q2) —
    // el estado "emitido" de ESTA pantalla es específico a format:'image'
    // (D29), no "la visita ya tiene algún QPass".
    const store = createCoordinatorStore();
    const html = renderQpassScreen(ctx('es', store, 'v_demo1'));
    assert.ok(html.includes('data-role="qpass-image-input"'), 'debería seguir mostrando el formulario de carga');
    assert.ok(!html.includes(translate('es', 'coordinator.qpass.issuedBadge')));
  });
});

describe('renderQpassScreen — después de emitir (store.issueQpass ya llamado directamente sobre el store)', () => {
  test('muestra coordinator.qpass.issuedBadge y un control data-nav="pass-preview" con coordinator.qpass.viewAsPatient, ya no el formulario de carga', () => {
    for (const lang of ['es', 'en']) {
      const store = createCoordinatorStore();
      issueImagePass(store);
      const html = renderQpassScreen(ctx(lang, store, 'v_demo1'));

      assert.ok(html.includes(translate(lang, 'coordinator.qpass.issuedBadge')));
      assert.match(html, /data-nav="pass-preview"/);
      assert.ok(html.includes(translate(lang, 'coordinator.qpass.viewAsPatient')));

      // el formulario de carga ya no está
      assert.ok(!html.includes('data-role="qpass-image-input"'));
      assert.ok(!html.includes('data-role="qpass-scope-select"'));
      assert.ok(!html.includes('data-role="qpass-preview"'));
      assert.ok(!html.includes('data-role="issue-qpass"'));
    }
  });
});

describe('renderQpassScreen — convención data-nav (D28: nunca data-tab/data-route/data-target)', () => {
  test('el formulario de carga (antes de emitir) no usa data-tab/data-route/data-target', () => {
    const store = createCoordinatorStore();
    const html = renderQpassScreen(ctx('es', store, 'v_demo1'));
    assert.doesNotMatch(html, /data-tab=/);
    assert.doesNotMatch(html, /data-route=/);
    assert.doesNotMatch(html, /data-target=/);
  });

  test('la vista de emitido tampoco usa data-tab/data-route/data-target — solo data-nav="pass-preview"', () => {
    const store = createCoordinatorStore();
    issueImagePass(store);
    const html = renderQpassScreen(ctx('es', store, 'v_demo1'));
    assert.doesNotMatch(html, /data-tab=/);
    assert.doesNotMatch(html, /data-route=/);
    assert.doesNotMatch(html, /data-target=/);
    assert.match(html, /data-nav="pass-preview"/);
  });
});

describe('renderQpassScreen — visita inexistente (guardia defensiva, store.getVisit -> null)', () => {
  test('no revienta, no muestra el formulario de carga ni el estado emitido', () => {
    const store = createCoordinatorStore();
    const html = renderQpassScreen(ctx('es', store, 'no-existe'));
    assert.ok(html.includes('<section class="nc-screen'));
    assert.ok(html.includes(translate('es', 'coordinator.qpass.title')));
    assert.ok(!html.includes('data-role="qpass-image-input"'));
    assert.ok(!html.includes('data-nav="pass-preview"'));
  });
});
