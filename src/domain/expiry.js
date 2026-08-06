// R1 — Caducidad del enlace (PRD §8).
//
//   expiresAt = max( última cita no cancelada , checkout del hospedaje ) + 24h
//
// `lodging` puede ser null (visita sin hospedaje, caso 1g). Si además no
// hay ninguna cita no cancelada, no hay de dónde tomar el máximo: cae al
// caso degenerado 1e (visit.startsAt + 24h) para que el enlace no quede
// vivo para siempre.

import { instantMs, toTijuanaIso, HOUR_MS } from './time.js';

function lastNonCancelledAppointmentEndMs(appointments) {
  const ends = appointments
    .filter((a) => a.status !== 'cancelled')
    .map((a) => instantMs(a.startsAt) + a.durationMin * 60 * 1000);
  return ends.length > 0 ? Math.max(...ends) : null;
}

export function computeExpiresAt(visit, appointments, lodging) {
  const lastAppointmentEndMs = lastNonCancelledAppointmentEndMs(appointments);
  const checkoutMs = lodging ? instantMs(lodging.checkOut) : null;

  const candidates = [lastAppointmentEndMs, checkoutMs].filter((v) => v !== null);
  const baseMs = candidates.length > 0 ? Math.max(...candidates) : instantMs(visit.startsAt);

  return toTijuanaIso(baseMs + 24 * HOUR_MS);
}

export function isExpired(visit, appointments, lodging, now) {
  const expiresAt = computeExpiresAt(visit, appointments, lodging);
  return instantMs(now) > instantMs(expiresAt);
}
