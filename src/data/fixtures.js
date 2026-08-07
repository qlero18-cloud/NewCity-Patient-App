// Visitas ficticias para el prototipo y las pruebas (PRD §7 Visit /
// Appointment / QPass / Lodging). En el MVP real esto lo sustituye el
// panel de coordinadores (fase 08).
//
// TODOS los pacientes de este archivo son ficticios. Los nombres
// (María, Roberto, Consuelo, Fernando, Alejandra) son nombres de pila
// genéricos elegidos sin ninguna relación con pacientes reales de
// NewCity — igual que los tokens, que son cadenas de ejemplo, no valores
// aleatorios de 128 bits como pide el PRD §6.1 para producción. El chofer
// de los traslados (Etapa G) es ficticio por lo mismo, y su teléfono es un
// número de ejemplo: nadie contesta ahí.
//
// `Visit.expiresAt` (PRD §7: "derivado, ver R1") se omite a propósito en
// estos objetos: guardar un valor calculado a mano junto a las citas que
// lo determinan es la fuente de bugs que R1 ya advierte ("se recalcula
// cada vez que se agrega, mueve o cancela una cita"). Quien necesite
// expiresAt lo pide con computeExpiresAt(expediente) (fase 01) — una sola
// fuente de verdad, nunca un valor que se puede desincronizar.

function appointment(id, visitId, startsAt, durationMin, serviceName, locationId, status, updatedAt) {
  return { id, visitId, startsAt, durationMin, serviceName, locationId, status, updatedAt };
}

function pass(id, visitId, scope, format, validFrom, options = {}) {
  return {
    id,
    visitId,
    appointmentId: null,
    format,
    payload: `payload-${id}`,
    scope,
    validFrom,
    validUntil: options.validUntil ?? null,
    revokedAt: options.revokedAt ?? null,
    issuedAt: options.issuedAt ?? validFrom,
  };
}

// Etapa G. `driver` y `vehicle` se pasan enteros y no campo por campo
// porque son opcionales de verdad: la coordinadora captura el traslado
// días antes y al chofer se lo asignan la víspera, así que { name: '',
// phone: '' } es un estado normal del dato, no una fixture a medias.
function transfer(id, visitId, kind, scheduledAt, meetingPointId, options = {}) {
  return {
    id,
    visitId,
    kind,
    scheduledAt,
    meetingPointId,
    flightNumber: options.flightNumber ?? '',
    driver: options.driver ?? { name: '', phone: '' },
    vehicle: options.vehicle ?? { type: '', make: '', model: '', color: '', plate: '' },
    status: options.status ?? 'scheduled',
    notes: options.notes ?? '',
  };
}

// ---------------------------------------------------------------------
// v_demo1 — la visita del PRD §8, dato por dato. Es la que enseña el
// prototipo, y las pruebas de fase 01 la reproducen inline: si algo aquí
// se desalinea con el PRD, las pruebas de expiry/nextStep/passes de fase
// 01 y las de esta fase dejan de coincidir.
// ---------------------------------------------------------------------
const v_demo1 = {
  visit: {
    id: 'v_demo1',
    token: 'fixture-token-v-demo1',
    patientFirstName: 'María',
    lang: 'es',
    startsAt: '2026-03-10T08:00-07:00',
    endsAt: '2026-03-11T09:30-07:00',
    status: 'active',
  },
  appointments: [
    appointment('a1', 'v_demo1', '2026-03-10T08:00-07:00', 45, 'Laboratorio', 'compass', 'scheduled', '2026-03-01T00:00-08:00'),
    appointment('a2', 'v_demo1', '2026-03-10T09:30-07:00', 60, 'Resonancia magnética', 'compass', 'scheduled', '2026-03-01T00:00-08:00'),
    appointment('a3', 'v_demo1', '2026-03-10T12:00-07:00', 30, 'Consulta de Medicina Interna', 'piso27', 'scheduled', '2026-03-01T00:00-08:00'),
    appointment('a4', 'v_demo1', '2026-03-11T09:00-07:00', 30, 'Consulta de Cardiología', 'piso27', 'scheduled', '2026-03-01T00:00-08:00'),
  ],
  passes: [
    pass('q1', 'v_demo1', 'torre', 'qr', '2026-03-10T06:00-07:00'),
    pass('q2', 'v_demo1', 'estacionamiento', 'code128', '2026-03-10T06:00-07:00'),
  ],
  lodging: {
    visitId: 'v_demo1',
    hotel: 'Quartz Hotel & Spa',
    reservationCode: 'QZ-8841-MX',
    checkIn: '2026-03-10T15:00-07:00',
    checkOut: '2026-03-11T12:00-07:00',
    breakfastIncluded: true,
    recoveryRoom: false,
  },
  // Etapa G — la única fixture con traslados, a propósito: es la que
  // enseña el prototipo y la que se abre en el navegador sin backend, así
  // que es donde la pantalla nueva tiene que poder verse. Las otras cuatro
  // no declaran la llave, y eso también se prueba: son el retrato de un
  // expediente guardado antes de esta etapa.
  //
  // El de regreso recoge en el hotel A LA HORA DEL CHECKOUT. No es
  // casualidad: un traslado posterior al checkout correría la caducidad
  // (R1) y el ejemplo trabajado del PRD §8 —expiresAt 2026-03-12T12:00—
  // dejaría de reproducirse dato por dato. Que R1 SÍ tenga que contar el
  // traslado de regreso se prueba en test/domain/expiry.test.js, con datos
  // hechos para eso; esta fixture tiene otro trabajo.
  transfers: [
    transfer('t_demo1_in', 'v_demo1', 'arrival', '2026-03-10T06:00-07:00', 'tij_terminal', {
      flightNumber: 'AM654',
      driver: { name: 'Juan Pérez', phone: '+526641234567' },
      vehicle: { type: 'van', make: 'Toyota', model: 'Hiace', color: 'Blanca', plate: 'ABC-123-D' },
      notes: 'El chofer te espera en Llegadas con un letrero con tu nombre.',
    }),
    // Sin chofer todavía: es lo normal dos días antes, y es lo que hace
    // visible el aviso "Te confirmamos el chofer un día antes".
    transfer('t_demo1_out', 'v_demo1', 'departure', '2026-03-11T12:00-07:00', 'quartz', {
      flightNumber: 'AM655',
    }),
  ],
};

// ---------------------------------------------------------------------
// v_demo2 — sin hospedaje, un solo día, una cancelada (b2) y una movida
// (b3, con updatedAt reflejando el cambio). Ejercita "Mi estancia no
// aparece", la cita tachada, el distintivo "actualizado" y R1 caso 1g.
// ---------------------------------------------------------------------
const v_demo2 = {
  visit: {
    id: 'v_demo2',
    token: 'fixture-token-v-demo2',
    patientFirstName: 'Roberto',
    lang: 'es',
    startsAt: '2026-04-06T09:00-07:00',
    endsAt: '2026-04-06T13:30-07:00',
    status: 'active',
  },
  appointments: [
    appointment('b1', 'v_demo2', '2026-04-06T09:00-07:00', 30, 'Laboratorio', 'compass', 'scheduled', '2026-04-01T00:00-07:00'),
    appointment('b2', 'v_demo2', '2026-04-06T10:00-07:00', 30, 'Estudios de imagen', 'compass', 'cancelled', '2026-04-05T18:00-07:00'),
    // b3 se movió de 11:00 a 13:00 la mañana de la visita: updatedAt es
    // posterior a cuando un paciente normalmente ya habría visto su
    // itinerario, para que el distintivo "actualizado" tenga sentido.
    appointment('b3', 'v_demo2', '2026-04-06T13:00-07:00', 30, 'Consulta con especialista', 'piso27', 'scheduled', '2026-04-06T08:30-07:00'),
  ],
  passes: [pass('qb1', 'v_demo2', 'torre', 'qr', '2026-04-06T07:00-07:00')],
  lodging: null,
};

// ---------------------------------------------------------------------
// v_longstay — última cita el día 2, checkout el día 5. Ejercita el caso
// 1f de R1 (el checkout manda por mucho margen) y que el pase sin
// caducidad siga visible el último día de una estancia larga.
// ---------------------------------------------------------------------
const v_longstay = {
  visit: {
    id: 'v_longstay',
    token: 'fixture-token-v-longstay',
    patientFirstName: 'Consuelo',
    lang: 'es',
    startsAt: '2026-05-04T10:00-07:00',
    endsAt: '2026-05-05T09:30-07:00',
    status: 'active',
  },
  appointments: [
    appointment('c1', 'v_longstay', '2026-05-04T10:00-07:00', 45, 'Laboratorio', 'compass', 'scheduled', '2026-05-01T00:00-07:00'),
    appointment('c2', 'v_longstay', '2026-05-05T09:00-07:00', 30, 'Consulta con especialista', 'piso27', 'scheduled', '2026-05-01T00:00-07:00'),
  ],
  passes: [pass('qc1', 'v_longstay', 'torre', 'qr', '2026-05-04T08:00-07:00')],
  lodging: {
    visitId: 'v_longstay',
    hotel: 'Quartz Hotel & Spa',
    reservationCode: 'QZ-9012-MX',
    checkIn: '2026-05-04T15:00-07:00',
    checkOut: '2026-05-08T12:00-07:00', // día 5 (día 1 = 4 de mayo)
    breakfastIncluded: true,
    recoveryRoom: true,
  },
};

// ---------------------------------------------------------------------
// v_expired — expiresAt ya pasó. Sirve para probar la pantalla neutra
// (INV-3). Fecha en enero (horario estándar, -08:00) a propósito: da
// cobertura real de horario estándar además de la de verano de v_demo1.
// ---------------------------------------------------------------------
const v_expired = {
  visit: {
    id: 'v_expired',
    token: 'fixture-token-v-expired',
    patientFirstName: 'Fernando',
    lang: 'es',
    startsAt: '2026-01-12T09:00-08:00',
    endsAt: '2026-01-12T09:30-08:00',
    status: 'active',
  },
  appointments: [appointment('e1', 'v_expired', '2026-01-12T09:00-08:00', 30, 'Laboratorio', 'compass', 'scheduled', '2026-01-01T00:00-08:00')],
  passes: [pass('qe1', 'v_expired', 'torre', 'qr', '2026-01-12T07:00-08:00')],
  lodging: null,
};

// ---------------------------------------------------------------------
// v_revoked — un QPASS revocado (qf1) y uno activo (qf2). Ejercita INV-4
// y el caso 3b: el revocado no debe verse ni desde caché.
// ---------------------------------------------------------------------
const v_revoked = {
  visit: {
    id: 'v_revoked',
    token: 'fixture-token-v-revoked',
    patientFirstName: 'Alejandra',
    lang: 'en',
    startsAt: '2026-06-09T10:00-07:00',
    endsAt: '2026-06-09T10:30-07:00',
    status: 'active',
  },
  appointments: [appointment('f1', 'v_revoked', '2026-06-09T10:00-07:00', 30, 'Laboratorio', 'compass', 'scheduled', '2026-06-01T00:00-07:00')],
  passes: [
    pass('qf1', 'v_revoked', 'torre', 'qr', '2026-06-09T06:00-07:00', { revokedAt: '2026-06-09T14:00-07:00' }),
    pass('qf2', 'v_revoked', 'estacionamiento', 'code128', '2026-06-09T06:00-07:00'),
  ],
  lodging: null,
};

export const fixtures = { v_demo1, v_demo2, v_longstay, v_expired, v_revoked };
