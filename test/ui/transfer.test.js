// Etapa G — lo que ve el PACIENTE de su traslado.
//
// Tres pantallas tocadas y por eso tres bloques aquí: la pantalla de
// detalle (nueva), el itinerario (que ahora intercala traslados con citas)
// y la tarjeta de Inicio (nueva, arriba de "Tu siguiente paso").
//
// Sin DOM falso (D8): estas tres son funciones puras que reciben ctx y
// devuelven una cadena, así que lo que se automatiza son aserciones sobre
// el HTML. El botón de copiar placas y los enlaces se comprueban en el
// navegador.
//
// Lo que de verdad importa que no se rompa: que la hora salga de
// formatTimeTijuana y no de una interpolación cruda, que el teléfono del
// chofer llegue a wa.me sin el "+" y a tel: con él, y que un traslado
// cancelado no ofrezca un botón para llamarle a un chofer que no va a ir.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderTransferScreen } from '../../src/ui/screens/transfer.js';
import { renderItineraryScreen } from '../../src/ui/screens/itinerary.js';
import { renderHomeScreen } from '../../src/ui/screens/home.js';
import { translate } from '../../src/ui/i18n.js';
import { formatTimeTijuana, formatDayLabel } from '../../src/domain/index.js';
import { transferPoints } from '../../src/data/transferPoints.js';
import { escapeHtml } from '../../src/ui/util.js';

const AHORA = '2026-03-10T05:00:00-07:00';

const traslado = (extra = {}) => ({
  id: 't_1',
  visitId: 'v1',
  kind: 'arrival',
  scheduledAt: '2026-03-10T06:00-07:00',
  meetingPointId: 'tij_terminal',
  flightNumber: 'AM654',
  driver: { name: 'Juan Pérez', phone: '+526641234567' },
  vehicle: { type: 'van', make: 'Toyota', model: 'Hiace', color: 'Blanca', plate: 'ABC-123-D' },
  status: 'scheduled',
  notes: '',
  ...extra,
});

const cita = (id, startsAt, status = 'scheduled') => ({
  id, visitId: 'v1', startsAt, durationMin: 30,
  serviceName: `Servicio ${id}`, locationId: 'piso27', status,
  updatedAt: '2026-03-01T00:00-08:00',
});

const ctx = (extra = {}, lang = 'es') => ({
  visit: { id: 'v1', patientFirstName: 'Ana' },
  appointments: [],
  transfers: [],
  lodging: null,
  now: AHORA,
  lang,
  t: (path) => translate(lang, path),
  lastViewedItineraryAt: null,
  ...extra,
});

// Escapado: "Quartz Hotel & Spa" se pinta con &amp; y así debe ser.
// Comparar contra el nombre crudo daría por bueno un render que mete el &
// sin escapar.
const nombrePunto = (id, lang) => escapeHtml(transferPoints.find((p) => p.id === id).name[lang]);

describe('renderTransferScreen — el detalle del traslado', () => {
  test('dice la hora, el punto de encuentro y el tipo, en los dos idiomas', () => {
    for (const lang of ['es', 'en']) {
      const html = renderTransferScreen(ctx({ transfers: [traslado()] }, lang));
      assert.ok(html.includes(translate(lang, 'transfer.title')), `falta el título en ${lang}`);
      assert.ok(html.includes(formatTimeTijuana('2026-03-10T06:00-07:00', lang)), `falta la hora en ${lang}`);
      assert.ok(html.includes(nombrePunto('tij_terminal', lang)), `falta el punto de encuentro en ${lang}`);
      assert.ok(html.includes(translate(lang, 'transfer.kind.arrival')), `falta el tipo en ${lang}`);
    }
  });

  test('la hora sale de formatTimeTijuana, no del ISO en crudo', () => {
    const html = renderTransferScreen(ctx({ transfers: [traslado()] }));
    assert.ok(!html.includes('2026-03-10T06:00-07:00'), 'el paciente no debe ver un ISO 8601');
  });

  test('dice quién es el chofer y en qué coche', () => {
    const html = renderTransferScreen(ctx({ transfers: [traslado()] }));
    assert.ok(html.includes('Juan Pérez'), 'falta el chofer');
    assert.ok(html.includes('Toyota'), 'falta la marca');
    assert.ok(html.includes('Hiace'), 'falta el modelo');
    assert.ok(html.includes('Blanca'), 'falta el color');
    assert.ok(html.includes('ABC-123-D'), 'faltan las placas');
    assert.ok(html.includes(translate('es', 'transfer.vehicleType.van')), 'falta el tipo de vehículo traducido');
    assert.ok(html.includes('AM654'), 'falta el vuelo');
  });

  // wa.me quiere SOLO dígitos y tel: conserva el "+". Es el mismo par de
  // formatos derivados de un número que ya usa help.js — y la razón por la
  // que el formulario del panel exige clave de país (D73): sin ella,
  // wa.me/6641234567 manda el mensaje a otro país.
  test('el teléfono del chofer sale como WhatsApp y como llamada, cada uno en su formato', () => {
    const html = renderTransferScreen(ctx({ transfers: [traslado()] }));
    assert.ok(html.includes('href="https://wa.me/526641234567"'), 'wa.me debe llevar solo dígitos');
    assert.ok(html.includes('href="tel:+526641234567"'), 'tel: debe conservar el "+"');
  });

  test('el enlace de WhatsApp no le presta la pestaña a nadie', () => {
    const html = renderTransferScreen(ctx({ transfers: [traslado()] }));
    assert.match(html, /wa\.me[^>]*rel="noopener noreferrer"/, 'falta rel="noopener noreferrer"');
  });

  test('las placas traen botón de copiar, con su propio id', () => {
    const html = renderTransferScreen(ctx({ transfers: [traslado()] }));
    assert.ok(html.includes('data-role="copy-plate"'), 'falta el botón de copiar');
    assert.ok(html.includes('data-plate="ABC-123-D"'), 'el botón debe llevar la placa a copiar');
    assert.ok(html.includes('data-role="copy-feedback" data-transfer-id="t_1"'), 'la confirmación debe ser de ESTE traslado');
  });

  // El punto de encuentro no está confirmado por el cliente (§15.8). Que el
  // paciente lo vea así es la diferencia entre "voy a Llegadas" y "voy a
  // Llegadas si nadie me dice otra cosa".
  test('un punto de encuentro sin confirmar se pinta con el distintivo', () => {
    for (const lang of ['es', 'en']) {
      const conf = renderTransferScreen(ctx({ transfers: [traslado({ meetingPointId: 'quartz' })] }, lang));
      const sinConf = renderTransferScreen(ctx({ transfers: [traslado({ meetingPointId: 'cbx' })] }, lang));
      assert.ok(sinConf.includes(translate(lang, 'common.unconfirmedBadge')), `cbx debería marcarse en ${lang}`);
      assert.ok(!conf.includes(translate(lang, 'common.unconfirmedBadge')), `quartz está confirmado y no debe marcarse en ${lang}`);
    }
  });

  test('varios traslados salen como varias tarjetas, ordenadas por hora', () => {
    const html = renderTransferScreen(ctx({
      transfers: [
        traslado({ id: 't_2', kind: 'departure', scheduledAt: '2026-03-12T16:00-07:00', meetingPointId: 'quartz' }),
        traslado(),
      ],
    }));
    assert.ok(
      html.indexOf(translate('es', 'transfer.kind.arrival')) < html.indexOf(translate('es', 'transfer.kind.departure')),
      'la llegada debería pintarse antes que el regreso',
    );
  });
});

describe('renderTransferScreen — lo que todavía no se sabe', () => {
  // El traslado se aparta días antes; al chofer se lo asignan la víspera.
  // Dejar el renglón en blanco parece un error de la app; decirlo es
  // información.
  test('sin chofer asignado lo dice, en vez de dejar el hueco vacío', () => {
    for (const lang of ['es', 'en']) {
      const html = renderTransferScreen(ctx({
        transfers: [traslado({ driver: { name: '', phone: '' } })],
      }, lang));
      assert.ok(html.includes(translate(lang, 'transfer.driverPending')), `falta el aviso de chofer por asignar en ${lang}`);
    }
  });

  test('sin teléfono no se pintan botones de contacto muertos', () => {
    const html = renderTransferScreen(ctx({
      transfers: [traslado({ driver: { name: 'Juan Pérez', phone: '' } })],
    }));
    assert.ok(!html.includes('wa.me'), 'no debe haber WhatsApp sin número');
    assert.ok(!html.includes('href="tel:'), 'no debe haber llamada sin número');
    assert.ok(html.includes('Juan Pérez'), 'el nombre sí se sabe y sí se muestra');
  });

  test('sin vuelo, sin placas y sin notas, la tarjeta no pinta renglones vacíos', () => {
    const html = renderTransferScreen(ctx({
      transfers: [traslado({
        flightNumber: '',
        notes: '',
        vehicle: { type: '', make: '', model: '', color: '', plate: '' },
      })],
    }));
    assert.ok(!html.includes(translate('es', 'transfer.flightNumber')), 'no debe pintarse la etiqueta de vuelo sin vuelo');
    assert.ok(!html.includes('data-role="copy-plate"'), 'no debe haber botón de copiar sin placas');
    assert.ok(!html.includes(translate('es', 'transfer.notes')), 'no debe pintarse la etiqueta de notas sin notas');
  });

  test('las notas del traslado se muestran cuando las hay', () => {
    const html = renderTransferScreen(ctx({
      transfers: [traslado({ notes: 'El chofer lleva letrero con tu nombre.' })],
    }));
    assert.ok(html.includes('El chofer lleva letrero con tu nombre.'));
  });

  // Mismo criterio que el guard de stay.js: app.js no debería enrutar
  // aquí sin traslados, y aun así la pantalla se niega a pintarse vacía.
  test('sin traslados devuelve cadena vacía en vez de una pantalla en blanco', () => {
    assert.strictEqual(renderTransferScreen(ctx({ transfers: [] })), '');
    assert.strictEqual(renderTransferScreen(ctx({ transfers: undefined })), '');
    assert.strictEqual(renderTransferScreen(ctx({ transfers: null })), '');
  });
});

describe('renderTransferScreen — traslado cancelado', () => {
  const cancelado = traslado({ status: 'cancelled' });

  test('se marca cancelado y se tacha, no desaparece', () => {
    for (const lang of ['es', 'en']) {
      const html = renderTransferScreen(ctx({ transfers: [cancelado] }, lang));
      assert.ok(html.includes(translate(lang, 'transfer.cancelledBadge')), `falta el distintivo en ${lang}`);
      assert.match(html, /nc-transfer-kind--cancelled/, `falta el tachado en ${lang}`);
    }
  });

  // Lo importante de esta prueba: llamarle al chofer de un traslado
  // cancelado es la llamada que hace que el paciente se quede esperando.
  test('no ofrece llamarle ni escribirle al chofer', () => {
    const html = renderTransferScreen(ctx({ transfers: [cancelado] }));
    assert.ok(!html.includes('wa.me'), 'no debe haber WhatsApp de un traslado cancelado');
    assert.ok(!html.includes('href="tel:'), 'no debe haber llamada de un traslado cancelado');
  });

  test('un cancelado y uno vigente conviven: el vigente sí conserva sus botones', () => {
    const html = renderTransferScreen(ctx({
      transfers: [cancelado, traslado({ id: 't_2', kind: 'departure', scheduledAt: '2026-03-12T16:00-07:00' })],
    }));
    assert.ok(html.includes(translate('es', 'transfer.cancelledBadge')));
    assert.ok(html.includes('href="tel:+526641234567"'), 'el traslado vigente sí debe poder contactarse');
  });
});

describe('renderItineraryScreen — traslados intercalados con las citas', () => {
  const conAmbos = {
    appointments: [cita('a1', '2026-03-10T08:00-07:00')],
    transfers: [traslado()],
  };

  test('el traslado de las 06:00 sale ARRIBA de la cita de las 08:00', () => {
    const html = renderItineraryScreen(ctx(conAmbos));
    assert.ok(
      html.indexOf(nombrePunto('tij_terminal', 'es')) < html.indexOf('Servicio a1'),
      'el traslado debería pintarse antes que la cita del mismo día',
    );
  });

  test('el traslado se ve como traslado, no disfrazado de cita', () => {
    for (const lang of ['es', 'en']) {
      const html = renderItineraryScreen(ctx(conAmbos, lang));
      assert.ok(html.includes(translate(lang, 'transfer.kind.arrival')), `falta el tipo de traslado en ${lang}`);
    }
  });

  test('desde el itinerario se puede abrir el detalle del traslado', () => {
    const html = renderItineraryScreen(ctx(conAmbos));
    assert.ok(html.includes('data-nav="transfer"'), 'falta la navegación al detalle');
    assert.doesNotMatch(html, /data-tab=/, 'la navegación es data-nav (D28)');
    assert.doesNotMatch(html, /data-route=/);
  });

  // Un traslado de llegada la víspera abre un día que las citas no tienen:
  // es la prueba de que groupByDay recibe la línea de tiempo entera y no
  // solo las citas.
  test('un traslado la víspera abre su propio día en el itinerario', () => {
    const html = renderItineraryScreen(ctx({
      appointments: [cita('a1', '2026-03-10T08:00-07:00')],
      transfers: [traslado({ scheduledAt: '2026-03-09T21:00-07:00' })],
      now: '2026-03-09T12:00-07:00',
    }));
    assert.ok(html.includes(formatTimeTijuana('2026-03-09T21:00-07:00', 'es')), 'falta el traslado de la víspera');
  });

  test('un traslado cancelado sigue en el itinerario, tachado', () => {
    const html = renderItineraryScreen(ctx({
      appointments: [],
      transfers: [traslado({ status: 'cancelled' })],
    }));
    assert.ok(html.includes(translate('es', 'transfer.cancelledBadge')), 'debe verse que se canceló');
    assert.match(html, /nc-itin-what--cancelled/, 'debe verse tachado, igual que una cita cancelada');
  });

  // Compatibilidad con lo ya desplegado: un teléfono con la caché anterior
  // a esta etapa entrega un expediente sin la llave `transfers`.
  test('sin la llave transfers, el itinerario sigue siendo el de siempre', () => {
    const conTransfers = renderItineraryScreen(ctx({ appointments: [cita('a1', '2026-03-10T08:00-07:00')], transfers: [] }));
    const sinLlave = renderItineraryScreen(ctx({ appointments: [cita('a1', '2026-03-10T08:00-07:00')], transfers: undefined }));
    assert.strictEqual(sinLlave, conTransfers);
  });

  test('un itinerario que SOLO tiene traslados no se declara vacío', () => {
    const html = renderItineraryScreen(ctx({ appointments: [], transfers: [traslado()] }));
    assert.ok(!html.includes(translate('es', 'itinerary.empty')), 'hay un traslado: el itinerario no está vacío');
    assert.ok(html.includes(nombrePunto('tij_terminal', 'es')));
  });
});

describe('renderHomeScreen — la tarjeta del próximo traslado', () => {
  test('anuncia el próximo traslado con su hora y su punto de encuentro', () => {
    for (const lang of ['es', 'en']) {
      const html = renderHomeScreen(ctx({ transfers: [traslado()] }, lang));
      assert.ok(html.includes(translate(lang, 'home.transferLabel')), `falta el rótulo de la tarjeta en ${lang}`);
      assert.ok(html.includes(formatTimeTijuana('2026-03-10T06:00-07:00', lang)), `falta la hora en ${lang}`);
      assert.ok(html.includes(nombrePunto('tij_terminal', lang)), `falta el punto de encuentro en ${lang}`);
      assert.ok(html.includes('data-nav="transfer"'), `falta el acceso al detalle en ${lang}`);
    }
  });

  // D71. La tarjeta es PROPIA y va ARRIBA: "Tu siguiente paso" sigue siendo
  // R2 —solo citas— con sus ejemplos trabajados del PRD §8 intactos.
  test('la tarjeta del traslado va arriba de "Tu siguiente paso"', () => {
    const html = renderHomeScreen(ctx({
      transfers: [traslado()],
      appointments: [cita('a1', '2026-03-10T08:00-07:00')],
    }));
    assert.ok(
      html.indexOf(translate('es', 'home.transferLabel')) < html.indexOf(translate('es', 'home.nextStepLabel')),
      'el traslado debería anunciarse antes que la siguiente cita',
    );
  });

  test('el traslado NO desplaza a la cita de "Tu siguiente paso" (R2 intacta)', () => {
    const html = renderHomeScreen(ctx({
      transfers: [traslado()],
      appointments: [cita('a1', '2026-03-10T08:00-07:00')],
    }));
    assert.ok(html.includes('Servicio a1'), 'la siguiente cita sigue siendo la cita, no el traslado');
  });

  test('sin traslados, Inicio queda exactamente como antes de esta etapa', () => {
    const base = renderHomeScreen(ctx({ appointments: [cita('a1', '2026-03-10T08:00-07:00')], transfers: [] }));
    const sinLlave = renderHomeScreen(ctx({ appointments: [cita('a1', '2026-03-10T08:00-07:00')], transfers: undefined }));
    assert.strictEqual(sinLlave, base);
    assert.ok(!base.includes(translate('es', 'home.transferLabel')), 'sin traslado no se pinta la tarjeta');
  });

  test('con el traslado ya pasado y ninguno por venir, la tarjeta no se pinta', () => {
    const html = renderHomeScreen(ctx({
      transfers: [traslado()],
      now: '2026-03-11T00:00-07:00',
    }));
    assert.ok(!html.includes(translate('es', 'home.transferLabel')), 'no debe anunciarse un traslado que ya pasó');
  });

  test('pasada la llegada, la tarjeta anuncia el regreso', () => {
    const html = renderHomeScreen(ctx({
      transfers: [traslado(), traslado({ id: 't_2', kind: 'departure', scheduledAt: '2026-03-12T16:00-07:00', meetingPointId: 'quartz' })],
      now: '2026-03-11T00:00-07:00',
    }));
    assert.ok(html.includes(translate('es', 'transfer.kind.departure')), 'debería anunciarse el regreso');
    assert.ok(html.includes(nombrePunto('quartz', 'es')));
  });

  test('un traslado cancelado no se anuncia en Inicio', () => {
    const html = renderHomeScreen(ctx({ transfers: [traslado({ status: 'cancelled' })] }));
    assert.ok(!html.includes(translate('es', 'home.transferLabel')), 'no debe anunciarse un traslado cancelado');
  });

  // El regreso cae por definición el último día de la visita, así que
  // durante casi toda la estancia esta tarjeta anuncia algo que NO es hoy.
  // Con solo la hora, "3:00 PM" debajo de un encabezado que dice "Hoy ·
  // Martes 10" se lee como hoy, y el paciente se pierde el vuelo.
  test('un traslado que no es hoy dice qué día es', () => {
    for (const lang of ['es', 'en']) {
      const html = renderHomeScreen(ctx({
        transfers: [traslado({ kind: 'departure', scheduledAt: '2026-03-11T15:00-07:00', meetingPointId: 'quartz' })],
      }, lang));
      assert.ok(
        html.includes(formatDayLabel('2026-03-11T15:00-07:00', AHORA, lang)[lang]),
        `falta el día del traslado en ${lang}`,
      );
    }
  });

  // La otra mitad: cuando el traslado SÍ es hoy, el día ya está arriba como
  // fecha de la pantalla y repetirlo sobra. Así la tarjeta se ve igual que
  // la de R2 en el caso normal.
  test('un traslado de hoy no repite el día que ya está en el encabezado', () => {
    const html = renderHomeScreen(ctx({ transfers: [traslado()] }));
    const hoy = formatDayLabel(AHORA, AHORA, 'es').es;
    assert.strictEqual(html.split(hoy).length - 1, 1, 'el día de hoy solo debe salir en la fecha de la pantalla');
  });
});
