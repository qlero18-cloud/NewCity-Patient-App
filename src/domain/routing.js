// R7 — Origen por defecto de la ruta (PRD §8) + resolución de rutas
// origen→destino (fase 02). Sin posicionamiento en vivo (PRD §6.3): la app
// propone el origen, nunca lo detecta.

import { instantMs, dayKeyTijuana } from './time.js';

// defaultOrigin(appointment, appointments, lodging) -> locationId | null
//
// Regla: la ubicación de la cita anterior del mismo día (Tijuana),
// ignorando canceladas. Si no hay ninguna anterior (primera cita del día),
// el origen es Quartz cuando el paciente ya tiene el hospedaje activo a
// esa hora (checkIn <= startsAt <= checkOut) — si no, Estacionamiento.
// Devuelve null si `appointment` no aparece en `appointments` (no hay
// forma confiable de determinar "la anterior").
export function defaultOrigin(appointment, appointments, lodging) {
  const found = appointments.some((a) => a.id === appointment.id);
  if (!found) return null;

  const sameDayKey = dayKeyTijuana(appointment.startsAt);
  const startMs = instantMs(appointment.startsAt);

  const priorSameDay = appointments
    .filter((a) => a.id !== appointment.id)
    .filter((a) => a.status !== 'cancelled')
    .filter((a) => dayKeyTijuana(a.startsAt) === sameDayKey)
    .filter((a) => instantMs(a.startsAt) < startMs)
    .sort((a, b) => instantMs(b.startsAt) - instantMs(a.startsAt)); // más reciente primero

  if (priorSameDay.length > 0) {
    return priorSameDay[0].locationId;
  }

  // Primera cita (no cancelada) del día: ¿el paciente ya está hospedado?
  if (lodging) {
    const checkInMs = instantMs(lodging.checkIn);
    const checkOutMs = instantMs(lodging.checkOut);
    if (checkInMs <= startMs && startMs <= checkOutMs) {
      return 'quartz';
    }
  }

  return 'estacionamiento';
}

// resolveRoute(fromLocationId, toLocationId, routes) -> Route | SameLocation | null
export function resolveRoute(fromLocationId, toLocationId, routes) {
  if (fromLocationId === toLocationId) {
    return { kind: 'same_location', locationId: fromLocationId };
  }

  const match = routes.find((r) => r.fromLocationId === fromLocationId && r.toLocationId === toLocationId);
  return match ?? null;
}
