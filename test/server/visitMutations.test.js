// Etapa D — mutaciones del expediente, del lado del servidor. Se escriben
// antes que el módulo (rojo esperado).
//
// Hasta aquí, `addAppointment` y `editAppointment` de src/ui/coordinatorStore.js
// no validaban NADA: lo que llegara del formulario entraba al registro tal
// cual. Mientras todo vivía en memoria y se borraba al recargar, eso era un
// detalle; ahora lo que entre se guarda y lo lee el paciente en su teléfono.
//
// Dos cosas que estas pruebas fijan y que son el punto de la etapa:
//
//   1. `locationId` tiene que existir en el catálogo. El <select> de la
//      Etapa A arregla los typos en la pantalla, pero la pantalla no es la
//      autoridad: un POST con `locationId: "piso 27"` deja una cita que el
//      mapa no puede dibujar. Aquí se rechaza.
//   2. Cada mutación deja firmado QUIÉN la hizo. Es lo que compran las
//      cuentas individuales de la Etapa C; sin esto, tener cuentas separadas
//      no sirve de nada.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAppointmentInput,
  addAppointment,
  moveAppointment,
  editAppointment,
  cancelAppointment,
  setLodging,
  issueQpass,
  revokeQpass,
  validateTransferInput,
  addTransfer,
  editTransfer,
  cancelTransfer,
  MAX_DURATION_MIN,
  MAX_SERVICE_NAME,
  MAX_DRIVER_NAME,
  MAX_PLATE,
} from '../../src/server/visitMutations.js';

const AHORA = '2026-03-10T09:00:00.000-07:00';
const LUEGO = '2026-03-10T11:30:00.000-07:00';
const POR = 'ana.ruiz';

const ctx = (extra = {}) => ({ now: AHORA, by: POR, newId: () => 'a_fijo', ...extra });

function registro() {
  return {
    visit: {
      id: 'v_1',
      token: 'tok',
      patientFirstName: 'Ana',
      lang: 'es',
      startsAt: '2026-03-10T08:00:00.000-07:00',
      endsAt: '2026-03-11T20:00:00.000-07:00',
      status: 'active',
    },
    appointments: [],
    passes: [],
    lodging: null,
  };
}

const citaValida = () => ({
  startsAt: LUEGO,
  durationMin: 45,
  serviceName: 'Resonancia magnética',
  locationId: 'compass',
});

describe('validateAppointmentInput — lo que el formulario no puede garantizar', () => {
  test('una cita bien formada pasa', () => {
    assert.deepEqual(validateAppointmentInput(citaValida()), { ok: true, errors: {} });
  });

  test('locationId tiene que existir en el catálogo', () => {
    // El corazón de la etapa: el <select> de la Etapa A evita el typo en la
    // pantalla, pero quien manda el POST no tiene por qué haber pasado por la
    // pantalla. Una ubicación inventada es una cita que el mapa no dibuja.
    for (const malo of ['piso 27', 'Piso27', 'PISO27', 'compass ', '', null, undefined, 42]) {
      const r = validateAppointmentInput({ ...citaValida(), locationId: malo });
      assert.equal(r.ok, false, `${JSON.stringify(malo)} debería rechazarse`);
      assert.equal(r.errors.locationId, malo ? 'unknown' : 'required');
    }
  });

  test('acepta cada id real del catálogo, no una lista copiada a mano', async () => {
    // Si mañana se agrega una ubicación, esta prueba la cubre sola. Una lista
    // literal aquí se desincronizaría en silencio.
    const { LOCATION_IDS } = await import('../../src/data/locations.js');
    assert.ok(LOCATION_IDS.length >= 7);
    for (const id of LOCATION_IDS) {
      assert.equal(validateAppointmentInput({ ...citaValida(), locationId: id }).ok, true, id);
    }
  });

  test('startsAt exige fecha válida CON desplazamiento', () => {
    const sin = validateAppointmentInput({ ...citaValida(), startsAt: '2026-03-10T11:30:00' });
    assert.equal(sin.errors.startsAt, 'noOffset');

    const mala = validateAppointmentInput({ ...citaValida(), startsAt: 'mañana' });
    assert.equal(mala.errors.startsAt, 'invalidDate', 'primero "¿es fecha?", luego "¿trae zona?"');

    assert.equal(validateAppointmentInput({ ...citaValida(), startsAt: '' }).errors.startsAt, 'required');
  });

  test('durationMin: entero positivo y con tope', () => {
    for (const malo of [0, -5, 1.5, NaN, Infinity, '45', null]) {
      const r = validateAppointmentInput({ ...citaValida(), durationMin: malo });
      assert.equal(r.ok, false, `${JSON.stringify(malo)} debería rechazarse`);
    }
    assert.equal(validateAppointmentInput({ ...citaValida(), durationMin: MAX_DURATION_MIN }).ok, true);
    assert.equal(
      validateAppointmentInput({ ...citaValida(), durationMin: MAX_DURATION_MIN + 1 }).errors.durationMin,
      'tooLong',
    );
  });

  test('serviceName obligatorio y acotado', () => {
    assert.equal(validateAppointmentInput({ ...citaValida(), serviceName: '   ' }).errors.serviceName, 'required');
    assert.equal(
      validateAppointmentInput({ ...citaValida(), serviceName: 'x'.repeat(MAX_SERVICE_NAME + 1) }).errors.serviceName,
      'tooLong',
    );
  });

  test('reporta TODOS los campos malos, no solo el primero', () => {
    // Corregir de uno en uno, con un viaje al servidor por campo, es lo que
    // hace que la gente abandone un formulario.
    const r = validateAppointmentInput({ startsAt: '', durationMin: 0, serviceName: '', locationId: 'nope' });
    assert.deepEqual(Object.keys(r.errors).sort(), ['durationMin', 'locationId', 'serviceName', 'startsAt']);
  });

  test('no truena con basura en vez de objeto', () => {
    for (const basura of [null, undefined, 'texto', 42, []]) {
      assert.equal(validateAppointmentInput(basura).ok, false);
    }
  });
});

describe('addAppointment', () => {
  test('agrega la cita firmada por quien la hizo', () => {
    const r = registro();
    const res = addAppointment(r, citaValida(), ctx());

    assert.equal(res.ok, true);
    assert.equal(r.appointments.length, 1);
    assert.deepEqual(r.appointments[0], {
      id: 'a_fijo',
      visitId: 'v_1',
      startsAt: LUEGO,
      durationMin: 45,
      serviceName: 'Resonancia magnética',
      locationId: 'compass',
      status: 'scheduled',
      createdAt: AHORA,
      createdBy: POR,
      updatedAt: AHORA,
      updatedBy: POR,
    });
  });

  test('recorta los espacios del nombre del estudio', () => {
    const r = registro();
    addAppointment(r, { ...citaValida(), serviceName: '  Ultrasonido  ' }, ctx());
    assert.equal(r.appointments[0].serviceName, 'Ultrasonido');
  });

  test('una cita inválida no toca el registro', () => {
    const r = registro();
    const res = addAppointment(r, { ...citaValida(), locationId: 'inventada' }, ctx());
    assert.equal(res.ok, false);
    assert.equal(res.errors.locationId, 'unknown');
    assert.equal(r.appointments.length, 0, 'no debe quedar nada a medias');
  });

  test('ignora campos que el cliente no tiene por qué mandar', () => {
    // Un POST puede traer lo que quiera. Solo entran los cuatro campos del
    // formulario: nada de fijar `status: "done"` o `createdBy: "alguien más"`
    // desde afuera.
    const r = registro();
    addAppointment(r, { ...citaValida(), status: 'done', createdBy: 'otro', id: 'a_mío', visitId: 'v_9' }, ctx());
    const a = r.appointments[0];
    assert.equal(a.status, 'scheduled');
    assert.equal(a.createdBy, POR);
    assert.equal(a.id, 'a_fijo');
    assert.equal(a.visitId, 'v_1');
  });
});

describe('moveAppointment', () => {
  const conCita = () => {
    const r = registro();
    addAppointment(r, citaValida(), ctx());
    return r;
  };

  test('mueve la hora, marca "moved" y firma', () => {
    const r = conCita();
    const nueva = '2026-03-10T15:00:00.000-07:00';
    const res = moveAppointment(r, 'a_fijo', nueva, ctx({ now: '2026-03-10T10:00:00.000-07:00', by: 'beto.lara' }));

    assert.equal(res.ok, true);
    const a = r.appointments[0];
    assert.equal(a.startsAt, nueva);
    assert.equal(a.status, 'moved');
    assert.equal(a.updatedBy, 'beto.lara');
    assert.equal(a.updatedAt, '2026-03-10T10:00:00.000-07:00');
    assert.equal(a.createdBy, POR, 'quién la creó no se reescribe');
    assert.equal(a.createdAt, AHORA);
  });

  test('valida la hora nueva igual que la original', () => {
    const r = conCita();
    const res = moveAppointment(r, 'a_fijo', '2026-03-10T15:00:00', ctx());
    assert.equal(res.ok, false);
    assert.equal(res.errors.startsAt, 'noOffset');
    assert.equal(r.appointments[0].startsAt, LUEGO, 'la cita no se movió');
  });

  test('cita inexistente: notFound, sin tocar nada', () => {
    const r = conCita();
    const res = moveAppointment(r, 'a_no_existe', LUEGO, ctx());
    assert.deepEqual(res, { ok: false, notFound: true });
  });
});

describe('editAppointment', () => {
  const conCita = () => {
    const r = registro();
    addAppointment(r, citaValida(), ctx());
    return r;
  };

  test('cambia los tres campos de contenido y firma', () => {
    const r = conCita();
    const res = editAppointment(
      r,
      'a_fijo',
      { serviceName: 'Tomografía', durationMin: 20, locationId: 'piso27' },
      ctx({ by: 'beto.lara' }),
    );

    assert.equal(res.ok, true);
    const a = r.appointments[0];
    assert.equal(a.serviceName, 'Tomografía');
    assert.equal(a.durationMin, 20);
    assert.equal(a.locationId, 'piso27');
    assert.equal(a.updatedBy, 'beto.lara');
  });

  test('NO toca la hora ni el estado', () => {
    // Editar contenido no es moverla ni cambiarle el estado: el enum cerrado
    // de status (PRD §7) no tiene un valor para "editada", y no le hace falta.
    const r = conCita();
    editAppointment(r, 'a_fijo', { serviceName: 'Tomografía', durationMin: 20, locationId: 'piso27' }, ctx());
    assert.equal(r.appointments[0].startsAt, LUEGO);
    assert.equal(r.appointments[0].status, 'scheduled');
  });

  test('rechaza una ubicación fuera del catálogo', () => {
    const r = conCita();
    const res = editAppointment(r, 'a_fijo', { serviceName: 'X', durationMin: 20, locationId: 'sótano' }, ctx());
    assert.equal(res.ok, false);
    assert.equal(res.errors.locationId, 'unknown');
    assert.equal(r.appointments[0].locationId, 'compass', 'la cita quedó como estaba');
  });
});

describe('cancelAppointment', () => {
  test('marca cancelada y firma, sin borrar la cita', () => {
    const r = registro();
    addAppointment(r, citaValida(), ctx());
    const res = cancelAppointment(r, 'a_fijo', ctx({ by: 'beto.lara' }));

    assert.equal(res.ok, true);
    assert.equal(r.appointments.length, 1, 'cancelar no borra: el paciente tiene que ver que se canceló');
    assert.equal(r.appointments[0].status, 'cancelled');
    assert.equal(r.appointments[0].updatedBy, 'beto.lara');
  });

  test('cita inexistente', () => {
    assert.deepEqual(cancelAppointment(registro(), 'a_x', ctx()), { ok: false, notFound: true });
  });
});

describe('setLodging', () => {
  // El hospedaje guarda `hotel` como texto libre, NO un locationId del
  // catálogo: `stay.js:23` lo pinta como nombre y el hospedaje no es
  // destino de ninguna ruta del mapa. La restricción de catálogo es de las
  // citas, que sí se dibujan. Cambiar esa forma tocaría fixtures, dominio y
  // la pantalla del paciente, y esta etapa cambia de dónde salen los datos,
  // no qué forma tienen.
  const hospedaje = () => ({
    hotel: 'Quartz Hotel & Spa',
    reservationCode: 'QZ-8842-MX',
    checkIn: '2026-03-10T15:00:00.000-07:00',
    checkOut: '2026-03-12T11:00:00.000-07:00',
    breakfastIncluded: true,
    recoveryRoom: false,
  });

  test('guarda el hospedaje firmado', () => {
    const r = registro();
    const res = setLodging(r, hospedaje(), ctx());
    assert.equal(res.ok, true);
    assert.equal(r.lodging.visitId, 'v_1');
    assert.equal(r.lodging.hotel, 'Quartz Hotel & Spa');
    assert.equal(r.lodging.breakfastIncluded, true);
    assert.equal(r.lodging.recoveryRoom, false);
    assert.equal(r.lodging.updatedBy, POR);
    assert.equal(r.lodging.updatedAt, AHORA);
  });

  test('los dos checkbox se guardan como booleanos, no como lo que llegue', () => {
    const r = registro();
    setLodging(r, { ...hospedaje(), breakfastIncluded: 'on', recoveryRoom: undefined }, ctx());
    assert.equal(r.lodging.breakfastIncluded, true);
    assert.equal(r.lodging.recoveryRoom, false);
  });

  test('exige que el check-out sea después del check-in', () => {
    const r = registro();
    const res = setLodging(r, { ...hospedaje(), checkOut: '2026-03-09T11:00:00.000-07:00' }, ctx());
    assert.equal(res.ok, false);
    assert.equal(res.errors.checkOut, 'order');
    assert.equal(r.lodging, null);
  });

  test('hotel, checkIn y checkOut obligatorios; reservationCode no', () => {
    // El hotel a veces se aparta antes de que exista el código, y obligarlo
    // empujaría a inventar uno — mismo criterio que validateLodging (Etapa A).
    const r = registro();
    assert.equal(setLodging(r, { ...hospedaje(), reservationCode: '' }, ctx()).ok, true);

    const vacio = setLodging(registro(), { ...hospedaje(), hotel: '  ' }, ctx());
    assert.equal(vacio.errors.hotel, 'required');
  });

  test('las fechas también exigen desplazamiento', () => {
    // validateLodging (Etapa A) no lo pide porque el navegador y el dominio
    // comparten zona; aquí sí, porque lo escribe una Function que corre en UTC.
    const r = registro();
    assert.equal(setLodging(r, { ...hospedaje(), checkIn: '2026-03-10T15:00' }, ctx()).errors.checkIn, 'noOffset');
  });
});

describe('issueQpass y revokeQpass', () => {
  const pase = () => ({ format: 'image', payload: 'data:image/png;base64,iVBOR', scope: 'torre' });

  test('emite el pase firmado por quien lo emitió', () => {
    const r = registro();
    const res = issueQpass(r, pase(), ctx({ newId: () => 'q_1' }));
    assert.equal(res.ok, true);
    assert.equal(r.passes.length, 1);
    assert.equal(r.passes[0].issuedBy, POR);
    assert.equal(r.passes[0].issuedAt, AHORA);
    assert.equal(r.passes[0].revokedAt, null);
    assert.equal(r.passes[0].validUntil, null, 'D15: sin caducidad por tiempo');
  });

  test('rechaza un formato fuera del enum', () => {
    const r = registro();
    assert.equal(issueQpass(r, { ...pase(), format: 'pdf' }, ctx()).errors.format, 'unsupported');
    for (const bueno of ['qr', 'code128', 'image']) {
      assert.equal(issueQpass(registro(), { ...pase(), format: bueno }, ctx()).ok, true, bueno);
    }
  });

  test('rechaza un alcance fuera del enum', () => {
    // 'general' no existe: los alcances son torre / piso27 / estacionamiento.
    // Un alcance inventado es un pase que la caseta no sabe qué abre.
    const r = registro();
    assert.equal(issueQpass(r, { ...pase(), scope: 'general' }, ctx()).errors.scope, 'unsupported');
    assert.equal(r.passes.length, 0);
  });

  test('exige payload', () => {
    assert.equal(issueQpass(registro(), { ...pase(), payload: '' }, ctx()).errors.payload, 'required');
  });

  test('revocar no borra el pase y firma quién revocó', () => {
    const r = registro();
    issueQpass(r, pase(), ctx({ newId: () => 'q_1' }));
    const res = revokeQpass(r, 'q_1', ctx({ now: LUEGO, by: 'beto.lara' }));

    assert.equal(res.ok, true);
    assert.equal(r.passes.length, 1, 'un pase emitido es historia de la visita');
    assert.equal(r.passes[0].revokedAt, LUEGO);
    assert.equal(r.passes[0].revokedBy, 'beto.lara');
  });

  test('la primera revocación es la que vale', () => {
    const r = registro();
    issueQpass(r, pase(), ctx({ newId: () => 'q_1' }));
    revokeQpass(r, 'q_1', ctx({ now: LUEGO, by: 'beto.lara' }));
    revokeQpass(r, 'q_1', ctx({ now: '2026-03-11T09:00:00.000-07:00', by: 'otra' }));

    assert.equal(r.passes[0].revokedAt, LUEGO, 'volver a revocar no corre la hora');
    assert.equal(r.passes[0].revokedBy, 'beto.lara');
  });
});

describe('lo que ninguna mutación debe tocar', () => {
  test('el token de la visita se queda igual', () => {
    // El token es la credencial del paciente. Si una edición lo regenerara,
    // el QR que ya se mandó dejaría de servir sin que nadie se enterara.
    const r = registro();
    addAppointment(r, citaValida(), ctx());
    moveAppointment(r, 'a_fijo', '2026-03-10T15:00:00.000-07:00', ctx());
    editAppointment(r, 'a_fijo', { serviceName: 'X', durationMin: 10, locationId: 'lobby_torre' }, ctx());
    cancelAppointment(r, 'a_fijo', ctx());
    setLodging(r, { hotel: 'Quartz', checkIn: AHORA, checkOut: LUEGO }, ctx());

    assert.equal(r.visit.token, 'tok');
    assert.equal(r.visit.id, 'v_1');
  });
});

// =====================================================================
// Etapa G — traslados.
//
// Dos cosas que estas pruebas fijan y no son obvias:
//
//   1. `driver` y `vehicle` son OPCIONALES. La coordinadora aparta el
//      traslado días antes; al chofer lo asignan la víspera. Exigir el
//      nombre del chofer para poder guardar la hora de recogida empuja a
//      inventar uno — el mismo razonamiento que dejó `reservationCode`
//      opcional en el hospedaje (Etapa A).
//   2. El teléfono, si viene, tiene que ser E.164 con `+` y clave de país.
//      La pantalla del paciente lo pinta como `tel:` y como `wa.me/...`:
//      un "664 123 4567" sin clave manda el WhatsApp a un número de otro
//      país, y el paciente se entera parado en la banqueta del aeropuerto.
// =====================================================================

const trasladoValido = () => ({
  kind: 'arrival',
  scheduledAt: LUEGO,
  meetingPointId: 'tij_terminal',
});

describe('validateTransferInput', () => {
  test('acepta el mínimo indispensable: qué, cuándo y dónde', () => {
    assert.deepEqual(validateTransferInput(trasladoValido()), { ok: true, errors: {} });
  });

  test('acepta el traslado completo, con chofer y vehículo', () => {
    const r = validateTransferInput({
      ...trasladoValido(),
      flightNumber: 'AM 654',
      driver: { name: 'Juan Pérez', phone: '+526641234567' },
      vehicle: { type: 'van', make: 'Toyota', model: 'Hiace', color: 'blanca', plate: 'ABC-123-D' },
      notes: 'Espera en la salida de la banda 3',
    });
    assert.deepEqual(r, { ok: true, errors: {} });
  });

  test('reporta todos los campos malos de una vez, no de uno en uno', () => {
    const r = validateTransferInput({ kind: 'taxi', scheduledAt: 'mañana', meetingPointId: 'la esquina' });
    assert.equal(r.ok, false);
    assert.deepEqual(r.errors, { kind: 'unknown', scheduledAt: 'invalidDate', meetingPointId: 'unknown' });
  });

  test('sin hora, sin tipo y sin punto: los tres salen como required', () => {
    const r = validateTransferInput({});
    assert.deepEqual(r.errors, { kind: 'required', scheduledAt: 'required', meetingPointId: 'required' });
  });

  test('una hora sin desplazamiento se rechaza — es la que se lee distinta en cada zona', () => {
    const r = validateTransferInput({ ...trasladoValido(), scheduledAt: '2026-03-10T11:30' });
    assert.equal(r.errors.scheduledAt, 'noOffset');
  });

  test('un punto de encuentro con un espacio pegado NO se recorta: es un id de <select>, no texto tecleado', () => {
    const r = validateTransferInput({ ...trasladoValido(), meetingPointId: 'tij_terminal ' });
    assert.equal(r.errors.meetingPointId, 'unknown');
  });

  test('los tres kind del catálogo pasan, cualquier otro no', () => {
    for (const kind of ['arrival', 'departure', 'internal']) {
      assert.equal(validateTransferInput({ ...trasladoValido(), kind }).ok, true, kind);
    }
    assert.equal(validateTransferInput({ ...trasladoValido(), kind: 'ARRIVAL' }).errors.kind, 'unknown');
  });

  test('input que no es objeto se rechaza entero', () => {
    for (const basura of [null, undefined, 'x', 42, ['a']]) {
      assert.deepEqual(validateTransferInput(basura), { ok: false, errors: { input: 'invalid' } });
    }
  });

  describe('chofer', () => {
    test('sin chofer es válido — todavía no se lo asignan', () => {
      assert.equal(validateTransferInput(trasladoValido()).ok, true);
      assert.equal(validateTransferInput({ ...trasladoValido(), driver: {} }).ok, true);
      assert.equal(validateTransferInput({ ...trasladoValido(), driver: null }).ok, true);
    });

    test('un teléfono sin clave de país se rechaza: wa.me lo mandaría a otro país', () => {
      const r = validateTransferInput({ ...trasladoValido(), driver: { name: 'Juan', phone: '664 123 4567' } });
      assert.equal(r.errors['driver.phone'], 'invalid');
    });

    test('E.164 con espacios y guiones sí pasa — la gente los escribe así', () => {
      for (const phone of ['+526641234567', '+52 664 123 4567', '+52-664-123-4567', '+1 619 555 0142']) {
        assert.equal(validateTransferInput({ ...trasladoValido(), driver: { phone } }).ok, true, phone);
      }
    });

    test('un nombre kilométrico se rechaza', () => {
      const r = validateTransferInput({ ...trasladoValido(), driver: { name: 'x'.repeat(MAX_DRIVER_NAME + 1) } });
      assert.equal(r.errors['driver.name'], 'tooLong');
    });

    test('driver que no es objeto se reporta, no se traga', () => {
      assert.equal(validateTransferInput({ ...trasladoValido(), driver: 'Juan Pérez' }).errors.driver, 'invalid');
    });
  });

  describe('vehículo', () => {
    test('sin vehículo es válido', () => {
      assert.equal(validateTransferInput({ ...trasladoValido(), vehicle: {} }).ok, true);
      assert.equal(validateTransferInput({ ...trasladoValido(), vehicle: null }).ok, true);
    });

    test('un tipo fuera del catálogo se rechaza; los cinco del catálogo pasan', () => {
      for (const type of ['sedan', 'suv', 'van', 'ambulance', 'other']) {
        assert.equal(validateTransferInput({ ...trasladoValido(), vehicle: { type } }).ok, true, type);
      }
      assert.equal(validateTransferInput({ ...trasladoValido(), vehicle: { type: 'camioneta' } }).errors['vehicle.type'], 'unknown');
    });

    test('una placa kilométrica se rechaza', () => {
      const r = validateTransferInput({ ...trasladoValido(), vehicle: { plate: 'A'.repeat(MAX_PLATE + 1) } });
      assert.equal(r.errors['vehicle.plate'], 'tooLong');
    });

    test('vehicle que no es objeto se reporta', () => {
      assert.equal(validateTransferInput({ ...trasladoValido(), vehicle: 'van blanca' }).errors.vehicle, 'invalid');
    });
  });
});

describe('addTransfer', () => {
  test('agrega el traslado firmado y devuelve la entidad', () => {
    const r = registro();
    const res = addTransfer(r, trasladoValido(), ctx({ newId: () => 't_fijo' }));

    assert.equal(res.ok, true);
    assert.equal(r.transfers.length, 1);
    assert.deepEqual(r.transfers[0], {
      id: 't_fijo',
      visitId: 'v_1',
      kind: 'arrival',
      scheduledAt: LUEGO,
      meetingPointId: 'tij_terminal',
      flightNumber: '',
      driver: { name: '', phone: '' },
      vehicle: { type: '', make: '', model: '', color: '', plate: '' },
      notes: '',
      status: 'scheduled',
      createdAt: AHORA,
      createdBy: POR,
      updatedAt: AHORA,
      updatedBy: POR,
    });
    assert.equal(res.transfer, r.transfers[0]);
  });

  // Lo que hace que desplegar la Etapa G no rompa nada: los expedientes
  // que hoy están en Blobs se guardaron sin la llave `transfers`.
  test('un expediente guardado antes de esta etapa no trae la llave y no revienta', () => {
    const r = registro();
    assert.equal(r.transfers, undefined, 'la fixture representa un expediente viejo, a propósito');
    const res = addTransfer(r, trasladoValido(), ctx({ newId: () => 't_fijo' }));
    assert.equal(res.ok, true);
    assert.deepEqual(r.transfers.map((t) => t.id), ['t_fijo']);
  });

  test('no acepta id, status ni createdBy inyectados desde el POST', () => {
    const r = registro();
    addTransfer(r, {
      ...trasladoValido(),
      id: 't_del_atacante',
      status: 'cancelled',
      createdBy: 'alguien más',
      visitId: 'v_de_otro',
    }, ctx({ newId: () => 't_fijo' }));

    const t = r.transfers[0];
    assert.equal(t.id, 't_fijo');
    assert.equal(t.status, 'scheduled');
    assert.equal(t.createdBy, POR);
    assert.equal(t.visitId, 'v_1');
  });

  test('un traslado inválido no se agrega y devuelve los errores', () => {
    const r = registro();
    const res = addTransfer(r, { kind: 'taxi', scheduledAt: LUEGO, meetingPointId: 'cbx' }, ctx());
    assert.deepEqual(res, { ok: false, errors: { kind: 'unknown' } });
    assert.equal(r.transfers, undefined, 'un rechazo no debe ni crear la llave');
  });

  test('recorta los textos libres y deja el número de vuelo en mayúsculas', () => {
    const r = registro();
    addTransfer(r, {
      ...trasladoValido(),
      flightNumber: '  am 654 ',
      driver: { name: '  Juan Pérez  ', phone: ' +52 664 123 4567 ' },
      vehicle: { type: 'van', make: ' Toyota ', model: ' Hiace ', color: ' blanca ', plate: ' abc-123-d ' },
      notes: '  Banda 3  ',
    }, ctx({ newId: () => 't_fijo' }));

    const t = r.transfers[0];
    assert.equal(t.flightNumber, 'AM 654');
    assert.equal(t.driver.name, 'Juan Pérez');
    assert.equal(t.driver.phone, '+52 664 123 4567');
    assert.equal(t.vehicle.plate, 'ABC-123-D', 'las placas se guardan en mayúsculas, como se leen');
    assert.equal(t.notes, 'Banda 3');
  });
});

describe('editTransfer', () => {
  function conTraslado() {
    const r = registro();
    addTransfer(r, trasladoValido(), ctx({ newId: () => 't_fijo' }));
    return r;
  }

  test('actualiza los campos y firma quién y cuándo', () => {
    const r = conTraslado();
    const res = editTransfer(r, 't_fijo', {
      kind: 'departure',
      scheduledAt: '2026-03-11T16:00:00.000-07:00',
      meetingPointId: 'quartz',
      driver: { name: 'Beto Lara', phone: '+526649876543' },
      vehicle: { type: 'suv', make: 'Honda', model: 'CR-V', color: 'gris', plate: 'XYZ-987-K' },
    }, ctx({ now: LUEGO, by: 'beto.lara' }));

    assert.equal(res.ok, true);
    const t = r.transfers[0];
    assert.equal(t.kind, 'departure');
    assert.equal(t.meetingPointId, 'quartz');
    assert.equal(t.driver.name, 'Beto Lara');
    assert.equal(t.vehicle.type, 'suv');
    assert.equal(t.updatedAt, LUEGO);
    assert.equal(t.updatedBy, 'beto.lara');
  });

  test('no reescribe quién lo creó', () => {
    const r = conTraslado();
    editTransfer(r, 't_fijo', trasladoValido(), ctx({ now: LUEGO, by: 'beto.lara' }));
    assert.equal(r.transfers[0].createdBy, POR);
    assert.equal(r.transfers[0].createdAt, AHORA);
  });

  test('asignar al chofer después es el caso normal, no una excepción', () => {
    const r = conTraslado();
    assert.equal(r.transfers[0].driver.name, '', 'se apartó sin chofer');
    const res = editTransfer(r, 't_fijo', {
      ...trasladoValido(),
      driver: { name: 'Juan Pérez', phone: '+526641234567' },
    }, ctx({ now: LUEGO, by: POR }));
    assert.equal(res.ok, true);
    assert.equal(r.transfers[0].driver.name, 'Juan Pérez');
  });

  test('un id que no existe es notFound, no un error de validación', () => {
    const r = conTraslado();
    assert.deepEqual(editTransfer(r, 't_inventado', trasladoValido(), ctx()), { ok: false, notFound: true });
  });

  test('datos inválidos no dejan el traslado a medio escribir', () => {
    const r = conTraslado();
    const res = editTransfer(r, 't_fijo', { ...trasladoValido(), meetingPointId: 'la esquina' }, ctx({ now: LUEGO }));
    assert.deepEqual(res, { ok: false, errors: { meetingPointId: 'unknown' } });
    assert.equal(r.transfers[0].meetingPointId, 'tij_terminal', 'el valor viejo sigue intacto');
    assert.equal(r.transfers[0].updatedAt, AHORA, 'un rechazo no corre la firma');
  });

  test('un expediente sin la llave transfers da notFound, no una excepción', () => {
    const r = registro();
    assert.deepEqual(editTransfer(r, 't_fijo', trasladoValido(), ctx()), { ok: false, notFound: true });
  });
});

describe('cancelTransfer', () => {
  function conTraslado() {
    const r = registro();
    addTransfer(r, trasladoValido(), ctx({ newId: () => 't_fijo' }));
    return r;
  }

  // Mismo criterio que cancelAppointment: marca, no borra. Un traslado que
  // desaparece se lee como un error de la app, y el paciente se planta a
  // esperar un coche que no va a llegar.
  test('marca cancelado sin borrar y firma quién', () => {
    const r = conTraslado();
    const res = cancelTransfer(r, 't_fijo', ctx({ now: LUEGO, by: 'beto.lara' }));

    assert.equal(res.ok, true);
    assert.equal(r.transfers.length, 1, 'sigue en el expediente');
    assert.equal(r.transfers[0].status, 'cancelled');
    assert.equal(r.transfers[0].updatedAt, LUEGO);
    assert.equal(r.transfers[0].updatedBy, 'beto.lara');
  });

  test('un id que no existe es notFound', () => {
    const r = conTraslado();
    assert.deepEqual(cancelTransfer(r, 't_inventado', ctx()), { ok: false, notFound: true });
  });

  test('un expediente sin la llave transfers da notFound, no una excepción', () => {
    assert.deepEqual(cancelTransfer(registro(), 't_fijo', ctx()), { ok: false, notFound: true });
  });
});
