// Etapa G — línea de tiempo unificada (citas + traslados).
//
// El itinerario del paciente deja de ser "la lista de citas" y pasa a ser
// "lo que pasa ese día, en orden". Un traslado a las 06:00 tiene que salir
// ARRIBA de la cita de las 08:00, no en otra pantalla ni al final.
//
// timelineItems no agrupa ni formatea: solo etiqueta y ordena. El agrupado
// por día lo sigue haciendo groupByDay, que ya es genérico (solo lee
// `startsAt` y `dayKeyTijuana`) y por eso no se toca en esta etapa.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { timelineItems, nextTransfer } from '../../src/domain/timeline.js';
import { groupByDay } from '../../src/domain/itinerary.js';

const cita = (id, startsAt, status = 'scheduled') => ({
  id, visitId: 'v1', startsAt, durationMin: 30,
  serviceName: `Servicio ${id}`, locationId: 'piso27', status,
  updatedAt: '2026-03-01T00:00-08:00',
});

const traslado = (id, scheduledAt, kind = 'arrival', status = 'scheduled') => ({
  id, visitId: 'v1', kind, scheduledAt,
  meetingPointId: 'tij_terminal', status,
  driver: { name: 'Juan Pérez', phone: '+526641234567' },
  vehicle: { type: 'van', make: 'Toyota', model: 'Hiace', color: 'blanca', plate: 'ABC-123-D' },
});

describe('timelineItems — etiquetado y orden', () => {
  test('intercala citas y traslados por hora, no por tipo', () => {
    const items = timelineItems(
      [cita('a1', '2026-03-10T08:00-07:00'), cita('a2', '2026-03-10T12:00-07:00')],
      [traslado('t1', '2026-03-10T06:00-07:00'), traslado('t2', '2026-03-10T10:00-07:00', 'departure')],
    );
    assert.deepStrictEqual(items.map((i) => i.entity.id), ['t1', 'a1', 't2', 'a2']);
  });

  test('cada elemento dice qué es y cuándo, sin que quien lo pinta tenga que adivinar', () => {
    const [primero] = timelineItems([], [traslado('t1', '2026-03-10T06:00-07:00')]);
    assert.strictEqual(primero.kind, 'transfer');
    assert.strictEqual(primero.startsAt, '2026-03-10T06:00-07:00', 'el traslado expone su scheduledAt como startsAt');
    assert.strictEqual(primero.entity.id, 't1');

    const [cual] = timelineItems([cita('a1', '2026-03-10T08:00-07:00')], []);
    assert.strictEqual(cual.kind, 'appointment');
    assert.strictEqual(cual.startsAt, '2026-03-10T08:00-07:00');
    assert.strictEqual(cual.entity.id, 'a1');
  });

  test('no muta ni copia a medias las entidades: la tarjeta recibe el objeto entero', () => {
    const original = traslado('t1', '2026-03-10T06:00-07:00');
    const [item] = timelineItems([], [original]);
    assert.strictEqual(item.entity, original, 'la entidad se pasa tal cual, no una copia parcial');
    assert.strictEqual(original.scheduledAt, '2026-03-10T06:00-07:00', 'el arreglo de entrada no se toca');
  });

  test('empate exacto de hora: la cita va primero — es a lo que el paciente tiene que llegar', () => {
    const items = timelineItems(
      [cita('a1', '2026-03-10T08:00-07:00')],
      [traslado('t1', '2026-03-10T08:00-07:00')],
    );
    assert.deepStrictEqual(items.map((i) => i.entity.id), ['a1', 't1']);
  });
});

describe('timelineItems — cancelados y ausencias', () => {
  // Mismo criterio que groupByDay con las citas (PRD §9 "Cita cancelada"):
  // el elemento cancelado NO desaparece. Si el paciente contrató un
  // traslado y se canceló, verlo tachado es información; que se esfume, no.
  test('un traslado cancelado sigue en la línea de tiempo, como una cita cancelada', () => {
    const items = timelineItems(
      [cita('a1', '2026-03-10T08:00-07:00', 'cancelled')],
      [traslado('t1', '2026-03-10T06:00-07:00', 'arrival', 'cancelled')],
    );
    assert.deepStrictEqual(items.map((i) => i.entity.id), ['t1', 'a1']);
  });

  test('sin traslados, devuelve exactamente las citas etiquetadas — el itinerario de siempre', () => {
    const citas = [cita('a1', '2026-03-10T08:00-07:00'), cita('a2', '2026-03-10T12:00-07:00')];
    const items = timelineItems(citas, []);
    assert.deepStrictEqual(items.map((i) => i.kind), ['appointment', 'appointment']);
    assert.deepStrictEqual(items.map((i) => i.entity), citas);
  });

  // Compatibilidad con lo ya desplegado: los expedientes guardados antes de
  // la Etapa G no traen la llave. Ausente, null y [] tienen que dar lo
  // mismo, o el itinerario reventaría en un teléfono con caché vieja.
  test('transfers ausente, null o [] dan el mismo resultado', () => {
    const citas = [cita('a1', '2026-03-10T08:00-07:00')];
    const esperado = [{ kind: 'appointment', startsAt: '2026-03-10T08:00-07:00', entity: citas[0] }];
    assert.deepStrictEqual(timelineItems(citas, undefined), esperado);
    assert.deepStrictEqual(timelineItems(citas, null), esperado);
    assert.deepStrictEqual(timelineItems(citas, []), esperado);
  });

  test('sin nada de nada, un arreglo vacío — no null, no excepción', () => {
    assert.deepStrictEqual(timelineItems([], []), []);
    assert.deepStrictEqual(timelineItems(undefined, undefined), []);
  });
});

// La tarjeta de Inicio (D71) necesita UN traslado, no la lista entera. Se
// resuelve aquí y no en la pantalla por la misma razón que nextStep: "cuál
// es el siguiente" es una regla, no una decisión de maquetado, y una
// pantalla no puede probarse sin DOM.
//
// R2 no se toca: nextStep sigue siendo solo de citas. Esto es su hermano
// para traslados, en su propia tarjeta.
describe('nextTransfer — el que se anuncia en Inicio', () => {
  test('el más próximo que todavía no pasa', () => {
    const t = nextTransfer(
      [traslado('t1', '2026-03-10T06:00-07:00'), traslado('t2', '2026-03-11T16:00-07:00', 'departure')],
      '2026-03-10T05:00-07:00',
    );
    assert.strictEqual(t.id, 't1');
  });

  test('el de llegada ya pasó: se anuncia el de regreso', () => {
    const t = nextTransfer(
      [traslado('t1', '2026-03-10T06:00-07:00'), traslado('t2', '2026-03-11T16:00-07:00', 'departure')],
      '2026-03-10T09:00-07:00',
    );
    assert.strictEqual(t.id, 't2');
  });

  // El coche está abajo AHORA. Que la tarjeta se vacíe en el minuto exacto
  // de la recogida sería quitarle el teléfono del chofer justo cuando lo
  // marca. Mismo criterio que nextStep con `>= now`.
  test('la hora exacta de la recogida todavía cuenta', () => {
    const t = nextTransfer([traslado('t1', '2026-03-10T06:00-07:00')], '2026-03-10T06:00-07:00');
    assert.strictEqual(t.id, 't1');
  });

  test('un traslado cancelado nunca es el siguiente', () => {
    const t = nextTransfer(
      [traslado('t1', '2026-03-10T06:00-07:00', 'arrival', 'cancelled'), traslado('t2', '2026-03-11T16:00-07:00', 'departure')],
      '2026-03-09T00:00-07:00',
    );
    assert.strictEqual(t.id, 't2');
  });

  test('sin ninguno futuro, null — la tarjeta no se pinta en vez de mentir', () => {
    assert.strictEqual(nextTransfer([traslado('t1', '2026-03-10T06:00-07:00')], '2026-03-12T00:00-07:00'), null);
    assert.strictEqual(nextTransfer([traslado('t1', '2026-03-10T06:00-07:00', 'arrival', 'cancelled')], '2026-03-09T00:00-07:00'), null);
  });

  // Misma compatibilidad que timelineItems: expediente viejo, sin la llave.
  test('transfers ausente, null o [] dan null', () => {
    assert.strictEqual(nextTransfer(undefined, '2026-03-10T00:00-07:00'), null);
    assert.strictEqual(nextTransfer(null, '2026-03-10T00:00-07:00'), null);
    assert.strictEqual(nextTransfer([], '2026-03-10T00:00-07:00'), null);
  });

  test('empate exacto de hora: desempate por id, para que dos repintados no lo cambien', () => {
    const a = nextTransfer(
      [traslado('t9', '2026-03-10T06:00-07:00'), traslado('t2', '2026-03-10T06:00-07:00', 'departure')],
      '2026-03-09T00:00-07:00',
    );
    const b = nextTransfer(
      [traslado('t2', '2026-03-10T06:00-07:00', 'departure'), traslado('t9', '2026-03-10T06:00-07:00')],
      '2026-03-09T00:00-07:00',
    );
    assert.strictEqual(a.id, 't2');
    assert.strictEqual(b.id, 't2');
  });

  test('no lee el reloj: el mismo arreglo con dos `now` distintos da dos respuestas (INV-1)', () => {
    const lista = [traslado('t1', '2026-03-10T06:00-07:00'), traslado('t2', '2026-03-11T16:00-07:00', 'departure')];
    assert.strictEqual(nextTransfer(lista, '2026-03-09T00:00-07:00').id, 't1');
    assert.strictEqual(nextTransfer(lista, '2026-03-10T12:00-07:00').id, 't2');
  });
});

describe('timelineItems se agrupa con groupByDay sin tocar groupByDay', () => {
  test('un traslado de llegada la víspera abre su propio día', () => {
    const items = timelineItems(
      [cita('a1', '2026-03-10T08:00-07:00'), cita('a2', '2026-03-11T09:00-07:00')],
      [traslado('t1', '2026-03-09T21:00-07:00'), traslado('t2', '2026-03-11T16:00-07:00', 'departure')],
    );
    const grupos = groupByDay(items, '2026-03-09T12:00-07:00');

    assert.deepStrictEqual(grupos.map((g) => g.dayKey), ['2026-03-09', '2026-03-10', '2026-03-11']);
    assert.deepStrictEqual(grupos[0].items.map((i) => i.entity.id), ['t1'], 'la víspera es solo el traslado');
    assert.deepStrictEqual(grupos[2].items.map((i) => i.entity.id), ['a2', 't2'], 'el último día cierra con el regreso');
  });
});
