// Etapa I — lo que el PACIENTE ve de los tres campos nuevos (D82).
//
// `prep`, `doctor` y `details` llegan del .docx que escribe la coordinadora,
// pasan por el intérprete, los guarda el servidor (visitMutations) y los
// entrega visitHandler. Todo eso ya está probado. Falta el último tramo, que
// es el único que le importa al paciente: que aparezcan en su itinerario.
// Sin esto, "FASTING 8-12 HOURS" viaja de punta a punta del sistema y muere
// en el render, y el paciente desayuna antes de un estudio en ayunas.
//
// Sin DOM falso (D8): renderItineraryScreen es pura, recibe ctx y devuelve
// una cadena, así que aquí se afirma sobre el HTML.
//
// El otro tramo del paso 8 del plan — que la ruta al piso 10 diga "piso 10"
// y no "piso 27" — vive en test/domain/routing.test.js, donde resolveRoute
// se prueba sin DOM. Lo que sí toca aquí es su reflejo en el itinerario: el
// renglón de la cita nombra el piso correcto.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderItineraryScreen } from '../../src/ui/screens/itinerary.js';
import { translate } from '../../src/ui/i18n.js';

const AHORA = '2026-07-30T05:00:00-07:00';

const cita = (extra = {}) => ({
  id: 'a_1',
  visitId: 'v1',
  startsAt: '2026-07-30T07:30-07:00',
  durationMin: 30,
  serviceName: 'BLOOD WORK',
  locationId: 'compass',
  status: 'scheduled',
  updatedAt: '2026-07-01T00:00-07:00',
  ...extra,
});

const ctx = (appointments, lang = 'es') => ({
  visit: { id: 'v1', patientFirstName: 'Ana' },
  appointments,
  transfers: [],
  lodging: null,
  now: AHORA,
  lang,
  t: (path) => translate(lang, path),
  lastViewedItineraryAt: null,
});

describe('Etapa I — preparación, médico y sub-estudios en el itinerario del paciente', () => {
  test('la preparación se ve, con su etiqueta', () => {
    const html = renderItineraryScreen(ctx([cita({ prep: 'FASTING 8-12 HOURS' })]));

    assert.ok(html.includes('FASTING 8-12 HOURS'), 'la preparación debería salir en la tarjeta');
    assert.ok(
      html.includes(translate('es', 'itinerary.prepLabel')),
      'sin etiqueta, "FASTING 8-12 HOURS" es un renglón suelto que no dice qué es',
    );
  });

  test('el médico se ve, con su etiqueta', () => {
    const html = renderItineraryScreen(ctx([cita({ doctor: 'DR. LUNA' })]));

    assert.ok(html.includes('DR. LUNA'));
    assert.ok(html.includes(translate('es', 'itinerary.doctorLabel')));
  });

  test('los sub-estudios salen verbatim, sin partir por comas (D82)', () => {
    const texto = 'URINALYSIS, COMPLETE BLOOD COUNT, LIPID PROFILE, THYROID PROFILE';
    const html = renderItineraryScreen(ctx([cita({ details: texto })]));

    assert.ok(html.includes(texto), 'el texto del laboratorio se muestra tal cual llegó');
    assert.ok(html.includes(translate('es', 'itinerary.detailsLabel')));
  });

  test('una cita sin los tres campos no deja etiquetas huérfanas', () => {
    const html = renderItineraryScreen(ctx([cita()]));

    for (const clave of ['prepLabel', 'doctorLabel', 'detailsLabel']) {
      assert.ok(
        !html.includes(translate('es', `itinerary.${clave}`)),
        `${clave} no debería aparecer cuando el campo viene vacío`,
      );
    }
    // Y los campos opcionales son opcionales de verdad: la mayoría de las
    // citas capturadas a mano (Etapas D–H) no los traen.
    assert.ok(html.includes('BLOOD WORK'));
  });

  test('una cadena vacía cuenta como ausente, no como campo con contenido', () => {
    const html = renderItineraryScreen(ctx([cita({ prep: '', doctor: '', details: '' })]));

    assert.ok(!html.includes(translate('es', 'itinerary.prepLabel')));
    assert.ok(!html.includes(translate('es', 'itinerary.doctorLabel')));
    assert.ok(!html.includes(translate('es', 'itinerary.detailsLabel')));
  });

  test('una cita CANCELADA ya no pide ayunar, pero sigue diciendo qué era', () => {
    const html = renderItineraryScreen(ctx([
      cita({ status: 'cancelled', prep: 'FASTING 8-12 HOURS', doctor: 'DR. LUNA', details: 'URINALYSIS' }),
    ]));

    // La preparación es una INSTRUCCIÓN: dejarla visible en una cita que ya
    // no ocurre manda a alguien a ayunar doce horas para nada.
    assert.ok(!html.includes('FASTING 8-12 HOURS'), 'la preparación de una cita cancelada no se muestra');
    assert.ok(!html.includes(translate('es', 'itinerary.prepLabel')));
    // El médico y los sub-estudios DESCRIBEN la cita; sirven para reconocer
    // cuál se canceló y para pedir que la reagenden.
    assert.ok(html.includes('DR. LUNA'), 'el médico sigue visible: describe la cita, no pide nada');
    assert.ok(html.includes('URINALYSIS'));
  });

  test('el texto viene de un .docx que no controlamos: se escapa', () => {
    const html = renderItineraryScreen(ctx([
      cita({ prep: '<script>alert(1)</script>', doctor: 'DR. "X"', details: 'A & B' }),
    ]));

    assert.ok(!html.includes('<script>'), 'un .docx no debería poder inyectar HTML en la pantalla del paciente');
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('&quot;'));
    assert.ok(html.includes('A &amp; B'));
  });

  test('los tres campos también salen en inglés', () => {
    const html = renderItineraryScreen(ctx([
      cita({ prep: 'FASTING 8-12 HOURS', doctor: 'DR. LUNA', details: 'URINALYSIS' }),
    ], 'en'));

    assert.ok(html.includes(translate('en', 'itinerary.prepLabel')));
    assert.ok(html.includes(translate('en', 'itinerary.doctorLabel')));
    assert.ok(html.includes(translate('en', 'itinerary.detailsLabel')));
  });

  test('el renglón de la cita nombra el piso 10, no el 27 (D80)', () => {
    const html = renderItineraryScreen(ctx([cita({ locationId: 'piso10' })]));

    assert.ok(html.includes('Piso 10'), 'el paciente debe leer el piso al que de verdad va');
    assert.ok(!html.includes('Piso 27'), 'antes de D80 estas citas caían todas en el piso 27');
  });
});
