// Etapa E — el expediente de la visita guardado en el dispositivo.
//
// Hermana de passCache.js, pero resuelven cosas distintas y por eso son dos
// módulos: passCache mantiene vivo el SÍMBOLO del pase (y lo vuelve a
// filtrar por R3 con el `now` de cada apertura, INV-4); esta mantiene viva
// la APERTURA de la app. Sin ella, el paciente que llega al acceso con una
// barra de señal ve la pantalla neutra —la misma que vería con un token
// inventado— y no tiene forma de saber que su visita sigue ahí. El PRD
// pide explícitamente que el pase siga en pantalla sin conexión.
//
// Se guarda por TOKEN, no por visitId: cuando hay que decidir si existe
// caché todavía no se conoce el id, porque viene dentro del expediente que
// se está intentando traer.
//
// Lo que este módulo NO hace: decidir si lo guardado sigue valiendo. Eso
// es de quien lo lee — resolveVisitContext borra la caché ante un 404, y
// app.js vuelve a evaluar isExpired con el `now` de AHORA. Guardar y
// caducar en el mismo archivo es como se termina sirviendo una visita
// vencida porque "la caché decía que estaba bien".

import { isVisitRecord } from './visitRecord.js';

// Prefijo propio y distinto del de passCache.js: build.py aplana todos los
// módulos a un solo scope y dos constantes con el mismo nombre serían un
// error de compilación (lo es hoy: el guard de nombres top-level).
const VISIT_CACHE_KEY_PREFIX = 'nc_visit_cache:';

export function saveVisitCache(token, record, now) {
  localStorage.setItem(VISIT_CACHE_KEY_PREFIX + token, JSON.stringify({ record, savedAt: now }));
}

// loadVisitCache(token) -> { record, savedAt } | null
export function loadVisitCache(token) {
  const raw = localStorage.getItem(VISIT_CACHE_KEY_PREFIX + token);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.savedAt !== 'string' || !isVisitRecord(parsed.record)) return null;
    return parsed;
  } catch {
    return null; // JSON corrupto: se trata como "sin caché", no rompe la apertura
  }
}

export function clearVisitCache(token) {
  localStorage.removeItem(VISIT_CACHE_KEY_PREFIX + token);
}
