// Etapa K — pruebas de formatWeeklyHours (src/domain/time.js).
//
// Hasta aquí la app NUNCA escribía un horario: src/ui/screens/help.js y
// src/ui/screens/hours.js pasaban `lines: []` a la ficha, así que el
// paciente veía el título y el distintivo "Abierto ahora / Cerrado ahora"
// pero ningún horario. Con datos de relleno (7 días 07:00–20:00 inventados)
// daba lo mismo; con el horario real del hospital, no (D97).
//
// El reloj de 12 horas es el mismo que ya usa formatTimeTijuana en el resto
// de la app ("9:00 a.m." en español, "9:00 AM" en inglés): un horario que
// dijera "8:00–18:00" junto a un itinerario que dice "8:00 a.m." serían dos
// convenciones en la misma pantalla.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatWeeklyHours } from '../../src/domain/time.js';

function horario(dias) {
  return { tz: 'America/Tijuana', weekly: dias, exceptions: [] };
}

// Los tres horarios reales que entran en la Etapa K, más el de relleno que
// todavía llevan los pisos de consultorios.
const CASE_MANAGEMENT = horario([
  ...[1, 2, 3, 4, 5].map((day) => ({ day, open: '08:00', close: '18:00' })),
  { day: 6, open: '08:00', close: '13:30' },
]);

const COMPASS = horario([1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '06:00', close: '20:00' })));

const RELLENO = horario([0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '07:00', close: '20:00' })));

describe('formatWeeklyHours — los horarios reales del hospital', () => {
  test('Case Management en español: L–V, sábado corto, domingo cerrado', () => {
    assert.deepStrictEqual(formatWeeklyHours(CASE_MANAGEMENT, 'es'), [
      'Lunes a viernes · 8:00 a.m.–6:00 p.m.',
      'Sábado · 8:00 a.m.–1:30 p.m.',
      'Domingo · cerrado',
    ]);
  });

  test('Case Management en inglés', () => {
    assert.deepStrictEqual(formatWeeklyHours(CASE_MANAGEMENT, 'en'), [
      'Monday to Friday · 8:00 AM–6:00 PM',
      'Saturday · 8:00 AM–1:30 PM',
      'Sunday · closed',
    ]);
  });

  test('Compass: lunes a sábado corridos, domingo cerrado', () => {
    assert.deepStrictEqual(formatWeeklyHours(COMPASS, 'es'), [
      'Lunes a sábado · 6:00 a.m.–8:00 p.m.',
      'Domingo · cerrado',
    ]);
    assert.deepStrictEqual(formatWeeklyHours(COMPASS, 'en'), [
      'Monday to Saturday · 6:00 AM–8:00 PM',
      'Sunday · closed',
    ]);
  });

  test('los 7 días iguales se dicen en una línea, no en siete', () => {
    assert.deepStrictEqual(formatWeeklyHours(RELLENO, 'es'), ['Todos los días · 7:00 a.m.–8:00 p.m.']);
    assert.deepStrictEqual(formatWeeklyHours(RELLENO, 'en'), ['Every day · 7:00 AM–8:00 PM']);
  });
});

describe('formatWeeklyHours — agrupación', () => {
  // La semana se recorre de lunes a domingo, no de domingo a lunes, aunque
  // hours.weekly[].day use 0=domingo (la convención de isOpenNow y de
  // Date#getUTCDay). Con el orden crudo, Case Management saldría "Domingo ·
  // cerrado" ARRIBA de todo, y lunes y viernes quedarían separados por el
  // domingo en medio.
  test('el orden de entrada no cambia el resultado', () => {
    const revuelto = horario([
      { day: 6, open: '08:00', close: '13:30' },
      { day: 3, open: '08:00', close: '18:00' },
      { day: 1, open: '08:00', close: '18:00' },
      { day: 5, open: '08:00', close: '18:00' },
      { day: 2, open: '08:00', close: '18:00' },
      { day: 4, open: '08:00', close: '18:00' },
    ]);
    assert.deepStrictEqual(formatWeeklyHours(revuelto, 'es'), formatWeeklyHours(CASE_MANAGEMENT, 'es'));
  });

  test('un día suelto se nombra solo', () => {
    assert.deepStrictEqual(formatWeeklyHours(horario([{ day: 3, open: '09:00', close: '14:00' }]), 'es'), [
      'Lunes y martes · cerrado',
      'Miércoles · 9:00 a.m.–2:00 p.m.',
      'Jueves a domingo · cerrado',
    ]);
  });

  test('dos días consecutivos se unen con "y", no con "a"', () => {
    const finDeSemana = horario([1, 2, 3, 4, 5].map((day) => ({ day, open: '09:00', close: '17:00' })));
    assert.deepStrictEqual(formatWeeklyHours(finDeSemana, 'es'), [
      'Lunes a viernes · 9:00 a.m.–5:00 p.m.',
      'Sábado y domingo · cerrado',
    ]);
    assert.deepStrictEqual(formatWeeklyHours(finDeSemana, 'en'), [
      'Monday to Friday · 9:00 AM–5:00 PM',
      'Saturday and Sunday · closed',
    ]);
  });

  test('dos tramos distintos el mismo día no se inventan: gana el primero que traiga la lista', () => {
    // No hay dato real con dos tramos (comida de por medio) y el PRD no fija
    // su forma; se documenta el comportamiento en vez de inventar una.
    const dosTramos = horario([
      { day: 1, open: '08:00', close: '12:00' },
      { day: 1, open: '14:00', close: '18:00' },
    ]);
    assert.deepStrictEqual(formatWeeklyHours(dosTramos, 'es')[0], 'Lunes · 8:00 a.m.–12:00 p.m.');
  });

  test('la semana entera cerrada se dice en una línea', () => {
    assert.deepStrictEqual(formatWeeklyHours(horario([]), 'es'), ['Todos los días · cerrado']);
  });
});

describe('formatWeeklyHours — entradas que no son un horario', () => {
  test('sin argumento, null, o weekly que no es arreglo: lista vacía, no excepción', () => {
    assert.deepStrictEqual(formatWeeklyHours(), []);
    assert.deepStrictEqual(formatWeeklyHours(null, 'es'), []);
    assert.deepStrictEqual(formatWeeklyHours({}, 'es'), []);
    assert.deepStrictEqual(formatWeeklyHours({ weekly: 'lunes a viernes' }, 'es'), []);
  });

  test('un idioma desconocido cae a inglés, como el resto de la app', () => {
    assert.deepStrictEqual(formatWeeklyHours(COMPASS, 'fr'), formatWeeklyHours(COMPASS, 'en'));
  });

  test('medianoche y mediodía no se dicen "0:00" ni "12:00 a.m." por accidente', () => {
    const raro = horario([{ day: 1, open: '00:00', close: '12:00' }]);
    assert.strictEqual(formatWeeklyHours(raro, 'es')[0], 'Lunes · 12:00 a.m.–12:00 p.m.');
    assert.strictEqual(formatWeeklyHours(raro, 'en')[0], 'Monday · 12:00 AM–12:00 PM');
  });
});

describe('formatWeeklyHours — pureza (INV-1)', () => {
  test('no lee el reloj: dos llamadas separadas dan lo mismo y no muta la entrada', () => {
    const entrada = horario([{ day: 1, open: '08:00', close: '18:00' }]);
    const copia = JSON.parse(JSON.stringify(entrada));
    const a = formatWeeklyHours(entrada, 'es');
    const b = formatWeeklyHours(entrada, 'es');
    assert.deepStrictEqual(a, b);
    assert.deepStrictEqual(entrada, copia);
  });
});
