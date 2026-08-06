// Mi itinerario — línea de tiempo agrupada por día (R5, PRD §9 "visita de
// varios días"). Incluye canceladas (tachadas, en gris) porque
// groupByDay ya las incluye a propósito (ver comentario de
// src/domain/itinerary.js) — este archivo no filtra nada, solo pinta.
//
// `lastViewedItineraryAt` decide el distintivo "actualizado" (R5, isUpdated)
// y viene de localStorage — leído y actualizado por src/ui/app.js, no
// aquí: esta pantalla no toca localStorage directamente, solo recibe el
// valor ya resuelto.

import { groupByDay, isUpdated, formatTimeTijuana } from '../../domain/index.js';
import { locations } from '../../data/locations.js';
import { escapeHtml, classNames, locationName } from '../util.js';
import { renderCard } from '../components/card.js';
import { renderBadge } from '../components/badge.js';

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
    <p class="nc-itin-status">${!cancelled ? escapeHtml(statusLabel) : ''} ${badges}</p>
  `, { extraClass: cancelled ? 'nc-card--muted' : '' });
}

export function renderItineraryScreen(ctx) {
  const { appointments, now, lang, t } = ctx;
  const groups = groupByDay(appointments, now);

  if (groups.length === 0) {
    return `<section class="nc-screen"><h1 class="nc-screen-title">${escapeHtml(t('itinerary.title'))}</h1><p>${escapeHtml(t('itinerary.empty'))}</p></section>`;
  }

  const groupsHtml = groups
    .map(
      (g) => `
      <h2 class="nc-day-header">${escapeHtml(g.label[lang])}</h2>
      <div class="nc-day-items">${g.items.map((a) => renderAppointmentCard(a, ctx)).join('\n')}</div>
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
.nc-itin-status { margin: 0; font-size: 12px; display: flex; gap: 6px; align-items: center; opacity: 0.8; }
`;
