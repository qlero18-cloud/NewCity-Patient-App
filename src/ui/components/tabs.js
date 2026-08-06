// Navegación inferior de 5 pestañas (PRD/fase 05): Inicio · Itinerario ·
// Mapa · Plaza · Ayuda. Horarios y Mi estancia NO son pestañas propias —
// cuelgan de Inicio y Plaza (ver src/ui/app.js) — a propósito no están
// aquí.
//
// Cada botón mide al menos 44×44px de área tocable (criterio de
// aceptación de la fase 05, mismo mínimo que la fase 04).

import { escapeHtml, classNames } from '../util.js';

const TAB_ORDER = ['home', 'itinerary', 'map', 'plaza', 'help'];

export function renderTabBar(activeTab, t) {
  const items = TAB_ORDER.map((id) => {
    const isActive = id === activeTab;
    return `
      <button type="button" class="${classNames(['nc-tab', isActive && 'nc-tab--active'])}" data-tab="${id}" role="tab" aria-selected="${isActive}">
        <span class="nc-tab-label">${escapeHtml(t(`tabs.${id}`))}</span>
      </button>`;
  }).join('\n');
  return `<nav class="nc-tabbar" role="tablist" aria-label="Navegación principal">${items}</nav>`;
}

export const TABS_CSS = `
.nc-tabbar { position: sticky; bottom: 0; display: flex; background: var(--nc-surface); border-top: 1px solid var(--nc-card-border); padding-bottom: env(safe-area-inset-bottom, 0); }
.nc-tab { flex: 1; min-height: 52px; min-width: 44px; border: none; background: none; color: var(--nc-ink); opacity: 0.6; font: 500 12px Barlow, system-ui, sans-serif; cursor: pointer; padding: 8px 4px; }
.nc-tab--active { opacity: 1; color: var(--nc-teal-ink); font-weight: 700; }
`;
