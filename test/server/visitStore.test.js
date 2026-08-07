// Etapa B — núcleo de persistencia, probado antes de que exista ninguna
// Function. Se escribe antes que src/server/visitStore.js: debe fallar
// ahora porque el módulo no existe (rojo esperado).
//
// La misma disciplina de todas las fases: el núcleo se prueba puro y la
// capa de plataforma (Netlify Blobs) queda como un adaptador de diez
// líneas encima. Aquí el "almacén" es un Map en memoria que cumple el
// mismo contrato de cuatro métodos.
//
// El Map CLONA en get y en set a propósito: Blobs serializa a JSON, así
// que el que llama nunca recibe una referencia viva. La store en memoria de
// fase 09 (src/ui/coordinatorStore.js) sí devuelve referencias vivas y sus
// métodos mutan en el sitio — si el falso almacén de esta prueba no clonara,
// la prueba pasaría con código que solo funciona en memoria y reventaría
// contra Blobs de verdad.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createVisitStore, validateVisitInput } from '../../src/server/visitStore.js';
import { isValidToken } from '../../src/domain/tokens.js';

const NOW = '2026-03-10T10:00-07:00';

// Falso almacén con el contrato mínimo que se le pide a Blobs.
function memoryKv(initial = {}) {
  const data = new Map(Object.entries(initial));
  const calls = { get: [], set: [], delete: [], list: [] };
  return {
    async get(key) {
      calls.get.push(key);
      return data.has(key) ? structuredClone(data.get(key)) : null;
    },
    async set(key, value) {
      calls.set.push(key);
      data.set(key, structuredClone(value));
    },
    async delete(key) {
      calls.delete.push(key);
      data.delete(key);
    },
    async list(prefix) {
      calls.list.push(prefix);
      return [...data.keys()].filter((k) => k.startsWith(prefix));
    },
    _data: data,
    _calls: calls,
  };
}

// Generadores deterministas: lo que se prueba aquí es el trazado de llaves,
// no la entropía (eso es test/domain/tokens.test.js).
//
// Un contador por generador, no uno compartido: con uno solo el resultado
// dependía de en qué orden los llamara createVisit por dentro, que es
// justo lo que una prueba no debe fijar.
function seededStore(kv, { token = 'TOKEN0000000000000000A', id = 'v_fijo' } = {}) {
  let tokens = 0;
  let ids = 0;
  return createVisitStore(kv, {
    generateToken: () => (tokens++ === 0 ? token : `${token.slice(0, 21)}${tokens}`),
    generateVisitId: () => (ids++ === 0 ? id : `${id}${ids}`),
  });
}

const INPUT = {
  patientFirstName: 'María',
  lang: 'es',
  startsAt: '2026-03-10T08:00-07:00',
  endsAt: '2026-03-11T09:30-07:00',
};

describe('validateVisitInput', () => {
  test('acepta una entrada completa', () => {
    assert.deepEqual(validateVisitInput(INPUT), { ok: true, errors: {} });
  });

  test('exige nombre de pila', () => {
    const { ok, errors } = validateVisitInput({ ...INPUT, patientFirstName: '   ' });
    assert.equal(ok, false);
    assert.equal(errors.patientFirstName, 'required');
  });

  test('lang solo puede ser es o en (D08)', () => {
    assert.equal(validateVisitInput({ ...INPUT, lang: 'fr' }).errors.lang, 'unsupported');
    assert.equal(validateVisitInput({ ...INPUT, lang: '' }).errors.lang, 'unsupported');
    for (const lang of ['es', 'en']) {
      assert.equal(validateVisitInput({ ...INPUT, lang }).ok, true);
    }
  });

  test('las fechas tienen que ser interpretables', () => {
    assert.equal(validateVisitInput({ ...INPUT, startsAt: 'mañana' }).errors.startsAt, 'invalidDate');
    assert.equal(validateVisitInput({ ...INPUT, endsAt: '' }).errors.endsAt, 'required');
  });

  test('endsAt no puede ser anterior ni igual a startsAt', () => {
    assert.equal(validateVisitInput({ ...INPUT, endsAt: INPUT.startsAt }).errors.endsAt, 'order');
    assert.equal(
      validateVisitInput({ ...INPUT, endsAt: '2026-03-09T08:00-07:00' }).errors.endsAt,
      'order'
    );
  });

  test('una fecha sin zona horaria se rechaza (PRD §7: nada de fechas sin zona)', () => {
    assert.equal(validateVisitInput({ ...INPUT, startsAt: '2026-03-10T08:00' }).errors.startsAt, 'noOffset');
  });

  test('no revienta con basura: es lo que va a llegar por HTTP', () => {
    for (const bad of [null, undefined, 42, 'texto', []]) {
      assert.equal(validateVisitInput(bad).ok, false, `aceptó ${String(bad)}`);
    }
  });
});

describe('createVisit', () => {
  test('escribe el registro y el índice del token, y nada más', async () => {
    const kv = memoryKv();
    const store = seededStore(kv);
    await store.createVisit(INPUT, NOW);

    assert.deepEqual([...kv._data.keys()].sort(), ['token/TOKEN0000000000000000A', 'visit/v_fijo']);
  });

  test('el índice del token apunta al id de la visita, no al registro completo', async () => {
    const kv = memoryKv();
    const store = seededStore(kv);
    await store.createVisit(INPUT, NOW);

    // Duplicar el registro bajo dos llaves los dejaría divergir en la
    // primera edición. El índice guarda solo el apuntador.
    assert.deepEqual(kv._data.get('token/TOKEN0000000000000000A'), { visitId: 'v_fijo' });
  });

  test('devuelve el registro completo con la forma de fase 09', async () => {
    const record = await seededStore(memoryKv()).createVisit(INPUT, NOW);

    assert.deepEqual(Object.keys(record).sort(), ['appointments', 'lodging', 'passes', 'visit']);
    assert.deepEqual(record.appointments, []);
    assert.deepEqual(record.passes, []);
    assert.equal(record.lodging, null);
    assert.equal(record.visit.status, 'active');
    assert.equal(record.visit.patientFirstName, 'María');
  });

  test('el token por defecto es uno real de 128 bits, no uno de demo', async () => {
    const record = await createVisitStore(memoryKv()).createVisit(INPUT, NOW);
    assert.ok(isValidToken(record.visit.token), `token fuera de formato: ${record.visit.token}`);
    assert.doesNotMatch(record.visit.token, /^demo-token-/);
  });

  test('dos visitas seguidas no comparten token ni id', async () => {
    const store = createVisitStore(memoryKv());
    const a = await store.createVisit(INPUT, NOW);
    const b = await store.createVisit(INPUT, NOW);
    assert.notEqual(a.visit.token, b.visit.token);
    assert.notEqual(a.visit.id, b.visit.id);
  });

  test('rechaza una entrada inválida sin escribir nada', async () => {
    const kv = memoryKv();
    await assert.rejects(
      () => seededStore(kv).createVisit({ ...INPUT, lang: 'fr' }, NOW),
      /lang/
    );
    assert.equal(kv._data.size, 0, 'escribió a pesar de rechazar la entrada');
  });

  test('recorta los espacios del nombre antes de guardarlo', async () => {
    const record = await seededStore(memoryKv()).createVisit({ ...INPUT, patientFirstName: '  María  ' }, NOW);
    assert.equal(record.visit.patientFirstName, 'María');
  });
});

describe('getVisitByToken', () => {
  test('encuentra la visita recién creada', async () => {
    const kv = memoryKv();
    const store = seededStore(kv);
    const created = await store.createVisit(INPUT, NOW);

    const found = await store.getVisitByToken(created.visit.token, NOW);
    assert.equal(found.visit.id, created.visit.id);
  });

  test('un token que no existe da null', async () => {
    const store = seededStore(memoryKv());
    await store.createVisit(INPUT, NOW);
    assert.equal(await store.getVisitByToken('NOEXISTE00000000000000', NOW), null);
  });

  test('INV-3: una visita vencida da null igual que una inexistente', async () => {
    const kv = memoryKv();
    const store = seededStore(kv);
    const created = await store.createVisit(INPUT, NOW);

    // R1/D16: el enlace vive hasta max(última cita, checkout) + 24 h. Sin
    // citas ni hospedaje, la referencia es visit.endsAt.
    const despues = '2026-03-13T09:31-07:00';
    assert.equal(await store.getVisitByToken(created.visit.token, despues), null);
    assert.equal(await store.getVisitByToken('NOEXISTE00000000000000', despues), null);
  });

  test('vencida sigue existiendo en el almacén: solo deja de resolverse por token', async () => {
    const kv = memoryKv();
    const store = seededStore(kv);
    const created = await store.createVisit(INPUT, NOW);
    const despues = '2026-03-13T09:31-07:00';

    assert.equal(await store.getVisitByToken(created.visit.token, despues), null);
    // Coordinación tiene que poder verla para reemitir o corregir fechas.
    assert.ok(await store.getVisit(created.visit.id));
  });

  test('un token mal formado ni siquiera toca el almacén', async () => {
    const kv = memoryKv();
    const store = seededStore(kv);
    kv._calls.get.length = 0;

    for (const bad of ['../visit/v_fijo', 'demo-token-v_1', '', null, 'a'.repeat(500)]) {
      assert.equal(await store.getVisitByToken(bad, NOW), null);
    }
    assert.deepEqual(kv._calls.get, [], 'usó como llave un valor sin validar');
  });

  test('un índice huérfano (registro borrado a mano) da null, no revienta', async () => {
    const kv = memoryKv();
    const store = seededStore(kv);
    const created = await store.createVisit(INPUT, NOW);
    kv._data.delete('visit/v_fijo');

    assert.equal(await store.getVisitByToken(created.visit.token, NOW), null);
  });
});

describe('getVisit / listVisits', () => {
  test('getVisit devuelve null si el id no existe', async () => {
    assert.equal(await seededStore(memoryKv()).getVisit('v_no_existe'), null);
  });

  test('listVisits no incluye las llaves del índice de tokens', async () => {
    const kv = memoryKv();
    const store = createVisitStore(kv);
    await store.createVisit(INPUT, NOW);
    await store.createVisit({ ...INPUT, patientFirstName: 'Jorge' }, NOW);

    const visits = await store.listVisits();
    assert.equal(visits.length, 2);
    assert.deepEqual(visits.map((r) => r.visit.patientFirstName).sort(), ['Jorge', 'María']);
  });

  test('listVisits sobre un almacén vacío da lista vacía, no null', async () => {
    assert.deepEqual(await createVisitStore(memoryKv()).listVisits(), []);
  });
});

describe('saveVisit', () => {
  test('sobrescribe el registro y se puede volver a leer', async () => {
    const kv = memoryKv();
    const store = seededStore(kv);
    const record = await store.createVisit(INPUT, NOW);

    record.appointments.push({ id: 'a1', visitId: record.visit.id });
    await store.saveVisit(record);

    const releido = await store.getVisit(record.visit.id);
    assert.equal(releido.appointments.length, 1);
  });

  test('no toca el índice del token al guardar', async () => {
    const kv = memoryKv();
    const store = seededStore(kv);
    const record = await store.createVisit(INPUT, NOW);
    kv._calls.set.length = 0;

    await store.saveVisit(record);
    assert.deepEqual(kv._calls.set, ['visit/v_fijo']);
  });

  test('se niega a guardar un registro cuya visita no existe', async () => {
    const store = seededStore(memoryKv());
    await assert.rejects(
      () => store.saveVisit({ visit: { id: 'v_inventado', token: 'x' }, appointments: [], passes: [], lodging: null }),
      /v_inventado/
    );
  });

  test('mutar el objeto devuelto no cambia lo guardado (Blobs serializa)', async () => {
    const kv = memoryKv();
    const store = seededStore(kv);
    const record = await store.createVisit(INPUT, NOW);

    const leido = await store.getVisit(record.visit.id);
    leido.visit.patientFirstName = 'Otro';

    const releido = await store.getVisit(record.visit.id);
    assert.equal(releido.visit.patientFirstName, 'María');
  });
});

describe('deleteVisit', () => {
  test('borra el registro Y el índice del token', async () => {
    const kv = memoryKv();
    const store = seededStore(kv);
    const record = await store.createVisit(INPUT, NOW);

    assert.equal(await store.deleteVisit(record.visit.id), true);
    assert.equal(kv._data.size, 0, 'quedó una llave viva');
  });

  test('tras borrar, el token deja de resolver', async () => {
    const kv = memoryKv();
    const store = seededStore(kv);
    const record = await store.createVisit(INPUT, NOW);
    await store.deleteVisit(record.visit.id);

    assert.equal(await store.getVisitByToken(record.visit.token, NOW), null);
  });

  test('borrar algo que no existe da false, sin lanzar', async () => {
    assert.equal(await seededStore(memoryKv()).deleteVisit('v_no_existe'), false);
  });
});
