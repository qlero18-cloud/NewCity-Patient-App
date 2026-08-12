// Etapa I — el lector del archivo .docx, la única pieza de la importación
// que toca bytes en vez de texto.
//
// Un .docx es un ZIP. Aquí no se usa ninguna librería: se recorre el
// directorio central del ZIP y se infla `word/document.xml` con
// DecompressionStream('deflate-raw'), que existe igual en el navegador y en
// Node. Por eso esto se prueba de verdad, sin DOM y sin fixture binaria.
//
// D88 — NINGÚN documento real entra al repositorio. Cada ZIP de esta prueba
// se arma aquí mismo, byte por byte, con datos inventados. `zipBytes` no es
// una comodidad: es la condición para poder probar el lector sin versionar
// el expediente de un paciente.
//
// Las trampas que se fijan abajo son las que rompen a un lector de ZIP
// escrito de memoria:
//
//   1. La longitud de `extra` de la cabecera LOCAL no tiene por qué ser la
//      de la central. Word manda las dos distintas. Un lector que use la
//      central para calcular dónde empiezan los datos lee basura.
//   2. El EOCD no siempre está en los últimos 22 bytes: puede traer
//      comentario detrás. Hay que buscarlo hacia atrás, no asumirlo.
//   3. Una entrada puede venir guardada sin comprimir (método 0).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readDocxDocumentXml, validateDocxFile, DOCX_MAX_BYTES } from '../../src/ui/docxFile.js';
import { docxTableRows } from '../../src/domain/docxTable.js';

// El constructor de .docx sintéticos vive en helpers/docx.js: lo comparte el
// recorrido e2e, que necesita un documento bien formado para cruzar el
// sistema entero (D88).
import { u16, u32, pegar, zipBytes, documento, parrafo, tabla, docxDe, archivo } from '../helpers/docx.js';

describe('readDocxDocumentXml — el ZIP', () => {
  test('devuelve word/document.xml aunque no sea la primera entrada', async () => {
    const xml = documento(parrafo('CHECK-UP ITINERARY WOMEN EXTENDED'));
    const res = await readDocxDocumentXml(archivo(docxDe(xml)));

    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.xml, xml);
  });

  test('acepta también un ArrayBuffer y un Uint8Array, no solo un File', async () => {
    const xml = documento(parrafo('HOLA'));
    const bytes = docxDe(xml);

    const desdeBuffer = await readDocxDocumentXml(bytes.buffer.slice(0));
    const desdeArreglo = await readDocxDocumentXml(bytes);

    assert.strictEqual(desdeBuffer.xml, xml);
    assert.strictEqual(desdeArreglo.xml, xml);
  });

  test('lee una entrada guardada sin comprimir (método 0)', async () => {
    const xml = documento(parrafo('SIN COMPRIMIR'));
    const res = await readDocxDocumentXml(archivo(docxDe(xml, { method: 0 })));

    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.xml, xml);
  });

  // Trampa 1. El offset de los datos se calcula con la cabecera LOCAL: sus
  // longitudes de nombre y de extra son las suyas, no las de la central.
  test('la cabecera local puede traer un extra que la central no declara', async () => {
    const xml = documento(parrafo('CON EXTRA LOCAL'));
    const extraLocal = new Uint8Array([0x55, 0x54, 0x05, 0x00, 0x03, 0xd2, 0x04, 0x00, 0x00]);
    const res = await readDocxDocumentXml(archivo(docxDe(xml, { extraLocal })));

    assert.strictEqual(res.ok, true, 'un lector que use el extra de la central lee basura aquí');
    assert.strictEqual(res.xml, xml);
  });

  // Trampa 2. El EOCD admite comentario detrás; hay que buscarlo hacia atrás.
  test('encuentra el fin del directorio aunque el ZIP traiga comentario al final', async () => {
    const xml = documento(parrafo('CON COMENTARIO'));
    const bytes = zipBytes(
      [{ name: 'word/document.xml', content: xml }],
      { comment: 'creado por una prueba, con datos inventados' },
    );

    const res = await readDocxDocumentXml(archivo(bytes));
    assert.strictEqual(res.xml, xml);
  });

  test('respeta UTF-8: los acentos no se parten en bytes sueltos', async () => {
    const xml = documento(parrafo('MAMOGRAFÍA · ULTRASONIDO DE TIROIDES · Ñ'));
    const res = await readDocxDocumentXml(archivo(docxDe(xml)));

    assert.ok(res.xml.includes('MAMOGRAFÍA'));
    assert.ok(res.xml.includes('Ñ'));
  });
});

describe('readDocxDocumentXml — lo que NO se puede leer se dice, no se adivina', () => {
  test('un archivo que no es ZIP contesta notZip', async () => {
    const res = await readDocxDocumentXml(archivo(new TextEncoder().encode('%PDF-1.7\n%âãÏÓ\n')));

    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, 'notZip');
  });

  test('un archivo vacío contesta notZip, no truena', async () => {
    const res = await readDocxDocumentXml(archivo(new Uint8Array(0)));

    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, 'notZip');
  });

  test('un ZIP sin word/document.xml contesta noDocument', async () => {
    const bytes = zipBytes([
      { name: '[Content_Types].xml', content: '<Types/>' },
      // Parecido pero no es: no debe colar por prefijo.
      { name: 'word/document2.xml', content: documento('') },
    ]);
    const res = await readDocxDocumentXml(archivo(bytes));

    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, 'noDocument');
  });

  test('un método de compresión que no sabemos inflar se reporta, no se entrega vacío', async () => {
    const bytes = zipBytes([{ name: 'word/document.xml', content: documento(''), method: 12 }]);
    const res = await readDocxDocumentXml(archivo(bytes));

    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, 'unsupportedCompression');
  });

  test('datos corruptos dentro de una entrada deflate contestan unreadable', async () => {
    // Declarado deflate, guardado en crudo: los bytes no son un flujo
    // deflate válido, así que inflarlos tiene que fallar y decirlo.
    const bytes = zipBytes([
      { name: 'word/document.xml', content: 'esto no es un flujo deflate', method: 8, compress: false },
    ]);
    const res = await readDocxDocumentXml(archivo(bytes));

    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, 'unreadable');
  });
});

describe('readDocxDocumentXml + docxTableRows — las dos mitades encajan', () => {
  test('del archivo salen las celdas que espera el intérprete', async () => {
    const xml = documento(
      parrafo('CHECK-UP ITINERARY WOMEN EXTENDED')
      + tabla([
        ['TIME', 'BLOOD SAMPLE AND TESTS', 'INSTRUCTIONS'],
        ['7:30AM', 'BLOOD WORK', 'FASTING 8-12 HOURS'],
      ]),
    );

    const res = await readDocxDocumentXml(archivo(docxDe(xml)));
    assert.strictEqual(res.ok, true);

    assert.deepStrictEqual(docxTableRows(res.xml), [
      ['TIME', 'BLOOD SAMPLE AND TESTS', 'INSTRUCTIONS'],
      ['7:30AM', 'BLOOD WORK', 'FASTING 8-12 HOURS'],
    ]);
  });
});

describe('validateDocxFile — antes de leer un solo byte', () => {
  test('sin archivo: missing', () => {
    assert.deepStrictEqual(validateDocxFile(null), { ok: false, reason: 'missing' });
    assert.deepStrictEqual(validateDocxFile(undefined), { ok: false, reason: 'missing' });
  });

  test('un .docx pasa, sin importar que el navegador no mande type', () => {
    assert.deepStrictEqual(validateDocxFile({ name: 'ITINERARIO.DOCX', type: '', size: 42000 }), { ok: true });
    assert.deepStrictEqual(validateDocxFile({ name: 'a.docx', type: '', size: 1 }), { ok: true });
  });

  test('un PDF se rechaza por tipo: la Etapa I es solo .docx (D87)', () => {
    assert.deepStrictEqual(
      validateDocxFile({ name: 'Check-Up.pdf', type: 'application/pdf', size: 42000 }),
      { ok: false, reason: 'type' },
    );
  });

  test('un .doc viejo también se rechaza: no es el mismo formato', () => {
    assert.strictEqual(validateDocxFile({ name: 'viejo.doc', type: '', size: 10 }).reason, 'type');
  });

  test('un archivo enorme se rechaza antes de cargarlo en memoria', () => {
    assert.deepStrictEqual(
      validateDocxFile({ name: 'a.docx', type: '', size: DOCX_MAX_BYTES + 1 }),
      { ok: false, reason: 'size' },
    );
    assert.strictEqual(validateDocxFile({ name: 'a.docx', type: '', size: DOCX_MAX_BYTES }).ok, true);
  });
});
