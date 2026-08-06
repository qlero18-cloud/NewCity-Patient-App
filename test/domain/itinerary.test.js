// Fase 01 — pruebas de R5 (PRD §8, casos 5a–5c) y del agrupado por día
// (PRD §9, "Visita de varios días" y "Cita cancelada"). Rojo esperado: el
// módulo src/domain/itinerary.js todavía no existe.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { groupByDay, isUpdated } from '../../src/domain/itinerary.js';

const A1 = { id: 'a1', visitId: 'v_demo1', startsAt: '2026-03-10T08:00-07:00', durationMin: 45, serviceName: 'Laboratorio', locationId: 'compass', status: 'scheduled', updatedAt: '2026-03-01T00:00-08:00' };
const A2 = { id: 'a2', visitId: 'v_demo1', startsAt: '2026-03-10T09:30-07:00', durationMin: 60, serviceName: 'Resonancia magnética', locationId: 'compass', status: 'scheduled', updatedAt: '2026-03-01T00:00-08:00' };
const A3 = { id: 'a3', visitId: 'v_demo1', startsAt: '2026-03-10T12:00-07:00', durationMin: 30, serviceName: 'Consulta de Medicina Interna', locationId: 'piso27', status: 'scheduled', updatedAt: '2026-03-01T00:00-08:00' };
const A4 = { id: 'a4', visitId: 'v_demo1', startsAt: '2026-03-11T09:00-07:00', durationMin: 30, serviceName: 'Consulta de Cardiología', locationId: 'piso27', status: 'scheduled', updatedAt: '2026-03-01T00:00-08:00' };

describe('R5 — isUpdated (PRD §8)', () => {
  test('5a — cambio posterior a la última vez que se vio: se muestra "actualizado"', () => {
    const movedA3 = { ...A3, startsAt: '2026-03-10T14:00-07:00', updatedAt: '2026-03-10T11:10-07:00' };
    assert.strictEqual(isUpdated(movedA3, '2026-03-10T10:30-07:00'), true);
  });

  test('5b — se volvió a ver el itinerario después del cambio: sin distintivo', () => {
    const movedA3 = { ...A3, startsAt: '2026-03-10T14:00-07:00', updatedAt: '2026-03-10T11:10-07:00' };
    assert.strictEqual(isUpdated(movedA3, '2026-03-10T11:20-07:00'), false);
  });

  test('5c — dispositivo nuevo sin lastViewedItineraryAt: sin distintivos, no se inventa una referencia', () => {
    assert.strictEqual(isUpdated(A3, null), false);
    assert.strictEqual(isUpdated(A3, undefined), false);
  });
});

describe('groupByDay (PRD §9 — visita de varios días / cita cancelada)', () => {
  test('agrupa v_demo1 en dos días, en orden cronológico, con las etiquetas Hoy/Mañana', () => {
    const now = '2026-03-10T07:00-07:00'; // mismo día calendario que A1–A3
    const groups = groupByDay([A4, A1, A3, A2], now); // entran desordenadas a propósito

    assert.strictEqual(groups.length, 2);

    assert.strictEqual(groups[0].dayKey, '2026-03-10');
    assert.deepStrictEqual(groups[0].items.map((a) => a.id), ['a1', 'a2', 'a3']);
    assert.strictEqual(groups[0].label.es, 'Hoy · martes 10');
    assert.strictEqual(groups[0].label.en, 'Today · Tuesday 10');

    assert.strictEqual(groups[1].dayKey, '2026-03-11');
    assert.deepStrictEqual(groups[1].items.map((a) => a.id), ['a4']);
    assert.strictEqual(groups[1].label.es, 'Mañana · miércoles 11');
    assert.strictEqual(groups[1].label.en, 'Tomorrow · Wednesday 11');
  });

  test('una cita cancelada permanece en su grupo de día', () => {
    const cancelledA3 = { ...A3, status: 'cancelled' };
    const now = '2026-03-10T07:00-07:00';
    const groups = groupByDay([A1, A2, cancelledA3], now);
    assert.strictEqual(groups.length, 1);
    assert.deepStrictEqual(groups[0].items.map((a) => a.id), ['a1', 'a2', 'a3']);
    assert.strictEqual(
      groups[0].items.find((a) => a.id === 'a3').status,
      'cancelled'
    );
  });
});
