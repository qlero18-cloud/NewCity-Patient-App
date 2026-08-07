// Etapa D — el cable de pruebas entre el panel y el servidor.
//
// El store del panel (src/ui/coordinatorStore.js) habla con un objeto
// `api` que solo sabe `request(method, path, body)`. En producción eso es
// createHttpApi (fetch de verdad); aquí es esto: la misma firma, pero la
// petición no sale a ninguna parte — se le entrega al handler real
// (src/server/coordinatorHandler.js) contra un almacén en memoria.
//
// Un doble escrito a mano habría sido más corto, y es lo que hace
// test/ui/coordinatorStore.test.js para fijar el manejo de CADA código de
// respuesta uno por uno. Pero para las pruebas de pantalla ese doble
// tendría que fingir la validación del servidor, y una copia a mano de las
// reglas se desincroniza en silencio: la pantalla seguiría "pasando"
// mientras el servidor real rechaza lo que ella manda. Con esto, si el
// servidor cambia un motivo de error o el orden de un campo, las pruebas
// de pantalla lo ven en la misma corrida.
//
// Lo único que se finge es el guardia de sesión (Etapa C): montar cuentas
// y firmar cookies no aporta nada a una prueba de itinerario, y ya tiene
// sus propias pruebas en test/server/authHandler.test.js.

import { handleCoordinatorRequest, COORDINATOR_PREFIX } from '../../src/server/coordinatorHandler.js';
import { createVisitStore } from '../../src/server/visitStore.js';
import { createCoordinatorStore } from '../../src/ui/coordinatorStore.js';

export const AHORA = '2026-03-10T10:00:00.000-07:00';
export const CUENTA = 'ana.ruiz';

// structuredClone en los dos sentidos: sin eso el "almacén" devolvería el
// mismo objeto que ya tiene el llamador, y una mutación accidental del
// panel se vería como persistida sin haber escrito nada. Blobs no perdona
// eso, y la prueba tampoco debería.
export function memoriaKv() {
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

// `now` es un parámetro y no el reloj del sistema: las pruebas comparan
// contra horas fijas, y una prueba que dependa de cuándo se corre falla
// sola de madrugada.
export function createLoopbackApi({ now = AHORA, autenticado = true, by = CUENTA } = {}) {
  let contador = 0;
  const kv = memoriaKv();
  const servidor = createVisitStore(kv, {
    generateToken: () => `tok${(contador += 1)}`.padEnd(22, 'x'),
    generateVisitId: () => `v_${(contador += 1)}`,
  });

  const llamadas = [];

  const deps = {
    store: servidor,
    now,
    newId: (p) => `${p}_${(contador += 1)}`,
    async requireCoordinator() {
      if (autenticado) return { ok: true, account: { username: by } };
      return { ok: false, response: new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401 }) };
    },
  };

  return {
    kv,
    servidor,
    llamadas,
    // Se cambia en caliente para probar "la sesión se cayó a mitad del
    // turno", que es cuando de verdad duele y no cuando se abre el panel.
    set autenticado(v) {
      autenticado = v;
    },
    async request(method, path, body) {
      llamadas.push({ method, path, body });
      const init = { method };
      if (body !== undefined) {
        init.body = JSON.stringify(body);
        init.headers = { 'content-type': 'application/json' };
      }
      const res = await handleCoordinatorRequest(new Request(`https://nch.test${COORDINATOR_PREFIX}${path}`, init), deps);
      // Mismo contrato que createHttpApi: { status, body }. 204 no trae
      // cuerpo; el resto se lee como JSON.
      if (res.status === 204) return { status: 204, body: null };
      return { status: res.status, body: await res.json() };
    },
  };
}

// El atajo que usan casi todas las pruebas de pantalla: un panel ya
// conectado, con una visita creada y cargada.
export async function panelConVisita(datos = {}, opciones = {}) {
  const api = createLoopbackApi(opciones);
  const store = createCoordinatorStore({ api });
  const res = await store.createVisit({
    patientFirstName: 'Ana',
    lang: 'es',
    startsAt: '2026-03-10T00:00-07:00',
    endsAt: '2026-03-12T00:00-07:00',
    ...datos,
  });
  if (!res.ok) throw new Error(`la visita de prueba no se creó: ${JSON.stringify(res)}`);
  return { store, api, visit: res.visit };
}
