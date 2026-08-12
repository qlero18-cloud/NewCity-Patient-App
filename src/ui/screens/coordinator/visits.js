// Fase 09 — Lista de visitas: pantalla de entrada del panel de
// coordinación (docs/phases/phase-09-coordinator-demo.md). Cada tarjeta
// muestra el dato crudo de Visit tal como lo guarda coordinatorStore.js
// (patientFirstName, lang, startsAt/endsAt como ISO plano) — a propósito
// sin domain/ ni formateo para paciente: esto es captura/consulta para la
// coordinadora, no la vista pulida que ya tienen home.js/itinerary.js
// para el paciente.
//
// "Nueva visita" navega con data-nav="intake" (D28: la única convención
// sancionada para un destino fijo de navegación — ver src/ui/nav.js).
// Cada tarjeta, en cambio, lleva data-select-visit="<visit.id>" en vez de
// data-nav: el router necesita saber CUÁL visita abrir, no solo a qué
// pantalla ir, y un data-nav de destino fijo no puede cargar un id. El
// router central (coordinatorApp.js, construido aparte) cablea
// [data-select-visit] con su propio listener — este archivo solo pinta
// el atributo, nunca lo escucha.

import { escapeHtml } from '../../util.js';
import { renderCard } from '../../components/card.js';

function renderVisitCard(visit, t) {
  const inner = `
    <p class="nc-visit-name">${escapeHtml(visit.patientFirstName)}</p>
    <p class="nc-visit-row"><span>${escapeHtml(t('coordinator.intake.langLabel'))}</span> ${escapeHtml(visit.lang)}</p>
    <p class="nc-visit-row"><span>${escapeHtml(t('coordinator.intake.startsAtLabel'))}</span> ${escapeHtml(visit.startsAt)}</p>
    <p class="nc-visit-row"><span>${escapeHtml(t('coordinator.intake.endsAtLabel'))}</span> ${escapeHtml(visit.endsAt)}</p>
  `;
  // <button> envolviendo la tarjeta (no un <div data-select-visit>
  // suelto): así el clic/teclado la activa con la semántica nativa de
  // botón sin que esta pantalla tenga que cablear su propio
  // addEventListener/role/tabindex — eso es responsabilidad del router
  // central, no de esta pantalla (ver comentario de cabecera).
  return `<button type="button" class="nc-visit-card-button" data-select-visit="${escapeHtml(visit.id)}">${renderCard(inner)}</button>`;
}

export function renderVisitsScreen(ctx) {
  const { store, lang, t } = ctx;
  // listVisits() regresa el registro completo por visita ({ visit,
  // appointments, passes, lodging } — ver coordinatorStore.js), no el
  // Visit plano: hay que desenvolver .visit antes de leer sus campos.
  const records = store.listVisits();

  const body = records.length === 0
    ? `<p class="nc-empty-state">${escapeHtml(t('coordinator.visits.empty'))}</p>`
    : `<div class="nc-visit-list">${records.map((r) => renderVisitCard(r.visit, t)).join('\n')}</div>`;

  return `
    <section class="nc-screen">
      <h1 class="nc-screen-title">${escapeHtml(t('coordinator.visits.title'))}</h1>
      ${body}
      <div class="nc-visit-actions">
        <button type="button" class="nc-button nc-button--primary" data-nav="intake">${escapeHtml(t('coordinator.visits.newVisit'))}</button>
        <!-- Etapa I — el otro camino de entrada, no el único: hay visitas
             que no salen de un documento (una cita suelta, un cambio de
             última hora) y el alta manual sigue siendo lo correcto ahí. -->
        <button type="button" class="nc-button" data-nav="import">${escapeHtml(t('coordinator.visits.importItinerary'))}</button>
      </div>
    </section>
  `;
}

// Nada propio que cablear: la selección de visita (data-select-visit) y
// "nueva visita" (data-nav="intake") las conecta el router central
// (coordinatorApp.js — attachNav para data-nav, un listener aparte para
// data-select-visit), no esta pantalla. Se exporta como no-op, no se
// omite, para que coordinatorApp.js pueda llamar attach*Screen de forma
// uniforme en las cinco pantallas nuevas sin un caso especial para esta.
export function attachVisitsScreen(rootEl, ctx) {}

export const VISITS_CSS = `
.nc-screen-title { font-size: 20px; margin: 4px 0 16px; }
.nc-empty-state { font-size: 13px; opacity: 0.65; }
.nc-visit-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
.nc-visit-card-button { display: block; width: 100%; min-height: 44px; margin: 0; padding: 0; border: none; background: none; text-align: left; font: inherit; color: inherit; cursor: pointer; }
.nc-visit-name { margin: 0 0 8px; font-size: 16px; font-weight: 700; }
.nc-visit-row { display: flex; gap: 6px; margin: 0 0 4px; font-size: 13px; }
.nc-visit-row:last-child { margin-bottom: 0; }
.nc-visit-row span { min-width: 100px; opacity: 0.7; }
.nc-visit-actions { display: flex; flex-direction: column; gap: 8px; }
/* Etapa J — esta lista NO es cronológica: son pacientes, un conjunto. En
   cuanto hay ancho se acomodan en rejilla en vez de dejar un metro de
   blanco a la derecha de tarjetas de una sola línea. Las listas que sí
   llevan orden en el tiempo (itinerario, traslados) se quedan en una
   columna a propósito: leerlas en zigzag sería peor. */
@media (min-width: 700px) {
  .nc-visit-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; align-items: start; }
  .nc-visit-actions { flex-direction: row; flex-wrap: wrap; }
}
`;
