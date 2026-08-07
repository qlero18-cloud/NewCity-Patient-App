// Fase 09 — coordinatorStore.js: copia en memoria de src/data/fixtures.js
// que la demo del coordinador muta. La promesa central del doc de esta
// fase ("nunca el archivo fixtures.js, nunca localStorage, nunca un
// servidor") solo se cumple si esta copia es de verdad independiente —
// por eso la primera prueba de este archivo es justo esa, no una
// genérica de "funciona".
//
// now se recibe como parámetro en todo método que estampa una hora
// (mismo criterio INV-1 que src/domain/, D11) — coordinatorStore.js no es
// el lugar sancionado para leer el reloj real (D20: ese permiso es solo
// de src/ui/app.js); quien orqueste esta store (coordinatorApp.js) es
// quien decide qué "now" usar, igual que app.js hace con el resto de la
// UI. Los ids se generan con un contador propio de cada store — no hace
// falta más que eso para una demo sin persistencia real, y un contador es
// determinista y fácil de probar, a diferencia de algo aleatorio.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createCoordinatorStore } from '../../src/ui/coordinatorStore.js';
import { fixtures } from '../../src/data/fixtures.js';

const NOW = '2026-03-10T10:00-07:00';

describe('createCoordinatorStore — copia independiente de fixtures.js', () => {
  test('listVisits arranca con las mismas visitas que fixtures.js', () => {
    const store = createCoordinatorStore();
    const ids = store.listVisits().map((v) => v.visit.id).sort();
    assert.deepStrictEqual(ids, Object.keys(fixtures).sort());
  });

  test('mutar la store NO toca el módulo fixtures.js real', () => {
    const store = createCoordinatorStore();
    store.addAppointment('v_demo1', { startsAt: NOW, durationMin: 30, serviceName: 'Prueba', locationId: 'piso27' }, NOW);
    assert.strictEqual(fixtures.v_demo1.appointments.length, 4, 'fixtures.js no debe cambiar de tamaño');
    assert.strictEqual(store.getVisit('v_demo1').appointments.length, 5);
  });

  test('dos stores independientes no comparten estado (dos pestañas de la demo)', () => {
    const storeA = createCoordinatorStore();
    const storeB = createCoordinatorStore();
    storeA.addAppointment('v_demo1', { startsAt: NOW, durationMin: 30, serviceName: 'Solo en A', locationId: 'piso27' }, NOW);
    assert.strictEqual(storeA.getVisit('v_demo1').appointments.length, 5);
    assert.strictEqual(storeB.getVisit('v_demo1').appointments.length, 4);
  });
});

describe('createCoordinatorStore — alta de visita', () => {
  test('createVisit agrega una visita nueva, visible de inmediato en listVisits', () => {
    const store = createCoordinatorStore();
    const before = store.listVisits().length;
    const visit = store.createVisit({ patientFirstName: 'Carlos', lang: 'es', startsAt: NOW, endsAt: NOW });
    assert.strictEqual(store.listVisits().length, before + 1);
    assert.strictEqual(visit.patientFirstName, 'Carlos');
    assert.strictEqual(visit.status, 'active');
    assert.ok(visit.id, 'la visita nueva necesita un id');
    assert.ok(visit.token, 'la visita nueva necesita un token, aunque sea de demo');
  });

  test('dos altas seguidas nunca comparten id', () => {
    const store = createCoordinatorStore();
    const a = store.createVisit({ patientFirstName: 'A', lang: 'es', startsAt: NOW, endsAt: NOW });
    const b = store.createVisit({ patientFirstName: 'B', lang: 'es', startsAt: NOW, endsAt: NOW });
    assert.notStrictEqual(a.id, b.id);
  });
});

describe('createCoordinatorStore — itinerario', () => {
  test('addAppointment agrega una cita "scheduled" a la visita correcta', () => {
    const store = createCoordinatorStore();
    const appt = store.addAppointment('v_demo1', { startsAt: NOW, durationMin: 45, serviceName: 'Laboratorio extra', locationId: 'compass' }, NOW);
    assert.strictEqual(appt.status, 'scheduled');
    assert.strictEqual(appt.visitId, 'v_demo1');
    assert.ok(store.getVisit('v_demo1').appointments.some((a) => a.id === appt.id));
  });

  test('moveAppointment cambia startsAt y marca la cita como "moved"', () => {
    const store = createCoordinatorStore();
    const newTime = '2026-03-10T15:00-07:00';
    const moved = store.moveAppointment('v_demo1', 'a1', newTime, NOW);
    assert.strictEqual(moved.startsAt, newTime);
    assert.strictEqual(moved.status, 'moved');
    assert.strictEqual(moved.updatedAt, NOW);
  });

  test('cancelAppointment marca la cita como "cancelled" sin quitarla del arreglo', () => {
    const store = createCoordinatorStore();
    const cancelled = store.cancelAppointment('v_demo1', 'a2', NOW);
    assert.strictEqual(cancelled.status, 'cancelled');
    assert.strictEqual(store.getVisit('v_demo1').appointments.length, 4, 'sigue en el arreglo, solo cambia de estado');
  });

  test('mover o cancelar una cita de un id inexistente devuelve null, no lanza excepción', () => {
    const store = createCoordinatorStore();
    assert.strictEqual(store.moveAppointment('v_demo1', 'a-no-existe', NOW, NOW), null);
    assert.strictEqual(store.cancelAppointment('v_demo1', 'a-no-existe', NOW), null);
  });
});

describe('createCoordinatorStore — hospedaje', () => {
  test('setLodging registra el hospedaje de una visita que no tenía (v_demo2)', () => {
    const store = createCoordinatorStore();
    assert.strictEqual(store.getVisit('v_demo2').lodging, null);
    const lodging = store.setLodging('v_demo2', {
      hotel: 'Quartz Hotel & Spa',
      reservationCode: 'QZ-0001',
      checkIn: NOW,
      checkOut: NOW,
      breakfastIncluded: true,
      recoveryRoom: false,
    });
    assert.strictEqual(lodging.visitId, 'v_demo2');
    assert.strictEqual(store.getVisit('v_demo2').lodging.reservationCode, 'QZ-0001');
  });
});

describe('createCoordinatorStore — emisión de QPASS (D29)', () => {
  test('issueQpass crea un QPass con format:"image" y el payload es la data URL tal cual, no un símbolo generado', () => {
    const store = createCoordinatorStore();
    const dataUrl = 'data:image/jpeg;base64,AAAA';
    const qpass = store.issueQpass('v_demo1', { format: 'image', payload: dataUrl, scope: 'torre' }, NOW);
    assert.strictEqual(qpass.format, 'image');
    assert.strictEqual(qpass.payload, dataUrl);
    assert.strictEqual(qpass.validUntil, null, 'D15: sin caducidad por tiempo, el caso normal');
    assert.strictEqual(qpass.revokedAt, null);
    assert.strictEqual(qpass.issuedAt, NOW);
  });

  test('getVisitWithPasses trae el QPass recién emitido, listo para pass-preview', () => {
    const store = createCoordinatorStore();
    store.issueQpass('v_demo2', { format: 'image', payload: 'data:image/jpeg;base64,BBBB', scope: 'torre' }, NOW);
    const { visit, passes } = store.getVisitWithPasses('v_demo2');
    assert.strictEqual(visit.id, 'v_demo2');
    assert.ok(passes.some((p) => p.format === 'image' && p.payload === 'data:image/jpeg;base64,BBBB'));
  });

  test('visita inexistente: getVisitWithPasses e issueQpass devuelven null, no lanzan excepción', () => {
    const store = createCoordinatorStore();
    assert.strictEqual(store.getVisitWithPasses('v-no-existe'), null);
    assert.strictEqual(store.issueQpass('v-no-existe', { format: 'image', payload: 'x', scope: 'torre' }, NOW), null);
  });
});
