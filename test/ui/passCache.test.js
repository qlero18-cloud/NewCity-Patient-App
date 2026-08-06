// Fase 06 — pruebas de passCache. node:test no trae localStorage (es una
// API de navegador) — se define un doble en memoria antes de usar el
// módulo. savePassCache/loadPassCache no se llaman a nivel de módulo, así
// que definir el doble aquí (después de los imports, antes de los tests)
// es suficiente.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { savePassCache, loadPassCache, getCachedVisiblePasses } from '../../src/ui/passCache.js';

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

function pass(id, scope, options = {}) {
  return {
    id,
    visitId: 'v_test',
    appointmentId: null,
    format: 'qr',
    payload: `payload-${id}`,
    scope,
    validFrom: options.validFrom ?? '2026-03-10T06:00-07:00',
    validUntil: options.validUntil ?? null,
    revokedAt: options.revokedAt ?? null,
    issuedAt: '2026-03-10T06:00-07:00',
  };
}

beforeEach(() => {
  globalThis.localStorage.clear();
});

describe('savePassCache / loadPassCache — redondeo básico', () => {
  test('guarda y recupera exactamente lo mismo, incluyendo validUntil: null', () => {
    const passes = [pass('q1', 'torre'), pass('q2', 'estacionamiento', { validUntil: '2026-03-20T00:00-07:00' })];
    savePassCache('v_test', passes, '2026-03-10T10:00-07:00');
    const loaded = loadPassCache('v_test');
    assert.deepStrictEqual(loaded.passes, passes);
    assert.strictEqual(loaded.passes[0].validUntil, null, 'validUntil: null debe sobrevivir el viaje por JSON, no volverse undefined ni desaparecer');
    assert.strictEqual(loaded.savedAt, '2026-03-10T10:00-07:00');
  });

  test('sin nada guardado, devuelve null (no lanza excepción)', () => {
    assert.strictEqual(loadPassCache('v_nunca_guardada'), null);
  });

  test('JSON corrupto en localStorage se trata como "sin caché", no rompe la pantalla', () => {
    globalThis.localStorage.setItem('nc_pass_cache:v_test', '{esto no es json valido');
    assert.strictEqual(loadPassCache('v_test'), null);
  });

  test('un valor bien formado pero sin la forma esperada (sin passes[]) también se trata como sin caché', () => {
    globalThis.localStorage.setItem('nc_pass_cache:v_test', JSON.stringify({ algo: 'distinto' }));
    assert.strictEqual(loadPassCache('v_test'), null);
  });
});

describe('getCachedVisiblePasses — vuelve a evaluar R3 con el now de ahora, no con el guardado (INV-4)', () => {
  test('un pase con validUntil: null sigue visible aunque hayan pasado 7 días desde que se guardó — "el fallo más caro" que pide probar la fase', () => {
    const passes = [pass('q1', 'torre')]; // validUntil: null por defecto
    savePassCache('v_test', passes, '2026-03-10T10:00-07:00');
    const sevenDaysLater = '2026-03-17T10:00-07:00';
    const result = getCachedVisiblePasses('v_test', sevenDaysLater);
    assert.strictEqual(result.passes.length, 1);
    assert.strictEqual(result.passes[0].id, 'q1');
  });

  test('un pase revocado nunca se muestra desde caché, aunque no haya conexión para refrescarlo (INV-4, caso 3b)', () => {
    const passes = [pass('q1', 'torre', { revokedAt: '2026-03-10T12:00-07:00' })];
    savePassCache('v_test', passes, '2026-03-10T10:00-07:00'); // se guarda ANTES de la revocación
    const result = getCachedVisiblePasses('v_test', '2026-03-10T14:00-07:00'); // se evalúa DESPUÉS
    assert.deepStrictEqual(result.passes, []);
  });

  test('un pase con validUntil pasado ya no se muestra desde caché', () => {
    const passes = [pass('q1', 'torre', { validUntil: '2026-03-11T00:00-07:00' })];
    savePassCache('v_test', passes, '2026-03-10T10:00-07:00');
    const result = getCachedVisiblePasses('v_test', '2026-03-12T00:00-07:00');
    assert.deepStrictEqual(result.passes, []);
  });

  test('sin caché guardada, devuelve null (para que la pantalla distinga "sin caché" de "caché vacía")', () => {
    assert.strictEqual(getCachedVisiblePasses('v_jamas_visitada', '2026-03-10T10:00-07:00'), null);
  });

  test('dos pases válidos a la vez conviven en la caché, en el mismo orden que R3 (torre → piso27 → estacionamiento)', () => {
    const passes = [pass('qb', 'estacionamiento'), pass('qa', 'torre')];
    savePassCache('v_test', passes, '2026-03-10T10:00-07:00');
    const result = getCachedVisiblePasses('v_test', '2026-03-10T11:00-07:00');
    assert.deepStrictEqual(result.passes.map((p) => p.id), ['qa', 'qb']);
  });
});
