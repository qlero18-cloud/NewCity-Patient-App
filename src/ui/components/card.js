// Tarjeta genérica: contenedor con esquinas redondeadas y sombra sutil,
// reusado por Inicio (siguiente paso), Itinerario (cada cita), Plaza (cada
// venue) y Mi estancia. `variant` solo cambia acento visual, nunca texto.

import { classNames } from '../util.js';

export function renderCard(innerHtml, { variant = 'default', extraClass = '' } = {}) {
  return `<div class="${classNames(['nc-card', `nc-card--${variant}`, extraClass])}">${innerHtml}</div>`;
}

export const CARD_CSS = `
.nc-card { background: var(--nc-card-bg); border: 1px solid var(--nc-card-border); border-radius: 14px; padding: 14px 16px; }
.nc-card--accent { border-color: var(--nc-teal); border-width: 2px; }
.nc-card--muted { opacity: 0.7; }
`;
