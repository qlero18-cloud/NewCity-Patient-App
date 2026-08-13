// Etapa L — El intérprete de las tablas de hospedaje y transporte.
//
// La FORMA es copia fiel del .docx real de un check-up (etiquetas exactas,
// dos puntos incluidos donde los trae y ausentes donde no); los datos son
// inventados, porque los expedientes reales no entran al repositorio (D88).
//
// Este módulo propone y la coordinadora dispone (D84). Casi ninguna prueba
// de aquí exige un dato perfecto: exigen que lo supuesto quede MARCADO. El
// transporte mete al expediente el nombre, el teléfono y las placas de un
// tercero, y el hospedaje manda el precio al teléfono del paciente: los dos
// son datos que nadie va a poder desmentir después si entran en silencio.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseBooking } from '../../src/domain/itineraryBooking.js';
import { transferPoints } from '../../src/data/transferPoints.js';

// El bloque de hospedaje del documento real, con datos inventados. Sin la
// fila del título: parseItinerary la consume al repartir la tabla.
const HOSPEDAJE = [
  ['Hotel', 'Hotel Inventado & Spa'],
  ['Guest', 'Paciente Inventada'],
  ['Check-in', 'July 27th'],
  ['Check-out', 'July 29th'],
  ['Nights', '2'],
  ['Occupancy', '2 adults, 2 children'],
  ['Room type', 'STDB | Standard Double'],
  ['Total', '$1,234.00 MXN'],
  ['Breakfast included', '[Yes / No]'],
  ['Recovery room', '[Yes / No]'],
];

const TRANSPORTE = [
  ['Transfer type:', 'Round-trip'],
  ['Pickup date and time', 'July 27th 9:00AM'],
  ['Return date and time', 'July 29th 5:00PM'],
  ['Meeting point', 'San Diego Airport'],
  ['Flight (optional)', 'az1950h'],
  ['Driver name', 'Nombre Inventado'],
  ['Driver phone', '664 000 0000'],
  ['Vehicle type', 'Kia Seltos'],
  ['License plate', 'xyz123a'],
  ['Additional notes:', 'El chofer se pondrá en contacto contigo.'],
];

function leer(entrada = {}) {
  return parseBooking({
    year: 2026,
    patientName: 'Paciente Inventada',
    transferPoints,
    ...entrada,
  });
}

function hospedaje(filas = HOSPEDAJE, entrada = {}) {
  return leer({ lodgingRows: filas, ...entrada }).lodging;
}

function traslados(filas = TRANSPORTE, entrada = {}) {
  return leer({ transportRows: filas, ...entrada }).transfers;
}

function codigos(registro) {
  return registro.notes.map((n) => n.code);
}

function nota(registro, code) {
  return registro.notes.find((n) => n.code === code);
}

describe('parseBooking — hospedaje', () => {
  test('cada etiqueta del documento cae en su campo', () => {
    const { input } = hospedaje();
    assert.strictEqual(input.hotel, 'Hotel Inventado & Spa');
    assert.strictEqual(input.roomType, 'STDB | Standard Double');
    assert.strictEqual(input.occupancy, '2 adults, 2 children');
    assert.strictEqual(input.nights, 2);
    assert.strictEqual(input.total, '$1,234.00 MXN');
  });

  test('el total se guarda tal cual, con su moneda y sus comas (D101)', () => {
    // Convertirlo a 1234 pierde el "MXN", y un precio sin moneda al lado de
    // un paciente que paga en dólares es peor que no tener precio.
    assert.strictEqual(hospedaje([['Total', '$1,234.00 MXN']]).input.total, '$1,234.00 MXN');
  });

  test('las fechas toman el año del encabezado, que es donde único vive', () => {
    const l = hospedaje();
    assert.strictEqual(l.input.checkIn, '2026-07-27T15:00-07:00');
    assert.strictEqual(l.input.checkOut, '2026-07-29T12:00-07:00');
  });

  test('la hora la ponemos nosotros y se dice que la pusimos nosotros (D106)', () => {
    const l = hospedaje();
    const supuestas = l.notes.filter((n) => n.code === 'timeAssumed');
    assert.deepStrictEqual(supuestas.map((n) => n.from), ['Check-in', 'Check-out']);
    assert.ok(l.needsAttention);
  });

  test('si el documento SÍ trae la hora, se respeta y no se marca', () => {
    const l = hospedaje([['Check-in', 'July 27th 6:00PM'], ['Check-out', 'July 29th']]);
    assert.strictEqual(l.input.checkIn, '2026-07-27T18:00-07:00');
    assert.deepStrictEqual(nota(l, 'timeAssumed').from, 'Check-out');
    assert.strictEqual(l.notes.filter((n) => n.code === 'timeAssumed').length, 1);
  });

  test('sin año en el encabezado las fechas quedan vacías y marcadas, nunca con la de hoy', () => {
    // INV-1: este módulo no lee el reloj. Rellenar con el año actual daría
    // un check-in de aspecto perfectamente válido en el año equivocado.
    const l = hospedaje(HOSPEDAJE, { year: null });
    assert.strictEqual(l.input.checkIn, '');
    assert.strictEqual(l.input.checkOut, '');
    assert.ok(codigos(l).includes('noYear'));
  });

  test('el cruce de año: un check-out de enero cae en el año siguiente', () => {
    const l = hospedaje([['Check-in', 'December 31st'], ['Check-out', 'January 2nd']]);
    assert.ok(l.input.checkIn.startsWith('2026-12-31'));
    assert.ok(l.input.checkOut.startsWith('2027-01-02'));
  });

  test('una fecha que no se puede leer se marca en vez de inventarse', () => {
    const l = hospedaje([['Check-in', 'el jueves que viene']]);
    assert.strictEqual(l.input.checkIn, '');
    assert.strictEqual(nota(l, 'dateUnreadable').text, 'el jueves que viene');
  });

  test('[Yes / No] es una casilla sin llenar, no un sí (D103)', () => {
    const l = hospedaje();
    assert.strictEqual(l.input.breakfastIncluded, false);
    assert.strictEqual(l.input.recoveryRoom, false);
    const blancos = l.notes.filter((n) => n.code === 'templateBlank').map((n) => n.text);
    assert.deepStrictEqual(blancos, ['Breakfast included', 'Recovery room']);
  });

  test('la casilla sin llenar vacía CUALQUIER campo, no solo esos dos', () => {
    const l = hospedaje([['Hotel', '[Quartz / Grand Hotel]'], ['Room type', '[Single / Double]']]);
    assert.strictEqual(l.input.hotel, '');
    assert.strictEqual(l.input.roomType, '');
    assert.strictEqual(l.notes.filter((n) => n.code === 'templateBlank').length, 2);
  });

  test('un "Yes" de verdad sí se importa', () => {
    const l = hospedaje([['Breakfast included', 'Yes'], ['Recovery room', 'No']]);
    assert.strictEqual(l.input.breakfastIncluded, true);
    assert.strictEqual(l.input.recoveryRoom, false);
  });

  test('una casilla que no es sí ni no se marca, no se lee como no', () => {
    // "Included" es casi seguro que sí, y por eso mismo no se decide aquí:
    // un `false` silencioso le quita el desayuno a alguien que sí lo pagó, y
    // en pantalla se ve idéntico a un "No" del documento.
    const l = hospedaje([['Breakfast included', 'Sólo fines de semana']]);
    assert.strictEqual(l.input.breakfastIncluded, false);
    const n = nota(l, 'valueUnreadable');
    assert.strictEqual(n.from, 'Breakfast included');
    assert.strictEqual(n.text, 'Sólo fines de semana');
    assert.ok(l.needsAttention);
  });

  test('unas noches que no son un número se marcan en vez de volverse cero', () => {
    const l = hospedaje([['Nights', 'dos']]);
    assert.strictEqual(l.input.nights, null);
    assert.strictEqual(nota(l, 'valueUnreadable').text, 'dos');
  });

  test('las noches se contrastan con las fechas y el desajuste se marca', () => {
    const l = hospedaje([['Check-in', 'July 27th'], ['Check-out', 'July 29th'], ['Nights', '5']]);
    const n = nota(l, 'nightsMismatch');
    assert.strictEqual(n.from, 5);
    assert.strictEqual(n.to, 2);
  });

  test('cuando cuadran, no se marca nada', () => {
    assert.ok(!codigos(hospedaje()).includes('nightsMismatch'));
  });

  test('Guest se contrasta con el paciente y NO se guarda (D102)', () => {
    const l = hospedaje(HOSPEDAJE, { patientName: 'Otra Persona' });
    const n = nota(l, 'guestMismatch');
    assert.strictEqual(n.from, 'Paciente Inventada');
    assert.strictEqual(n.to, 'Otra Persona');
    assert.ok(!('guest' in l.input), 'el nombre del huésped no debe viajar al servidor');
    assert.ok(!/Paciente Inventada/.test(JSON.stringify(l.input)));
  });

  test('el mismo nombre escrito con otras mayúsculas o acentos no es un desajuste', () => {
    const l = hospedaje([['Guest', 'PACIENTE  INVENTADA']], { patientName: 'Paciente Inventada' });
    assert.ok(!codigos(l).includes('guestMismatch'));
  });

  test('una etiqueta que no conocemos se marca en vez de tirarse', () => {
    // Tirar en silencio una fila que el documento sí traía es como se pierde
    // un dato que nadie va a echar de menos hasta que hace falta.
    const l = hospedaje([['Hotel', 'Hotel Inventado & Spa'], ['Parking', 'Included']]);
    assert.strictEqual(nota(l, 'unknownLabel').text, 'Parking');
  });

  test('los campos largos se marcan, no se recortan a la mitad', () => {
    const l = hospedaje([['Room type', 'x'.repeat(121)], ['Total', 'y'.repeat(41)]]);
    const largos = l.notes.filter((n) => n.code === 'valueTooLong').map((n) => n.text);
    assert.deepStrictEqual(largos, ['Room type', 'Total']);
    assert.strictEqual(l.input.roomType.length, 121);
  });

  test('sin tabla de hospedaje no hay hospedaje, no un hospedaje vacío', () => {
    assert.strictEqual(leer().lodging, null);
    assert.strictEqual(leer({ lodgingRows: [] }).lodging, null);
  });
});

describe('parseBooking — transporte', () => {
  test('cada etiqueta del documento cae en su campo', () => {
    const [llegada] = traslados();
    assert.strictEqual(llegada.input.driver.name, 'Nombre Inventado');
    assert.strictEqual(llegada.input.notes, 'El chofer se pondrá en contacto contigo.');
    // Vuelo y placas en mayúsculas, como los guarda el servidor.
    assert.strictEqual(llegada.input.flightNumber, 'AZ1950H');
    assert.strictEqual(llegada.input.vehicle.plate, 'XYZ123A');
  });

  test('"Round-trip" son DOS traslados, ida y vuelta (D104)', () => {
    const t = traslados();
    assert.strictEqual(t.length, 2);
    assert.deepStrictEqual(t.map((x) => x.input.kind), ['arrival', 'departure']);
    assert.strictEqual(t[0].input.scheduledAt, '2026-07-27T09:00-07:00');
    assert.strictEqual(t[1].input.scheduledAt, '2026-07-29T17:00-07:00');
    assert.ok(codigos(t[0]).includes('roundTrip'));
  });

  test('los datos del chofer y del vehículo van en los dos, que es el mismo servicio', () => {
    const t = traslados();
    assert.strictEqual(t[1].input.driver.name, 'Nombre Inventado');
    assert.strictEqual(t[1].input.vehicle.model, 'Seltos');
  });

  test('un solo sentido es un solo traslado', () => {
    const t = traslados([['Transfer type:', 'One-way'], ['Pickup date and time', 'July 27th 9:00AM']]);
    assert.strictEqual(t.length, 1);
    assert.strictEqual(t[0].input.kind, 'arrival');
  });

  test('si dice redondo pero falta una de las dos fechas, se dice', () => {
    const t = traslados([['Transfer type:', 'Round-trip'], ['Pickup date and time', 'July 27th 9:00AM']]);
    assert.strictEqual(t.length, 1);
    assert.ok(codigos(t[0]).includes('roundTripIncomplete'));
  });

  test('sin ninguna fecha no se tira el chofer: queda un traslado por fechar', () => {
    const t = traslados([['Driver name', 'Nombre Inventado'], ['License plate', 'xyz123a']]);
    assert.strictEqual(t.length, 1);
    assert.strictEqual(t[0].input.scheduledAt, '');
    assert.ok(codigos(t[0]).includes('dateMissing'));
  });

  test('una fecha sin hora deja la hora en blanco: a qué hora pasan por ti no se adivina', () => {
    // Al revés que el check-in del hotel, donde las 3 de la tarde son una
    // convención de la industria. Una recogida a las 00:00 supuesta manda al
    // paciente a la banqueta del aeropuerto de madrugada.
    const t = traslados([['Pickup date and time', 'July 27th']]);
    assert.strictEqual(t[0].input.scheduledAt, '');
    assert.strictEqual(nota(t[0], 'timeMissing').text, 'Pickup date and time');
  });

  test('el punto de encuentro sale del catálogo, nunca como texto libre (D40, D70)', () => {
    const t = traslados();
    assert.strictEqual(t[0].input.meetingPointId, 'san_diego_airport');
  });

  test('un punto que no está en el catálogo se marca y se deja vacío', () => {
    const t = traslados([['Pickup date and time', 'July 27th 9:00AM'], ['Meeting point', 'La casa de su tía']]);
    assert.strictEqual(t[0].input.meetingPointId, '');
    assert.strictEqual(nota(t[0], 'meetingPointUnknown').text, 'La casa de su tía');
  });

  test('el regreso no hereda el punto de la ida: el documento no dice de dónde sale', () => {
    // El aeropuerto de San Diego es donde RECOGEN al paciente. De dónde lo
    // levantan para volver no aparece en ninguna parte del documento, y
    // suponer "del hotel" es escribir en el expediente algo que nadie dijo.
    const t = traslados();
    assert.strictEqual(t[1].input.meetingPointId, '');
    assert.ok(codigos(t[1]).includes('meetingPointMissing'));
  });

  test('el teléfono sin lada se precarga con +52 y se marca (D106)', () => {
    const t = traslados();
    const n = nota(t[0], 'countryCodeAssumed');
    assert.strictEqual(t[0].input.driver.phone, '+52 664 000 0000');
    assert.strictEqual(n.from, '664 000 0000');
    assert.strictEqual(n.to, '+52 664 000 0000');
  });

  test('un teléfono que ya trae lada se deja en paz', () => {
    const t = traslados([['Driver phone', '+1 619 000 0000'], ['Pickup date and time', 'July 27th 9:00AM']]);
    assert.strictEqual(t[0].input.driver.phone, '+1 619 000 0000');
    assert.ok(!codigos(t[0]).includes('countryCodeAssumed'));
  });

  test('un teléfono que no son diez dígitos no se le inventa lada', () => {
    const t = traslados([['Driver phone', '1234'], ['Pickup date and time', 'July 27th 9:00AM']]);
    assert.strictEqual(t[0].input.driver.phone, '1234');
    assert.ok(codigos(t[0]).includes('phoneUnreadable'));
    assert.ok(!codigos(t[0]).includes('countryCodeAssumed'));
  });

  test('"Kia Seltos" es marca y modelo, y el TIPO lo elige la coordinadora', () => {
    // Un Seltos es una SUV, pero deducir la carrocería del nombre comercial
    // es adivinar, y el <select> del panel está a un clic.
    const [t] = traslados();
    assert.strictEqual(t.input.vehicle.make, 'Kia');
    assert.strictEqual(t.input.vehicle.model, 'Seltos');
    assert.strictEqual(t.input.vehicle.type, '');
    assert.strictEqual(nota(t, 'vehicleSplit').text, 'Kia Seltos');
    assert.ok(codigos(t).includes('vehicleTypeMissing'));
  });

  test('si el documento sí trae un tipo del catálogo, se usa', () => {
    for (const [texto, tipo] of [['SUV', 'suv'], ['Van', 'van'], ['sedan', 'sedan']]) {
      const [t] = traslados([['Vehicle type', texto], ['Pickup date and time', 'July 27th 9:00AM']]);
      assert.strictEqual(t.input.vehicle.type, tipo, `falló con ${texto}`);
      assert.strictEqual(t.input.vehicle.make, '');
      assert.ok(!codigos(t).includes('vehicleTypeMissing'));
    }
  });

  test('la recogida anterior al check-in se marca, no se corrige', () => {
    // Puede ser un dedazo o una llegada anticipada de verdad. Quien sabe
    // cuál de las dos es, es la coordinadora.
    const r = leer({ lodgingRows: HOSPEDAJE, transportRows: [['Pickup date and time', 'July 26th 9:00AM']] });
    const n = nota(r.transfers[0], 'pickupBeforeCheckIn');
    assert.strictEqual(n.from, '2026-07-27');
    assert.strictEqual(n.to, '2026-07-26');
    assert.strictEqual(r.transfers[0].input.scheduledAt, '2026-07-26T09:00-07:00');
  });

  test('sin tabla de hospedaje no se puede comparar, y no se inventa la comparación', () => {
    const t = traslados([['Pickup date and time', 'July 26th 9:00AM']]);
    assert.ok(!codigos(t[0]).includes('pickupBeforeCheckIn'));
  });

  test('las notas largas se marcan', () => {
    const t = traslados([['Additional notes:', 'z'.repeat(281)], ['Pickup date and time', 'July 27th 9:00AM']]);
    assert.deepStrictEqual(nota(t[0], 'valueTooLong').text, 'Additional notes');
  });

  test('sin tabla de transporte no hay traslados', () => {
    assert.deepStrictEqual(leer().transfers, []);
    assert.deepStrictEqual(leer({ transportRows: [] }).transfers, []);
  });
});

describe('parseBooking — lo que no debe hacer', () => {
  test('no muta las filas que recibe', () => {
    const copia = JSON.parse(JSON.stringify([HOSPEDAJE, TRANSPORTE]));
    leer({ lodgingRows: HOSPEDAJE, transportRows: TRANSPORTE });
    assert.deepStrictEqual([HOSPEDAJE, TRANSPORTE], copia);
  });

  test('leer dos veces da exactamente lo mismo (INV-1: no lee el reloj)', () => {
    const entrada = { lodgingRows: HOSPEDAJE, transportRows: TRANSPORTE };
    assert.deepStrictEqual(leer(entrada), leer(entrada));
  });

  test('entradas basura no revientan', () => {
    for (const basura of [null, undefined, 42, 'no soy filas', {}]) {
      const r = parseBooking({ lodgingRows: basura, transportRows: basura, transferPoints: basura, year: basura });
      assert.strictEqual(r.lodging, null, `falló con ${JSON.stringify(basura)}`);
      assert.deepStrictEqual(r.transfers, []);
    }
    assert.deepStrictEqual(parseBooking(), { lodging: null, transfers: [] });
  });

  test('los doce meses se leen, no solo julio', () => {
    const meses = [
      ['January 1st', '01-01'], ['February 2nd', '02-02'], ['March 3rd', '03-03'],
      ['April 4th', '04-04'], ['May 5th', '05-05'], ['June 6th', '06-06'],
      ['July 7th', '07-07'], ['August 8th', '08-08'], ['September 9th', '09-09'],
      ['October 10th', '10-10'], ['November 11th', '11-11'], ['December 12th', '12-12'],
    ];
    for (const [texto, esperado] of meses) {
      const l = hospedaje([['Check-in', texto]]);
      assert.ok(l.input.checkIn.startsWith(`2026-${esperado}`), `falló con ${texto}: ${l.input.checkIn}`);
    }
  });
});
