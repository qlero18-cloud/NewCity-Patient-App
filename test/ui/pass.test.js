// Fase 09 — prueba de src/ui/screens/pass.js: SOLO la bandera nueva
// ctx.ephemeral, no el resto de la pantalla.
//
// Departure explícita y documentada de la disciplina que este archivo trae
// desde fase 06 (ver su propio encabezado: pass.js nunca tuvo una prueba
// automatizada dedicada — "revisión en navegador" era el plan original, y
// sigue siendo el plan para el resto de su comportamiento: símbolo, wake
// lock, navegación entre pases). Esta única excepción se abre aquí porque:
//   1. Es cableado de una bandera booleana — exactamente el tipo de caso
//      que este mismo proyecto ya usó para justificar test/ui/nav.test.js
//      como excepción a "solo se prueba HTML por substring".
//   2. Corrige un bug real que ya pasó una revisión manual sin que nadie lo
//      viera: abrir #/pass-preview desde el panel de coordinadores (D29,
//      fase 09) escribía en localStorage el payload real de una visita
//      ajena, violando la promesa explícita del doc de esa fase
//      ("nunca... localStorage"). Se encontró solo porque un agente
//      ejecutó el código de verdad en vez de solo leerlo — motivo de más
//      para que quede una prueba automatizada, no otra revisión manual que
//      se puede volver a pasar por alto.
//
// Mismos dobles mínimos que el resto del proyecto, nunca una librería de
// DOM: localStorage en memoria (idéntico criterio a test/ui/passCache.
// test.js) y un mount/root con solo querySelector/innerHTML — lo único que
// attachPassScreen de verdad toca en el árbol.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { attachPassScreen } from '../../src/ui/screens/pass.js';
import { loadPassCache } from '../../src/ui/passCache.js';
import { translate } from '../../src/ui/i18n.js';

function makeFakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}
globalThis.localStorage = makeFakeLocalStorage();
// requestWakeLock() (pass.js) hace `'wakeLock' in navigator` en cuanto se
// llama attachPassScreen. Sin doble propio: Node ya trae un global
// `navigator` de solo lectura (sin wakeLock, confirmado con `node -e
// "console.log('wakeLock' in navigator)"` → false) — intentar
// reasignarlo con `globalThis.navigator = {}` truena
// (TypeError: Cannot set property navigator, es un getter). El de Node ya
// hace exactamente lo que esta prueba necesita: 'wakeLock' in navigator da
// false, requestWakeLock regresa de inmediato sin tocar nada más.

// Doble mínimo de rootEl/mount: attachPassScreen solo hace
// rootEl.querySelector('[data-role="pass-mount"]') una vez, y sobre ese
// mount: innerHTML = (asignación) y querySelector('[data-role="pass-
// prev|next"]') (con ?. — null es una respuesta válida, sin botones de
// navegación que cablear aquí).
function fakeMount() {
  return {
    innerHTML: '',
    querySelector() {
      return null;
    },
  };
}
function fakeRoot(mount) {
  return {
    querySelector(selector) {
      return selector === '[data-role="pass-mount"]' ? mount : null;
    },
  };
}

const NOW = '2026-03-10T10:00-07:00';
const t = (path) => translate('es', path);

// format:'qr' a propósito, no 'image': 'image' ya queda fuera del caché
// sin importar ephemeral (ver el comentario de pass.js junto a
// savePassCache) — usar 'qr' aquí es lo único que aísla el efecto real de
// ephemeral, sin mezclarlo con esa otra exclusión ya existente.
function visiblePass(id) {
  return {
    id,
    visitId: 'v_test',
    appointmentId: null,
    format: 'qr',
    payload: `demo-payload-${id}`,
    scope: 'torre',
    validFrom: '2026-03-10T06:00-07:00',
    validUntil: null,
    revokedAt: null,
    issuedAt: '2026-03-10T06:00-07:00',
  };
}

beforeEach(() => {
  globalThis.localStorage.clear();
});

describe('attachPassScreen — ctx.ephemeral (fase 09, D29: #/pass-preview del panel de coordinadores)', () => {
  test('comportamiento por default (sin ephemeral en ctx) sigue guardando en caché, igual que fase 06', () => {
    const ctx = { visit: { id: 'v_test' }, passes: [visiblePass('q1')], now: NOW, lang: 'es', t };
    attachPassScreen(fakeRoot(fakeMount()), ctx);
    assert.notStrictEqual(
      loadPassCache('v_test'),
      null,
      'sin ephemeral, attachPassScreen debe seguir cacheando — el comportamiento de fase 06 para la sesión real del paciente no debe cambiar'
    );
  });

  test('ephemeral: true suprime por completo el guardado en localStorage', () => {
    const ctx = { visit: { id: 'v_test' }, passes: [visiblePass('q1')], now: NOW, lang: 'es', t, ephemeral: true };
    attachPassScreen(fakeRoot(fakeMount()), ctx);
    assert.strictEqual(
      loadPassCache('v_test'),
      null,
      'ephemeral: true no debe escribir nada en localStorage — #/pass-preview del coordinador es una vista previa de una visita ajena, no la sesión real del paciente'
    );
  });
});
