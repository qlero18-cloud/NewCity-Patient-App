// Mi estancia — lo que el PACIENTE ve de su hotel.
//
// La pantalla existe desde la fase 05 y hasta hoy no tenía pruebas: se creó
// cuando el hospedaje se capturaba a mano y solo traía cinco datos. La
// Etapa L le suma los cuatro que venían en el Word y se tiraban a la basura
// —tipo de habitación, noches, ocupación y total— así que este archivo
// cubre las dos cosas: lo nuevo y lo que ya funcionaba y no debe romperse.
//
// Sin DOM falso (D8): renderStayScreen es pura, recibe ctx y devuelve una
// cadena. El botón de copiar se comprueba en el navegador.
//
// Lo que de verdad importa que no se rompa: que el total llegue con su
// moneda —"$3,164.00 MXN", no 3164— y que un expediente guardado ANTES de
// esta etapa, que no tiene esas cuatro llaves, no pinte cuatro renglones
// vacíos en el teléfono de quien ya tiene la app abierta.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderStayScreen } from '../../src/ui/screens/stay.js';
import { translate } from '../../src/ui/i18n.js';
import { formatTimeTijuana } from '../../src/domain/index.js';

const AHORA = '2026-07-29T05:00:00-07:00';

const hospedaje = (extra = {}) => ({
  visitId: 'v1',
  hotel: 'Quartz Hotel & Spa',
  reservationCode: 'QZ-88213',
  checkIn: '2026-07-30T15:00-07:00',
  checkOut: '2026-08-01T12:00-07:00',
  breakfastIncluded: true,
  recoveryRoom: false,
  roomType: 'Junior Suite',
  nights: 2,
  occupancy: '2 adultos',
  total: '$3,164.00 MXN',
  updatedAt: '2026-07-20T10:00-07:00',
  updatedBy: 'coord_1',
  ...extra,
});

const ctx = (lodging = hospedaje(), lang = 'es') => ({
  lodging,
  now: AHORA,
  lang,
  t: (path) => translate(lang, path),
});

describe('renderStayScreen — lo que ya hacía', () => {
  test('dice el hotel, el código y las fechas, en los dos idiomas', () => {
    for (const lang of ['es', 'en']) {
      const html = renderStayScreen(ctx(hospedaje(), lang));
      assert.ok(html.includes(translate(lang, 'stay.title')), `falta el título en ${lang}`);
      assert.ok(html.includes('Quartz Hotel &amp; Spa'), `falta el hotel escapado en ${lang}`);
      assert.ok(html.includes('QZ-88213'), `falta el código en ${lang}`);
      assert.ok(html.includes(formatTimeTijuana('2026-07-30T15:00-07:00', lang)), `falta la hora de entrada en ${lang}`);
      assert.ok(html.includes(formatTimeTijuana('2026-08-01T12:00-07:00', lang)), `falta la hora de salida en ${lang}`);
    }
  });

  test('la hora sale de formatTimeTijuana, no del ISO en crudo', () => {
    const html = renderStayScreen(ctx());
    assert.ok(!html.includes('2026-07-30T15:00-07:00'), 'el paciente no debe ver un ISO 8601');
  });

  test('el código de reservación trae botón de copiar', () => {
    const html = renderStayScreen(ctx());
    assert.ok(html.includes('data-role="copy-code"'), 'falta el botón de copiar');
    assert.ok(html.includes('data-code="QZ-88213"'), 'el botón debe llevar el código a copiar');
  });

  test('desayuno y recovery se pintan como sí/no, no como true/false', () => {
    const html = renderStayScreen(ctx());
    assert.ok(html.includes(translate('es', 'stay.yes')), 'falta el sí del desayuno');
    assert.ok(html.includes(translate('es', 'stay.no')), 'falta el no del recovery');
    assert.ok(!html.includes('true') && !html.includes('false'), 'no deben verse booleanos crudos');
  });

  // app.js no enruta aquí sin hospedaje; la pantalla además se niega a
  // pintarse vacía (defensa en profundidad, mismo criterio que transfer.js).
  test('sin hospedaje devuelve cadena vacía en vez de una pantalla en blanco', () => {
    // Sin el ctx() de arriba a propósito: su valor por omisión se tragaría
    // el `undefined` y la prueba pasaría sin probar nada.
    const vacio = (lodging) => ({ lodging, now: AHORA, lang: 'es', t: (p) => translate('es', p) });
    assert.strictEqual(renderStayScreen(vacio(null)), '');
    assert.strictEqual(renderStayScreen(vacio(undefined)), '');
  });
});

describe('renderStayScreen — los cuatro campos que trae el Word (D101)', () => {
  test('muestra tipo de habitación, noches, ocupación y total, en los dos idiomas', () => {
    for (const lang of ['es', 'en']) {
      const html = renderStayScreen(ctx(hospedaje(), lang));
      for (const clave of ['roomType', 'nights', 'occupancy', 'total']) {
        assert.ok(html.includes(translate(lang, `stay.${clave}`)), `falta la etiqueta ${clave} en ${lang}`);
      }
      assert.ok(html.includes('Junior Suite'), `falta el tipo de habitación en ${lang}`);
      assert.ok(html.includes('2 adultos'), `falta la ocupación en ${lang}`);
    }
  });

  // El cliente decidió explícitamente que el precio viaje al teléfono. Que
  // viaje CON su moneda es lo que hace la diferencia entre "$3,164.00 MXN" y
  // un "3164" que el paciente puede leer como dólares.
  test('el total conserva la moneda y el formato del documento', () => {
    const html = renderStayScreen(ctx());
    assert.ok(html.includes('$3,164.00 MXN'), 'el total se pinta verbatim, sin convertir a número');
  });

  test('las noches se ven como número', () => {
    const html = renderStayScreen(ctx());
    assert.match(html, new RegExp(`${translate('es', 'stay.nights')}</span>\\s*2`), 'falta el número de noches');
  });
});

describe('renderStayScreen — lo que el hotel no dijo', () => {
  // El hospedaje se puede capturar a mano y el Word no siempre trae los
  // cuatro. Un renglón con la etiqueta y nada al lado se lee como un error
  // de la app, no como "no lo sabemos".
  test('un campo vacío no pinta su renglón', () => {
    const html = renderStayScreen(ctx(hospedaje({
      roomType: '', nights: null, occupancy: '', total: '',
    })));
    for (const clave of ['roomType', 'nights', 'occupancy', 'total']) {
      assert.ok(!html.includes(translate('es', `stay.${clave}`)), `no debe pintarse la etiqueta ${clave} sin dato`);
    }
    assert.ok(html.includes('QZ-88213'), 'el resto de la tarjeta sigue ahí');
  });

  // Compatibilidad con lo ya desplegado: un expediente guardado antes de
  // esta etapa no tiene ninguna de las cuatro llaves.
  test('un expediente anterior a la Etapa L se pinta igual que antes', () => {
    const viejo = hospedaje();
    delete viejo.roomType;
    delete viejo.nights;
    delete viejo.occupancy;
    delete viejo.total;
    const html = renderStayScreen(ctx(viejo));
    assert.ok(!html.includes('undefined'), 'no debe filtrarse un undefined al teléfono');
    for (const clave of ['roomType', 'nights', 'occupancy', 'total']) {
      assert.ok(!html.includes(translate('es', `stay.${clave}`)), `no debe pintarse la etiqueta ${clave}`);
    }
  });
});
