// Etapa F (#17) — `?now=` deja de ser cosa de la app del paciente.
//
// El panel de coordinación leía el reloj real y punto, así que no había
// forma de ver #/pass-preview con una hora fijada: un pase de la fixture
// de marzo de 2026 se veía vencido para siempre. app.js sí tenía `?now=`
// desde la fase 05, con su propio parseNowOverride encerrado dentro del
// archivo — inaccesible para cualquier otro punto de entrada y sin una
// sola prueba, porque probar app.js exige DOM y aquí no hay.
//
// Sacarlo a src/ui/urlParams.js resuelve las dos cosas de un tirón: los
// dos boot() comparten UNA implementación (no dos que se separen) y esa
// implementación por fin se puede probar sola.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseNowOverride } from '../../src/ui/urlParams.js';

describe('parseNowOverride', () => {
  test('devuelve la cadena tal cual cuando es una fecha válida', () => {
    // Devuelve el TEXTO, no un Date: todo src/domain/ compara ISO contra
    // ISO y el offset (-07:00) es parte del dato. Convertir a Date y
    // volver a serializar aquí lo pasaría a UTC y movería la hora que ve
    // el paciente.
    assert.strictEqual(
      parseNowOverride('?now=2026-03-10T10:00-07:00'),
      '2026-03-10T10:00-07:00'
    );
  });

  test('sin parámetro `now` devuelve null', () => {
    assert.strictEqual(parseNowOverride('?p=abc&lang=en'), null);
    assert.strictEqual(parseNowOverride(''), null);
  });

  test('un `now` vacío devuelve null en vez de la fecha de hoy', () => {
    // `?now=` sin valor es lo que deja un enlace mal armado. `new Date('')`
    // es Invalid Date, pero antes de llegar ahí la cadena vacía ya es
    // falsy: se descarta igual que si no viniera.
    assert.strictEqual(parseNowOverride('?now='), null);
  });

  test('una fecha imposible de parsear se descarta en vez de romper la app', () => {
    // El criterio de la fase 05, ahora escrito: un `now` basura NO debe
    // dejar la pantalla en blanco. Se ignora y se usa el reloj real.
    for (const basura of ['ayer', '2026-13-45', 'null', '???']) {
      assert.strictEqual(parseNowOverride(`?now=${encodeURIComponent(basura)}`), null, basura);
    }
  });

  test('acepta la forma completa con Z y la forma con offset', () => {
    assert.strictEqual(parseNowOverride('?now=2026-03-10T17:00:00.000Z'), '2026-03-10T17:00:00.000Z');
    assert.strictEqual(parseNowOverride('?now=2026-03-10T10:00:00-07:00'), '2026-03-10T10:00:00-07:00');
  });

  test('funciona con o sin el "?" inicial', () => {
    // location.search trae el "?"; una prueba o un enlace armado a mano,
    // no siempre. URLSearchParams tolera las dos, y esto lo fija para que
    // nadie lo "arregle" recortando el primer carácter.
    assert.strictEqual(parseNowOverride('now=2026-03-10T10:00-07:00'), '2026-03-10T10:00-07:00');
  });

  test('convive con los demás parámetros del enlace del paciente', () => {
    const search = '?p=' + 'tok'.padEnd(22, 'x') + '&now=2026-03-10T10:00-07:00&lang=en';
    assert.strictEqual(parseNowOverride(search), '2026-03-10T10:00-07:00');
  });
});
