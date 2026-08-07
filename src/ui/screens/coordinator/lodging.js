// Fase 09 — Hospedaje: registro/edición de Lodging (PRD §7) para una
// visita seleccionada del panel de coordinadores. ctx = { store, visitId,
// lang, t }. store.getVisit(visitId) regresa el record completo
// { visit, appointments, passes, lodging } (src/ui/coordinatorStore.js).
//
// No hay pantalla de edición aparte: si record.lodging ya existe (no es
// null), este mismo formulario se prellena con esos valores, y volver a
// enviarlo sobrescribe el hospedaje de la visita vía store.setLodging —
// eso ES "editar" en esta demo (docs/phases/phase-09-coordinator-demo.md,
// "Alcance": "Registro de hospedaje ... asociado a una visita").
//
// checkIn/checkOut son <input type="text">, igual que el resto de fechas
// capturadas a mano en esta demo (mismo razonamiento que intake.js con
// startsAt/endsAt): sin dependencia de un date-picker.
//
// Nombres de campo iguales a los que ya lee src/ui/screens/stay.js del
// lado paciente: hotel, reservationCode, checkIn, checkOut,
// breakfastIncluded, recoveryRoom.

import { escapeHtml } from '../../util.js';
import { renderCard } from '../../components/card.js';

// name siempre es un literal fijo en cada punto de llamada (nunca dato de
// paciente/coordinadora) — igual se envuelve en escapeHtml aquí (fix de
// revisión adversarial, fase 09): era el único sitio de interpolación de
// este proyecto sin escapeHtml, y la convención de util.js es usarlo
// SIEMPRE en texto/atributos interpolados, no solo donde hoy hay dato
// no confiable.
function textField(name, value, label) {
  return `
    <label class="nc-lodging-field">
      <span class="nc-lodging-field-label">${escapeHtml(label)}</span>
      <input type="text" name="${escapeHtml(name)}" value="${escapeHtml(value ?? '')}" class="nc-lodging-input" />
    </label>
  `;
}

function checkboxField(name, checked, label) {
  return `
    <label class="nc-lodging-field nc-lodging-field--checkbox">
      <input type="checkbox" name="${escapeHtml(name)}" class="nc-lodging-checkbox"${checked ? ' checked' : ''} />
      <span class="nc-lodging-field-label">${escapeHtml(label)}</span>
    </label>
  `;
}

export function renderLodgingScreen(ctx) {
  const { store, visitId, t } = ctx;
  const title = t('coordinator.lodging.title');
  const record = store.getVisit(visitId);

  // Guard: visita inexistente -> fallback corto, sin formulario, sin
  // lanzar (misma disciplina de defensa en profundidad que ya usa
  // src/ui/screens/stay.js para lodging ausente).
  if (!record) {
    return `
      <section class="nc-screen">
        <h1 class="nc-screen-title">${escapeHtml(title)}</h1>
      </section>
    `;
  }

  const lodging = record.lodging;

  return `
    <section class="nc-screen">
      <h1 class="nc-screen-title">${escapeHtml(title)}</h1>
      <form data-role="lodging-form" class="nc-lodging-form">
        ${renderCard(`
          ${textField('hotel', lodging?.hotel, t('coordinator.lodging.hotelLabel'))}
          ${textField('reservationCode', lodging?.reservationCode, t('coordinator.lodging.reservationCodeLabel'))}
          ${textField('checkIn', lodging?.checkIn, t('coordinator.lodging.checkInLabel'))}
          ${textField('checkOut', lodging?.checkOut, t('coordinator.lodging.checkOutLabel'))}
          ${checkboxField('breakfastIncluded', !!lodging?.breakfastIncluded, t('coordinator.lodging.breakfastLabel'))}
          ${checkboxField('recoveryRoom', !!lodging?.recoveryRoom, t('coordinator.lodging.recoveryLabel'))}
        `)}
        <button type="submit" class="nc-button nc-button--primary nc-lodging-submit">${escapeHtml(t('coordinator.lodging.save'))}</button>
      </form>
    </section>
  `;
}

// ctx aquí además trae { onChange } (mismo contrato que el resto de
// attach*Screen interactivos de esta fase): se llama después de insertar
// el HTML en el DOM, nunca antes.
export function attachLodgingScreen(rootEl, ctx) {
  const { store, visitId, onChange } = ctx;
  const form = rootEl.querySelector('[data-role="lodging-form"]');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = form.elements;
    store.setLodging(visitId, {
      hotel: fields.hotel.value,
      reservationCode: fields.reservationCode.value,
      checkIn: fields.checkIn.value,
      checkOut: fields.checkOut.value,
      breakfastIncluded: fields.breakfastIncluded.checked,
      recoveryRoom: fields.recoveryRoom.checked,
    });
    onChange?.();
  });
}

export const LODGING_CSS = `
.nc-lodging-form { display: flex; flex-direction: column; gap: 14px; }
.nc-lodging-field { display: flex; flex-direction: column; gap: 4px; margin: 0 0 12px; }
.nc-lodging-field:last-child { margin-bottom: 0; }
.nc-lodging-field-label { font-size: 13px; opacity: 0.75; }
.nc-lodging-input { min-height: 44px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--nc-card-border); background: var(--nc-surface); color: var(--nc-ink); font: 400 15px Barlow, system-ui, sans-serif; }
.nc-lodging-field--checkbox { flex-direction: row; align-items: center; min-height: 44px; gap: 10px; cursor: pointer; }
.nc-lodging-checkbox { width: 22px; height: 22px; flex-shrink: 0; }
.nc-lodging-submit { align-self: flex-start; }
`;
