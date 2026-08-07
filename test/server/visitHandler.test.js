// Etapa B — el manejador HTTP, probado sin levantar Netlify ni instalar
// nada. Se escribe antes que src/server/visitHandler.js (rojo esperado).
//
// Netlify Functions v2 recibe un `Request` estándar y devuelve un
// `Response` estándar, los dos globales en Node ≥18. Por eso el manejador
// se puede probar de verdad —construyendo la petición y leyendo la
// respuesta— en vez de a través de un mock de plataforma. La Function real
// (netlify/functions/visit.mjs) queda como cinco líneas que enchufan Blobs
// y el reloj, sin ninguna decisión propia.
//
// Este es el ÚNICO endpoint de la Etapa B, y es de solo lectura a
// propósito: publicar el camino de escritura antes de que exista la
// autenticación de la Etapa C sería dejar una API donde cualquiera crea
// visitas con datos de salud.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { handleVisitRequest } from '../../src/server/visitHandler.js';
import { createVisitStore } from '../../src/server/visitStore.js';

const NOW = '2026-03-10T10:00-07:00';
const URL_BASE = 'https://nchpatient.netlify.app/api/visit';

const INPUT = {
  patientFirstName: 'María',
  lang: 'es',
  startsAt: '2026-03-10T08:00-07:00',
  endsAt: '2026-03-11T09:30-07:00',
};

function memoryKv() {
  const data = new Map();
  return {
    async get(key) {
      return data.has(key) ? structuredClone(data.get(key)) : null;
    },
    async set(key, value) {
      data.set(key, structuredClone(value));
    },
    async delete(key) {
      data.delete(key);
    },
    async list(prefix) {
      return [...data.keys()].filter((k) => k.startsWith(prefix));
    },
  };
}

function get(token, { url = URL_BASE, method = 'GET' } = {}) {
  const headers = token === undefined ? {} : { 'X-Visit-Token': token };
  return new Request(url, { method, headers });
}

async function seeded() {
  const store = createVisitStore(memoryKv());
  const record = await store.createVisit(INPUT, NOW);
  return { store, record, token: record.visit.token };
}

describe('handleVisitRequest — camino feliz', () => {
  test('200 con el registro completo', async () => {
    const { store, token } = await seeded();
    const res = await handleVisitRequest(get(token), store, NOW);

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ['appointments', 'lodging', 'passes', 'transfers', 'visit']);
    assert.equal(body.visit.patientFirstName, 'María');
  });

  test('la respuesta NO trae el token de vuelta', async () => {
    const { store, token } = await seeded();
    const res = await handleVisitRequest(get(token), store, NOW);
    const text = await res.text();

    assert.doesNotMatch(text, new RegExp(token), 'el token viajó en el cuerpo');
    assert.equal(JSON.parse(text).visit.token, undefined);
  });

  test('Content-Type JSON y Cache-Control no-store', async () => {
    const { store, token } = await seeded();
    const res = await handleVisitRequest(get(token), store, NOW);

    assert.match(res.headers.get('content-type'), /application\/json/);
    // Son datos de salud: ni el navegador ni un intermediario deben
    // guardarlos en disco (PRD §6.2 sube el nivel de protección al mostrar
    // el nombre del estudio).
    assert.match(res.headers.get('cache-control'), /no-store/);
  });

  test('R3: un pase revocado no sale del servidor siquiera', async () => {
    const store = createVisitStore(memoryKv());
    const record = await store.createVisit(INPUT, NOW);
    record.passes.push(
      { id: 'q1', visitId: record.visit.id, appointmentId: null, format: 'qr', payload: 'VIVO', scope: 'torre', validFrom: NOW, validUntil: null, revokedAt: null, issuedAt: NOW },
      { id: 'q2', visitId: record.visit.id, appointmentId: null, format: 'qr', payload: 'REVOCADO', scope: 'torre', validFrom: NOW, validUntil: null, revokedAt: NOW, issuedAt: NOW }
    );
    await store.saveVisit(record);

    const res = await handleVisitRequest(get(record.visit.token), store, NOW);
    const text = await res.text();

    assert.doesNotMatch(text, /REVOCADO/, 'un pase revocado llegó al dispositivo');
    assert.match(text, /VIVO/);
    assert.equal(JSON.parse(text).passes.length, 1);
  });
});

describe('handleVisitRequest — INV-3: nada distingue inexistente de vencida', () => {
  async function bodyAndStatus(res) {
    return { status: res.status, body: await res.text(), headers: [...res.headers].sort() };
  }

  test('token inexistente y token vencido dan respuestas idénticas', async () => {
    const { store, token } = await seeded();
    const despues = '2026-03-13T09:31-07:00';

    const vencida = await bodyAndStatus(await handleVisitRequest(get(token), store, despues));
    const inexistente = await bodyAndStatus(
      await handleVisitRequest(get('NOEXISTE00000000000000'), store, despues)
    );

    assert.equal(vencida.status, 404);
    assert.deepEqual(vencida, inexistente, 'las dos respuestas se pueden distinguir');
  });

  test('un token mal formado da la MISMA respuesta que uno inexistente', async () => {
    const { store } = await seeded();
    const malFormado = await bodyAndStatus(await handleVisitRequest(get('demo-token-v_1'), store, NOW));
    const inexistente = await bodyAndStatus(
      await handleVisitRequest(get('NOEXISTE00000000000000'), store, NOW)
    );

    // Un 400 aquí diría "ese sí tenía forma de token" — un oráculo gratis
    // para quien esté probando tokens a ciegas.
    assert.equal(malFormado.status, 404);
    assert.deepEqual(malFormado, inexistente);
  });

  test('sin encabezado de token: también 404, no 400', async () => {
    const { store } = await seeded();
    const res = await handleVisitRequest(get(undefined), store, NOW);
    assert.equal(res.status, 404);
  });

  test('el cuerpo del 404 no dice nada de la visita', async () => {
    const { store, record } = await seeded();
    const res = await handleVisitRequest(get('NOEXISTE00000000000000'), store, NOW);
    const text = await res.text();

    assert.doesNotMatch(text, /María/);
    assert.doesNotMatch(text, new RegExp(record.visit.id));
  });
});

describe('handleVisitRequest — el token no viaja en la URL', () => {
  test('un token en la query string NO se acepta', async () => {
    const { store, token } = await seeded();
    const res = await handleVisitRequest(
      new Request(`${URL_BASE}?t=${token}`, { method: 'GET' }),
      store,
      NOW
    );

    // La URL completa queda en los registros de acceso de la plataforma,
    // en el historial del navegador y en el encabezado Referer. El token
    // es la credencial completa de la visita: va en un encabezado.
    assert.equal(res.status, 404);
  });
});

describe('handleVisitRequest — método y errores', () => {
  test('405 en cualquier método que no sea GET', async () => {
    const { store, token } = await seeded();
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const res = await handleVisitRequest(get(token, { method }), store, NOW);
      assert.equal(res.status, 405, `${method} no dio 405`);
    }
  });

  test('HEAD tampoco: no hay razón para exponerlo', async () => {
    const { store, token } = await seeded();
    assert.equal((await handleVisitRequest(get(token, { method: 'HEAD' }), store, NOW)).status, 405);
  });

  test('un `now` en la query string se ignora: la caducidad usa el reloj del servidor', async () => {
    const { store, token } = await seeded();
    const despues = '2026-03-13T09:31-07:00';
    const res = await handleVisitRequest(
      new Request(`${URL_BASE}?now=${encodeURIComponent(NOW)}`, {
        method: 'GET',
        headers: { 'X-Visit-Token': token },
      }),
      store,
      despues
    );

    // D20 dejó `?now=` como recurso de la demo del navegador. Aceptarlo
    // aquí convertiría R1 en opcional: cualquiera con un token vencido
    // volvería a abrir la visita pidiendo otra hora.
    assert.equal(res.status, 404);
  });

  test('si el almacén revienta: 500 y el error no se filtra al cuerpo', async () => {
    const roto = {
      async getVisitByToken() {
        throw new Error('BLOBS_TOKEN ausente en el entorno de producción');
      },
    };
    const res = await handleVisitRequest(get('AAAAAAAAAAAAAAAAAAAAAA'), roto, NOW);

    assert.equal(res.status, 500);
    const text = await res.text();
    assert.doesNotMatch(text, /BLOBS_TOKEN/, 'el mensaje interno salió al cliente');
  });
});

// Etapa G — el hueco más fácil de no ver. Este 200 se arma campo por campo,
// así que todo lo demás de la etapa puede estar bien —la mutación, la ruta
// del panel, la caducidad, la pantalla— y el traslado no llegar nunca al
// teléfono porque falta una línea aquí.
describe('handleVisitRequest — traslados llegan al paciente', () => {
  const TRASLADO = {
    id: 't_1',
    visitId: 'v_1',
    kind: 'arrival',
    scheduledAt: '2026-03-10T06:00-07:00',
    meetingPointId: 'tij_terminal',
    flightNumber: 'AM 654',
    driver: { name: 'Juan Pérez', phone: '+526641234567' },
    vehicle: { type: 'van', make: 'Toyota', model: 'Hiace', color: 'blanca', plate: 'ABC-123-D' },
    notes: '',
    status: 'scheduled',
  };

  test('el traslado, con chofer y vehículo, viaja entero al teléfono', async () => {
    const { store, record, token } = await seeded();
    record.transfers = [TRASLADO];
    await store.saveVisit(record);

    const body = await (await handleVisitRequest(get(token), store, NOW)).json();
    assert.equal(body.transfers.length, 1);
    assert.equal(body.transfers[0].driver.phone, '+526641234567', 'el teléfono del chofer es el dato entero de la etapa');
    assert.equal(body.transfers[0].vehicle.plate, 'ABC-123-D');
    assert.equal(body.transfers[0].meetingPointId, 'tij_terminal');
  });

  // Un traslado cancelado SÍ se manda, al revés que un pase revocado. No es
  // una incoherencia: revocar un pase le quita al paciente un permiso que
  // ya no debe tener, y por eso R3 lo filtra antes de que salga del
  // servidor. Cancelar un traslado es información que el paciente necesita
  // —tachada, para que no se plante a esperar un coche que no va a llegar.
  test('un traslado cancelado también llega, tachado, no desaparecido', async () => {
    const { store, record, token } = await seeded();
    record.transfers = [{ ...TRASLADO, status: 'cancelled' }];
    await store.saveVisit(record);

    const body = await (await handleVisitRequest(get(token), store, NOW)).json();
    assert.equal(body.transfers.length, 1);
    assert.equal(body.transfers[0].status, 'cancelled');
  });

  // Compatibilidad con lo ya desplegado: los expedientes que hoy están en
  // Blobs no traen la llave. La app tiene que recibir [] y no undefined, o
  // el itinerario de un paciente con visita vieja reventaría al pintar.
  test('un expediente guardado antes de esta etapa contesta transfers: []', async () => {
    const { store, record, token } = await seeded();
    assert.equal(record.transfers, undefined, 'la visita recién creada representa el caso viejo');

    const body = await (await handleVisitRequest(get(token), store, NOW)).json();
    assert.deepEqual(body.transfers, []);
  });
});
