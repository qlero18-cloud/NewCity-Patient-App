// Fase 01 — pruebas de R2 (PRD §8, casos 2a–2f). Rojo esperado: el módulo
// src/domain/nextStep.js todavía no existe.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nextStep } from '../../src/domain/nextStep.js';

const A1 = { id: 'a1', visitId: 'v_demo1', startsAt: '2026-03-10T08:00-07:00', durationMin: 45, serviceName: 'Laboratorio', locationId: 'compass', status: 'done', updatedAt: '2026-03-01T00:00-08:00' };
const A2 = { id: 'a2', visitId: 'v_demo1', startsAt: '2026-03-10T09:30-07:00', durationMin: 60, serviceName: 'Resonancia magnética', locationId: 'compass', status: 'scheduled', updatedAt: '2026-03-01T00:00-08:00' };
const A3 = { id: 'a3', visitId: 'v_demo1', startsAt: '2026-03-10T12:00-07:00', durationMin: 30, serviceName: 'Consulta de Medicina Interna', locationId: 'piso27', status: 'scheduled', updatedAt: '2026-03-01T00:00-08:00' };
const A4 = { id: 'a4', visitId: 'v_demo1', startsAt: '2026-03-11T09:00-07:00', durationMin: 30, serviceName: 'Consulta de Cardiología', locationId: 'piso27', status: 'scheduled', updatedAt: '2026-03-01T00:00-08:00' };

describe('R2 — nextStep (PRD §8)', () => {
  test('2a — A1 done: la siguiente scheduled es A2', () => {
    const appts = [A1, A2, A3, A4];
    assert.strictEqual(nextStep(appts, '2026-03-10T09:00-07:00').id, 'a2');
  });

  test('2b — A2 in_progress gana sobre cualquier futura', () => {
    const inProgressA2 = { ...A2, status: 'in_progress' };
    const appts = [A1, inProgressA2, A3, A4];
    assert.strictEqual(nextStep(appts, '2026-03-10T09:45-07:00').id, 'a2');
  });

  test('2c — A1-A3 done: salta al día siguiente (A4)', () => {
    const done = { ...A1, status: 'done' };
    const doneA2 = { ...A2, status: 'done' };
    const doneA3 = { ...A3, status: 'done' };
    const appts = [done, doneA2, doneA3, A4];
    assert.strictEqual(nextStep(appts, '2026-03-10T13:00-07:00').id, 'a4');
  });

  test('2d — todas done: "completaste tu itinerario" (null)', () => {
    const allDone = [A1, A2, A3, A4].map((a) => ({ ...a, status: 'done' }));
    assert.strictEqual(nextStep(allDone, '2026-03-11T09:35-07:00'), null);
  });

  test('2e — una cancelada nunca es el siguiente paso', () => {
    const cancelledA3 = { ...A3, status: 'cancelled' };
    const appts = [A1, A2, cancelledA3, A4];
    assert.strictEqual(nextStep(appts, '2026-03-10T11:00-07:00').id, 'a4');
  });

  test('2f — mismo startsAt y misma ubicación: gana el id menor', () => {
    const a_x = { id: 'a_x', visitId: 'v_demo1', startsAt: '2026-03-10T12:00-07:00', durationMin: 30, serviceName: 'Consulta', locationId: 'piso27', status: 'scheduled', updatedAt: '2026-03-01T00:00-08:00' };
    const a_b = { id: 'a_b', visitId: 'v_demo1', startsAt: '2026-03-10T12:00-07:00', durationMin: 30, serviceName: 'Consulta', locationId: 'piso27', status: 'scheduled', updatedAt: '2026-03-01T00:00-08:00' };
    const result = nextStep([a_x, a_b], '2026-03-10T00:00-07:00');
    assert.strictEqual(result.id, 'a_b');
  });
});
