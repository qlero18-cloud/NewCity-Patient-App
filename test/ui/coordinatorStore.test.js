// Etapa D — el store del panel deja de ser una copia en memoria de las
// fixtures y pasa a hablar con la API.
//
// Esta prueba reemplaza a la de la fase 09, que fijaba justo lo contrario
// ("se pierde al recargar, a propósito"). El cambio de contrato es el punto
// de la etapa, así que la prueba vieja no se adapta: se sustituye.
//
// Lo que se fija aquí:
//
//   1. Las lecturas son SÍNCRONAS y salen de una copia local; las
//      mutaciones son asíncronas y pasan por el servidor. Es lo que deja
//      que las cinco pantallas sigan pintando sin await.
//   2. La copia local se REEMPLAZA con lo que devuelve el servidor, nunca
//      se parchea localmente. Si el panel adivinara el resultado, dos
//      coordinadoras sobre la misma visita divergirían a la primera.
//   3. Un 422 del servidor llega a la pantalla como errores por campo, no
//      como un null indistinguible de "no existe" (#11).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createCoordinatorStore } from '../../src/ui/coordinatorStore.js';

const VISITA = {
  patientFirstName: 'Ana',
  lang: 'es',
  startsAt: '2026-03-10T08:00:00.000-07:00',
  endsAt: '2026-03-11T20:00:00.000-07:00',
};

const CITA = {
  startsAt: '2026-03-10T11:30:00.000-07:00',
  durationMin: 45,
  serviceName: 'Resonancia',
  locationId: 'compass',
};

function registro(id = 'v_1', extra = {}) {
  return {
    visit: { id, token: `tok-${id}`, patientFirstName: 'Ana', lang: 'es', status: 'active' },
    appointments: [],
    passes: [],
    lodging: null,
    ...extra,
  };
}

// Doble del transporte. Guarda cada llamada para poder afirmar QUÉ se pidió
// —método, ruta y cuerpo— y no solo qué se recibió: la mitad de los errores
// de un cliente HTTP son mandar bien los datos a la ruta equivocada.
function apiDoble(respuestas = {}) {
  const llamadas = [];
  return {
    llamadas,
    async request(method, path, body) {
      llamadas.push({ method, path, body });
      const clave = `${method} ${path}`;
      const r = respuestas[clave] ?? respuestas[method] ?? { status: 200, body: {} };
      return typeof r === 'function' ? r(body) : r;
    },
  };
}

describe('lecturas: síncronas, desde la copia local', () => {
  test('listVisits está vacío hasta que se carga', () => {
    const store = createCoordinatorStore({ api: apiDoble() });
    assert.deepEqual(store.listVisits(), [], 'sin inventar nada antes de hablar con el servidor');
  });

  test('loadVisits llena la lista', async () => {
    const api = apiDoble({
      'GET /visits': { status: 200, body: { visits: [{ id: 'v_1', patientFirstName: 'Ana' }, { id: 'v_2' }] } },
    });
    const store = createCoordinatorStore({ api });

    await store.loadVisits();
    assert.deepEqual(store.listVisits().map((r) => r.visit.id), ['v_1', 'v_2']);
    assert.deepEqual(api.llamadas[0], { method: 'GET', path: '/visits', body: undefined });
  });

  test('la lista NO finge appointments vacíos', async () => {
    // GET /visits solo trae los Visit. Rellenar `appointments: []` diría
    // "esta visita no tiene citas" cuando lo cierto es "todavía no las
    // pedí" — y esa mentira se pinta igual que un itinerario vacío.
    const api = apiDoble({ 'GET /visits': { status: 200, body: { visits: [{ id: 'v_1' }] } } });
    const store = createCoordinatorStore({ api });

    await store.loadVisits();
    assert.equal(store.listVisits()[0].appointments, undefined);
  });

  test('getVisit devuelve null hasta que esa visita se carga entera', async () => {
    const api = apiDoble({
      'GET /visits': { status: 200, body: { visits: [{ id: 'v_1' }] } },
      'GET /visits/v_1': { status: 200, body: registro('v_1', { appointments: [{ id: 'a_1' }] }) },
    });
    const store = createCoordinatorStore({ api });

    await store.loadVisits();
    assert.equal(store.getVisit('v_1'), null, 'estar en la lista no es estar cargada');

    await store.loadVisit('v_1');
    assert.equal(store.getVisit('v_1').appointments.length, 1);
  });

  test('loadVisit con una visita inexistente: notFound, no una excepción', async () => {
    // #11: hoy "visita no encontrada" se comporta distinto según por dónde
    // entres. Aquí es un solo resultado con nombre.
    const api = apiDoble({ GET: { status: 404, body: { error: 'not_found' } } });
    const store = createCoordinatorStore({ api });

    assert.deepEqual(await store.loadVisit('v_fantasma'), { ok: false, notFound: true });
    assert.equal(store.getVisit('v_fantasma'), null);
  });

  test('getVisitWithPasses sale de la misma copia', async () => {
    const api = apiDoble({
      'GET /visits/v_1': { status: 200, body: registro('v_1', { passes: [{ id: 'q_1' }] }) },
    });
    const store = createCoordinatorStore({ api });

    assert.equal(store.getVisitWithPasses('v_1'), null);
    await store.loadVisit('v_1');
    assert.equal(store.getVisitWithPasses('v_1').passes.length, 1);
    assert.equal(store.getVisitWithPasses('v-no-existe'), null);
  });
});

describe('createVisit', () => {
  test('manda POST /visits y entrega el token', async () => {
    // El token es lo que hoy se tiraba a la basura y sin lo cual no hay
    // nada que mandarle al paciente.
    const api = apiDoble({
      'POST /visits': { status: 201, body: { visit: { id: 'v_9', token: 'tok-real', patientFirstName: 'Ana' } } },
    });
    const store = createCoordinatorStore({ api });

    const res = await store.createVisit(VISITA);
    assert.equal(res.ok, true);
    assert.equal(res.visit.token, 'tok-real');
    assert.deepEqual(api.llamadas[0], { method: 'POST', path: '/visits', body: VISITA });
  });

  test('un 422 llega como errores POR CAMPO', async () => {
    const api = apiDoble({
      'POST /visits': { status: 422, body: { error: 'invalid', errors: { lang: 'unsupported' } } },
    });
    const store = createCoordinatorStore({ api });

    const res = await store.createVisit({ ...VISITA, lang: 'fr' });
    assert.deepEqual(res, { ok: false, errors: { lang: 'unsupported' } });
  });
});

describe('mutaciones: la copia local se reemplaza con la del servidor', () => {
  const conRegistroDe = (record) => ({ status: 200, body: { record, appointment: record.appointments?.at(-1) } });

  test('addAppointment guarda lo que devolvió el servidor, no lo que se mandó', async () => {
    // El servidor recorta espacios, estampa createdBy/updatedAt y asigna el
    // id. Si el panel se quedara con lo que escribió el formulario, la
    // pantalla mostraría algo distinto a lo guardado hasta la próxima
    // recarga — y esa clase de divergencia solo se nota cuando ya importa.
    const delServidor = registro('v_1', {
      appointments: [{ id: 'a_srv', serviceName: 'Resonancia', createdBy: 'ana.ruiz', updatedAt: 'del-servidor' }],
    });
    const api = apiDoble({ 'POST /visits/v_1/appointments': conRegistroDe(delServidor) });
    const store = createCoordinatorStore({ api });

    const res = await store.addAppointment('v_1', { ...CITA, serviceName: '  Resonancia  ' });
    assert.equal(res.ok, true);
    assert.equal(res.appointment.id, 'a_srv');

    const guardado = store.getVisit('v_1');
    assert.equal(guardado.appointments[0].createdBy, 'ana.ruiz');
    assert.equal(guardado.appointments[0].updatedAt, 'del-servidor');
  });

  test('el panel ya NO manda `now`: la hora la pone el servidor', async () => {
    // Antes cada mutación recibía `now` del navegador. Un reloj mal puesto
    // en la máquina de coordinación estampaba esa hora en el expediente que
    // lee el paciente. Ahora la hora de lo guardado la decide el servidor,
    // que es el único que puede decirla igual para todos.
    const api = apiDoble({ 'POST /visits/v_1/appointments': conRegistroDe(registro()) });
    const store = createCoordinatorStore({ api });

    await store.addAppointment('v_1', CITA);
    assert.deepEqual(Object.keys(api.llamadas[0].body).sort(), [
      'durationMin',
      'locationId',
      'serviceName',
      'startsAt',
    ]);
  });

  test('move, edit y cancel van al mismo PATCH con action distinto', async () => {
    const api = apiDoble({ PATCH: conRegistroDe(registro()) });
    const store = createCoordinatorStore({ api });

    await store.moveAppointment('v_1', 'a_1', '2026-03-10T15:00:00.000-07:00');
    await store.editAppointment('v_1', 'a_1', { serviceName: 'X', durationMin: 20, locationId: 'piso27' });
    await store.cancelAppointment('v_1', 'a_1');

    assert.deepEqual(api.llamadas.map((l) => l.path), [
      '/visits/v_1/appointments/a_1',
      '/visits/v_1/appointments/a_1',
      '/visits/v_1/appointments/a_1',
    ]);
    assert.deepEqual(api.llamadas.map((l) => l.body.action), ['move', 'edit', 'cancel']);
    assert.equal(api.llamadas[0].body.startsAt, '2026-03-10T15:00:00.000-07:00');
  });

  test('setLodging va por PUT y revokeQpass por PATCH', async () => {
    // Revocar NO es DELETE: no borra nada, le estampa revokedAt al pase y
    // lo deja en la lista. Un DELETE prometería otra cosa.
    const api = apiDoble({ PUT: conRegistroDe(registro()), PATCH: conRegistroDe(registro()) });
    const store = createCoordinatorStore({ api });

    await store.setLodging('v_1', { hotel: 'Quartz' });
    await store.revokeQpass('v_1', 'q_1');

    assert.equal(api.llamadas[0].method, 'PUT');
    assert.equal(api.llamadas[0].path, '/visits/v_1/lodging');
    assert.equal(api.llamadas[1].method, 'PATCH');
    assert.equal(api.llamadas[1].path, '/visits/v_1/passes/q_1');
    assert.equal(api.llamadas[1].body.action, 'revoke');
  });

  test('un 422 no toca la copia local', async () => {
    const api = apiDoble({
      'GET /visits/v_1': { status: 200, body: registro('v_1', { appointments: [{ id: 'a_previa' }] }) },
      POST: { status: 422, body: { error: 'invalid', errors: { locationId: 'unknown' } } },
    });
    const store = createCoordinatorStore({ api });
    await store.loadVisit('v_1');

    const res = await store.addAppointment('v_1', { ...CITA, locationId: 'piso 27' });
    assert.deepEqual(res, { ok: false, errors: { locationId: 'unknown' } });
    assert.deepEqual(store.getVisit('v_1').appointments.map((a) => a.id), ['a_previa'], 'intacta');
  });

  test('un 404 llega como notFound, distinguible de un 422', async () => {
    const api = apiDoble({ POST: { status: 404, body: { error: 'not_found' } } });
    const store = createCoordinatorStore({ api });

    assert.deepEqual(await store.addAppointment('v_fantasma', CITA), { ok: false, notFound: true });
  });
});

describe('fallos que no son del formulario', () => {
  test('un 401 se reporta como sesión caída, no como dato inválido', async () => {
    // Sin esto, una sesión vencida se ve como un formulario que dejó de
    // funcionar sin decir por qué, y la coordinadora reintenta en vez de
    // volver a entrar.
    const api = apiDoble({ POST: { status: 401, body: { error: 'unauthenticated' } } });
    const store = createCoordinatorStore({ api });

    assert.deepEqual(await store.createVisit(VISITA), { ok: false, unauthenticated: true });
  });

  test('un 500 o una red caída se reportan como falla, sin inventar errores de campo', async () => {
    const store500 = createCoordinatorStore({ api: apiDoble({ POST: { status: 500, body: { error: 'internal' } } }) });
    assert.deepEqual(await store500.createVisit(VISITA), { ok: false, failed: true });

    const storeRed = createCoordinatorStore({
      api: {
        async request() {
          throw new TypeError('Failed to fetch');
        },
      },
    });
    assert.deepEqual(await storeRed.createVisit(VISITA), { ok: false, failed: true });
  });
});
