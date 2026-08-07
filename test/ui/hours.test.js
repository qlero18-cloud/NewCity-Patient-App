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

// Las 7 ubicaciones y el canal de soporte traen el mismo horario
// placeholder 07:00–20:00 los 7 días (locations.js, support.js). Estas
// horas se eligen contra ese dato; si algún día hay horario real, este
// archivo falla y hay que releerlo, que es justo lo que debe pasar.
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

  test('las tres traen [POR CONFIRMAR]: ningún horario del proyecto está confirmado todavía', () => {
    const html = renderHoursScreen(ctx(ABIERTO));
    assert.strictEqual(cuenta(html, translate('es', 'common.unconfirmedBadge')), 3);
    // El distintivo sale de los datos, no de la pantalla: si mañana se
    // confirma un horario, el que tiene que cambiar es locations.js.
    assert.strictEqual(getLocationById(locations, 'compass').hours.unconfirmed, true);
    assert.strictEqual(getLocationById(locations, 'piso27').hours.unconfirmed, true);
    assert.strictEqual(supportChannel.hours.unconfirmed, true);
  });
});

describe('el estado abierto/cerrado sale de `now`, no del reloj', () => {
  test('a las 10:00 las tres dicen "Abierto ahora"', () => {
    const html = renderHoursScreen(ctx(ABIERTO));
    assert.strictEqual(cuenta(html, translate('es', 'hours.openNow')), 3);
    assert.strictEqual(cuenta(html, translate('es', 'hours.closedNow')), 0);
  });

  test('a las 23:30 las tres dicen "Cerrado ahora" — mismo render, otro `now`', () => {
    const html = renderHoursScreen(ctx(CERRADO));
    assert.strictEqual(cuenta(html, translate('es', 'hours.closedNow')), 3);
    assert.strictEqual(cuenta(html, translate('es', 'hours.openNow')), 0);
  });

  test('los bordes del horario: 07:00 y 20:00 cuentan como abierto, un minuto afuera no', () => {
    const casos = [
      ['2026-08-07T06:59:00-07:00', false],
      ['2026-08-07T07:00:00-07:00', true],
      ['2026-08-07T20:00:00-07:00', true],
      ['2026-08-07T20:01:00-07:00', false],
    ];
    for (const [now, abierto] of casos) {
      const html = renderHoursScreen(ctx(now));
      const clave = abierto ? 'hours.openNow' : 'hours.closedNow';
      assert.strictEqual(cuenta(html, translate('es', clave)), 3, `${now} debería dar ${abierto ? 'abierto' : 'cerrado'}`);
    }
  });

  test('la hora es la de Tijuana, no la de la máquina que corre esto', () => {
    // El mismo instante escrito en UTC. En agosto Tijuana va en -07:00, así
    // que 13:00Z son las 06:00 de allá (cerrado) y 14:00Z las 07:00
    // (abierto). Una implementación que leyera la zona local del proceso
    // contestaría al revés en un servidor en UTC — y en CI casi siempre lo
    // es. Esta prueba es la que separa "pasa en mi máquina" de "es correcto".
    const seisDeLaManana = renderHoursScreen(ctx('2026-08-07T13:00:00Z'));
    const sieteDeLaManana = renderHoursScreen(ctx('2026-08-07T14:00:00Z'));
    assert.strictEqual(cuenta(seisDeLaManana, translate('es', 'hours.closedNow')), 3, '13:00Z son las 06:00 en Tijuana: cerrado');
    assert.strictEqual(cuenta(sieteDeLaManana, translate('es', 'hours.openNow')), 3, '14:00Z son las 07:00 en Tijuana: abierto');
  });

  test('el horario de verano no corre la frontera: en enero manda -08:00', () => {
    // Mismo 07:00 local, del otro lado del cambio de horario. Si algo
    // asumiera un desplazamiento fijo, uno de los dos daría cerrado.
    const invierno = renderHoursScreen(ctx('2026-01-16T07:00:00-08:00'));
    assert.strictEqual(cuenta(invierno, translate('es', 'hours.openNow')), 3);
    const invirnoAntes = renderHoursScreen(ctx('2026-01-16T06:59:00-08:00'));
    assert.strictEqual(cuenta(invirnoAntes, translate('es', 'hours.closedNow')), 3);
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
