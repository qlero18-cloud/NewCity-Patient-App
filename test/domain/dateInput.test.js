// Etapa H — puente entre lo que devuelve un control nativo de fecha
// (<input type="datetime-local"> da "2026-03-11T15:00", pelado, sin zona) y
// lo que guarda este proyecto (ISO con desplazamiento explícito, PRD §7).
//
// Este archivo vive en test/domain/ a propósito y no en test/ui/: `npm run
// test:tz` corre test/domain/**/*.test.js bajo TZ=UTC, America/New_York y
// America/Tijuana. Un helper de fechas que se apoyara sin querer en la zona
// del proceso pasaría en la máquina de quien lo escribió y fallaría en la
// Function — que corre en UTC. Aquí eso se ve en la misma corrida.
//
// Baja California NO abolió el horario de verano junto con el resto de
// México: sigue el calendario de Estados Unidos por la frontera. En 2026 el
// cambio es el 8 de marzo y el 1 de noviembre — verificado contra
// Intl.DateTimeFormat, no contra una tabla escrita a mano.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tijuanaOffset, toIsoTijuana, toLocalInput, toDateInput, instantMs } from '../../src/domain/time.js';

// Hora de pared en Tijuana para un instante, leída con Intl y no con los
// helpers bajo prueba: si me equivoco en los dos lados igual, una prueba que
// use la implementación como oráculo no se entera de nada.
const RELOJ = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Tijuana',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

function relojTijuana(iso) {
  const p = Object.fromEntries(RELOJ.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  const hora = p.hour === '24' ? '00' : p.hour;
  return `${p.year}-${p.month}-${p.day}T${hora}:${p.minute}`;
}

describe('tijuanaOffset — el desplazamiento sale de LA FECHA, nunca fijo', () => {
  // La razón de existir de todo esto. Un '-07:00' escrito a mano acierta de
  // marzo a noviembre y corre las citas una hora el resto del año.
  test('enero es -08:00 y julio es -07:00', () => {
    assert.strictEqual(tijuanaOffset('2026-01-15T15:00'), '-08:00');
    assert.strictEqual(tijuanaOffset('2026-07-15T15:00'), '-07:00');
  });

  test('el cambio de 2026 cae entre el 7 y el 9 de marzo, y entre el 31 de octubre y el 2 de noviembre', () => {
    assert.strictEqual(tijuanaOffset('2026-03-07T12:00'), '-08:00');
    assert.strictEqual(tijuanaOffset('2026-03-09T12:00'), '-07:00');
    assert.strictEqual(tijuanaOffset('2026-10-31T12:00'), '-07:00');
    assert.strictEqual(tijuanaOffset('2026-11-02T12:00'), '-08:00');
  });

  // Las fechas del prototipo (fixtures.js, docs/PRD.md §8) caen en marzo,
  // ya en horario de verano. Si esto diera -08:00 toda la demo estaría
  // corrida una hora contra los datos que ya están guardados.
  test('las fechas de la demo de marzo dan -07:00, igual que las fixtures', () => {
    assert.strictEqual(tijuanaOffset('2026-03-10T08:00'), '-07:00');
    assert.strictEqual(tijuanaOffset('2026-03-11T09:30'), '-07:00');
  });

  test('acepta una fecha sola, sin hora (lo que da <input type="date">)', () => {
    assert.strictEqual(tijuanaOffset('2026-01-15'), '-08:00');
    assert.strictEqual(tijuanaOffset('2026-07-15'), '-07:00');
  });

  test('lo que no es una fecha local válida devuelve null, no un offset a medias', () => {
    for (const basura of ['', '   ', 'mañana', '2026-03-10T08:00-07:00', '15/03/2026', '2026-13-01', '2026-02-30', null, undefined, 42]) {
      assert.strictEqual(tijuanaOffset(basura), null, `debió rechazar ${JSON.stringify(basura)}`);
    }
  });
});

describe('toIsoTijuana — de lo que teclea el control al ISO que se guarda', () => {
  test('ida y vuelta en invierno y en verano', () => {
    for (const local of ['2026-01-15T15:00', '2026-07-15T15:00', '2026-03-10T08:00', '2026-11-02T23:59']) {
      const iso = toIsoTijuana(local);
      assert.ok(Number.isFinite(instantMs(iso)), `${iso} no es un instante`);
      assert.strictEqual(relojTijuana(iso), local, `${local} -> ${iso} no marca esa hora en Tijuana`);
      assert.strictEqual(toLocalInput(iso), local, `${iso} no regresa a ${local}`);
    }
  });

  test('el ISO que produce trae desplazamiento explícito, nunca Z ni pelado', () => {
    assert.strictEqual(toIsoTijuana('2026-01-15T15:00'), '2026-01-15T15:00-08:00');
    assert.strictEqual(toIsoTijuana('2026-07-15T15:00'), '2026-07-15T15:00-07:00');
    // La misma regla que exige el servidor (checkFecha en visitMutations.js).
    assert.match(toIsoTijuana('2026-07-15T15:00'), /[+-]\d{2}:\d{2}$/);
  });

  test('una fecha sola se guarda como medianoche de ese día en Tijuana', () => {
    assert.strictEqual(toIsoTijuana('2026-03-10'), '2026-03-10T00:00-07:00');
    assert.strictEqual(relojTijuana(toIsoTijuana('2026-03-10')), '2026-03-10T00:00');
  });

  // El 8 de marzo de 2026 el cambio ocurre a las 2:00 de la madrugada: ese
  // día empieza en invierno y termina en verano. Que el mismo día tenga dos
  // offsets según la hora es exactamente lo que un '-07:00' fijo no puede
  // representar.
  test('el mismo día puede tener dos offsets según la hora', () => {
    assert.strictEqual(toIsoTijuana('2026-03-08T01:00'), '2026-03-08T01:00-08:00');
    assert.strictEqual(toIsoTijuana('2026-03-08T12:00'), '2026-03-08T12:00-07:00');
  });

  test('lo que no se puede interpretar devuelve null en vez de un ISO inventado', () => {
    for (const basura of ['', 'mañana', '2026-02-30', null, undefined]) {
      assert.strictEqual(toIsoTijuana(basura), null, `debió rechazar ${JSON.stringify(basura)}`);
    }
  });
});

describe('toLocalInput — prellenar el formulario con lo ya guardado', () => {
  test('lee los valores que hoy están en las fixtures', () => {
    assert.strictEqual(toLocalInput('2026-03-10T08:00-07:00'), '2026-03-10T08:00');
    assert.strictEqual(toLocalInput('2026-03-10T15:00-07:00'), '2026-03-10T15:00');
    assert.strictEqual(toLocalInput('2026-01-12T09:00-08:00'), '2026-01-12T09:00');
  });

  // El corazón del punto 3. Cortar los primeros 16 caracteres funciona
  // mientras TODO venga en offset de Tijuana; el día que entre un ...Z el
  // corte devuelve la hora UTC como si fuera local y la corre siete horas,
  // sin decir nada. Se prueba las dos cosas: que el corte estaría mal, y que
  // esta función no lo hace.
  test('un ISO en UTC se rechaza en vez de desplazarse en silencio', () => {
    const utc = '2026-03-11T22:00Z';
    assert.strictEqual(relojTijuana(utc), '2026-03-11T15:00', 'ese instante son las 3 de la tarde en Tijuana');
    assert.strictEqual(utc.slice(0, 16), '2026-03-11T22:00', 'cortar 16 caracteres daría las 10 de la noche');
    assert.strictEqual(toLocalInput(utc), '');
  });

  test('un ISO sin zona se rechaza: no se puede saber qué instante es', () => {
    assert.strictEqual(toLocalInput('2026-03-11T15:00'), '');
    assert.strictEqual(toLocalInput('2026-03-11'), '');
  });

  // -07:00 en enero no es un valor de Tijuana: es un dato malo escrito por
  // algo que no consultó la fecha. Devolver la hora tal cual lo daría por
  // bueno y lo volvería a guardar igual en el siguiente Guardar.
  test('un desplazamiento que no es el de Tijuana ESE día se rechaza', () => {
    assert.strictEqual(toLocalInput('2026-01-15T15:00-07:00'), '');
    assert.strictEqual(toLocalInput('2026-07-15T15:00-08:00'), '');
    assert.strictEqual(toLocalInput('2026-03-10T08:00-05:00'), '');
  });

  test('vacío, nulo o basura devuelven cadena vacía, nunca "undefined" en el value', () => {
    for (const basura of ['', '   ', 'mañana', null, undefined, 42, {}]) {
      assert.strictEqual(toLocalInput(basura), '', `debió rechazar ${JSON.stringify(basura)}`);
    }
  });

  test('tolera los segundos que estampa toTijuanaIso, y los descarta', () => {
    assert.strictEqual(toLocalInput('2026-03-10T08:00:00-07:00'), '2026-03-10T08:00');
  });
});

describe('toDateInput — el mismo puente para <input type="date">', () => {
  test('devuelve solo el día, con las mismas reglas de rechazo', () => {
    assert.strictEqual(toDateInput('2026-03-10T08:00-07:00'), '2026-03-10');
    assert.strictEqual(toDateInput('2026-01-12T09:00-08:00'), '2026-01-12');
    assert.strictEqual(toDateInput('2026-03-11T22:00Z'), '');
    assert.strictEqual(toDateInput(''), '');
    assert.strictEqual(toDateInput(null), '');
  });

  // Un ISO cuya hora local cae antes de mediodía no puede caer en otro día
  // por el offset: si el día saliera del ISO crudo en vez de la hora de
  // Tijuana, un instante de la madrugada se iría al día anterior.
  test('el día es el de Tijuana, no el de UTC', () => {
    // 2026-03-10T23:00-07:00 son las 06:00Z del día 11 en UTC.
    assert.strictEqual(toDateInput('2026-03-10T23:00-07:00'), '2026-03-10');
  });
});

describe('los helpers no leen el reloj ni la zona del proceso', () => {
  // INV-1 y D20: son función de su argumento y de nada más. Si alguno mirara
  // Date.now() o process.env.TZ, `npm run test:tz` lo delataría — pero esta
  // prueba lo fija aquí mismo, sin depender de que alguien corra ese script.
  test('el mismo argumento da el mismo resultado, dos veces seguidas', () => {
    for (const local of ['2026-01-15T15:00', '2026-07-15T15:00']) {
      assert.strictEqual(toIsoTijuana(local), toIsoTijuana(local));
      assert.strictEqual(tijuanaOffset(local), tijuanaOffset(local));
    }
  });
});
