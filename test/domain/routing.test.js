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

  test('un par sin ruta en el catálogo devuelve null y no lanza excepción', () => {
    assert.strictEqual(resolveRoute('farmacia', 'quartz', routes), null);
  });

  test('un par presente en el catálogo devuelve la Route con sus pasos', () => {
    const result = resolveRoute('estacionamiento', 'compass', routes);
    assert.ok(result, 'debería existir la ruta estacionamiento → compass');
    assert.strictEqual(result.fromLocationId, 'estacionamiento');
    assert.strictEqual(result.toLocationId, 'compass');
    assert.ok(Array.isArray(result.steps) && result.steps.length > 0);
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

  test('el catálogo cubre los 10 pares mínimos documentados en la fase, en el sentido dado', () => {
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
    ].sort();
    assert.deepStrictEqual(pairs, expected);
  });

  test('todo el contenido del catálogo está marcado unconfirmed: true (PRD §15, provisional hasta planos oficiales)', () => {
    for (const route of routes) {
      assert.strictEqual(route.unconfirmed, true, `ruta ${route.id}: falta unconfirmed: true`);
    }
  });
});
