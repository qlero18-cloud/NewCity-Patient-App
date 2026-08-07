// Mapa y accesos — el mapa de la fase 04 más la ruta paso a paso (fase 05).
// Ruta por defecto: origen = R7 (defaultOrigin) a partir de "tu siguiente
// paso" (R2); destino = la ubicación de esa cita. Tocar cualquier otro
// punto del mapa recalcula la ruta hacia ESE punto sin cambiar el origen.
//
// Esta pantalla no decide nada de dominio por sí misma: nextStep,
// defaultOrigin y resolveRoute son las tres únicas fuentes de verdad, y
// las tres vienen de src/domain/.

import { nextStep } from '../../domain/index.js';
import { defaultOrigin, resolveRoute } from '../../domain/routing.js';
import { renderComplexMapSvg, renderFichaHtml, getMapPointMeta, MAP_POINT_IDS } from '../../map/complexMap.js';
import { highlighterForSvgElement } from '../../map/highlights.js';
import { routes } from '../../data/routes.js';
import { locations } from '../../data/locations.js';
import { escapeHtml, getLocationById } from '../util.js';

function mapPointIdForLocation(locationId) {
  return getLocationById(locations, locationId)?.mapPointId ?? null;
}

export function renderMapScreen(ctx) {
  const { t, lang } = ctx;
  return `
    <section class="nc-screen nc-map-screen">
      <h1 class="nc-screen-title">${escapeHtml(t('map.title'))}</h1>
      <div class="nc-map-mount"></div>
      <div class="nc-route-panel" data-role="route-panel"></div>
      <div class="nc-ficha-slot" data-role="ficha-slot"></div>
    </section>
  `;
}

// Llamado después de insertar renderMapScreen en el DOM: monta el SVG,
// calcula la ruta por defecto y engancha la interacción. Toda la parte
// "esto se resalta al tocar" es DOM real (igual que src/map/demo.html en
// fase 04) — no se puede probar con node:test, por eso no hay
// test/ui/map.test.js: el criterio de la fase 05 para esta pantalla se
// cumple en el recorrido de navegador, no con una prueba automatizada.
export function attachMapScreen(rootEl, ctx) {
  const { appointments, lodging, now, lang, t } = ctx;
  const mount = rootEl.querySelector('.nc-map-mount');
  mount.innerHTML = renderComplexMapSvg({ lang });
  const svgEl = mount.querySelector('svg');
  const highlighter = highlighterForSvgElement(svgEl);

  const routePanel = rootEl.querySelector('[data-role="route-panel"]');
  const fichaSlot = rootEl.querySelector('[data-role="ficha-slot"]');

  const focusedAppointment = nextStep(appointments, now);
  const origin = focusedAppointment ? defaultOrigin(focusedAppointment, appointments, lodging) : 'estacionamiento';

  let stepIndex = 0;

  function renderRouteFor(destinationLocationId) {
    if (!destinationLocationId) {
      routePanel.innerHTML = `<p class="nc-route-empty">${escapeHtml(t('map.chooseDestination'))}</p>`;
      return;
    }
    const result = resolveRoute(origin, destinationLocationId, routes);
    stepIndex = 0;
    if (result === null) {
      routePanel.innerHTML = `<p class="nc-route-empty">${escapeHtml(t('map.routeNone'))}</p>`;
      return;
    }
    if (result.kind === 'same_location') {
      routePanel.innerHTML = `<p class="nc-route-empty">${escapeHtml(t('map.sameLocation'))}</p>`;
      const mp = mapPointIdForLocation(result.locationId);
      if (mp) highlighter.highlightStep(mp);
      return;
    }
    renderStepPanel(result);
  }

  function renderStepPanel(route) {
    const step = route.steps[stepIndex];
    highlighter.highlightStep(step.mapHighlightId);
    routePanel.innerHTML = `
      <p class="nc-route-step-count">${escapeHtml(t('map.routeStep')(stepIndex + 1, route.steps.length))}</p>
      <p class="nc-route-step-text">${escapeHtml(step.instruction[lang])}</p>
      <div class="nc-route-nav">
        <button type="button" class="nc-button" data-role="prev" ${stepIndex === 0 ? 'disabled' : ''}>${escapeHtml(t('map.routePrev'))}</button>
        <button type="button" class="nc-button" data-role="next" ${stepIndex === route.steps.length - 1 ? 'disabled' : ''}>${escapeHtml(t('map.routeNext'))}</button>
      </div>
    `;
    routePanel.querySelector('[data-role="prev"]')?.addEventListener('click', () => {
      if (stepIndex > 0) {
        stepIndex -= 1;
        renderStepPanel(route);
      }
    });
    routePanel.querySelector('[data-role="next"]')?.addEventListener('click', () => {
      if (stepIndex < route.steps.length - 1) {
        stepIndex += 1;
        renderStepPanel(route);
      }
    });
  }

  function openFicha(mapPointId) {
    fichaSlot.innerHTML = renderFichaHtml(mapPointId, lang);
    const meta = getMapPointMeta(mapPointId, lang);
    fichaSlot.querySelector('[data-directions-for]')?.addEventListener('click', () => {
      renderRouteFor(meta.locationId);
    });
  }

  for (const id of MAP_POINT_IDS) {
    const group = svgEl.querySelector(`[data-map-point-id="${id}"]`);
    if (!group) continue;
    group.addEventListener('click', () => openFicha(id));
    group.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        openFicha(id);
      }
    });
  }

  renderRouteFor(focusedAppointment ? focusedAppointment.locationId : null);
}

export const MAP_SCREEN_CSS = `
.nc-map-mount svg { width: 100%; height: auto; display: block; }
.nc-route-panel { margin-top: 12px; background: var(--nc-card-bg); border: 1px solid var(--nc-card-border); border-radius: 12px; padding: 12px 14px; min-height: 44px; }
.nc-route-step-count { margin: 0 0 4px; font-size: 12px; opacity: 0.7; }
.nc-route-step-text { margin: 0 0 10px; font-size: 14px; }
.nc-route-nav { display: flex; gap: 8px; }
.nc-route-empty { margin: 0; font-size: 13px; opacity: 0.75; }
.nc-ficha-slot { margin-top: 12px; }
`;
