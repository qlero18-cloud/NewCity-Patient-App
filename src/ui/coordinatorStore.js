// Fase 09 — copia en memoria de src/data/fixtures.js que la demo del
// coordinador muta. Vive en src/ui/, no en src/data/: es estado de sesión
// del navegador (se pierde al recargar, a propósito — ver el doc de esta
// fase), no datos de dominio reutilizables como el resto de src/data/.
//
// "Nunca el archivo fixtures.js, nunca localStorage, nunca un servidor"
// (docs/phases/phase-09-coordinator-demo.md) depende de que esta copia
// sea de verdad independiente del módulo real — structuredClone (global
// desde Node 18 y todos los navegadores modernos, sin dependencia nueva)
// en vez de una asignación por referencia, probado explícitamente en
// test/ui/coordinatorStore.test.js.
//
// now se recibe como parámetro en todo método que estampa una hora (mismo
// criterio INV-1 de src/domain/, D11): este archivo no es el lugar
// sancionado para leer el reloj real, ese permiso es solo de
// src/ui/app.js (D20) — coordinatorApp.js (quien orquesta esta store) es
// quien decide qué "now" pasar, igual que app.js hace con el resto de la
// UI del paciente.

import { fixtures } from '../data/fixtures.js';

export function createCoordinatorStore(initialFixtures = fixtures) {
  const visitsById = new Map(Object.entries(initialFixtures).map(([id, record]) => [id, structuredClone(record)]));
  let counter = 0;
  function nextId(prefix) {
    counter += 1;
    return `${prefix}_${counter}`;
  }

  function record(visitId) {
    return visitsById.get(visitId) ?? null;
  }

  return {
    listVisits() {
      return [...visitsById.values()];
    },

    getVisit(visitId) {
      return record(visitId);
    },

    getVisitWithPasses(visitId) {
      const r = record(visitId);
      return r ? { visit: r.visit, passes: r.passes } : null;
    },

    // token de demo, nunca los 128 bits aleatorios que pide el PRD §6.1
    // para producción — mismo criterio ya usado por las fixtures propias
    // de fase 03 (ver el comentario de cabecera de fixtures.js).
    createVisit({ patientFirstName, lang, startsAt, endsAt }) {
      const id = nextId('v');
      const newRecord = {
        visit: {
          id,
          token: `demo-token-${id}`,
          patientFirstName,
          lang,
          startsAt,
          endsAt,
          status: 'active',
        },
        appointments: [],
        passes: [],
        lodging: null,
      };
      visitsById.set(id, newRecord);
      return newRecord.visit;
    },

    addAppointment(visitId, { startsAt, durationMin, serviceName, locationId }, now) {
      const r = record(visitId);
      if (!r) return null;
      const appt = {
        id: nextId('a'),
        visitId,
        startsAt,
        durationMin,
        serviceName,
        locationId,
        status: 'scheduled',
        updatedAt: now,
      };
      r.appointments.push(appt);
      return appt;
    },

    moveAppointment(visitId, appointmentId, newStartsAt, now) {
      const appt = record(visitId)?.appointments.find((a) => a.id === appointmentId);
      if (!appt) return null;
      appt.startsAt = newStartsAt;
      appt.status = 'moved';
      appt.updatedAt = now;
      return appt;
    },

    // "editarla" (docs/phases/phase-09-coordinator-demo.md) es una acción
    // propia, distinta de "moverla": cubre serviceName/durationMin/
    // locationId nada más. startsAt sigue siendo trabajo exclusivo de
    // moveAppointment de arriba, y status nunca se toca aquí — el enum
    // cerrado de Appointment.status (PRD §7: scheduled/in_progress/done/
    // moved/cancelled) no tiene, ni necesita, un valor para "editado";
    // editar contenido no es un cambio de estado.
    editAppointment(visitId, appointmentId, { serviceName, durationMin, locationId }, now) {
      const appt = record(visitId)?.appointments.find((a) => a.id === appointmentId);
      if (!appt) return null;
      appt.serviceName = serviceName;
      appt.durationMin = durationMin;
      appt.locationId = locationId;
      appt.updatedAt = now;
      return appt;
    },

    cancelAppointment(visitId, appointmentId, now) {
      const appt = record(visitId)?.appointments.find((a) => a.id === appointmentId);
      if (!appt) return null;
      appt.status = 'cancelled';
      appt.updatedAt = now;
      return appt;
    },

    setLodging(visitId, lodging) {
      const r = record(visitId);
      if (!r) return null;
      r.lodging = { visitId, ...lodging };
      return r.lodging;
    },

    // Emisión de QPASS (D29): format 'image' con payload = data: URL
    // completa, no un string corto para qr.js/code128.js. validUntil:
    // null es el caso normal (D15 — sin caducidad por tiempo).
    issueQpass(visitId, { format, payload, scope }, now) {
      const r = record(visitId);
      if (!r) return null;
      const qpass = {
        id: nextId('q'),
        visitId,
        appointmentId: null,
        format,
        payload,
        scope,
        validFrom: now,
        validUntil: null,
        revokedAt: null,
        issuedAt: now,
      };
      r.passes.push(qpass);
      return qpass;
    },

    // Revocar NO borra el pase: le estampa revokedAt y lo deja en la
    // lista. Un pase emitido es historia de la visita — quién entró con
    // qué y hasta cuándo — y esa historia no se reescribe (§6.5: revocar
    // es el único mecanismo de invalidación de un pase sin caducidad, y
    // solo funciona si el registro sobrevive para decir que se revocó).
    // Ya revocado se deja como está: la primera revocación es la que
    // vale, volver a llamar no debe correr la hora hacia adelante.
    revokeQpass(visitId, passId, now) {
      const r = record(visitId);
      if (!r) return null;
      const qpass = r.passes.find((p) => p.id === passId);
      if (!qpass) return null;
      if (qpass.revokedAt === null || qpass.revokedAt === undefined) {
        qpass.revokedAt = now;
      }
      return qpass;
    },
  };
}
