// Etapa G — pruebas de la pantalla de Traslados del panel de
// coordinadores: la lista de traslados de una visita, con alta, edición y
// cancelación por id.
//
// Mismo patrón que lodging.test.js e itinerary.test.js: este proyecto no
// trae un DOM falso para node:test (D8), así que lo automatizado aquí son
// aserciones de substring sobre el HTML que devuelve renderTransfersScreen
// y pruebas directas de la validación pura. El submit real se comprueba en
// el navegador.
//
// El store se arma contra el handler REAL (test/helpers/loopback.js), no
// contra un doble a mano: si el servidor cambia un motivo de error o un
// nombre de campo, esta pantalla se entera en la misma corrida.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderTransfersScreen,
  validateTransfer,
} from '../../../src/ui/screens/coordinator/transfers.js';
import { createCoordinatorStore } from '../../../src/ui/coordinatorStore.js';
import { panelConVisita } from '../../helpers/loopback.js';
import { translate } from '../../../src/ui/i18n.js';
import { transferPoints, TRANSFER_KINDS, VEHICLE_TYPES } from '../../../src/data/transferPoints.js';
import { escapeHtml } from '../../../src/ui/util.js';

const LABEL_KEYS = [
  'coordinator.transfers.kindLabel',
  'coordinator.transfers.scheduledAtLabel',
  'coordinator.transfers.meetingPointLabel',
  'coordinator.transfers.flightNumberLabel',
  'coordinator.transfers.driverNameLabel',
  'coordinator.transfers.driverPhoneLabel',
  'coordinator.transfers.vehicleTypeLabel',
  'coordinator.transfers.plateLabel',
];

// Los nombres del formulario son planos aunque el modelo sea anidado:
// form.elements no sabe de objetos, y `driver.name` como atributo name
// obliga a leerlo con corchetes en vez de por propiedad. El armado del
// objeto anidado es trabajo del attach, no del HTML.
const FIELD_NAMES = [
  'kind',
  'scheduledAt',
  'meetingPointId',
  'flightNumber',
  'driverName',
  'driverPhone',
  'vehicleType',
  'vehicleMake',
  'vehicleModel',
  'vehicleColor',
  'vehiclePlate',
  'notes',
];

function ctx(store, visitId, lang, extra = {}) {
  return { store, visitId, lang, t: (path) => translate(lang, path), ...extra };
}

const LLEGADA = {
  kind: 'arrival',
  scheduledAt: '2026-03-10T06:00-07:00',
  meetingPointId: 'tij_terminal',
  flightNumber: 'AM654',
  driver: { name: 'Juan Pérez', phone: '+526641234567' },
  vehicle: { type: 'van', make: 'Toyota', model: 'Hiace', color: 'Blanca', plate: 'ABC-123-D' },
  notes: 'Lleva letrero con el nombre del paciente.',
};

const REGRESO = {
  kind: 'departure',
  scheduledAt: '2026-03-12T16:00-07:00',
  meetingPointId: 'quartz',
  flightNumber: '',
  driver: { name: '', phone: '' },
  vehicle: { type: '', make: '', model: '', color: '', plate: '' },
  notes: '',
};

// Agrega y truena si el servidor lo rechazó: una prueba que asume la
// tarjeta pintada sobre un alta fallida falla después, en la aserción,
// diciendo algo que no es.
async function agregar(store, visitId, input) {
  const res = await store.addTransfer(visitId, input);
  if (!res.ok) throw new Error(`el traslado de prueba no se guardó: ${JSON.stringify(res)}`);
  return res.transfer;
}

describe('renderTransfersScreen — formulario de alta, en los dos idiomas', () => {
  test('título, etiquetas y botón de agregar aparecen, en es y en', async () => {
    for (const lang of ['es', 'en']) {
      const { store, visit } = await panelConVisita({ lang });
      const html = renderTransfersScreen(ctx(store, visit.id, lang));

      assert.ok(html.includes(translate(lang, 'coordinator.transfers.title')), `falta el título en ${lang}`);
      for (const key of LABEL_KEYS) {
        assert.ok(html.includes(translate(lang, key)), `falta la etiqueta "${key}" en ${lang}`);
      }
      assert.ok(html.includes(translate(lang, 'coordinator.transfers.addTransfer')), `falta el botón de agregar en ${lang}`);
    }
  });

  test('todos los campos traen su atributo name', async () => {
    const { store, visit } = await panelConVisita();
    const html = renderTransfersScreen(ctx(store, visit.id, 'es'));
    for (const name of FIELD_NAMES) {
      assert.ok(html.includes(`name="${name}"`), `falta name="${name}"`);
    }
  });

  test('el formulario trae data-role="add-transfer-form"', async () => {
    const { store, visit } = await panelConVisita();
    const html = renderTransfersScreen(ctx(store, visit.id, 'es'));
    assert.ok(html.includes('data-role="add-transfer-form"'));
  });

  // El pedido de siempre del cliente, y la razón por la que este
  // formulario no tiene un solo <input type="text"> para nada enumerable:
  // teclear el id a mano es la puerta que D40 cerró para las citas.
  test('kind, meetingPointId y vehicleType son <select>, nunca campos de texto', async () => {
    const { store, visit } = await panelConVisita();
    const html = renderTransfersScreen(ctx(store, visit.id, 'es'));
    for (const name of ['kind', 'meetingPointId', 'vehicleType']) {
      assert.match(html, new RegExp(`<select[^>]*name="${name}"`), `${name} debería ser un <select>`);
      assert.doesNotMatch(html, new RegExp(`<input[^>]*name="${name}"`), `${name} no debe ser un <input>`);
    }
  });

  test('el <select> de punto de encuentro trae los cinco puntos del catálogo', async () => {
    for (const lang of ['es', 'en']) {
      const { store, visit } = await panelConVisita({ lang });
      const html = renderTransfersScreen(ctx(store, visit.id, lang));
      for (const punto of transferPoints) {
        assert.ok(html.includes(`value="${punto.id}"`), `falta la opción ${punto.id}`);
        // Escapado, no en crudo: "Quartz Hotel & Spa" se pinta con &amp; y
        // así debe ser. Comparar contra el nombre crudo daría por bueno un
        // <option> que mete el & sin escapar.
        assert.ok(html.includes(escapeHtml(punto.name[lang])), `falta el nombre de ${punto.id} en ${lang}`);
      }
    }
  });

  // Los tres puntos de cruce no están confirmados por el cliente (§15.8).
  // La coordinadora tiene que verlo AL elegir, no cuando el paciente
  // llame preguntando por qué no hay nadie ahí.
  test('los puntos sin confirmar se marcan en la propia opción del <select>', async () => {
    for (const lang of ['es', 'en']) {
      const { store, visit } = await panelConVisita({ lang });
      const html = renderTransfersScreen(ctx(store, visit.id, lang));
      const distintivo = translate(lang, 'common.unconfirmedBadge');

      for (const punto of transferPoints.filter((p) => p.unconfirmed)) {
        const opcion = html.match(new RegExp(`<option value="${punto.id}"[^>]*>([^<]*)</option>`));
        assert.ok(opcion, `no se encontró la opción de ${punto.id}`);
        assert.ok(opcion[1].includes(distintivo), `la opción de ${punto.id} debería marcarse sin confirmar en ${lang}`);
      }
      for (const punto of transferPoints.filter((p) => !p.unconfirmed)) {
        const opcion = html.match(new RegExp(`<option value="${punto.id}"[^>]*>([^<]*)</option>`));
        assert.ok(!opcion[1].includes(distintivo), `${punto.id} sí está confirmado y no debe marcarse`);
      }
    }
  });

  test('los enum de tipo de traslado y de vehículo salen traducidos, no en crudo', async () => {
    for (const lang of ['es', 'en']) {
      const { store, visit } = await panelConVisita({ lang });
      const html = renderTransfersScreen(ctx(store, visit.id, lang));
      for (const kind of TRANSFER_KINDS) {
        assert.ok(html.includes(translate(lang, `transfer.kind.${kind}`)), `falta el texto de kind=${kind} en ${lang}`);
      }
      for (const tipo of VEHICLE_TYPES) {
        assert.ok(html.includes(translate(lang, `transfer.vehicleType.${tipo}`)), `falta el texto de vehicle=${tipo} en ${lang}`);
      }
    }
  });
});

describe('renderTransfersScreen — la lista de traslados ya capturados', () => {
  // La visita recién creada no trae la llave `transfers` (el store la
  // siembra sin ella hasta esta etapa, y los expedientes ya guardados en
  // Blobs tampoco): la pantalla tiene que pintar el vacío, no reventar.
  test('una visita sin traslados dice que no hay, sin lanzar', async () => {
    const { store, visit } = await panelConVisita();
    assert.doesNotThrow(() => renderTransfersScreen(ctx(store, visit.id, 'es')));
    const html = renderTransfersScreen(ctx(store, visit.id, 'es'));
    assert.ok(html.includes(translate('es', 'coordinator.transfers.empty')));
  });

  test('un traslado capturado aparece con su hora, su punto y su chofer', async () => {
    const { store, visit } = await panelConVisita();
    await agregar(store, visit.id, LLEGADA);

    const html = renderTransfersScreen(ctx(store, visit.id, 'es'));
    assert.ok(html.includes('2026-03-10T06:00-07:00'), 'falta la hora de recogida');
    assert.ok(html.includes(transferPoints.find((p) => p.id === 'tij_terminal').name.es), 'falta el punto de encuentro');
    assert.ok(html.includes('Juan Pérez'), 'falta el nombre del chofer');
    assert.ok(html.includes('ABC-123-D'), 'faltan las placas');
    assert.ok(html.includes('AM654'), 'falta el vuelo');
    assert.ok(html.includes(translate('es', 'transfer.kind.arrival')), 'falta el tipo de traslado');
  });

  test('la lista sale ordenada por hora, no por orden de captura', async () => {
    const { store, visit } = await panelConVisita();
    await agregar(store, visit.id, REGRESO);
    const llegada = await agregar(store, visit.id, LLEGADA);

    const html = renderTransfersScreen(ctx(store, visit.id, 'es'));
    assert.ok(
      html.indexOf('2026-03-10T06:00-07:00') < html.indexOf('2026-03-12T16:00-07:00'),
      'el traslado de llegada debería pintarse antes que el de regreso',
    );
    assert.ok(html.includes(llegada.id));
  });

  test('cada traslado ofrece editar y cancelar, con su propio id', async () => {
    const { store, visit } = await panelConVisita();
    const t1 = await agregar(store, visit.id, LLEGADA);

    const html = renderTransfersScreen(ctx(store, visit.id, 'es'));
    assert.ok(html.includes(`data-role="edit-transfer" data-transfer-id="${t1.id}"`), 'falta el botón de editar');
    assert.ok(html.includes(`data-role="cancel-transfer" data-transfer-id="${t1.id}"`), 'falta el botón de cancelar');
    assert.ok(html.includes(`data-role="edit-transfer-form" data-transfer-id="${t1.id}"`), 'falta el formulario de edición');
  });

  test('el formulario de edición viene prellenado con lo guardado', async () => {
    const { store, visit } = await panelConVisita();
    await agregar(store, visit.id, LLEGADA);

    const html = renderTransfersScreen(ctx(store, visit.id, 'es'));
    assert.ok(html.includes('value="2026-03-10T06:00-07:00"'), 'la hora debería venir prellenada');
    assert.ok(html.includes('value="Juan Pérez"'), 'el chofer debería venir prellenado');
    assert.ok(html.includes('value="+526641234567"'), 'el teléfono debería venir prellenado');
    assert.match(html, /<option value="tij_terminal" selected|<option value="tij_terminal"[^>]*selected/, 'el punto guardado debería venir seleccionado');
  });

  test('un traslado cancelado se ve cancelado y ya no ofrece editar ni cancelar', async () => {
    const { store, visit } = await panelConVisita();
    const t1 = await agregar(store, visit.id, LLEGADA);
    const res = await store.cancelTransfer(visit.id, t1.id);
    assert.strictEqual(res.ok, true, 'precondición: cancelar debe funcionar');

    const html = renderTransfersScreen(ctx(store, visit.id, 'es'));
    assert.ok(html.includes(translate('es', 'coordinator.transfers.cancelledBadge')), 'falta el distintivo de cancelado');
    assert.ok(!html.includes(`data-role="cancel-transfer" data-transfer-id="${t1.id}"`), 'no debe poder cancelarse dos veces');
    assert.ok(!html.includes(`data-role="edit-transfer" data-transfer-id="${t1.id}"`), 'no tiene sentido editar algo cancelado');
  });

  // Lo que de verdad pasa cuando la coordinadora recarga el panel o lo abre
  // en otra máquina: el expediente viene del servidor, no de esta sesión.
  test('un traslado capturado en otra sesión también se pinta, tras loadVisit', async () => {
    const { store, api, visit } = await panelConVisita();
    await agregar(store, visit.id, { ...LLEGADA, driver: { name: 'Ana & Cía', phone: '+526641234567' } });

    const otraSesion = createCoordinatorStore({ api });
    const carga = await otraSesion.loadVisit(visit.id);
    assert.strictEqual(carga.ok, true, 'precondición: el expediente debe cargarse');

    const html = renderTransfersScreen(ctx(otraSesion, visit.id, 'es'));
    assert.ok(html.includes('Ana &amp; Cía'), 'el chofer guardado debería aparecer, y escapado');
  });
});

describe('renderTransfersScreen — visita inexistente', () => {
  test('no lanza, y no pinta el formulario', async () => {
    const { store } = await panelConVisita();
    assert.doesNotThrow(() => renderTransfersScreen(ctx(store, 'no_existe', 'es')));
    const html = renderTransfersScreen(ctx(store, 'no_existe', 'es'));
    assert.ok(html.includes(translate('es', 'coordinator.visitNotFound')));
    assert.ok(!html.includes('data-role="add-transfer-form"'), 'no debería haber formulario para una visita inexistente');
  });
});

describe('renderTransfersScreen — convención data-nav (D28)', () => {
  test('nunca usa data-tab, data-route ni data-target para navegar', async () => {
    const { store, visit } = await panelConVisita();
    await agregar(store, visit.id, LLEGADA);
    const html = renderTransfersScreen(ctx(store, visit.id, 'es'));
    assert.doesNotMatch(html, /data-tab=/);
    assert.doesNotMatch(html, /data-route=/);
    assert.doesNotMatch(html, /data-target=/);
  });
});

describe('validateTransfer — validación del formulario', () => {
  // Valores PLANOS: es lo que entrega form.elements, y es lo que esta
  // función recibe. El anidado lo arma el attach después de validar.
  const VALIDO = {
    kind: 'arrival',
    scheduledAt: '2026-03-10T06:00-07:00',
    meetingPointId: 'tij_terminal',
    flightNumber: 'AM654',
    driverName: 'Juan Pérez',
    driverPhone: '+52 664 123 4567',
    vehicleType: 'van',
    vehiclePlate: 'ABC-123-D',
  };

  test('un traslado completo y coherente pasa', () => {
    const res = validateTransfer(VALIDO);
    assert.strictEqual(res.ok, true);
    assert.deepStrictEqual(res.errors, {});
  });

  // Lo obligatorio es QUÉ, CUÁNDO y DÓNDE. Nada más.
  test('kind, scheduledAt y meetingPointId son obligatorios', () => {
    const res = validateTransfer({ kind: '', scheduledAt: '', meetingPointId: '' });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.errors.kind, 'required');
    assert.strictEqual(res.errors.scheduledAt, 'required');
    assert.strictEqual(res.errors.meetingPointId, 'required');
  });

  // El traslado se aparta días antes; al chofer se lo asignan la víspera.
  // Exigir su nombre para poder guardar la hora de recogida empuja a
  // inventar uno — mismo razonamiento que dejó reservationCode opcional.
  test('chofer, vehículo, vuelo y notas son opcionales', () => {
    const res = validateTransfer({
      kind: 'departure',
      scheduledAt: '2026-03-12T16:00-07:00',
      meetingPointId: 'quartz',
      flightNumber: '',
      driverName: '',
      driverPhone: '',
      vehicleType: '',
      vehiclePlate: '',
    });
    assert.strictEqual(res.ok, true, JSON.stringify(res.errors));
  });

  test('una fecha que no se puede interpretar se señala, en vez de guardarse tal cual', () => {
    for (const malo of ['10 de marzo', '2026-13-45', 'mañana', '2026-03-10T99:00-07:00']) {
      const res = validateTransfer({ ...VALIDO, scheduledAt: malo });
      assert.strictEqual(res.ok, false, `debería rechazar scheduledAt="${malo}"`);
      assert.strictEqual(res.errors.scheduledAt, 'invalidDate', `motivo equivocado para "${malo}"`);
    }
  });

  // D73. La pantalla del paciente pinta este número como wa.me/<dígitos>:
  // un "664 123 4567" sin clave manda el WhatsApp a otro país, y el
  // paciente se entera parado en la banqueta del aeropuerto.
  test('el teléfono del chofer exige clave de país con "+"', () => {
    for (const malo of ['664 123 4567', '01 664 123 4567', 'llamar a recepción', '+52']) {
      const res = validateTransfer({ ...VALIDO, driverPhone: malo });
      assert.strictEqual(res.ok, false, `debería rechazar driverPhone="${malo}"`);
      assert.strictEqual(res.errors.driverPhone, 'invalid', `motivo equivocado para "${malo}"`);
    }
    for (const bueno of ['+526641234567', '+52 664 123 4567', '+1-619-555-0199']) {
      const res = validateTransfer({ ...VALIDO, driverPhone: bueno });
      assert.strictEqual(res.ok, true, `debería aceptar driverPhone="${bueno}"`);
    }
  });

  test('un punto de encuentro o un tipo fuera del catálogo se rechazan', () => {
    assert.strictEqual(validateTransfer({ ...VALIDO, meetingPointId: 'aeropuerto' }).errors.meetingPointId, 'unknown');
    assert.strictEqual(validateTransfer({ ...VALIDO, kind: 'ida' }).errors.kind, 'unknown');
    assert.strictEqual(validateTransfer({ ...VALIDO, vehicleType: 'helicoptero' }).errors.vehicleType, 'unknown');
  });

  test('espacios en blanco no cuentan como valor', () => {
    assert.strictEqual(validateTransfer({ ...VALIDO, scheduledAt: '   ' }).errors.scheduledAt, 'required');
  });

  // La validación del navegador es comodidad, no la regla: si el formulario
  // se saltara (otro cliente, un fetch a mano, un bug), el servidor tiene
  // que rechazar lo mismo y con los mismos códigos.
  test('el servidor rechaza lo mismo que el formulario', async () => {
    const { store, visit } = await panelConVisita();

    const vacio = await store.addTransfer(visit.id, { kind: '', scheduledAt: '', meetingPointId: '' });
    assert.strictEqual(vacio.ok, false, 'el servidor no debe aceptar un traslado vacío');
    assert.strictEqual(vacio.errors.kind, 'required');
    assert.strictEqual(vacio.errors.scheduledAt, 'required');
    assert.strictEqual(vacio.errors.meetingPointId, 'required');

    const inventado = await store.addTransfer(visit.id, { ...LLEGADA, meetingPointId: 'aeropuerto' });
    assert.strictEqual(inventado.ok, false, 'el servidor no debe aceptar un punto fuera del catálogo');
    assert.strictEqual(inventado.errors.meetingPointId, 'unknown');

    const telMalo = await store.addTransfer(visit.id, { ...LLEGADA, driver: { name: 'Juan', phone: '664 123 4567' } });
    assert.strictEqual(telMalo.ok, false, 'el servidor no debe aceptar un teléfono sin clave de país');
    assert.strictEqual(telMalo.errors['driver.phone'], 'invalid');
  });

  test('cada motivo tiene mensaje en los dos idiomas', () => {
    for (const motivo of ['required', 'invalidDate', 'unknown', 'invalid']) {
      for (const lang of ['es', 'en']) {
        const msg = translate(lang, `coordinator.error.${motivo}`);
        assert.ok(typeof msg === 'string' && msg.length > 0, `falta coordinator.error.${motivo} en ${lang}`);
      }
    }
  });
});

describe('renderTransfersScreen — errores del servidor (patrón de la Etapa D)', () => {
  test('los motivos por campo se pintan con la etiqueta del campo, incluidos los anidados', async () => {
    for (const lang of ['es', 'en']) {
      const { store, visit } = await panelConVisita({ lang });
      const html = renderTransfersScreen(
        ctx(store, visit.id, lang, { errors: { meetingPointId: 'unknown', 'driver.phone': 'invalid' } }),
      );
      assert.match(html, /data-role="form-errors"/, `falta el resumen de errores en ${lang}`);
      assert.ok(html.includes(translate(lang, 'coordinator.transfers.meetingPointLabel')), `falta la etiqueta del punto en ${lang}`);
      assert.ok(html.includes(translate(lang, 'coordinator.transfers.driverPhoneLabel')), `falta la etiqueta del teléfono en ${lang}`);
      assert.ok(html.includes(translate(lang, 'coordinator.error.unknown')), `falta el motivo unknown en ${lang}`);
    }
  });

  test('un fallo que no es de ningún campo se pinta aparte', async () => {
    const { store, visit } = await panelConVisita();
    const html = renderTransfersScreen(ctx(store, visit.id, 'es', { requestError: 'network' }));
    assert.match(html, /data-role="request-error"/);
    assert.ok(html.includes(translate('es', 'coordinator.error.network')));
  });

  test('sin errores no se pinta ningún recuadro vacío', async () => {
    const { store, visit } = await panelConVisita();
    const html = renderTransfersScreen(ctx(store, visit.id, 'es'));
    assert.doesNotMatch(html, /data-role="form-errors"/);
    assert.doesNotMatch(html, /data-role="request-error"/);
  });
});
