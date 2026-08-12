// Etapa I — de un archivo .docx a su XML. La única pieza de la importación
// que toca bytes.
//
// Un .docx es un ZIP con XML adentro, y lo que interesa está en una sola
// entrada: `word/document.xml`. Aquí se recorre el directorio central del
// ZIP y se infla esa entrada con DecompressionStream('deflate-raw'), que
// existe igual en el navegador y en Node. Cero dependencias (D2) y, sobre
// todo, cero red: el documento de la coordinadora no sale de su computadora
// (D79). Con `connect-src 'self'` tampoco podría.
//
// Vive en src/ui/ y no en src/domain/ porque recibe un File del navegador.
// La parte pura —XML a celdas— es docxTable.js, y la interpretación es
// itineraryParse.js; partirlo así es lo que deja probar los tres sin DOM.
//
// El formato, en lo que importa aquí:
//
//   [datos entrada 1][datos entrada 2]…[directorio central][EOCD]
//
// Se lee el directorio central y no la secuencia de cabeceras locales
// porque el directorio es el índice: dice qué entradas hay y dónde empieza
// cada una, sin tener que caminar el archivo entero. Pero el OFFSET de los
// datos se calcula con la cabecera LOCAL: sus longitudes de nombre y de
// extra son suyas y Word las manda distintas de las del directorio. Usar
// las del directorio para saltar la cabecera local es leer basura, y es el
// error clásico de un lector de ZIP escrito de memoria.
//
// Lo que NO se soporta, dicho de frente: ZIP64 (archivos o cuentas que no
// caben en 32 bits) y cifrado. Un itinerario de Word pesa decenas de KB;
// si algún día llega uno que no entra aquí, contesta `unreadable` en vez de
// entregar un texto a medias.

// Los cinco documentos reales pesan entre 20 y 60 KB. 5 MB es tres órdenes
// de magnitud de margen: no es un límite de formato, es un cinturón contra
// cargar un archivo enorme en memoria antes de descubrir que no era un
// .docx.
export const DOCX_MAX_BYTES = 5 * 1024 * 1024;

const DFILE_ENTRY = 'word/document.xml';
const DFILE_SIG_EOCD = 0x06054b50;
const DFILE_SIG_CEN = 0x02014b50;
const DFILE_SIG_LOC = 0x04034b50;
const DFILE_EOCD_MIN = 22;
const DFILE_CEN_MIN = 46;
const DFILE_METHOD_STORED = 0;
const DFILE_METHOD_DEFLATE = 8;

const dfileDecoder = new TextDecoder();

/**
 * Revisión barata, antes de leer un solo byte del archivo.
 *
 * El tipo se decide por la extensión y no por `file.type`: el navegador
 * manda cadena vacía para .docx más seguido de lo que uno esperaría (según
 * el sistema y de dónde salga el archivo), así que confiar en el MIME
 * rechazaría documentos buenos.
 */
export function validateDocxFile(file) {
  if (!file) return { ok: false, reason: 'missing' };
  const nombre = typeof file.name === 'string' ? file.name : '';
  if (!/\.docx$/i.test(nombre)) return { ok: false, reason: 'type' };
  if (typeof file.size === 'number' && file.size > DOCX_MAX_BYTES) return { ok: false, reason: 'size' };
  return { ok: true };
}

async function dfileBytes(source) {
  if (source instanceof Uint8Array) return source;
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  if (source && typeof source.arrayBuffer === 'function') return new Uint8Array(await source.arrayBuffer());
  return null;
}

// El EOCD no siempre está en los últimos 22 bytes: admite un comentario
// detrás, de hasta 64 KB. Por eso se busca hacia atrás en vez de asumir.
function dfileFindEocd(view, len) {
  const minimo = Math.max(0, len - DFILE_EOCD_MIN - 0xffff);
  for (let i = len - DFILE_EOCD_MIN; i >= minimo; i -= 1) {
    if (view.getUint32(i, true) === DFILE_SIG_EOCD) return i;
  }
  return -1;
}

// Busca la entrada por nombre EXACTO. Un `startsWith` dejaría pasar
// `word/document2.xml`, que existe en documentos con secciones.
function dfileFindEntry(bytes, view, len, eocd) {
  const total = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);

  for (let i = 0; i < total; i += 1) {
    if (p + DFILE_CEN_MIN > len || view.getUint32(p, true) !== DFILE_SIG_CEN) return null;

    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nombreLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const comentarioLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);

    const nombre = dfileDecoder.decode(bytes.subarray(p + DFILE_CEN_MIN, p + DFILE_CEN_MIN + nombreLen));
    if (nombre === DFILE_ENTRY) return { method, compressedSize, localOffset };

    p += DFILE_CEN_MIN + nombreLen + extraLen + comentarioLen;
  }
  return null;
}

async function dfileInflate(datos) {
  const ds = new DecompressionStream('deflate-raw');
  const escritor = ds.writable.getWriter();
  // Sin await: el flujo no drena hasta que alguien lee del otro lado, así
  // que esperar aquí se traba. Los rechazos se ignoran a propósito — el
  // error de verdad sale por el lector, y una promesa rechazada sin dueño
  // tumba el proceso en Node.
  escritor.write(datos).catch(() => {});
  escritor.close().catch(() => {});

  const lector = ds.readable.getReader();
  const trozos = [];
  let total = 0;
  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    trozos.push(value);
    total += value.length;
  }

  const salida = new Uint8Array(total);
  let i = 0;
  for (const t of trozos) {
    salida.set(t, i);
    i += t.length;
  }
  return salida;
}

/**
 * Lee `word/document.xml` de un .docx.
 *
 * @param {File|Blob|ArrayBuffer|Uint8Array} source
 * @returns {Promise<{ok: true, xml: string} | {ok: false, reason: string}>}
 *   `notZip` no es un ZIP · `noDocument` es un ZIP pero sin
 *   word/document.xml (un .xlsx renombrado, por ejemplo) · `unsupported
 *   Compression` el ZIP usa un método que no sabemos inflar ·
 *   `unreadable` el archivo está truncado o corrupto.
 *
 * Devuelve un motivo en vez de lanzar porque cada uno se le dice distinto a
 * la coordinadora, y porque un `catch` genérico en la pantalla convertiría
 * los cuatro en el mismo "no se pudo".
 */
export async function readDocxDocumentXml(source) {
  const bytes = await dfileBytes(source).catch(() => null);
  if (!bytes) return { ok: false, reason: 'unreadable' };

  const len = bytes.length;
  if (len < DFILE_EOCD_MIN) return { ok: false, reason: 'notZip' };

  const view = new DataView(bytes.buffer, bytes.byteOffset, len);
  const eocd = dfileFindEocd(view, len);
  if (eocd < 0) return { ok: false, reason: 'notZip' };

  let entrada = null;
  try {
    entrada = dfileFindEntry(bytes, view, len, eocd);
  } catch {
    // Un directorio truncado hace que DataView lea fuera de rango. Es un
    // archivo roto, no un formato desconocido.
    return { ok: false, reason: 'unreadable' };
  }
  if (!entrada) return { ok: false, reason: 'noDocument' };

  if (entrada.method !== DFILE_METHOD_STORED && entrada.method !== DFILE_METHOD_DEFLATE) {
    return { ok: false, reason: 'unsupportedCompression' };
  }

  const loc = entrada.localOffset;
  if (loc + 30 > len || view.getUint32(loc, true) !== DFILE_SIG_LOC) return { ok: false, reason: 'unreadable' };

  // Las longitudes de ESTA cabecera, no las del directorio: ver el
  // comentario de arriba.
  const inicio = loc + 30 + view.getUint16(loc + 26, true) + view.getUint16(loc + 28, true);
  const fin = inicio + entrada.compressedSize;
  if (fin > len) return { ok: false, reason: 'unreadable' };

  const crudo = bytes.subarray(inicio, fin);
  if (entrada.method === DFILE_METHOD_STORED) {
    return { ok: true, xml: dfileDecoder.decode(crudo) };
  }

  try {
    return { ok: true, xml: dfileDecoder.decode(await dfileInflate(crudo)) };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}
