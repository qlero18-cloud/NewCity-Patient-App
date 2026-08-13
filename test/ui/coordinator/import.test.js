// Etapa I — la pantalla de revisión. El intérprete propone; la coordinadora
// dispone (D84).
//
// Estas pruebas NO vuelven a probar el intérprete: le pasan un documento
// sintético y afirman sobre lo que la PANTALLA hace con lo que él devuelve.
// Por eso el resultado se calcula llamando a parseItinerary de verdad, con
// el catálogo real de ubicaciones, en vez de escribir a mano un objeto que
// se parezca: un contrato inventado en la prueba se desalinea del real sin
// que nadie se entere.
//
// D8 — sin DOM falso. Lo que hay que probar se extrae como función pura y
// exportada (renderImportReview, buildImportPayload), y del cableado solo se
// fija que no truene con un rootEl mínimo.
//
// D88 — el documento de aquí es inventado. Ninguno de los cinco reales entra
// al repositorio.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderImportScreen,
  renderImportReview,
  attachImportScreen,
  buildImportPayload,
  IMPORT_CSS,
} from '../../../src/ui/screens/coordinator/import.js';
import { parseItinerary } from '../../../src/domain/itineraryParse.js';
import { locations } from '../../../src/data/locations.js';
import { transferPoints, VEHICLE_TYPES } from '../../../src/data/transferPoints.js';
import { translate } from '../../../src/ui/i18n.js';

const LANGS = ['es', 'en'];

function ctx(lang = 'es') {
  return { lang, t: (path) => translate(lang, path) };
}

// Un itinerario que reúne, en nueve filas, todo lo que la pantalla tiene que
// saber mostrar: typo corregido, hora invertida, duración supuesta, comida,
// fila de continuación, ubicación reconocida, ubicación desconocida y filas
// de encabezado que no se importan.
const ENCABEZADOS = [
  'CHECK-UP ITINERARY WOMEN EXTENDED',
  'Scheduled Date: July 30 – 31, 2026 – 7:30 AM.',
  'Patient: Paula Rivera DOB: April 6th 1970 Phone Number: +1 555 0100 E-mail: paula@example.com',
];

const FILAS = [
  ['THRUSDAY , JULY 30'],
  ['TIME', 'BLOOD SAMPLE AND TESTS', 'INSTRUCTIONS'],
  ['7:30AM', 'BLOOD WORK', 'FASTING 8-12 HOURS'],
  ['', 'URUNALYSIS'],
  ['9:00AM', 'CARDIC ULTRASOUND (2 HOURS)', '10TH FLOOR'],
  ['11:30AM', 'LUNCH BREAK'],
  [],
  ['12:30AM', 'DENTAL CONSULTATION (DR. LUNA)', '22TH FLOOR'],
  ['2:00PM', 'OPHTALMOLOGY CONSULTATION', 'ZONA MISTERIOSA'],
];

function leido(rows = FILAS, headings = ENCABEZADOS) {
  return parseItinerary({ rows, headings, locations });
}

function veces(html, sub) {
  return html.split(sub).length - 1;
}

// Etapa L — las dos tablas de reserva que el Word real trae antes de los
// días. Los datos son inventados (D88), pero la FORMA es la del documento:
// etiqueta en la primera celda, valor en la segunda, una casilla de
// plantilla sin llenar, un teléfono sin lada, una marca comercial donde el
// modelo espera una carrocería, y una recogida un día antes del check-in.
const HOTEL = [
  ['ACCOMMODATION DETAILS'],
  ['Hotel', 'Quartz Hotel & Spa'],
  ['Reservation code', 'QZ-99871'],
  ['Check-in', 'July 30th'],
  ['Check-out', 'August 1st'],
  ['Room type', 'Junior suite'],
  ['Nights', '2'],
  ['Occupancy', '2 adults, 1 child'],
  ['Total', '$3,164.00 MXN'],
  ['Breakfast included', '[Yes / No]'],
  ['Guest', 'Paula Rivera'],
];

const TRANSPORTE = [
  ['TRANSPORTATION'],
  ['Transfer type', 'Round-trip'],
  ['Pickup date and time', 'July 29th 9:00AM'],
  ['Return date and time', 'August 1st 2:00PM'],
  ['Meeting point', 'San Diego Airport'],
  ['Flight (optional)', 'am 672'],
  ['Driver name', 'Juan Ibarra'],
  ['Driver phone', '664 163 1965'],
  ['Vehicle type', 'Kia Seltos'],
  ['License plate', 'aue105a'],
  ['Additional notes', 'Llega media hora antes.'],
];

function leidoConReservas(tables = [HOTEL, TRANSPORTE, FILAS]) {
  return parseItinerary({ tables, headings: ENCABEZADOS, locations, transferPoints });
}

describe('renderImportScreen — el estado inicial, antes de subir nada', () => {
  for (const lang of LANGS) {
    test(`[${lang}] ofrece el control de archivo y solo acepta .docx`, () => {
      const html = renderImportScreen(ctx(lang));

      assert.ok(html.includes(translate(lang, 'coordinator.import.title')));
      assert.ok(html.includes('data-role="import-file-input"'));
      assert.ok(html.includes('type="file"'));
      assert.ok(/accept="[^"]*\.docx/.test(html), 'el diálogo del sistema debe filtrar a .docx (D87)');
      assert.ok(html.includes(translate(lang, 'coordinator.import.uploadLabel')));
    });
  }

  test('deja listo el hueco de la revisión, vacío: sin documento no hay tabla', () => {
    const html = renderImportScreen(ctx('es'));

    assert.ok(html.includes('data-role="import-review"'));
    assert.ok(!html.includes('data-role="import-row"'), 'nada que revisar todavía');
    assert.ok(!html.includes('<table'), 'la tabla la pinta el documento, no la pantalla vacía');
  });

  test('el error de archivo nace oculto y con role=alert', () => {
    const html = renderImportScreen(ctx('es'));

    assert.ok(/data-role="import-error"[^>]*role="alert"/.test(html)
      || /role="alert"[^>]*data-role="import-error"/.test(html));
    assert.ok(/data-role="import-error"[^>]*hidden/.test(html));
  });

  test('IMPORT_CSS existe y se queda en su propio prefijo', () => {
    assert.strictEqual(typeof IMPORT_CSS, 'string');
    assert.ok(IMPORT_CSS.includes('nc-coord-import'));
  });
});

describe('renderImportReview — el nombre del paciente se confirma, nunca se importa en silencio (D84)', () => {
  test('propone el nombre leído, en un campo editable', () => {
    const html = renderImportReview(leido(), ctx('es'));

    assert.ok(/name="patientFirstName"/.test(html));
    assert.ok(html.includes('value="Paula Rivera"'), 'lo leído se propone, no se esconde');
  });

  for (const lang of LANGS) {
    test(`[${lang}] exige una confirmación explícita marcada a mano`, () => {
      const html = renderImportReview(leido(), ctx(lang));

      const casilla = /<input[^>]*data-role="import-confirm-name"[^>]*>/.exec(html);
      assert.ok(casilla, 'la lección del documento de Amy: alguien tiene que decir que sí');
      assert.ok(casilla[0].includes('type="checkbox"'));
      assert.ok(casilla[0].includes('required'));
      assert.ok(!casilla[0].includes('checked'), 'nace sin marcar: si viniera marcada no confirmaría nada');
      assert.ok(html.includes(translate(lang, 'coordinator.import.confirmNameLabel')));
    });
  }

  test('el idioma del paciente se elige, no se deduce del documento', () => {
    const html = renderImportReview(leido(), ctx('es'));

    assert.ok(/<select[^>]*name="lang"/.test(html));
    assert.ok(html.includes(translate('es', 'common.langName.es')));
    assert.ok(html.includes(translate('es', 'common.langName.en')));
  });
});

describe('renderImportReview — los conteos, honestos', () => {
  for (const lang of LANGS) {
    test(`[${lang}] dice cuántas leyó, cuántas importará y cuántas necesitan atención`, () => {
      const res = leido();
      // `booking` en cero: este documento de prueba no trae tablas de hotel
      // ni de transporte, que es como son cuatro de los cinco itinerarios
      // reales. La llave existe siempre para que la pantalla no tenga que
      // preguntar si el documento traía reservas.
      assert.deepStrictEqual(res.counts, { read: 9, importable: 4, booking: 0, meals: 1, needsAttention: 2 });

      const html = renderImportReview(res, ctx(lang));
      assert.ok(html.includes(translate(lang, 'coordinator.import.counts')(9, 4, 2)));
    });
  }

  test('las filas que no se muestran se cuentan en voz alta, no desaparecen', () => {
    // 9 leídas, 6 en la tabla (4 citas + 1 comida + 1 continuación): las 3
    // restantes son encabezado o están vacías, y hay que decirlo o el 9 del
    // conteo no cuadra con lo que se ve.
    const html = renderImportReview(leido(), ctx('es'));

    assert.strictEqual(veces(html, 'data-role="import-row"'), 6);
    assert.ok(html.includes(translate('es', 'coordinator.import.skippedNote')(3)));
  });

  test('sin filas saltadas no se inventa el aviso', () => {
    const res = leido([['7:30AM', 'BLOOD WORK', 'COMPASS']], ENCABEZADOS);
    const html = renderImportReview(res, ctx('es'));

    assert.ok(!html.includes(translate('es', 'coordinator.import.skippedNote')(0)));
  });
});

describe('renderImportReview — la ubicación es un <select>, jamás texto libre (D40, D70)', () => {
  test('cada cita trae su selector poblado del catálogo', () => {
    const html = renderImportReview(leido(), ctx('es'));

    assert.strictEqual(veces(html, 'name="locationId"'), 4, 'una por cita importable');
    assert.ok(!/name="locationId"[^>]*type="text"/.test(html));
  });

  test('lo reconocido llega preseleccionado, con el piso correcto', () => {
    const html = renderImportReview(leido(), ctx('es'));

    // 10TH FLOOR y 22TH FLOOR son ubicaciones nuevas de la Etapa I (D80): no
    // deben caer en piso27, que es el error que se comete hoy a mano.
    assert.ok(html.includes('<option value="piso10" selected>'));
    assert.ok(html.includes('<option value="piso22" selected>'));
    assert.ok(!html.includes('<option value="piso27" selected>'));
  });

  test('sin coincidencia NO se adivina: queda un vacío obligatorio', () => {
    const html = renderImportReview(leido(), ctx('es'));
    const selects = html.match(/<select[^>]*name="locationId"[\s\S]*?<\/select>/g) ?? [];
    const vacios = selects.filter((s) => s.includes('value="" disabled selected'));

    assert.strictEqual(vacios.length, 2, 'las dos citas sin ubicación reconocida');
    for (const s of vacios) {
      assert.ok(s.includes('required'), 'el navegador debe frenar el envío antes que el servidor');
      assert.ok(s.includes(translate('es', 'coordinator.import.locationPlaceholder')));
    }
    // La trampa que esto evita: sin opción vacía, el navegador selecciona la
    // PRIMERA del catálogo y manda al paciente al estacionamiento en silencio.
    assert.ok(!/<select[^>]*name="locationId">\s*<option value="estacionamiento" selected>/.test(html));
  });
});

describe('renderImportReview — lo corregido se ve (D85)', () => {
  for (const lang of LANGS) {
    test(`[${lang}] el typo se muestra con la palabra de antes y la de después`, () => {
      const html = renderImportReview(leido(), ctx(lang));

      assert.ok(html.includes(translate(lang, 'coordinator.import.note.typoFixed')(
        { code: 'typoFixed', from: 'OPHTALMOLOGY', to: 'OPHTHALMOLOGY' },
      )));
      assert.ok(html.includes('OPHTALMOLOGY'), 'la palabra original, para poder juzgar la corrección');
      assert.ok(html.includes('OPHTHALMOLOGY'));
    });
  }

  test('la hora invertida se muestra corregida y marcada', () => {
    const html = renderImportReview(leido(), ctx('es'));

    assert.ok(html.includes(translate('es', 'coordinator.import.note.timeFlipped')(
      { code: 'timeFlipped', from: '12:30AM', to: '12:30PM' },
    )));
    assert.ok(html.includes('value="2026-07-30T12:30"'), 'el campo ya trae la hora corregida');
  });

  test('la duración supuesta se marca como supuesta', () => {
    const html = renderImportReview(leido(), ctx('es'));

    assert.ok(html.includes(translate('es', 'coordinator.import.note.durationInferred')));
    // La explícita del documento no se toca ni se marca.
    assert.ok(html.includes('value="120"'), 'el (2 HOURS) del documento manda');
  });

  test('lo que no se reconoció como ubicación se dice con el texto que traía', () => {
    const html = renderImportReview(leido(), ctx('es'));

    assert.ok(html.includes(translate('es', 'coordinator.import.note.locationUnknown')(
      { code: 'locationUnknown', text: 'ZONA MISTERIOSA' },
    )));
  });

  test('el médico y la preparación del documento llegan a sus campos', () => {
    const html = renderImportReview(leido(), ctx('es'));

    assert.ok(html.includes('value="DR. LUNA"'));
    assert.ok(html.includes('value="FASTING 8-12 HOURS"'));
  });
});

describe('renderImportReview — ningún código del intérprete se queda sin texto', () => {
  // La lista es literal a propósito: es el contrato con
  // src/domain/itineraryParse.js. Si el intérprete gana un código nuevo,
  // esta prueba no lo sabe — pero la de abajo garantiza que, mientras
  // tanto, la pantalla no truene ni lo esconda.
  const CODIGOS_NOTA = [
    'typoFixed', 'timeFlipped', 'durationInferred', 'overlap',
    'locationMissing', 'locationUnknown', 'noDate', 'timeUnreadable',
    'timeOutOfOrder', 'serviceNameTooLong', 'prepTooLong', 'detailsTooLong',
    'orphanDetail',
  ];
  const CODIGOS_AVISO = ['dateUnreadable', 'dateRangeTooLong', 'dayNotInHeader', 'noDate'];
  // Etapa L — los del intérprete de reservas (src/domain/itineraryBooking.js).
  // Van en su propia lista y no revueltos con los de arriba porque son el
  // contrato con OTRO módulo: cuando uno de los dos gane un código, se ve
  // de inmediato a cuál pertenece.
  const CODIGOS_RESERVA = [
    'templateBlank', 'unknownLabel', 'valueTooLong', 'valueUnreadable', 'noYear',
    'dateUnreadable', 'timeAssumed', 'timeMissing', 'dateMissing', 'nightsMismatch',
    'guestMismatch', 'roundTrip', 'roundTripIncomplete', 'transferTypeUnknown',
    'meetingPointUnknown', 'meetingPointMissing', 'countryCodeAssumed', 'phoneUnreadable',
    'vehicleSplit', 'vehicleTypeMissing', 'pickupBeforeCheckIn',
  ];
  const EJEMPLO = { from: 'A', to: 'B', text: 'X', day: '2026-07-30', days: 40 };

  for (const lang of LANGS) {
    test(`[${lang}] cada nota y cada aviso tienen texto propio`, () => {
      for (const code of [...CODIGOS_NOTA, ...CODIGOS_RESERVA]) {
        const valor = translate(lang, `coordinator.import.note.${code}`);
        const texto = typeof valor === 'function' ? valor({ code, ...EJEMPLO }) : valor;
        assert.ok(typeof texto === 'string' && texto.length > 0, `note.${code}`);
      }
      for (const code of CODIGOS_AVISO) {
        const valor = translate(lang, `coordinator.import.warning.${code}`);
        const texto = typeof valor === 'function' ? valor({ code, ...EJEMPLO }) : valor;
        assert.ok(typeof texto === 'string' && texto.length > 0, `warning.${code}`);
      }
    });
  }

  test('un código sin traducción se muestra crudo, no revienta la pantalla ni se calla', () => {
    const res = leido();
    res.rows[4].notes.push({ code: 'codigoQueNadieTradujo' });

    let html = '';
    assert.doesNotThrow(() => { html = renderImportReview(res, ctx('es')); });
    assert.ok(html.includes('codigoQueNadieTradujo'), 'mejor un código feo que una corrección invisible');
  });

  test('los avisos del documento entero se muestran arriba, no dentro de una fila', () => {
    // Sin "Scheduled Date:" el intérprete no tiene año y lo dice.
    const res = leido(FILAS, ['CHECK-UP ITINERARY WOMEN EXTENDED', 'Patient: Paula Rivera']);
    assert.ok(res.warnings.some((w) => w.code === 'noDate'));

    const html = renderImportReview(res, ctx('es'));
    assert.ok(html.includes(translate('es', 'coordinator.import.warning.noDate')));
  });
});

describe('renderImportReview — comidas y continuaciones: se ven, no se importan', () => {
  for (const lang of LANGS) {
    test(`[${lang}] la comida aparece marcada como no importada`, () => {
      const html = renderImportReview(leido(), ctx(lang));

      assert.ok(html.includes('LUNCH BREAK'), 'se ve, para que nadie descubra después que faltaba');
      assert.ok(html.includes(translate(lang, 'coordinator.import.notImported')));
    });
  }

  test('la comida no trae campos: lo que no se importa no se edita', () => {
    const html = renderImportReview(leido(), ctx('es'));

    assert.strictEqual(veces(html, 'name="serviceName"'), 4, 'solo las 4 citas importables');
    assert.strictEqual(veces(html, 'name="startsAt"'), 4);
    assert.strictEqual(veces(html, 'name="durationMin"'), 4);
  });

  test('la fila de continuación dice a qué estudio se suma, y el texto acaba en su cita', () => {
    const html = renderImportReview(leido(), ctx('es'));

    assert.ok(html.includes(translate('es', 'coordinator.import.mergedInto')));
    // URINALYSIS (ya corregido) va dentro del campo de detalles de BLOOD WORK.
    assert.ok(/<textarea[^>]*name="details"[^>]*>URINALYSIS<\/textarea>/.test(html));
  });
});

describe('renderImportReview — lo que se descarta se dice de frente (D61)', () => {
  for (const lang of LANGS) {
    test(`[${lang}] nombra fecha de nacimiento, teléfono y correo`, () => {
      const html = renderImportReview(leido(), ctx(lang));

      assert.ok(html.includes(translate(lang, 'coordinator.import.discardedTitle')));
      for (const dato of ['dob', 'phone', 'email']) {
        assert.ok(html.includes(translate(lang, `coordinator.import.discarded.${dato}`)), dato);
      }
    });
  }

  test('descartar es descartar: el teléfono y el correo del documento no se pintan', () => {
    const html = renderImportReview(leido(), ctx('es'));

    assert.ok(!html.includes('+1 555 0100'));
    assert.ok(!html.includes('paula@example.com'));
    assert.ok(!html.includes('April 6th 1970'));
  });

  test('un documento sin esos datos no anuncia haberlos descartado', () => {
    const res = leido(FILAS, ['CHECK-UP ITINERARY WOMEN EXTENDED', 'Scheduled Date: July 30, 2026.', 'Patient: Paula Rivera']);
    assert.deepStrictEqual(res.discarded, []);

    const html = renderImportReview(res, ctx('es'));
    assert.ok(!html.includes(translate('es', 'coordinator.import.discardedTitle')));
  });
});

describe('renderImportReview — el documento es texto de fuera: se escapa', () => {
  test('un estudio con HTML adentro no se convierte en HTML', () => {
    const res = leido([['7:30AM', '<script>alert(1)</script> "X" & Y', 'COMPASS']], ENCABEZADOS);
    const html = renderImportReview(res, ctx('es'));

    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('&amp;'));
  });

  test('un nombre de paciente con comillas no rompe el atributo value', () => {
    const res = leido(FILAS, ['CHECK-UP ITINERARY X', 'Scheduled Date: July 30, 2026.', 'Patient: A" onfocus="x']);
    const html = renderImportReview(res, ctx('es'));

    // `onfocus=&quot;` es inofensivo: es texto dentro del value. Lo que no
    // puede aparecer es la comilla sin escapar, que es la que cierra el
    // atributo y convierte el nombre del paciente en un manejador de evento.
    assert.ok(!html.includes('onfocus="'));
    assert.ok(html.includes('&quot;'));
  });
});

describe('buildImportPayload — lo revisado se vuelve cuerpo de la petición', () => {
  const FORMULARIO = {
    patientFirstName: '  Paula  ',
    lang: 'en',
    rows: [
      {
        startsAt: '2026-07-30T07:30',
        durationMin: '30',
        serviceName: '  BLOOD WORK  ',
        locationId: 'compass',
        prep: 'FASTING 8-12 HOURS',
        doctor: '',
        details: 'URINALYSIS',
      },
      {
        startsAt: '2026-07-30T09:00',
        durationMin: '120',
        serviceName: 'CARDIAC ULTRASOUND',
        locationId: 'piso10',
        prep: '',
        doctor: 'DR. LUNA',
        details: '',
      },
    ],
  };

  test('cada hora local se vuelve ISO con desplazamiento explícito (PRD §7)', () => {
    const { appointments } = buildImportPayload(FORMULARIO);

    assert.strictEqual(appointments[0].startsAt, '2026-07-30T07:30-07:00');
    assert.strictEqual(appointments[1].startsAt, '2026-07-30T09:00-07:00');
  });

  test('la ventana de la visita se DERIVA de las citas, no se inventa', () => {
    const { visit } = buildImportPayload(FORMULARIO);

    assert.strictEqual(visit.patientFirstName, 'Paula', 'recortado');
    assert.strictEqual(visit.lang, 'en');
    assert.strictEqual(visit.startsAt, '2026-07-30T07:30-07:00', 'la primera cita');
    assert.strictEqual(visit.endsAt, '2026-07-30T11:00-07:00', 'la última cita más su duración');
  });

  test('la duración viaja como entero, no como el string del control', () => {
    const { appointments } = buildImportPayload(FORMULARIO);

    assert.strictEqual(appointments[0].durationMin, 30);
    assert.strictEqual(appointments[1].durationMin, 120);
  });

  test('los campos opcionales vacíos no se mandan vacíos: se omiten', () => {
    const { appointments } = buildImportPayload(FORMULARIO);

    assert.deepStrictEqual(Object.keys(appointments[0]).sort(), [
      'details', 'durationMin', 'locationId', 'prep', 'serviceName', 'startsAt',
    ]);
    assert.ok(!('doctor' in appointments[0]));
    assert.ok(!('prep' in appointments[1]));
    assert.ok(!('details' in appointments[1]));
  });

  test('una hora que el control no supo dar viaja como null, para que el servidor la rechace', () => {
    const { appointments, visit } = buildImportPayload({
      ...FORMULARIO,
      rows: [{ ...FORMULARIO.rows[0], startsAt: '' }],
    });

    assert.strictEqual(appointments[0].startsAt, null, 'no se omite ni se inventa: el servidor manda');
    assert.strictEqual(visit.startsAt, null, 'sin una sola cita legible no hay ventana que derivar');
    assert.strictEqual(visit.endsAt, null);
  });

  test('sin filas no fabrica un cuerpo que finja estar completo', () => {
    const { appointments, visit } = buildImportPayload({ patientFirstName: 'Paula', lang: 'es', rows: [] });

    assert.deepStrictEqual(appointments, []);
    assert.strictEqual(visit.startsAt, null);
  });
});

describe('renderImportReview — el hospedaje del Word se ve, se marca y se corrige', () => {
  for (const lang of LANGS) {
    test(`[${lang}] los campos del hotel llegan a controles editables`, () => {
      const html = renderImportReview(leidoConReservas(), ctx(lang));

      assert.ok(html.includes('data-role="import-lodging"'), 'la sección existe');
      assert.ok(html.includes('value="Quartz Hotel &amp; Spa"'), 'hotel');
      assert.ok(html.includes('value="QZ-99871"'), 'código de reservación');
      assert.ok(html.includes('value="Junior suite"'), 'tipo de habitación');
      assert.ok(html.includes('value="2 adults, 1 child"'), 'ocupación');
      assert.ok(html.includes('value="$3,164.00 MXN"'), 'el total, verbatim y con moneda (D101)');
      assert.ok(html.includes('name="nights"'), 'noches');
      assert.ok(html.includes(translate(lang, 'coordinator.lodging.hotelLabel')), 'las etiquetas se traducen');
    });
  }

  test('el check-in y el check-out salen en un control nativo, con la hora supuesta a la vista', () => {
    const html = renderImportReview(leidoConReservas(), ctx('es'));

    assert.ok(html.includes('value="2026-07-30T15:00"'), 'entrada a las 15:00');
    assert.ok(html.includes('value="2026-08-01T12:00"'), 'salida a las 12:00');
    assert.ok(veces(html, 'type="datetime-local" name="checkIn"') === 1);
    assert.ok(
      html.includes(translate('es', 'coordinator.import.note.timeAssumed')(
        { code: 'timeAssumed', from: 'Check-in', to: '3:00 PM' },
      )),
      'la hora que nadie escribió se dice, no se guarda en silencio (D106)',
    );
  });

  test('una casilla de plantilla sin llenar no llega marcada, y se explica por qué', () => {
    const html = renderImportReview(leidoConReservas(), ctx('es'));
    const casilla = html.slice(html.indexOf('name="breakfastIncluded"') - 60, html.indexOf('name="breakfastIncluded"') + 40);

    assert.ok(!casilla.includes('checked'), '[Yes / No] jamás se importa como sí (D103)');
    assert.ok(html.includes(translate('es', 'coordinator.import.note.templateBlank')(
      { code: 'templateBlank', text: 'Breakfast included' },
    )));
  });

  test('un documento sin tabla de hotel no pinta la sección vacía', () => {
    const html = renderImportReview(leido(), ctx('es'));

    assert.ok(!html.includes('data-role="import-lodging"'), 'lo que el documento no trae, no se inventa');
  });

  test('el bloque que necesita atención se resalta, como las filas de citas', () => {
    const html = renderImportReview(leidoConReservas(), ctx('es'));

    assert.ok(html.includes('nc-coord-import-block--attention'));
    assert.ok(IMPORT_CSS.includes('.nc-coord-import-block--attention'), 'la clase tiene estilo, no es decorativa');
  });
});

describe('renderImportReview — un viaje redondo son dos traslados en pantalla', () => {
  test('el round-trip del documento pinta DOS bloques, ida y regreso (D104)', () => {
    const html = renderImportReview(leidoConReservas(), ctx('es'));

    assert.strictEqual(veces(html, 'data-role="import-transfer"'), 2);
    assert.ok(html.includes('value="2026-07-29T09:00"'), 'la recogida');
    assert.ok(html.includes('value="2026-08-01T14:00"'), 'el regreso');
  });

  test('el punto de encuentro sale del catálogo; el del regreso se queda por elegir', () => {
    const html = renderImportReview(leidoConReservas(), ctx('es'));

    assert.ok(html.includes('value="san_diego_airport" selected'), 'el de la llegada, reconocido (D105)');
    assert.strictEqual(veces(html, 'value="san_diego_airport" selected'), 1, 'el regreso NO lo hereda');
    assert.strictEqual(veces(html, 'name="meetingPointId"'), 2);
    assert.ok(html.includes(translate('es', 'coordinator.import.note.meetingPointMissing')));
  });

  test('el tipo de vehículo se elige de una lista; la marca y el modelo llegan partidos', () => {
    const html = renderImportReview(leidoConReservas(), ctx('es'));

    assert.strictEqual(veces(html, 'name="vehicleType"'), 2);
    for (const tipo of VEHICLE_TYPES) {
      assert.ok(html.includes(`value="${tipo}"`), `la carrocería ${tipo} se puede elegir`);
    }
    assert.ok(!html.includes('value="Kia Seltos"'), 'el nombre comercial no se cuela al enum');
    assert.ok(html.includes('value="Kia"') && html.includes('value="Seltos"'));
    assert.ok(html.includes(translate('es', 'coordinator.import.note.vehicleTypeMissing')));
  });

  test('el teléfono llega con la lada que le pusimos nosotros, y lo dice', () => {
    const html = renderImportReview(leidoConReservas(), ctx('es'));

    assert.ok(html.includes('value="+52 664 163 1965"'));
    assert.ok(html.includes(translate('es', 'coordinator.import.note.countryCodeAssumed')(
      { code: 'countryCodeAssumed', from: '664 163 1965', to: '+52 664 163 1965' },
    )), 'un número de EE.UU. mal prefijado manda al chofer a un WhatsApp que no existe');
  });

  test('una recogida anterior al check-in se dice, no se corrige', () => {
    const html = renderImportReview(leidoConReservas(), ctx('es'));

    assert.ok(html.includes(translate('es', 'coordinator.import.note.pickupBeforeCheckIn')(
      { code: 'pickupBeforeCheckIn', from: '2026-07-30', to: '2026-07-29' },
    )));
  });

  test('un documento sin tabla de transporte no pinta ningún traslado', () => {
    const html = renderImportReview(leido(), ctx('es'));

    assert.ok(!html.includes('data-role="import-transfer"'));
  });
});

describe('renderImportReview — el Guest del hotel se contrasta con el paciente (D102)', () => {
  const OTRO = HOTEL.map((f) => (f[0] === 'Guest' ? ['Guest', 'Amy Kusonah'] : f));

  test('un huésped distinto se avisa junto a la casilla que confirma el nombre', () => {
    const html = renderImportReview(leidoConReservas([OTRO, TRANSPORTE, FILAS]), ctx('es'));

    const texto = translate('es', 'coordinator.import.note.guestMismatch')(
      { code: 'guestMismatch', from: 'Amy Kusonah', to: 'Paula Rivera' },
    );
    assert.ok(html.includes(texto), 'es el guard que le faltó al documento de Amy (D84)');
    assert.ok(
      html.indexOf(texto) < html.indexOf('data-role="import-lodging"'),
      'arriba, junto a la confirmación del nombre: es una decisión sobre quién es el paciente',
    );
  });

  test('un huésped que sí es el paciente no genera ruido', () => {
    const html = renderImportReview(leidoConReservas(), ctx('es'));

    assert.ok(!html.includes('guestMismatch'), 'ni el código crudo ni su texto');
  });
});

describe('buildImportPayload — el hospedaje y los traslados viajan con las citas (D107)', () => {
  const FORMA = {
    patientFirstName: 'Paula',
    lang: 'es',
    rows: [{
      startsAt: '2026-07-30T07:30', durationMin: '30', serviceName: 'BLOOD WORK',
      locationId: 'floor_10', prep: '', doctor: '', details: '',
    }],
    lodging: {
      hotel: ' Quartz Hotel & Spa ', reservationCode: 'QZ-99871',
      checkIn: '2026-07-30T15:00', checkOut: '2026-08-01T12:00',
      roomType: 'Junior suite', nights: '2', occupancy: '2 adults', total: '$3,164.00 MXN',
      breakfastIncluded: false, recoveryRoom: true,
    },
    transfers: [{
      kind: 'arrival', scheduledAt: '2026-07-29T09:00', meetingPointId: 'san_diego_airport',
      flightNumber: 'AM 672', driverName: ' Juan Ibarra ', driverPhone: '+52 664 163 1965',
      vehicleType: 'suv', vehicleMake: 'Kia', vehicleModel: 'Seltos', vehicleColor: '',
      vehiclePlate: 'AUE105A', notes: 'Llega media hora antes.',
    }],
  };

  test('el hospedaje sale con las fechas ya en ISO de Tijuana', () => {
    const { lodging } = buildImportPayload(FORMA);

    assert.strictEqual(lodging.hotel, 'Quartz Hotel & Spa', 'recortado');
    assert.strictEqual(lodging.checkIn, '2026-07-30T15:00-07:00');
    assert.strictEqual(lodging.checkOut, '2026-08-01T12:00-07:00');
    assert.strictEqual(lodging.roomType, 'Junior suite');
    assert.strictEqual(lodging.occupancy, '2 adults');
    assert.strictEqual(lodging.total, '$3,164.00 MXN', 'verbatim: convertirlo a número pierde la moneda');
  });

  test('las noches viajan como entero y las casillas como booleanos', () => {
    const { lodging } = buildImportPayload(FORMA);

    assert.strictEqual(lodging.nights, 2);
    assert.strictEqual(lodging.breakfastIncluded, false);
    assert.strictEqual(lodging.recoveryRoom, true);
  });

  test('unas noches en blanco no se vuelven cero', () => {
    const { lodging } = buildImportPayload({ ...FORMA, lodging: { ...FORMA.lodging, nights: '' } });

    assert.strictEqual(lodging.nights, '', 'el servidor lo lee como "no dijo", no como "cero noches"');
  });

  test('el traslado se rearma con sus sub-objetos, como los espera el servidor', () => {
    const { transfers } = buildImportPayload(FORMA);

    assert.strictEqual(transfers.length, 1);
    assert.deepStrictEqual(transfers[0], {
      kind: 'arrival',
      scheduledAt: '2026-07-29T09:00-07:00',
      meetingPointId: 'san_diego_airport',
      flightNumber: 'AM 672',
      driver: { name: 'Juan Ibarra', phone: '+52 664 163 1965' },
      vehicle: { type: 'suv', make: 'Kia', model: 'Seltos', color: '', plate: 'AUE105A' },
      notes: 'Llega media hora antes.',
    });
  });

  test('una hora que el control no supo dar viaja como null, para que el servidor la rechace', () => {
    const { lodging, transfers } = buildImportPayload({
      ...FORMA,
      lodging: { ...FORMA.lodging, checkIn: '' },
      transfers: [{ ...FORMA.transfers[0], scheduledAt: '' }],
    });

    assert.strictEqual(lodging.checkIn, null, 'ni se omite ni se inventa (D75)');
    assert.strictEqual(transfers[0].scheduledAt, null);
  });

  test('un documento sin reservas no manda hospedaje, y manda la lista de traslados vacía', () => {
    const cuerpo = buildImportPayload({ patientFirstName: 'Paula', lang: 'es', rows: FORMA.rows });

    assert.ok(!('lodging' in cuerpo), 'una llave presente y vacía haría que el servidor exija el hotel');
    assert.deepStrictEqual(cuerpo.transfers, []);
  });
});

describe('attachImportScreen — cableado defensivo sin DOM real', () => {
  test('no truena con un rootEl mínimo (querySelector no-op) y sin ctx', () => {
    const rootEl = { querySelector: () => null, querySelectorAll: () => [] };
    assert.doesNotThrow(() => attachImportScreen(rootEl, {}));
  });

  test('tampoco truena si le pasan null', () => {
    assert.doesNotThrow(() => attachImportScreen(null, {}));
  });
});
