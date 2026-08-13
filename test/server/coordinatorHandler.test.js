// Etapa D — el endpoint de coordinación. Se escribe antes que el módulo.
//
// Lo que estas pruebas fijan, en orden de importancia:
//
//   1. TODA ruta exige sesión. Es un expediente clínico: una sola ruta que
//      se salte el guardia deja el resto de la Etapa C sin sentido. Hay una
//      prueba que recorre la lista de rutas en vez de nombrarlas una por
//      una, para que una ruta nueva sin guardia no pase inadvertida.
//   2. La firma de auditoría sale de la SESIÓN, nunca del cuerpo. Si el
//      cliente pudiera mandar `by`, las cuentas individuales serían
//      decorativas.
//   3. Datos inválidos son 422 y no-existe es 404. Un null para las dos
//      cosas obliga a quien llama a adivinar.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { handleCoordinatorRequest, COORDINATOR_PREFIX } from '../../src/server/coordinatorHandler.js';
import { createVisitStore } from '../../src/server/visitStore.js';

const AHORA = '2026-03-10T09:00:00.000-07:00';
const SESION = 'sesion-de-ana';

function memoriaKv() {
  const m = new Map();
  return {
    async get(k) {
      return m.has(k) ? structuredClone(m.get(k)) : null;
    },
    async set(k, v) {
      m.set(k, structuredClone(v));
    },
    async delete(k) {
      m.delete(k);
    },
    async list(prefix) {
      return [...m.keys()].filter((k) => k.startsWith(prefix));
    },
  };
}

// Doble del guardia de la Etapa C: el handler no debe saber CÓMO se
// autentica, solo que alguien le dice quién es. Autentica si viene la
// cookie de prueba y rechaza si no, que es todo el contrato que consume.
function guardiaDoble({ cuenta = { username: 'ana.ruiz', name: 'Ana Ruiz' } } = {}) {
  const llamadas = [];
  return {
    llamadas,
    async requireCoordinator(request) {
      llamadas.push(request.url);
      if (request.headers.get('cookie')?.includes(SESION)) return { ok: true, account: cuenta };
      return {
        ok: false,
        response: new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401 }),
      };
    },
  };
}

let contador = 0;
function deps(extra = {}) {
  const kv = memoriaKv();
  const store = createVisitStore(kv, {
    generateToken: () => `tok${(contador += 1)}`.padEnd(22, 'x'),
    generateVisitId: () => `v_${contador}`,
  });
  const guardia = guardiaDoble(extra.guardia ?? {});
  return {
    store,
    guardia,
    deps: {
      store,
      requireCoordinator: guardia.requireCoordinator,
      now: AHORA,
      newId: (p) => `${p}_${(contador += 1)}`,
      ...extra.deps,
    },
  };
}

const url = (ruta) => `https://nch.test${COORDINATOR_PREFIX}${ruta}`;

function pedir(ruta, { method = 'GET', body, conSesion = true } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (conSesion) headers.cookie = `nc_session=${SESION}`;
  return new Request(url(ruta), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

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

async function conVisita(d) {
  const res = await handleCoordinatorRequest(pedir('/visits', { method: 'POST', body: VISITA }), d);
  return (await res.json()).visit.id;
}

describe('el guardia de sesión', () => {
  // Se enumeran aquí para poder recorrerlas todas: una ruta nueva sin
  // guardia es el error que más caro sale y el más fácil de cometer.
  const RUTAS = [
    ['GET', '/visits'],
    ['POST', '/visits'],
    ['GET', '/visits/v_1'],
    ['POST', '/visits/v_1/appointments'],
    ['PATCH', '/visits/v_1/appointments/a_1'],
    ['PUT', '/visits/v_1/lodging'],
    ['POST', '/visits/v_1/passes'],
    ['PATCH', '/visits/v_1/passes/q_1'],
    ['POST', '/visits/v_1/transfers'],
    ['PATCH', '/visits/v_1/transfers/t_1'],
    ['POST', '/import'],
  ];

  for (const [method, ruta] of RUTAS) {
    test(`${method} ${ruta} sin sesión da 401`, async () => {
      const { deps: d } = deps();
      // Sin cuerpo en GET: `new Request` lo prohíbe, y el guardia no lo mira.
      const body = method === 'GET' ? undefined : {};
      const res = await handleCoordinatorRequest(pedir(ruta, { method, body, conSesion: false }), d);
      assert.equal(res.status, 401);
    });
  }

  test('el guardia corre ANTES de mirar el cuerpo o la ruta', async () => {
    // Si validara primero, un 422 sobre una petición sin sesión ya habría
    // dicho que la ruta existe y qué campos espera.
    const { deps: d, store } = deps();
    const res = await handleCoordinatorRequest(
      pedir('/visits', { method: 'POST', body: { basura: true }, conSesion: false }),
      d,
    );
    assert.equal(res.status, 401);
    assert.deepEqual(await store.listVisits(), [], 'nada se escribió');
  });

  test('una ruta desconocida bajo el prefijo da 404, no 500', async () => {
    const { deps: d } = deps();
    const res = await handleCoordinatorRequest(pedir('/visits/v_1/inventado', { method: 'POST', body: {} }), d);
    assert.equal(res.status, 404);
  });

  test('el método equivocado da 405, no 404', async () => {
    const { deps: d } = deps();
    const res = await handleCoordinatorRequest(pedir('/visits', { method: 'DELETE' }), d);
    assert.equal(res.status, 405);
  });
});

describe('POST /visits — alta', () => {
  test('crea la visita y DEVUELVE el token', async () => {
    // Esto es lo que preguntaste al principio: hoy createVisit acuña un
    // token y el router lo tira. Sin él no hay nada que mandarle al
    // paciente, y la Etapa E no tendría de dónde sacar el QR.
    const { deps: d } = deps();
    const res = await handleCoordinatorRequest(pedir('/visits', { method: 'POST', body: VISITA }), d);

    assert.equal(res.status, 201);
    const { visit } = await res.json();
    assert.ok(visit.token, 'el token viaja de vuelta a quien creó la visita');
    assert.equal(visit.patientFirstName, 'Ana');
    assert.equal(visit.status, 'active');
  });

  test('firma quién la creó', async () => {
    const { deps: d } = deps();
    const res = await handleCoordinatorRequest(pedir('/visits', { method: 'POST', body: VISITA }), d);
    assert.equal((await res.json()).visit.createdBy, 'ana.ruiz');
  });

  test('datos inválidos: 422 con los motivos por campo', async () => {
    const { deps: d, store } = deps();
    const res = await handleCoordinatorRequest(
      pedir('/visits', { method: 'POST', body: { ...VISITA, lang: 'fr', startsAt: '' } }),
      d,
    );

    assert.equal(res.status, 422);
    const { errors } = await res.json();
    assert.equal(errors.lang, 'unsupported');
    assert.equal(errors.startsAt, 'required');
    assert.deepEqual(await store.listVisits(), [], 'no queda una visita a medias');
  });

  test('un cuerpo que no es JSON da 400, no 500', async () => {
    const { deps: d } = deps();
    const req = new Request(url('/visits'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `nc_session=${SESION}` },
      body: '{roto',
    });
    assert.equal((await handleCoordinatorRequest(req, d)).status, 400);
  });
});

describe('GET /visits — lista', () => {
  test('lista sin token: la lista no es donde se reparten credenciales', async () => {
    // El token sale UNA vez, al crear, y después solo por la ruta de una
    // visita concreta. Una lista que los trae todos convierte cualquier
    // fuga de esa respuesta en una fuga de todos los expedientes.
    const { deps: d } = deps();
    await conVisita(d);
    await conVisita(d);

    const res = await handleCoordinatorRequest(pedir('/visits'), d);
    assert.equal(res.status, 200);
    const { visits } = await res.json();
    assert.equal(visits.length, 2);
    for (const v of visits) assert.equal(v.token, undefined);
  });
});

describe('GET /visits/:id', () => {
  test('trae el expediente completo', async () => {
    const { deps: d } = deps();
    const id = await conVisita(d);
    await handleCoordinatorRequest(pedir(`/visits/${id}/appointments`, { method: 'POST', body: CITA }), d);

    const res = await handleCoordinatorRequest(pedir(`/visits/${id}`), d);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.visit.id, id);
    assert.equal(body.appointments.length, 1);
    assert.ok(body.visit.token, 'aquí sí: es la ruta para reenviarle el enlace al paciente');
  });

  test('una visita vencida SIGUE siendo consultable por coordinación', async () => {
    // getVisitByToken aplica R1; getVisit no, y es a propósito: lo que
    // caduca es el enlace del paciente, no el expediente. Si esta ruta
    // aplicara caducidad, una visita de la semana pasada sería
    // irrecuperable para quien la capturó.
    const { deps: d } = deps();
    const id = await conVisita(d);

    const res = await handleCoordinatorRequest(pedir(`/visits/${id}`), {
      ...d,
      now: '2027-01-01T00:00:00.000-07:00',
    });
    assert.equal(res.status, 200);
  });

  test('visita inexistente: 404 con el mismo cuerpo en toda ruta', async () => {
    // #11 del reporte: hoy "visita no encontrada" se comporta distinto
    // según por dónde entres.
    const { deps: d } = deps();
    const rutas = [
      ['GET', '/visits/v_fantasma', undefined],
      ['POST', '/visits/v_fantasma/appointments', CITA],
      ['PUT', '/visits/v_fantasma/lodging', { hotel: 'X', checkIn: AHORA, checkOut: '2026-03-12T11:00:00.000-07:00' }],
      ['POST', '/visits/v_fantasma/passes', { format: 'image', payload: 'data:,x', scope: 'torre' }],
    ];

    const cuerpos = [];
    for (const [method, ruta, body] of rutas) {
      const res = await handleCoordinatorRequest(pedir(ruta, { method, body }), d);
      assert.equal(res.status, 404, `${method} ${ruta}`);
      cuerpos.push(await res.text());
    }
    assert.equal(new Set(cuerpos).size, 1, 'las cuatro dicen exactamente lo mismo');
  });
});

describe('citas', () => {
  test('POST agrega, persiste y firma', async () => {
    const { deps: d, store } = deps();
    const id = await conVisita(d);

    const res = await handleCoordinatorRequest(pedir(`/visits/${id}/appointments`, { method: 'POST', body: CITA }), d);
    assert.equal(res.status, 201);

    // Releído del almacén, no de la respuesta: lo que importa de esta etapa
    // es que sobreviva a la petición.
    const guardado = await store.getVisit(id);
    assert.equal(guardado.appointments.length, 1);
    assert.equal(guardado.appointments[0].createdBy, 'ana.ruiz');
    assert.equal(guardado.appointments[0].locationId, 'compass');
  });

  test('rechaza una ubicación fuera del catálogo con 422', async () => {
    // El <select> de la Etapa A por HTTP: aquí es donde de verdad se
    // sostiene, porque quien manda el POST puede no haber visto la pantalla.
    const { deps: d, store } = deps();
    const id = await conVisita(d);

    const res = await handleCoordinatorRequest(
      pedir(`/visits/${id}/appointments`, { method: 'POST', body: { ...CITA, locationId: 'piso 27' } }),
      d,
    );

    assert.equal(res.status, 422);
    assert.equal((await res.json()).errors.locationId, 'unknown');
    assert.equal((await store.getVisit(id)).appointments.length, 0);
  });

  test('PATCH action:move mueve y marca', async () => {
    const { deps: d, store } = deps();
    const id = await conVisita(d);
    const alta = await handleCoordinatorRequest(
      pedir(`/visits/${id}/appointments`, { method: 'POST', body: CITA }),
      d,
    );
    const apptId = (await alta.json()).appointment.id;

    const res = await handleCoordinatorRequest(
      pedir(`/visits/${id}/appointments/${apptId}`, {
        method: 'PATCH',
        body: { action: 'move', startsAt: '2026-03-10T15:00:00.000-07:00' },
      }),
      d,
    );

    assert.equal(res.status, 200);
    const a = (await store.getVisit(id)).appointments[0];
    assert.equal(a.startsAt, '2026-03-10T15:00:00.000-07:00');
    assert.equal(a.status, 'moved');
  });

  test('PATCH action:edit y action:cancel', async () => {
    const { deps: d, store } = deps();
    const id = await conVisita(d);
    const alta = await handleCoordinatorRequest(
      pedir(`/visits/${id}/appointments`, { method: 'POST', body: CITA }),
      d,
    );
    const apptId = (await alta.json()).appointment.id;

    await handleCoordinatorRequest(
      pedir(`/visits/${id}/appointments/${apptId}`, {
        method: 'PATCH',
        body: { action: 'edit', serviceName: 'Tomografía', durationMin: 20, locationId: 'piso27' },
      }),
      d,
    );
    assert.equal((await store.getVisit(id)).appointments[0].serviceName, 'Tomografía');

    await handleCoordinatorRequest(
      pedir(`/visits/${id}/appointments/${apptId}`, { method: 'PATCH', body: { action: 'cancel' } }),
      d,
    );
    assert.equal((await store.getVisit(id)).appointments[0].status, 'cancelled');
  });

  test('una acción inventada da 422, no 500 ni un no-op silencioso', async () => {
    const { deps: d } = deps();
    const id = await conVisita(d);
    const alta = await handleCoordinatorRequest(
      pedir(`/visits/${id}/appointments`, { method: 'POST', body: CITA }),
      d,
    );
    const apptId = (await alta.json()).appointment.id;

    const res = await handleCoordinatorRequest(
      pedir(`/visits/${id}/appointments/${apptId}`, { method: 'PATCH', body: { action: 'borrar' } }),
      d,
    );
    assert.equal(res.status, 422);
    assert.equal((await res.json()).errors.action, 'unsupported');
  });

  test('cita inexistente dentro de una visita que sí existe: 404', async () => {
    const { deps: d } = deps();
    const id = await conVisita(d);
    const res = await handleCoordinatorRequest(
      pedir(`/visits/${id}/appointments/a_fantasma`, { method: 'PATCH', body: { action: 'cancel' } }),
      d,
    );
    assert.equal(res.status, 404);
  });
});

describe('hospedaje y pases', () => {
  test('PUT /lodging guarda y firma', async () => {
    const { deps: d, store } = deps();
    const id = await conVisita(d);
    const res = await handleCoordinatorRequest(
      pedir(`/visits/${id}/lodging`, {
        method: 'PUT',
        body: {
          hotel: 'Quartz Hotel & Spa',
          reservationCode: 'QZ-1',
          checkIn: '2026-03-10T15:00:00.000-07:00',
          checkOut: '2026-03-11T12:00:00.000-07:00',
          breakfastIncluded: true,
        },
      }),
      d,
    );

    assert.equal(res.status, 200);
    const l = (await store.getVisit(id)).lodging;
    assert.equal(l.hotel, 'Quartz Hotel & Spa');
    assert.equal(l.updatedBy, 'ana.ruiz');
  });

  test('POST /passes emite y PATCH revoca, sin borrar', async () => {
    const { deps: d, store } = deps();
    const id = await conVisita(d);
    const alta = await handleCoordinatorRequest(
      pedir(`/visits/${id}/passes`, {
        method: 'POST',
        body: { format: 'image', payload: 'data:image/png;base64,iVBOR', scope: 'torre' },
      }),
      d,
    );
    assert.equal(alta.status, 201);
    const passId = (await alta.json()).qpass.id;

    const res = await handleCoordinatorRequest(
      pedir(`/visits/${id}/passes/${passId}`, { method: 'PATCH', body: { action: 'revoke' } }),
      d,
    );
    assert.equal(res.status, 200);

    const guardado = await store.getVisit(id);
    assert.equal(guardado.passes.length, 1, 'revocar no borra');
    assert.equal(guardado.passes[0].revokedAt, AHORA);
    assert.equal(guardado.passes[0].revokedBy, 'ana.ruiz');
  });
});

describe('el contrato de las mutaciones', () => {
  test('toda mutación devuelve el expediente COMPLETO, no solo lo que cambió', async () => {
    // Es lo que le permite al panel reemplazar su copia local de un golpe
    // en vez de parchearla por su cuenta. Dos coordinadoras tocando la
    // misma visita divergen a la primera si cada panel adivina el
    // resultado; con el registro entero, la última respuesta es la verdad.
    const { deps: d } = deps();
    const id = await conVisita(d);

    const alta = await handleCoordinatorRequest(pedir(`/visits/${id}/appointments`, { method: 'POST', body: CITA }), d);
    const cuerpoAlta = await alta.json();
    assert.ok(cuerpoAlta.record, 'el registro entero');
    assert.equal(cuerpoAlta.record.visit.id, id);
    assert.equal(cuerpoAlta.record.appointments.length, 1);
    // Y la entidad concreta aparte: quien acaba de crearla necesita su id,
    // y buscarlo dentro del registro sería adivinarlo.
    assert.ok(cuerpoAlta.appointment.id);

    const patch = await handleCoordinatorRequest(
      pedir(`/visits/${id}/appointments/${cuerpoAlta.appointment.id}`, {
        method: 'PATCH',
        body: { action: 'cancel' },
      }),
      d,
    );
    const cuerpoPatch = await patch.json();
    assert.equal(cuerpoPatch.record.appointments[0].status, 'cancelled');

    const pase = await handleCoordinatorRequest(
      pedir(`/visits/${id}/passes`, {
        method: 'POST',
        body: { format: 'image', payload: 'data:,x', scope: 'torre' },
      }),
      d,
    );
    const cuerpoPase = await pase.json();
    assert.equal(cuerpoPase.record.passes.length, 1);
    // El registro completo SÍ trae token: es la ruta de una visita concreta
    // y el panel necesita poder reenviarle el enlace al paciente.
    assert.ok(cuerpoPase.record.visit.token);
  });
});

describe('la firma de auditoría', () => {
  test('sale de la sesión, NUNCA del cuerpo', async () => {
    // Si el cliente pudiera mandar `by` o `createdBy`, las cuentas
    // individuales de la Etapa C serían decorativas: cualquiera firmaría
    // con el nombre de cualquiera.
    const { deps: d, store } = deps({ guardia: { cuenta: { username: 'beto.lara', name: 'Beto Lara' } } });
    const id = await conVisita(d);
    await handleCoordinatorRequest(
      pedir(`/visits/${id}/appointments`, {
        method: 'POST',
        body: { ...CITA, createdBy: 'ana.ruiz', updatedBy: 'ana.ruiz', by: 'ana.ruiz' },
      }),
      d,
    );

    const a = (await store.getVisit(id)).appointments[0];
    assert.equal(a.createdBy, 'beto.lara');
    assert.equal(a.updatedBy, 'beto.lara');
  });

  test('dos personas distintas dejan rastros distintos en la misma visita', async () => {
    const ana = deps();
    const id = await conVisita(ana.deps);
    const alta = await handleCoordinatorRequest(
      pedir(`/visits/${id}/appointments`, { method: 'POST', body: CITA }),
      ana.deps,
    );
    const apptId = (await alta.json()).appointment.id;

    // Mismo almacén, otra sesión: es el escenario real de dos turnos.
    const betoDeps = {
      ...ana.deps,
      requireCoordinator: guardiaDoble({ cuenta: { username: 'beto.lara', name: 'Beto Lara' } }).requireCoordinator,
    };
    await handleCoordinatorRequest(
      pedir(`/visits/${id}/appointments/${apptId}`, { method: 'PATCH', body: { action: 'cancel' } }),
      betoDeps,
    );

    const a = (await ana.store.getVisit(id)).appointments[0];
    assert.equal(a.createdBy, 'ana.ruiz', 'quién la creó no se reescribe');
    assert.equal(a.updatedBy, 'beto.lara', 'quién la canceló sí queda');
  });
});

describe('encabezados', () => {
  test('no-store y nosniff en todas las respuestas', async () => {
    // Es un expediente clínico: que no quede en la caché del navegador ni
    // en la de ningún intermediario (PRD §6.2). Misma regla que el endpoint
    // del paciente.
    const { deps: d } = deps();
    const id = await conVisita(d);

    for (const res of [
      await handleCoordinatorRequest(pedir('/visits'), d),
      await handleCoordinatorRequest(pedir(`/visits/${id}`), d),
      await handleCoordinatorRequest(pedir('/visits/v_fantasma'), d),
    ]) {
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    }
  });
});

describe('fallos del almacén', () => {
  test('un almacén que truena da 500 sin filtrar el detalle', async () => {
    const { deps: d } = deps();
    const roto = {
      ...d,
      store: {
        ...d.store,
        async listVisits() {
          throw new Error('BLOBS_TOKEN no está definido');
        },
      },
    };
    const res = await handleCoordinatorRequest(pedir('/visits'), roto);
    assert.equal(res.status, 500);
    const texto = await res.text();
    assert.equal(texto.includes('BLOBS_TOKEN'), false, 'el detalle se queda del lado del servidor');
  });
});

// =====================================================================
// Etapa G — traslados.
// =====================================================================

const TRASLADO = {
  kind: 'arrival',
  scheduledAt: '2026-03-10T06:00:00.000-07:00',
  meetingPointId: 'tij_terminal',
  flightNumber: 'AM 654',
  driver: { name: 'Juan Pérez', phone: '+526641234567' },
  vehicle: { type: 'van', make: 'Toyota', model: 'Hiace', color: 'blanca', plate: 'ABC-123-D' },
};

describe('traslados', () => {
  test('POST agrega, persiste y firma', async () => {
    const { deps: d, store } = deps();
    const visitId = await conVisita(d);

    const res = await handleCoordinatorRequest(
      pedir(`/visits/${visitId}/transfers`, { method: 'POST', body: TRASLADO }), d,
    );
    assert.equal(res.status, 201);
    const cuerpo = await res.json();
    assert.equal(cuerpo.transfer.driver.name, 'Juan Pérez');
    assert.equal(cuerpo.transfer.createdBy, 'ana.ruiz');

    const guardado = await store.getVisit(visitId);
    assert.equal(guardado.transfers.length, 1, 'quedó escrito, no solo en la respuesta');
    assert.equal(guardado.transfers[0].meetingPointId, 'tij_terminal');
  });

  test('rechaza un punto de encuentro fuera del catálogo con 422', async () => {
    const { deps: d, store } = deps();
    const visitId = await conVisita(d);

    const res = await handleCoordinatorRequest(
      pedir(`/visits/${visitId}/transfers`, { method: 'POST', body: { ...TRASLADO, meetingPointId: 'la esquina' } }), d,
    );
    assert.equal(res.status, 422);
    assert.deepEqual((await res.json()).errors, { meetingPointId: 'unknown' });

    const guardado = await store.getVisit(visitId);
    assert.equal(guardado.transfers, undefined, 'un 422 no debe dejar rastro en el expediente');
  });

  test('rechaza un teléfono sin clave de país con 422 — el <select> no cubre el texto libre', async () => {
    const { deps: d } = deps();
    const visitId = await conVisita(d);

    const res = await handleCoordinatorRequest(
      pedir(`/visits/${visitId}/transfers`, {
        method: 'POST',
        body: { ...TRASLADO, driver: { name: 'Juan', phone: '664 123 4567' } },
      }), d,
    );
    assert.equal(res.status, 422);
    assert.deepEqual((await res.json()).errors, { 'driver.phone': 'invalid' });
  });

  test('PATCH action:edit actualiza y firma a quien editó', async () => {
    const { deps: d } = deps();
    const visitId = await conVisita(d);
    const alta = await (await handleCoordinatorRequest(
      pedir(`/visits/${visitId}/transfers`, { method: 'POST', body: TRASLADO }), d,
    )).json();

    const res = await handleCoordinatorRequest(
      pedir(`/visits/${visitId}/transfers/${alta.transfer.id}`, {
        method: 'PATCH',
        body: { action: 'edit', ...TRASLADO, driver: { name: 'Beto Lara', phone: '+526649876543' } },
      }), d,
    );
    assert.equal(res.status, 200);
    const cuerpo = await res.json();
    assert.equal(cuerpo.transfer.driver.name, 'Beto Lara');
    assert.equal(cuerpo.transfer.createdBy, 'ana.ruiz', 'quién lo creó no se reescribe');
  });

  test('PATCH action:cancel marca sin borrar', async () => {
    const { deps: d, store } = deps();
    const visitId = await conVisita(d);
    const alta = await (await handleCoordinatorRequest(
      pedir(`/visits/${visitId}/transfers`, { method: 'POST', body: TRASLADO }), d,
    )).json();

    const res = await handleCoordinatorRequest(
      pedir(`/visits/${visitId}/transfers/${alta.transfer.id}`, { method: 'PATCH', body: { action: 'cancel' } }), d,
    );
    assert.equal(res.status, 200);
    assert.equal((await res.json()).transfer.status, 'cancelled');

    const guardado = await store.getVisit(visitId);
    assert.equal(guardado.transfers.length, 1, 'cancelar no borra');
  });

  test('una acción inventada da 422, no un no-op silencioso', async () => {
    const { deps: d } = deps();
    const visitId = await conVisita(d);
    const alta = await (await handleCoordinatorRequest(
      pedir(`/visits/${visitId}/transfers`, { method: 'POST', body: TRASLADO }), d,
    )).json();

    const res = await handleCoordinatorRequest(
      pedir(`/visits/${visitId}/transfers/${alta.transfer.id}`, { method: 'PATCH', body: { action: 'borrar' } }), d,
    );
    assert.equal(res.status, 422);
    assert.deepEqual((await res.json()).errors, { action: 'unsupported' });
  });

  test('traslado inexistente dentro de una visita que sí existe: 404', async () => {
    const { deps: d } = deps();
    const visitId = await conVisita(d);
    const res = await handleCoordinatorRequest(
      pedir(`/visits/${visitId}/transfers/t_inventado`, { method: 'PATCH', body: { action: 'cancel' } }), d,
    );
    assert.equal(res.status, 404);
  });

  test('el método equivocado da 405 en las dos rutas', async () => {
    const { deps: d } = deps();
    const visitId = await conVisita(d);
    for (const [ruta, method] of [[`/visits/${visitId}/transfers`, 'PUT'], [`/visits/${visitId}/transfers/t_1`, 'POST']]) {
      const res = await handleCoordinatorRequest(pedir(ruta, { method, body: {} }), d);
      assert.equal(res.status, 405, `${method} ${ruta}`);
    }
  });

  test('una visita que no existe da 404 igual que en toda ruta', async () => {
    const { deps: d } = deps();
    const res = await handleCoordinatorRequest(
      pedir('/visits/v_fantasma/transfers', { method: 'POST', body: TRASLADO }), d,
    );
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'not_found' });
  });

  // Lo que amarra la Etapa G con R1: agregar el traslado de regreso tiene
  // que alargar la vida del enlace del paciente, y eso solo se ve mirando
  // el expediente que devuelve la mutación.
  test('el expediente devuelto trae los traslados, para que el panel reemplace su copia entera', async () => {
    const { deps: d } = deps();
    const visitId = await conVisita(d);
    const res = await handleCoordinatorRequest(
      pedir(`/visits/${visitId}/transfers`, { method: 'POST', body: TRASLADO }), d,
    );
    const { record } = await res.json();
    assert.equal(record.transfers.length, 1);
    assert.equal(record.visit.id, visitId);
  });
});

// ---------------------------------------------------------------------
// Etapa I — POST /import: un itinerario de Word entero, de una vez (D83).
// ---------------------------------------------------------------------

describe('POST /import — la importación del itinerario', () => {
  const CITAS = [
    { startsAt: '2026-03-10T08:00:00.000-07:00', durationMin: 30, serviceName: 'BLOOD WORK', locationId: 'compass', prep: 'FASTING 8-12 HOURS', details: 'URINALYSIS, TSH' },
    { startsAt: '2026-03-10T11:00:00.000-07:00', durationMin: 30, serviceName: 'OPHTHALMOLOGY CONSULTATION', locationId: 'piso11', doctor: 'DR. ORTEGA' },
    { startsAt: '2026-03-10T14:00:00.000-07:00', durationMin: 120, serviceName: 'FULL-BODY MRI', locationId: 'compass' },
  ];

  const importar = (d, body) => handleCoordinatorRequest(pedir('/import', { method: 'POST', body }), d);

  test('crea la visita y sus citas en una sola llamada y responde 201', async () => {
    const { deps: d } = deps();
    const res = await importar(d, { visit: VISITA, appointments: CITAS });

    assert.equal(res.status, 201);
    const { record } = await res.json();
    assert.equal(record.visit.patientFirstName, 'Ana');
    assert.deepEqual(record.appointments.map((a) => a.serviceName), ['BLOOD WORK', 'OPHTHALMOLOGY CONSULTATION', 'FULL-BODY MRI']);
    assert.equal(record.appointments[0].prep, 'FASTING 8-12 HOURS');
    assert.equal(record.appointments[1].doctor, 'DR. ORTEGA');
  });

  test('la respuesta trae el token, que es lo que arma el QR del paciente', async () => {
    // Sin esto la coordinadora importaría el itinerario y se quedaría sin
    // manera de entregárselo, que es la mitad del trabajo (Etapa E).
    const { deps: d } = deps();
    const { record } = await (await importar(d, { visit: VISITA, appointments: CITAS })).json();
    assert.ok(record.visit.token, 'el token tiene que salir aquí');
  });

  test('lo importado queda guardado, no solo devuelto', async () => {
    const { deps: d, store } = deps();
    const { record } = await (await importar(d, { visit: VISITA, appointments: CITAS })).json();

    const guardado = await store.getVisit(record.visit.id);
    assert.equal(guardado.appointments.length, 3);
  });

  test('las citas quedan firmadas por la sesión, nunca por el cuerpo', async () => {
    const { deps: d } = deps({ guardia: { cuenta: { username: 'beti.ramirez', name: 'Beatriz' } } });
    const conMentira = CITAS.map((c) => ({ ...c, createdBy: 'alguien.más' }));
    const { record } = await (await importar(d, { visit: VISITA, appointments: conMentira })).json();

    for (const a of record.appointments) assert.equal(a.createdBy, 'beti.ramirez');
  });

  test('una fila mala da 422 diciendo CUÁL fila y por qué', async () => {
    const { deps: d } = deps();
    const citas = CITAS.map((c) => ({ ...c }));
    citas[1].locationId = 'piso13';

    const res = await importar(d, { visit: VISITA, appointments: citas });
    assert.equal(res.status, 422);
    const cuerpo = await res.json();
    assert.equal(cuerpo.error, 'invalid');
    assert.deepEqual(cuerpo.errors, { appointments: [{ index: 1, errors: { locationId: 'unknown' } }] });
  });

  test('si una fila falla, la visita NO se crea', async () => {
    // Lo que de verdad importa de esta ruta. Si la visita quedara creada y
    // vacía, la coordinadora corregiría la fila, volvería a importar, y
    // tendría dos expedientes del mismo paciente sin saberlo.
    const { deps: d, store } = deps();
    const citas = CITAS.map((c) => ({ ...c }));
    citas[2].serviceName = '';

    const res = await importar(d, { visit: VISITA, appointments: citas });
    assert.equal(res.status, 422);
    assert.deepEqual(await store.listVisits(), [], 'no debe quedar ni la visita vacía');
  });

  test('una visita mal formada da 422 por campo, sin tocar el almacén', async () => {
    const { deps: d, store } = deps();
    const res = await importar(d, { visit: { ...VISITA, patientFirstName: '' }, appointments: CITAS });

    assert.equal(res.status, 422);
    assert.equal((await res.json()).errors.patientFirstName, 'required');
    assert.deepEqual(await store.listVisits(), []);
  });

  test('los errores de la visita y de las filas se reportan JUNTOS', async () => {
    // Corregir el nombre del paciente, reenviar, y recién entonces enterarse
    // de que además había una fila mala es el viaje de ida y vuelta que
    // hace abandonar una importación.
    const { deps: d } = deps();
    const citas = CITAS.map((c) => ({ ...c }));
    citas[0].locationId = 'inventada';

    const res = await importar(d, { visit: { ...VISITA, patientFirstName: '' }, appointments: citas });
    const { errors } = await res.json();

    assert.equal(errors.patientFirstName, 'required');
    assert.deepEqual(errors.appointments, [{ index: 0, errors: { locationId: 'unknown' } }]);
  });

  test('sin citas es 422: importar un documento vacío no es un éxito', async () => {
    const { deps: d, store } = deps();
    const res = await importar(d, { visit: VISITA, appointments: [] });

    assert.equal(res.status, 422);
    assert.equal((await res.json()).errors.appointments, 'required');
    assert.deepEqual(await store.listVisits(), []);
  });

  test('un cuerpo sin las dos llaves da 422, no 500', async () => {
    const { deps: d } = deps();
    for (const cuerpo of [{}, { visit: VISITA }, { appointments: CITAS }, { visit: null, appointments: null }]) {
      const res = await importar(d, cuerpo);
      assert.equal(res.status, 422, `${JSON.stringify(cuerpo)} debería ser 422`);
    }
  });

  test('un JSON roto da 400', async () => {
    const { deps: d } = deps();
    const res = await handleCoordinatorRequest(
      new Request(url('/import'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `nc_session=${SESION}` },
        body: '{esto no es json',
      }),
      d,
    );
    assert.equal(res.status, 400);
  });

  test('GET /import da 405, no 404', async () => {
    const { deps: d } = deps();
    assert.equal((await handleCoordinatorRequest(pedir('/import'), d)).status, 405);
  });

  // Etapa L — El mismo documento trae ahora hotel y traslados. Siguen siendo
  // UNA escritura todo o nada (D107): si el traslado de regreso no pasa, no
  // se crea ni la visita. La alternativa —visita con citas y sin traslado—
  // es indistinguible de una importación completa hasta que el paciente se
  // queda esperando en el aeropuerto.
  const HOSPEDAJE = {
    hotel: 'Hotel Inventado & Spa',
    checkIn: '2026-03-10T15:00:00.000-07:00',
    checkOut: '2026-03-12T12:00:00.000-07:00',
    roomType: 'STDB | Standard Double',
    nights: 2,
    occupancy: '2 adults, 2 children',
    total: '$1,234.00 MXN',
  };

  const TRASLADOS = [
    {
      kind: 'arrival',
      scheduledAt: '2026-03-10T09:00:00.000-07:00',
      meetingPointId: 'san_diego_airport',
      flightNumber: 'az1950h',
      driver: { name: 'Nombre Inventado', phone: '+526640000000' },
      vehicle: { type: 'suv', plate: 'xyz123a' },
    },
    {
      kind: 'departure',
      scheduledAt: '2026-03-12T17:00:00.000-07:00',
      meetingPointId: 'quartz',
      driver: { name: 'Nombre Inventado', phone: '+526640000000' },
    },
  ];

  test('el itinerario completo —visita, citas, hotel y traslados— en un solo 201', async () => {
    const { deps: d } = deps();
    const res = await importar(d, {
      visit: VISITA, appointments: CITAS, lodging: HOSPEDAJE, transfers: TRASLADOS,
    });

    assert.equal(res.status, 201);
    const { record } = await res.json();
    assert.equal(record.lodging.hotel, 'Hotel Inventado & Spa');
    assert.equal(record.lodging.total, '$1,234.00 MXN');
    assert.equal(record.lodging.nights, 2);
    assert.deepEqual(record.transfers.map((t) => t.kind), ['arrival', 'departure']);
    assert.equal(record.transfers[0].flightNumber, 'AZ1950H');
  });

  test('lo importado queda GUARDADO, no solo devuelto', async () => {
    const { deps: d, store } = deps();
    const { record } = await (await importar(d, {
      visit: VISITA, appointments: CITAS, lodging: HOSPEDAJE, transfers: TRASLADOS,
    })).json();

    const guardado = await store.getVisit(record.visit.id);
    assert.equal(guardado.lodging.hotel, 'Hotel Inventado & Spa');
    assert.equal(guardado.transfers.length, 2);
  });

  test('el hotel y los traslados son opcionales: cuatro de los cinco documentos no los traen', async () => {
    const { deps: d } = deps();
    const res = await importar(d, { visit: VISITA, appointments: CITAS });
    assert.equal(res.status, 201);
    const { record } = await res.json();
    assert.equal(record.lodging, null);
    assert.deepEqual(record.transfers ?? [], []);
  });

  test('el hotel y los traslados quedan firmados por la sesión, nunca por el cuerpo', async () => {
    const { deps: d } = deps({ guardia: { cuenta: { username: 'beti.ramirez', name: 'Beatriz' } } });
    const { record } = await (await importar(d, {
      visit: VISITA,
      appointments: CITAS,
      lodging: { ...HOSPEDAJE, updatedBy: 'alguien.más' },
      transfers: TRASLADOS.map((t) => ({ ...t, createdBy: 'alguien.más' })),
    })).json();

    assert.equal(record.lodging.updatedBy, 'beti.ramirez');
    for (const t of record.transfers) assert.equal(t.createdBy, 'beti.ramirez');
  });

  test('si un traslado falla, NO se crea la visita ni nada más', async () => {
    const { deps: d, store } = deps();
    const traslados = TRASLADOS.map((t) => ({ ...t }));
    traslados[1].meetingPointId = 'un_punto_que_no_existe';

    const res = await importar(d, {
      visit: VISITA, appointments: CITAS, lodging: HOSPEDAJE, transfers: traslados,
    });

    assert.equal(res.status, 422);
    assert.deepEqual(await store.listVisits(), [], 'no debe quedar ni la visita vacía');
  });

  test('si el hospedaje falla, tampoco', async () => {
    const { deps: d, store } = deps();
    const res = await importar(d, {
      visit: VISITA, appointments: CITAS, lodging: { ...HOSPEDAJE, hotel: '' },
    });

    assert.equal(res.status, 422);
    assert.equal((await res.json()).errors.lodging.hotel, 'required');
    assert.deepEqual(await store.listVisits(), []);
  });

  test('los errores de las TRES partes vienen juntos, en un solo viaje', async () => {
    const { deps: d } = deps();
    const citas = CITAS.map((c) => ({ ...c }));
    citas[0].locationId = 'inventada';
    const traslados = TRASLADOS.map((t) => ({ ...t }));
    traslados[1].kind = 'redondo';

    const res = await importar(d, {
      visit: { ...VISITA, patientFirstName: '' },
      appointments: citas,
      lodging: { ...HOSPEDAJE, checkOut: HOSPEDAJE.checkIn },
      transfers: traslados,
    });

    assert.equal(res.status, 422);
    const { errors } = await res.json();
    assert.equal(errors.patientFirstName, 'required');
    assert.deepEqual(errors.appointments, [{ index: 0, errors: { locationId: 'unknown' } }]);
    assert.deepEqual(errors.lodging, { checkOut: 'order' });
    assert.deepEqual(errors.transfers, [{ index: 1, errors: { kind: 'unknown' } }]);
  });

  test('un hospedaje o unos traslados que no son lo que dicen ser dan 422, no 500', async () => {
    const { deps: d, store } = deps();
    for (const cuerpo of [
      { lodging: 'un hotel' },
      { lodging: [] },
      { transfers: 'dos' },
      { transfers: [null] },
      { transfers: [{}] },
    ]) {
      const res = await importar(d, { visit: VISITA, appointments: CITAS, ...cuerpo });
      assert.equal(res.status, 422, `${JSON.stringify(cuerpo)} debería ser 422`);
    }
    assert.deepEqual(await store.listVisits(), []);
  });

  test('una lista de traslados VACÍA no es un error: es un documento sin transporte', async () => {
    // `addTransfers` rechaza la lista vacía, y con razón: nadie importa cero
    // traslados a propósito. Pero aquí la llave viene del intérprete, que
    // devuelve [] cuando el Word no traía tabla de transporte.
    const { deps: d } = deps();
    const res = await importar(d, { visit: VISITA, appointments: CITAS, transfers: [] });
    assert.equal(res.status, 201);
  });
});
