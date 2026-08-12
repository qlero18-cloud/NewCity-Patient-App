// Constructor de .docx sintéticos para las pruebas (D88 — los cinco
// itinerarios reales NO entran al repositorio; todo lo que se prueba aquí usa
// datos inventados que reproducen las variaciones catalogadas de los reales).
//
// Vive en helpers/ y no dentro de una prueba porque lo usan dos: la de
// docxFile.js, que ejercita el lector de ZIP con archivos deliberadamente
// rotos, y el recorrido e2e, que necesita un documento bien formado para
// cruzar el sistema entero.
//
// Es un ZIP escrito a mano, byte por byte, a propósito: usar una biblioteca
// para generarlo probaría que esa biblioteca y el lector se entienden entre
// sí, no que el lector entiende lo que produce Word.

import { deflateRawSync, crc32 } from 'node:zlib';

const UTF8 = new TextEncoder();

export function u16(n) {
  return [n & 0xff, (n >>> 8) & 0xff];
}

export function u32(n) {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

export function pegar(trozos) {
  const total = trozos.reduce((n, t) => n + t.length, 0);
  const out = new Uint8Array(total);
  let i = 0;
  for (const t of trozos) {
    out.set(t, i);
    i += t.length;
  }
  return out;
}

// Arma un ZIP real a partir de `[{ name, content, method, compress,
// extraLocal }]`. `method` es lo que se ESCRIBE en las dos cabeceras (8
// deflate por omisión, 0 guardado, cualquier otro para probar el rechazo);
// `compress` es lo que de verdad se hace con los bytes. Separarlos permite
// declarar deflate y guardar basura, que es como se ve un archivo corrupto.
export function zipBytes(entradas, { comment = '' } = {}) {
  const datos = [];
  const centrales = [];
  let offset = 0;

  for (const e of entradas) {
    const nombre = UTF8.encode(e.name);
    const crudo = UTF8.encode(e.content ?? '');
    const metodo = e.method ?? 8;
    const comprimir = e.compress ?? metodo === 8;
    const cuerpo = comprimir ? new Uint8Array(deflateRawSync(crudo)) : crudo;
    const extraLocal = e.extraLocal ?? new Uint8Array(0);
    const suma = crc32(crudo);

    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(metodo),
      ...u16(0), ...u16(0), ...u32(suma),
      ...u32(cuerpo.length), ...u32(crudo.length),
      ...u16(nombre.length), ...u16(extraLocal.length),
    ]);
    datos.push(local, nombre, extraLocal, cuerpo);

    // `extra length` en cero aquí a propósito, aunque la local traiga bytes:
    // es la trampa 1 de la cabecera de este archivo.
    centrales.push(new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(metodo),
      ...u16(0), ...u16(0), ...u32(suma),
      ...u32(cuerpo.length), ...u32(crudo.length),
      ...u16(nombre.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
    ]), nombre);

    offset += local.length + nombre.length + extraLocal.length + cuerpo.length;
  }

  const directorio = pegar(centrales);
  const nota = UTF8.encode(comment);
  const eocd = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(entradas.length), ...u16(entradas.length),
    ...u32(directorio.length), ...u32(offset),
    ...u16(nota.length),
  ]);

  return pegar([...datos, directorio, eocd, nota]);
}

export function documento(cuerpo) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`
    + `<w:body>${cuerpo}</w:body></w:document>`;
}

export function parrafo(texto) {
  return `<w:p><w:r><w:t>${texto}</w:t></w:r></w:p>`;
}

export function tabla(filas) {
  const tr = filas.map((celdas) => {
    const tc = celdas.map((c) => `<w:tc><w:tcPr><w:tcW w:w="2000"/></w:tcPr>${parrafo(c)}</w:tc>`).join('');
    return `<w:tr>${tc}</w:tr>`;
  }).join('');
  return `<w:tbl>${tr}</w:tbl>`;
}

// Un .docx de verdad trae varias entradas y `word/document.xml` NO es la
// primera: si el lector se queda con la primera, esto lo dice.
export function docxDe(xml, extra = {}) {
  return zipBytes([
    { name: '[Content_Types].xml', content: '<Types/>' },
    { name: '_rels/.rels', content: '<Relationships/>' },
    { name: 'word/document.xml', content: xml, ...extra },
    { name: 'word/styles.xml', content: '<w:styles/>' },
  ]);
}

// Doble de File: lo que el <input type="file"> le entrega a la pantalla.
export function archivo(bytes, { name = 'itinerario.docx', type = '' } = {}) {
  return {
    name,
    type,
    size: bytes.length,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}
