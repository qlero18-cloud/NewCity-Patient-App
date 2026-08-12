// Etapa I — De las filas del itinerario de Word a citas PROPUESTAS.
//
// Este módulo lee lo que docxTable.js transcribió y le pone significado:
// qué fila es una cita, a qué hora, cuánto dura, en qué piso. Es la pieza
// donde de verdad se puede hacer daño, así que conviene ser explícito sobre
// lo que NO hace:
//
//   - No guarda nada. Devuelve una propuesta que la coordinadora revisa y
//     corrige antes de que exista un expediente (D84).
//   - No adivina ubicaciones. Si el texto de la celda no coincide con el
//     catálogo, devuelve `null` y lo marca. Mandar texto libre al servidor es
//     justo lo que D40 y D70 existen para impedir.
//   - No lee el reloj (INV-1). El año sale de "Scheduled Date:" del propio
//     archivo. Si el archivo no lo trae, las citas quedan SIN fecha y
//     marcadas — nunca con la fecha de hoy, que se vería igual de válida y
//     mandaría al paciente el día equivocado.
//   - No inventa correcciones. Los typos se arreglan con un diccionario
//     explícito (D85) y cada arreglo queda registrado para enseñarse.
//
// Todo lo dudoso sale MARCADO en `notes`, con su código, y lo que se cambió
// sale con el antes y el después. Un dato que este módulo se invente en
// silencio nadie lo va a cachar: la coordinadora no tiene el Word al lado
// mientras revisa, y el paciente menos.
//
// Los nombres top-level van con prefijo ITIN_/itin porque build.py aplana
// todos los módulos de un entry a un solo scope y dos homónimos serían un
// error duro de empaquetado.

import { toIsoTijuana } from './time.js';

const ITIN_MONTHS = 'JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER';
const ITIN_MONTH_INDEX = new Map(ITIN_MONTHS.split('|').map((m, i) => [m, i]));
const ITIN_WEEKDAYS = 'SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY';

// Un rango de fechas de un check-up es de uno o dos días. Catorce ya es
// absurdo, y sirve de tope para que una fecha mal leída no genere cientos de
// días. Cuando se pasa, se usa solo el inicio y se avisa.
const ITIN_MAX_RANGE_DAYS = 14;
const ITIN_DAY_MS = 86400000;

// Duración por omisión cuando el archivo no la dice (D86). Deducirla del
// hueco a la siguiente cita NO funciona: los huecos reales van de 15 minutos
// a cinco horas, y un ultrasonido no dura cinco horas porque la siguiente
// consulta tarde en llegar. El hueco solo sirve para RECORTAR.
const ITIN_DEFAULT_DURATION_MIN = 30;

// Ventana en la que puede caer una cita de check-up. No valida horas —
// valida CORRECCIONES: solo se acepta invertir AM/PM si el resultado aterriza
// aquí dentro. Es lo que separa el `12:30AM` de Amy, que entre las 11:00AM y
// las 2:00PM solo puede ser mediodía, de un `9:00AM` que "se ordenaría"
// mandándolo a las nueve de la noche.
const ITIN_FLIP_MIN = 6 * 60;
const ITIN_FLIP_MAX = 20 * 60;

// Límites del servidor (src/server/visitMutations.js). Aquí no se recorta
// nada: se marca, y la coordinadora edita. Recortar en silencio dejaría un
// estudio con el nombre a medias.
const ITIN_MAX_SERVICE = 120;
const ITIN_MAX_PREP = 280;
const ITIN_MAX_DETAILS = 600;

// D85 — Diccionario explícito y versionado, no un corrector que adivine:
// inventar correcciones sobre términos médicos es como se cambia el
// significado de un estudio sin querer. Crece de a una línea, con su prueba.
// (El "INLCUDED" del texto legal del encabezado no está aquí a propósito:
// vive solo en párrafos que este módulo descarta enteros.)
const ITIN_TYPOS = [
  ['URUNALYSIS', 'URINALYSIS'],
  ['CARDIC', 'CARDIAC'],
  ['OPHTALMOLOGY', 'OPHTHALMOLOGY'],
  ['THRUSDAY', 'THURSDAY'],
];

const ITIN_MEAL_RE = /\b(?:LUNCH|BREAKFAST|DINNER|BRUNCH|DESAYUNO|COMIDA|CENA|ALMUERZO)\b/i;

// La hora tal como la escriben: "8:00AM", "7:30 AM", "12:30AM". El sufijo
// AM/PM es obligatorio — un "14:00" suelto se marca ilegible en vez de
// interpretarse, porque en estos archivos no aparece nunca y adivinar el
// formato de una hora es adivinar a qué hora llega el paciente.
const ITIN_TIME_RE = /^(\d{1,2})(?::(\d{2}))?\s*\.?\s*([AP])\.?\s*M\.?$/i;

const ITIN_SCHEDULED_RE = /SCHEDULED\s+DATE\s*:/i;
const ITIN_PACKAGE_RE = /CHECK\s*-?\s*UP\s*$/i;
const ITIN_HEADER_PACKAGE_RE = /CHECK\s*-?\s*UP\s+ITINERARY\s*(.*)$/i;
const ITIN_PATIENT_RE = /PATIENT\s*:\s*([\s\S]*?)(?=\s*(?:DOB|D\.O\.B|DATE\s+OF\s+BIRTH|PHONE|TEL|E-?MAIL|CORREO)\b\s*:?|$)/i;

// "July 30 – 31, 2026", "July 27th – 28th, 2026", "AUGUST 4 – 5, 2026",
// "Thursday August 20th, 2026" y "July 31 – August 1, 2026". El año solo vive
// aquí: la tabla nunca lo trae. Exigir la coma y las cuatro cifras del año es
// lo que impide que el segundo guion —el de "– 7:30 AM."— se confunda con el
// del rango de días.
const ITIN_DATE_RE = new RegExp(
  `(${ITIN_MONTHS})\\.?\\s+(\\d{1,2})(?:ST|ND|RD|TH)?`
  + `(?:\\s*[–—-]\\s*(?:(${ITIN_MONTHS})\\.?\\s+)?(\\d{1,2})(?:ST|ND|RD|TH)?)?`
  + `\\s*,\\s*(\\d{4})`,
  'i',
);

const ITIN_DAY_ROW_RE = new RegExp(
  `^(?:${ITIN_WEEKDAYS})\\s*,\\s*(${ITIN_MONTHS})\\.?\\s+(\\d{1,2})(?:ST|ND|RD|TH)?\\.?$`,
  'i',
);

// Duración explícita, en sus tres redacciones reales: "(2 HOURS)",
// "(2 HOURS DURATION)" y "(DURATION: 2 HOURS)". Exigir el número es lo que
// deja fuera a "(BONE DENSITY SCAN)" y a "(INCLUDES INBODY SCAN)".
const ITIN_DURATION_RE = /\(\s*(?:DURATION\s*:\s*)?(\d{1,3})\s*(HOURS?|HRS?|MINUTES?|MINS?|MIN)\b[^)]*\)/i;

// El médico, al FINAL del nombre del estudio. Dos formas: entre paréntesis
// ("PAP SMEAR (Dr. Barajas)") o pegado al final ("... DR. LUNA", "... DR
// SARA", "... DR PEÑA"). Anclarlo al final es lo que impide que "RETINA
// CENTER" pase por médico, y exigir un espacio después de DR/DRA es lo que
// impide partir "SURGICAL DRAINAGE" por la mitad.
const ITIN_DOCTOR_PAREN_RE = /\(\s*((?:DRA?|DOCTORA?)\.?\s+[^)]+?)\s*\)\s*$/i;
const ITIN_DOCTOR_TAIL_RE = /(?:^|[\s.])((?:DRA?|DOCTORA?)\.?\s+\p{Lu}[\p{L}]*(?:\s+\p{Lu}[\p{L}]*)*)\s*\.?\s*$/u;

const ITIN_FLOOR_ORDINAL_RE = /(?:^|\s)(\d{1,2})\s*(?:ST|ND|RD|TH)?\s*FLOOR(?:\s|$)/;
const ITIN_FLOOR_WORD_RE = /(?:^|\s)(?:PISO|FLOOR)\s*(\d{1,2})(?:\s|$)/;

// El vocabulario con el que las coordinadoras nombran los lugares, que no es
// el del catálogo. Se busca por contención y en este orden, así que lo más
// específico va primero.
const ITIN_LOCATION_ALIASES = [
  ['COMPASS', 'compass'],
  ['FARMERS TABLE', 'nivel1'],
  ['THE PARK RESTAURANTE', 'nivel1'],
  ['THE PARK RESTAURANT', 'nivel1'],
  ['NIVEL 1', 'nivel1'],
  ['LEVEL 1', 'nivel1'],
  ['QUARTZ', 'quartz'],
  ['PHARMACY', 'farmacia'],
  ['FARMACIA', 'farmacia'],
  ['PARKING', 'estacionamiento'],
  ['ESTACIONAMIENTO', 'estacionamiento'],
  ['LOBBY', 'lobby_torre'],
];

// Lo que la coordinadora TIENE que resolver antes de importar. Las
// correcciones (typo arreglado, hora invertida) no entran: esas se resaltan
// aparte, y meterlas aquí inflaría el conteo hasta volverlo ruido.
export const ITIN_ATTENTION_CODES = new Set([
  'locationMissing', 'locationUnknown', 'noDate', 'timeUnreadable',
  'timeOutOfOrder', 'overlap', 'serviceNameTooLong', 'prepTooLong', 'detailsTooLong',
]);

function itinText(v) {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
}

// Para comparar contra el catálogo: sin acentos, sin apóstrofos y sin
// puntuación. Los apóstrofos se ELIMINAN, no se unifican, porque "FARMER´S
// TABLE", "FARMER'S TABLE" y "FARMERS TABLE" son el mismo comedor escrito de
// tres formas en tres archivos distintos.
// \p{M} son las marcas combinantes que deja NFD al descomponer un acento, y
// \p{Pi}/\p{Pf} las comillas tipográficas. Se usan las propiedades Unicode y
// no una clase con los caracteres escritos a mano porque un apóstrofo curvo o
// un acento suelto dentro de una expresión regular son invisibles en el
// editor: nadie ve que los borró hasta que "FARMER´S TABLE" deja de coincidir.
const ITIN_RE_MARKS = /\p{M}/gu;
const ITIN_RE_APOSTROPHE = /['´`\p{Pi}\p{Pf}]/gu;

function itinNormalize(s) {
  return itinText(s)
    .toUpperCase()
    .normalize('NFD')
    .replace(ITIN_RE_MARKS, '')
    .replace(ITIN_RE_APOSTROPHE, '')
    .replace(/[^A-Z0-9&]+/g, ' ')
    .trim();
}

function itinNote(notes, code, extra) {
  notes.push(extra ? { code, ...extra } : { code });
}

function itinApplyTypos(texto, notes) {
  let out = texto;
  for (const [from, to] of ITIN_TYPOS) {
    const siguiente = out.replace(new RegExp(`\\b${from}\\b`, 'gi'), (m) => (m === m.toLowerCase() ? to.toLowerCase() : to));
    if (siguiente !== out) {
      out = siguiente;
      itinNote(notes, 'typoFixed', { from, to });
    }
  }
  return out;
}

// --- Fechas ------------------------------------------------------------

function itinDayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// Se construye con Date.UTC y aritmética de milisegundos, nunca con el huso
// local: el día calendario tiene que salir igual en la laptop de la
// coordinadora que en el servidor. El desplazamiento de Tijuana lo pone
// después toIsoTijuana, que lo deriva del calendario (D76).
function itinUtcMs(year, monthIndex, day) {
  return Date.UTC(year, monthIndex, day);
}

function itinExpandRange(inicioMs, finMs, warnings) {
  if (finMs < inicioMs) return [itinDayKey(inicioMs)];
  const dias = Math.round((finMs - inicioMs) / ITIN_DAY_MS) + 1;
  if (dias > ITIN_MAX_RANGE_DAYS) {
    itinNote(warnings, 'dateRangeTooLong', { days: dias });
    return [itinDayKey(inicioMs)];
  }
  const out = [];
  for (let i = 0; i < dias; i += 1) out.push(itinDayKey(inicioMs + i * ITIN_DAY_MS));
  return out;
}

// Devuelve { year, days } o null. `year` se conserva aparte porque una fila
// de día que el encabezado no menciona sigue necesitando un año, y ese año
// solo puede salir de aquí.
function itinParseScheduled(texto, warnings) {
  const m = ITIN_DATE_RE.exec(texto);
  if (!m) return null;

  const mes1 = ITIN_MONTH_INDEX.get(m[1].toUpperCase());
  const dia1 = Number(m[2]);
  const year = Number(m[5]);
  const inicioMs = itinUtcMs(year, mes1, dia1);
  // Date.UTC hace rodar los días fuera de rango (31 de febrero → 3 de marzo)
  // sin avisar. La ida y vuelta lo detecta.
  if (itinDayKey(inicioMs) !== `${year}-${String(mes1 + 1).padStart(2, '0')}-${String(dia1).padStart(2, '0')}`) {
    itinNote(warnings, 'dateUnreadable', { text: texto });
    return null;
  }

  if (m[4] === undefined) return { year, days: [itinDayKey(inicioMs)] };

  const mes2 = m[3] === undefined ? mes1 : ITIN_MONTH_INDEX.get(m[3].toUpperCase());
  const dia2 = Number(m[4]);
  // Un rango que retrocede de mes cerró el año: "December 31 – January 1".
  const year2 = mes2 < mes1 ? year + 1 : year;
  return { year, days: itinExpandRange(inicioMs, itinUtcMs(year2, mes2, dia2), warnings) };
}

// --- Horas -------------------------------------------------------------

function itinParseMinutes(texto) {
  const m = ITIN_TIME_RE.exec(texto);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (h < 1 || h > 12 || min > 59) return null;
  return (h % 12) * 60 + min + (m[3].toUpperCase() === 'P' ? 720 : 0);
}

function itinFormatMinutes(total) {
  const h24 = Math.floor(total / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(total % 60).padStart(2, '0')}${h24 < 12 ? 'AM' : 'PM'}`;
}

// --- Ubicaciones -------------------------------------------------------

// Devuelve { id } o { id: null, code }. Nunca devuelve un id que no esté en
// el catálogo recibido: el servidor rechaza con 422 cualquier id
// desconocido, y una importación de 19 citas que falla entera por una celda
// mal leída es un misterio en pantalla.
function itinMatchLocation(texto, locations) {
  const t = itinNormalize(texto);
  if (t === '') return { id: null, code: 'locationMissing' };

  const ids = new Set(locations.map((l) => l.id));
  const piso = ITIN_FLOOR_ORDINAL_RE.exec(t) ?? ITIN_FLOOR_WORD_RE.exec(t);
  if (piso) {
    // Un piso que el catálogo no tiene se rechaza aquí mismo, sin seguir
    // buscando: aproximarlo a otro piso es exactamente el error que la
    // Etapa I viene a arreglar.
    const id = `piso${Number(piso[1])}`;
    return ids.has(id) ? { id } : { id: null, code: 'locationUnknown' };
  }

  for (const l of locations) {
    if (itinNormalize(l.name?.es) === t || itinNormalize(l.name?.en) === t) return { id: l.id };
  }

  for (const [alias, id] of ITIN_LOCATION_ALIASES) {
    if (ids.has(id) && (t === alias || t.includes(alias))) return { id };
  }

  return { id: null, code: 'locationUnknown' };
}

// --- Servicio, duración, médico ---------------------------------------

function itinTidyService(s) {
  return s.replace(/[\s.,;:]+$/, '').trim();
}

function itinExtractDuration(servicio) {
  const m = ITIN_DURATION_RE.exec(servicio);
  if (!m) return { servicio, durationMin: null };
  const n = Number(m[1]);
  const horas = /^H/i.test(m[2]);
  const min = horas ? n * 60 : n;
  if (min <= 0) return { servicio, durationMin: null };
  return { servicio: itinText(servicio.replace(m[0], ' ')), durationMin: min };
}

function itinExtractDoctor(servicio) {
  const m = ITIN_DOCTOR_PAREN_RE.exec(servicio) ?? ITIN_DOCTOR_TAIL_RE.exec(servicio);
  if (!m) return { servicio, doctor: '' };
  const resto = itinTidyService(itinText(servicio.slice(0, m.index) + servicio.slice(m.index + m[0].length)));
  // Si quitar al médico dejaría el estudio sin nombre, es que la celda solo
  // trae al médico. Se deja completa: un serviceName vacío lo rechaza el
  // servidor con 'required' y la fila entera se caería.
  if (resto === '') return { servicio, doctor: '' };
  return { servicio: resto, doctor: itinText(m[1]) };
}

// --- Encabezado --------------------------------------------------------

function itinReadHeadings(headings, warnings) {
  const out = { patientName: '', packageName: '', year: null, days: [], discarded: [] };
  if (!Array.isArray(headings)) return out;

  for (const bruto of headings) {
    const linea = itinText(bruto);
    if (linea === '') continue;

    if (out.patientName === '' && /PATIENT\s*:/i.test(linea)) {
      const m = ITIN_PATIENT_RE.exec(linea);
      if (m) out.patientName = itinText(m[1]);
      // Lo que se DESCARTA a propósito, para poder decirlo en la revisión en
      // vez de que la coordinadora lo descubra después. D61 decidió no
      // guardar el teléfono del paciente y esta etapa no lo reabre.
      if (/\b(?:DOB|D\.O\.B|DATE\s+OF\s+BIRTH)\b/i.test(linea)) out.discarded.push('dob');
      if (/\b(?:PHONE|TEL)\b/i.test(linea)) out.discarded.push('phone');
      if (/E-?MAIL|CORREO/i.test(linea)) out.discarded.push('email');
    }

    if (out.packageName === '') {
      const m = ITIN_HEADER_PACKAGE_RE.exec(linea);
      if (m) out.packageName = itinText(m[1]);
    }

    if (out.days.length === 0 && ITIN_SCHEDULED_RE.test(linea)) {
      const fechas = itinParseScheduled(linea, warnings);
      if (fechas) {
        out.year = fechas.year;
        out.days = fechas.days;
      }
    }
  }

  return out;
}

// --- Clasificación de filas -------------------------------------------

function itinBlankRow(index, raw, kind, notes) {
  return {
    index, raw, kind, notes,
    startsAt: null, serviceName: '', durationMin: null, locationId: null,
    prep: '', doctor: '', details: '', dayKey: null, minutes: null, rawTime: '',
  };
}

function itinClassify(index, raw, cells, notes, contexto) {
  const noVacias = cells.filter((c) => c !== '');
  if (noVacias.length === 0) return itinBlankRow(index, raw, 'ignored', notes);
  if (itinNormalize(cells[0]) === 'TIME') return itinBlankRow(index, raw, 'ignored', notes);

  const unico = noVacias.length === 1 ? noVacias[0] : null;
  if (unico !== null) {
    if (ITIN_SCHEDULED_RE.test(unico)) return itinBlankRow(index, raw, 'ignored', notes);
    const dia = ITIN_DAY_ROW_RE.exec(unico);
    if (dia) {
      contexto.setDay(ITIN_MONTH_INDEX.get(dia[1].toUpperCase()), Number(dia[2]));
      return itinBlankRow(index, raw, 'ignored', notes);
    }
    if (ITIN_PACKAGE_RE.test(unico)) return itinBlankRow(index, raw, 'ignored', notes);
  }

  // Celda de hora vacía = sigue la cita anterior. Los estudios que cuelgan
  // del laboratorio son parte de ESA cita, no citas nuevas: importarlos
  // sueltos le pondría al paciente ocho citas a la misma hora.
  if (cells[0] === '') {
    const texto = cells.slice(1).filter((c) => c !== '').join(' · ');
    const padre = contexto.lastAppointment();
    if (!padre) {
      itinNote(notes, 'orphanDetail');
      return itinBlankRow(index, raw, 'ignored', notes);
    }
    padre.details = padre.details === '' ? texto : `${padre.details} · ${texto}`;
    const fila = itinBlankRow(index, raw, 'detail', notes);
    fila.details = texto;
    fila.mergedIntoIndex = padre.index;
    return fila;
  }

  if (itinText(cells[1]) === '') return itinBlankRow(index, raw, 'ignored', notes);

  const fila = itinBlankRow(index, raw, ITIN_MEAL_RE.test(cells[1]) ? 'meal' : 'appointment', notes);
  fila.rawTime = cells[0];
  fila.minutes = itinParseMinutes(cells[0]);
  if (fila.minutes === null) itinNote(notes, 'timeUnreadable', { text: cells[0] });

  const conDuracion = itinExtractDuration(cells[1]);
  const conMedico = itinExtractDoctor(conDuracion.servicio);
  fila.serviceName = itinTidyService(conMedico.servicio);
  fila.doctor = conMedico.doctor;
  fila.durationMin = conDuracion.durationMin;

  const instruccion = cells[2] ?? '';
  const lugar = itinMatchLocation(instruccion, contexto.locations);
  fila.locationId = lugar.id;
  if (lugar.code) {
    itinNote(notes, lugar.code, instruccion === '' ? undefined : { text: instruccion });
    // Lo que no es un lugar no se tira: "FASTING 8-12 HOURS" es la
    // preparación de la cita y es de lo más útil que trae el archivo.
    if (instruccion !== '') fila.prep = instruccion;
  }
  return fila;
}

/**
 * Lee un itinerario ya transcrito y devuelve las citas que PROPONE importar.
 *
 * @param {object} entrada
 * @param {string[][]} entrada.rows      filas de la tabla (docxTableRows)
 * @param {string[]} entrada.headings    párrafos de fuera de la tabla
 * @param {object[]} entrada.locations   catálogo de ubicaciones; se inyecta,
 *   no se importa, igual que routing.js recibe sus rutas — así la prueba
 *   puede acotar el catálogo y este módulo no depende de src/data/.
 * @returns {{patientName: string, packageName: string, days: string[],
 *   discarded: string[], warnings: object[], rows: object[], counts: object}}
 */
export function parseItinerary({ rows, headings, locations } = {}) {
  const warnings = [];
  const catalogo = Array.isArray(locations) ? locations : [];
  const cabecera = itinReadHeadings(headings, warnings);

  const filas = [];
  const usados = new Set(cabecera.days);
  let dayKey = cabecera.days[0] ?? null;
  let ultima = null;

  const contexto = {
    locations: catalogo,
    lastAppointment: () => ultima,
    setDay(monthIndex, day) {
      if (cabecera.year === null) return;
      const clave = itinDayKey(itinUtcMs(cabecera.year, monthIndex, day));
      if (!cabecera.days.includes(clave)) itinNote(warnings, 'dayNotInHeader', { day: clave });
      dayKey = clave;
      usados.add(clave);
    },
  };

  for (const [index, bruto] of (Array.isArray(rows) ? rows : []).entries()) {
    const raw = Array.isArray(bruto) ? bruto : [];
    const notes = [];
    const cells = raw.map((c) => itinApplyTypos(itinText(c), notes));
    const fila = itinClassify(index, raw, cells, notes, contexto);
    if (fila.kind === 'appointment' || fila.kind === 'meal') {
      fila.dayKey = dayKey;
      if (fila.kind === 'appointment') ultima = fila;
    }
    filas.push(fila);
  }

  itinResolveTimes(filas, warnings);
  itinFinish(filas);

  return {
    patientName: cabecera.patientName,
    packageName: cabecera.packageName,
    days: [...usados].sort(),
    discarded: cabecera.discarded,
    warnings,
    rows: filas.map(({ dayKey: _d, minutes: _m, rawTime: _r, ...resto }) => resto),
    counts: itinCounts(filas),
  };
}

// Ordena cada día y arregla lo que se pueda arreglar. Comidas incluidas: son
// parte de la secuencia del día aunque no se importen, y sin ellas el
// `12:30AM` de Amy —que está justo entre el desayuno y la consulta de la
// tarde— se quedaría sin la referencia que permite corregirlo.
function itinResolveTimes(filas, warnings) {
  const porDia = new Map();
  for (const f of filas) {
    if (f.kind !== 'appointment' && f.kind !== 'meal') continue;
    const clave = f.dayKey ?? '';
    if (!porDia.has(clave)) porDia.set(clave, []);
    porDia.get(clave).push(f);
  }

  for (const secuencia of porDia.values()) {
    for (let i = 1; i < secuencia.length; i += 1) {
      const cur = secuencia[i];
      const prev = secuencia[i - 1];
      if (cur.minutes === null || prev.minutes === null || cur.minutes >= prev.minutes) continue;

      const invertida = cur.minutes < 720 ? cur.minutes + 720 : cur.minutes - 720;
      const siguiente = secuencia.slice(i + 1).find((f) => f.minutes !== null);
      const sirve = invertida >= prev.minutes
        && (siguiente === undefined || invertida <= siguiente.minutes)
        && invertida >= ITIN_FLIP_MIN && invertida <= ITIN_FLIP_MAX;

      if (sirve) {
        itinNote(cur.notes, 'timeFlipped', { from: cur.rawTime, to: itinFormatMinutes(invertida) });
        cur.minutes = invertida;
      } else {
        itinNote(cur.notes, 'timeOutOfOrder', { text: cur.rawTime });
      }
    }

    // La duración se calcula DESPUÉS de invertir: con la hora vieja, el
    // hueco estaría medido contra un instante que no existe.
    for (let i = 0; i < secuencia.length; i += 1) {
      const cur = secuencia[i];
      if (cur.durationMin !== null || cur.minutes === null) continue;
      const siguiente = secuencia.slice(i + 1).find((f) => f.minutes !== null);
      itinNote(cur.notes, 'durationInferred');
      if (siguiente === undefined) {
        cur.durationMin = ITIN_DEFAULT_DURATION_MIN;
      } else if (siguiente.minutes <= cur.minutes) {
        itinNote(cur.notes, 'overlap');
        cur.durationMin = ITIN_DEFAULT_DURATION_MIN;
      } else {
        cur.durationMin = Math.min(ITIN_DEFAULT_DURATION_MIN, siguiente.minutes - cur.minutes);
      }
    }
  }

  if (filas.some((f) => (f.kind === 'appointment' || f.kind === 'meal') && f.dayKey === null)) {
    itinNote(warnings, 'noDate');
  }
}

function itinFinish(filas) {
  for (const f of filas) {
    if (f.kind !== 'appointment' && f.kind !== 'meal') continue;

    if (f.dayKey === null) itinNote(f.notes, 'noDate');
    if (f.dayKey !== null && f.minutes !== null) {
      const hh = String(Math.floor(f.minutes / 60)).padStart(2, '0');
      const mm = String(f.minutes % 60).padStart(2, '0');
      f.startsAt = toIsoTijuana(`${f.dayKey}T${hh}:${mm}`);
    }
    if (f.durationMin === null) f.durationMin = ITIN_DEFAULT_DURATION_MIN;

    if (f.serviceName.length > ITIN_MAX_SERVICE) itinNote(f.notes, 'serviceNameTooLong');
    if (f.prep.length > ITIN_MAX_PREP) itinNote(f.notes, 'prepTooLong');
    if (f.details.length > ITIN_MAX_DETAILS) itinNote(f.notes, 'detailsTooLong');
  }
}

function itinCounts(filas) {
  const citas = filas.filter((f) => f.kind === 'appointment');
  return {
    read: filas.length,
    importable: citas.length,
    meals: filas.filter((f) => f.kind === 'meal').length,
    needsAttention: citas.filter((f) => f.notes.some((n) => ITIN_ATTENTION_CODES.has(n.code))).length,
  };
}
