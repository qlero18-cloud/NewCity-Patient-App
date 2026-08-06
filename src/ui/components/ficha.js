// Ficha genérica de información: título + líneas de detalle + distintivo
// opcional. Reusa el mismo patrón visual que la ficha de un punto del mapa
// (fase 04, src/map/complexMap.js renderFichaHtml) pero para contenido que
// no es un punto del mapa (venue de Plaza, entrada de Horarios) — no
// importa esa función aquí para no acoplar UI a un módulo de otra capa por
// una coincidencia de forma; son dos cosas distintas que se parecen.

import { escapeHtml } from '../util.js';
import { renderCard } from './card.js';
import { renderUnconfirmedBadge } from './badge.js';

export function renderFicha({ title, lines = [], unconfirmed = false, t, extra = '' }) {
  const badge = unconfirmed ? ` ${renderUnconfirmedBadge(t)}` : '';
  const linesHtml = lines
    .filter(Boolean)
    .map((l) => `<p class="nc-ficha-line">${escapeHtml(l)}</p>`)
    .join('\n');
  return renderCard(`
    <h3 class="nc-ficha-title">${escapeHtml(title)}${badge}</h3>
    ${linesHtml}
    ${extra}
  `);
}

export const FICHA_CSS = `
.nc-ficha-title { margin: 0 0 6px; font-size: 16px; font-weight: 700; }
.nc-ficha-line { margin: 0 0 4px; font-size: 13px; opacity: 0.85; }
`;
