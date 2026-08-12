// Fase 02 — pruebas de R7 (PRD §8, casos 7a–7d) y del motor de resolución
// de rutas. Rojo esperado: src/domain/routing.js y src/data/routes.js
// todavía no existen.
//
// Fixture inline v_demo1 (misma que fase 01, duplicada aquí a propósito:
// esta fase no depende de src/data/fixtures.js, que llega en fase 03).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { defaultOrigin, resolveRoute } from '../../src/domain/routing.js';
import { routes, MAP_HIGHLIGHT_IDS } from '../../src/data/routes.js';
// Única dependencia de la fase 03 en este archivo, y a propósito: la
// propiedad "toda ubicación tiene tramo de ida y vuelta al lobby" habla del
// catálogo de ubicaciones real, no de una copia suya. Con la lista repetida a
// mano, agregar una ubicación sin sus tramos no rompía nada aquí.
import { LOCATION_IDS } from '../../src/data/locations.js';

const A1 = { id: 'a1', visitId: 'v_demo1', startsAt: '2026-03-10T08:00-07:00', durationMin: 45, serviceName: 'Laboratorio', locationId: 'compass', status: 'scheduled', updatedAt: '2026-03-01T00:00-08:00' };
const A2 = { id: 'a2', visitId: 'v_demo1', startsAt: '2026-03-10T09:30-07:00', durationMin: 60, serviceName: 'Resonancia magnética', locationId: 'compass', status: 'scheduled', updatedAt: '2026-03-01T00:00-08:00' };
const A3 = { id: 'a3', visitId: 'v_demo1', startsAt: '2026-03-10T12:00-07:00', durationMin: 30, serviceName: 'Consulta de Medicina Interna', locationId: 'piso27', status: 'scheduled', updatedAt: '2026-03-01T00:00-08:00' };
const A4 = { id: 'a4', visitId: 'v_demo1', startsAt: '2026-03-11T09:00-07:00', durationMin: 30, serviceName: 'Consulta de Cardiología', locationId: 'piso27', status: 'scheduled', updatedAt: '2026-03-01T00:00-08:00' };

const appointments = [A1, A2, A3, A4];

const lodging = {
  visitId: 'v_demo1',
  hotel: 'Quartz Hotel & Spa',
  reservationCode: 'QZ-8841-MX',
  checkIn: '2026-03-10T15:00-07:00',
  checkOut: '2026-03-11T12:00-07:00',
  breakfastIncluded: true,
  recoveryRoom: false,
};

describe('R7 — defaultOrigin (PRD §8)', () => {
  test('7a — primera cita del día 1: aún no hay checkIn a esa hora, origen Estacionamiento', () => {
    assert.strictEqual(defaultOrigin(A1, appointments, lodging), 'estacionamiento');
  });

  test('7b — la anterior fue A2 en Compass: origen Compass', () => {
    assert.strictEqual(defaultOrigin(A3, appointments, lodging), 'compass');
  });

  test('7c — la anterior fue A1, también en Compass: origen Compass (igual al destino)', () => {
    assert.strictEqual(defaultOrigin(A2, appointments, lodging), 'compass');
    assert.strictEqual(A2.locationId, 'compass');
  });

  test('7d — primera cita del día 2, ya con checkIn hecho: origen Quartz, no Estacionamiento', () => {
    assert.strictEqual(defaultOrigin(A4, appointments, lodging), 'quartz');
  });

  test('primera cita del día, sin hospedaje en absoluto: origen Estacionamiento', () => {
    assert.strictEqual(defaultOrigin(A1, appointments, null), 'estacionamiento');
  });

  test('cita no encontrada en la lista: no lanza excepción, devuelve null', () => {
    const foreign = { ...A1, id: 'no-existe' };
    assert.strictEqual(defaultOrigin(foreign, appointments, lodging), null);
  });

  test('una cita cancelada no cuenta como "la anterior": se salta a la última no cancelada', () => {
    // A propósito, la cancelada (x2) queda en una ubicación distinta a la
    // que sigue si se salta correctamente (x1): así la prueba distingue de
    // verdad "saltar la cancelada" de "tomar la cronológicamente más
    // cercana sin mirar el status", que aquí darían resultados distintos.
    const x1 = { ...A1, id: 'x1', startsAt: '2026-03-10T08:00-07:00', locationId: 'compass', status: 'scheduled' };
    const x2Cancelled = { ...A1, id: 'x2', startsAt: '2026-03-10T09:30-07:00', locationId: 'piso27', status: 'cancelled' };
    const x3 = { ...A1, id: 'x3', startsAt: '2026-03-10T12:00-07:00', locationId: 'nivel1', status: 'scheduled' };
    assert.strictEqual(defaultOrigin(x3, [x1, x2Cancelled, x3], lodging), 'compass');
  });
});

describe('resolveRoute (PRD §8, fase 02)', () => {
  test('7c — origen y destino iguales devuelve SameLocation, no una ruta ni null', () => {
    const result = resolveRoute('compass', 'compass', routes);
    assert.deepStrictEqual(result, { kind: 'same_location', locationId: 'compass' });
  });

  test('un par presente en el catálogo devuelve la Route con sus pasos', () => {
    const result = resolveRoute('estacionamiento', 'compass', routes);
    assert.ok(result, 'debería existir la ruta estacionamiento → compass');
    assert.strictEqual(result.fromLocationId, 'estacionamiento');
    assert.strictEqual(result.toLocationId, 'compass');
    assert.ok(Array.isArray(result.steps) && result.steps.length > 0);
    assert.notStrictEqual(result.composed, true, 'un par directo no debe componerse');
  });

  test('una ubicación desconocida sigue devolviendo null, no una ruta inventada', () => {
    assert.strictEqual(resolveRoute('no_existe', 'compass', routes), null);
    assert.strictEqual(resolveRoute('compass', 'no_existe', routes), null);
  });
});

// D41 — el catálogo directo no cubre los 42 pares ordenados y no tiene por
// qué: lobby_torre es el nodo por el que pasa todo el complejo, así que un
// par sin ruta directa se compone A → lobby_torre → B. Es provisional igual
// que el resto (PRD §15.1), pero es cierto estructuralmente — no contenido
// inventado par por par.
describe('resolveRoute — composición por el lobby (D41)', () => {
  test('farmacia → quartz no es directo pero ahora resuelve, compuesto por el lobby', () => {
    const result = resolveRoute('farmacia', 'quartz', routes);
    assert.ok(result, 'farmacia → quartz debería resolver por composición');
    assert.strictEqual(result.composed, true);
    assert.strictEqual(result.fromLocationId, 'farmacia');
    assert.strictEqual(result.toLocationId, 'quartz');
  });

  test('estacionamiento → piso27 resuelve: es el caso que rompía el mapa (origen R7 por defecto)', () => {
    const result = resolveRoute('estacionamiento', 'piso27', routes);
    assert.ok(result, 'estacionamiento → piso27 debe tener ruta: es el origen por defecto de la primera cita del día');
    assert.ok(result.steps.length > 0);
  });

  test('una ruta compuesta renumera sus pasos 1..N y suma los minutos de los dos tramos', () => {
    const first = resolveRoute('farmacia', 'lobby_torre', routes);
    const second = resolveRoute('lobby_torre', 'quartz', routes);
    const composed = resolveRoute('farmacia', 'quartz', routes);

    assert.deepStrictEqual(
      composed.steps.map((s) => s.order),
      Array.from({ length: first.steps.length + second.steps.length }, (_, i) => i + 1)
    );
    assert.strictEqual(composed.estimatedMinutes, first.estimatedMinutes + second.estimatedMinutes);
  });

  test('una ruta compuesta sigue marcada unconfirmed y conserva la forma que consume el mapa', () => {
    const composed = resolveRoute('farmacia', 'quartz', routes);
    assert.strictEqual(composed.unconfirmed, true);
    assert.strictEqual(typeof composed.id, 'string');
    for (const step of composed.steps) {
      assert.strictEqual(typeof step.instruction.es, 'string');
      assert.strictEqual(typeof step.instruction.en, 'string');
      assert.ok(MAP_HIGHLIGHT_IDS.includes(step.mapHighlightId));
    }
  });

  test('los 42 pares ordenados de las 7 ubicaciones resuelven — ninguno deja el mapa en blanco', () => {
    // Ids de src/data/locations.js, inline a propósito: esta fase no importa
    // de fase 03 (misma razón que `knownFromPhase04` más arriba).
    const LOCATION_IDS = ['estacionamiento', 'lobby_torre', 'compass', 'piso27', 'quartz', 'nivel1', 'farmacia'];

    for (const from of LOCATION_IDS) {
      for (const to of LOCATION_IDS) {
        if (from === to) continue;
        const result = resolveRoute(from, to, routes);
        assert.ok(result, `${from} → ${to} no resuelve: el mapa se quedaría sin ruta que dibujar`);
        assert.ok(result.steps.length > 0, `${from} → ${to} resuelve pero sin pasos`);
      }
    }
  });
});

describe('Integridad del catálogo provisional (src/data/routes.js)', () => {
  test('los pasos de cada ruta están ordenados 1..N sin huecos ni repetidos', () => {
    for (const route of routes) {
      const orders = route.steps.map((s) => s.order);
      const expected = orders.slice().sort((a, b) => a - b);
      assert.deepStrictEqual(
        orders,
        Array.from({ length: orders.length }, (_, i) => i + 1),
        `ruta ${route.id}: los steps no están numerados 1..N sin huecos (orders=${JSON.stringify(orders)})`
      );
      assert.deepStrictEqual(orders, expected, `ruta ${route.id}: los steps no están en orden ascendente`);
    }
  });

  test('todo paso de toda ruta tiene texto en es y en en', () => {
    for (const route of routes) {
      for (const step of route.steps) {
        assert.strictEqual(typeof step.instruction?.es, 'string', `ruta ${route.id} paso ${step.order}: falta instruction.es`);
        assert.ok(step.instruction.es.length > 0, `ruta ${route.id} paso ${step.order}: instruction.es vacío`);
        assert.strictEqual(typeof step.instruction?.en, 'string', `ruta ${route.id} paso ${step.order}: falta instruction.en`);
        assert.ok(step.instruction.en.length > 0, `ruta ${route.id} paso ${step.order}: instruction.en vacío`);
      }
    }
  });

  test('todo mapHighlightId del catálogo existe en los 7 mapPointId de la fase 04', () => {
    // Lista fija de docs/phases/phase-04-map-svg.md — si ese archivo cambia,
    // esta prueba (y MAP_HIGHLIGHT_IDS) deben actualizarse junto con él.
    const knownFromPhase04 = ['mp_parking', 'mp_lobby', 'mp_compass', 'mp_floor27', 'mp_quartz', 'mp_level1', 'mp_pharmacy'];
    assert.deepStrictEqual([...MAP_HIGHLIGHT_IDS].sort(), [...knownFromPhase04].sort());

    for (const route of routes) {
      for (const step of route.steps) {
        assert.ok(
          knownFromPhase04.includes(step.mapHighlightId),
          `ruta ${route.id} paso ${step.order}: mapHighlightId "${step.mapHighlightId}" no está en la lista de la fase 04`
        );
      }
    }
  });

  test('el catálogo directo cubre exactamente los pares redactados a mano, en el sentido dado', () => {
    // Hasta D41 eran los 10 pares mínimos de la fase 02. Ahora son 17: los
    // 10 originales más los 7 que faltaban contra el lobby, que es lo que
    // permite componer cualquier par restante (ver describe de composición).
    // Sigue siendo una lista cerrada a propósito: agregar una ruta obliga a
    // tocar este test, no a que aparezca contenido nuevo sin que nadie mire.
    const pairs = routes.map((r) => `${r.fromLocationId}->${r.toLocationId}`).sort();
    const expected = [
      'estacionamiento->lobby_torre',
      'estacionamiento->compass',
      'lobby_torre->compass',
      'lobby_torre->piso27',
      'compass->piso27',
      'compass->nivel1',
      'piso27->nivel1',
      'piso27->farmacia',
      'quartz->lobby_torre',
      'lobby_torre->quartz',
      'lobby_torre->estacionamiento',
      'compass->lobby_torre',
      'piso27->lobby_torre',
      'nivel1->lobby_torre',
      'lobby_torre->nivel1',
      'farmacia->lobby_torre',
      'lobby_torre->farmacia',

      // D80/D81 — los seis pisos de consultorios que faltaban. A cada uno le
      // bastan sus dos tramos contra el lobby: resolveRoute() compone el
      // resto (compass→piso10 sale como compass→lobby→piso10). Escribir a
      // mano los otros pares habría sido inventar contenido par por par, que
      // es justo lo que D41 rechazó.
      'lobby_torre->piso10', 'piso10->lobby_torre',
      'lobby_torre->piso11', 'piso11->lobby_torre',
      'lobby_torre->piso16', 'piso16->lobby_torre',
      'lobby_torre->piso22', 'piso22->lobby_torre',
      'lobby_torre->piso28', 'piso28->lobby_torre',
      'lobby_torre->piso29', 'piso29->lobby_torre',
    ].sort();
    assert.deepStrictEqual(pairs, expected);
  });

  test('toda ubicación tiene ruta directa hacia y desde lobby_torre — es lo que hace posible componer', () => {
    // Se importa la lista real en vez de repetirla aquí: si alguien agrega
    // una ubicación y se le olvidan sus tramos contra el lobby, esta prueba
    // tiene que caerse sola. Con la lista copiada a mano no se caía.
    const pairs = new Set(routes.map((r) => `${r.fromLocationId}->${r.toLocationId}`));

    for (const id of LOCATION_IDS) {
      if (id === 'lobby_torre') continue;
      assert.ok(pairs.has(`${id}->lobby_torre`), `falta la ruta directa ${id} → lobby_torre`);
      assert.ok(pairs.has(`lobby_torre->${id}`), `falta la ruta directa lobby_torre → ${id}`);
    }
  });

  test('la ruta de cada piso de consultorios nombra ESE piso, no el 27 (D81)', () => {
    // El punto entero del cambio: antes toda consulta caía en "Piso 27" y el
    // paciente subía al piso equivocado con el mapa dándole la razón.
    for (const n of [10, 11, 16, 22, 27, 28, 29]) {
      const ida = routes.find((r) => r.fromLocationId === 'lobby_torre' && r.toLocationId === `piso${n}`);
      assert.ok(ida, `falta la ruta lobby_torre → piso${n}`);
      assert.ok(ida.steps.some((s) => s.instruction.es.includes(`piso ${n}`)), `lobby_torre → piso${n}: el texto en español no nombra el piso ${n}`);
      assert.ok(ida.steps.some((s) => s.instruction.en.includes(`floor ${n}`)), `lobby_torre → piso${n}: el texto en inglés no nombra el piso ${n}`);

      const vuelta = routes.find((r) => r.fromLocationId === `piso${n}` && r.toLocationId === 'lobby_torre');
      assert.ok(vuelta, `falta la ruta piso${n} → lobby_torre`);
      assert.ok(vuelta.steps.some((s) => s.instruction.es.includes(`piso ${n}`)), `piso${n} → lobby_torre: el texto en español no nombra el piso ${n}`);
      assert.ok(vuelta.steps.some((s) => s.instruction.en.includes(`floor ${n}`)), `piso${n} → lobby_torre: el texto en inglés no nombra el piso ${n}`);
    }
  });

  test('compass → piso de consultorios se compone por el lobby y conserva el piso correcto', () => {
    // No hay tramo directo compass→piso10 y no hace falta: lo que importa es
    // que el paciente que sale del laboratorio reciba pasos que lo lleven al
    // piso 10, no al 27.
    const r = resolveRoute('compass', 'piso10', routes);
    assert.ok(r && r.steps?.length, 'compass → piso10 debería resolverse componiendo por el lobby');
    assert.strictEqual(r.composed, true);
    assert.ok(r.steps.some((s) => s.instruction.es.includes('piso 10')), 'los pasos compuestos deberían nombrar el piso 10');
    assert.ok(!r.steps.some((s) => s.instruction.es.includes('piso 27')), 'los pasos compuestos no deberían mencionar el piso 27');
  });

  test('ninguna ruta del catálogo directo sale y llega a la misma ubicación', () => {
    for (const route of routes) {
      assert.notStrictEqual(route.fromLocationId, route.toLocationId, `ruta ${route.id}: origen y destino iguales`);
    }
  });

  test('no hay dos rutas para el mismo par ordenado', () => {
    const pairs = routes.map((r) => `${r.fromLocationId}->${r.toLocationId}`);
    assert.strictEqual(new Set(pairs).size, pairs.length, 'hay pares duplicados en el catálogo');
  });

  test('todo el contenido del catálogo está marcado unconfirmed: true (PRD §15, provisional hasta planos oficiales)', () => {
    for (const route of routes) {
      assert.strictEqual(route.unconfirmed, true, `ruta ${route.id}: falta unconfirmed: true`);
    }
  });
});
