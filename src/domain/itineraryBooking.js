// Etapa L — De las tablas de hospedaje y transporte del Word a una reserva
// PROPUESTA.
//
// itineraryParse.js reparte las tablas del documento (D100) y le entrega a
// este módulo las dos que no son itinerario. Aquí se emparejan etiquetas con
// campos y NADA MÁS: no se guarda, no se valida contra el servidor y no se
// decide. Lo que sale es una propuesta que la coordinadora corrige antes de
// que exista un expediente (D84).
//
// Lo que este módulo NO hace, que es donde está el daño:
//
//   - No lee el reloj (INV-1). El año sale del encabezado del propio
//     archivo; si no viene, las fechas quedan VACÍAS y marcadas. Una fecha
//     rellenada con el año de hoy se ve igual de válida que una correcta.
//   - No adivina el punto de encuentro. Si el texto no coincide con el
//     catálogo, devuelve vacío y lo marca. Mandar texto libre al servidor es
//     justo lo que D40 y D70 existen para impedir.
//   - No convierte el total a número. "$1,234.00 MXN" se guarda verbatim
//     (D101): pasarlo a 1234 pierde la moneda, y un precio sin moneda al
//     lado de un paciente que paga en dólares es peor que no tener precio.
//   - No guarda al huésped. `Guest` solo sirve para contrastarlo con el
//     paciente en la pantalla de revisión (D102); la visita sigue guardando
//     únicamente el nombre de pila (D61).
//
// Todo lo supuesto sale MARCADO en `notes`, con el antes y el después. Aquí
// se suponen tres cosas —la hora del check-in, la lada del chofer y la
// separación marca/modelo (D106)— y las tres tienen que poder leerse en
// pantalla. El transporte además mete al expediente el nombre, el teléfono y
// las placas de un TERCERO: si eso entra en silencio, nadie lo desmiente.
//
// Los nombres top-level van con prefijo BKG_/bkg porque build.py aplana
// todos los módulos de un entry a un solo scope.

import { toIsoTijuana } from './time.js';

// Los meses se repiten aquí en vez de importarse de itineraryParse.js a
// propósito: ese módulo importa a este para repartir las tablas, y un ciclo
// entre los dos rompería el empaquetado plano. La prueba recorre los doce.
const BKG_MONTHS = 'JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER';
const BKG_MONTH_INDEX = new Map(BKG_MONTHS.split('|').map((m, i) => [m, i]));

// "July 27th", "December 31", "August 8th 9:00AM". El día ordinal es
// opcional porque el documento lo escribe de las dos formas.
const BKG_DATE_RE = new RegExp(`\\b(${BKG_MONTHS})\\.?\\s+(\\d{1,2})(?:ST|ND|RD|TH)?\\b`, 'i');

// La hora tal como la escriben. El sufijo AM/PM es obligatorio, igual que en
// el itinerario: un "17:00" suelto no aparece nunca en estos archivos y
// adivinar el formato de una hora es adivinar a qué hora pasan por alguien.
const BKG_TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*\.?\s*([AP])\.?\s*M\.?/i;

// Una casilla de plantilla sin llenar: "[Yes / No]", "[Single / Double]".
// Vale para CUALQUIER campo, no solo para los dos que la traen hoy (D103).
const BKG_TEMPLATE_RE = /^\[[^\]]*\/[^\]]*\]$/;

const BKG_YES = new Set(['YES', 'SI', 'TRUE', 'X', 'INCLUDED', 'INCLUIDO', 'INCLUIDA']);
const BKG_NO = new Set(['NO', 'FALSE', 'NONE', 'N A', 'NA', 'NINGUNO', 'NINGUNA', '-']);

// Convención universal del hotel, no un dato del documento: por eso van
// marcadas como supuestas. Las horas del traslado NO se suponen — ver abajo.
const BKG_DEFAULT_CHECK_IN_MIN = 15 * 60;
const BKG_DEFAULT_CHECK_OUT_MIN = 12 * 60;

// Topes del servidor (src/server/visitMutations.js). Aquí no se recorta
// nada: se marca y la coordinadora edita. Recortar en silencio dejaría el
// total del hotel a la mitad de una cifra.
const BKG_MAX = {
  hotel: 120, reservationCode: 40, roomType: 120, occupancy: 120, total: 40,
  driverName: 120, plate: 20, notes: 280,
};

// Marca comercial → carrocería del enum. Es un vocabulario de LECTURA, no el
// enum: VEHICLE_TYPES vive en src/data/ y un módulo de dominio no lo importa
// (misma razón por la que `locations` se inyecta). La prueba verifica que
// todo lo que sale de aquí siga siendo un valor válido del enum.
const BKG_VEHICLE_WORDS = new Map([
  ['SEDAN', 'sedan'], ['SUV', 'suv'], ['VAN', 'van'], ['MINIVAN', 'van'],
  ['AMBULANCE', 'ambulance'], ['AMBULANCIA', 'ambulance'],
]);

// Códigos que son puro aviso y no piden nada de la coordinadora. Todo lo
// demás cuenta como "necesita tu atención".
export const BKG_INFO_CODES = new Set(['roundTrip']);

// --- Texto -------------------------------------------------------------

function bkgText(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

// La etiqueta como la escribió la coordinadora, sin los dos puntos que unas
// filas traen y otras no. Es lo que se le enseña en pantalla.
function bkgLabel(raw) {
  return bkgText(raw).replace(/\s*:\s*$/, '');
}

// La etiqueta reducida a lo que se puede comparar: "Flight (optional)" y
// "Check- in" tienen que caer en el mismo campo que "Flight" y "Check-in".
function bkgKey(label) {
  return label.toUpperCase().replace(/\([^)]*\)/g, ' ').replace(/[^A-Z0-9]+/g, ' ').trim();
}

// Sin acentos ni puntuación, para comparar nombres escritos por personas
// distintas: "Paciente Inventada" contra "PACIENTE  INVENTADA".
function bkgFold(raw) {
  return bkgText(raw).normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function bkgNote(notes, code, extra) {
  notes.push(extra === undefined ? { code } : { code, ...extra });
}

// --- Fechas ------------------------------------------------------------

function bkgParseMinutes(texto) {
  const m = BKG_TIME_RE.exec(texto);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? '0');
  if (h < 1 || h > 12 || min > 59) return null;
  const base = h === 12 ? 0 : h * 60;
  return base + min + (/^P$/i.test(m[3]) ? 720 : 0);
}

// → { monthIndex, day, minutes|null } o null si no hay fecha legible.
function bkgParseDate(texto) {
  const m = BKG_DATE_RE.exec(texto);
  if (!m) return null;
  const day = Number(m[2]);
  if (day < 1 || day > 31) return null;
  return {
    monthIndex: BKG_MONTH_INDEX.get(m[1].toUpperCase()),
    day,
    minutes: bkgParseMinutes(texto.slice(m.index + m[0].length)),
  };
}

function bkgDayKey(year, monthIndex, day) {
  return `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function bkgIso(year, monthIndex, day, minutes) {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return toIsoTijuana(`${bkgDayKey(year, monthIndex, day)}T${hh}:${mm}`);
}

// --- Lectura de una tabla de etiqueta y valor --------------------------

// Cada fila del Word es `["Etiqueta", "valor"]`. Se devuelve un mapa de
// clave normalizada a { label, value } y se marca lo que no se reconoce: una
// fila que el documento sí traía y aquí se tira en silencio es un dato que
// nadie va a echar de menos hasta que haga falta.
function bkgReadRows(rows, conocidas, notes) {
  const campos = new Map();
  for (const bruto of Array.isArray(rows) ? rows : []) {
    const celdas = (Array.isArray(bruto) ? bruto : []).map(bkgText);
    const label = bkgLabel(celdas[0]);
    if (label === '') continue;

    const clave = conocidas.get(bkgKey(label));
    if (clave === undefined) {
      bkgNote(notes, 'unknownLabel', { text: label });
      continue;
    }

    let value = celdas.slice(1).filter((c) => c !== '').join(' ');
    if (BKG_TEMPLATE_RE.test(value)) {
      bkgNote(notes, 'templateBlank', { text: label });
      value = '';
    }
    campos.set(clave, { label, value });
  }
  return campos;
}

function bkgValue(campos, clave) {
  return campos.get(clave)?.value ?? '';
}

// El valor, marcado si se pasa del tope del servidor. Nunca recortado.
function bkgCapped(campos, clave, tope, notes) {
  const campo = campos.get(clave);
  if (campo === undefined) return '';
  if (campo.value.length > tope) bkgNote(notes, 'valueTooLong', { text: campo.label });
  return campo.value;
}

function bkgBool(campos, clave, notes) {
  const campo = campos.get(clave);
  if (campo === undefined || campo.value === '') return false;
  const v = bkgFold(campo.value);
  if (BKG_YES.has(v)) return true;
  if (BKG_NO.has(v)) return false;
  bkgNote(notes, 'valueUnreadable', { from: campo.label, text: campo.value });
  return false;
}

// La fecha de un campo, con la hora que traiga o la que se le suponga.
// `assumed` en null significa que la hora NO se supone: para una recogida,
// las 00:00 mandarían al paciente a la banqueta del aeropuerto de madrugada.
function bkgDateField(campos, clave, { year, assumed, notes }) {
  const campo = campos.get(clave);
  if (campo === undefined || campo.value === '') return null;

  const fecha = bkgParseDate(campo.value);
  if (!fecha) {
    bkgNote(notes, 'dateUnreadable', { text: campo.value });
    return { label: campo.label, iso: '', dayKey: '' };
  }
  if (year === null) {
    bkgNote(notes, 'noYear');
    return { label: campo.label, iso: '', dayKey: '' };
  }

  let minutes = fecha.minutes;
  if (minutes === null) {
    if (assumed === null) {
      bkgNote(notes, 'timeMissing', { text: campo.label });
      return { label: campo.label, iso: '', dayKey: bkgDayKey(year, fecha.monthIndex, fecha.day) };
    }
    minutes = assumed;
    bkgNote(notes, 'timeAssumed', { from: campo.label, to: bkgClock(assumed) });
  }

  return {
    label: campo.label,
    monthIndex: fecha.monthIndex,
    day: fecha.day,
    minutes,
    year,
    iso: bkgIso(year, fecha.monthIndex, fecha.day, minutes),
    dayKey: bkgDayKey(year, fecha.monthIndex, fecha.day),
  };
}

function bkgClock(minutes) {
  const h = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, '0');
  const doce = h % 12 === 0 ? 12 : h % 12;
  return `${doce}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

// --- Hospedaje ---------------------------------------------------------

const BKG_LODGING_LABELS = new Map([
  ['HOTEL', 'hotel'],
  ['GUEST', 'guest'],
  ['CHECK IN', 'checkIn'],
  ['CHECKIN', 'checkIn'],
  ['CHECK OUT', 'checkOut'],
  ['CHECKOUT', 'checkOut'],
  ['NIGHTS', 'nights'],
  ['NOCHES', 'nights'],
  ['OCCUPANCY', 'occupancy'],
  ['OCUPACION', 'occupancy'],
  ['ROOM TYPE', 'roomType'],
  ['TIPO DE HABITACION', 'roomType'],
  ['TOTAL', 'total'],
  ['BREAKFAST INCLUDED', 'breakfastIncluded'],
  ['BREAKFAST', 'breakfastIncluded'],
  ['RECOVERY ROOM', 'recoveryRoom'],
  ['RESERVATION CODE', 'reservationCode'],
  ['CONFIRMATION NUMBER', 'reservationCode'],
]);

function bkgLodging(rows, { year, patientName }) {
  const notes = [];
  const campos = bkgReadRows(rows, BKG_LODGING_LABELS, notes);

  const entrada = bkgDateField(campos, 'checkIn', { year, assumed: BKG_DEFAULT_CHECK_IN_MIN, notes });
  let salida = bkgDateField(campos, 'checkOut', { year, assumed: BKG_DEFAULT_CHECK_OUT_MIN, notes });

  // Cruce de año: el Word nunca dice el año y un check-out de enero contra
  // un check-in de diciembre es la estancia de fin de año, no un viaje al
  // pasado.
  if (entrada?.iso && salida?.iso && salida.dayKey < entrada.dayKey) {
    salida = {
      ...salida,
      year: salida.year + 1,
      iso: bkgIso(salida.year + 1, salida.monthIndex, salida.day, salida.minutes),
      dayKey: bkgDayKey(salida.year + 1, salida.monthIndex, salida.day),
    };
  }

  const huesped = bkgValue(campos, 'guest');
  if (huesped !== '' && bkgFold(huesped) !== bkgFold(patientName)) {
    bkgNote(notes, 'guestMismatch', { from: huesped, to: bkgText(patientName) });
  }

  const nights = bkgNights(campos, entrada, salida, notes);

  return bkgRecord({
    hotel: bkgCapped(campos, 'hotel', BKG_MAX.hotel, notes),
    reservationCode: bkgCapped(campos, 'reservationCode', BKG_MAX.reservationCode, notes),
    checkIn: entrada?.iso ?? '',
    checkOut: salida?.iso ?? '',
    breakfastIncluded: bkgBool(campos, 'breakfastIncluded', notes),
    recoveryRoom: bkgBool(campos, 'recoveryRoom', notes),
    roomType: bkgCapped(campos, 'roomType', BKG_MAX.roomType, notes),
    nights,
    occupancy: bkgCapped(campos, 'occupancy', BKG_MAX.occupancy, notes),
    total: bkgCapped(campos, 'total', BKG_MAX.total, notes),
  }, notes);
}

function bkgNights(campos, entrada, salida, notes) {
  const crudo = bkgValue(campos, 'nights');
  const nights = /^\d{1,3}$/.test(crudo) ? Number(crudo) : null;
  if (crudo !== '' && nights === null) {
    bkgNote(notes, 'valueUnreadable', { from: campos.get('nights').label, text: crudo });
  }
  if (nights === null || !entrada?.dayKey || !salida?.dayKey) return nights;

  const dias = Math.round((bkgUtcMs(salida) - bkgUtcMs(entrada)) / 86400000);
  if (dias !== nights) bkgNote(notes, 'nightsMismatch', { from: nights, to: dias });
  return nights;
}

function bkgUtcMs(fecha) {
  return Date.UTC(fecha.year, fecha.monthIndex, fecha.day);
}

// --- Transporte --------------------------------------------------------

const BKG_TRANSPORT_LABELS = new Map([
  ['TRANSFER TYPE', 'type'],
  ['TIPO DE TRASLADO', 'type'],
  ['PICKUP DATE AND TIME', 'pickup'],
  ['PICKUP', 'pickup'],
  ['RETURN DATE AND TIME', 'return'],
  ['RETURN', 'return'],
  ['MEETING POINT', 'meetingPoint'],
  ['PUNTO DE ENCUENTRO', 'meetingPoint'],
  ['FLIGHT', 'flightNumber'],
  ['VUELO', 'flightNumber'],
  ['DRIVER NAME', 'driverName'],
  ['CHOFER', 'driverName'],
  ['DRIVER PHONE', 'driverPhone'],
  ['TELEFONO DEL CHOFER', 'driverPhone'],
  ['VEHICLE TYPE', 'vehicle'],
  ['VEHICLE', 'vehicle'],
  ['VEHICULO', 'vehicle'],
  ['LICENSE PLATE', 'plate'],
  ['PLACAS', 'plate'],
  ['ADDITIONAL NOTES', 'notes'],
  ['NOTES', 'notes'],
  ['NOTAS', 'notes'],
]);

function bkgDeclaredKind(texto) {
  if (/ROUND|REDONDO/i.test(texto)) return 'round';
  if (/DEPART|RETURN|SALIDA|REGRESO/i.test(texto)) return 'departure';
  if (/ARRIV|ONE\s*-?\s*WAY|LLEGADA|SENCILLO/i.test(texto)) return 'arrival';
  return null;
}

// El teléfono del chofer llega sin clave de país y el servidor la exige: sin
// `+`, transfer.js arma un `wa.me/` que manda el mensaje a otro país (D73).
// Diez dígitos se precargan con +52 MARCADO; cualquier otra cosa se pasa tal
// cual y se marca, porque suponerle lada a un número que no entendimos es
// exactamente el error que esto evita.
function bkgPhone(crudo, notes) {
  if (crudo === '') return '';
  if (crudo.startsWith('+')) return crudo;
  if (/^[\d\s-]+$/.test(crudo) && crudo.replace(/\D/g, '').length === 10) {
    const con = `+52 ${crudo}`;
    bkgNote(notes, 'countryCodeAssumed', { from: crudo, to: con });
    return con;
  }
  bkgNote(notes, 'phoneUnreadable', { text: crudo });
  return crudo;
}

// "Kia Seltos" es marca y modelo, no la carrocería del enum. Un Seltos es
// una SUV, pero deducirlo del nombre comercial es adivinar y el <select> de
// la revisión está a un clic (D106).
function bkgVehicle(texto, plate, notes) {
  const vacio = { type: '', make: '', model: '', color: '', plate };
  if (texto === '') return vacio;

  const tipo = BKG_VEHICLE_WORDS.get(bkgFold(texto));
  if (tipo !== undefined) return { ...vacio, type: tipo };

  const partes = texto.split(' ');
  bkgNote(notes, 'vehicleSplit', { text: texto });
  bkgNote(notes, 'vehicleTypeMissing');
  return { ...vacio, make: partes[0], model: partes.slice(1).join(' ') };
}

function bkgMatchPoint(texto, puntos) {
  const objetivo = bkgFold(texto);
  if (objetivo === '') return null;
  for (const punto of Array.isArray(puntos) ? puntos : []) {
    for (const nombre of [punto?.name?.es, punto?.name?.en]) {
      const n = bkgFold(nombre);
      if (n !== '' && (n === objetivo || n.includes(objetivo) || objetivo.includes(n))) return punto.id;
    }
  }
  return null;
}

function bkgTransfers(rows, { year, transferPoints, checkInDay }) {
  const comunes = [];
  const campos = bkgReadRows(rows, BKG_TRANSPORT_LABELS, comunes);

  const declarado = bkgDeclaredKind(bkgValue(campos, 'type'));
  const tipoCrudo = bkgValue(campos, 'type');
  if (tipoCrudo !== '' && declarado === null) {
    bkgNote(comunes, 'transferTypeUnknown', { text: tipoCrudo });
  }

  const ida = bkgDateField(campos, 'pickup', { year, assumed: null, notes: comunes });
  const vuelta = bkgDateField(campos, 'return', { year, assumed: null, notes: comunes });

  // El punto de encuentro del documento es donde RECOGEN al paciente al
  // llegar. De dónde lo levantan para volver no aparece en ninguna parte, y
  // suponer "del hotel" es escribir en el expediente algo que nadie dijo.
  const puntoTexto = bkgValue(campos, 'meetingPoint');
  const puntoId = bkgMatchPoint(puntoTexto, transferPoints);
  if (puntoTexto !== '' && puntoId === null) {
    bkgNote(comunes, 'meetingPointUnknown', { text: puntoTexto });
  }

  const chofer = {
    name: bkgCapped(campos, 'driverName', BKG_MAX.driverName, comunes),
    phone: bkgPhone(bkgValue(campos, 'driverPhone'), comunes),
  };
  const vehiculo = bkgVehicle(
    bkgValue(campos, 'vehicle'),
    bkgCapped(campos, 'plate', BKG_MAX.plate, comunes).toUpperCase(),
    comunes,
  );
  const notasTexto = bkgCapped(campos, 'notes', BKG_MAX.notes, comunes);
  // El vuelo es el de LLEGADA: el documento trae un solo campo y ponerlo
  // también en el regreso sería inventarle al paciente un vuelo de vuelta.
  const vuelo = bkgValue(campos, 'flightNumber').toUpperCase();

  const planes = [];
  if (ida) planes.push({ kind: declarado === 'round' ? 'arrival' : (declarado ?? 'arrival'), fecha: ida, vuelo });
  if (vuelta) planes.push({ kind: 'departure', fecha: vuelta, vuelo: '' });
  if (planes.length === 0) {
    planes.push({ kind: declarado === 'round' ? 'arrival' : (declarado ?? 'arrival'), fecha: null, vuelo });
  }

  return planes.map((plan) => {
    const notes = [...comunes];
    if (plan.fecha === null) bkgNote(notes, 'dateMissing');
    if (declarado === 'round') {
      bkgNote(notes, planes.length === 2 ? 'roundTrip' : 'roundTripIncomplete');
    }
    // El regreso no hereda el punto de la ida, y decirlo es el punto.
    if (plan.kind === 'departure' || puntoId === null) {
      if (puntoTexto === '' || plan.kind === 'departure') bkgNote(notes, 'meetingPointMissing');
    }
    if (plan.kind === 'arrival' && checkInDay !== '' && plan.fecha?.dayKey && plan.fecha.dayKey < checkInDay) {
      bkgNote(notes, 'pickupBeforeCheckIn', { from: checkInDay, to: plan.fecha.dayKey });
    }

    return bkgRecord({
      kind: plan.kind,
      scheduledAt: plan.fecha?.iso ?? '',
      meetingPointId: plan.kind === 'departure' ? '' : (puntoId ?? ''),
      flightNumber: plan.vuelo,
      driver: { ...chofer },
      vehicle: { ...vehiculo },
      notes: notasTexto,
    }, notes);
  });
}

// --- Salida ------------------------------------------------------------

// `input` es exactamente lo que viaja al servidor; `notes` es lo que se le
// enseña a la coordinadora. Separados a propósito: así ningún dato que solo
// servía para marcar algo —el nombre del huésped, el texto del punto que no
// reconocimos— se cuela al expediente por venir en el mismo objeto.
function bkgRecord(input, notes) {
  return {
    input,
    notes,
    needsAttention: notes.some((n) => !BKG_INFO_CODES.has(n.code)),
  };
}

/**
 * Lee las tablas de reserva ya repartidas y devuelve lo que PROPONE guardar.
 *
 * @param {object} entrada
 * @param {string[][]} entrada.lodgingRows   filas de la tabla de hospedaje,
 *   sin la del título
 * @param {string[][]} entrada.transportRows filas de la tabla de transporte
 * @param {number|null} entrada.year         el año del encabezado; sin él,
 *   las fechas salen vacías y marcadas
 * @param {string} entrada.patientName       para contrastar contra `Guest`
 * @param {object[]} entrada.transferPoints  catálogo de puntos de encuentro;
 *   se inyecta, no se importa, igual que `locations` en itineraryParse.js
 * @returns {{lodging: object|null, transfers: object[]}}
 */
export function parseBooking({
  lodgingRows, transportRows, year, patientName, transferPoints,
} = {}) {
  const anio = Number.isInteger(year) ? year : null;
  const hospedaje = Array.isArray(lodgingRows) && lodgingRows.length > 0
    ? bkgLodging(lodgingRows, { year: anio, patientName: bkgText(patientName) })
    : null;

  const transporte = Array.isArray(transportRows) && transportRows.length > 0
    ? bkgTransfers(transportRows, {
      year: anio,
      transferPoints,
      checkInDay: hospedaje?.input.checkIn ? hospedaje.input.checkIn.slice(0, 10) : '',
    })
    : [];

  return { lodging: hospedaje, transfers: transporte };
}
