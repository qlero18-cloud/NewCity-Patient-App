// Etapa I — De word/document.xml a filas y celdas de texto.
//
// Este módulo es puro y por eso se prueba entero aquí (D8: nada de DOM falso
// en node:test). Descomprimir el .docx es otro archivo — src/ui/docxFile.js —
// justamente para que ESTA parte, que es donde está la lógica delicada, se
// pueda probar sin navegador (INV-2).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { docxTableRows, docxParagraphsOutsideTables } from '../../src/domain/docxTable.js';

// Ayuda para escribir los casos sin ahogarse en XML. Devuelve un
// word/document.xml mínimo pero con la forma real que produce Word.
function doc(inner) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${inner}</w:body></w:document>`;
}

function celda(...parrafos) {
  const ps = parrafos.map((runs) => `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${runs}</w:p>`).join('');
  return `<w:tc><w:tcPr><w:tcW w:w="1188" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="auto"/></w:tcPr>${ps}</w:tc>`;
}

function run(texto) {
  return `<w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t>${texto}</w:t></w:r>`;
}

function fila(...celdas) {
  return `<w:tr w:rsidR="00A1B2C3"><w:trPr><w:trHeight w:val="397"/></w:trPr>${celdas.join('')}</w:tr>`;
}

function tabla(...filas) {
  return `<w:tbl><w:tblPr><w:tblW w:w="9159" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="1188"/></w:tblGrid>${filas.join('')}</w:tbl>`;
}

describe('docxTableRows — XML de Word a filas de celdas', () => {
  test('una tabla de dos filas por tres columnas sale como dos arreglos de tres cadenas', () => {
    const xml = doc(tabla(
      fila(celda(run('TIME')), celda(run('BLOOD SAMPLE AND TESTS')), celda(run('INSTRUCTIONS'))),
      fila(celda(run('8:00AM')), celda(run('BLOOD WORK')), celda(run('FASTING 8-12 HOURS'))),
    ));

    assert.deepStrictEqual(docxTableRows(xml), [
      ['TIME', 'BLOOD SAMPLE AND TESTS', 'INSTRUCTIONS'],
      ['8:00AM', 'BLOOD WORK', 'FASTING 8-12 HOURS'],
    ]);
  });

  // EL caso que motiva este módulo. `<w:t[^>]*>` — que es lo que uno escribe
  // sin pensar — también casa con `<w:tcPr>`, `<w:tblPr>` y `<w:tblGrid>`,
  // porque "w:t" es prefijo de todos ellos. El resultado no es un error: son
  // celdas que contienen XML crudo, que se ve como dato válido y se guardaría
  // tal cual en el expediente del paciente. Me pasó extrayendo los
  // documentos reales, así que queda clavado con una prueba.
  test('las propiedades de celda y de tabla NO se cuelan como texto (la trampa de <w:tcPr> contra <w:t>)', () => {
    const xml = doc(tabla(fila(celda(run('8:15AM')), celda(run('CHEST X-RAY')))));
    const filas = docxTableRows(xml);

    assert.deepStrictEqual(filas, [['8:15AM', 'CHEST X-RAY']]);
    const todo = filas.flat().join(' ');
    assert.ok(!todo.includes('<'), `se coló XML crudo en el texto: ${JSON.stringify(todo)}`);
    assert.ok(!todo.includes('dxa'), `se colaron atributos de tcPr en el texto: ${JSON.stringify(todo)}`);
    assert.ok(!todo.includes('tcW'), `se coló tcW en el texto: ${JSON.stringify(todo)}`);
  });

  test('respeta filas de 1, 2 y 3 celdas sin rellenar ni recortar', () => {
    // Real: el itinerario de Alexandra trae "11:30AM | LUNCH BREAK" con dos
    // celdas, y las filas de nombre de paquete traen una sola. Un intérprete
    // que asuma tres columnas se rompe con los documentos de verdad.
    const xml = doc(tabla(
      fila(celda(run('WOMEN EXTENDED CHECK-UP'))),
      fila(celda(run('11:30AM')), celda(run('LUNCH BREAK'))),
      fila(celda(run('8:15AM')), celda(run('CHEST X-RAY')), celda(run('COMPASS'))),
    ));

    assert.deepStrictEqual(docxTableRows(xml), [
      ['WOMEN EXTENDED CHECK-UP'],
      ['11:30AM', 'LUNCH BREAK'],
      ['8:15AM', 'CHEST X-RAY', 'COMPASS'],
    ]);
  });

  test('una celda sin texto sale como cadena vacía, no como undefined ni desaparece', () => {
    // La celda de hora vacía es el marcador de "sigue la cita anterior", así
    // que perderla cambiaría el significado del documento.
    const xml = doc(tabla(
      fila(celda(), celda(run('TUMOR MARKERS')), celda()),
      fila(celda(run('')), celda(run('PAP SMEAR')), celda()),
    ));

    assert.deepStrictEqual(docxTableRows(xml), [
      ['', 'TUMOR MARKERS', ''],
      ['', 'PAP SMEAR', ''],
    ]);
  });

  test('una fila entera vacía se conserva como fila de celdas vacías', () => {
    // Los documentos reales traen filas vacías sueltas al final y en medio.
    // Se conservan aquí y las descarta el intérprete: este módulo transcribe,
    // no interpreta.
    const xml = doc(tabla(
      fila(celda(run('5:00PM')), celda(run('OPHTHALMOLOGY CONSULTATION'))),
      fila(celda(), celda(), celda()),
    ));

    assert.deepStrictEqual(docxTableRows(xml), [
      ['5:00PM', 'OPHTHALMOLOGY CONSULTATION'],
      ['', '', ''],
    ]);
  });

  test('varios runs de la misma palabra se pegan sin espacio; varios párrafos se separan con uno', () => {
    // Word parte una palabra en varios <w:r> en cuanto cambia el formato (una
    // letra en negrita basta). Pegar los runs con espacio partiría palabras;
    // pegar los párrafos sin espacio uniría frases.
    const xml = doc(tabla(fila(
      celda(`${run('MAMMO')}${run('GRAPHY')}`),
      celda(run('DEXA'), run('(BONE DENSITY SCAN)')),
    )));

    assert.deepStrictEqual(docxTableRows(xml), [['MAMMOGRAPHY', 'DEXA (BONE DENSITY SCAN)']]);
  });

  test('decodifica las entidades XML y normaliza espacios, tabuladores y saltos', () => {
    const xml = doc(tabla(fila(
      celda(run('PELVIC &amp; BREAST   ULTRASOUND')),
      celda(`<w:r><w:t>AUDIOMETRY</w:t><w:tab/><w:t>+</w:t><w:br/><w:t>SPIROMETRY</w:t></w:r>`),
      celda(run('  DR. ORTEGA  ')),
    )));

    assert.deepStrictEqual(docxTableRows(xml), [
      ['PELVIC & BREAST ULTRASOUND', 'AUDIOMETRY + SPIROMETRY', 'DR. ORTEGA'],
    ]);
  });

  test('conserva el orden de las tablas y concatena las filas de todas', () => {
    // Los itinerarios de dos días traen una tabla por día en algunos
    // documentos y una sola tabla con fila de día en otros.
    const xml = doc(
      tabla(fila(celda(run('THURSDAY, JULY 30')))) +
      tabla(fila(celda(run('FRIDAY, JULY 31')))),
    );

    assert.deepStrictEqual(docxTableRows(xml), [['THURSDAY, JULY 30'], ['FRIDAY, JULY 31']]);
  });

  test('un documento sin tablas devuelve un arreglo vacío, no lanza excepción', () => {
    assert.deepStrictEqual(docxTableRows(doc('<w:p><w:r><w:t>Sin tablas aquí</w:t></w:r></w:p>')), []);
    assert.deepStrictEqual(docxTableRows(doc('')), []);
    assert.deepStrictEqual(docxTableRows(''), []);
  });

  test('una entrada que no es cadena devuelve arreglo vacío en vez de reventar', () => {
    for (const basura of [null, undefined, 42, {}, []]) {
      assert.deepStrictEqual(docxTableRows(basura), [], `no debería lanzar con ${JSON.stringify(basura)}`);
    }
  });
});

describe('docxParagraphsOutsideTables — el encabezado, que vive fuera de la tabla', () => {
  test('devuelve los párrafos de fuera de la tabla y ninguno de dentro', () => {
    const xml = doc(
      '<w:p><w:r><w:t>FEMALE EXTENDED CHECK-UP</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Scheduled Date: July 30 – 31, 2026 – 7:30 AM.</w:t></w:r></w:p>' +
      tabla(fila(celda(run('8:00AM')), celda(run('BLOOD WORK')))) +
      '<w:p><w:r><w:t>Case Manager: Beatriz Ramírez</w:t></w:r></w:p>',
    );

    assert.deepStrictEqual(docxParagraphsOutsideTables(xml), [
      'FEMALE EXTENDED CHECK-UP',
      'Scheduled Date: July 30 – 31, 2026 – 7:30 AM.',
      'Case Manager: Beatriz Ramírez',
    ]);
  });

  test('cada párrafo va por separado aunque Word haya partido la línea en varios runs', () => {
    // En los documentos reales "Patient: …DOB: …Phone Number: …" sale pegado
    // porque son runs del mismo párrafo. Separar por párrafo es lo que le
    // permite al intérprete encontrar cada etiqueta; pegar todo en una sola
    // cadena obligaría a adivinar dónde termina el nombre.
    const xml = doc(
      `<w:p>${run('Patient: Margarita Gonzalez ')}${run('DOB: August 2, 1974')}</w:p>` +
      `<w:p>${run('Phone Number: +1 (916) 555-0123')}</w:p>`,
    );

    assert.deepStrictEqual(docxParagraphsOutsideTables(xml), [
      'Patient: Margarita Gonzalez DOB: August 2, 1974',
      'Phone Number: +1 (916) 555-0123',
    ]);
  });

  test('descarta los párrafos vacíos, que Word siembra por todos lados', () => {
    const xml = doc(
      '<w:p><w:r><w:t>MALE EXTENDED CHECK-UP</w:t></w:r></w:p>' +
      '<w:p/><w:p><w:pPr><w:jc w:val="center"/></w:pPr></w:p>' +
      '<w:p><w:r><w:t>   </w:t></w:r></w:p>',
    );

    assert.deepStrictEqual(docxParagraphsOutsideTables(xml), ['MALE EXTENDED CHECK-UP']);
  });

  test('sin párrafos fuera de tabla devuelve arreglo vacío', () => {
    const xml = doc(tabla(fila(celda(run('8:00AM')))));
    assert.deepStrictEqual(docxParagraphsOutsideTables(xml), []);
    assert.deepStrictEqual(docxParagraphsOutsideTables(null), []);
  });
});
