// Distintivo reusable: [POR CONFIRMAR] (unconfirmed: true en cualquier
// dato de src/data/) y "actualizado" (R5, cita movida). Mismo componente,
// variantes distintas de color — nunca texto libre inventado por cada
// pantalla por separado.

import { escapeHtml, classNames } from '../util.js';

export function renderBadge(text, variant = 'neutral') {
  return `<span class="nc-badge nc-badge--${escapeHtml(variant)}">${escapeHtml(text)}</span>`;
}

export function renderUnconfirmedBadge(t) {
  return renderBadge(t('common.unconfirmedBadge'), 'unconfirmed');
}

export const BADGE_CSS = `
.nc-badge { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 6px; line-height: 1.4; white-space: nowrap; }
.nc-badge--unconfirmed { background: #FBEBD2; color: #8A5A00; }
.nc-badge--updated { background: #DFF3EE; color: #106657; }
.nc-badge--cancelled { background: #F4E1E1; color: #8A2A2A; }
@media (prefers-color-scheme: dark) {
  .nc-badge--unconfirmed { background: #4A3110; color: #F2C97D; }
  .nc-badge--updated { background: #103B32; color: #8FDFCB; }
  .nc-badge--cancelled { background: #3B1F1F; color: #E9A9A9; }
}
`;
