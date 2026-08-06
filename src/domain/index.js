// Superficie pública del dominio (Fase 01). Todo lo que vive fuera de
// src/domain/ debe importar de aquí, no de los archivos internos, salvo
// las propias pruebas de fase 01 (que verifican cada módulo por separado).

export { computeExpiresAt, isExpired } from './expiry.js';
export { nextStep } from './nextStep.js';
export { visiblePasses } from './passes.js';
export { groupByDay, isUpdated } from './itinerary.js';
export { formatTimeTijuana, formatDayLabel, isOpenNow } from './time.js';
