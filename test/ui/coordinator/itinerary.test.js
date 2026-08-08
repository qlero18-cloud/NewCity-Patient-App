// Fase 09 — pruebas del editor de itinerario del panel de coordinadores
// (src/ui/screens/coordinator/itinerary.js). Mismo patrón que
// test/ui/plaza.test.js y test/ui/tabs.test.js: este proyecto no trae un
// DOM falso para node:test, así que lo automatizado aquí son aserciones
// de substring/regex sobre el HTML que devuelve renderItineraryScreen(ctx)
// — nunca un clic simulado ni attachItineraryScreen (eso se revisa en
// navegador, según el doc de esta fase).
//
// Etapa D — el store ya no guarda en memoria: pide a la API. Las pruebas
// dejan de ser síncronas y el store se arma contra el handler real
// (test/helpers/loopback.js), no contra un doble a mano: así, si el
// servidor cambia lo que devuelve, esta pantalla se entera en la misma
// corrida en vez de seguir pasando contra una copia desactualizada de las
// reglas.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderItineraryScreen } from '../../../src/ui/screens/coordinator/itinerary.js';
import { createCoordinatorStore } from '../../../src/ui/coordinatorStore.js';
import { createLoopbackApi, panelConVisita } from '../../helpers/loopback.js';
import { translate } from '../../../src/ui/i18n.js';
import { locations, LOCATION_IDS } from '../../../src/data/locations.js';
import { locationName, escapeHtml } from '../../../src/ui/util.js';
import { toLocalInput } from '../../../src/domain/time.js';

// Los nombres de ubicación traen ·, &, paréntesis y apóstrofes. Hay que
// pasarlos por escapeHtml (así viajan en el HTML: "Quartz Hotel &amp; Spa")
// y luego escapar los metacaracteres de RegExp.
function locationNameHtml(locationId, lang) {
  return escapeHtml(locationName(locations, locationId, lang));
}

function escapeRe(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ctx(store, visitId, lang) {
  return { store, visitId, lang, t: (path) => translate(lang, path) };
}

// Agrega una cita y devuelve la entidad creada. El servidor manda
// { record, appointment }; el `.appointment` es la cita concreta, que es lo
// único que estas pruebas necesitan para armar sus selectores por id.
async function agregarCita(store, visitId, datos) {
  const res = await store.addAppointment(visitId, datos);
  if (!res.ok) throw new Error(`la cita de prueba no se agregó: ${JSON.stringify(res)}`);
  return res.appointment;
}

for (const lang of ['es', 'en']) {
  describe(`renderItineraryScreen — [${lang}]`, () => {
    test('visita sin citas muestra coordinator.itinerary.empty', async () => {
      const { store, visit } = await panelConVisita({ lang });

      const html = renderItineraryScreen(ctx(store, visit.id, lang));

      assert.ok(html.includes(translate(lang, 'coordinator.itinerary.title')), 'falta el título de la pantalla');
      assert.ok(html.includes(translate(lang, 'coordinator.itinerary.empty')), 'falta el mensaje de itinerario vacío');
    });

    test('una cita agregada se pinta como tarjeta, con sus valores crudos y sus controles move/edit/cancel', async () => {
      const { store, visit } = await panelConVisita({ lang });
      const appt = await agregarCita(store, visit.id, { serviceName: 'Laboratorio', startsAt: '2026-03-10T08:00-07:00', durationMin: 45, locationId: 'compass' });

      const html = renderItineraryScreen(ctx(store, visit.id, lang));

      assert.ok(html.includes('Laboratorio'), 'falta serviceName en la tarjeta');
      assert.ok(html.includes('2026-03-10T08:00-07:00'), 'falta startsAt en crudo (sin formateo de dominio)');
      assert.ok(html.includes('45'), 'falta durationMin en crudo');
      // D40: la tarjeta ya no pinta el locationId crudo — pinta el nombre de
      // la ubicación. No basta con `includes('compass')`: ese substring
      // aparece igual en los <option value="compass"> del <select>, así que
      // la aserción pasaría sin que la tarjeta muestre nada. Se ancla al
      // renglón concreto.
      assert.ok(
        html.includes(locationNameHtml('compass', lang)),
        'la tarjeta debe mostrar el nombre de la ubicación, no el id crudo'
      );
      assert.match(
        html,
        new RegExp(`nc-coord-itin-row"><span>[^<]*</span> ${escapeRe(locationNameHtml('compass', lang))}`),
        'el nombre de la ubicación debe ir en el renglón de ubicación de la tarjeta'
      );
      assert.ok(
        html.includes(translate(lang, 'itinerary.status.scheduled')),
        'el status debe mostrarse traducido (itinerary.status.*), no como el enum crudo'
      );
      assert.doesNotMatch(html, /nc-coord-itin-status">scheduled</, 'no debe pintarse el enum crudo "scheduled"');
      assert.match(
        html,
        new RegExp(`data-role="move-appointment"[^>]*data-appointment-id="${appt.id}"`),
        'falta el control de mover con su data-appointment-id'
      );
      assert.match(
        html,
        new RegExp(`data-role="edit-appointment"[^>]*data-appointment-id="${appt.id}"`),
        'falta el control de editar con su data-appointment-id'
      );
      assert.match(
        html,
        new RegExp(`data-role="cancel-appointment"[^>]*data-appointment-id="${appt.id}"`),
        'falta el control de cancelar con su data-appointment-id'
      );
    });

    test('una cita cancelada trae la clase de tachado en la línea de serviceName y NO trae control de cancelar NI de editar (sí sigue trayendo el de mover)', async () => {
      const { store, visit } = await panelConVisita({ lang });
      const appt = await agregarCita(store, visit.id, { serviceName: 'Resonancia magnética', startsAt: '2026-03-10T09:00-07:00', durationMin: 60, locationId: 'compass' });
      await store.cancelAppointment(visit.id, appt.id);

      const html = renderItineraryScreen(ctx(store, visit.id, lang));

      assert.match(
        html,
        /class="nc-coord-itin-what nc-coord-itin-what--cancelled">Resonancia magnética</,
        'la línea de serviceName de una cita cancelada debe traer nc-coord-itin-what--cancelled (mismo tratamiento que la pantalla del paciente)'
      );
      assert.doesNotMatch(html, /data-role="cancel-appointment"/, 'una cita ya cancelada no debe traer control de cancelar');
      // Editar detalles (serviceName/durationMin/locationId) de una cita ya
      // cancelada no tiene sentido de negocio — mismo criterio ya aplicado
      // a "cancelar" arriba, extendido aquí a "editar".
      assert.doesNotMatch(html, /data-role="edit-appointment"/, 'una cita ya cancelada no debe traer control de editar');
      assert.match(
        html,
        new RegExp(`data-role="move-appointment"[^>]*data-appointment-id="${appt.id}"`),
        'una cita cancelada debe seguir trayendo el control de mover (solo se omiten cancelar y editar)'
      );
    });

    test('el formulario de agregar cita expone sus 4 campos y el botón de envío, bajo data-role="add-appointment-form"', async () => {
      const { store, visit } = await panelConVisita({ lang });

      const html = renderItineraryScreen(ctx(store, visit.id, lang));

      assert.match(html, /<form[^>]*data-role="add-appointment-form"/, 'falta el formulario con data-role="add-appointment-form"');
      assert.match(html, /name="serviceName"/, 'falta el campo serviceName');
      assert.match(html, /name="startsAt"/, 'falta el campo startsAt');
      assert.match(html, /name="durationMin"/, 'falta el campo durationMin');
      assert.match(html, /name="locationId"/, 'falta el campo locationId');
      assert.ok(html.includes(translate(lang, 'coordinator.itinerary.addAppointment')), 'falta el texto del botón de envío');
    });

    // D40 — la razón de todo esto: un locationId escrito a mano que no
    // coincida con ninguna Location de src/data/locations.js deja el mapa
    // sin nada que resaltar ni rutear para esa cita. Un <select> lo cierra
    // estructuralmente en vez de confiar en que se teclee bien.
    describe(`ubicación como <select> (D40) — [${lang}]`, () => {
      test('el campo locationId es un <select>, no un <input> de texto libre', async () => {
        const { store, visit } = await panelConVisita({ lang });
        const html = renderItineraryScreen(ctx(store, visit.id, lang));

        assert.match(html, /<select[^>]*name="locationId"/, 'locationId debe ser un <select>');
        assert.doesNotMatch(html, /<input[^>]*name="locationId"/, 'no debe quedar ningún <input> de texto para locationId');
      });

      test('el <select> ofrece exactamente las 7 ubicaciones de locations.js, con su nombre en el idioma activo', async () => {
        const { store, visit } = await panelConVisita({ lang });
        const html = renderItineraryScreen(ctx(store, visit.id, lang));

        for (const id of LOCATION_IDS) {
          assert.match(
            html,
            new RegExp(`<option value="${id}"[^>]*>${escapeRe(locationNameHtml(id, lang))}</option>`),
            `falta la opción de ${id} con su nombre traducido`
          );
        }
        const optionCount = (html.match(/<option value="/g) ?? []).length;
        assert.strictEqual(
          optionCount,
          LOCATION_IDS.length,
          'el <select> no debe ofrecer más opciones que las ubicaciones reales del catálogo'
        );
      });
    });

    // D40 — mover y editar usaban window.prompt() (D33), que no puede ser un
    // <select>: dejaban abierta exactamente la misma puerta que el dropdown
    // cierra en el formulario de agregar. Ahora son formularios inline.
    describe(`mover y editar como formularios inline (D40) — [${lang}]`, () => {
      async function withAppointment(lang) {
        const { store, visit } = await panelConVisita({ lang });
        const appt = await agregarCita(store, visit.id, { serviceName: 'Laboratorio', startsAt: '2026-03-10T08:00-07:00', durationMin: 45, locationId: 'compass' });
        return { store, visit, appt };
      }

      test('editar trae un formulario inline con su propio <select> de ubicación', async () => {
        const { store, visit, appt } = await withAppointment(lang);
        const html = renderItineraryScreen(ctx(store, visit.id, lang));

        assert.match(
          html,
          new RegExp(`<form[^>]*data-role="edit-appointment-form"[^>]*data-appointment-id="${appt.id}"`),
          'falta el formulario inline de editar para esa cita'
        );
        assert.match(html, /<select[^>]*name="editLocationId"/, 'el formulario de editar debe traer un <select> de ubicación');
      });

      test('el <select> de editar llega con la ubicación actual de la cita ya seleccionada', async () => {
        const { store, visit } = await withAppointment(lang);
        const html = renderItineraryScreen(ctx(store, visit.id, lang));

        assert.match(
          html,
          /<option value="compass" selected>/,
          'la ubicación actual de la cita debe venir preseleccionada, no un cuadro en blanco'
        );
      });

      test('mover trae un formulario inline con campo de fecha/hora, no un prompt', async () => {
        const { store, visit, appt } = await withAppointment(lang);
        const html = renderItineraryScreen(ctx(store, visit.id, lang));

        assert.match(
          html,
          new RegExp(`<form[^>]*data-role="move-appointment-form"[^>]*data-appointment-id="${appt.id}"`),
          'falta el formulario inline de mover para esa cita'
        );
        assert.match(html, /name="moveStartsAt"/, 'el formulario de mover debe traer su campo de fecha/hora');
      });

      test('una cita cancelada no trae formulario de editar (mismo criterio que su botón)', async () => {
        const { store, visit, appt } = await withAppointment(lang);
        await store.cancelAppointment(visit.id, appt.id);
        const html = renderItineraryScreen(ctx(store, visit.id, lang));

        assert.doesNotMatch(html, /data-role="edit-appointment-form"/, 'una cita cancelada no debe traer formulario de editar');
        assert.match(html, /data-role="move-appointment-form"/, 'una cita cancelada sí sigue pudiendo moverse');
      });
    });

    test('los campos del formulario traen el tipo y la ayuda que corresponden', async () => {
      const { store, visit } = await panelConVisita({ lang });
      const html = renderItineraryScreen(ctx(store, visit.id, lang));

      assert.match(
        html,
        /<input[^>]*name="durationMin"[^>]*type="number"|<input[^>]*type="number"[^>]*name="durationMin"/,
        'durationMin debe ser type="number": hoy acepta texto libre y termina en Number() -> NaN'
      );
      assert.match(html, /<input[^>]*name="durationMin"[^>]*min="1"|<input[^>]*min="1"[^>]*name="durationMin"/, 'durationMin debe tener min="1"');
      // Etapa H (D75) — esta aserción exigía un placeholder con el ISO de
      // ejemplo, que era la muleta de un campo de texto: decía cómo teclear
      // lo que ya no se teclea. Se cambia deliberadamente por el control
      // nativo, que es la ayuda de verdad. El detalle se prueba aparte, en
      // "las fechas se capturan con el control nativo".
      assert.match(
        html,
        /<input[^>]*name="startsAt"[^>]*type="datetime-local"|<input[^>]*type="datetime-local"[^>]*name="startsAt"/,
        'startsAt debe capturarse con el control nativo de fecha y hora'
      );
    });

    test('visita inexistente no truena — fallback corto en vez de excepción', () => {
      const store = createCoordinatorStore({ api: createLoopbackApi() });

      let html;
      assert.doesNotThrow(() => {
        html = renderItineraryScreen(ctx(store, 'no-such-visit-id', lang));
      });
      assert.match(html, /^\s*<section class="nc-screen">/, 'la alternativa debe seguir el mismo envoltorio nc-screen que toda pantalla');
      assert.ok(html.includes(translate(lang, 'coordinator.itinerary.title')), 'la alternativa debe seguir mostrando el título de la pantalla');
      assert.doesNotMatch(html, /data-role="add-appointment-form"/, 'sin visita no debería ofrecerse el formulario de agregar cita');
    });

    test('ningún destino de navegación usa un atributo distinto a data-nav (D28) — esta pantalla no trae ninguno propio', async () => {
      const { store, visit } = await panelConVisita({ lang });
      const html = renderItineraryScreen(ctx(store, visit.id, lang));
      assert.doesNotMatch(html, /data-tab=/);
      assert.doesNotMatch(html, /data-route=/);
      assert.doesNotMatch(html, /data-target=/);
    });

    // Fix (revisión adversarial, fase 09): "una cita movida reordena la
    // línea de tiempo" es un criterio de aceptación explícito del doc de
    // esta fase; antes appointments se pintaba en orden de inserción, sin
    // importar el startsAt nuevo tras moverla.
    test('mover una cita hacia una hora posterior la reordena al final de la lista', async () => {
      const { store, visit } = await panelConVisita({ lang });
      const first = await agregarCita(store, visit.id, { serviceName: 'Primera cita', startsAt: '2026-03-10T08:00-07:00', durationMin: 30, locationId: 'compass' });
      const second = await agregarCita(store, visit.id, { serviceName: 'Segunda cita', startsAt: '2026-03-10T09:00-07:00', durationMin: 30, locationId: 'compass' });

      await store.moveAppointment(visit.id, first.id, '2026-03-10T10:00-07:00');

      const html = renderItineraryScreen(ctx(store, visit.id, lang));
      assert.ok(
        html.indexOf('Segunda cita') < html.indexOf('Primera cita'),
        'tras mover "Primera cita" a una hora posterior a "Segunda cita", el itinerario debe mostrarla después, no en su posición original de inserción'
      );
    });

    test('mover una cita hacia una hora anterior la reordena al inicio de la lista', async () => {
      const { store, visit } = await panelConVisita({ lang });
      const first = await agregarCita(store, visit.id, { serviceName: 'Cita temprano', startsAt: '2026-03-10T08:00-07:00', durationMin: 30, locationId: 'compass' });
      const second = await agregarCita(store, visit.id, { serviceName: 'Cita tarde', startsAt: '2026-03-10T09:00-07:00', durationMin: 30, locationId: 'compass' });

      await store.moveAppointment(visit.id, second.id, '2026-03-10T07:00-07:00');

      const html = renderItineraryScreen(ctx(store, visit.id, lang));
      assert.ok(
        html.indexOf('Cita tarde') < html.indexOf('Cita temprano'),
        'tras mover "Cita tarde" a una hora anterior a "Cita temprano", el itinerario debe mostrarla primero'
      );
    });

    // Fix (revisión adversarial, fase 09): coordinator.itinerary.
    // cancelledBadge/movedBadge (i18n.js) existían sin usar; el estado se
    // mostraba como el enum crudo ("cancelled"/"moved"), igual en los dos
    // idiomas — violando el criterio de aceptación "ninguna cadena nueva
    // queda fija en un solo idioma".
    test('una cita movida muestra el badge traducido coordinator.itinerary.movedBadge, no el enum crudo "moved"', async () => {
      const { store, visit } = await panelConVisita({ lang });
      const appt = await agregarCita(store, visit.id, { serviceName: 'Cita a mover', startsAt: '2026-03-10T08:00-07:00', durationMin: 30, locationId: 'compass' });
      await store.moveAppointment(visit.id, appt.id, '2026-03-10T09:00-07:00');

      const html = renderItineraryScreen(ctx(store, visit.id, lang));
      assert.ok(
        html.includes(translate(lang, 'coordinator.itinerary.movedBadge')),
        'falta el badge traducido de cita movida'
      );
      assert.doesNotMatch(html, /nc-coord-itin-status">moved</, 'no debería mostrarse el enum crudo "moved" para una cita movida');
    });

    test('una cita cancelada muestra el badge traducido coordinator.itinerary.cancelledBadge, no el enum crudo "cancelled"', async () => {
      const { store, visit } = await panelConVisita({ lang });
      const appt = await agregarCita(store, visit.id, { serviceName: 'Cita a cancelar', startsAt: '2026-03-10T08:00-07:00', durationMin: 30, locationId: 'compass' });
      await store.cancelAppointment(visit.id, appt.id);

      const html = renderItineraryScreen(ctx(store, visit.id, lang));
      assert.ok(
        html.includes(translate(lang, 'coordinator.itinerary.cancelledBadge')),
        'falta el badge traducido de cita cancelada'
      );
      assert.doesNotMatch(html, /nc-coord-itin-status">cancelled</, 'no debería mostrarse el enum crudo "cancelled" para una cita cancelada');
    });
  });
}

// Etapa H (D75/D76) — la hora de una cita deja de teclearse. Los dos campos
// de fecha de esta pantalla (agregar y mover) son <input type="datetime-local">
// y el valor que viaja al servidor lo arma toIsoTijuana en el attach, no la
// coordinadora.
describe('renderItineraryScreen — las fechas se capturan con el control nativo', () => {
  const VENTANA = { min: '2026-03-10T00:00', max: '2026-03-12T23:59' };

  function campoHtml(html, name) {
    return html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? '';
  }

  test('el startsAt del formulario de agregar es datetime-local, no texto', async () => {
    const { store, visit } = await panelConVisita();
    const campo = campoHtml(renderItineraryScreen(ctx(store, visit.id, 'es')), 'startsAt');
    assert.match(campo, /type="datetime-local"/, 'startsAt debe ser un control nativo de fecha y hora');
    assert.doesNotMatch(campo, /type="text"/);
    assert.doesNotMatch(campo, /placeholder="20\d\d-/, 'el placeholder con ISO de ejemplo ya no aplica');
  });

  test('el moveStartsAt del formulario de mover también, y viene prellenado en formato de control', async () => {
    const { store, visit } = await panelConVisita();
    await agregarCita(store, visit.id, {
      serviceName: 'Laboratorio',
      startsAt: '2026-03-11T09:30-07:00',
      durationMin: 30,
      locationId: LOCATION_IDS[0],
    });

    const campo = campoHtml(renderItineraryScreen(ctx(store, visit.id, 'es')), 'moveStartsAt');
    assert.match(campo, /type="datetime-local"/);
    // El value es la hora de pared, sin desplazamiento: un datetime-local con
    // "2026-03-11T09:30-07:00" adentro no lo entiende y sale VACÍO, borrando
    // en silencio la hora que ya estaba guardada.
    assert.match(campo, /value="2026-03-11T09:30"/, 'debe prellenarse con la hora local, no con el ISO crudo');
    assert.doesNotMatch(campo, /value="[^"]*[+-]\d\d:\d\d"/, 'el ISO con desplazamiento no cabe en un datetime-local');
    assert.strictEqual(toLocalInput('2026-03-11T09:30-07:00'), '2026-03-11T09:30');
  });

  // Punto 6 — acotar a la ventana de la visita. Se acota al DÍA, no al
  // instante: la visita de la fixture "empieza" a las 00:00 y "termina" a
  // las 00:00 del día 12, y con min/max al instante una cita a las 10 de la
  // mañana del día 12 quedaría fuera de su propia visita.
  test('agregar y mover están acotados a los días de la visita', async () => {
    const { store, visit } = await panelConVisita();
    await agregarCita(store, visit.id, {
      serviceName: 'Laboratorio',
      startsAt: '2026-03-11T09:30-07:00',
      durationMin: 30,
      locationId: LOCATION_IDS[0],
    });

    const html = renderItineraryScreen(ctx(store, visit.id, 'es'));
    for (const name of ['startsAt', 'moveStartsAt']) {
      const campo = campoHtml(html, name);
      assert.match(campo, new RegExp(`min="${VENTANA.min}"`), `${name} sin min`);
      assert.match(campo, new RegExp(`max="${VENTANA.max}"`), `${name} sin max`);
    }
  });
});

// Punto 4c — el control nativo es comodidad, no autoridad. Quien mande el
// POST no tiene por qué haber pasado por la pantalla, así que el servidor
// sigue rechazando exactamente lo mismo que antes. Mismo criterio que
// locationId con su 422 (D40).
describe('el control nativo no relaja la validación del servidor', () => {
  test('una fecha sin desplazamiento sigue siendo 422 noOffset', async () => {
    const { store, visit } = await panelConVisita();
    const res = await store.addAppointment(visit.id, {
      serviceName: 'Laboratorio',
      startsAt: '2026-03-11T09:30', // lo que da un datetime-local en crudo
      durationMin: 30,
      locationId: LOCATION_IDS[0],
    });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.errors?.startsAt, 'noOffset');
  });

  test('una fecha ininteligible sigue siendo 422 invalidDate', async () => {
    const { store, visit } = await panelConVisita();
    const res = await store.addAppointment(visit.id, {
      serviceName: 'Laboratorio',
      startsAt: 'mañana',
      durationMin: 30,
      locationId: LOCATION_IDS[0],
    });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.errors?.startsAt, 'invalidDate');
  });
});
