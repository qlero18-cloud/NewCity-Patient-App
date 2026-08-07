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

// Nodo por el que pasa todo el complejo: se entra por ahí desde el
// estacionamiento y desde el hotel, y de ahí salen los elevadores a la torre
// y los accesos a Nivel 1 y farmacia. Por eso es el punto de composición.
export const HUB_LOCATION_ID = 'lobby_torre';

// resolveRoute(fromLocationId, toLocationId, routes) -> Route | SameLocation | null
//
// Primero busca una ruta directa redactada a mano. Si no existe, compone
// origen → lobby → destino (D41). El catálogo directo cubre 17 de los 42
// pares ordenados; escribir los otros 32 a mano habría sido inventar
// contenido par por par, cuando todos siguen siendo provisionales hasta que
// lleguen los planos oficiales (PRD §15.1). Componer por el lobby es
// provisional igual, pero al menos es cierto: así se camina el edificio.
//
// La ruta compuesta tiene exactamente la misma forma que una directa (el
// mapa la consume sin saber la diferencia) y se marca `composed: true` por
// si alguna pantalla quiere distinguirla.
export function resolveRoute(fromLocationId, toLocationId, routes) {
  if (fromLocationId === toLocationId) {
    return { kind: 'same_location', locationId: fromLocationId };
  }

  const direct = routes.find((r) => r.fromLocationId === fromLocationId && r.toLocationId === toLocationId);
  if (direct) return direct;

  // Si uno de los extremos ya es el lobby, no hay nada que componer: o había
  // ruta directa o no la hay. (El catálogo garantiza las 12 contra el lobby
  // — probado en test/domain/routing.test.js —, así que esto solo se alcanza
  // con un locationId que no existe.)
  if (fromLocationId === HUB_LOCATION_ID || toLocationId === HUB_LOCATION_ID) return null;

  const toHub = routes.find((r) => r.fromLocationId === fromLocationId && r.toLocationId === HUB_LOCATION_ID);
  const fromHub = routes.find((r) => r.fromLocationId === HUB_LOCATION_ID && r.toLocationId === toLocationId);
  if (!toHub || !fromHub) return null;

  return {
    id: `${toHub.id}+${fromHub.id}`,
    fromLocationId,
    toLocationId,
    estimatedMinutes: toHub.estimatedMinutes + fromHub.estimatedMinutes,
    unconfirmed: true,
    composed: true,
    steps: [...toHub.steps, ...fromHub.steps].map((s, i) => ({ ...s, order: i + 1 })),
  };
}
