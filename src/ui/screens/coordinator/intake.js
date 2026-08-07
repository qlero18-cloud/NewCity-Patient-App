// Fase 09 — Alta de visita (docs/phases/phase-09-coordinator-demo.md):
// formulario con el subconjunto de Visit (PRD §7) que le toca capturar a
// la coordinadora — patientFirstName, lang, startsAt, endsAt. Primer
// <form> del proyecto: sin librería de date-picker, así que startsAt/
// endsAt son <input type="text"> con placeholder de ejemplo ISO en vez de
// datetime-local, tal como decide el doc de esta fase.
//
// Al guardar, esta pantalla NO navega por sí misma — coordinatorApp.js
// (el enrutador, construido aparte) decide qué hacer con la visita nueva
// vía el callback onCreated; por eso este archivo no trae ningún
// data-nav.

import { escapeHtml } from '../../util.js';

export function renderIntakeScreen(ctx) {
  const { t } = ctx;

  return `
    <section class="nc-screen">
      <h1 class="nc-screen-title">${escapeHtml(t('coordinator.intake.title'))}</h1>
      <form class="nc-form" data-role="intake-form">
        <label class="nc-field">
          <span class="nc-field-label">${escapeHtml(t('coordinator.intake.firstNameLabel'))}</span>
          <input type="text" name="patientFirstName" class="nc-input" required />
        </label>

        <label class="nc-field">
          <span class="nc-field-label">${escapeHtml(t('coordinator.intake.langLabel'))}</span>
          <select name="lang" class="nc-input">
            <option value="es">es</option>
            <option value="en">en</option>
          </select>
        </label>

        <label class="nc-field">
          <span class="nc-field-label">${escapeHtml(t('coordinator.intake.startsAtLabel'))}</span>
          <input type="text" name="startsAt" class="nc-input" placeholder="2026-03-10T10:00-07:00" required />
        </label>

        <label class="nc-field">
          <span class="nc-field-label">${escapeHtml(t('coordinator.intake.endsAtLabel'))}</span>
          <input type="text" name="endsAt" class="nc-input" placeholder="2026-03-12T12:00-07:00" required />
        </label>

        <button type="submit" class="nc-button nc-button--primary">${escapeHtml(t('coordinator.intake.save'))}</button>
      </form>
    </section>
  `;
}

export function attachIntakeScreen(rootEl, ctx = {}) {
  const { store, onCreated } = ctx;
  const form = rootEl.querySelector('[data-role="intake-form"]');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const newVisit = store.createVisit({
      patientFirstName: data.get('patientFirstName'),
      lang: data.get('lang'),
      startsAt: data.get('startsAt'),
      endsAt: data.get('endsAt'),
    });
    onCreated?.(newVisit);
  });
}

export const INTAKE_CSS = `
.nc-form { display: flex; flex-direction: column; gap: 14px; margin-top: 4px; }
.nc-field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.nc-field-label { font-weight: 600; opacity: 0.85; }
.nc-input { min-height: 44px; border-radius: 10px; border: 1px solid var(--nc-card-border); background: var(--nc-card-bg); color: var(--nc-ink); font: 400 15px Barlow, system-ui, sans-serif; padding: 0 12px; }
select.nc-input { appearance: none; -webkit-appearance: none; background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%); background-position: calc(100% - 18px) center, calc(100% - 13px) center; background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; }
.nc-form button[type="submit"] { margin-top: 6px; }
`;
