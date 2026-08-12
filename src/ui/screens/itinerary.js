// Mi itinerario — línea de tiempo agrupada por día (R5, PRD §9 "visita de
// varios días"). Incluye canceladas (tachadas, en gris) porque
// groupByDay ya las incluye a propósito (ver comentario de
// src/domain/itinerary.js) — este archivo no filtra nada, solo pinta.
//
// `lastViewedItineraryAt` decide el distintivo "actualizado" (R5, isUpdated)
// y viene de localStorage — leído y actualizado por src/ui/app.js, no
// aquí: esta pantalla no toca localStorage directamente, solo recibe el
// valor ya resuelto.

import { groupByDay, isUpdated, formatTimeTijuana, timelineItems } from '../../domain/index.js';
import { locations } from '../../data/locations.js';
import { transferPoints } from '../../data/transferPoints.js';
import { escapeHtml, classNames, locationName, transferPointName } from '../util.js';
import { renderCard } from '../components/card.js';
import { renderBadge } from '../components/badge.js';

// Etapa I — los tres campos que el itinerario de la coordinadora ya traía y
// hasta ahora se perdían (D82). Son opcionales de verdad: ninguna cita
// capturada a mano en las Etapas D–H los tiene, así que cada renglón se pinta
// solo si hay algo que decir. Una etiqueta encima de un campo vacío es ruido
// en la pantalla que más se consulta.
//
// `hideWhenCancelled` solo lo lleva `prep`, y la asimetría es intencional:
// `prep` PIDE algo ("ayuna de 8 a 12 horas") y dejarlo visible en una cita
// que ya no ocurre manda a alguien a ayunar doce horas para nada; `doctor` y
// `details` DESCRIBEN la cita, que es justo lo que hace falta para reconocer
// cuál se canceló y pedir que la reagenden.
//
// Nombre con prefijo porque build.py (fase 05) aplana todos los módulos de un
// entry a un solo scope top-level y un nombre genérico chocaría con el
// primero que se le parezca.
const ITIN_EXTRA_ROWS = [
  { field: 'prep', label: 'itinerary.prepLabel', cssClass: 'nc-itin-prep', hideWhenCancelled: true },
  { field: 'doctor', label: 'itinerary.doctorLabel', cssClass: 'nc-itin-doctor' },
  { field: 'details', label: 'itinerary.detailsLabel', cssClass: 'nc-itin-details' },
];

function renderAppointmentExtras(appointment, cancelled, t) {
  return ITIN_EXTRA_ROWS
    .filter((row) => !(cancelled && row.hideWhenCancelled))
    // Se recorta antes de decidir: un campo con espacios es un campo vacío
    // que el .docx trajo con formato, no contenido.
    .map((row) => [row, typeof appointment[row.field] === 'string' ? appointment[row.field].trim() : ''])
    .filter(([, valor]) => valor !== '')
    .map(([row, valor]) => `<p class="nc-itin-extra ${row.cssClass}">`
      + `<span class="nc-itin-extra-label">${escapeHtml(t(row.label))}</span> ${escapeHtml(valor)}</p>`)
    .join('\n');
}

function renderAppointmentCard(appointment, ctx) {
  const { now, lang, t, lastViewedItineraryAt } = ctx;
  const cancelled = appointment.status === 'cancelled';
  const updated = !cancelled && isUpdated(appointment, lastViewedItineraryAt);
  const statusLabel = t(`itinerary.status.${appointment.status}`);

  const badges = [
    updated ? renderBadge(t('itinerary.updatedBadge'), 'updated') : '',
    cancelled ? renderBadge(statusLabel, 'cancelled') : '',
  ].join(' ');

  return renderCard(`
    <p class="nc-itin-when">${escapeHtml(formatTimeTijuana(appointment.startsAt, lang))} · ${escapeHtml(locationName(locations, appointment.locationId, lang))}</p>
    <p class="${classNames(['nc-itin-what', cancelled && 'nc-itin-what--cancelled'])}">${escapeHtml(appointment.serviceName)}</p>
    ${renderAppointmentExtras(appointment, cancelled, t)}
    <p class="nc-itin-status">${!cancelled ? escapeHtml(statusLabel) : ''} ${badges}</p>
  `, { extraClass: cancelled ? 'nc-card--muted' : '' });
}

// Etapa G — el traslado en la misma columna que las citas, reusando las
// clases de la cita (.nc-itin-when/.nc-itin-what) a propósito: para el
// paciente son renglones de la misma línea de tiempo y verlos con dos
// tipografías distintas sugeriría que uno es más importante que el otro.
// Lo que sí cambia es que este renglón lleva a otra pantalla.
function renderTransferRow(transfer, ctx) {
  const { lang, t } = ctx;
  const cancelled = transfer.status === 'cancelled';

  return renderCard(`
    <p class="nc-itin-when">${escapeHtml(formatTimeTijuana(transfer.scheduledAt, lang))} · ${escapeHtml(transferPointName(transferPoints, transfer.meetingPointId, lang))}</p>
    <p class="${classNames(['nc-itin-what', cancelled && 'nc-itin-what--cancelled'])}">${escapeHtml(t(`transfer.kind.${transfer.kind}`))}</p>
    <p class="nc-itin-status">
      ${cancelled ? renderBadge(t('transfer.cancelledBadge'), 'cancelled') : ''}
      <button type="button" class="nc-link-button" data-nav="transfer">${escapeHtml(t('home.transferCta'))}</button>
    </p>
  `, { extraClass: cancelled ? 'nc-card--muted' : '' });
}

export function renderItineraryScreen(ctx) {
  const { appointments, transfers, now, lang, t } = ctx;
  // groupByDay no se tocó: siempre fue genérico (solo lee `startsAt` y
  // dayKeyTijuana), así que lo que cambia es lo que se le entrega. Un
  // traslado la víspera abre un día que las citas no tienen, y eso sale
  // solo de aquí.
  const groups = groupByDay(timelineItems(appointments, transfers), now);

  if (groups.length === 0) {
    return `<section class="nc-screen"><h1 class="nc-screen-title">${escapeHtml(t('itinerary.title'))}</h1><p>${escapeHtml(t('itinerary.empty'))}</p></section>`;
  }

  const groupsHtml = groups
    .map(
      (g) => `
      <h2 class="nc-day-header">${escapeHtml(g.label[lang])}</h2>
      <div class="nc-day-items">${g.items.map((item) => (item.kind === 'transfer'
        ? renderTransferRow(item.entity, ctx)
        : renderAppointmentCard(item.entity, ctx))).join('\n')}</div>
    `
    )
    .join('\n');

  return `
    <section class="nc-screen">
      <h1 class="nc-screen-title">${escapeHtml(t('itinerary.title'))}</h1>
      ${groupsHtml}
    </section>
  `;
}

export const ITINERARY_CSS = `
.nc-screen-title { font-size: 20px; margin: 4px 0 16px; }
.nc-day-header { font-size: 14px; font-weight: 700; margin: 18px 0 8px; }
.nc-day-items { display: flex; flex-direction: column; gap: 8px; }
.nc-itin-when { margin: 0 0 2px; font-size: 12px; opacity: 0.7; }
.nc-itin-what { margin: 0 0 4px; font-size: 15px; font-weight: 600; }
.nc-itin-what--cancelled { text-decoration: line-through; opacity: 0.6; }
.nc-itin-extra { margin: 0 0 4px; font-size: 13px; line-height: 1.35; }
.nc-itin-extra-label { font-weight: 700; opacity: 0.75; }
/* La preparación se lee ANTES de venir y es la única de las tres que le pide
   algo al paciente; por eso es la única con acento en vez de gris. */
.nc-itin-prep { color: var(--nc-teal-ink); }
.nc-itin-doctor, .nc-itin-details { opacity: 0.85; }
.nc-itin-status { margin: 0; font-size: 12px; display: flex; gap: 6px; align-items: center; opacity: 0.8; }
`;
