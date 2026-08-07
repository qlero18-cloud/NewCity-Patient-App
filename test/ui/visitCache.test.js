// Etapa E — la caché del expediente completo. Hermana de passCache.js pero
// resuelve otro problema: passCache mantiene vivo el SÍMBOLO del pase sin
// señal; esta mantiene viva la APERTURA de la app. Sin ella, el paciente
// que llega al estacionamiento con una barra de señal ve la pantalla
// neutra —la misma que vería con un token inventado— y no tiene forma de
// saber que su visita sigue existiendo.
//
// Se guarda por TOKEN y no por visitId a propósito: cuando se decide si
// hay caché todavía no se conoce el id (viene dentro del expediente que se
// está intentando traer).
//
// node:test no trae localStorage; mismo doble en memoria que passCache.test.js.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { saveVisitCache, loadVisitCache, clearVisitCache } from '../../src/ui/visitCache.js';

function makeFakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}
globalThis.localStorage = makeFakeLocalStorage();

const AHORA = '2026-03-10T10:00-07:00';
const TOKEN = 'tok1'.padEnd(22, 'x');

function expediente(overrides = {}) {
  return {
    visit: { id: 'v_1', lang: 'es', patientFirstName: 'Ana', status: 'active' },
    appointments: [{ id: 'a_1', visitId: 'v_1', locationId: 'piso27' }],
    passes: [{ id: 'p_1', visitId: 'v_1', scope: 'building', validUntil: null }],
    lodging: null,
    ...overrides,
  };
}

beforeEach(() => {
  globalThis.localStorage.clear();
});

describe('visitCache', () => {
  test('guarda y devuelve el expediente completo con la marca de cuándo se guardó', () => {
    saveVisitCache(TOKEN, expediente(), AHORA);
    const leido = loadVisitCache(TOKEN);

    assert.ok(leido, 'debía haber caché');
    assert.strictEqual(leido.savedAt, AHORA);
    assert.deepStrictEqual(leido.record, expediente());
  });

  test('la clave lleva el token: dos visitas en el mismo teléfono no se pisan', () => {
    // Pasa de verdad: una acompañante que abre su enlace y el de su
    // familiar en el mismo navegador.
    const otro = 'tok2'.padEnd(22, 'x');
    saveVisitCache(TOKEN, expediente(), AHORA);
    saveVisitCache(otro, expediente({ visit: { id: 'v_2', lang: 'en', patientFirstName: 'Bob', status: 'active' } }), AHORA);

    assert.strictEqual(loadVisitCache(TOKEN).record.visit.id, 'v_1');
    assert.strictEqual(loadVisitCache(otro).record.visit.id, 'v_2');
  });

  test('sin nada guardado devuelve null', () => {
    assert.strictEqual(loadVisitCache(TOKEN), null);
  });

  test('un JSON corrupto se trata como "sin caché", no revienta la apertura', () => {
    localStorage.setItem(`nc_visit_cache:${TOKEN}`, '{esto no es json');
    assert.strictEqual(loadVisitCache(TOKEN), null);
  });

  test('un expediente con forma inválida se descarta en vez de llegar a las pantallas', () => {
    // Sin este guard, un `{}` guardado por una versión vieja del formato
    // llega hasta renderHomeScreen y revienta ahí, donde el error ya no
    // dice de dónde vino.
    localStorage.setItem(`nc_visit_cache:${TOKEN}`, JSON.stringify({ savedAt: AHORA, record: {} }));
    assert.strictEqual(loadVisitCache(TOKEN), null);

    localStorage.setItem(`nc_visit_cache:${TOKEN}`, JSON.stringify({ savedAt: AHORA, record: { visit: { id: 'v_1' }, passes: [] } }));
    assert.strictEqual(loadVisitCache(TOKEN), null, 'sin appointments no es un expediente');

    localStorage.setItem(`nc_visit_cache:${TOKEN}`, JSON.stringify({ record: expediente() }));
    assert.strictEqual(loadVisitCache(TOKEN), null, 'sin savedAt no se puede decir desde cuándo está guardado');
  });

  test('clearVisitCache borra: es lo que se llama cuando el servidor dice 404', () => {
    saveVisitCache(TOKEN, expediente(), AHORA);
    clearVisitCache(TOKEN);
    assert.strictEqual(loadVisitCache(TOKEN), null);
  });

  test('clearVisitCache sobre algo que no está no lanza', () => {
    assert.doesNotThrow(() => clearVisitCache('tok9'.padEnd(22, 'x')));
  });

  test('lodging null sobrevive el viaje como null, no como ausente', () => {
    // Mismo cuidado que passCache con validUntil: `null` y "campo que no
    // está" se ven igual en JavaScript hasta que alguien pregunta
    // `'lodging' in record`.
    saveVisitCache(TOKEN, expediente({ lodging: null }), AHORA);
    const leido = loadVisitCache(TOKEN);
    assert.ok('lodging' in leido.record);
    assert.strictEqual(leido.record.lodging, null);
  });
});
