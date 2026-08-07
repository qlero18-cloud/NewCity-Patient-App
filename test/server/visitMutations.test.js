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
  MAX_DURATION_MIN,
  MAX_SERVICE_NAME,
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
