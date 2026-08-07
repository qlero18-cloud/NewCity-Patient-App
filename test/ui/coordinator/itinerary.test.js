// Fase 09 — pruebas del editor de itinerario del panel de coordinadores
// (src/ui/screens/coordinator/itinerary.js). Mismo patrón que
// test/ui/plaza.test.js y test/ui/tabs.test.js: este proyecto no trae un
// DOM falso para node:test, así que lo automatizado aquí son aserciones
// de substring/regex sobre el HTML que devuelve renderItineraryScreen(ctx)
// — nunca un clic simulado ni attachItineraryScreen (eso se revisa en
// navegador, según el doc de esta fase).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderItineraryScreen } from '../../../src/ui/screens/coordinator/itinerary.js';
import { createCoordinatorStore } from '../../../src/ui/coordinatorStore.js';
import { translate } from '../../../src/ui/i18n.js';

const NOW = '2026-03-10T10:00-07:00';

function ctx(store, visitId, lang) {
  return { store, visitId, lang, t: (path) => translate(lang, path) };
}

function newVisit(store, lang) {
  return store.createVisit({
    patientFirstName: 'Ana',
    lang,
    startsAt: '2026-03-10T00:00-07:00',
    endsAt: '2026-03-12T00:00-07:00',
  });
}

for (const lang of ['es', 'en']) {
  describe(`renderItineraryScreen — [${lang}]`, () => {
    test('visita sin citas muestra coordinator.itinerary.empty', () => {
      const store = createCoordinatorStore();
      const visit = newVisit(store, lang);

      const html = renderItineraryScreen(ctx(store, visit.id, lang));

      assert.ok(html.includes(translate(lang, 'coordinator.itinerary.title')), 'falta el título de la pantalla');
      assert.ok(html.includes(translate(lang, 'coordinator.itinerary.empty')), 'falta el mensaje de itinerario vacío');
    });

    test('una cita agregada se pinta como tarjeta, con sus valores crudos y sus controles move/edit/cancel', () => {
      const store = createCoordinatorStore();
      const visit = newVisit(store, lang);
      const appt = store.addAppointment(
        visit.id,
        { serviceName: 'Laboratorio', startsAt: '2026-03-10T08:00-07:00', durationMin: 45, locationId: 'compass' },
        NOW
      );

      const html = renderItineraryScreen(ctx(store, visit.id, lang));

      assert.ok(html.includes('Laboratorio'), 'falta serviceName en la tarjeta');
      assert.ok(html.includes('2026-03-10T08:00-07:00'), 'falta startsAt en crudo (sin formateo de dominio)');
      assert.ok(html.includes('45'), 'falta durationMin en crudo');
      assert.ok(html.includes('compass'), 'falta locationId en crudo');
      assert.ok(html.includes('scheduled'), 'falta status en crudo');
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

    test('una cita cancelada trae la clase de tachado en la línea de serviceName y NO trae control de cancelar NI de editar (sí sigue trayendo el de mover)', () => {
      const store = createCoordinatorStore();
      const visit = newVisit(store, lang);
      const appt = store.addAppointment(
        visit.id,
        { serviceName: 'Resonancia magnética', startsAt: '2026-03-10T09:00-07:00', durationMin: 60, locationId: 'compass' },
        NOW
      );
      store.cancelAppointment(visit.id, appt.id, NOW);

      const html = renderItineraryScreen(ctx(store, visit.id, lang));

      assert.match(
        html,
        /class="nc-itin-what nc-itin-what--cancelled">Resonancia magnética</,
        'la línea de serviceName de una cita cancelada debe traer nc-itin-what--cancelled (mismo tratamiento que la pantalla del paciente)'
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

    test('el formulario de agregar cita expone sus 4 campos y el botón de envío, bajo data-role="add-appointment-form"', () => {
      const store = createCoordinatorStore();
      const visit = newVisit(store, lang);

      const html = renderItineraryScreen(ctx(store, visit.id, lang));

      assert.match(html, /<form[^>]*data-role="add-appointment-form"/, 'falta el formulario con data-role="add-appointment-form"');
      assert.match(html, /name="serviceName"/, 'falta el campo serviceName');
      assert.match(html, /name="startsAt"/, 'falta el campo startsAt');
      assert.match(html, /name="durationMin"/, 'falta el campo durationMin');
      assert.match(html, /name="locationId"/, 'falta el campo locationId');
      assert.ok(html.includes(translate(lang, 'coordinator.itinerary.addAppointment')), 'falta el texto del botón de envío');
    });

    test('visita inexistente no truena — fallback corto en vez de excepción', () => {
      const store = createCoordinatorStore();

      let html;
      assert.doesNotThrow(() => {
        html = renderItineraryScreen(ctx(store, 'no-such-visit-id', lang));
      });
      assert.match(html, /^\s*<section class="nc-screen">/, 'la alternativa debe seguir el mismo envoltorio nc-screen que toda pantalla');
      assert.ok(html.includes(translate(lang, 'coordinator.itinerary.title')), 'la alternativa debe seguir mostrando el título de la pantalla');
      assert.doesNotMatch(html, /data-role="add-appointment-form"/, 'sin visita no debería ofrecerse el formulario de agregar cita');
    });

    test('ningún destino de navegación usa un atributo distinto a data-nav (D28) — esta pantalla no trae ninguno propio', () => {
      const store = createCoordinatorStore();
      const visit = newVisit(store, lang);
      const html = renderItineraryScreen(ctx(store, visit.id, lang));
      assert.doesNotMatch(html, /data-tab=/);
      assert.doesNotMatch(html, /data-route=/);
      assert.doesNotMatch(html, /data-target=/);
    });

    // Fix (revisión adversarial, fase 09): "una cita movida reordena la
    // línea de tiempo" es un criterio de aceptación explícito del doc de
    // esta fase; antes appointments se pintaba en orden de inserción, sin
    // importar el startsAt nuevo tras moverla.
    test('mover una cita hacia una hora posterior la reordena al final de la lista', () => {
      const store = createCoordinatorStore();
      const visit = newVisit(store, lang);
      const first = store.addAppointment(
        visit.id,
        { serviceName: 'Primera cita', startsAt: '2026-03-10T08:00-07:00', durationMin: 30, locationId: 'compass' },
        NOW
      );
      const second = store.addAppointment(
        visit.id,
        { serviceName: 'Segunda cita', startsAt: '2026-03-10T09:00-07:00', durationMin: 30, locationId: 'compass' },
        NOW
      );

      store.moveAppointment(visit.id, first.id, '2026-03-10T10:00-07:00', NOW);

      const html = renderItineraryScreen(ctx(store, visit.id, lang));
      assert.ok(
        html.indexOf('Segunda cita') < html.indexOf('Primera cita'),
        'tras mover "Primera cita" a una hora posterior a "Segunda cita", el itinerario debe mostrarla después, no en su posición original de inserción'
      );
    });

    test('mover una cita hacia una hora anterior la reordena al inicio de la lista', () => {
      const store = createCoordinatorStore();
      const visit = newVisit(store, lang);
      const first = store.addAppointment(
        visit.id,
        { serviceName: 'Cita temprano', startsAt: '2026-03-10T08:00-07:00', durationMin: 30, locationId: 'compass' },
        NOW
      );
      const second = store.addAppointment(
        visit.id,
        { serviceName: 'Cita tarde', startsAt: '2026-03-10T09:00-07:00', durationMin: 30, locationId: 'compass' },
        NOW
      );

      store.moveAppointment(visit.id, second.id, '2026-03-10T07:00-07:00', NOW);

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
    test('una cita movida muestra el badge traducido coordinator.itinerary.movedBadge, no el enum crudo "moved"', () => {
      const store = createCoordinatorStore();
      const visit = newVisit(store, lang);
      const appt = store.addAppointment(
        visit.id,
        { serviceName: 'Cita a mover', startsAt: '2026-03-10T08:00-07:00', durationMin: 30, locationId: 'compass' },
        NOW
      );
      store.moveAppointment(visit.id, appt.id, '2026-03-10T09:00-07:00', NOW);

      const html = renderItineraryScreen(ctx(store, visit.id, lang));
      assert.ok(
        html.includes(translate(lang, 'coordinator.itinerary.movedBadge')),
        'falta el badge traducido de cita movida'
      );
      assert.doesNotMatch(html, /nc-coord-itin-status">moved</, 'no debería mostrarse el enum crudo "moved" para una cita movida');
    });

    test('una cita cancelada muestra el badge traducido coordinator.itinerary.cancelledBadge, no el enum crudo "cancelled"', () => {
      const store = createCoordinatorStore();
      const visit = newVisit(store, lang);
      const appt = store.addAppointment(
        visit.id,
        { serviceName: 'Cita a cancelar', startsAt: '2026-03-10T08:00-07:00', durationMin: 30, locationId: 'compass' },
        NOW
      );
      store.cancelAppointment(visit.id, appt.id, NOW);

      const html = renderItineraryScreen(ctx(store, visit.id, lang));
      assert.ok(
        html.includes(translate(lang, 'coordinator.itinerary.cancelledBadge')),
        'falta el badge traducido de cita cancelada'
      );
      assert.doesNotMatch(html, /nc-coord-itin-status">cancelled</, 'no debería mostrarse el enum crudo "cancelled" para una cita cancelada');
    });
  });
}
