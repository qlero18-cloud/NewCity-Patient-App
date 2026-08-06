// Fase 01 — pruebas de R3 (PRD §8, casos 3a–3e). Rojo esperado: el módulo
// src/domain/passes.js todavía no existe.
//
// Crítico (3c): validUntil: null significa "no caduca". Un null tratado
// como fecha inválida o como cero apagaría el pase — es el fallo que
// motivó §6.5 y D15/D16 en docs/DECISIONS.md.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { visiblePasses } from '../../src/domain/passes.js';

function makePass(overrides) {
  return {
    id: 'q1',
    visitId: 'v_demo1',
    appointmentId: null,
    format: 'qr',
    payload: 'payload-demo',
    scope: 'torre',
    validFrom: '2026-03-10T06:00-07:00',
    validUntil: null,
    revokedAt: null,
    issuedAt: '2026-03-09T00:00-08:00',
    ...overrides,
  };
}

describe('R3 — visiblePasses (PRD §8)', () => {
  test('3a — dos pases sin caducidad, ambos ya en validFrom: torre arriba, estacionamiento abajo', () => {
    const q1 = makePass({ id: 'q1', scope: 'torre' });
    const q2 = makePass({ id: 'q2', scope: 'estacionamiento' });
    const visible = visiblePasses([q2, q1], '2026-03-10T07:00-07:00');
    assert.deepStrictEqual(visible.map((p) => p.id), ['q1', 'q2']);
  });

  test('3b — un pase revocado desaparece aunque no tenga validUntil; el otro se mantiene', () => {
    const q1 = makePass({ id: 'q1', scope: 'torre', revokedAt: '2026-03-10T12:00-07:00' });
    const q2 = makePass({ id: 'q2', scope: 'estacionamiento' });
    const visible = visiblePasses([q1, q2], '2026-03-10T12:00:01-07:00');
    assert.deepStrictEqual(visible.map((p) => p.id), ['q2']);
  });

  test('3c — validUntil: null sigue visible el tercer día de la estancia (no se trata como fecha inválida)', () => {
    const q1 = makePass({ id: 'q1', scope: 'torre', validUntil: null });
    const q2 = makePass({ id: 'q2', scope: 'estacionamiento', validUntil: null });
    const visible = visiblePasses([q1, q2], '2026-03-11T23:00-07:00');
    assert.deepStrictEqual(visible.map((p) => p.id), ['q1', 'q2']);
  });

  test('3d — antes de validFrom: ningún pase visible', () => {
    const q1 = makePass({ id: 'q1' });
    const q2 = makePass({ id: 'q2', scope: 'estacionamiento' });
    const visible = visiblePasses([q1, q2], '2026-03-10T05:59-07:00');
    assert.deepStrictEqual(visible, []);
  });

  test('3e — un pase con validUntil vencido no se muestra; el de validUntil: null sí', () => {
    const withWindow = makePass({ id: 'q1', validUntil: '2026-03-10T23:59-07:00' });
    const noExpiry = makePass({ id: 'q2', scope: 'estacionamiento', validUntil: null });
    const visible = visiblePasses([withWindow, noExpiry], '2026-03-11T00:01-07:00');
    assert.deepStrictEqual(visible.map((p) => p.id), ['q2']);
  });

  test('orden torre → piso27 → estacionamiento con los tres escopos presentes', () => {
    const torre = makePass({ id: 'q_torre', scope: 'torre' });
    const piso27 = makePass({ id: 'q_piso27', scope: 'piso27' });
    const estacionamiento = makePass({ id: 'q_estacionamiento', scope: 'estacionamiento' });
    const visible = visiblePasses([estacionamiento, torre, piso27], '2026-03-10T07:00-07:00');
    assert.deepStrictEqual(visible.map((p) => p.scope), ['torre', 'piso27', 'estacionamiento']);
  });
});
