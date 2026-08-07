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

// Fix (verificación fase 09): renderBadge(text, variant = 'neutral') tenía
// 'neutral' como default desde su primera versión (fase 05), y ya se
// llamaba así en dos pantallas reales — hours.js ("horario desconocido") y
// screens/coordinator/qpass.js ("QPASS pendiente", fase 09) — pero nunca
// existió la regla .nc-badge--neutral: esos dos badges se pintaban sin
// ningún estilo, con solo el markup de .nc-badge desnudo. A diferencia de
// los otros 3 colores (cada uno ligado a un significado semántico propio:
// aviso, actualizado, cancelado) 'neutral' no tiene un matiz propio — se
// funda en --nc-ink (src/ui/theme.js) tal cual, el mismo color de texto ya
// usado en toda la app, en vez de inventar un gris nuevo sin relación con
// el resto de la paleta; el fondo es un tinte intermedio entre --nc-bg y
// --nc-card-border (claro) / --nc-card-bg y --nc-card-border (oscuro) —
// mismo criterio estructural que los otros 3 pares, sin matiz de color
// propio.
export const BADGE_CSS = `
.nc-badge { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 6px; line-height: 1.4; white-space: nowrap; }
.nc-badge--unconfirmed { background: #FBEBD2; color: #8A5A00; }
.nc-badge--updated { background: #DFF3EE; color: #106657; }
.nc-badge--cancelled { background: #F4E1E1; color: #8A2A2A; }
.nc-badge--neutral { background: #E4E9F1; color: #1C2B53; }
@media (prefers-color-scheme: dark) {
  .nc-badge--unconfirmed { background: #4A3110; color: #F2C97D; }
  .nc-badge--updated { background: #103B32; color: #8FDFCB; }
  .nc-badge--cancelled { background: #3B1F1F; color: #E9A9A9; }
  .nc-badge--neutral { background: #2A3654; color: #F2F5FA; }
}
`;
