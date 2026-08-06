// Horarios — Compass, Piso 27 y coordinación, con "abierto ahora / cerrado"
// calculado con `now` inyectado (isOpenNow, src/domain/time.js) — nunca
// leyendo el reloj aquí, tal como pide la fase 05 de forma literal.

import { isOpenNow } from '../../domain/index.js';
import { locations } from '../../data/locations.js';
import { supportChannel } from '../../data/support.js';
import { escapeHtml } from '../util.js';
import { renderFicha } from '../components/ficha.js';
import { renderBadge } from '../components/badge.js';

function statusBadge(open, t) {
  if (open === null) return renderBadge(t('hours.unknown'), 'neutral');
  return open ? renderBadge(t('hours.openNow'), 'updated') : renderBadge(t('hours.closedNow'), 'cancelled');
}

function entryHtml(name, hours, now, t) {
  const open = isOpenNow(hours, now);
  return renderFicha({
    title: name,
    lines: [],
    unconfirmed: hours?.unconfirmed === true,
    t,
    extra: statusBadge(open, t),
  });
}

export function renderHoursScreen(ctx) {
  const { now, lang, t } = ctx;
  const compass = locations.find((l) => l.id === 'compass');
  const piso27 = locations.find((l) => l.id === 'piso27');

  const entries = [
    entryHtml(compass.name[lang], compass.hours, now, t),
    entryHtml(piso27.name[lang], piso27.hours, now, t),
    entryHtml(t('help.hoursTitle'), supportChannel.hours, now, t),
  ].join('\n');

  return `
    <section class="nc-screen">
      <h1 class="nc-screen-title">${escapeHtml(t('hours.title'))}</h1>
      <div class="nc-venue-list">${entries}</div>
    </section>
  `;
}
