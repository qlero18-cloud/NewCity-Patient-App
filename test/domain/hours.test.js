// Fase 05 — pruebas de isOpenNow (añadido a src/domain/time.js, ver su
// comentario de cabecera para el porqué). Este archivo no depende de
// ningún dato de fase 05 en sí, solo del dominio.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isOpenNow } from '../../src/domain/time.js';

// Deriva el día de la semana (0=domingo..6=sábado) de un ISO ya conocido,
// SIN pasar por Date#getDay() (dependería de la TZ del proceso) ni por
// ninguna función de src/domain/ (sería probar isOpenNow con datos que
// vienen de la misma maquinaria que se está probando). Date.UTC +
// getUTCDay() es TZ-independiente por definición: es aritmética de
// calendario, no lectura de reloj local.
function weekdayOf(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const UNIFORME = {
  tz: 'America/Tijuana',
  weekly: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '07:00', close: '20:00' })),
  exceptions: [],
  unconfirmed: true,
};

describe('isOpenNow — horario uniforme (mismo caso que locations.js/support.js/plaza.js hoy)', () => {
  test('dentro de la ventana: abierto', () => {
    assert.strictEqual(isOpenNow(UNIFORME, '2026-03-10T12:00-07:00'), true);
  });

  test('justo en el borde de apertura y cierre: abierto (inclusivo)', () => {
    assert.strictEqual(isOpenNow(UNIFORME, '2026-03-10T07:00-07:00'), true);
    assert.strictEqual(isOpenNow(UNIFORME, '2026-03-10T20:00-07:00'), true);
  });

  test('antes de abrir o después de cerrar: cerrado', () => {
    assert.strictEqual(isOpenNow(UNIFORME, '2026-03-10T06:59-07:00'), false);
    assert.strictEqual(isOpenNow(UNIFORME, '2026-03-10T20:01-07:00'), false);
  });

  test('usa la hora de Tijuana, no la del proceso: 2026-03-11T01:30-07:00 (madrugada en Tijuana) queda cerrado aunque en UTC ya sea otro día distinto con otra hora', () => {
    // 01:30 hora Tijuana (-07:00) es 08:30 UTC del mismo día de calendario
    // en Tijuana pero ya "el día siguiente" en UTC puro — si isOpenNow
    // leyera UTC en vez de Tijuana, el resultado de una prueba mal escrita
    // podría coincidir por accidente; aquí lo que importa es que 01:30 cae
    // fuera de 07:00–20:00 sin importar qué día UTC sea.
    assert.strictEqual(isOpenNow(UNIFORME, '2026-03-11T01:30-07:00'), false);
  });
});

describe('isOpenNow — discrimina por día de la semana (horario no uniforme, a propósito distinto del placeholder real)', () => {
  test('un día con ventana angosta y el resto cerrados: solo abre en su propio día, a su propia hora', () => {
    // 2026-03-10 es el día de referencia de v_demo1 en todo el proyecto.
    // Se deriva su día de la semana en vez de asumirlo, para que esta
    // prueba no dependa de saberlo de memoria.
    const dow = weekdayOf(2026, 3, 10);
    const otroDow = (dow + 1) % 7;

    const soloEseDia = {
      tz: 'America/Tijuana',
      weekly: [
        { day: dow, open: '09:00', close: '10:00' },
        { day: otroDow, open: '00:00', close: '23:59' }, // otro día, bien abierto — si la prueba pasara igual ignorando el día, esto lo delataría
      ],
      exceptions: [],
    };

    assert.strictEqual(isOpenNow(soloEseDia, '2026-03-10T09:30-07:00'), true, 'dentro de la ventana angosta de su propio día');
    assert.strictEqual(isOpenNow(soloEseDia, '2026-03-10T12:00-07:00'), false, 'fuera de la ventana angosta de su propio día, aunque otro día del mismo horario sí esté abierto a esa hora');
  });

  test('el día de la semana no tiene ninguna entrada en weekly: cerrado, no lanza excepción', () => {
    const soloUnDia = { tz: 'America/Tijuana', weekly: [{ day: (weekdayOf(2026, 3, 10) + 3) % 7, open: '00:00', close: '23:59' }], exceptions: [] };
    assert.strictEqual(isOpenNow(soloUnDia, '2026-03-10T12:00-07:00'), false);
  });
});

describe('isOpenNow — casos sin dato', () => {
  test('hours null o undefined: devuelve null (no hay dato, distinto de "cerrado")', () => {
    assert.strictEqual(isOpenNow(null, '2026-03-10T12:00-07:00'), null);
    assert.strictEqual(isOpenNow(undefined, '2026-03-10T12:00-07:00'), null);
  });

  test('hours sin weekly (forma inesperada): devuelve null, no lanza excepción', () => {
    assert.strictEqual(isOpenNow({ tz: 'America/Tijuana' }, '2026-03-10T12:00-07:00'), null);
  });
});
