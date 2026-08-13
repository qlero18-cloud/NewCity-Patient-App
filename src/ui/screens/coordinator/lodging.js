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
// Etapa H (D75/D77) — checkIn/checkOut eran <input type="text">. Ahora son
// <input type="datetime-local">, con HORA, y no <input type="date"> como
// las fechas de la visita: el hospedaje se guarda como instante y esa hora
// se usa. src/ui/screens/stay.js le pinta al paciente "Martes 10 · 3:00
// p.m." leyendo estos mismos campos, y computeExpiresAt (R1) usa checkOut
// para decidir hasta cuándo vive su enlace. Capturar solo el día obligaría
// a inventar una hora de hotel o a pintarle "12:00 a.m." al paciente.
//
// Nombres de campo iguales a los que ya lee src/ui/screens/stay.js del
// lado paciente: hotel, reservationCode, checkIn, checkOut,
// breakfastIncluded, recoveryRoom.

import { escapeHtml } from '../../util.js';
import { renderCard } from '../../components/card.js';
import { instantMs, toIsoTijuana, toLocalInput } from '../../../domain/time.js';
import { renderFormErrors, renderRequestError } from './formErrors.js';
import { visitWindowAttrs } from './dateWindow.js';

// Etapa D — el servidor valida lo mismo que validateLodging, y a veces
// más. Los errores por campo de ARRIBA (los <span> junto a cada input) los
// pone la validación local; este mapa es para los que llegan del servidor,
// que se resumen en bloque porque no siempre corresponden a un input
// visible.
// (Sufijo _HOSPEDAJE por la colisión de scope que documenta intake.js.)
const CAMPOS_HOSPEDAJE = {
  hotel: 'coordinator.lodging.hotelLabel',
  reservationCode: 'coordinator.lodging.reservationCodeLabel',
  checkIn: 'coordinator.lodging.checkInLabel',
  checkOut: 'coordinator.lodging.checkOutLabel',
  roomType: 'coordinator.lodging.roomTypeLabel',
  nights: 'coordinator.lodging.nightsLabel',
  occupancy: 'coordinator.lodging.occupancyLabel',
  total: 'coordinator.lodging.totalLabel',
};

// Puro y exportado: bajo la restricción de no simular DOM en node:test,
// esta es la única forma de probar la validación de verdad. Devuelve
// { ok, errors } con un motivo por campo ('required' | 'invalidDate' |
// 'order'), no un mensaje: el texto lo pone la pantalla desde i18n, para
// que esta función no dependa del idioma.
//
// hotel/checkIn/checkOut son obligatorios; reservationCode no: el hotel a
// veces se aparta antes de que exista el código, y obligarlo empujaría a
// la coordinadora a inventar uno.
//
// El orden importa: si una fecha ni siquiera se puede interpretar, el
// motivo es 'invalidDate' y NO se compara contra la otra — comparar NaN
// daría siempre falso y reportaría 'order', que manda a corregir el campo
// equivocado.
export function validateLodging(values) {
  const errors = {};
  const trimmed = (v) => (typeof v === 'string' ? v.trim() : '');

  for (const field of ['hotel', 'checkIn', 'checkOut']) {
    if (!trimmed(values?.[field])) errors[field] = 'required';
  }

  const parse = (field) => {
    if (errors[field]) return null; // ya está marcado como vacío
    const ms = instantMs(trimmed(values[field]));
    if (!Number.isFinite(ms)) {
      errors[field] = 'invalidDate';
      return null;
    }
    return ms;
  };

  const inMs = parse('checkIn');
  const outMs = parse('checkOut');

  // Igual (no solo anterior) también es error: una estancia de duración
  // cero no es un dato real, es un dedazo.
  if (inMs !== null && outMs !== null && outMs <= inMs) {
    errors.checkOut = 'order';
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

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
      <input type="text" name="${escapeHtml(name)}" value="${escapeHtml(value ?? '')}" class="nc-lodging-input" aria-describedby="nc-lodging-error-${escapeHtml(name)}" />
      <span class="nc-lodging-error" id="nc-lodging-error-${escapeHtml(name)}" data-role="lodging-error" data-field="${escapeHtml(name)}" hidden></span>
    </label>
  `;
}

// Etapa H — hermano de textField para las dos fechas. El value NO es el ISO
// guardado: un datetime-local con "2026-03-10T15:00-07:00" adentro no lo
// entiende y sale VACÍO, así que abrir la pestaña para corregir el nombre del
// hotel borraría las dos fechas sin avisar. toLocalInput lo baja a hora de
// pared y devuelve '' si el dato guardado no cuadra con Tijuana — un campo
// vacío se ve; una hora corrida siete horas, no.
function dateTimeField(name, value, label, ventana) {
  return `
    <label class="nc-lodging-field">
      <span class="nc-lodging-field-label">${escapeHtml(label)}</span>
      <input type="datetime-local" name="${escapeHtml(name)}" value="${escapeHtml(toLocalInput(value))}"${ventana} class="nc-lodging-input" aria-describedby="nc-lodging-error-${escapeHtml(name)}" />
      <span class="nc-lodging-error" id="nc-lodging-error-${escapeHtml(name)}" data-role="lodging-error" data-field="${escapeHtml(name)}" hidden></span>
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
  const { store, visitId, t, flash, errors, requestError } = ctx;
  const title = t('coordinator.lodging.title');
  const record = store.getVisit(visitId);

  // Guard: visita inexistente -> fallback corto, sin formulario, sin
  // lanzar (misma disciplina de defensa en profundidad que ya usa
  // src/ui/screens/stay.js para lodging ausente). Antes esto devolvía solo
  // el <h1>: una pantalla vacía sin explicación. Ahora dice lo mismo que
  // itinerary.js y qpass.js, desde la misma llave.
  if (!record) {
    return `
      <section class="nc-screen">
        <h1 class="nc-screen-title">${escapeHtml(title)}</h1>
        <p class="nc-empty-state">${escapeHtml(t('coordinator.visitNotFound'))}</p>
      </section>
    `;
  }

  const lodging = record.lodging;
  // Punto 6 — la estancia se acota a los días de la visita.
  const ventana = visitWindowAttrs(record.visit);

  return `
    <section class="nc-screen">
      <h1 class="nc-screen-title">${escapeHtml(title)}</h1>
      <form data-role="lodging-form" class="nc-lodging-form">
        ${renderCard(`
          ${textField('hotel', lodging?.hotel, t('coordinator.lodging.hotelLabel'))}
          ${textField('reservationCode', lodging?.reservationCode, t('coordinator.lodging.reservationCodeLabel'))}
          ${dateTimeField('checkIn', lodging?.checkIn, t('coordinator.lodging.checkInLabel'), ventana)}
          ${dateTimeField('checkOut', lodging?.checkOut, t('coordinator.lodging.checkOutLabel'), ventana)}
          ${textField('roomType', lodging?.roomType, t('coordinator.lodging.roomTypeLabel'))}
          ${textField('nights', lodging?.nights, t('coordinator.lodging.nightsLabel'))}
          ${textField('occupancy', lodging?.occupancy, t('coordinator.lodging.occupancyLabel'))}
          ${textField('total', lodging?.total, t('coordinator.lodging.totalLabel'))}
          ${checkboxField('breakfastIncluded', !!lodging?.breakfastIncluded, t('coordinator.lodging.breakfastLabel'))}
          ${checkboxField('recoveryRoom', !!lodging?.recoveryRoom, t('coordinator.lodging.recoveryLabel'))}
        `)}
        ${renderRequestError(requestError, t)}
        ${renderFormErrors(errors, t, CAMPOS_HOSPEDAJE)}
        ${flash === 'saved' ? `<p class="nc-lodging-saved" data-role="lodging-saved" role="status">${escapeHtml(t('coordinator.lodging.saved'))}</p>` : ''}
        <button type="submit" class="nc-button nc-button--primary nc-lodging-submit">${escapeHtml(t('coordinator.lodging.save'))}</button>
      </form>
    </section>
  `;
}

// ctx aquí además trae { onChange } (mismo contrato que el resto de
// attach*Screen interactivos de esta fase): se llama después de insertar
// el HTML en el DOM, nunca antes.
export function attachLodgingScreen(rootEl, ctx) {
  const { store, visitId, onChange, t } = ctx;
  const form = rootEl.querySelector('[data-role="lodging-form"]');
  if (!form) return;

  const errorEls = [...rootEl.querySelectorAll('[data-role="lodging-error"]')];

  // Solo los errores se manejan aquí, de forma imperativa, y a propósito:
  // el camino inválido NO repinta (repintar borraría lo que la persona
  // acaba de teclear, que es justo lo que hay que corregir). El camino
  // válido sí repinta, así que su confirmación no puede vivir en el DOM
  // — la pinta renderLodgingScreen desde ctx.flash.
  //
  // Como el camino inválido no repinta, la confirmación del guardado
  // ANTERIOR seguiría en pantalla junto al error nuevo ("Hospedaje
  // guardado." arriba de "Fecha no reconocida"), que es peor que no
  // decir nada. Se quita al empezar cada intento.
  function clearFeedback() {
    for (const el of errorEls) {
      el.textContent = '';
      el.hidden = true;
    }
    rootEl.querySelector('[data-role="lodging-saved"]')?.remove();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = form.elements;
    // El control da hora de pared ("2026-03-10T15:00"); lo que se valida y se
    // guarda es ISO con desplazamiento. Si toIsoTijuana no puede con lo que
    // llegó devuelve null y pasa el valor crudo: así validateLodging dice
    // 'invalidDate' (el problema real) en vez de 'required' (un campo que sí
    // se llenó). D75 — el control es comodidad, no autoridad.
    const fecha = (valor) => toIsoTijuana(valor) ?? valor;
    const values = {
      hotel: fields.hotel.value,
      reservationCode: fields.reservationCode.value,
      checkIn: fecha(fields.checkIn.value),
      checkOut: fecha(fields.checkOut.value),
      // Etapa L (D101) — los cuatro del Word van SIEMPRE, aunque esta
      // pantalla no los haya tocado: setLodging reescribe el registro
      // entero y omitirlos aquí los borraría en silencio.
      roomType: fields.roomType.value,
      nights: fields.nights.value,
      occupancy: fields.occupancy.value,
      total: fields.total.value,
      breakfastIncluded: fields.breakfastIncluded.checked,
      recoveryRoom: fields.recoveryRoom.checked,
    };

    clearFeedback();

    // No se guarda nada si algo falla. Antes se guardaba siempre, así que
    // un check-out mal escrito llegaba tal cual a la pantalla del paciente
    // (src/ui/screens/stay.js lo muestra sin validar) y ahí ya no había
    // quién lo notara.
    const { ok, errors } = validateLodging(values);
    if (!ok) {
      for (const el of errorEls) {
        const reason = errors[el.dataset.field];
        if (!reason) continue;
        el.textContent = t(`coordinator.lodging.error.${reason}`);
        el.hidden = false;
      }
      form.querySelector(`[name="${Object.keys(errors)[0]}"]`)?.focus();
      return;
    }

    // Etapa D — esto ahora va al servidor y puede fallar por cosas que la
    // validación de arriba no puede ver: sin conexión, sesión vencida, o la
    // visita borrada desde otra pantalla. El resultado se le entrega entero
    // al router, que decide entre confirmar y explicar.
    //
    // El await deja el botón vivo mientras tanto; se acepta a sabiendas: un
    // doble clic manda dos PUT y el segundo escribe lo mismo que el primero
    // (setLodging reemplaza, no acumula), así que el peor caso es una
    // escritura de más, no un hospedaje duplicado.
    store.setLodging(visitId, values).then((res) => {
      // 'saved' viaja al repintado (coordinatorApp.js lo pasa como
      // ctx.flash y lo consume en el siguiente render). Sin confirmación no
      // había ninguna señal de que el clic hubiera servido: el formulario es
      // el mismo para alta y edición, y se queda idéntico después de
      // guardar.
      onChange?.(res, 'saved');
    });
  });
}

export const LODGING_CSS = `
/* Copia propia, no importada: no hay garantía de orden de carga entre las
   pantallas hermanas de coordinator/ (mismo criterio ya escrito en el
   encabezado de itinerary.js). */
.nc-empty-state { font-size: 13px; opacity: 0.65; }
.nc-lodging-form { display: flex; flex-direction: column; gap: 14px; }
.nc-lodging-field { display: flex; flex-direction: column; gap: 4px; margin: 0 0 12px; }
.nc-lodging-field:last-child { margin-bottom: 0; }
.nc-lodging-field-label { font-size: 13px; opacity: 0.75; }
.nc-lodging-input { min-height: 44px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--nc-card-border); background: var(--nc-surface); color: var(--nc-ink); font: 400 15px Barlow, system-ui, sans-serif; }
.nc-lodging-field--checkbox { flex-direction: row; align-items: center; min-height: 44px; gap: 10px; cursor: pointer; }
.nc-lodging-checkbox { width: 22px; height: 22px; flex-shrink: 0; }
.nc-lodging-submit { align-self: flex-start; }
.nc-lodging-error { font-size: 12px; color: var(--nc-danger, #b3261e); }
.nc-lodging-saved { margin: 0; font-size: 13px; opacity: 0.85; }
/* Etapa J — mismo criterio que el alta: el tope es el ancho de lectura. */
@media (min-width: 700px) {
  .nc-lodging-form { max-width: 560px; }
}
`;
