// Etapa H (D75) — la ventana de la visita, traducida a los atributos min/max
// que entiende un <input type="datetime-local">.
//
// Se acota al DÍA, no al instante, y es a propósito: visit.startsAt/endsAt
// delimitan días de estancia (intake.js los captura con <input type="date">),
// así que una cita a las 10 de la mañana del último día es perfectamente
// válida aunque el instante guardado en endsAt sea anterior. Con min/max al
// instante el navegador la bloquearía y la coordinadora no tendría forma de
// capturarla — el control estorbaría en vez de ayudar.
//
// Es una cota de comodidad, no la autoridad: quien mande el POST no pasa por
// esta pantalla, y el servidor valida por su cuenta (mismo criterio que
// locationId con su 422, D40). Por eso una visita con fechas ilegibles no
// rompe nada: simplemente no se pinta la cota.

import { toDateInput } from '../../../domain/time.js';

// visitWindowAttrs(visit) -> ' min="2026-03-10T00:00" max="2026-03-12T23:59"'
// Cadena vacía si falta cualquiera de las dos puntas. El formato que produce
// toDateInput es estricto (YYYY-MM-DD), así que no hay nada que escapar aquí.
export function visitWindowAttrs(visit) {
  const desde = toDateInput(visit?.startsAt);
  const hasta = toDateInput(visit?.endsAt);
  if (!desde || !hasta) return '';
  return ` min="${desde}T00:00" max="${hasta}T23:59"`;
}
