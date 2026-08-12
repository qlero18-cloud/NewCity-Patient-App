// Etapa D — las mutaciones del expediente, del lado del servidor.
//
// Hasta la fase 09 esto vivía en src/ui/coordinatorStore.js, en memoria del
// navegador, y `addAppointment`/`editAppointment` no validaban NADA: lo que
// escribiera el formulario entraba al registro tal cual. Mientras todo se
// borraba al recargar era un detalle; ahora lo que entre se guarda y lo lee
// el paciente en su teléfono, así que la validación se muda aquí.
//
// Puro y sin plataforma, como todo src/server/ (D45): estas funciones MUTAN
// el registro que reciben y no saben de dónde salió ni quién lo va a
// guardar. Quien llama lee, muta y escribe (coordinatorHandler.js).
//
// Cada una recibe un contexto `{ now, by, newId }`:
//   now   — ISO 8601 con desplazamiento, la misma representación que usan
//           los registros de visita (createdAt/updatedAt). Auth usa epoch
//           en milisegundos; aquí NO, y no es descuido: estas fechas se
//           guardan y se comparan contra las citas, que son ISO.
//   by    — el usuario de quien hizo el cambio, que viene de
//           requireCoordinator(). Es lo que compran las cuentas
//           individuales de la Etapa C: sin esto, tener cuentas separadas
//           no sirve de nada.
//   newId — inyectado para que las pruebas fijen ids sin espiar el módulo.
//
// Convenio de retorno, igual en todas:
//   { ok: true }                    hecho
//   { ok: false, errors: {...} }    datos inválidos  -> 422
//   { ok: false, notFound: true }   no existe        -> 404
// Se separa "inválido" de "no existe" porque son dos códigos HTTP distintos
// y quien llama no debería adivinar cuál a partir de un null.

import { LOCATION_IDS } from '../data/locations.js';
import { TRANSFER_POINT_IDS, TRANSFER_KINDS, VEHICLE_TYPES } from '../data/transferPoints.js';
import { instantMs } from '../domain/time.js';

// Tope alto a propósito: no es una regla clínica, es un cinturón contra un
// dedazo (un "600" tecleado como "6000" pinta una cita de cuatro días) y
// contra un payload absurdo. 12 horas cubre cualquier estudio real.
export const MAX_DURATION_MIN = 720;
export const MAX_SERVICE_NAME = 120;
export const MAX_DRIVER_NAME = 120;
export const MAX_PLATE = 20;
export const MAX_TRANSFER_NOTES = 280;

// Etapa I (D82) — los tres campos que el documento de la coordinadora ya
// trae y que hasta ahora se perdían al capturar. Cada uno con su tope, no
// uno compartido: la lista de sub-estudios del laboratorio pasa de 200
// caracteres y MAX_SERVICE_NAME son 120, así que con un solo número o se
// parte la lista o se afloja el nombre del estudio.
export const MAX_PREP = 280;
export const MAX_DOCTOR = 120;
export const MAX_DETAILS = 600;

// El itinerario real más grande de los cinco medidos trae 19 citas. Como
// MAX_DURATION_MIN, esto no es una regla clínica: es un cinturón contra un
// cuerpo que nadie tecleó. 60 deja tres veces de margen.
export const MAX_IMPORT_APPOINTMENTS = 60;

// Formatos que sabe pintar src/ui/screens/pass.js. Coordinación solo emite
// 'image' (D29), pero las fixtures traen los otros dos y el registro los
// admite, así que el validador no los puede prohibir.
const PASS_FORMATS = ['qr', 'code128', 'image'];

// Copia deliberada de SCOPES en src/ui/screens/coordinator/qpass.js:29. El
// servidor no importa código de UI: la pantalla es una comodidad, no la
// autoridad, y una Function que dependiera de un archivo de interfaz
// arrastraría el DOM a un runtime que no lo tiene.
const PASS_SCOPES = ['torre', 'piso27', 'estacionamiento'];

function trimmed(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function esObjeto(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Fecha ISO con desplazamiento explícito, en dos pasos y en este orden:
// primero "¿es una fecha?" y luego "¿trae zona?". Al revés, "mañana" sale
// reportado como noOffset y manda a arreglar algo que no es el problema
// (mismo criterio que validateVisitInput y validateLodging).
function checkFecha(raw) {
  if (!raw) return 'required';
  if (!Number.isFinite(instantMs(raw))) return 'invalidDate';
  // PRD §7: sin zona, el mismo string escrito por una Function en UTC y
  // leído en Tijuana ya son dos horas distintas.
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)) return 'noOffset';
  return null;
}

// Reporta TODOS los campos malos de una vez. Corregir de uno en uno, con un
// viaje al servidor por campo, es lo que hace que la gente abandone un
// formulario a medias.
export function validateAppointmentInput(input) {
  if (!esObjeto(input)) return { ok: false, errors: { input: 'invalid' } };

  const errors = {};

  const fecha = checkFecha(trimmed(input.startsAt));
  if (fecha) errors.startsAt = fecha;

  const nombre = trimmed(input.serviceName);
  if (!nombre) errors.serviceName = 'required';
  else if (nombre.length > MAX_SERVICE_NAME) errors.serviceName = 'tooLong';

  const d = input.durationMin;
  if (d === null || d === undefined || d === '') errors.durationMin = 'required';
  else if (!Number.isInteger(d) || d <= 0) errors.durationMin = 'invalid';
  else if (d > MAX_DURATION_MIN) errors.durationMin = 'tooLong';

  // El corazón de esta etapa. El <select> de la Etapa A quitó los typos de
  // la pantalla, pero la pantalla no es la autoridad: quien manda el POST
  // no tiene por qué haber pasado por ella. Un `locationId` que no está en
  // el catálogo es una cita que el mapa no puede dibujar y una ruta que no
  // existe — el paciente ve "no encontramos cómo llegar" y no hay nada que
  // pueda hacer al respecto.
  //
  // 'required' es solo para lo que falta; cualquier otra cosa presente es
  // 'unknown', incluido un número o un id con un espacio pegado. NO se
  // recorta: un id es un valor de máquina que sale de un <select>, no texto
  // tecleado, y un "compass " con espacio significa que algo upstream está
  // roto. Aceptarlo en silencio esconde ese bug hasta que aparezca en otro
  // lado más difícil de rastrear.
  const loc = input.locationId;
  if (loc === undefined || loc === null || loc === '') errors.locationId = 'required';
  else if (!LOCATION_IDS.includes(loc)) errors.locationId = 'unknown';

  // Los tres de la Etapa I son OPCIONALES: el formulario de captura a mano
  // no los manda y tiene que seguir sirviendo igual. Solo se acota el largo,
  // sobre el texto ya recortado.
  for (const [campo, tope] of [['prep', MAX_PREP], ['doctor', MAX_DOCTOR], ['details', MAX_DETAILS]]) {
    if (trimmed(input[campo]).length > tope) errors[campo] = 'tooLong';
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

function buscarCita(record, appointmentId) {
  return record.appointments.find((a) => a.id === appointmentId) ?? null;
}

// Se construye campo por campo en vez de esparcir `input`: un POST puede
// traer lo que quiera, y esparcirlo dejaría fijar `status: 'done'`,
// `createdBy: 'alguien más'` o un `id` a modo desde afuera.
//
// Una sola función para la captura a mano y para la importación: si cada
// camino armara su propia cita, un campo agregado en uno y olvidado en el
// otro daría expedientes con dos formas distintas según por dónde entraron.
function nuevaCita(record, input, { now, by, newId }) {
  return {
    id: newId('a'),
    visitId: record.visit.id,
    startsAt: trimmed(input.startsAt),
    durationMin: input.durationMin,
    serviceName: trimmed(input.serviceName),
    locationId: input.locationId,
    status: 'scheduled',
    prep: trimmed(input.prep),
    doctor: trimmed(input.doctor),
    details: trimmed(input.details),
    createdAt: now,
    createdBy: by,
    updatedAt: now,
    updatedBy: by,
  };
}

export function addAppointment(record, input, ctx) {
  const { ok, errors } = validateAppointmentInput(input);
  if (!ok) return { ok: false, errors };

  const appointment = nuevaCita(record, input, ctx);
  record.appointments.push(appointment);
  return { ok: true, appointment };
}

// Etapa I (D83) — importar un itinerario completo en UNA escritura.
//
// No es una comodidad: `saveVisit` sobrescribe el expediente entero sin
// compare-and-set, así que N ciclos leer-modificar-escribir multiplican por N
// la ventana en la que dos coordinadoras se pisan los cambios.
//
// Y es TODO O NADA. Una importación a medias es peor que ninguna, porque la
// coordinadora no puede distinguirla de una completa: ve citas en el
// expediente, da por terminado el trabajo, y al paciente le faltan seis.
// Por eso se valida la lista entera ANTES de tocar el registro.
export function addAppointments(record, inputs, ctx) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    return { ok: false, errors: { appointments: 'required' } };
  }
  if (inputs.length > MAX_IMPORT_APPOINTMENTS) {
    return { ok: false, errors: { appointments: 'tooLong' } };
  }

  // Se reportan TODAS las filas malas de una vez y con su índice, para que
  // la pantalla de revisión pueda señalar cuáles. Devolver solo la primera
  // obliga a un viaje al servidor por fila, que con 19 citas es como se
  // abandona una importación a la mitad.
  const fallas = [];
  inputs.forEach((input, index) => {
    const { ok, errors } = validateAppointmentInput(input);
    if (!ok) fallas.push({ index, errors });
  });
  if (fallas.length > 0) return { ok: false, errors: { appointments: fallas } };

  const appointments = inputs.map((input) => nuevaCita(record, input, ctx));
  record.appointments.push(...appointments);
  return { ok: true, appointments };
}

export function moveAppointment(record, appointmentId, startsAt, { now, by }) {
  const appointment = buscarCita(record, appointmentId);
  if (!appointment) return { ok: false, notFound: true };

  const motivo = checkFecha(trimmed(startsAt));
  if (motivo) return { ok: false, errors: { startsAt: motivo } };

  appointment.startsAt = trimmed(startsAt);
  appointment.status = 'moved';
  appointment.updatedAt = now;
  appointment.updatedBy = by;
  return { ok: true, appointment };
}

// Solo los tres campos de contenido. NO toca startsAt (para eso está mover)
// ni status: el enum del PRD §7 no tiene un valor para "editada" y no le
// hace falta — al paciente le importa si la cita se movió o se canceló, no
// si le corrigieron una falta de ortografía al nombre del estudio.
export function editAppointment(record, appointmentId, input, { now, by }) {
  const appointment = buscarCita(record, appointmentId);
  if (!appointment) return { ok: false, notFound: true };

  // Se valida contra la cita completa —con su startsAt actual— para no
  // pedirle a quien edita que reenvíe una hora que no está cambiando.
  const { ok, errors } = validateAppointmentInput({
    startsAt: appointment.startsAt,
    serviceName: input?.serviceName,
    durationMin: input?.durationMin,
    locationId: input?.locationId,
    prep: input?.prep,
    doctor: input?.doctor,
    details: input?.details,
  });
  if (!ok) return { ok: false, errors };

  appointment.serviceName = trimmed(input.serviceName);
  appointment.durationMin = input.durationMin;
  appointment.locationId = input.locationId;

  // Etapa I: AUSENTE es "no lo toques"; PRESENTE, aunque venga vacío, sí
  // manda. El formulario de edición que ya existe manda tres campos y nada
  // más — si "ausente" significara "vacío", corregirle el nombre a una cita
  // importada le borraría el ayuno, y nadie relacionaría una cosa con la
  // otra. Con esta regla, una preparación equivocada sigue pudiéndose quitar
  // mandando la cadena vacía a propósito.
  for (const campo of ['prep', 'doctor', 'details']) {
    if (input?.[campo] !== undefined) appointment[campo] = trimmed(input[campo]);
  }

  appointment.updatedAt = now;
  appointment.updatedBy = by;
  return { ok: true, appointment };
}

// Cancelar marca, no borra: el paciente tiene que poder ver que su cita se
// canceló. Una cita que desaparece del itinerario se lee como un error de
// la app, y alguien se presenta igual.
export function cancelAppointment(record, appointmentId, { now, by }) {
  const appointment = buscarCita(record, appointmentId);
  if (!appointment) return { ok: false, notFound: true };

  appointment.status = 'cancelled';
  appointment.updatedAt = now;
  appointment.updatedBy = by;
  return { ok: true, appointment };
}

// `hotel` es texto libre y no un id del catálogo: stay.js lo pinta como
// nombre y el hospedaje no es destino de ninguna ruta. La restricción de
// catálogo es de las citas, que sí se dibujan en el mapa.
export function validateLodgingInput(input) {
  if (!esObjeto(input)) return { ok: false, errors: { input: 'invalid' } };

  const errors = {};
  // reservationCode NO es obligatorio: el hotel a veces se aparta antes de
  // que exista el código, y exigirlo empuja a inventar uno (Etapa A).
  if (!trimmed(input.hotel)) errors.hotel = 'required';

  const entrada = checkFecha(trimmed(input.checkIn));
  if (entrada) errors.checkIn = entrada;
  const salida = checkFecha(trimmed(input.checkOut));
  if (salida) errors.checkOut = salida;

  // Solo si las dos se pudieron interpretar: comparar contra NaN daría
  // siempre falso y reportaría 'order' sobre una fecha que ni siquiera es
  // fecha. Igual (no solo anterior) también es error — una estancia de
  // duración cero no es un dato, es un dedazo.
  if (!entrada && !salida && instantMs(trimmed(input.checkOut)) <= instantMs(trimmed(input.checkIn))) {
    errors.checkOut = 'order';
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

export function setLodging(record, input, { now, by }) {
  const { ok, errors } = validateLodgingInput(input);
  if (!ok) return { ok: false, errors };

  record.lodging = {
    visitId: record.visit.id,
    hotel: trimmed(input.hotel),
    reservationCode: trimmed(input.reservationCode),
    checkIn: trimmed(input.checkIn),
    checkOut: trimmed(input.checkOut),
    // Los checkbox llegan como 'on', ausentes o lo que mande quien
    // construya el POST: se normalizan a booleano aquí, no se guarda lo que
    // haya llegado. stay.js los pinta con un sí/no y una cadena vacía se
    // vería como "no" mientras el registro dice ''.
    breakfastIncluded: !!input.breakfastIncluded,
    recoveryRoom: !!input.recoveryRoom,
    updatedAt: now,
    updatedBy: by,
  };
  return { ok: true, lodging: record.lodging };
}

export function issueQpass(record, input, { now, by, newId }) {
  if (!esObjeto(input)) return { ok: false, errors: { input: 'invalid' } };

  const errors = {};
  if (!PASS_FORMATS.includes(input.format)) errors.format = 'unsupported';
  if (!PASS_SCOPES.includes(input.scope)) errors.scope = 'unsupported';
  if (!trimmed(input.payload)) errors.payload = 'required';
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const qpass = {
    id: newId('q'),
    visitId: record.visit.id,
    appointmentId: null,
    format: input.format,
    payload: trimmed(input.payload),
    scope: input.scope,
    validFrom: now,
    validUntil: null, // D15: el pase no caduca por tiempo, se revoca
    revokedAt: null,
    revokedBy: null,
    issuedAt: now,
    issuedBy: by,
  };

  record.passes.push(qpass);
  return { ok: true, qpass };
}

// ---------------------------------------------------------------------
// Etapa G — traslados (aeropuerto ↔ hospital).
// ---------------------------------------------------------------------

// E.164 con clave de país. Se permiten espacios y guiones porque la gente
// los escribe así, pero el `+` NO es opcional: src/ui/screens/transfer.js
// pinta este número como `tel:` y como `wa.me/<dígitos>`, y un "664 123
// 4567" sin clave manda el WhatsApp a un número de otro país. El paciente
// se enteraría parado en la banqueta del aeropuerto (D73).
function telefonoValido(raw) {
  if (!/^\+[\d\s-]+$/.test(raw)) return false;
  const digitos = raw.replace(/\D/g, '').length;
  return digitos >= 8 && digitos <= 15;
}

// `driver` y `vehicle` son OPCIONALES a propósito: la coordinadora aparta
// el traslado días antes y al chofer se lo asignan la víspera. Exigir el
// nombre del chofer para poder guardar la hora de recogida empuja a
// inventar uno — mismo razonamiento que dejó `reservationCode` opcional en
// el hospedaje. Lo obligatorio es qué, cuándo y dónde.
function validarSubobjeto(valor, campo, errors, reglas) {
  if (valor === undefined || valor === null) return;
  if (!esObjeto(valor)) {
    errors[campo] = 'invalid';
    return;
  }
  for (const regla of reglas) regla(valor, errors);
}

export function validateTransferInput(input) {
  if (!esObjeto(input)) return { ok: false, errors: { input: 'invalid' } };

  const errors = {};

  const fecha = checkFecha(trimmed(input.scheduledAt));
  if (fecha) errors.scheduledAt = fecha;

  // kind y meetingPointId salen de un <select>: no se recortan, por lo
  // mismo que locationId en las citas. Un id con un espacio pegado
  // significa que algo upstream está roto y tragárselo esconde el bug.
  const kind = input.kind;
  if (kind === undefined || kind === null || kind === '') errors.kind = 'required';
  else if (!TRANSFER_KINDS.includes(kind)) errors.kind = 'unknown';

  const punto = input.meetingPointId;
  if (punto === undefined || punto === null || punto === '') errors.meetingPointId = 'required';
  else if (!TRANSFER_POINT_IDS.includes(punto)) errors.meetingPointId = 'unknown';

  validarSubobjeto(input.driver, 'driver', errors, [
    (d, e) => {
      const nombre = trimmed(d.name);
      if (nombre.length > MAX_DRIVER_NAME) e['driver.name'] = 'tooLong';
    },
    (d, e) => {
      const tel = trimmed(d.phone);
      if (tel && !telefonoValido(tel)) e['driver.phone'] = 'invalid';
    },
  ]);

  validarSubobjeto(input.vehicle, 'vehicle', errors, [
    (v, e) => {
      const tipo = v.type;
      if (tipo !== undefined && tipo !== null && tipo !== '' && !VEHICLE_TYPES.includes(tipo)) {
        e['vehicle.type'] = 'unknown';
      }
    },
    (v, e) => {
      if (trimmed(v.plate).length > MAX_PLATE) e['vehicle.plate'] = 'tooLong';
    },
  ]);

  if (trimmed(input.notes).length > MAX_TRANSFER_NOTES) errors.notes = 'tooLong';

  return { ok: Object.keys(errors).length === 0, errors };
}

// Los campos del traslado que vienen del formulario, ya normalizados. Se
// arma campo por campo y nunca esparciendo `input`, igual que las citas: un
// POST puede traer `status: 'cancelled'`, `createdBy: 'alguien más'` o un
// `id` a modo, y esparcirlo los dejaría entrar.
function camposTraslado(input) {
  const driver = esObjeto(input.driver) ? input.driver : {};
  const vehicle = esObjeto(input.vehicle) ? input.vehicle : {};
  return {
    kind: input.kind,
    scheduledAt: trimmed(input.scheduledAt),
    meetingPointId: input.meetingPointId,
    // Vuelo y placas en mayúsculas porque así se leen en la pantalla del
    // aeropuerto y en la defensa del coche; guardarlos como se tecleen
    // dejaría "am654" al lado de "AM 654" para el mismo vuelo.
    flightNumber: trimmed(input.flightNumber).toUpperCase(),
    driver: { name: trimmed(driver.name), phone: trimmed(driver.phone) },
    vehicle: {
      type: trimmed(vehicle.type),
      make: trimmed(vehicle.make),
      model: trimmed(vehicle.model),
      color: trimmed(vehicle.color),
      plate: trimmed(vehicle.plate).toUpperCase(),
    },
    notes: trimmed(input.notes),
  };
}

// Los expedientes guardados antes de esta etapa no traen la llave: se lee
// con `?? []` en todas partes y solo se crea al agregar el primero. Así,
// desplegar la Etapa G no reescribe ni un registro de Blobs.
function buscarTraslado(record, transferId) {
  return (record.transfers ?? []).find((t) => t.id === transferId) ?? null;
}

export function addTransfer(record, input, { now, by, newId }) {
  const { ok, errors } = validateTransferInput(input);
  if (!ok) return { ok: false, errors };

  const transfer = {
    id: newId('t'),
    visitId: record.visit.id,
    ...camposTraslado(input),
    status: 'scheduled',
    createdAt: now,
    createdBy: by,
    updatedAt: now,
    updatedBy: by,
  };

  if (!record.transfers) record.transfers = [];
  record.transfers.push(transfer);
  return { ok: true, transfer };
}

export function editTransfer(record, transferId, input, { now, by }) {
  const transfer = buscarTraslado(record, transferId);
  if (!transfer) return { ok: false, notFound: true };

  const { ok, errors } = validateTransferInput(input);
  if (!ok) return { ok: false, errors };

  Object.assign(transfer, camposTraslado(input), { updatedAt: now, updatedBy: by });
  return { ok: true, transfer };
}

// Cancelar marca, no borra — mismo criterio que cancelAppointment. Un
// traslado que desaparece del itinerario se lee como un error de la app, y
// el paciente se planta a esperar un coche que ya no va a llegar.
export function cancelTransfer(record, transferId, { now, by }) {
  const transfer = buscarTraslado(record, transferId);
  if (!transfer) return { ok: false, notFound: true };

  transfer.status = 'cancelled';
  transfer.updatedAt = now;
  transfer.updatedBy = by;
  return { ok: true, transfer };
}

// Revocar tampoco borra: un pase emitido es historia de la visita, y quién
// lo revocó y cuándo es justo lo que se querría saber después.
export function revokeQpass(record, passId, { now, by }) {
  const qpass = record.passes.find((p) => p.id === passId) ?? null;
  if (!qpass) return { ok: false, notFound: true };

  // La primera revocación es la que vale: volver a revocar no corre la
  // hora. Si dos coordinadoras revocan el mismo pase, la que importa es la
  // primera —el momento en que dejó de servir— no la última en hacer clic.
  if (qpass.revokedAt) return { ok: true, qpass };

  qpass.revokedAt = now;
  qpass.revokedBy = by;
  return { ok: true, qpass };
}
