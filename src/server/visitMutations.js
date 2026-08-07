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
import { instantMs } from '../domain/time.js';

// Tope alto a propósito: no es una regla clínica, es un cinturón contra un
// dedazo (un "600" tecleado como "6000" pinta una cita de cuatro días) y
// contra un payload absurdo. 12 horas cubre cualquier estudio real.
export const MAX_DURATION_MIN = 720;
export const MAX_SERVICE_NAME = 120;

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

  return { ok: Object.keys(errors).length === 0, errors };
}

function buscarCita(record, appointmentId) {
  return record.appointments.find((a) => a.id === appointmentId) ?? null;
}

export function addAppointment(record, input, { now, by, newId }) {
  const { ok, errors } = validateAppointmentInput(input);
  if (!ok) return { ok: false, errors };

  // Se construye campo por campo en vez de esparcir `input`: un POST puede
  // traer lo que quiera, y esparcirlo dejaría fijar `status: 'done'`,
  // `createdBy: 'alguien más'` o un `id` a modo desde afuera.
  const appointment = {
    id: newId('a'),
    visitId: record.visit.id,
    startsAt: trimmed(input.startsAt),
    durationMin: input.durationMin,
    serviceName: trimmed(input.serviceName),
    locationId: input.locationId,
    status: 'scheduled',
    createdAt: now,
    createdBy: by,
    updatedAt: now,
    updatedBy: by,
  };

  record.appointments.push(appointment);
  return { ok: true, appointment };
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
  });
  if (!ok) return { ok: false, errors };

  appointment.serviceName = trimmed(input.serviceName);
  appointment.durationMin = input.durationMin;
  appointment.locationId = input.locationId;
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
