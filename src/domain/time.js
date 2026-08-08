// Formato y aritmética de horas en America/Tijuana (PRD §7.1 INV-5, R6).
//
// Regla de esta fase: ninguna función de este archivo consulta el reloj
// del sistema (INV-1) ni la zona horaria del proceso (INV-5). Toda lectura
// de "qué hora es en Tijuana" pasa por Intl.DateTimeFormat con
// timeZone: 'America/Tijuana' explícito — eso es independiente de
// process.env.TZ, a diferencia de Date#getHours/getMinutes/getDay/getDate,
// que sí leen la zona local del proceso y por eso están prohibidas aquí.
//
// `new Date(iso)` con argumento es aritmética de instante (milisegundos
// desde epoch, siempre UTC internamente) y no depende de ninguna zona
// horaria: es distinto de `new Date()` sin argumento, que sí lee el reloj
// del sistema y está prohibido por INV-1.

const TZ = 'America/Tijuana';
export const HOUR_MS = 60 * 60 * 1000;

const WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'long',
});

// Descompone un instante en sus campos de calendario/reloj vistos desde
// America/Tijuana. No usa Date#getHours ni similares: todo sale de
// Intl.DateTimeFormat con timeZone explícito.
function tijuanaParts(date) {
  const raw = Object.fromEntries(PARTS_FORMATTER.formatToParts(date).map((p) => [p.type, p.value]));
  const hour = raw.hour === '24' ? 0 : Number(raw.hour); // ICU a veces da "24" para medianoche
  return {
    year: Number(raw.year),
    month: Number(raw.month),
    day: Number(raw.day),
    hour,
    minute: Number(raw.minute),
    second: Number(raw.second),
    weekdayEn: raw.weekday,
  };
}

// Offset UTC vigente en America/Tijuana para ese instante (en minutos,
// negativo porque Tijuana siempre está al oeste de UTC). Se deriva
// comparando el instante real contra el mismo instante interpretado como
// si sus campos de calendario fueran UTC — funciona en cualquier lado del
// cambio de horario de verano sin tabla de reglas propia.
function tijuanaOffsetMinutes(date) {
  const p = tijuanaParts(date);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asIfUtc - date.getTime()) / 60000);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatOffset(minutes) {
  const sign = minutes <= 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

// Convierte cualquier ISO con desplazamiento explícito a milisegundos desde
// epoch. Es aritmética de instante pura, no lectura de reloj (INV-1: el
// argumento siempre llega desde afuera).
export function instantMs(iso) {
  return new Date(iso).getTime();
}

// Suma milisegundos a un instante y lo serializa como ISO 8601 con el
// desplazamiento que America/Tijuana tenga vigente en ese instante
// resultante (nunca 'Z', nunca sin zona — PRD §7).
export function toTijuanaIso(ms) {
  const date = new Date(ms);
  const p = tijuanaParts(date);
  const offset = tijuanaOffsetMinutes(date);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}${formatOffset(offset)}`;
}

// ---------------------------------------------------------------------------
// Etapa H — puente entre los controles nativos de fecha del panel y el ISO
// con desplazamiento explícito que guarda el proyecto (PRD §7).
//
// <input type="datetime-local"> devuelve "2026-03-11T15:00", pelado: la hora
// de pared sin zona. Escribir el desplazamiento a mano ('-07:00') acierta de
// marzo a noviembre y corre las citas una hora el resto del año, porque Baja
// California NO abolió el horario de verano junto con el resto de México
// (sigue el calendario de EE. UU. por la frontera). Así que el offset se
// deriva de LA FECHA, con el mismo tijuanaOffsetMinutes que ya usa
// toTijuanaIso — una sola fuente de verdad, ya probada, sin tabla propia de
// reglas de horario de verano.
//
// Siguen valiendo INV-1 e INV-5: son función de su argumento y de nada más.

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?[+-]\d{2}:\d{2}$/;

// Interpreta lo que devuelve un control nativo. Devuelve null en vez de una
// fecha corrida cuando el calendario no cuadra: Date.UTC "arregla" solo un
// 30 de febrero moviéndolo al 2 de marzo, y guardar eso en silencio sería
// peor que rechazarlo.
function parseLocal(local) {
  if (typeof local !== 'string') return null;
  const m = LOCAL_RE.exec(local.trim());
  if (!m) return null;
  const [year, month, day, hour, minute] = [m[1], m[2], m[3], m[4] ?? '00', m[5] ?? '00'].map(Number);
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute);
  const back = new Date(asIfUtc);
  const cuadra =
    back.getUTCFullYear() === year &&
    back.getUTCMonth() + 1 === month &&
    back.getUTCDate() === day &&
    back.getUTCHours() === hour &&
    back.getUTCMinutes() === minute;
  return cuadra ? { year, month, day, hour, minute, asIfUtc } : null;
}

// tijuanaOffset('2026-01-15T15:00') -> '-08:00' | null
//
// El problema del huevo y la gallina: para saber qué offset regía hay que
// saber de qué instante se habla, y para saber de qué instante se habla hay
// que saber el offset. Se resuelve en dos pasadas: la primera usa la hora de
// pared como si fuera UTC (se equivoca a lo mucho por las ~8 horas del
// desplazamiento) y la segunda vuelve a preguntar ya sobre el instante
// candidato. Converge salvo dentro de la hora que el cambio de horario borra
// o repite, donde cualquier respuesta es igual de defendible.
export function tijuanaOffset(local) {
  const p = parseLocal(local);
  if (!p) return null;
  const aproximado = tijuanaOffsetMinutes(new Date(p.asIfUtc));
  const afinado = tijuanaOffsetMinutes(new Date(p.asIfUtc - aproximado * 60000));
  return formatOffset(afinado);
}

// toIsoTijuana('2026-01-15T15:00') -> '2026-01-15T15:00-08:00' | null
// Una fecha sin hora (lo que da <input type="date">) se guarda como
// medianoche de ese día en Tijuana.
export function toIsoTijuana(local) {
  const p = parseLocal(local);
  if (!p) return null;
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}${tijuanaOffset(local)}`;
}

// toLocalInput('2026-03-11T15:00-07:00') -> '2026-03-11T15:00' | ''
//
// El camino de vuelta, para prellenar el formulario con lo ya guardado. NO
// es un corte de los primeros 16 caracteres: eso funciona solo mientras todo
// venga en offset de Tijuana, y el día que entre un '...Z' el corte devuelve
// la hora UTC como si fuera local y la corre siete horas sin decir nada.
//
// El criterio es el único que no se puede falsificar: se calcula el instante
// real y se comprueba que el reloj de pared de Tijuana en ese instante sea
// exactamente lo que dice el ISO. Un desplazamiento que no corresponde a esa
// fecha (un '-07:00' en enero, escrito por algo que no consultó el
// calendario) no pasa. Devuelve '' —no null— porque el destino es un
// atributo value.
export function toLocalInput(iso) {
  if (typeof iso !== 'string') return '';
  const m = ISO_RE.exec(iso.trim());
  if (!m) return '';
  const local = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
  const ms = new Date(iso.trim()).getTime();
  if (!Number.isFinite(ms)) return '';
  const p = tijuanaParts(new Date(ms));
  const reloj = `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}`;
  return reloj === local ? local : '';
}

// El mismo puente para <input type="date">: el día es el de Tijuana, no el
// de UTC — un instante de la noche cae en el día siguiente en UTC y sacar el
// día del ISO crudo lo movería.
export function toDateInput(iso) {
  return toLocalInput(iso).slice(0, 10);
}

// ---------------------------------------------------------------------------

// Clave de día de calendario en America/Tijuana, ordenable como string
// ("2026-03-10"). Se usa para agrupar (itinerary.js) y para medir
// diferencia de días.
export function dayKeyTijuana(iso) {
  const p = tijuanaParts(new Date(iso));
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

// Diferencia en días de calendario (Tijuana) entre iso y referenceIso:
// 0 = mismo día, 1 = el día siguiente, -1 = el día anterior, etc.
function dayDiffTijuana(iso, referenceIso) {
  const a = tijuanaParts(new Date(iso));
  const b = tijuanaParts(new Date(referenceIso));
  const utcA = Date.UTC(a.year, a.month - 1, a.day);
  const utcB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((utcA - utcB) / 86400000);
}

// formatTimeTijuana(iso, lang) -> "9:00 AM" (en) / "9:00 a.m." (es)
// Reloj de 12 horas sin cero a la izquierda en la hora, minutos siempre a
// dos dígitos. "a.m./p.m." en minúsculas con puntos es la convención
// habitual en español de México; no la dicta el PRD de forma literal, así
// que queda documentada aquí como decisión de implementación, no de
// producto.
export function formatTimeTijuana(iso, lang) {
  const { hour, minute } = tijuanaParts(new Date(iso));
  const isAm = hour < 12;
  const period = lang === 'es' ? (isAm ? 'a.m.' : 'p.m.') : isAm ? 'AM' : 'PM';
  let hour12 = hour % 12;
  if (hour12 === 0) hour12 = 12;
  return `${hour12}:${pad2(minute)} ${period}`;
}

// isOpenNow(hours, now) -> true | false | null
//
// Añadido en la fase 05 (pantalla "Horarios"): la fase pide un indicador
// "abierto ahora / cerrado" "calculado con now inyectado, nunca con el
// reloj leído dentro de la vista" — eso es una regla de dominio (lee hora
// de Tijuana, compara contra un horario), no una decisión de presentación,
// así que vive aquí y no en src/ui/screens/hours.js, igual que el resto de
// este archivo.
//
// hours.weekly[].day usa la misma convención que Date#getUTCDay():
// 0 = domingo … 6 = sábado. Ningún dato real del proyecto lo confirma
// todavía (locations.js, support.js y plaza.js traen el mismo horario
// placeholder los 7 días, así que el número en sí es indistinguible en la
// práctica) — queda documentada aquí como la convención a seguir cuando
// haya horario real distinto por día.
//
// hours.exceptions no se consulta: ninguna fixture ni contenido real lo
// puebla todavía (siempre `[]`) y el PRD no fija su forma. Inventar una
// forma sin dato real que la respalde sería peor que dejarlo pendiente —
// mismo criterio que ya se aplicó en fase 03 para amenidades y farmacia.
export function isOpenNow(hours, now) {
  if (!hours || !Array.isArray(hours.weekly)) return null;
  const p = tijuanaParts(new Date(now));
  const dow = WEEKDAYS_EN.indexOf(p.weekdayEn); // 0=domingo..6=sábado
  const today = hours.weekly.find((w) => w.day === dow);
  if (!today) return false;
  const hm = `${pad2(p.hour)}:${pad2(p.minute)}`;
  return hm >= today.open && hm <= today.close;
}

// formatDayLabel(iso, now, lang) -> { es, en }
// Devuelve SIEMPRE ambos idiomas (igual que groupByDay's `label`): la UI
// puede alternar ES/EN sin volver a llamar al dominio. El parámetro `lang`
// se acepta por simetría con formatTimeTijuana y porque quien llama ya lo
// tiene a mano, pero no cambia qué se calcula.
export function formatDayLabel(iso, now, _lang) {
  const diff = dayDiffTijuana(iso, now);
  const { day, weekdayEn } = tijuanaParts(new Date(iso));
  const idx = WEEKDAYS_EN.indexOf(weekdayEn);
  const weekdayEs = WEEKDAYS_ES[idx];

  const es = diff === 0 ? `Hoy · ${weekdayEs} ${day}` : diff === 1 ? `Mañana · ${weekdayEs} ${day}` : `${weekdayEs} ${day}`;
  const en = diff === 0 ? `Today · ${weekdayEn} ${day}` : diff === 1 ? `Tomorrow · ${weekdayEn} ${day}` : `${weekdayEn} ${day}`;

  return { es, en };
}
