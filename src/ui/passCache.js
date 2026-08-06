// Fase 06 — guarda el último estado de pases conocido en el dispositivo
// para que "sin conexión" siga mostrando algo (PRD/fase 06). Guarda los
// pases CRUDOS (con su propio revokedAt/validUntil), no un resultado ya
// filtrado: filtra de nuevo con visiblePasses (R3, fase 01) usando el
// `now` de cada apertura, nunca el guardado — así un pase revocado
// DESPUÉS de guardarse en caché deja de verse la próxima vez que se
// evalúa, en vez de quedar "congelado" como válido para siempre (INV-4).
//
// JSON.stringify/parse preserva `null` como `null` (no como string ni
// como campo ausente), así que `validUntil: null` sobrevive el viaje
// completo por localStorage sin ambigüedad — es el caso que el archivo de
// esta fase marca como "el fallo más caro": un null mal interpretado como
// fecha inválida apagaría un pase que en realidad nunca caduca.

import { visiblePasses } from '../domain/index.js';

const CACHE_KEY_PREFIX = 'nc_pass_cache:';

export function savePassCache(visitId, passes, now) {
  const record = { visitId, passes, savedAt: now };
  localStorage.setItem(CACHE_KEY_PREFIX + visitId, JSON.stringify(record));
}

export function loadPassCache(visitId) {
  const raw = localStorage.getItem(CACHE_KEY_PREFIX + visitId);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.passes) || typeof parsed.savedAt !== 'string') return null;
    return parsed;
  } catch {
    return null; // JSON corrupto: se trata como "sin caché", no rompe la pantalla
  }
}

// getCachedVisiblePasses(visitId, now) -> { passes: Pass[], savedAt } | null
// Los `passes` ya vienen filtrados por R3 evaluado con el `now` de AHORA,
// no con el que tenía el dispositivo cuando se guardó la caché.
export function getCachedVisiblePasses(visitId, now) {
  const cache = loadPassCache(visitId);
  if (!cache) return null;
  return { passes: visiblePasses(cache.passes, now), savedAt: cache.savedAt };
}
