// Fase 09 — Editor de itinerario del panel de coordinadores: agregar,
// editar, mover y cancelar citas de una visita seleccionada (docs/phases/
// phase-09-coordinator-demo.md: "agregar una cita, editarla, moverla
// (cambiar startsAt) y cancelarla" — cuatro acciones propias). ctx =
// { store, visitId, lang, t }. store.getVisit(visitId) regresa el record
// completo { visit, appointments, passes, lodging } (src/ui/
// coordinatorStore.js) — de ahí se lee .appointments, no
// .visit.appointments.
//
// A propósito sin domain/ ni formateo para paciente: serviceName, startsAt
// y durationMin se pintan tal cual los guarda la store — captura/consulta
// cruda para la coordinadora, no la vista pulida que ya tiene el
// ../itinerary.js del paciente.
//
// Dos excepciones, ambas porque "crudo" ahí significaba "en inglés en los
// dos idiomas":
//   - status se traduce entero. cancelled/moved vía renderBadge +
//     coordinator.itinerary.{cancelledBadge,movedBadge}; los otros tres vía
//     itinerary.status.{scheduled,in_progress,done}. (Una versión anterior
//     de este comentario afirmaba que no existían llaves i18n para esos
//     tres — era falso: están en src/ui/i18n.js desde la fase 05.)
//   - locationId se pinta como nombre de la ubicación, no como slug: el id
//     ya no lo teclea nadie, lo elige un <select> (D40), así que mostrarlo
//     en crudo solo servía para depurar.
//
// El tachado de una cita cancelada reutiliza la TÉCNICA de ../itinerary.js
// (una clase modificadora sobre la línea de serviceName, con classNames()),
// no sus nombres: aquí son .nc-coord-itin-what/--cancelled. Antes eran
// .nc-itin-what/--cancelled, prestadas literalmente de la pantalla del
// paciente, lo que contradecía la razón misma de que este directorio
// exista. No rompía nada todavía —los dos bundles son documentos distintos
// y las reglas eran idénticas— pero era un conflicto latente: cambiar el
// tachado del paciente habría dejado al panel con el estilo viejo en
// silencio. test/ui/coordinator/cssNamespace.test.js lo impide de aquí en
// adelante para todo el directorio, no solo para este par.
//
// Este archivo se basta solo en CSS: no hay garantía de orden de carga
// entre las pantallas hermanas de coordinator/, así que además de sus
// propias clases trae su copia de .nc-screen-title y .nc-empty-state
// (primitivas compartidas del proyecto, mismas reglas en todos lados) en
// vez de asumir que otra pantalla del panel las define primero.

import { escapeHtml, classNames, locationName, locationOptionsHtml } from '../../util.js';
import { locations } from '../../../data/locations.js';
import { renderCard } from '../../components/card.js';
import { renderBadge } from '../../components/badge.js';

// Formato que espera la store para startsAt. Se muestra como placeholder en
// vez de dejar el campo mudo — mismo criterio que ya usan los dos campos de
// fecha de intake.js.
const STARTS_AT_PLACEHOLDER = '2026-03-10T08:00-07:00';

function renderAppointmentCard(appointment, lang, t) {
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
  // editAppointment). El botón no captura nada: revela el formulario
  // inline de su tarjeta (renderEditForm, abajo). Mismo patrón que "mover",
  // para no tener dos interacciones distintas en el mismo archivo para dos
  // acciones hermanas.
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
  // Los cinco status ya tienen llave i18n (itinerary.status.*, src/ui/
  // i18n.js) — el comentario de cabecera de este archivo afirmaba lo
  // contrario y era falso: scheduled/in_progress/done existen ahí desde la
  // fase 05. Se pintan traducidos como los otros dos, en vez de dejar el
  // enum crudo en inglés en ambos idiomas.
  const statusHtml = cancelled
    ? `<p class="nc-coord-itin-status-badge">${renderBadge(t('coordinator.itinerary.cancelledBadge'), 'cancelled')}</p>`
    : moved
      ? `<p class="nc-coord-itin-status-badge">${renderBadge(t('coordinator.itinerary.movedBadge'), 'updated')}</p>`
      : `<p class="nc-coord-itin-status">${escapeHtml(t(`itinerary.status.${appointment.status}`))}</p>`;

  return renderCard(
    `
      <p class="${classNames(['nc-coord-itin-what', cancelled && 'nc-coord-itin-what--cancelled'])}">${escapeHtml(appointment.serviceName)}</p>
      <p class="nc-coord-itin-row"><span>${escapeHtml(t('coordinator.itinerary.startsAtLabel'))}</span> ${escapeHtml(appointment.startsAt)}</p>
      <p class="nc-coord-itin-row"><span>${escapeHtml(t('coordinator.itinerary.durationLabel'))}</span> ${escapeHtml(appointment.durationMin)}</p>
      <p class="nc-coord-itin-row"><span>${escapeHtml(t('coordinator.itinerary.locationLabel'))}</span> ${escapeHtml(locationName(locations, appointment.locationId, lang))}</p>
      ${statusHtml}
      <div class="nc-coord-itin-actions">
        <button type="button" class="nc-button" data-role="move-appointment" data-appointment-id="${escapeHtml(appointment.id)}">${escapeHtml(t('coordinator.itinerary.move'))}</button>
        ${editControl}
        ${cancelControl}
      </div>
      ${renderMoveForm(appointment, t)}
      ${cancelled ? '' : renderEditForm(appointment, lang, t)}
    `,
    { extraClass: cancelled ? 'nc-card--muted' : '' }
  );
}

// D40 — mover y editar eran cadenas de window.prompt() (D33). Un prompt no
// puede ser un <select>, así que dejaban abierta exactamente la misma puerta
// que el dropdown cierra en el formulario de agregar: bastaba teclear mal la
// ubicación al editar para romper el mapa de esa cita.
//
// Los dos formularios se pintan siempre, ocultos con [hidden], y el botón
// correspondiente los muestra. Así no hay estado de "qué tarjeta está en
// edición" que mantener entre repintados: tras una mutación exitosa el
// router vuelve a pintar la pantalla desde cero y los formularios vuelven a
// quedar ocultos solos.
function renderMoveForm(appointment, t) {
  return `
    <form data-role="move-appointment-form" data-appointment-id="${escapeHtml(appointment.id)}" class="nc-coord-itin-form nc-coord-itin-form--inline" hidden>
      <label class="nc-coord-itin-field">
        <span>${escapeHtml(t('coordinator.itinerary.startsAtLabel'))}</span>
        <input type="text" name="moveStartsAt" class="nc-coord-itin-input" required
               placeholder="${escapeHtml(STARTS_AT_PLACEHOLDER)}" value="${escapeHtml(appointment.startsAt)}" />
      </label>
      <button type="submit" class="nc-button nc-button--primary nc-coord-itin-submit">${escapeHtml(t('coordinator.itinerary.move'))}</button>
    </form>
  `;
}

function renderEditForm(appointment, lang, t) {
  return `
    <form data-role="edit-appointment-form" data-appointment-id="${escapeHtml(appointment.id)}" class="nc-coord-itin-form nc-coord-itin-form--inline" hidden>
      <label class="nc-coord-itin-field">
        <span>${escapeHtml(t('coordinator.itinerary.serviceNameLabel'))}</span>
        <input type="text" name="editServiceName" class="nc-coord-itin-input" required value="${escapeHtml(appointment.serviceName)}" />
      </label>
      <label class="nc-coord-itin-field">
        <span>${escapeHtml(t('coordinator.itinerary.durationLabel'))}</span>
        <input type="number" name="editDurationMin" class="nc-coord-itin-input" required min="1" step="1" value="${escapeHtml(appointment.durationMin)}" />
      </label>
      <label class="nc-coord-itin-field">
        <span>${escapeHtml(t('coordinator.itinerary.locationLabel'))}</span>
        <select name="editLocationId" class="nc-coord-itin-input" required>
          ${locationOptionsHtml(locations, lang, appointment.locationId)}
        </select>
      </label>
      <button type="submit" class="nc-button nc-button--primary nc-coord-itin-submit">${escapeHtml(t('coordinator.itinerary.edit'))}</button>
    </form>
  `;
}

function renderAddAppointmentForm(lang, t) {
  return `
    <form data-role="add-appointment-form" class="nc-coord-itin-form">
      <label class="nc-coord-itin-field">
        <span>${escapeHtml(t('coordinator.itinerary.serviceNameLabel'))}</span>
        <input type="text" name="serviceName" class="nc-coord-itin-input" required />
      </label>
      <label class="nc-coord-itin-field">
        <span>${escapeHtml(t('coordinator.itinerary.startsAtLabel'))}</span>
        <input type="text" name="startsAt" class="nc-coord-itin-input" required placeholder="${escapeHtml(STARTS_AT_PLACEHOLDER)}" />
      </label>
      <label class="nc-coord-itin-field">
        <span>${escapeHtml(t('coordinator.itinerary.durationLabel'))}</span>
        <input type="number" name="durationMin" class="nc-coord-itin-input" required min="1" step="1" />
      </label>
      <label class="nc-coord-itin-field">
        <span>${escapeHtml(t('coordinator.itinerary.locationLabel'))}</span>
        <select name="locationId" class="nc-coord-itin-input" required>
          ${locationOptionsHtml(locations, lang)}
        </select>
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
  // stay.js para lodging ausente). El mensaje sale de
  // coordinator.visitNotFound, la MISMA llave que usan lodging.js y
  // qpass.js: antes cada archivo traía su propio `lang === 'en' ? … : …`,
  // la única traducción del proyecto hecha fuera de i18n.js.
  if (!record) {
    return `
      <section class="nc-screen">
        <h1 class="nc-screen-title">${escapeHtml(title)}</h1>
        <p class="nc-empty-state">${escapeHtml(t('coordinator.visitNotFound'))}</p>
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
    : `<div class="nc-coord-itin-list">${sortedAppointments.map((a) => renderAppointmentCard(a, lang, t)).join('\n')}</div>`;

  return `
    <section class="nc-screen">
      <h1 class="nc-screen-title">${escapeHtml(title)}</h1>
      ${body}
      ${renderAddAppointmentForm(lang, t)}
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

  // D40 — los botones ya no piden datos: revelan el formulario inline de su
  // propia tarjeta. Mostrar uno esconde cualquier otro abierto, para que no
  // queden dos ediciones a medias en pantalla al mismo tiempo.
  function toggleInlineForm(role, appointmentId) {
    const target = rootEl.querySelector(`[data-role="${role}"][data-appointment-id="${appointmentId}"]`);
    if (!target) return;
    const wasHidden = target.hidden;
    rootEl.querySelectorAll('.nc-coord-itin-form--inline').forEach((f) => { f.hidden = true; });
    target.hidden = !wasHidden;
    if (!target.hidden) target.querySelector('input, select')?.focus();
  }

  rootEl.querySelectorAll('[data-role="move-appointment"]').forEach((btn) => {
    btn.addEventListener('click', () => toggleInlineForm('move-appointment-form', btn.dataset.appointmentId));
  });

  rootEl.querySelectorAll('[data-role="edit-appointment"]').forEach((btn) => {
    btn.addEventListener('click', () => toggleInlineForm('edit-appointment-form', btn.dataset.appointmentId));
  });

  rootEl.querySelectorAll('[data-role="move-appointment-form"]').forEach((moveForm) => {
    moveForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const newStartsAt = moveForm.elements.moveStartsAt.value.trim();
      if (!newStartsAt) return;
      store.moveAppointment(visitId, moveForm.dataset.appointmentId, newStartsAt, now);
      onChange?.();
    });
  });

  rootEl.querySelectorAll('[data-role="edit-appointment-form"]').forEach((editForm) => {
    editForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const fields = editForm.elements;
      store.editAppointment(
        visitId,
        editForm.dataset.appointmentId,
        {
          serviceName: fields.editServiceName.value.trim(),
          durationMin: Number(fields.editDurationMin.value),
          locationId: fields.editLocationId.value,
        },
        now
      );
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
.nc-coord-itin-what { margin: 0 0 4px; font-size: 15px; font-weight: 600; }
.nc-coord-itin-what--cancelled { text-decoration: line-through; opacity: 0.6; }
.nc-coord-itin-row { display: flex; gap: 6px; margin: 0 0 4px; font-size: 13px; }
.nc-coord-itin-row span { min-width: 100px; opacity: 0.7; }
.nc-coord-itin-status { margin: 6px 0 0; font-size: 12px; opacity: 0.8; text-transform: uppercase; letter-spacing: 0.03em; }
.nc-coord-itin-status-badge { margin: 6px 0 0; }
.nc-coord-itin-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.nc-coord-itin-form { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
.nc-coord-itin-field { display: flex; flex-direction: column; gap: 4px; }
.nc-coord-itin-input { min-height: 44px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--nc-card-border); background: var(--nc-surface); color: var(--nc-ink); font: 400 15px Barlow, system-ui, sans-serif; }
.nc-coord-itin-submit { align-self: flex-start; }
/* El <select> de ubicación (D40) necesita su propia flecha: Safari y
   Firefox no pintan ninguna cuando se le quita la apariencia nativa, y sin
   esto el campo parece un input de texto deshabilitado. Mismo tratamiento
   que ya trae select.nc-input en intake.js, repetido aquí porque esa regla
   está acotada a .nc-input y no alcanza a .nc-coord-itin-input. */
select.nc-coord-itin-input {
  appearance: none; -webkit-appearance: none; -moz-appearance: none;
  padding-right: 34px;
  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position: right 16px center, right 11px center;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
}
/* Los formularios inline de mover/editar viven dentro de la tarjeta: se
   separan de los botones y se marcan con un borde superior para que se lea
   que pertenecen a esa cita y no al formulario de agregar de abajo. */
.nc-coord-itin-form--inline { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--nc-card-border); }
.nc-coord-itin-form--inline[hidden] { display: none; }
`;
