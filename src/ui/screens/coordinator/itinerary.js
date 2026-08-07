// Fase 09 — Editor de itinerario del panel de coordinadores: agregar,
// editar, mover y cancelar citas de una visita seleccionada (docs/phases/
// phase-09-coordinator-demo.md: "agregar una cita, editarla, moverla
// (cambiar startsAt) y cancelarla" — cuatro acciones propias). ctx =
// { store, visitId, lang, t }. store.getVisit(visitId) regresa el record
// completo { visit, appointments, passes, lodging } (src/ui/
// coordinatorStore.js) — de ahí se lee .appointments, no
// .visit.appointments.
//
// A propósito sin domain/ ni formateo para paciente: serviceName,
// startsAt, durationMin y locationId se pintan tal cual los guarda la
// store — captura/consulta cruda para la coordinadora, no la vista pulida
// que ya tiene el ../itinerary.js del paciente. status es la excepción
// parcial (fix de revisión adversarial, fase 09): cancelled/moved se
// traducen vía renderBadge + coordinator.itinerary.{cancelledBadge,
// movedBadge} (i18n.js) porque esas dos llaves ya existían, sin usar,
// específicamente para esto — scheduled/in_progress/done se quedan en
// crudo, sin traducir, porque no hay llave i18n para esos tres (ver
// renderAppointmentCard abajo).
//
// El tachado de una cita cancelada reutiliza la técnica de ese archivo
// (.nc-itin-what + .nc-itin-what--cancelled sobre la línea de
// serviceName, con classNames()) copiada aquí a propósito, NO importada
// — ../itinerary.js es solo referencia de lectura. Este directorio
// (src/ui/screens/coordinator/) es nuevo y aparte precisamente para no
// chocar de nombre con las pantallas del paciente ya aprobadas.
//
// Este archivo se basta solo en CSS: no hay garantía de orden de carga
// entre las pantallas hermanas de coordinator/, así que además de
// .nc-itin-what/.nc-itin-what--cancelled, también trae su propia copia de
// .nc-screen-title y .nc-empty-state (mismas reglas ya usadas en el resto
// del proyecto) en vez de asumir que otra pantalla del panel las define
// primero.

import { escapeHtml, classNames } from '../../util.js';
import { renderCard } from '../../components/card.js';
import { renderBadge } from '../../components/badge.js';

function renderAppointmentCard(appointment, t) {
  const cancelled = appointment.status === 'cancelled';
  const moved = appointment.status === 'moved';

  // Cancelar y editar se omiten para una cita que ya está cancelada
  // (editar contenido de algo cancelado no tiene sentido de negocio,
  // mismo criterio ya aplicado a cancelar); mover sigue disponible siempre
  // (no hay razón de negocio dada para bloquearlo).
  const cancelControl = cancelled
    ? ''
    : `<button type="button" class="nc-button" data-role="cancel-appointment" data-appointment-id="${escapeHtml(appointment.id)}">${escapeHtml(t('coordinator.itinerary.cancel'))}</button>`;

  // "editarla" (docs/phases/phase-09-coordinator-demo.md) es una acción
  // propia, distinta de "moverla": edita serviceName/durationMin/
  // locationId, nunca startsAt ni status (coordinatorStore.js#
  // editAppointment). Misma interacción mínima deliberada que ya usa
  // "mover" (attachItineraryScreen, abajo): tres window.prompt()
  // encadenados, no un formulario nuevo — ver ese comentario para el
  // porqué (sin dependencia de date-picker en el proyecto); aquí se
  // reutiliza el mismo criterio para no introducir dos patrones de
  // interacción distintos en el mismo archivo para acciones hermanas.
  const editControl = cancelled
    ? ''
    : `<button type="button" class="nc-button" data-role="edit-appointment" data-appointment-id="${escapeHtml(appointment.id)}">${escapeHtml(t('coordinator.itinerary.edit'))}</button>`;

  // Fix (revisión adversarial, fase 09): coordinator.itinerary.
  // cancelledBadge/movedBadge (i18n.js) existían sin usar, y el estado se
  // pintaba como el enum crudo ("cancelled"/"moved") igual en es que en
  // en — violando el criterio de aceptación "ninguna cadena nueva queda
  // fija en un solo idioma". renderBadge es el mismo componente que ya
  // usa ../itinerary.js (paciente) y qpass.js, no texto libre nuevo.
  // 'updated' es la variante ya usada por el lado paciente para señalar
  // que una cita cambió de horario — mismo significado que "movida" aquí.
  const statusHtml = cancelled
    ? `<p class="nc-coord-itin-status-badge">${renderBadge(t('coordinator.itinerary.cancelledBadge'), 'cancelled')}</p>`
    : moved
      ? `<p class="nc-coord-itin-status-badge">${renderBadge(t('coordinator.itinerary.movedBadge'), 'updated')}</p>`
      : `<p class="nc-coord-itin-status">${escapeHtml(appointment.status)}</p>`;

  return renderCard(
    `
      <p class="${classNames(['nc-itin-what', cancelled && 'nc-itin-what--cancelled'])}">${escapeHtml(appointment.serviceName)}</p>
      <p class="nc-coord-itin-row"><span>${escapeHtml(t('coordinator.itinerary.startsAtLabel'))}</span> ${escapeHtml(appointment.startsAt)}</p>
      <p class="nc-coord-itin-row"><span>${escapeHtml(t('coordinator.itinerary.durationLabel'))}</span> ${escapeHtml(appointment.durationMin)}</p>
      <p class="nc-coord-itin-row"><span>${escapeHtml(t('coordinator.itinerary.locationLabel'))}</span> ${escapeHtml(appointment.locationId)}</p>
      ${statusHtml}
      <div class="nc-coord-itin-actions">
        <button type="button" class="nc-button" data-role="move-appointment" data-appointment-id="${escapeHtml(appointment.id)}">${escapeHtml(t('coordinator.itinerary.move'))}</button>
        ${editControl}
        ${cancelControl}
      </div>
    `,
    { extraClass: cancelled ? 'nc-card--muted' : '' }
  );
}

function renderAddAppointmentForm(t) {
  return `
    <form data-role="add-appointment-form" class="nc-coord-itin-form">
      <label class="nc-coord-itin-field">
        <span>${escapeHtml(t('coordinator.itinerary.serviceNameLabel'))}</span>
        <input type="text" name="serviceName" class="nc-coord-itin-input" required />
      </label>
      <label class="nc-coord-itin-field">
        <span>${escapeHtml(t('coordinator.itinerary.startsAtLabel'))}</span>
        <input type="text" name="startsAt" class="nc-coord-itin-input" required />
      </label>
      <label class="nc-coord-itin-field">
        <span>${escapeHtml(t('coordinator.itinerary.durationLabel'))}</span>
        <input type="text" name="durationMin" class="nc-coord-itin-input" required />
      </label>
      <label class="nc-coord-itin-field">
        <span>${escapeHtml(t('coordinator.itinerary.locationLabel'))}</span>
        <input type="text" name="locationId" class="nc-coord-itin-input" required />
      </label>
      <button type="submit" class="nc-button nc-button--primary nc-coord-itin-submit">${escapeHtml(t('coordinator.itinerary.addAppointment'))}</button>
    </form>
  `;
}

export function renderItineraryScreen(ctx) {
  const { store, visitId, lang, t } = ctx;
  const title = t('coordinator.itinerary.title');
  const record = store.getVisit(visitId);

  // Guard: visita inexistente -> alternativa corta, sin lanzar (misma
  // disciplina de defensa en profundidad que ya usa src/ui/screens/
  // stay.js para lodging ausente). No existe una llave de i18n para este
  // caso (no está en coordinator.itinerary.* de src/ui/i18n.js) — literal
  // corto aquí en vez de tocar ese archivo compartido; ver el reporte
  // final de esta tarea.
  if (!record) {
    const fallback = lang === 'en' ? 'Visit not found.' : 'Visita no encontrada.';
    return `
      <section class="nc-screen">
        <h1 class="nc-screen-title">${escapeHtml(title)}</h1>
        <p class="nc-empty-state">${escapeHtml(fallback)}</p>
      </section>
    `;
  }

  const { appointments } = record;

  // Fix (revisión adversarial, fase 09): el criterio de aceptación del
  // doc de esta fase pide que "una cita movida reordene la línea de
  // tiempo" — antes se pintaba appointments tal cual, en su orden de
  // inserción original, sin importar el startsAt nuevo tras moverla.
  // Copia nueva vía spread + sort (nunca se muta record.appointments, el
  // array real de la store) — new Date(...).getTime() en vez de comparar
  // los strings ISO tal cual, para no depender de que todas las visitas
  // usen el mismo offset de zona horaria.
  const sortedAppointments = [...appointments].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );

  const body = sortedAppointments.length === 0
    ? `<p class="nc-empty-state">${escapeHtml(t('coordinator.itinerary.empty'))}</p>`
    : `<div class="nc-coord-itin-list">${sortedAppointments.map((a) => renderAppointmentCard(a, t)).join('\n')}</div>`;

  return `
    <section class="nc-screen">
      <h1 class="nc-screen-title">${escapeHtml(title)}</h1>
      ${body}
      ${renderAddAppointmentForm(t)}
    </section>
  `;
}

// ctx aquí además trae { now, onChange } (mismo contrato que el resto de
// attach*Screen interactivos de esta fase): now nunca se lee del reloj
// real aquí (eso es privilegio de src/ui/coordinatorApp.js, D20), y
// onChange se llama después de cada mutación exitosa de la store para que
// el router vuelva a pintar la pantalla con el estado nuevo.
export function attachItineraryScreen(rootEl, ctx) {
  const { store, visitId, now, onChange, t } = ctx;

  const form = rootEl.querySelector('[data-role="add-appointment-form"]');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = form.elements;
    store.addAppointment(
      visitId,
      {
        serviceName: fields.serviceName.value,
        startsAt: fields.startsAt.value,
        durationMin: Number(fields.durationMin.value),
        locationId: fields.locationId.value,
      },
      now
    );
    onChange?.();
  });

  rootEl.querySelectorAll('[data-role="move-appointment"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      // Interacción mínima deliberada de esta demo (docs/phases/phase-09-
      // coordinator-demo.md): el proyecto no trae ninguna dependencia de
      // date-picker, así que "mover" una cita pide la nueva fecha/hora con
      // window.prompt(). Es un placeholder conocido y minimalista a
      // propósito — no un patrón de producción.
      const newStartsAt = window.prompt(t('coordinator.itinerary.startsAtLabel'));
      if (!newStartsAt) return;
      store.moveAppointment(visitId, btn.dataset.appointmentId, newStartsAt, now);
      onChange?.();
    });
  });

  rootEl.querySelectorAll('[data-role="edit-appointment"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      // Misma interacción mínima deliberada que "mover" arriba: tres
      // window.prompt() encadenados, reutilizando las mismas llaves de
      // etiqueta que ya usa el formulario de agregar (serviceNameLabel/
      // durationLabel/locationLabel) en vez de inventar copy nueva solo
      // para estos prompts — igual que "mover" reutiliza startsAtLabel
      // para el suyo. Cada prompt trae el valor actual como default (2o
      // argumento de window.prompt) para que la coordinadora vea qué va a
      // cambiar, no un cuadro vacío. Cancelar en cualquiera de los tres
      // (null) aborta todo el flujo sin mutar nada — ninguna edición
      // parcial.
      const appointmentId = btn.dataset.appointmentId;
      const current = store.getVisit(visitId)?.appointments.find((a) => a.id === appointmentId);
      if (!current) return;

      const serviceName = window.prompt(t('coordinator.itinerary.serviceNameLabel'), current.serviceName);
      if (serviceName === null) return;
      const durationMinRaw = window.prompt(t('coordinator.itinerary.durationLabel'), String(current.durationMin));
      if (durationMinRaw === null) return;
      const locationId = window.prompt(t('coordinator.itinerary.locationLabel'), current.locationId);
      if (locationId === null) return;

      store.editAppointment(visitId, appointmentId, { serviceName, durationMin: Number(durationMinRaw), locationId }, now);
      onChange?.();
    });
  });

  rootEl.querySelectorAll('[data-role="cancel-appointment"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.cancelAppointment(visitId, btn.dataset.appointmentId, now);
      onChange?.();
    });
  });
}

export const ITINERARY_CSS = `
.nc-screen-title { font-size: 20px; margin: 4px 0 16px; }
.nc-empty-state { font-size: 13px; opacity: 0.65; }
.nc-coord-itin-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
.nc-itin-what { margin: 0 0 4px; font-size: 15px; font-weight: 600; }
.nc-itin-what--cancelled { text-decoration: line-through; opacity: 0.6; }
.nc-coord-itin-row { display: flex; gap: 6px; margin: 0 0 4px; font-size: 13px; }
.nc-coord-itin-row span { min-width: 100px; opacity: 0.7; }
.nc-coord-itin-status { margin: 6px 0 0; font-size: 12px; opacity: 0.8; text-transform: uppercase; letter-spacing: 0.03em; }
.nc-coord-itin-status-badge { margin: 6px 0 0; }
.nc-coord-itin-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.nc-coord-itin-form { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
.nc-coord-itin-field { display: flex; flex-direction: column; gap: 4px; }
.nc-coord-itin-input { min-height: 44px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--nc-card-border); background: var(--nc-surface); color: var(--nc-ink); font: 400 15px Barlow, system-ui, sans-serif; }
.nc-coord-itin-submit { align-self: flex-start; }
`;
