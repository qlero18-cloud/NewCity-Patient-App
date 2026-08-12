// Etapa I — El intérprete del itinerario: de filas de tabla a citas propuestas.
//
// Cada caso de aquí sale de una variación REAL de los cuatro documentos que
// escriben las coordinadoras. Los datos son inventados (D88: los expedientes
// reales no entran al repositorio), pero la FORMA es copia fiel: los cuatro
// formatos de "Scheduled Date:", las tres redacciones de duración, la celda
// de hora vacía, las filas de dos celdas, el `12:30AM` imposible, `22TH
// FLOOR`, y cada typo del diccionario.
//
// El intérprete PROPONE; la coordinadora dispone (D84). Por eso casi ninguna
// prueba de aquí exige una cita perfecta: exigen que lo dudoso quede
// MARCADO. Un dato que el intérprete se inventa en silencio es peor que uno
// que deja en blanco, porque el segundo se ve en la pantalla de revisión y
// el primero llega al paciente.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseItinerary } from '../../src/domain/itineraryParse.js';
import { locations } from '../../src/data/locations.js';

// El encabezado completo de los documentos reales, con datos inventados. Se
// reproduce entero —y no solo las dos líneas útiles— porque el intérprete
// tiene que saber ignorar las otras nueve.
function encabezado(paciente, fechas, paquete = 'FEMALE EXTENDED CHECK-UP') {
  return [
    `CHECK-UP ITINERARY ${paquete}`,
    `Scheduled Date: ${fechas}`,
    `Patient: ${paciente} DOB: August 2, 1974 Phone Number: +1 (555) 010-0101 E-mail:`,
    'Case Manager (Coordination and Logistics): Beatriz Ramírez — (663 111 5360) ARRIVAL INSTRUCTIONS',
    'A) Contact your coordinator or:',
    'B) Follow these steps:',
    '1. Upon reaching the terrace, walk 20 meters to the right.',
    '2. There you will find a glass door for COMPASS IMAGING & LAB C) For any questions, contact: 663 111 5360',
    'INSTRUCTIONS PRIOR TO YOUR LABORATORY AND IMAGING STUDIES:',
    '*For blood sample collection, fasting of 8 to 12 hours is required. *Times are estimated.',
  ];
}

const CABECERA_COLUMNAS = ['TIME', 'BLOOD SAMPLE AND TESTS', 'INSTRUCTIONS'];

function leer(rows, headings) {
  return parseItinerary({ rows, headings, locations });
}

// Solo las filas que se van a importar como cita.
function citas(r) {
  return r.rows.filter((f) => f.kind === 'appointment');
}

function cita(r, serviceName) {
  return citas(r).find((f) => f.serviceName === serviceName);
}

function codigos(fila) {
  return fila.notes.map((n) => n.code);
}

describe('parseItinerary — encabezado del documento', () => {
  test('saca el nombre del paciente y NO se lo traga con la fecha de nacimiento', () => {
    const r = leer([], encabezado('Margarita Gonzalez', 'July 30 – 31, 2026 – 7:30 AM.'));
    assert.strictEqual(r.patientName, 'Margarita Gonzalez');
  });

  test('un nombre con apellido compuesto y acento llega completo', () => {
    const r = leer([], encabezado('Manuel Soriano Guzmán', 'AUGUST 4 – 5, 2026 – 7:30 AM.'));
    assert.strictEqual(r.patientName, 'Manuel Soriano Guzmán');
  });

  test('reporta qué datos personales se DESCARTAN, para poder avisarlo en pantalla', () => {
    // D61 decidió no guardar el teléfono del paciente. El documento lo trae
    // igual, junto con fecha de nacimiento y correo. Se descartan a
    // propósito y la revisión tiene que poder decirlo, no callarlo.
    const r = leer([], encabezado('Margarita Gonzalez', 'July 30 – 31, 2026 – 7:30 AM.'));
    assert.deepStrictEqual(r.discarded.sort(), ['dob', 'email', 'phone']);
  });

  test('sin encabezado no revienta: devuelve nombre vacío y ninguna fecha', () => {
    const r = leer([], []);
    assert.strictEqual(r.patientName, '');
    assert.deepStrictEqual(r.days, []);
  });
});

describe('parseItinerary — los cuatro formatos de fecha, y el año que solo vive en el encabezado', () => {
  // El año NO aparece en ninguna fila de la tabla: las filas de día dicen
  // "THRUSDAY , JULY 30" y nada más. Si el intérprete no lo saca de
  // "Scheduled Date:", el único otro sitio de donde podría sacarlo es el
  // reloj del sistema — y eso es exactamente lo que INV-1 prohíbe.
  const casos = [
    ['rango con guion largo (Margarita)', 'July 30 – 31, 2026 – 7:30 AM.', ['2026-07-30', '2026-07-31']],
    ['rango con ordinales (Alexandra)', 'July 27th – 28th, 2026 – 7:30 AM.', ['2026-07-27', '2026-07-28']],
    ['rango en mayúsculas (Manuel)', 'AUGUST 4 – 5, 2026 – 7:30 AM.', ['2026-08-04', '2026-08-05']],
    ['un solo día con día de la semana (Amy)', 'Thursday August 20th, 2026 – 7:30 AM.', ['2026-08-20']],
  ];

  for (const [nombre, texto, esperado] of casos) {
    test(`${nombre}: ${texto}`, () => {
      const r = leer([], encabezado('Paciente Prueba', texto));
      assert.deepStrictEqual(r.days, esperado);
    });
  }

  test('un rango que cruza de mes se expande con los dos meses', () => {
    const r = leer([], encabezado('Paciente Prueba', 'July 31 – August 1, 2026 – 7:30 AM.'));
    assert.deepStrictEqual(r.days, ['2026-07-31', '2026-08-01']);
  });

  test('un rango que cruza de año le suma uno al año del cierre', () => {
    const r = leer([], encabezado('Paciente Prueba', 'December 31 – January 1, 2026 – 7:30 AM.'));
    assert.deepStrictEqual(r.days, ['2026-12-31', '2027-01-01']);
  });

  test('un rango absurdamente largo no se expande a cientos de días: se queda con el inicio y lo marca', () => {
    const r = leer([], encabezado('Paciente Prueba', 'January 1 – December 31, 2026 – 7:30 AM.'));
    assert.deepStrictEqual(r.days, ['2026-01-01']);
    assert.ok(r.warnings.some((w) => w.code === 'dateRangeTooLong'), `avisos: ${JSON.stringify(r.warnings)}`);
  });

  test('sin "Scheduled Date:" no se inventa un año: las citas quedan sin fecha y marcadas', () => {
    const rows = [
      ['THURSDAY , JULY 30'],
      CABECERA_COLUMNAS,
      ['8:00AM', 'BLOOD WORK', 'COMPASS'],
    ];
    const r = leer(rows, ['CHECK-UP ITINERARY', 'Patient: Sin Fecha']);
    assert.deepStrictEqual(r.days, []);
    const c = cita(r, 'BLOOD WORK');
    assert.strictEqual(c.startsAt, null);
    assert.ok(codigos(c).includes('noDate'), `notas: ${JSON.stringify(c.notes)}`);
  });
});

describe('parseItinerary — filas de día, y el documento que no las tiene', () => {
  test('cada bloque de día manda a sus citas al día que le toca', () => {
    const rows = [
      ['WOMEN EXTENDED CHECK-UP'],
      ['THRUSDAY , JULY 30'],
      CABECERA_COLUMNAS,
      ['8:00AM', 'CHEST X-RAY', 'COMPASS'],
      ['WOMEN EXTENDED CHECK-UP'],
      ['FRIDAY , JULY 31'],
      ['TIME', 'CONSULTATIONS', 'INSTRUCTIONS'],
      ['11:30AM', 'DERMATOLOGY CONSULTATION', '10TH FLOOR'],
    ];
    const r = leer(rows, encabezado('Margarita Gonzalez', 'July 30 – 31, 2026 – 7:30 AM.'));

    assert.strictEqual(cita(r, 'CHEST X-RAY').startsAt, '2026-07-30T08:00-07:00');
    assert.strictEqual(cita(r, 'DERMATOLOGY CONSULTATION').startsAt, '2026-07-31T11:30-07:00');
  });

  test('las tres redacciones de fila de día se reconocen igual, con y sin espacio antes de la coma', () => {
    for (const filaDia of ['THURSDAY , JULY 30', 'THURSDAY, JULY 30', 'THURSDAY , JULY 30TH']) {
      const r = leer(
        [filaDia, CABECERA_COLUMNAS, ['8:00AM', 'CHEST X-RAY', 'COMPASS']],
        encabezado('Paciente Prueba', 'July 30 – 31, 2026 – 7:30 AM.'),
      );
      assert.strictEqual(cita(r, 'CHEST X-RAY').startsAt, '2026-07-30T08:00-07:00', `falló con ${JSON.stringify(filaDia)}`);
    }
  });

  test('sin ninguna fila de día, todo cae en el único día del encabezado (el caso de Amy)', () => {
    const rows = [
      [''],
      ['', '', ''],
      ['FEMALE ESSENTIAL CHECK-UP'],
      ['', '', ''],
      ['Scheduled Date: Thursday August 20th, 2026 – 7:30 AM.'],
      CABECERA_COLUMNAS,
      ['7:30AM', 'BLOOD WORK', 'FASTING 8-12 HOURS'],
      ['8:15AM', 'CHEST X-RAY', 'COMPASS'],
    ];
    const r = leer(rows, encabezado('Kusonah Fohtung', 'Thursday August 20th, 2026 – 7:30 AM.', 'FEMALE ESSENTIAL CHECK-UP'));

    assert.strictEqual(citas(r).length, 2);
    assert.strictEqual(cita(r, 'BLOOD WORK').startsAt, '2026-08-20T07:30-07:00');
    assert.strictEqual(cita(r, 'CHEST X-RAY').startsAt, '2026-08-20T08:15-07:00');
  });

  test('la fila que repite "Scheduled Date:" dentro de la tabla no se toma por una cita', () => {
    // Amy la trae como fila de una sola celda en medio de la tabla.
    const rows = [
      ['Scheduled Date: Thursday August 20th, 2026 – 7:30 AM.'],
      CABECERA_COLUMNAS,
      ['7:30AM', 'BLOOD WORK', 'FASTING 8-12 HOURS'],
    ];
    const r = leer(rows, encabezado('Kusonah Fohtung', 'Thursday August 20th, 2026 – 7:30 AM.'));
    assert.strictEqual(citas(r).length, 1);
  });

  test('una fila de día que contradice al encabezado se usa igual, pero queda marcada', () => {
    const rows = [['MONDAY , SEPTEMBER 14'], CABECERA_COLUMNAS, ['8:00AM', 'CHEST X-RAY', 'COMPASS']];
    const r = leer(rows, encabezado('Paciente Prueba', 'July 30 – 31, 2026 – 7:30 AM.'));

    assert.strictEqual(cita(r, 'CHEST X-RAY').startsAt, '2026-09-14T08:00-07:00');
    assert.ok(r.warnings.some((w) => w.code === 'dayNotInHeader'), `avisos: ${JSON.stringify(r.warnings)}`);
  });
});

describe('parseItinerary — filas que NO son citas', () => {
  test('las filas vacías y las de cabecera de columna se ignoran sin contarse como citas', () => {
    const rows = [
      ['WOMEN EXTENDED CHECK-UP'],
      ['THRUSDAY , JULY 30'],
      ['', '', ''],
      CABECERA_COLUMNAS,
      ['8:00AM', 'CHEST X-RAY', 'COMPASS'],
      ['', '', ''],
      [''],
    ];
    const r = leer(rows, encabezado('Paciente Prueba', 'July 30 – 31, 2026 – 7:30 AM.'));

    assert.strictEqual(citas(r).length, 1);
    assert.strictEqual(r.rows.length, rows.length, 'toda fila leída debe aparecer en la salida, aunque sea ignorada');
  });

  test('devuelve una entrada por cada fila del documento, con su índice original', () => {
    // La pantalla de revisión enseña el documento completo. Una fila que
    // desaparece del resultado es una fila que la coordinadora no puede
    // revisar, y no hay forma de que note la ausencia.
    const rows = [['THURSDAY , JULY 30'], CABECERA_COLUMNAS, ['8:00AM', 'CHEST X-RAY', 'COMPASS']];
    const r = leer(rows, encabezado('Paciente Prueba', 'July 30 – 31, 2026 – 7:30 AM.'));

    assert.deepStrictEqual(r.rows.map((f) => f.index), [0, 1, 2]);
    assert.deepStrictEqual(r.rows.map((f) => f.raw), rows);
  });

  test('las comidas se leen y se muestran, pero NO se importan', () => {
    const rows = [
      ['THURSDAY , JULY 30'],
      CABECERA_COLUMNAS,
      ['10:00AM', 'BREAKFAST', 'FARMERS TABLE'],
      ['11:45AM', 'LUNCH BREAK', 'FARMER´S TABLE'],
      ['2:00PM', 'FULL-BODY MRI (2 HOURS)', 'COMPASS'],
    ];
    const r = leer(rows, encabezado('Paciente Prueba', 'July 30 – 31, 2026 – 7:30 AM.'));

    const comidas = r.rows.filter((f) => f.kind === 'meal');
    assert.deepStrictEqual(comidas.map((f) => f.serviceName), ['BREAKFAST', 'LUNCH BREAK']);
    assert.strictEqual(citas(r).length, 1, 'solo la resonancia se importa');
    assert.strictEqual(r.counts.meals, 2);
    // Se leen completas para poder enseñarlas con su hora y su lugar.
    assert.strictEqual(comidas[0].startsAt, '2026-07-30T10:00-07:00');
    assert.strictEqual(comidas[0].locationId, 'nivel1');
    // Un día en orden no le pide nada a la coordinadora: no se marca la
    // comida por el solo hecho de no importarse. Lo que sale en rojo tiene
    // que ser lo que de verdad necesita que alguien lo mire.
    assert.strictEqual(r.counts.needsAttention, 0);
  });

  test('la fila de dos celdas (sin columna de instrucciones) se lee igual', () => {
    // Alexandra trae exactamente una: "11:30AM ║ LUNCH BREAK". Un
    // intérprete que asuma tres columnas revienta con cells[2] undefined.
    const rows = [['THURSDAY , JULY 30'], CABECERA_COLUMNAS, ['11:30AM', 'LUNCH BREAK'], ['3:00PM', 'DENTAL CONSULTATION.', '29TH FLOOR']];
    const r = leer(rows, encabezado('Paciente Prueba', 'July 30 – 31, 2026 – 7:30 AM.'));

    const comida = r.rows.find((f) => f.kind === 'meal');
    assert.strictEqual(comida.serviceName, 'LUNCH BREAK');
    assert.strictEqual(comida.locationId, null);
    assert.strictEqual(cita(r, 'DENTAL CONSULTATION').locationId, 'piso29');
  });
});

describe('parseItinerary — la celda de hora vacía es continuación, no una cita nueva', () => {
  const rows = [
    ['THRUSDAY , JULY 30'],
    CABECERA_COLUMNAS,
    ['8:00AM', 'BLOOD WORK', 'FASTING 8-12 HOURS'],
    ['', 'URUNALYSIS, METABOLIC PANEL, LIPID PROFILE (HDL AND LDL CHOLESTEROL), TOTAL PSA.', ''],
    ['', 'TUMOR MARKERS', ''],
    ['', 'PAP SMEAR (Dr. Barajas)', ''],
    ['', '', ''],
    ['8:15AM', 'CHEST X-RAY', 'COMPASS'],
  ];
  const r = leer(rows, encabezado('Margarita Gonzalez', 'July 30 – 31, 2026 – 7:30 AM.'));

  test('los tres estudios que cuelgan del laboratorio NO se vuelven tres citas', () => {
    assert.deepStrictEqual(citas(r).map((f) => f.serviceName), ['BLOOD WORK', 'CHEST X-RAY']);
  });

  test('esos estudios se acumulan en el `details` de la cita de arriba, en orden y verbatim', () => {
    // Verbatim salvo los typos del diccionario: a una fila de continuación NO
    // se le extrae médico ni duración. "PAP SMEAR (Dr. Barajas)" conserva a su
    // médico dentro del texto — sacarlo de ahí lo dejaría sin dónde vivir,
    // porque `doctor` es un campo por CITA y la cita es el laboratorio entero.
    const c = cita(r, 'BLOOD WORK');
    assert.strictEqual(
      c.details,
      'URINALYSIS, METABOLIC PANEL, LIPID PROFILE (HDL AND LDL CHOLESTEROL), TOTAL PSA. · TUMOR MARKERS · PAP SMEAR (Dr. Barajas)',
    );
  });

  test('la lista de estudios NO se parte por comas: llega verbatim (D82)', () => {
    // Partirla sería adivinar dónde termina cada estudio. "LIPID PROFILE
    // (HDL AND LDL CHOLESTEROL)" trae dos comas adentro del paréntesis.
    assert.ok(cita(r, 'BLOOD WORK').details.includes('LIPID PROFILE (HDL AND LDL CHOLESTEROL)'));
  });

  test('cada fila de continuación queda visible y dice a qué cita se fue', () => {
    const continuaciones = r.rows.filter((f) => f.kind === 'detail');
    assert.strictEqual(continuaciones.length, 3);
    for (const f of continuaciones) assert.strictEqual(f.mergedIntoIndex, 2);
  });

  test('una fila de continuación sin cita previa no se pierde en silencio', () => {
    const sueltas = [['THURSDAY , JULY 30'], CABECERA_COLUMNAS, ['', 'TUMOR MARKERS', '']];
    const suelto = leer(sueltas, encabezado('Paciente Prueba', 'July 30 – 31, 2026 – 7:30 AM.'));
    const fila = suelto.rows[2];
    assert.strictEqual(fila.kind, 'ignored');
    assert.ok(codigos(fila).includes('orphanDetail'), `notas: ${JSON.stringify(fila.notes)}`);
  });
});

describe('parseItinerary — duración (D86)', () => {
  const conDuracion = (texto) => leer(
    [['THURSDAY , JULY 30'], CABECERA_COLUMNAS, ['2:00PM', texto, 'COMPASS']],
    encabezado('Paciente Prueba', 'July 30 – 31, 2026 – 7:30 AM.'),
  );

  for (const texto of ['FULL-BODY MRI (2 HOURS)', 'FULL BODY MRI (2 HOURS DURATION)', 'FULL BODY MRI (DURATION: 2 HOURS)']) {
    test(`la duración explícita gana y no se marca como supuesta: ${texto}`, () => {
      const r = conDuracion(texto);
      const c = citas(r)[0];
      assert.strictEqual(c.durationMin, 120);
      assert.ok(!codigos(c).includes('durationInferred'), `no debió marcarse supuesta: ${JSON.stringify(c.notes)}`);
    });
  }

  test('la duración explícita se quita del nombre del servicio', () => {
    assert.strictEqual(citas(conDuracion('FULL-BODY MRI (2 HOURS)'))[0].serviceName, 'FULL-BODY MRI');
  });

  test('un paréntesis que no es duración se queda en el nombre', () => {
    assert.strictEqual(citas(conDuracion('DEXA (BONE DENSITY SCAN)'))[0].serviceName, 'DEXA (BONE DENSITY SCAN)');
    assert.strictEqual(citas(conDuracion('NUTRITION CONSULTATION (INCLUDES INBODY SCAN)'))[0].serviceName, 'NUTRITION CONSULTATION (INCLUDES INBODY SCAN)');
  });

  test('sin duración explícita son 30 minutos, marcados como supuestos', () => {
    const r = leer(
      [['THURSDAY , JULY 30'], CABECERA_COLUMNAS, ['8:30AM', 'THYROID ULTRASOUND', ''], ['9:30AM', 'ABDOMINAL ULTRASOUND', '']],
      encabezado('Paciente Prueba', 'July 30 – 31, 2026 – 7:30 AM.'),
    );
    const c = cita(r, 'THYROID ULTRASOUND');
    assert.strictEqual(c.durationMin, 30);
    assert.ok(codigos(c).includes('durationInferred'));
  });

  test('cuando la siguiente cita llega antes de 30 minutos, la duración se recorta al hueco', () => {
    // Margarita: 10:30 MAMMOGRAPHY y 10:45 DEXA. Media hora la traslaparía.
    const r = leer(
      [['THURSDAY , JULY 30'], CABECERA_COLUMNAS, ['10:30AM', 'MAMMOGRAPHY', ''], ['10:45AM', 'DEXA (BONE DENSITY SCAN)', '']],
      encabezado('Paciente Prueba', 'July 30 – 31, 2026 – 7:30 AM.'),
    );
    assert.strictEqual(cita(r, 'MAMMOGRAPHY').durationMin, 15);
  });

  test('un hueco enorme NO alarga la cita: siguen siendo 30 minutos', () => {
    // Manuel: 11:30AM y luego 4:30PM. Una espirometría no dura cinco horas
    // porque la siguiente consulta tarde en llegar.
    const r = leer(
      [['THURSDAY , JULY 30'], CABECERA_COLUMNAS, ['11:30AM', 'SPIROMETRY + AUDIOMETRY', 'COMPASS'], ['4:30PM', 'FULL BODY MRI (DURATION: 2 HOURS)', 'COMPASS']],
      encabezado('Paciente Prueba', 'July 30 – 31, 2026 – 7:30 AM.'),
    );
    assert.strictEqual(cita(r, 'SPIROMETRY + AUDIOMETRY').durationMin, 30);
  });

  test('el hueco se mide contra la siguiente cita del MISMO día, no contra la del día siguiente', () => {
    const r = leer(
      [
        ['THURSDAY , JULY 30'], CABECERA_COLUMNAS, ['5:00PM', 'DENTAL CONSULTATION', '29TH FLOOR'],
        ['FRIDAY , JULY 31'], CABECERA_COLUMNAS, ['8:00AM', 'CHEST X-RAY', 'COMPASS'],
      ],
      encabezado('Paciente Prueba', 'July 30 – 31, 2026 – 7:30 AM.'),
    );
    assert.strictEqual(cita(r, 'DENTAL CONSULTATION').durationMin, 30);
  });

  test('dos citas a la misma hora no producen una duración de cero', () => {
    // durationMin <= 0 lo rechaza el servidor con 'invalid', y una
    // importación que falla entera por esto sería un misterio en pantalla.
    const r = leer(
      [['THURSDAY , JULY 30'], CABECERA_COLUMNAS, ['9:00AM', 'THYROID ULTRASOUND', ''], ['9:00AM', 'ABDOMINAL ULTRASOUND', '']],
      encabezado('Paciente Prueba', 'July 30 – 31, 2026 – 7:30 AM.'),
    );
    const c = cita(r, 'THYROID ULTRASOUND');
    assert.strictEqual(c.durationMin, 30);
    assert.ok(codigos(c).includes('overlap'), `notas: ${JSON.stringify(c.notes)}`);
  });
});

describe('parseItinerary — horas', () => {
  test('lee las horas del documento y las convierte a ISO con desplazamiento de Tijuana', () => {
    const r = leer(
      [['THURSDAY , JULY 30'], CABECERA_COLUMNAS, ['8:00AM', 'BLOOD WORK', 'COMPASS'], ['2:00PM', 'FULL-BODY MRI (2 HOURS)', 'COMPASS']],
      encabezado('Paciente Prueba', 'July 30 – 31, 2026 – 7:30 AM.'),
    );
    assert.strictEqual(cita(r, 'BLOOD WORK').startsAt, '2026-07-30T08:00-07:00');
    assert.strictEqual(cita(r, 'FULL-BODY MRI').startsAt, '2026-07-30T14:00-07:00');
  });

  test('el desplazamiento sale del calendario, no de una constante: en enero es -08:00', () => {
    // Baja California sigue el horario de verano de EE. UU.: PST hasta el 8
    // de marzo de 2026 y PDT después. Clavar "-07:00" funcionaría todo el
    // año excepto en invierno, que es cuando nadie lo estaría probando.
    const r = leer(
      [['MONDAY , JANUARY 12'], CABECERA_COLUMNAS, ['8:00AM', 'BLOOD WORK', 'COMPASS']],
      encabezado('Paciente Prueba', 'January 12 – 13, 2026 – 7:30 AM.'),
    );
    assert.strictEqual(cita(r, 'BLOOD WORK').startsAt, '2026-01-12T08:00-08:00');
  });

  test('12:00PM es mediodía y 12:30AM de madrugada, no al revés', () => {
    const r = leer(
      [['THURSDAY , JULY 30'], CABECERA_COLUMNAS, ['12:00PM', 'MEDIODIA', ''], ['11:00PM', 'NOCHE', '']],
      encabezado('Paciente Prueba', 'July 30 – 31, 2026 – 7:30 AM.'),
    );
    assert.strictEqual(cita(r, 'MEDIODIA').startsAt, '2026-07-30T12:00-07:00');
    assert.strictEqual(cita(r, 'NOCHE').startsAt, '2026-07-30T23:00-07:00');
  });

  test('el 12:30AM imposible de Amy se corrige a 12:30PM y queda MARCADO como corregido', () => {
    // Entre las 11:00AM y las 2:00PM, "12:30AM" solo puede ser un PM mal
    // escrito. Se corrige porque invertirlo devuelve el día a orden
    // cronológico — y se enseña corregido, nunca en silencio.
    const rows = [
      ['THURSDAY , AUGUST 20'],
      CABECERA_COLUMNAS,
      ['11:00AM', 'BREAKFAST', 'FARMERS TABLE'],
      ['12:30AM', 'DENTAL CONSULTATION.', '29TH FLOOR'],
      ['2:00PM', 'INTERNAL MEDICINE CONSULTATION DR PEÑA', '22TH FLOOR'],
    ];
    const r = leer(rows, encabezado('Kusonah Fohtung', 'Thursday August 20th, 2026 – 7:30 AM.'));

    const c = cita(r, 'DENTAL CONSULTATION');
    assert.strictEqual(c.startsAt, '2026-08-20T12:30-07:00');
    const nota = c.notes.find((n) => n.code === 'timeFlipped');
    assert.ok(nota, `notas: ${JSON.stringify(c.notes)}`);
    assert.deepStrictEqual({ from: nota.from, to: nota.to }, { from: '12:30AM', to: '12:30PM' });
  });

  test('si invertir AM/PM tampoco ordena el día, la hora se deja como está y se marca', () => {
    const rows = [
      ['THURSDAY , JULY 30'],
      CABECERA_COLUMNAS,
      ['2:00PM', 'PRIMERA', ''],
      ['9:00AM', 'SEGUNDA', ''],
    ];
    const r = leer(rows, encabezado('Paciente Prueba', 'July 30 – 31, 2026 – 7:30 AM.'));

    const c = cita(r, 'SEGUNDA');
    assert.strictEqual(c.startsAt, '2026-07-30T09:00-07:00', 'no se toca lo que no se puede arreglar');
    assert.ok(codigos(c).includes('timeOutOfOrder'), `notas: ${JSON.stringify(c.notes)}`);
    assert.ok(!codigos(c).includes('timeFlipped'));
  });

  test('una hora ilegible no tira la importación: la fila queda marcada y sin hora', () => {
    const r = leer(
      [['THURSDAY , JULY 30'], CABECERA_COLUMNAS, ['POR CONFIRMAR', 'CHEST X-RAY', 'COMPASS']],
      encabezado('Paciente Prueba', 'July 30 – 31, 2026 – 7:30 AM.'),
    );
    const c = cita(r, 'CHEST X-RAY');
    assert.strictEqual(c.startsAt, null);
    assert.ok(codigos(c).includes('timeUnreadable'), `notas: ${JSON.stringify(c.notes)}`);
  });
});

describe('parseItinerary — corrección de typos (D85)', () => {
  const conServicio = (texto) => leer(
    [['THURSDAY , JULY 30'], CABECERA_COLUMNAS, ['8:00AM', texto, 'COMPASS']],
    encabezado('Paciente Prueba', 'July 30 – 31, 2026 – 7:30 AM.'),
  );

  const diccionario = [
    ['URUNALYSIS, METABOLIC PANEL', 'URINALYSIS, METABOLIC PANEL', 'URUNALYSIS', 'URINALYSIS'],
    ['CARDIC STRESS TEST', 'CARDIAC STRESS TEST', 'CARDIC', 'CARDIAC'],
    ['OPHTALMOLOGY CONSULTATION', 'OPHTHALMOLOGY CONSULTATION', 'OPHTALMOLOGY', 'OPHTHALMOLOGY'],
  ];

  for (const [entra, sale, de, a] of diccionario) {
    test(`${de} → ${a}, y la corrección queda a la vista`, () => {
      const c = citas(conServicio(entra))[0];
      assert.strictEqual(c.serviceName, sale);
      const nota = c.notes.find((n) => n.code === 'typoFixed' && n.from === de);
      assert.ok(nota, `esperaba una nota typoFixed de ${de}: ${JSON.stringify(c.notes)}`);
      assert.strictEqual(nota.to, a);
    });
  }

  test('THRUSDAY se corrige también en la fila de día, que es donde aparece', () => {
    const r = leer(
      [['THRUSDAY , JULY 30'], CABECERA_COLUMNAS, ['8:00AM', 'CHEST X-RAY', 'COMPASS']],
      encabezado('Paciente Prueba', 'July 30 – 31, 2026 – 7:30 AM.'),
    );
    assert.strictEqual(cita(r, 'CHEST X-RAY').startsAt, '2026-07-30T08:00-07:00');
  });

  test('una palabra que NO está en el diccionario no se toca', () => {
    // Inventar correcciones sobre términos médicos es como se cambia el
    // significado de un estudio sin querer. "INBODY" y "DEXA" son reales.
    const c = citas(conServicio('NUTRITION CONSULTATION (INCLUDES INBODY SCAN)'))[0];
    assert.strictEqual(c.serviceName, 'NUTRITION CONSULTATION (INCLUDES INBODY SCAN)');
    assert.deepStrictEqual(c.notes.filter((n) => n.code === 'typoFixed'), []);
  });

  test('la corrección respeta el límite de palabra: no destroza una palabra que contenga el typo', () => {
    const c = citas(conServicio('PRECARDIC PANEL'))[0];
    assert.strictEqual(c.serviceName, 'PRECARDIC PANEL');
  });
});

describe('parseItinerary — ubicaciones (D40, D70: nunca texto libre)', () => {
  const conLugar = (texto) => leer(
    [['THURSDAY , JULY 30'], CABECERA_COLUMNAS, ['8:00AM', 'CHEST X-RAY', texto]],
    encabezado('Paciente Prueba', 'July 30 – 31, 2026 – 7:30 AM.'),
  );

  test('COMPASS cae en la ubicación del laboratorio', () => {
    assert.strictEqual(citas(conLugar('COMPASS'))[0].locationId, 'compass');
  });

  test('cada piso del documento cae en SU piso, no en el 27', () => {
    // El error que esta etapa viene a arreglar: hasta hoy todo esto se
    // capturaba como "Piso 27" porque era el único piso que existía.
    const esperado = { '10TH FLOOR': 'piso10', '11TH FLOOR': 'piso11', '16TH FLOOR': 'piso16', '27TH FLOOR': 'piso27', '28TH FLOOR': 'piso28', '29TH FLOOR': 'piso29' };
    for (const [texto, id] of Object.entries(esperado)) {
      assert.strictEqual(citas(conLugar(texto))[0].locationId, id, `${texto} debía ser ${id}`);
    }
  });

  test('"22TH FLOOR" —ordinal mal escrito— se entiende como el piso 22', () => {
    assert.strictEqual(citas(conLugar('22TH FLOOR'))[0].locationId, 'piso22');
  });

  test('las tres ortografías del comedor caen todas en Nivel 1', () => {
    for (const texto of ['FARMER´S TABLE', 'FARMERS TABLE', "FARMER'S TABLE", 'FARMER’S TABLE']) {
      assert.strictEqual(citas(conLugar(texto))[0].locationId, 'nivel1', `falló con ${JSON.stringify(texto)}`);
    }
  });

  test('un piso que NO existe en el catálogo se rechaza: null y marcado, nunca aproximado', () => {
    const c = citas(conLugar('13TH FLOOR'))[0];
    assert.strictEqual(c.locationId, null);
    assert.ok(codigos(c).includes('locationUnknown'), `notas: ${JSON.stringify(c.notes)}`);
  });

  test('una celda de instrucciones vacía deja la ubicación en null para que la ponga la coordinadora', () => {
    const c = citas(conLugar(''))[0];
    assert.strictEqual(c.locationId, null);
    assert.ok(codigos(c).includes('locationMissing'));
  });

  test('el intérprete jamás devuelve un locationId que el catálogo no conozca', () => {
    // El servidor rechaza con 422 cualquier id fuera del catálogo. Si el
    // intérprete inventara uno, la importación entera fallaría por una fila.
    const ids = new Set(locations.map((l) => l.id));
    const textos = ['COMPASS', '22TH FLOOR', 'FARMER´S TABLE', '13TH FLOOR', 'LO QUE SEA', '', 'QUARTZ HOTEL & SPA', 'PHARMACY'];
    for (const t of textos) {
      const c = citas(conLugar(t))[0];
      assert.ok(c.locationId === null || ids.has(c.locationId), `${JSON.stringify(t)} produjo un id inválido: ${c.locationId}`);
    }
  });
});

describe('parseItinerary — preparación y médico (D82)', () => {
  test('"FASTING 8-12 HOURS" no es un lugar: entra como preparación', () => {
    const r = leer(
      [['THURSDAY , JULY 30'], CABECERA_COLUMNAS, ['8:00AM', 'BLOOD WORK', 'FASTING 8-12 HOURS']],
      encabezado('Paciente Prueba', 'July 30 – 31, 2026 – 7:30 AM.'),
    );
    const c = cita(r, 'BLOOD WORK');
    assert.strictEqual(c.prep, 'FASTING 8-12 HOURS');
    assert.strictEqual(c.locationId, null, 'el documento no dice dónde: lo decide la coordinadora');
    assert.ok(codigos(c).includes('locationUnknown'));
  });

  const conServicio = (texto) => citas(leer(
    [['THURSDAY , JULY 30'], CABECERA_COLUMNAS, ['8:00AM', texto, '']],
    encabezado('Paciente Prueba', 'July 30 – 31, 2026 – 7:30 AM.'),
  ))[0];

  const medicos = [
    ['CARDIC STRESS TEST + ELECTROCARDIOGRAM. DR. LUNA', 'CARDIAC STRESS TEST + ELECTROCARDIOGRAM', 'DR. LUNA'],
    ['AUDIOMETRY + SPIROMETRY DR. ORTEGA', 'AUDIOMETRY + SPIROMETRY', 'DR. ORTEGA'],
    ['INTERNAL MEDICINE CONSULTATION DR SARA', 'INTERNAL MEDICINE CONSULTATION', 'DR SARA'],
    ['INTERNAL MEDICINE CONSULTATION. DR. SARA GARCIA', 'INTERNAL MEDICINE CONSULTATION', 'DR. SARA GARCIA'],
    ['DERMATOLOGY CONSULTATION DR ANGEL OSUNA', 'DERMATOLOGY CONSULTATION', 'DR ANGEL OSUNA'],
    ['INTERNAL MEDICINE CONSULTATION DR PEÑA', 'INTERNAL MEDICINE CONSULTATION', 'DR PEÑA'],
    ['PAP SMEAR (Dr. Barajas)', 'PAP SMEAR', 'Dr. Barajas'],
  ];

  for (const [entra, servicio, medico] of medicos) {
    test(`separa al médico del estudio: ${entra}`, () => {
      const c = conServicio(entra);
      assert.strictEqual(c.doctor, medico);
      assert.strictEqual(c.serviceName, servicio);
    });
  }

  test('"RETINA CENTER" no es un médico y no se le quita al estudio', () => {
    const c = conServicio('OPHTHALMOLOGY CONSULTATION. RETINA CENTER');
    assert.strictEqual(c.doctor, '');
    assert.strictEqual(c.serviceName, 'OPHTHALMOLOGY CONSULTATION. RETINA CENTER');
  });

  test('una palabra que empieza con "DR" pero no es un doctor no se corta', () => {
    const c = conServicio('SURGICAL DRAINAGE');
    assert.strictEqual(c.doctor, '');
    assert.strictEqual(c.serviceName, 'SURGICAL DRAINAGE');
  });

  test('si quitar al médico dejaría el estudio vacío, no se quita nada', () => {
    const c = conServicio('DR. LUNA');
    assert.strictEqual(c.serviceName, 'DR. LUNA');
    assert.strictEqual(c.doctor, '');
  });
});

describe('parseItinerary — conteos y pureza', () => {
  test('los conteos cuadran con lo que la revisión tiene que decirle a la coordinadora', () => {
    const rows = [
      ['WOMEN EXTENDED CHECK-UP'],
      ['THRUSDAY , JULY 30'],
      CABECERA_COLUMNAS,
      ['8:00AM', 'BLOOD WORK', 'FASTING 8-12 HOURS'],
      ['', 'URUNALYSIS, TOTAL PSA', ''],
      ['8:15AM', 'CHEST X-RAY', 'COMPASS'],
      ['11:45AM', 'LUNCH BREAK', 'FARMER´S TABLE'],
      ['2:00PM', 'FULL-BODY MRI (2 HOURS)', 'COMPASS'],
      ['', '', ''],
    ];
    const r = leer(rows, encabezado('Margarita Gonzalez', 'July 30 – 31, 2026 – 7:30 AM.'));

    assert.strictEqual(r.counts.read, rows.length);
    assert.strictEqual(r.counts.importable, 3);
    assert.strictEqual(r.counts.meals, 1);
    // La del laboratorio: el documento no dice dónde se saca la sangre.
    assert.strictEqual(r.counts.needsAttention, 1);
  });

  test('leer el mismo documento dos veces da exactamente el mismo resultado', () => {
    // INV-1: no lee el reloj. Si lo leyera, dos corridas separadas por un
    // cambio de día darían fechas distintas para el mismo documento — y la
    // prueba que lo cacharía solo fallaría a medianoche.
    const rows = [['THRUSDAY , JULY 30'], CABECERA_COLUMNAS, ['8:00AM', 'BLOOD WORK', 'COMPASS']];
    const h = encabezado('Paciente Prueba', 'July 30 – 31, 2026 – 7:30 AM.');
    assert.deepStrictEqual(leer(rows, h), leer(rows, h));
  });

  test('no muta las filas que recibe', () => {
    const rows = [['THURSDAY , JULY 30'], CABECERA_COLUMNAS, ['8:00AM', 'URUNALYSIS', 'COMPASS']];
    const copia = JSON.parse(JSON.stringify(rows));
    leer(rows, encabezado('Paciente Prueba', 'July 30 – 31, 2026 – 7:30 AM.'));
    assert.deepStrictEqual(rows, copia);
  });

  test('entradas basura devuelven un resultado vacío en vez de reventar', () => {
    for (const basura of [null, undefined, 42, 'no soy filas', {}]) {
      const r = parseItinerary({ rows: basura, headings: basura, locations });
      assert.deepStrictEqual(r.rows, [], `falló con ${JSON.stringify(basura)}`);
      assert.strictEqual(r.patientName, '');
    }
    assert.deepStrictEqual(parseItinerary().rows, []);
  });
});
