// Etapa F (#18) — renderHoursScreen, la única pantalla pura del paciente
// que no tenía NINGUNA prueba. El barrido de qué módulos no aparecen
// nunca en test/ la encontró junto a map.js, y map.js sí tiene razón
// documentada para no tenerla (necesita DOM real); ésta no tenía ninguna:
// es una función pura que recibe ctx y devuelve una cadena.
//
// Lo que de verdad puede romperse aquí no es el maquetado, es la fuente
// de la hora. La fase 05 pide, literal, que "abierto ahora / cerrado" se
// calcule con `now` inyectado y nunca con el reloj leído dentro de la
// vista (INV-1). Un `new Date()` colado en hours.js pasaría inadvertido
// para siempre: la pantalla se vería bien, y solo daría la respuesta
// equivocada en `?now=`, en las pruebas de otra gente y en cualquier
// máquina con la zona horaria del sistema distinta a Tijuana.
//
// Sin DOM falso, como en plaza.test.js: aserciones sobre el HTML que
// devuelve el render.
//
// ETAPA K — Este archivo se rehízo casi entero. Antes las tres entradas
// traían el MISMO horario de relleno (07:00–20:00 los 7 días), así que
// bastaba contar tres distintivos iguales; el propio encabezado avisaba
// que "si algún día hay horario real, este archivo falla y hay que
// releerlo". Eso pasó: Compass y coordinación tienen horario del
// documento del hospital, cada uno distinto, y el Piso 27 sigue con el
// relleno. Ahora las horas de prueba se eligen sabiendo cuál entrada
// contesta qué.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderHoursScreen } from '../../src/ui/screens/hours.js';
import { translate } from '../../src/ui/i18n.js';
import { locations } from '../../src/data/locations.js';
import { supportChannel } from '../../src/data/support.js';
import { getLocationById } from '../../src/ui/util.js';

const ctx = (now, lang = 'es') => ({ now, lang, t: (path) => translate(lang, path) });

// split y no RegExp: los nombres traen "·" y apóstrofos, y no vale la pena
// escapar metacaracteres para contar apariciones literales.
const cuenta = (html, texto) => html.split(texto).length - 1;

// Los tres horarios de la pantalla, después de la Etapa K:
//   Compass          L–S 06:00–20:00   (documento del hospital, D96)
//   Piso 27          todos 07:00–20:00 (relleno, sigue sin confirmar)
//   Coordinación     L–V 08:00–18:00, Sáb hasta 13:30, domingo cerrado
//
// La única franja donde los tres coinciden es de lunes a viernes entre las
// 08:00 y las 18:00. Estas dos horas se eligen por eso.
const ABIERTO = '2026-08-07T10:00:00-07:00'; // viernes, 10:00 en Tijuana (PDT)
const CERRADO = '2026-08-07T23:30:00-07:00'; // el mismo viernes, ya cerrado

describe('renderHoursScreen — las tres entradas', () => {
  test('están Compass, Piso 27 y el horario de coordinación', () => {
    const html = renderHoursScreen(ctx(ABIERTO));
    assert.ok(html.includes('Compass · Laboratorio e imagenología'), 'falta Compass');
    assert.ok(html.includes('Piso 27 · Consultorios'), 'falta Piso 27');
    assert.ok(html.includes(translate('es', 'help.hoursTitle')), 'falta el horario de coordinación');
    assert.strictEqual(cuenta(html, 'nc-ficha-title'), 3, 'deberían ser exactamente tres fichas');
  });

  test('los nombres se traducen: en inglés no queda ni rastro del español', () => {
    const html = renderHoursScreen(ctx(ABIERTO, 'en'));
    assert.ok(html.includes('Compass · Lab &amp; Imaging'), 'falta el nombre en inglés de Compass');
    assert.ok(html.includes('Floor 27 · Consultation Offices'), 'falta el nombre en inglés de Piso 27');
    assert.ok(html.includes(translate('en', 'hours.title')), 'falta el título traducido');
    assert.ok(!html.includes('Consultorios'), 'se coló el nombre en español');
  });

  // D96 — El distintivo sale de los datos, no de la pantalla.
  test('solo el Piso 27 trae [POR CONFIRMAR]: los otros dos ya tienen horario del hospital', () => {
    const html = renderHoursScreen(ctx(ABIERTO));
    assert.strictEqual(cuenta(html, translate('es', 'common.unconfirmedBadge')), 1);
    assert.strictEqual(getLocationById(locations, 'compass').hours.unconfirmed, undefined);
    assert.strictEqual(getLocationById(locations, 'piso27').hours.unconfirmed, true);
    assert.strictEqual(supportChannel.hours.unconfirmed, undefined);
  });
});

// D97 — Lo que motiva media Etapa K: hasta aquí esta pantalla se llamaba
// "Horarios" y no escribía ni un horario. Solo tenía el distintivo
// "Abierto ahora / Cerrado ahora", que dice si abre AHORA pero no a qué
// hora abre mañana.
describe('el horario escrito, no solo el distintivo', () => {
  test('cada entrada escribe su propio horario, y son tres horarios distintos', () => {
    const html = renderHoursScreen(ctx(ABIERTO));
    assert.ok(html.includes('Lunes a sábado · 6:00 a.m.–8:00 p.m.'), 'falta el horario de Compass');
    assert.ok(html.includes('Todos los días · 7:00 a.m.–8:00 p.m.'), 'falta el horario de relleno del Piso 27');
    assert.ok(html.includes('Lunes a viernes · 8:00 a.m.–6:00 p.m.'), 'falta el horario de coordinación');
    assert.ok(html.includes('Sábado · 8:00 a.m.–1:30 p.m.'), 'falta el sábado corto de coordinación');
  });

  test('el domingo cerrado se dice con todas sus letras, dos veces (Compass y coordinación)', () => {
    assert.strictEqual(cuenta(renderHoursScreen(ctx(ABIERTO)), 'Domingo · cerrado'), 2);
  });

  test('en inglés', () => {
    const html = renderHoursScreen(ctx(ABIERTO, 'en'));
    assert.ok(html.includes('Monday to Saturday · 6:00 AM–8:00 PM'));
    assert.ok(html.includes('Every day · 7:00 AM–8:00 PM'));
    assert.ok(html.includes('Monday to Friday · 8:00 AM–6:00 PM'));
    assert.strictEqual(cuenta(html, 'Sunday · closed'), 2);
  });
});

describe('el estado abierto/cerrado sale de `now`, no del reloj', () => {
  test('un viernes a las 10:00 las tres dicen "Abierto ahora"', () => {
    const html = renderHoursScreen(ctx(ABIERTO));
    assert.strictEqual(cuenta(html, translate('es', 'hours.openNow')), 3);
    assert.strictEqual(cuenta(html, translate('es', 'hours.closedNow')), 0);
  });

  test('a las 23:30 las tres dicen "Cerrado ahora" — mismo render, otro `now`', () => {
    const html = renderHoursScreen(ctx(CERRADO));
    assert.strictEqual(cuenta(html, translate('es', 'hours.closedNow')), 3);
    assert.strictEqual(cuenta(html, translate('es', 'hours.openNow')), 0);
  });

  // Con tres horarios distintos, las horas de apertura escalonadas son la
  // prueba de que cada ficha consulta SU horario y no el de la primera.
  test('las tres no abren a la misma hora, y la pantalla lo refleja', () => {
    const casos = [
      ['2026-08-07T05:59:00-07:00', 0], // nadie abrió
      ['2026-08-07T06:00:00-07:00', 1], // abre Compass
      ['2026-08-07T07:00:00-07:00', 2], // abre el Piso 27
      ['2026-08-07T08:00:00-07:00', 3], // abre coordinación
      ['2026-08-07T18:00:00-07:00', 3], // coordinación todavía alcanza su último minuto
      ['2026-08-07T18:01:00-07:00', 2], // cierra coordinación
      ['2026-08-07T20:00:00-07:00', 2], // Compass y Piso 27 alcanzan el suyo
      ['2026-08-07T20:01:00-07:00', 0], // cierra todo
    ];
    for (const [now, abiertas] of casos) {
      const html = renderHoursScreen(ctx(now));
      assert.strictEqual(cuenta(html, translate('es', 'hours.openNow')), abiertas, `${now}: deberían estar abiertas ${abiertas}`);
      assert.strictEqual(cuenta(html, translate('es', 'hours.closedNow')), 3 - abiertas, `${now}: deberían estar cerradas ${3 - abiertas}`);
    }
  });

  test('el domingo solo abre el Piso 27, que es el que sigue con horario de relleno', () => {
    // Domingo 9 de agosto de 2026, mediodía. Compass y coordinación no
    // tienen el día 0 en su `weekly`: isOpenNow devuelve false sin que
    // nadie tenga que escribir un rango vacío (D96).
    const html = renderHoursScreen(ctx('2026-08-09T12:00:00-07:00'));
    assert.strictEqual(cuenta(html, translate('es', 'hours.openNow')), 1);
    assert.strictEqual(cuenta(html, translate('es', 'hours.closedNow')), 2);
  });

  test('el sábado por la tarde coordinación ya cerró y Compass no', () => {
    // Sábado 8 de agosto, 14:00: coordinación cierra a la 13:30.
    const html = renderHoursScreen(ctx('2026-08-08T14:00:00-07:00'));
    assert.strictEqual(cuenta(html, translate('es', 'hours.openNow')), 2);
    assert.strictEqual(cuenta(html, translate('es', 'hours.closedNow')), 1);
  });

  test('la hora es la de Tijuana, no la de la máquina que corre esto', () => {
    // El mismo instante escrito en UTC. En agosto Tijuana va en -07:00, así
    // que 12:00Z son las 05:00 de allá (las tres cerradas) y 16:00Z las
    // 09:00 (las tres abiertas). Una implementación que leyera la zona
    // local del proceso contestaría al revés en un servidor en UTC — y en
    // CI casi siempre lo es. Esta prueba es la que separa "pasa en mi
    // máquina" de "es correcto".
    const cincoDeLaManana = renderHoursScreen(ctx('2026-08-07T12:00:00Z'));
    const nueveDeLaManana = renderHoursScreen(ctx('2026-08-07T16:00:00Z'));
    assert.strictEqual(cuenta(cincoDeLaManana, translate('es', 'hours.closedNow')), 3, '12:00Z son las 05:00 en Tijuana: cerrado');
    assert.strictEqual(cuenta(nueveDeLaManana, translate('es', 'hours.openNow')), 3, '16:00Z son las 09:00 en Tijuana: abierto');
  });

  test('el horario de verano no corre la frontera: en enero manda -08:00', () => {
    // Mismo 09:00 local, del otro lado del cambio de horario (viernes 16 de
    // enero). Si algo asumiera un desplazamiento fijo, uno de los dos daría
    // lo contrario.
    assert.strictEqual(cuenta(renderHoursScreen(ctx('2026-01-16T09:00:00-08:00')), translate('es', 'hours.openNow')), 3);
    assert.strictEqual(cuenta(renderHoursScreen(ctx('2026-01-16T05:00:00-08:00')), translate('es', 'hours.closedNow')), 3);
  });
});

describe('el estado "sin confirmar" del horario', () => {
  test('hoy no aparece nunca: las tres entradas sí traen weekly', () => {
    // isOpenNow devuelve null —y la pantalla pinta "Horario sin
    // confirmar"— solo si falta `hours` o `hours.weekly`. Con los datos de
    // hoy eso no pasa, y comprobarlo tiene sentido justo por eso: el día
    // que alguien recorte un horario en locations.js, la pantalla se
    // degradaría en silencio a "sin confirmar" para todos los pacientes,
    // sin que nada más en la suite lo note.
    const html = renderHoursScreen(ctx(ABIERTO));
    assert.strictEqual(cuenta(html, translate('es', 'hours.unknown')), 0);
    for (const h of [getLocationById(locations, 'compass').hours, getLocationById(locations, 'piso27').hours, supportChannel.hours]) {
      assert.ok(Array.isArray(h.weekly) && h.weekly.length > 0, 'un horario se quedó sin weekly');
    }
  });
});
