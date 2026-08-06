// R2 — "Tu siguiente paso" (PRD §8).
//
// Si existe una cita in_progress, esa es el siguiente paso. Si no, la
// scheduled más próxima con startsAt >= now. cancelled y done nunca son
// candidatas. Desempate determinista: startsAt, luego locationId, luego id.

import { instantMs } from './time.js';

function byTiebreak(a, b) {
  const byStart = instantMs(a.startsAt) - instantMs(b.startsAt);
  if (byStart !== 0) return byStart;
  const byLocation = a.locationId.localeCompare(b.locationId);
  if (byLocation !== 0) return byLocation;
  return a.id.localeCompare(b.id);
}

export function nextStep(appointments, now) {
  const inProgress = appointments.filter((a) => a.status === 'in_progress');
  if (inProgress.length > 0) {
    return [...inProgress].sort(byTiebreak)[0];
  }

  const nowMs = instantMs(now);
  const upcoming = appointments.filter((a) => a.status === 'scheduled' && instantMs(a.startsAt) >= nowMs);
  if (upcoming.length === 0) return null;

  return [...upcoming].sort(byTiebreak)[0];
}
