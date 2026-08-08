// Etapa G — Traslados: alta, edición y cancelación de los traslados de una
// visita (aeropuerto ↔ hospital). ctx = { store, visitId, lang, t }, igual
// que sus hermanas del panel; store.getVisit(visitId) devuelve el
// expediente completo.
//
// Es una LISTA con formularios inline, calcada de itinerary.js, y no un
// formulario único como lodging.js: una visita tiene el traslado de llegada
// y el de regreso, a veces uno interno, y cada uno se corrige por su lado.
//
// Nada enumerable se teclea. `kind`, `meetingPointId` y el tipo de vehículo
// son <select> por la misma razón que D40 puso uno para la ubicación de las
// citas: un id mal escrito no revienta, simplemente deja de encontrar el
// punto de encuentro, y de eso se entera el paciente en el aeropuerto.
//
// Los nombres de campo del formulario son PLANOS (driverName, vehiclePlate)
// aunque el modelo sea anidado (driver.name, vehicle.plate): form.elements
// no sabe de objetos y un name con punto obliga a leerlo con corchetes.
// El objeto anidado que espera el servidor lo arma attachTransfersScreen.
//
// CSS namespaced .nc-coord-transfer-* : test/ui/coordinator/
// cssNamespace.test.js prohíbe que este directorio reuse las clases del
// paciente, y con razón — son dos documentos distintos y compartirlas deja
// una de las dos pantallas con el estilo viejo en silencio.

import { escapeHtml, classNames, transferPointName, transferPointOptionsHtml } from '../../util.js';
import { transferPoints, TRANSFER_KINDS, VEHICLE_TYPES } from '../../../data/transferPoints.js';
import { renderCard } from '../../components/card.js';
import { renderBadge } from '../../components/badge.js';
import { instantMs, toIsoTijuana, toLocalInput } from '../../../domain/time.js';
import { renderFormErrors, renderRequestError } from './formErrors.js';

// Los motivos que devuelve el servidor vienen con las llaves del MODELO
// (`driver.phone`), no con las del formulario (`driverPhone`): este mapa es
// el que las nombra en el resumen. Los errores por campo de arriba —los
// <span> junto a cada control— los pone la validación local y usan los
// nombres planos.
// (Sufijo _TRASLADO por la colisión de scope que documenta intake.js:
// build.py aplana todos los módulos de una entrada a un solo scope.)
const CAMPOS_TRASLADO = {
  kind: 'coordinator.transfers.kindLabel',
  scheduledAt: 'coordinator.transfers.scheduledAtLabel',
  meetingPointId: 'coordinator.transfers.meetingPointLabel',
  flightNumber: 'coordinator.transfers.flightNumberLabel',
  'driver.name': 'coordinator.transfers.driverNameLabel',
  'driver.phone': 'coordinator.transfers.driverPhoneLabel',
  'vehicle.type': 'coordinator.transfers.vehicleTypeLabel',
  'vehicle.plate': 'coordinator.transfers.plateLabel',
  notes: 'coordinator.transfers.notesLabel',
};

// Mismo criterio que telefonoValido en src/server/visitMutations.js, y a
// propósito la misma regla escrita dos veces: D45 prohíbe que el servidor
// importe código de UI, y al revés dejaría al navegador dependiendo de un
// módulo que solo existe en la Function. La prueba de que no se separan es
// que test/ui/coordinator/transfers.test.js manda los mismos valores por el
// loopback y exige el mismo motivo del servidor.
//
// El `+` no es opcional: la pantalla del paciente arma `wa.me/<dígitos>` con
// este número (D73).
function telefonoValido(raw) {
  if (!/^\+[\d\s-]+$/.test(raw)) return false;
  const digitos = raw.replace(/\D/g, '').length;
  return digitos >= 8 && digitos <= 15;
}

// Puro y exportado: sin DOM falso en node:test (D8), esta es la única forma
// de probar de verdad la validación del formulario. Devuelve { ok, errors }
// con un motivo por campo —los mismos códigos del servidor— y nunca un
// mensaje: el texto lo pone la pantalla desde i18n.
//
// Obligatorio: qué (kind), cuándo (scheduledAt) y dónde (meetingPointId).
// Nada más. El chofer y el vehículo se asignan la víspera y exigirlos para
// poder guardar la hora de recogida empujaría a inventarlos — mismo
// razonamiento que dejó `reservationCode` opcional en el hospedaje.
export function validateTransfer(values) {
  const errors = {};
  const trimmed = (v) => (typeof v === 'string' ? v.trim() : '');

  const kind = values?.kind;
  if (!kind) errors.kind = 'required';
  else if (!TRANSFER_KINDS.includes(kind)) errors.kind = 'unknown';

  const punto = values?.meetingPointId;
  if (!punto) errors.meetingPointId = 'required';
  else if (!transferPoints.some((p) => p.id === punto)) errors.meetingPointId = 'unknown';

  const cuando = trimmed(values?.scheduledAt);
  if (!cuando) errors.scheduledAt = 'required';
  else if (!Number.isFinite(instantMs(cuando))) errors.scheduledAt = 'invalidDate';
  // Sin zona horaria, el mismo texto escrito por una Function en UTC y leído
  // en Tijuana ya son dos horas distintas (PRD §7).
  else if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(cuando)) errors.scheduledAt = 'noOffset';

  const tel = trimmed(values?.driverPhone);
  if (tel && !telefonoValido(tel)) errors.driverPhone = 'invalid';

  const tipo = values?.vehicleType;
  if (tipo && !VEHICLE_TYPES.includes(tipo)) errors.vehicleType = 'unknown';

  return { ok: Object.keys(errors).length === 0, errors };
}

function campo(name, label, control) {
  return `
    <label class="nc-coord-transfer-field">
      <span class="nc-coord-transfer-field-label">${escapeHtml(label)}</span>
      ${control}
      <span class="nc-coord-transfer-error" data-role="transfer-error" data-field="${escapeHtml(name)}" hidden></span>
    </label>
  `;
}

function textoCampo(name, label, value = '', extra = '') {
  return campo(
    name,
    label,
    `<input type="text" name="${escapeHtml(name)}" value="${escapeHtml(value ?? '')}" class="nc-coord-transfer-input"${extra} />`,
  );
}

// Las opciones de un enum se traducen desde transfer.*, el MISMO bloque que
// lee la pantalla del paciente: duplicarlas en coordinator.* garantizaría
// que un día el panel y el teléfono llamen distinto a lo mismo.
function enumOpciones(valores, prefijo, t, selected) {
  return valores
    .map((v) => `<option value="${escapeHtml(v)}"${v === selected ? ' selected' : ''}>${escapeHtml(t(`${prefijo}.${v}`))}</option>`)
    .join('\n');
}

// Etapa H (D75/D76) — la hora de recogida deja de teclearse. El value NO es
// el ISO guardado: un datetime-local con "2026-03-12T15:00-07:00" adentro no
// lo entiende y sale VACÍO, así que abrir la edición para corregir las placas
// borraría la hora del traslado sin avisar.
//
// A diferencia de citas y hospedaje, aquí NO va min/max de la ventana de la
// visita: el traslado de regreso al aeropuerto es por definición posterior al
// último evento de la visita — es justo lo que motivó la Etapa G y D69. Un
// max="fin de la visita" haría imposible capturarlo.
function fechaHoraCampo(name, label, value) {
  return campo(
    name,
    label,
    `<input type="datetime-local" name="${escapeHtml(name)}" value="${escapeHtml(toLocalInput(value))}" class="nc-coord-transfer-input" />`,
  );
}

function selectCampo(name, label, opciones) {
  return campo(name, label, `<select name="${escapeHtml(name)}" class="nc-coord-transfer-input">${opciones}</select>`);
}

// Un mismo cuerpo para alta y edición: son los mismos catorce controles con
// otros valores. Dos copias divergirían al primer campo nuevo, y el campo
// que faltara en la de edición sería un dato que ya no se puede corregir.
function camposTraslado(lang, t, transfer = null) {
  const sinConfirmar = t('common.unconfirmedBadge');
  const v = transfer?.vehicle ?? {};
  const d = transfer?.driver ?? {};

  return `
    ${selectCampo('kind', t('coordinator.transfers.kindLabel'), enumOpciones(TRANSFER_KINDS, 'transfer.kind', t, transfer?.kind))}
    ${fechaHoraCampo('scheduledAt', t('coordinator.transfers.scheduledAtLabel'), transfer?.scheduledAt)}
    ${selectCampo('meetingPointId', t('coordinator.transfers.meetingPointLabel'), transferPointOptionsHtml(transferPoints, lang, transfer?.meetingPointId, sinConfirmar))}
    ${textoCampo('flightNumber', t('coordinator.transfers.flightNumberLabel'), transfer?.flightNumber)}
    <p class="nc-coord-transfer-hint">${escapeHtml(t('coordinator.transfers.driverOptionalHint'))}</p>
    ${textoCampo('driverName', t('coordinator.transfers.driverNameLabel'), d.name)}
    ${textoCampo('driverPhone', t('coordinator.transfers.driverPhoneLabel'), d.phone, ' placeholder="+52 664 123 4567"')}
    ${selectCampo('vehicleType', t('coordinator.transfers.vehicleTypeLabel'), `<option value=""></option>${enumOpciones(VEHICLE_TYPES, 'transfer.vehicleType', t, v.type)}`)}
    ${textoCampo('vehicleMake', t('coordinator.transfers.vehicleMakeLabel'), v.make)}
    ${textoCampo('vehicleModel', t('coordinator.transfers.vehicleModelLabel'), v.model)}
    ${textoCampo('vehicleColor', t('coordinator.transfers.vehicleColorLabel'), v.color)}
    ${textoCampo('vehiclePlate', t('coordinator.transfers.plateLabel'), v.plate)}
    ${campo('notes', t('coordinator.transfers.notesLabel'), `<textarea name="notes" rows="2" class="nc-coord-transfer-input">${escapeHtml(transfer?.notes ?? '')}</textarea>`)}
  `;
}

function renderTransferCard(transfer, lang, t) {
  const cancelled = transfer.status === 'cancelled';
  const chofer = transfer.driver?.name || '—';
  const vehiculo = [
    transfer.vehicle?.type ? t(`transfer.vehicleType.${transfer.vehicle.type}`) : '',
    transfer.vehicle?.make,
    transfer.vehicle?.model,
    transfer.vehicle?.color,
  ].filter(Boolean).join(' · ') || '—';

  // Editar y cancelar se omiten en uno ya cancelado, mismo criterio que las
  // citas: corregir el color del coche de un traslado que no va a salir no
  // es una acción con sentido, y "Cancelar" dos veces solo confunde.
  const acciones = cancelled
    ? ''
    : `
      <div class="nc-coord-transfer-actions">
        <button type="button" class="nc-button" data-role="edit-transfer" data-transfer-id="${escapeHtml(transfer.id)}">${escapeHtml(t('coordinator.transfers.edit'))}</button>
        <button type="button" class="nc-button" data-role="cancel-transfer" data-transfer-id="${escapeHtml(transfer.id)}">${escapeHtml(t('coordinator.transfers.cancel'))}</button>
      </div>
    `;

  return renderCard(
    `
      <p class="${classNames(['nc-coord-transfer-what', cancelled && 'nc-coord-transfer-what--cancelled'])}">${escapeHtml(t(`transfer.kind.${transfer.kind}`))}</p>
      <p class="nc-coord-transfer-row"><span>${escapeHtml(t('coordinator.transfers.scheduledAtLabel'))}</span> ${escapeHtml(transfer.scheduledAt)}</p>
      <p class="nc-coord-transfer-row"><span>${escapeHtml(t('coordinator.transfers.meetingPointLabel'))}</span> ${escapeHtml(transferPointName(transferPoints, transfer.meetingPointId, lang))}</p>
      ${transfer.flightNumber ? `<p class="nc-coord-transfer-row"><span>${escapeHtml(t('coordinator.transfers.flightNumberLabel'))}</span> ${escapeHtml(transfer.flightNumber)}</p>` : ''}
      <p class="nc-coord-transfer-row"><span>${escapeHtml(t('coordinator.transfers.driverNameLabel'))}</span> ${escapeHtml(chofer)}</p>
      ${transfer.driver?.phone ? `<p class="nc-coord-transfer-row"><span>${escapeHtml(t('coordinator.transfers.driverPhoneLabel'))}</span> ${escapeHtml(transfer.driver.phone)}</p>` : ''}
      <p class="nc-coord-transfer-row"><span>${escapeHtml(t('coordinator.transfers.vehicleTypeLabel'))}</span> ${escapeHtml(vehiculo)}</p>
      ${transfer.vehicle?.plate ? `<p class="nc-coord-transfer-row"><span>${escapeHtml(t('coordinator.transfers.plateLabel'))}</span> ${escapeHtml(transfer.vehicle.plate)}</p>` : ''}
      ${cancelled ? `<p class="nc-coord-transfer-status">${renderBadge(t('coordinator.transfers.cancelledBadge'), 'cancelled')}</p>` : ''}
      ${acciones}
      ${cancelled ? '' : `
      <form data-role="edit-transfer-form" data-transfer-id="${escapeHtml(transfer.id)}" class="nc-coord-transfer-form nc-coord-transfer-form--inline" hidden>
        ${camposTraslado(lang, t, transfer)}
        <button type="submit" class="nc-button nc-button--primary nc-coord-transfer-submit">${escapeHtml(t('coordinator.transfers.save'))}</button>
      </form>`}
    `,
    { extraClass: cancelled ? 'nc-card--muted' : '' },
  );
}

export function renderTransfersScreen(ctx) {
  const { store, visitId, lang, t, flash, errors, requestError } = ctx;
  const title = t('coordinator.transfers.title');
  const record = store.getVisit(visitId);

  // Guard: visita inexistente → alternativa corta, sin formulario y sin
  // lanzar. Misma llave y mismo trato que itinerary.js, lodging.js y
  // qpass.js.
  if (!record) {
    return `
      <section class="nc-screen">
        <h1 class="nc-screen-title">${escapeHtml(title)}</h1>
        <p class="nc-empty-state">${escapeHtml(t('coordinator.visitNotFound'))}</p>
      </section>
    `;
  }

  // `?? []`: los expedientes guardados antes de esta etapa no traen la
  // llave. Sin esto, abrir esta pestaña en una visita vieja reventaría.
  //
  // Copia nueva antes de ordenar — nunca se muta el arreglo de la store —
  // y por hora, no por orden de captura: la coordinadora casi siempre da de
  // alta el regreso después de la llegada, pero no siempre.
  const transfers = [...(record.transfers ?? [])].sort(
    (a, b) => instantMs(a.scheduledAt) - instantMs(b.scheduledAt),
  );

  const body = transfers.length === 0
    ? `<p class="nc-empty-state">${escapeHtml(t('coordinator.transfers.empty'))}</p>`
    : `<div class="nc-coord-transfer-list">${transfers.map((tr) => renderTransferCard(tr, lang, t)).join('\n')}</div>`;

  return `
    <section class="nc-screen">
      <h1 class="nc-screen-title">${escapeHtml(title)}</h1>
      ${body}
      ${renderRequestError(requestError, t)}
      ${renderFormErrors(errors, t, CAMPOS_TRASLADO)}
      ${flash === 'saved' ? `<p class="nc-coord-transfer-saved" data-role="transfer-saved" role="status">${escapeHtml(t('coordinator.transfers.saved'))}</p>` : ''}
      <form data-role="add-transfer-form" class="nc-coord-transfer-form">
        ${camposTraslado(lang, t)}
        <button type="submit" class="nc-button nc-button--primary nc-coord-transfer-submit">${escapeHtml(t('coordinator.transfers.addTransfer'))}</button>
      </form>
    </section>
  `;
}

// Del formulario plano al objeto anidado que espera el servidor. Es el único
// sitio donde se hace esa traducción, y por eso vive junto a los <label>
// que la producen y no dentro de la store.
function valoresDelFormulario(form) {
  const f = form.elements;
  return {
    kind: f.kind.value,
    // El control da hora de pared ("2026-03-12T15:00"); lo que se valida y se
    // guarda es ISO con desplazamiento, derivado de ESA fecha (D76). Si no se
    // puede interpretar pasa el valor crudo, para que el motivo del error sea
    // 'invalidDate' y no 'required' — y para que lo diga también el servidor,
    // que es la autoridad (D75).
    scheduledAt: toIsoTijuana(f.scheduledAt.value) ?? f.scheduledAt.value,
    meetingPointId: f.meetingPointId.value,
    flightNumber: f.flightNumber.value,
    driverName: f.driverName.value,
    driverPhone: f.driverPhone.value,
    vehicleType: f.vehicleType.value,
    vehicleMake: f.vehicleMake.value,
    vehicleModel: f.vehicleModel.value,
    vehicleColor: f.vehicleColor.value,
    vehiclePlate: f.vehiclePlate.value,
    notes: f.notes.value,
  };
}

function aModelo(v) {
  return {
    kind: v.kind,
    scheduledAt: v.scheduledAt,
    meetingPointId: v.meetingPointId,
    flightNumber: v.flightNumber,
    driver: { name: v.driverName, phone: v.driverPhone },
    vehicle: {
      type: v.vehicleType,
      make: v.vehicleMake,
      model: v.vehicleModel,
      color: v.vehicleColor,
      plate: v.vehiclePlate,
    },
    notes: v.notes,
  };
}

export function attachTransfersScreen(rootEl, ctx) {
  const { store, visitId, onChange, t } = ctx;

  // Los errores locales se pintan de forma imperativa, sin repintar: un
  // repintado borraría lo que la persona acaba de teclear, que es justo lo
  // que hay que corregir. Solo el camino válido repinta, y por eso su
  // confirmación la pinta el render desde ctx.flash y no este archivo.
  function limpiar(form) {
    form.querySelectorAll('[data-role="transfer-error"]').forEach((el) => {
      el.textContent = '';
      el.hidden = true;
    });
    rootEl.querySelector('[data-role="transfer-saved"]')?.remove();
  }

  function marcar(form, errors) {
    form.querySelectorAll('[data-role="transfer-error"]').forEach((el) => {
      const motivo = errors[el.dataset.field];
      if (!motivo) return;
      el.textContent = t(`coordinator.error.${motivo}`);
      el.hidden = false;
    });
    form.querySelector(`[name="${Object.keys(errors)[0]}"]`)?.focus();
  }

  const alta = rootEl.querySelector('[data-role="add-transfer-form"]');
  alta?.addEventListener('submit', (event) => {
    event.preventDefault();
    limpiar(alta);
    const values = valoresDelFormulario(alta);
    const { ok, errors } = validateTransfer(values);
    if (!ok) return marcar(alta, errors);
    store.addTransfer(visitId, aModelo(values)).then((res) => onChange?.(res, 'saved'));
  });

  // Mismo patrón que itinerary.js: el botón no captura nada, revela el
  // formulario inline de su propia tarjeta. Abrir uno cierra los demás para
  // que no queden dos ediciones a medias en pantalla; tras una mutación
  // exitosa el router repinta y todos vuelven a quedar ocultos solos.
  rootEl.querySelectorAll('[data-role="edit-transfer"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = rootEl.querySelector(`[data-role="edit-transfer-form"][data-transfer-id="${btn.dataset.transferId}"]`);
      if (!target) return;
      const estabaOculto = target.hidden;
      rootEl.querySelectorAll('.nc-coord-transfer-form--inline').forEach((f) => { f.hidden = true; });
      target.hidden = !estabaOculto;
      if (!target.hidden) target.querySelector('input, select')?.focus();
    });
  });

  rootEl.querySelectorAll('[data-role="edit-transfer-form"]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      limpiar(form);
      const values = valoresDelFormulario(form);
      const { ok, errors } = validateTransfer(values);
      if (!ok) return marcar(form, errors);
      store.editTransfer(visitId, form.dataset.transferId, aModelo(values)).then((res) => onChange?.(res, 'saved'));
    });
  });

  rootEl.querySelectorAll('[data-role="cancel-transfer"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.cancelTransfer(visitId, btn.dataset.transferId).then((res) => onChange?.(res, 'saved'));
    });
  });
}

export const TRANSFERS_CSS = `
/* Copia propia de las primitivas compartidas: no hay garantía de orden de
   carga entre las pantallas hermanas de coordinator/ (mismo criterio ya
   escrito en el encabezado de itinerary.js). */
.nc-screen-title { font-size: 20px; margin: 4px 0 16px; }
.nc-empty-state { font-size: 13px; opacity: 0.65; }
.nc-coord-transfer-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
.nc-coord-transfer-what { margin: 0 0 6px; font-size: 15px; font-weight: 600; }
.nc-coord-transfer-what--cancelled { text-decoration: line-through; opacity: 0.6; }
.nc-coord-transfer-row { display: flex; gap: 6px; margin: 0 0 4px; font-size: 13px; }
.nc-coord-transfer-row span { min-width: 130px; opacity: 0.7; }
.nc-coord-transfer-status { margin: 6px 0 0; }
.nc-coord-transfer-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.nc-coord-transfer-form { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
.nc-coord-transfer-field { display: flex; flex-direction: column; gap: 4px; }
.nc-coord-transfer-field-label { font-size: 13px; opacity: 0.75; }
.nc-coord-transfer-input { min-height: 44px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--nc-card-border); background: var(--nc-surface); color: var(--nc-ink); font: 400 15px Barlow, system-ui, sans-serif; box-sizing: border-box; }
textarea.nc-coord-transfer-input { min-height: 62px; resize: vertical; }
.nc-coord-transfer-hint { margin: 2px 0; font-size: 12px; opacity: 0.65; }
.nc-coord-transfer-error { font-size: 12px; color: var(--nc-danger, #b3261e); }
.nc-coord-transfer-saved { margin: 0; font-size: 13px; opacity: 0.85; }
.nc-coord-transfer-submit { align-self: flex-start; }
/* Los <select> necesitan su propia flecha: Safari y Firefox no pintan
   ninguna cuando se les quita la apariencia nativa, y sin esto el campo
   parece un input de texto deshabilitado. Misma regla que
   select.nc-coord-itin-input, repetida porque aquella está acotada a esa
   clase. */
select.nc-coord-transfer-input {
  appearance: none; -webkit-appearance: none; -moz-appearance: none;
  padding-right: 34px;
  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position: right 16px center, right 11px center;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
}
.nc-coord-transfer-form--inline { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--nc-card-border); }
.nc-coord-transfer-form--inline[hidden] { display: none; }
`;
