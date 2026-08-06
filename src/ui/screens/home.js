// Inicio — saludo, "tu siguiente paso" (R2) y accesos rápidos a mapa,
// estancia y ayuda (fase 05, texto literal de "Detalles por pantalla").
// Horarios NO está en ese renglón de accesos rápidos según la propia fase,
// así que vive como un enlace más discreto aparte (ver comentario en
// app.js sobre "cuelgan de Inicio y Plaza").

import { nextStep, formatTimeTijuana, formatDayLabel } from '../../domain/index.js';
import { locations } from '../../data/locations.js';
import { escapeHtml, locationName } from '../util.js';
import { renderCard } from '../components/card.js';

export function renderHomeScreen(ctx) {
  const { visit, appointments, now, lang, t } = ctx;
  const dayLabel = formatDayLabel(now, now, lang)[lang];
  const step = nextStep(appointments, now);

  const nextStepHtml = step
    ? `
      <p class="nc-home-next-when">${escapeHtml(formatTimeTijuana(step.startsAt, lang))} · ${escapeHtml(locationName(locations, step.locationId, lang))}</p>
      <p class="nc-home-next-what">${escapeHtml(step.serviceName)}</p>
      <button type="button" class="nc-button nc-button--primary" data-nav="pass">${escapeHtml(t('home.nextStepCta'))}</button>
    `
    : `
      <p class="nc-home-next-what">${escapeHtml(t('home.nextStepEmptyTitle'))}</p>
      <p class="nc-home-next-when">${escapeHtml(t('home.nextStepEmptyBody'))}</p>
    `;

  const quickAccess = [
    { nav: 'map', label: t('home.quickAccessMap') },
    ctx.lodging ? { nav: 'stay', label: t('home.quickAccessStay') } : null,
    { nav: 'help', label: t('home.quickAccessHelp') },
  ]
    .filter(Boolean)
    .map((item) => `<button type="button" class="nc-quick-access-item" data-nav="${item.nav}">${escapeHtml(item.label)}</button>`)
    .join('\n');

  return `
    <section class="nc-screen nc-home">
      <h1 class="nc-greeting">${escapeHtml(t('home.greeting')(visit.patientFirstName))}</h1>
      <p class="nc-home-date">${escapeHtml(dayLabel)}</p>

      <h2 class="nc-section-title">${escapeHtml(t('home.nextStepLabel'))}</h2>
      ${renderCard(nextStepHtml, { variant: 'accent' })}

      <div class="nc-quick-access">${quickAccess}</div>

      <button type="button" class="nc-link-button" data-nav="hours">${escapeHtml(t('home.hoursLink'))}</button>
    </section>
  `;
}

export const HOME_CSS = `
.nc-greeting { margin: 4px 0 0; font-size: 22px; }
.nc-home-date { margin: 0 0 16px; opacity: 0.7; font-size: 13px; }
.nc-section-title { font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.7; margin: 0 0 8px; }
.nc-home-next-when { margin: 0 0 2px; font-size: 13px; opacity: 0.8; }
.nc-home-next-what { margin: 0 0 10px; font-size: 17px; font-weight: 700; }
.nc-quick-access { display: flex; gap: 8px; margin: 16px 0; flex-wrap: wrap; }
.nc-quick-access-item { min-height: 44px; min-width: 44px; flex: 1; border-radius: 10px; border: 1px solid var(--nc-card-border); background: var(--nc-card-bg); color: var(--nc-ink); font: 600 13px Barlow, system-ui, sans-serif; cursor: pointer; }
.nc-link-button { min-height: 44px; background: none; border: none; color: var(--nc-teal-ink); font: 600 13px Barlow, system-ui, sans-serif; text-decoration: underline; cursor: pointer; padding: 0; }
`;
