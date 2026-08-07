// R1 — Caducidad del enlace (PRD §8).
//
//   expiresAt = max( última cita no cancelada ,
//                    checkout del hospedaje ,
//                    último traslado no cancelado ) + 24h
//
// `lodging` puede ser null (visita sin hospedaje, caso 1g) y `transfers`
// puede faltar (expedientes guardados antes de la Etapa G). Si además no
// hay ninguna cita no cancelada, no hay de dónde tomar el máximo: cae al
// caso degenerado 1e (visit.startsAt + 24h) para que el enlace no quede
// vivo para siempre.
//
// Etapa G — el traslado de REGRESO ocurre después de la última cita y
// después del checkout: sin él en el máximo, el enlace caducaba mientras el
// paciente esperaba el coche, con el teléfono del chofer adentro.
//
// D69 — ambas funciones reciben el EXPEDIENTE, no argumentos posicionales.
// Con un cuarto posicional antes de `now`, un punto de llamada olvidado le
// habría pasado `now` a `transfers` dejando `now` en undefined;
// `instantMs(undefined)` es NaN y `NaN > x` es false, así que el enlace
// habría dejado de caducar en silencio — justo lo que R1 existe para
// impedir. Con el expediente, ese mismo olvido revienta al leer `.visit` de
// undefined.

import { instantMs, toTijuanaIso, HOUR_MS } from './time.js';

function lastNonCancelledAppointmentEndMs(appointments) {
  const ends = (appointments ?? [])
    .filter((a) => a.status !== 'cancelled')
    .map((a) => instantMs(a.startsAt) + a.durationMin * 60 * 1000);
  return ends.length > 0 ? Math.max(...ends) : null;
}

// Un traslado es un instante, no un intervalo: la coordinadora captura la
// hora de recogida y no cuánto dura el trayecto. Cuenta su `scheduledAt`
// tal cual, y las 24 horas de gracia de R1 cubren de sobra el camino.
function lastNonCancelledTransferMs(transfers) {
  const times = (transfers ?? [])
    .filter((tr) => tr.status !== 'cancelled')
    .map((tr) => instantMs(tr.scheduledAt));
  return times.length > 0 ? Math.max(...times) : null;
}

export function computeExpiresAt(record) {
  const { visit, appointments, lodging, transfers } = record;

  const lastAppointmentEndMs = lastNonCancelledAppointmentEndMs(appointments);
  const checkoutMs = lodging ? instantMs(lodging.checkOut) : null;
  const lastTransferMs = lastNonCancelledTransferMs(transfers);

  const candidates = [lastAppointmentEndMs, checkoutMs, lastTransferMs].filter((v) => v !== null);
  const baseMs = candidates.length > 0 ? Math.max(...candidates) : instantMs(visit.startsAt);

  return toTijuanaIso(baseMs + 24 * HOUR_MS);
}

export function isExpired(record, now) {
  const expiresAt = computeExpiresAt(record);
  return instantMs(now) > instantMs(expiresAt);
}
