// R3 — Qué QPASS se muestra (PRD §8, §6.5).
//
// Visible si se cumplen las tres:
//   1. now >= validFrom
//   2. validUntil == null (no caduca) O now <= validUntil
//   3. revokedAt == null
//
// `revokedAt` no es "revocado a partir de esa hora": es la marca de que YA
// se revocó. Cualquier valor no nulo lo apaga de inmediato, sin comparar
// contra `now` — es el único mecanismo de invalidación de un pase sin
// caducidad (INV-4, §6.5).
//
// Orden en pantalla: torre → piso27 → estacionamiento.

import { instantMs } from './time.js';

const SCOPE_ORDER = { torre: 0, piso27: 1, estacionamiento: 2 };

// Exportada (antes era local a este módulo): la pantalla de emisión del
// panel necesita el MISMO criterio de "revocado" para no contar un pase
// revocado como pase vigente (src/ui/screens/coordinator/qpass.js). Que
// sean dos definiciones distintas de "revocado" es exactamente el bug
// que INV-4 no perdona, así que hay una sola.
export function isRevoked(pass) {
  return pass.revokedAt !== null && pass.revokedAt !== undefined;
}

function hasStarted(pass, nowMs) {
  return instantMs(pass.validFrom) <= nowMs;
}

function notYetExpired(pass, nowMs) {
  if (pass.validUntil === null || pass.validUntil === undefined) return true; // no caduca — §6.5
  return instantMs(pass.validUntil) >= nowMs;
}

export function visiblePasses(passes, now) {
  const nowMs = instantMs(now);

  return passes
    .filter((p) => !isRevoked(p) && hasStarted(p, nowMs) && notYetExpired(p, nowMs))
    .sort((a, b) => {
      const byScope = SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope];
      if (byScope !== 0) return byScope;
      return a.id.localeCompare(b.id);
    });
}
