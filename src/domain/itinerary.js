// R5 — Cita movida (PRD §8) y agrupado del itinerario por día (PRD §9,
// "Visita de varios días").
//
// groupByDay incluye TODAS las citas, también las cancelled (§9 "Cita
// cancelada": permanece en la línea de tiempo, tachada y en gris). Que una
// cancelled quede fuera de "tu siguiente paso" lo decide nextStep.js, no
// este módulo.

import { instantMs, dayKeyTijuana, formatDayLabel } from './time.js';

export function groupByDay(appointments, now) {
  const sorted = [...appointments].sort((a, b) => instantMs(a.startsAt) - instantMs(b.startsAt));

  const groups = new Map();
  for (const appointment of sorted) {
    const key = dayKeyTijuana(appointment.startsAt);
    if (!groups.has(key)) {
      groups.set(key, {
        dayKey: key,
        label: formatDayLabel(appointment.startsAt, now),
        items: [],
      });
    }
    groups.get(key).items.push(appointment);
  }

  return [...groups.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

// El distintivo "actualizado" se muestra si el cambio es posterior a la
// última vez que el paciente vio el itinerario en este dispositivo. Sin
// una marca previa (dispositivo nuevo, caso 5c) no se inventa una
// referencia: no hay distintivos.
export function isUpdated(appointment, lastViewedItineraryAt) {
  if (lastViewedItineraryAt === null || lastViewedItineraryAt === undefined) return false;
  return instantMs(appointment.updatedAt) > instantMs(lastViewedItineraryAt);
}
