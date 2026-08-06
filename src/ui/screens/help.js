// Ayuda — WhatsApp, llamada y horario de atención de coordinación (fase 05).
// wa.me exige solo dígitos (sin "+"); tel: sí conserva el "+" (E.164
// estándar) — por eso hay dos formatos derivados del mismo número, no dos
// números distintos.

import { isOpenNow } from '../../domain/index.js';
import { supportChannel } from '../../data/support.js';
import { escapeHtml } from '../util.js';
import { renderCard } from '../components/card.js';
import { renderFicha } from '../components/ficha.js';
import { renderBadge } from '../components/badge.js';

function digitsOnly(e164) {
  return e164.replace(/[^\d]/g, '');
}

export function renderHelpScreen(ctx) {
  const { now, t } = ctx;
  const waHref = `https://wa.me/${digitsOnly(supportChannel.whatsappNumber)}`;
  const telHref = `tel:${supportChannel.voiceNumber}`;
  const open = isOpenNow(supportChannel.hours, now);
  const statusBadge = open === null ? '' : open ? renderBadge(t('hours.openNow'), 'updated') : renderBadge(t('hours.closedNow'), 'cancelled');

  return `
    <section class="nc-screen">
      <h1 class="nc-screen-title">${escapeHtml(t('help.title'))}</h1>
      ${renderCard(`
        <a class="nc-button nc-button--primary nc-button--block" href="${escapeHtml(waHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('help.whatsappButton'))}</a>
        <a class="nc-button nc-button--block" href="${escapeHtml(telHref)}">${escapeHtml(t('help.callButton'))}</a>
      `, { variant: 'accent' })}
      ${renderFicha({
        title: t('help.hoursTitle'),
        lines: [],
        unconfirmed: supportChannel.hours?.unconfirmed === true,
        t,
        extra: statusBadge,
      })}
    </section>
  `;
}

export const HELP_CSS = `
.nc-button--block { display: block; width: 100%; text-align: center; text-decoration: none; box-sizing: border-box; margin-bottom: 8px; }
`;
