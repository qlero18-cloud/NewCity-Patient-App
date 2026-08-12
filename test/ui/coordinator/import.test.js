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
      assert.deepStrictEqual(res.counts, { read: 9, importable: 4, meals: 1, needsAttention: 2 });

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
  const EJEMPLO = { from: 'A', to: 'B', text: 'X', day: '2026-07-30', days: 40 };

  for (const lang of LANGS) {
    test(`[${lang}] cada nota y cada aviso tienen texto propio`, () => {
      for (const code of CODIGOS_NOTA) {
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

describe('attachImportScreen — cableado defensivo sin DOM real', () => {
  test('no truena con un rootEl mínimo (querySelector no-op) y sin ctx', () => {
    const rootEl = { querySelector: () => null, querySelectorAll: () => [] };
    assert.doesNotThrow(() => attachImportScreen(rootEl, {}));
  });

  test('tampoco truena si le pasan null', () => {
    assert.doesNotThrow(() => attachImportScreen(null, {}));
  });
});
