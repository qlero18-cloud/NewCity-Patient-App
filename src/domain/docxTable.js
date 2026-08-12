// Etapa I — De word/document.xml a filas, celdas y párrafos de texto.
//
// Un .docx es un ZIP y su contenido principal es word/document.xml. Abrir el
// ZIP toca APIs del navegador y vive en src/ui/docxFile.js; este archivo
// recibe la cadena XML ya extraída y no hace nada más. Esa separación es lo
// que permite probar aquí, en node:test y sin DOM (D8, D45), la parte donde
// de verdad se equivoca uno.
//
// Este módulo TRANSCRIBE, no interpreta: no sabe qué es una hora, un estudio
// ni un día. Convierte la tabla de Word en filas de cadenas y deja el
// significado a src/domain/itineraryParse.js. Por eso conserva las filas
// vacías y las celdas vacías en vez de limpiarlas: una celda de hora en
// blanco es dato (significa "sigue la cita anterior") y quien decide eso es
// el intérprete, no el lector.
//
// LA TRAMPA, que ya me costó una vez extrayendo los documentos reales:
// `<w:t[^>]*>` parece el patrón obvio para el texto, y también casa con
// `<w:tcPr>`, `<w:tblPr>`, `<w:tabs>` y `<w:tblGrid>`, porque "w:t" es
// prefijo de todos ellos. Lo que sale no es una excepción — son celdas que
// contienen XML crudo y se ven como texto legítimo. En un expediente médico
// eso se guarda sin que nadie lo note. Todos los patrones de aquí exigen
// que después del nombre de la etiqueta venga `>`, `/>` o un espacio:
// `<w:t(?:\s[^>]*)?>`. La misma forma vale para w:p contra w:pPr, w:tc
// contra w:tcPr y w:tr contra w:trPr.
//
// LÍMITE CONOCIDO: se recorre con expresiones regulares, no con un parser de
// XML con pila, así que una tabla ANIDADA dentro de una celda cortaría mal
// las celdas de la fila que la contiene. Ninguno de los documentos de las
// coordinadoras anida tablas — son una sola rejilla de 1 a 3 columnas — y la
// red de seguridad no es este archivo sino la pantalla de revisión (D84):
// nada se guarda sin que la coordinadora vea las filas leídas. Si algún día
// aparece un documento con tablas anidadas, esto se cambia por un recorrido
// con pila, no se parcha el patrón.

const DOCX_RE_TBL = /<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g;
const DOCX_RE_TR = /<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g;
const DOCX_RE_TC = /<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g;

// Párrafo, en sus dos formas: con contenido y vacío autocerrado (`<w:p/>`),
// que Word siembra por todos lados.
const DOCX_RE_P = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>|<w:p(?:\s[^>]*)?\/>/g;

// Los bloques de formato (`<w:pPr>`, `<w:rPr>`, `<w:tcPr>`, `<w:trPr>`,
// `<w:tblPr>`…) se quitan antes de buscar texto. No contienen ninguno, y
// quitarlos evita que un `<w:tab/>` de definición de tabulaciones —que vive
// dentro de `<w:pPr>`— se cuele como espacio. La retro-referencia \1 hace
// que un `<w:pPr>` que contiene un `<w:rPr>` se cierre en su propio
// `</w:pPr>` y no en el del hijo.
const DOCX_RE_PROPS = /<w:(\w+Pr)(?:\s[^>]*)?>[\s\S]*?<\/w:\1>|<w:\w+Pr(?:\s[^>]*)?\/>/g;

// Las piezas de texto de un párrafo, en orden: o un `<w:t>` con su
// contenido, o un separador (`<w:tab/>`, `<w:br/>`, `<w:cr/>`) que vale por
// un espacio. Van en un solo patrón alternado justamente para conservar el
// orden en que aparecen; recorrerlos por separado revolvería el texto.
const DOCX_RE_PIECE = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(?:tab|br|cr)(?:\s[^>]*)?\/?>/g;

// Una sola pasada, no cinco reemplazos encadenados: decodificar `&amp;`
// antes que los demás convertiría el literal `&amp;lt;` en `<`.
const DOCX_RE_ENTITY = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|(amp|lt|gt|quot|apos));/g;
const DOCX_NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function docxDecodeEntities(s) {
  return s.replace(DOCX_RE_ENTITY, (_, dec, hex, nombre) => {
    if (nombre) return DOCX_NAMED_ENTITIES[nombre];
    const code = Number.parseInt(dec ?? hex, dec ? 10 : 16);
    return Number.isFinite(code) ? String.fromCodePoint(code) : '';
  });
}

function docxCollapse(s) {
  return s.replace(/\s+/g, ' ').trim();
}

function docxStripProps(xml) {
  return xml.replace(DOCX_RE_PROPS, '');
}

// El texto de UN párrafo. Los runs se pegan sin separador a propósito: Word
// parte una palabra en varios `<w:r>` en cuanto cambia el formato de una
// letra, así que meter un espacio entre runs partiría "MAMMOGRAPHY" en dos.
function docxRunsText(xml) {
  let out = '';
  for (const m of xml.matchAll(DOCX_RE_PIECE)) {
    out += m[1] === undefined ? ' ' : docxDecodeEntities(m[1]);
  }
  return out;
}

// El texto de un contenedor con varios párrafos (una celda, típicamente).
// Los párrafos SÍ se separan con un espacio: son frases distintas y pegarlas
// uniría "DEXA" con "(BONE DENSITY SCAN)".
function docxTextOf(xml) {
  const limpio = docxStripProps(xml);
  const parrafos = [];
  for (const m of limpio.matchAll(DOCX_RE_P)) {
    const t = docxCollapse(docxRunsText(m[1] ?? ''));
    if (t !== '') parrafos.push(t);
  }
  // Sin `<w:p>` no hay nada que separar: se lee el contenedor directo. Pasa
  // con las celdas realmente vacías, que traen solo su `<w:tcPr>`.
  if (parrafos.length === 0) return docxCollapse(docxRunsText(limpio));
  return parrafos.join(' ');
}

/**
 * Las filas de todas las tablas del documento, en orden, como texto.
 * Devuelve una fila por `<w:tr>` y una cadena por `<w:tc>` — sin rellenar
 * ni recortar: las filas reales traen 1, 2 o 3 celdas y esa diferencia es
 * información que el intérprete usa.
 */
export function docxTableRows(xml) {
  if (typeof xml !== 'string') return [];
  const filas = [];
  for (const fila of xml.matchAll(DOCX_RE_TR)) {
    filas.push([...fila[1].matchAll(DOCX_RE_TC)].map((celda) => docxTextOf(celda[1])));
  }
  return filas;
}

/**
 * Los párrafos que NO están dentro de una tabla: el encabezado del
 * itinerario, de donde salen el nombre del paciente y las fechas.
 * Uno por párrafo y sin los vacíos. Se devuelven separados, no pegados en
 * una sola cadena, porque las etiquetas ("Patient:", "Scheduled Date:")
 * llegan en párrafos distintos y unirlas obligaría a adivinar dónde termina
 * cada valor.
 */
export function docxParagraphsOutsideTables(xml) {
  if (typeof xml !== 'string') return [];
  const fuera = docxStripProps(xml.replace(DOCX_RE_TBL, ''));
  const parrafos = [];
  for (const m of fuera.matchAll(DOCX_RE_P)) {
    const t = docxCollapse(docxRunsText(m[1] ?? ''));
    if (t !== '') parrafos.push(t);
  }
  return parrafos;
}
