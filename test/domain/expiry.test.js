// Fase 01 — pruebas de R1 (PRD §8, casos 1a–1g).
// Se escriben antes que src/domain/expiry.js: deben fallar ahora porque el
// módulo no existe todavía (rojo esperado), no por un error de sintaxis.
//
// Fixture inline v_demo1, copiada literal del PRD §8. No depende de
// src/data/fixtures.js (fase 03): la fase 01 no depende de nada.
//
// Etapa G — las dos funciones pasan a recibir el EXPEDIENTE completo
// ({ visit, appointments, lodging, transfers }) en vez de argumentos
// posicionales, y `transfers` entra al cálculo. El porqué de la firma está
// en D69: con un cuarto posicional, un punto de llamada olvidado le pasaba
// `now` a `transfers` y dejaba `now` en undefined; `instantMs(undefined)`
// es NaN y `NaN > x` es false, así que el enlace habría dejado de caducar
// EN SILENCIO. Con el expediente, ese mismo olvido revienta.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeExpiresAt, isExpired } from '../../src/domain/expiry.js';

const visit = {
  id: 'v_demo1',
  token: 'tok_demo1',
  patientFirstName: 'María',
  lang: 'es',
  startsAt: '2026-03-10T08:00-07:00',
  endsAt: '2026-03-11T09:30-07:00',
  status: 'active',
};

// A1–A4 tal como aparecen en el PRD §8.
const A1 = { id: 'a1', visitId: 'v_demo1', startsAt: '2026-03-10T08:00-07:00', durationMin: 45, serviceName: 'Laboratorio', locationId: 'compass', status: 'scheduled', updatedAt: '2026-03-01T00:00-08:00' };
const A2 = { id: 'a2', visitId: 'v_demo1', startsAt: '2026-03-10T09:30-07:00', durationMin: 60, serviceName: 'Resonancia magnética', locationId: 'compass', status: 'scheduled', updatedAt: '2026-03-01T00:00-08:00' };
const A3 = { id: 'a3', visitId: 'v_demo1', startsAt: '2026-03-10T12:00-07:00', durationMin: 30, serviceName: 'Consulta de Medicina Interna', locationId: 'piso27', status: 'scheduled', updatedAt: '2026-03-01T00:00-08:00' };
const A4 = { id: 'a4', visitId: 'v_demo1', startsAt: '2026-03-11T09:00-07:00', durationMin: 30, serviceName: 'Consulta de Cardiología', locationId: 'piso27', status: 'scheduled', updatedAt: '2026-03-01T00:00-08:00' };

const appointments = [A1, A2, A3, A4];

const lodging = {
  visitId: 'v_demo1',
  hotel: 'Quartz Hotel & Spa',
  reservationCode: 'QZ-8841-MX',
  checkIn: '2026-03-10T15:00-07:00',
  checkOut: '2026-03-11T12:00-07:00',
  breakfastIncluded: true,
  recoveryRoom: false,
};

// El expediente base del §8: sin traslados, para que los casos 1a–1g sigan
// diciendo exactamente lo mismo que antes de la Etapa G.
const expediente = (extra = {}) => ({ visit, appointments, lodging, ...extra });

// El PRD compara instantes, no el texto exacto del ISO (segundos u offset
// equivalentes son el mismo instante). Verificamos además que la salida
// siga siendo un ISO con desplazamiento explícito (nunca 'Z', nunca sin
// zona), que es lo que exige §7.
const ISO_WITH_EXPLICIT_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?[+-]\d{2}:\d{2}$/;

function assertSameInstant(actualIso, expectedIso, message) {
  assert.match(actualIso, ISO_WITH_EXPLICIT_OFFSET, `${message}: no es un ISO con desplazamiento explícito (${actualIso})`);
  assert.strictEqual(new Date(actualIso).getTime(), new Date(expectedIso).getTime(), message);
}

describe('R1 — computeExpiresAt / isExpired (PRD §8)', () => {
  test('cálculo base — max(última cita, checkout) + 24h = 2026-03-12T12:00-07:00', () => {
    const expiresAt = computeExpiresAt(expediente());
    assertSameInstant(expiresAt, '2026-03-12T12:00-07:00', 'expiresAt base');
  });

  test('1a — un minuto antes de expiresAt: la app carga normal (no vencido)', () => {
    const expiresAt = computeExpiresAt(expediente());
    assert.strictEqual(expiresAt, expiresAt); // sanity: expiresAt es determinista
    assert.strictEqual(isExpired(expediente(), '2026-03-12T11:59-07:00'), false);
  });

  test('1b — un minuto después de expiresAt: vencido', () => {
    assert.strictEqual(isExpired(expediente(), '2026-03-12T12:01-07:00'), true);
  });

  test('1c — mover la última cita recalcula expiresAt', () => {
    const movedA4 = { ...A4, startsAt: '2026-03-12T09:00-07:00' };
    const expiresAt = computeExpiresAt(expediente({ appointments: [A1, A2, A3, movedA4] }));
    assertSameInstant(expiresAt, '2026-03-13T09:30-07:00', 'expiresAt tras mover A4');
  });

  test('1d — cancelar la última cita no cambia expiresAt porque el checkout sigue siendo posterior', () => {
    const cancelledA4 = { ...A4, status: 'cancelled' };
    const expiresAt = computeExpiresAt(expediente({ appointments: [A1, A2, A3, cancelledA4] }));
    assertSameInstant(expiresAt, '2026-03-12T12:00-07:00', 'expiresAt con A4 cancelada');
  });

  test('1e — todas las citas canceladas y sin hospedaje: expiresAt = visit.startsAt + 24h', () => {
    const allCancelled = appointments.map((a) => ({ ...a, status: 'cancelled' }));
    const expiresAt = computeExpiresAt(expediente({ appointments: allCancelled, lodging: null }));
    assertSameInstant(expiresAt, '2026-03-11T08:00-07:00', 'expiresAt caso degenerado');
  });

  test('1f — estancia extendida: el checkout manda aunque sea más tarde que la última cita', () => {
    const expiresAt = computeExpiresAt(expediente({ lodging: { ...lodging, checkOut: '2026-03-13T12:00-07:00' } }));
    assertSameInstant(expiresAt, '2026-03-14T12:00-07:00', 'expiresAt con estancia extendida');
  });

  test('1g — visita sin hospedaje: manda la última cita no cancelada', () => {
    const expiresAt = computeExpiresAt(expediente({ lodging: null }));
    assertSameInstant(expiresAt, '2026-03-12T09:30-07:00', 'expiresAt sin hospedaje');
  });

  // No es un caso numerado del PRD: los ejemplos del §8 caen todos en
  // horario de verano (-07:00) porque marzo de 2026 así lo dicta. Esta
  // prueba adicional ejercita la rama de horario estándar (-08:00) del
  // cálculo de offset, que de otro modo quedaría sin cubrir.
  test('adicional — horario estándar (-08:00) se calcula igual de bien que el de verano', () => {
    const winterVisit = { ...visit, id: 'v_winter', startsAt: '2026-01-15T09:00-08:00' };
    const winterAppt = { ...A1, startsAt: '2026-01-15T09:00-08:00', durationMin: 60 };
    const expiresAt = computeExpiresAt({ visit: winterVisit, appointments: [winterAppt], lodging: null });
    assertSameInstant(expiresAt, '2026-01-16T10:00-08:00', 'expiresAt en horario estándar');
    assert.match(expiresAt, /-08:00$/, 'debe usar -08:00, no arrastrar el -07:00 de los demás casos');
  });
});

// Etapa G — el traslado de REGRESO es lo último que ocurre en una visita:
// después de la última cita y después del checkout. Es la razón entera por
// la que la caducidad tuvo que cambiar antes de escribir una sola pantalla.
describe('R1 con traslados (Etapa G)', () => {
  // Llegada a las 06:00 del primer día: anterior a todo, no puede mover
  // nada. Regreso a las 16:00 del segundo: posterior al checkout de las
  // 12:00 y a la última cita de las 09:30.
  const llegada = {
    id: 't1', visitId: 'v_demo1', kind: 'arrival',
    scheduledAt: '2026-03-10T06:00-07:00', meetingPointId: 'tij_terminal',
    status: 'scheduled',
  };
  const regreso = {
    id: 't2', visitId: 'v_demo1', kind: 'departure',
    scheduledAt: '2026-03-11T16:00-07:00', meetingPointId: 'quartz',
    status: 'scheduled',
  };

  test('el traslado de regreso extiende la caducidad: max(cita, checkout, traslado) + 24h', () => {
    const expiresAt = computeExpiresAt(expediente({ transfers: [llegada, regreso] }));
    assertSameInstant(expiresAt, '2026-03-12T16:00-07:00', 'expiresAt con traslado de regreso');
  });

  // La prueba que describe el fallo en los términos del paciente: sin este
  // cambio, a las 14:00 del día del regreso la visita YA venció, el
  // servidor contesta 404 (visitStore.js aplica R1) y la app cae a pantalla
  // neutra — a dos horas de que pase el coche y con el teléfono del chofer
  // adentro.
  test('la visita sigue abierta mientras el paciente espera el coche de regreso', () => {
    const conRegreso = expediente({ transfers: [llegada, regreso] });
    assert.strictEqual(isExpired(conRegreso, '2026-03-11T14:00-07:00'), false, 'dos horas antes de que pase el coche');
    assert.strictEqual(isExpired(expediente(), '2026-03-11T14:00-07:00'), false, 'sin traslados sigue viva por el checkout+24h');
  });

  test('un traslado de llegada, anterior a todo, no cambia nada', () => {
    const expiresAt = computeExpiresAt(expediente({ transfers: [llegada] }));
    assertSameInstant(expiresAt, '2026-03-12T12:00-07:00', 'expiresAt solo con llegada');
  });

  test('un traslado cancelado no cuenta, igual que una cita cancelada', () => {
    const expiresAt = computeExpiresAt(expediente({ transfers: [llegada, { ...regreso, status: 'cancelled' }] }));
    assertSameInstant(expiresAt, '2026-03-12T12:00-07:00', 'expiresAt con el regreso cancelado');
  });

  test('sin citas y sin hospedaje, el traslado solo también sostiene la caducidad', () => {
    const expiresAt = computeExpiresAt({ visit, appointments: [], lodging: null, transfers: [regreso] });
    assertSameInstant(expiresAt, '2026-03-12T16:00-07:00', 'expiresAt solo con traslado');
  });

  // Compatibilidad con lo YA desplegado: los expedientes que están hoy en
  // Blobs y en la caché de los teléfonos no traen la llave `transfers`.
  // Ausente y vacío tienen que dar exactamente el mismo resultado que antes
  // de esta etapa, o desplegar caducaría visitas vivas.
  test('un expediente sin la llave transfers da lo mismo que uno con []', () => {
    const sinLlave = computeExpiresAt(expediente());
    const vacio = computeExpiresAt(expediente({ transfers: [] }));
    const nulo = computeExpiresAt(expediente({ transfers: null }));
    assertSameInstant(sinLlave, '2026-03-12T12:00-07:00', 'sin la llave');
    assert.strictEqual(vacio, sinLlave, 'transfers: [] no puede diferir de la llave ausente');
    assert.strictEqual(nulo, sinLlave, 'transfers: null no puede diferir de la llave ausente');
  });
});
