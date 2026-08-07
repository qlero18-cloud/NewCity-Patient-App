// Etapa E — de dónde sale el expediente que ve el paciente. Hasta hoy,
// app.js buscaba el token SOLO entre las fixtures compiladas en el bundle:
// una visita creada por la coordinadora nunca podía abrirse, que era la
// mitad no dicha de la pregunta que abrió esta etapa.
//
// La resolución vive fuera de app.js para poder probarse: app.js necesita
// DOM (document.title, root.innerHTML) y este proyecto no monta fake DOM.
// Aquí entran api, cache y catálogo inyectados, y lo único que se prueba es
// el ORDEN y qué pasa cuando cada capa falla — que es donde están las
// decisiones que le cuestan al paciente.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveVisitContext } from '../../src/ui/visitSource.js';
import { fixtures } from '../../src/data/fixtures.js';

const AHORA = '2026-03-10T10:00-07:00';
const TOKEN = 'tok1'.padEnd(22, 'x');

function expediente() {
  return {
    visit: { id: 'v_1', lang: 'es', patientFirstName: 'Ana', status: 'active' },
    appointments: [],
    passes: [],
    lodging: null,
  };
}

// Doble de la API con contador de llamadas: varias pruebas de aquí no
// verifican qué devuelve sino que NO se haya llamado.
function apiDoble(respuesta) {
  const llamadas = [];
  return {
    llamadas,
    getVisit: async (token) => {
      llamadas.push(token);
      return typeof respuesta === 'function' ? respuesta(token) : respuesta;
    },
  };
}

function cacheDoble(inicial = null) {
  let guardado = inicial;
  const eventos = [];
  return {
    eventos,
    save: (token, record, now) => { eventos.push(['save', token]); guardado = { record, savedAt: now }; },
    load: () => { eventos.push(['load']); return guardado; },
    clear: (token) => { eventos.push(['clear', token]); guardado = null; },
    get actual() { return guardado; },
  };
}

describe('resolveVisitContext — orden de resolución', () => {
  test('un token de fixture se resuelve sin tocar la red', async () => {
    // El camino offline del prototipo sigue vivo: /demo y las cinco
    // fixtures tienen que abrir en un teléfono en modo avión.
    const api = apiDoble({ ok: false, failed: true });
    const cache = cacheDoble();

    const r = await resolveVisitContext(fixtures.v_demo1.visit.token, { api, cache, now: AHORA });

    assert.strictEqual(r.source, 'fixture');
    assert.strictEqual(r.record.visit.id, fixtures.v_demo1.visit.id);
    assert.deepStrictEqual(api.llamadas, [], 'una fixture no debe generar tráfico');
  });

  test('una fixture no se guarda en caché: ya está en el bundle', async () => {
    const cache = cacheDoble();
    await resolveVisitContext(fixtures.v_demo1.visit.token, { api: apiDoble({ ok: false, failed: true }), cache, now: AHORA });
    assert.deepStrictEqual(cache.eventos, []);
  });

  test('un token real se pide a la API y se devuelve con source network', async () => {
    const api = apiDoble({ ok: true, record: expediente() });
    const r = await resolveVisitContext(TOKEN, { api, cache: cacheDoble(), now: AHORA });

    assert.strictEqual(r.source, 'network');
    assert.strictEqual(r.record.visit.id, 'v_1');
    assert.deepStrictEqual(api.llamadas, [TOKEN], 'el token viaja tal cual, una sola vez');
  });

  test('lo que llega por red se guarda en caché para la próxima apertura', async () => {
    const cache = cacheDoble();
    await resolveVisitContext(TOKEN, { api: apiDoble({ ok: true, record: expediente() }), cache, now: AHORA });

    assert.deepStrictEqual(cache.actual.record, expediente());
    assert.strictEqual(cache.actual.savedAt, AHORA);
  });

  test('sin token no hay nada que resolver y no se toca la red', async () => {
    const api = apiDoble({ ok: true, record: expediente() });
    assert.strictEqual(await resolveVisitContext(null, { api, cache: cacheDoble(), now: AHORA }), null);
    assert.strictEqual(await resolveVisitContext('', { api, cache: cacheDoble(), now: AHORA }), null);
    assert.deepStrictEqual(api.llamadas, []);
  });
});

describe('resolveVisitContext — cuando la red falla', () => {
  test('sin señal, la caché mantiene la visita abierta', async () => {
    // El caso del PRD: el paciente llega al acceso, no hay señal, y el
    // pase tiene que seguir en pantalla.
    const cache = cacheDoble({ record: expediente(), savedAt: '2026-03-09T20:00-07:00' });
    const r = await resolveVisitContext(TOKEN, { api: apiDoble({ ok: false, failed: true }), cache, now: AHORA });

    assert.strictEqual(r.source, 'cache');
    assert.strictEqual(r.record.visit.id, 'v_1');
    assert.strictEqual(r.savedAt, '2026-03-09T20:00-07:00', 'hay que poder decir de cuándo son los datos');
  });

  test('sin señal y sin caché es pantalla neutra, no un error técnico', async () => {
    const r = await resolveVisitContext(TOKEN, { api: apiDoble({ ok: false, failed: true }), cache: cacheDoble(), now: AHORA });
    assert.strictEqual(r, null);
  });

  test('un 500 del servidor también cae en la caché: un tropiezo no deja al paciente en blanco', async () => {
    const cache = cacheDoble({ record: expediente(), savedAt: '2026-03-09T20:00-07:00' });
    const r = await resolveVisitContext(TOKEN, { api: apiDoble({ ok: false, failed: true }), cache, now: AHORA });
    assert.strictEqual(r.source, 'cache');
  });

  test('una falla de red NO borra la caché', async () => {
    const cache = cacheDoble({ record: expediente(), savedAt: AHORA });
    await resolveVisitContext(TOKEN, { api: apiDoble({ ok: false, failed: true }), cache, now: AHORA });
    assert.ok(cache.actual, 'perder la señal no puede ser lo que borre el respaldo');
  });
});

describe('resolveVisitContext — 404 (INV-3 / R1)', () => {
  test('un 404 devuelve null aunque haya caché', async () => {
    // El servidor contesta un único 404 para "no existe", "malformado" y
    // "ya venció" (INV-3). Servir la caché en ese caso sería deshacer la
    // caducidad desde el cliente: una visita vencida seguiría abriéndose
    // en el teléfono para siempre.
    const cache = cacheDoble({ record: expediente(), savedAt: AHORA });
    const r = await resolveVisitContext(TOKEN, { api: apiDoble({ ok: false, notFound: true }), cache, now: AHORA });
    assert.strictEqual(r, null);
  });

  test('un 404 además BORRA la caché', async () => {
    // No basta con no usarla esta vez: si se queda guardada, la siguiente
    // apertura sin señal la resucita.
    const cache = cacheDoble({ record: expediente(), savedAt: AHORA });
    await resolveVisitContext(TOKEN, { api: apiDoble({ ok: false, notFound: true }), cache, now: AHORA });

    assert.strictEqual(cache.actual, null);
    assert.ok(cache.eventos.some(([e]) => e === 'clear'), 'debe llamarse clear con el token');
  });
});
