#!/usr/bin/env node
// Fase 07 — recorrido completo del paciente (los 10 pasos de
// docs/phases/phase-07-e2e.md), ejercitando los módulos reales de
// src/domain, src/data, src/map y src/render en la misma secuencia que
// src/ui/app.js, sin necesidad de un DOM real.
//
// La Etapa F le agrega los pasos 11–16: el tramo que EMPIEZA en la
// coordinadora. Los diez primeros parten de una fixture ya compilada en el
// bundle, así que por construcción nunca podían fallar por el motivo que
// abrió todo esto: que una visita capturada en el panel no se pudiera
// abrir. Ese tramo cruza los dos lados de verdad —panel → servidor →
// teléfono— sobre un solo almacén en memoria, y es lo único aquí que
// responde "¿de dónde sale el QR que la coordinadora le manda al
// paciente?" con código que corre.
//
// La Etapa G le agrega los pasos 17–19 sobre esa misma visita: el traslado
// contratado. Van juntos porque por separado no prueban nada — que el
// panel lo guarde no sirve si el servidor no se lo manda al paciente, y que
// se lo mande no sirve si el enlace ya venció cuando lo va a mirar.
//
// Lo que este script SÍ prueba: que la lógica de cada paso da el
// resultado correcto (siguiente paso, origen por defecto, ruta,
// resaltado, símbolo del pase, caché sin conexión, paridad es/en,
// v_demo2, pantalla neutra). Lo que NO puede probar, y por eso la
// sección de Verificación de esta fase lo deja aparte: que el resaltado
// se VE moverse en un mapa real, que el símbolo del pase se VE bien, que
// "Agregar a inicio" funciona, y que todo esto carga en un teléfono real
// — eso es exactamente lo que pide la comprobación en dispositivo real.
//
// Script plano, no node:test (así lo pide el comando de verificación de
// la fase): assert lanza y aquí no hay try/catch alrededor de cada paso a
// propósito — si un paso falla, el script entero debe fallar con ese
// error visible, no seguir corriendo pasos posteriores sobre un estado ya
// roto.

import assert from 'node:assert/strict';
import { nextStep, groupByDay, isUpdated, isExpired, visiblePasses, timelineItems, nextTransfer } from '../../src/domain/index.js';
import { defaultOrigin, resolveRoute } from '../../src/domain/routing.js';
import { routes } from '../../src/data/routes.js';
import { locations } from '../../src/data/locations.js';
import { TRANSFER_POINT_IDS } from '../../src/data/transferPoints.js';
import { fixtures } from '../../src/data/fixtures.js';
import { createHighlighter } from '../../src/map/highlights.js';
import { resolveInitialLang, translate } from '../../src/ui/i18n.js';
import { generateQrMatrix, decodeQrMatrix } from '../../src/render/qr.js';
import { savePassCache, getCachedVisiblePasses } from '../../src/ui/passCache.js';
import { createCoordinatorStore } from '../../src/ui/coordinatorStore.js';
import { createLoopbackApi } from '../helpers/loopback.js';
import { handleVisitRequest, TOKEN_HEADER } from '../../src/server/visitHandler.js';
import { resolveVisitContext } from '../../src/ui/visitSource.js';
import { saveVisitCache, loadVisitCache, clearVisitCache } from '../../src/ui/visitCache.js';
import { visitUrl } from '../../src/ui/screens/coordinator/handoff.js';
// Etapa I — la cadena de la importación, de punta a punta.
import { readDocxDocumentXml } from '../../src/ui/docxFile.js';
import { docxTableRows, docxParagraphsOutsideTables } from '../../src/domain/docxTable.js';
import { parseItinerary } from '../../src/domain/itineraryParse.js';
import { toLocalInput } from '../../src/domain/time.js';
import { buildImportPayload } from '../../src/ui/screens/coordinator/import.js';
import { renderItineraryScreen } from '../../src/ui/screens/itinerary.js';
import { documento, parrafo, tabla, docxDe, archivo } from '../helpers/docx.js';

function step(n, description, fn) {
  fn();
  console.log(`✔ paso ${n} — ${description}`);
}

// Los pasos 11–15 esperan al servidor. `step` se queda síncrono para no
// tocar los diez primeros; este es su gemelo para el tramo nuevo.
async function stepAsync(n, description, fn) {
  await fn();
  console.log(`✔ paso ${n} — ${description}`);
}

// Doble mínimo de localStorage — passCache.js y visitCache.js lo necesitan
// y node no lo trae. removeItem lo usa clearVisitCache (paso 15).
globalThis.localStorage = (() => {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
})();

// --- paso 1: abrir la URL con ?p=<token de v_demo1> ---
const NOW = '2026-03-10T10:00-07:00'; // entre A2 (termina 10:30) y A3 (12:00)
const demo1 = Object.values(fixtures).find((f) => f.visit.token === 'fixture-token-v-demo1');
let lang;
step(1, 'el token de v_demo1 en la URL resuelve la visita correcta; el idioma inicial sale de navigator.language', () => {
  assert.ok(demo1, 'no se encontró v_demo1 por su token');
  assert.strictEqual(demo1.visit.patientFirstName, 'María');
  lang = resolveInitialLang('es-MX', null);
  assert.strictEqual(lang, 'es');
});

// --- paso 2: Inicio muestra el siguiente paso correcto ---
let focused;
step(2, 'Inicio muestra el siguiente paso correcto para un now fijado (R2)', () => {
  focused = nextStep(demo1.appointments, NOW);
  assert.strictEqual(focused.id, 'a3', 'a las 10:00, entre A2 y A3, el siguiente paso debe ser A3 (12:00, piso27)');
});

// --- paso 3: "cómo llegar" abre la ruta con el origen por defecto de R7 ---
let route;
step(3, '"cómo llegar" resuelve el origen por defecto (R7) y la ruta correspondiente', () => {
  const origin = defaultOrigin(focused, demo1.appointments, demo1.lodging);
  assert.strictEqual(origin, 'compass', 'la cita anterior (A2) fue en Compass, así que el origen por defecto es Compass');
  const result = resolveRoute(origin, focused.locationId, routes);
  assert.ok(result && result.steps, 'debería existir una ruta compass→piso27');
  route = result;
});

// --- paso 4: avanzar los pasos de la ruta, ver el resaltado moverse ---
step(4, 'el resaltado avanza paso a paso y nunca dos puntos a la vez (lo visual se confirma en el navegador, no aquí)', () => {
  const cells = new Map(locations.map((l) => [l.mapPointId, { classes: new Set() }]));
  for (const el of cells.values()) el.classList = { add: (c) => el.classes.add(c), remove: (c) => el.classes.delete(c) };
  const root = { getElementsByMapPointId: (id) => (cells.has(id) ? [cells.get(id)] : []) };
  const highlighter = createHighlighter(root);
  let previous = null;
  for (const s of route.steps) {
    highlighter.highlightStep(s.mapHighlightId);
    if (previous) assert.strictEqual(cells.get(previous).classes.has('nc-map-highlight'), false, 'el paso anterior debe perder el resaltado');
    assert.strictEqual(cells.get(s.mapHighlightId).classes.has('nc-map-highlight'), true);
    previous = s.mapHighlightId;
  }
});

// --- paso 5: abrir el pase, comprobar que el símbolo se dibuja ---
step(5, 'el pase visible dibuja un símbolo QR que decodifica al payload correcto', () => {
  const visible = visiblePasses(demo1.passes, NOW);
  assert.ok(visible.length >= 1, 'v_demo1 debería tener al menos un pase visible a las 10:00');
  const matrix = generateQrMatrix(visible[0].payload);
  assert.strictEqual(decodeQrMatrix(matrix), visible[0].payload);
});

// --- paso 6: modo avión, el último pase sigue visible con aviso ---
step(6, 'sin datos "en vivo", el último pase guardado en caché sigue visible (R3 se re-evalúa con el now actual)', () => {
  savePassCache(demo1.visit.id, demo1.passes, NOW);
  const laterSameDay = '2026-03-10T18:00-07:00';
  const cached = getCachedVisiblePasses(demo1.visit.id, laterSameDay);
  assert.ok(cached && cached.passes.length >= 1, 'la caché debería seguir dando al menos un pase visible');
  assert.strictEqual(cached.savedAt, NOW, 'el aviso "guardado a las…" depende de savedAt, que debe conservarse');
});

// --- paso 7: cambiar a inglés, ninguna cadena queda en español ---
step(7, 'las llaves usadas en los pasos 1–6 existen y dan texto distinto en inglés (paridad completa: test/ui/i18n.test.js)', () => {
  for (const path of ['home.nextStepLabel', 'map.routeStep', 'pass.title', 'itinerary.title']) {
    const es = translate('es', path);
    const en = translate('en', path);
    assert.notStrictEqual(es, en, `"${path}" debería tener texto distinto en ambos idiomas`);
  }
});

// --- paso 8: v_demo2 — sin estancia, cancelada tachada, "actualizado" ---
step(8, 'v_demo2: sin Mi estancia, cita cancelada visible pero no como siguiente paso, "actualizado" solo con marca previa', () => {
  const demo2 = fixtures.v_demo2;
  assert.strictEqual(demo2.lodging, null, 'v_demo2 no debe tener hospedaje');
  const groups = groupByDay(demo2.appointments, '2026-04-06T11:00-07:00');
  const cancelled = groups.flatMap((g) => g.items).find((a) => a.status === 'cancelled');
  assert.ok(cancelled, 'la cita cancelada (b2) debe seguir apareciendo en el itinerario');
  const next = nextStep(demo2.appointments, '2026-04-06T11:00-07:00');
  assert.notStrictEqual(next?.id, cancelled.id, 'la cancelada nunca debe ser "el siguiente paso"');
  assert.strictEqual(isUpdated(cancelled, null), false, 'sin marca previa, ninguna cita se ve "actualizada" (caso 5c)');
  assert.strictEqual(isUpdated(demo2.appointments.find((a) => a.id === 'b3'), '2026-04-06T07:00-07:00'), true, 'con una marca previa a su updatedAt, b3 sí debe verse "actualizada"');
});

// --- pasos 9 y 10: v_expired y un token inventado dan la misma pantalla neutra ---
step(9, 'v_expired: el token existe pero ya venció', () => {
  const expired = fixtures.v_expired;
  assert.strictEqual(isExpired(expired, '2026-08-05T12:00-07:00'), true);
});

step(10, 'un token inventado no se encuentra — INV-3 exige la MISMA pantalla que un token vencido; src/ui/app.js usa un único camino de código para ambos casos, así que "misma entrada de datos" (ninguna) ya es la garantía — no hay una segunda ruta de código que pudiera divergir', () => {
  const invented = Object.values(fixtures).find((f) => f.visit.token === 'este-token-nunca-existio');
  assert.strictEqual(invented, undefined);
});

// =====================================================================
// Etapa F — el tramo que empieza en la coordinadora.
//
// Un solo almacén en memoria con los DOS handlers reales encima: el del
// panel (coordinatorHandler, vía test/helpers/loopback.js) y el del
// paciente (visitHandler). Nada se finge salvo el guardia de sesión, que
// ya tiene sus pruebas en test/server/authHandler.test.js.
// =====================================================================

const panel = createLoopbackApi({ now: NOW });
const store = createCoordinatorStore({ api: panel });

// El cliente del paciente: la misma firma que createVisitApi (src/ui/api.js)
// pero contra el store del servidor en vez de fetch. Traduce los códigos
// igual que el de verdad — y esa traducción es lo que separa "venció" de
// "no hay señal" en el paso 14.
//
// Fábrica y no un objeto suelto porque el paso 19 tiene que preguntar por
// la MISMA visita con un `now` posterior, y el `now` del servidor no se lee
// nunca de la petición (visitHandler.js: aceptar un `?now=` volvería
// opcional la caducidad de R1). Duplicar el cliente habría duplicado
// también esa traducción de códigos, que es justo lo único que aquí separa
// "venció" de "no hay señal".
function clienteDelPaciente(now) {
  return {
    async getVisit(token) {
      const res = await handleVisitRequest(
        new Request('https://nch.test/api/visit', { headers: { [TOKEN_HEADER]: token } }),
        panel.servidor,
        now,
      );
      if (res.status === 404) return { ok: false, notFound: true };
      if (!res.ok) return { ok: false, failed: true };
      return { ok: true, record: await res.json() };
    },
  };
}
const apiDelPaciente = clienteDelPaciente(NOW);
// Sin señal: ni 404 ni 200, que es exactamente lo que ve un teléfono en el
// sótano del estacionamiento.
const apiSinSenal = { async getVisit() { return { ok: false, failed: true }; } };
const CACHE = { save: saveVisitCache, load: loadVisitCache, clear: clearVisitCache };

let tokenReal;
let visitId;
let passId;

await stepAsync(11, 'la coordinadora captura una visita y el token que devuelve el servidor NO es una fixture', async () => {
  const creada = await store.createVisit({
    patientFirstName: 'Bernardo',
    lang: 'es',
    startsAt: '2026-03-10T08:00-07:00',
    endsAt: '2026-03-11T09:30-07:00',
  });
  assert.ok(creada.ok, `la visita no se creó: ${JSON.stringify(creada)}`);
  visitId = creada.visit.id;
  tokenReal = creada.visit.token;

  // Lo que faltaba y abrió la etapa: createVisit acuñaba el token y el
  // router lo tiraba. Si vuelve a perderse, aquí truena.
  assert.ok(tokenReal, 'createVisit tiene que devolver el token: es lo único que se le manda al paciente');
  assert.strictEqual(tokenReal.length, 22, 'token de 128 bits en base64url = 22 caracteres (PRD §6.1)');
  assert.strictEqual(
    Object.values(fixtures).find((f) => f.visit.token === tokenReal),
    undefined,
    'un token real jamás debe colisionar con una fixture: visitSource.js resuelve fixtures ANTES de ir a la red',
  );

  // La cita va a piso27, que es el destino que el plan señaló como el más
  // probable y el que no tenía ninguna ruta desde el estacionamiento.
  const cita = await store.addAppointment(visitId, {
    serviceName: 'Consulta de Cardiología',
    startsAt: '2026-03-10T12:00-07:00',
    durationMin: 30,
    locationId: 'piso27',
  });
  assert.ok(cita.ok, `la cita no se agregó: ${JSON.stringify(cita)}`);
  assert.ok(
    locations.some((l) => l.id === cita.appointment.locationId),
    'el locationId guardado tiene que existir en el catálogo — es la razón de ser del <select> (D40)',
  );

  const emitido = await store.issueQpass(visitId, { scope: 'torre', format: 'qr', payload: 'payload-e2e-bernardo' });
  assert.ok(emitido.ok, `el pase no se emitió: ${JSON.stringify(emitido)}`);
  passId = emitido.qpass.id;
});

await stepAsync(12, 'el enlace que se manda por WhatsApp cabe en un QR y decodifica de vuelta al mismo enlace', async () => {
  const url = visitUrl('https://nchpatient.netlify.app', tokenReal);
  assert.strictEqual(url, `https://nchpatient.netlify.app/v/${tokenReal}`);
  // El motivo entero de subir el QR a versión 4 (D39): con v3 este enlace
  // no cabía y el handoff no existía. Round-trip real, no "se dibujó algo".
  assert.strictEqual(decodeQrMatrix(generateQrMatrix(url)), url, 'el QR del panel tiene que devolver el enlace exacto');
});

await stepAsync(13, 'el paciente abre ese enlace y ve SU visita, servida por red, con ruta hasta piso27', async () => {
  const resuelto = await resolveVisitContext(tokenReal, { api: apiDelPaciente, cache: CACHE, now: NOW });
  assert.ok(resuelto, 'la visita creada por la coordinadora tiene que abrir — esto era imposible antes de la Etapa E');
  assert.strictEqual(resuelto.source, 'network', 'no es fixture ni caché: viene del servidor');
  assert.strictEqual(resuelto.record.visit.patientFirstName, 'Bernardo');
  // El handler no devuelve el token: repetirlo solo le daría una segunda
  // vida en cachés y registros (visitHandler.js).
  assert.strictEqual(resuelto.record.visit.token, undefined, 'el expediente servido no debe traer el token de vuelta');

  const siguiente = nextStep(resuelto.record.appointments, NOW);
  assert.strictEqual(siguiente.locationId, 'piso27');

  const origen = defaultOrigin(siguiente, resuelto.record.appointments, resuelto.record.lodging);
  assert.strictEqual(origen, 'estacionamiento', 'sin cita previa ni hospedaje, R7 manda al estacionamiento');
  const ruta = resolveRoute(origen, 'piso27', routes);
  assert.ok(ruta && ruta.steps?.length, 'estacionamiento→piso27 tiene que tener ruta: era el par que faltaba (Etapa A)');
});

await stepAsync(14, 'sin señal, esa misma visita real sigue abriendo desde la caché', async () => {
  const resuelto = await resolveVisitContext(tokenReal, { api: apiSinSenal, cache: CACHE, now: NOW });
  assert.ok(resuelto, 'perder la señal no puede dejar al paciente sin su pase en el acceso (PRD)');
  assert.strictEqual(resuelto.source, 'cache');
  assert.strictEqual(resuelto.record.visit.patientFirstName, 'Bernardo');
  assert.strictEqual(resuelto.record.passes.length, 1, 'el pase emitido en el paso 11 tiene que estar guardado');
});

await stepAsync(15, 'la coordinadora revoca el pase y deja de verse en el teléfono, también sin señal', async () => {
  const revocado = await store.revokeQpass(visitId, passId);
  assert.ok(revocado.ok, `el pase no se revocó: ${JSON.stringify(revocado)}`);

  const conRed = await resolveVisitContext(tokenReal, { api: apiDelPaciente, cache: CACHE, now: NOW });
  assert.strictEqual(conRed.record.passes.length, 0, 'R3: un pase revocado no debe llegar siquiera al dispositivo');

  // Y lo que de verdad importa (INV-4): la caché se reescribió con la
  // versión sin el pase, así que volver a modo avión tampoco lo resucita.
  // Filtrar solo al pintar habría dejado la imagen del QPASS viva en el
  // teléfono justo después de revocarlo.
  const sinRed = await resolveVisitContext(tokenReal, { api: apiSinSenal, cache: CACHE, now: NOW });
  assert.strictEqual(sinRed.source, 'cache');
  assert.strictEqual(sinRed.record.passes.length, 0, 'revocar tiene que sobrevivir al modo avión');
});

await stepAsync(16, 'un token con forma real pero inventado da la pantalla neutra, y no toca la caché de nadie', async () => {
  // Cierra el paso 10 del otro lado: allá el token inventado no estaba en
  // las fixtures; aquí llega al servidor, que contesta el 404 único de
  // INV-3 — el mismo que daría una visita vencida.
  const inventado = 'zzzzzzzzzzzzzzzzzzzzzz';
  assert.strictEqual(inventado.length, tokenReal.length, 'mismo largo: la forma no debe delatar nada');
  const resuelto = await resolveVisitContext(inventado, { api: apiDelPaciente, cache: CACHE, now: NOW });
  assert.strictEqual(resuelto, null, 'null = pantalla neutra, la misma para "no existe" y para "venció"');

  const sigueViva = await resolveVisitContext(tokenReal, { api: apiSinSenal, cache: CACHE, now: NOW });
  assert.ok(sigueViva, 'el 404 de OTRO token no puede borrar la caché de la visita buena');
});

// =====================================================================
// Etapa G — el traslado, sobre la misma visita de Bernardo.
//
// Los tres pasos van juntos porque solos no prueban nada: que el panel
// guarde el traslado no sirve si el servidor no se lo manda al paciente, y
// que se lo mande no sirve si el enlace ya venció cuando lo va a mirar.
// =====================================================================

const LLEGADA = '2026-03-10T06:00-07:00'; // antes de la cita de las 12:00
const REGRESO = '2026-03-11T15:00-07:00'; // después de la última cita y del fin de la visita

let idRegreso;

await stepAsync(17, 'la coordinadora captura la llegada y el regreso, y un punto de encuentro inventado lo rechaza el SERVIDOR, no el formulario', async () => {
  const rechazado = await store.addTransfer(visitId, {
    kind: 'arrival',
    scheduledAt: LLEGADA,
    meetingPointId: 'aeropuerto_de_marte',
  });
  assert.strictEqual(rechazado.ok, false, 'un punto de encuentro fuera del catálogo no puede guardarse aunque el formulario lo dejara pasar');
  assert.strictEqual(rechazado.errors?.meetingPointId, 'unknown', 'y el motivo tiene que volver por campo, para poder marcarlo en la pantalla');

  const llegada = await store.addTransfer(visitId, {
    kind: 'arrival',
    scheduledAt: LLEGADA,
    meetingPointId: 'tij_terminal',
    flightNumber: 'am654',
    driver: { name: 'Juan Pérez', phone: '+526641234567' },
    vehicle: { type: 'van', make: 'Toyota', model: 'Hiace', color: 'Blanca', plate: 'abc-123-d' },
  });
  assert.ok(llegada.ok, `el traslado de llegada no se guardó: ${JSON.stringify(llegada)}`);
  assert.ok(
    TRANSFER_POINT_IDS.includes(llegada.transfer.meetingPointId),
    'el punto guardado tiene que existir en el catálogo — misma razón de ser del <select> que en las citas (D40)',
  );
  // Se leen en la pantalla del aeropuerto y en la defensa del coche: se
  // guardan como se leen, no como se teclearon.
  assert.strictEqual(llegada.transfer.flightNumber, 'AM654');
  assert.strictEqual(llegada.transfer.vehicle.plate, 'ABC-123-D');

  const regreso = await store.addTransfer(visitId, {
    kind: 'departure',
    scheduledAt: REGRESO,
    meetingPointId: 'quartz',
  });
  assert.ok(regreso.ok, `el traslado de regreso no se guardó: ${JSON.stringify(regreso)}`);
  idRegreso = regreso.transfer.id;
  // Sin chofer, y tiene que poder guardarse así: al chofer se lo asignan la
  // víspera. Exigirlo aquí obligaría a inventar un dato que nadie tiene.
  assert.strictEqual(regreso.transfer.driver.phone, '');
});

await stepAsync(18, 'los dos traslados viajan en el 200 del paciente y le salen intercalados por hora, no en otra pantalla', async () => {
  const resuelto = await resolveVisitContext(tokenReal, { api: apiDelPaciente, cache: CACHE, now: NOW });
  assert.ok(resuelto, 'la visita tiene que seguir abriendo');
  // El hueco más fácil de no ver de toda la etapa: visitHandler arma la
  // respuesta campo por campo, así que un traslado guardado en Blobs no
  // llega al teléfono solo por estar guardado.
  assert.strictEqual(resuelto.record.transfers.length, 2, 'los traslados tienen que estar en la respuesta del paciente');

  const linea = timelineItems(resuelto.record.appointments, resuelto.record.transfers);
  assert.deepStrictEqual(
    linea.map((i) => i.kind),
    ['transfer', 'appointment', 'transfer'],
    'la recogida de las 06:00 va ARRIBA de la cita de las 12:00 y el regreso al final',
  );

  // groupByDay no se tocó en esta etapa y aun así agrupa la línea mezclada:
  // era genérico desde fase 01 (solo lee `startsAt`), y por eso sus pruebas
  // siguen significando lo mismo.
  const grupos = groupByDay(linea, NOW);
  assert.strictEqual(grupos.length, 2, 'dos días: el de la llegada y la cita, y el del regreso');
  assert.strictEqual(grupos[0].items.length, 2);
  assert.strictEqual(grupos[1].items.length, 1);

  // La tarjeta de Inicio (D71): anuncia el traslado que viene, no el que ya
  // pasó. A las 05:00 es la recogida del aeropuerto; a las 10:00 esa ya fue
  // y lo que queda por delante es el regreso.
  assert.strictEqual(nextTransfer(resuelto.record.transfers, '2026-03-10T05:00-07:00').kind, 'arrival');
  assert.strictEqual(nextTransfer(resuelto.record.transfers, NOW).kind, 'departure');
});

await stepAsync(19, 'la víspera le asignan chofer al regreso, y el día del regreso el enlace SIGUE vivo — antes de esta etapa el servidor contestaba 404 con el teléfono del chofer adentro', async () => {
  // PATCH con todos los campos, no solo el que cambia: camposTraslado()
  // rearma la entidad entera a propósito (nunca esparce el cuerpo), así que
  // omitir uno lo borraría en vez de dejarlo como estaba.
  const asignado = await store.editTransfer(visitId, idRegreso, {
    kind: 'departure',
    scheduledAt: REGRESO,
    meetingPointId: 'quartz',
    driver: { name: 'Luis Ramírez', phone: '+526649876543' },
    vehicle: { type: 'suv', make: 'Chevrolet', model: 'Suburban', color: 'Negra', plate: 'xyz-987-a' },
  });
  assert.ok(asignado.ok, `no se pudo asignar el chofer: ${JSON.stringify(asignado)}`);

  const expediente = store.getVisit(visitId);
  const sinTraslados = { ...expediente, transfers: [] };
  const A_LA_HORA_DEL_REGRESO = '2026-03-11T14:00-07:00'; // una hora antes de que pase el coche

  // Las dos mitades de la trampa, sobre el MISMO expediente. La primera es
  // lo que la app hacía hasta esta etapa: la última cita terminó a las
  // 12:30 del día anterior, así que a esta hora el enlace llevaba hora y
  // media muerto — y el paciente esperando el coche sin el teléfono.
  assert.strictEqual(isExpired(sinTraslados, A_LA_HORA_DEL_REGRESO), true, 'sin contar traslados, R1 ya habría matado el enlace');
  assert.strictEqual(isExpired(expediente, A_LA_HORA_DEL_REGRESO), false, 'con el traslado de regreso en el máximo de R1, sigue vivo');

  // Y lo que de verdad importa: que eso valga en el SERVIDOR. R1 se aplica
  // en visitStore.js antes de contestar; si solo valiera en el navegador,
  // esto sería un 404 y la pantalla neutra.
  const tarde = clienteDelPaciente(A_LA_HORA_DEL_REGRESO);
  const resuelto = await resolveVisitContext(tokenReal, { api: tarde, cache: CACHE, now: A_LA_HORA_DEL_REGRESO });
  assert.ok(resuelto, 'el servidor tiene que servir la visita a la hora del regreso');
  assert.strictEqual(resuelto.source, 'network', 'servida de verdad, no rescatada de la caché por un error');

  const proximo = nextTransfer(resuelto.record.transfers, A_LA_HORA_DEL_REGRESO);
  assert.strictEqual(proximo.id, idRegreso);
  assert.strictEqual(proximo.meetingPointId, 'quartz');
  assert.strictEqual(proximo.driver.phone, '+526649876543', 'el dato por el que existe la etapa: a quién le marca el paciente si el coche no llega');
  assert.match(proximo.driver.phone, /^\+\d{8,15}$/, 'E.164 con + (D73): la pantalla arma wa.me/<dígitos> y un número local marcaría a otro país');
});

// =====================================================================
// Etapa I — el itinerario que la coordinadora ya tenía escrito en Word.
//
// Los tres pasos van juntos porque el valor de la etapa está justo en que
// se encadenen: leer el .docx no sirve si el intérprete no lo entiende, y
// entenderlo no sirve si lo entendido no llega al teléfono del paciente con
// el piso correcto y con "FASTING 8-12 HOURS" todavía adentro. Cada pieza
// tiene sus pruebas unitarias; esto es lo único que las corre en fila.
//
// El documento es SINTÉTICO (D88): reproduce las variaciones catalogadas de
// los cinco itinerarios reales —celda de hora vacía que continúa la cita
// anterior, fila de 2 celdas para la comida, typo del diccionario, piso que
// antes no existía— con datos inventados. Los reales no entran al repo.
// =====================================================================

const DOC_XML = documento([
  parrafo('CHECK-UP ITINERARY'),
  parrafo('Patient: Bernardo Salas DOB: April 6th 1970 Phone Number: +1 555 0100'),
  parrafo('Scheduled Date: July 30 – 31, 2026 – 7:30 AM.'),
  tabla([
    ['TIME', 'STUDY', 'LOCATION'],
    ['THRUSDAY , JULY 30', '', ''],
    // La preparación va en la columna de la ubicación: así vienen los cinco
    // documentos reales. Esta fila llega SIN ubicación reconocida a
    // propósito — es lo que la coordinadora resuelve en el <select> del paso
    // 21, y la razón de que la pantalla de revisión sea obligatoria (D84).
    ['7:30AM', 'BLOOD WORK', 'FASTING 8-12 HOURS'],
    ['', 'URUNALYSIS, LIPID PROFILE', ''],
    ['9:00AM', 'CARDIC CONSULTATION (DR. LUNA)', '10TH FLOOR'],
    ['11:30AM', 'LUNCH BREAK'],
    ['1:00PM', 'OPHTALMOLOGY (2 HOURS)', '22TH FLOOR'],
  ]),
].join(''));

let leido;

await stepAsync(20, 'el .docx que ya escribe la coordinadora se lee y se entiende: typos corregidos, el piso correcto y la comida aparte', async () => {
  const res = await readDocxDocumentXml(archivo(docxDe(DOC_XML)));
  assert.strictEqual(res.ok, true, `no se pudo leer el documento: ${JSON.stringify(res)}`);

  leido = parseItinerary({
    rows: docxTableRows(res.xml),
    headings: docxParagraphsOutsideTables(res.xml),
    locations,
  });

  // El nombre se lee pero NO se importa solo: la coordinadora lo confirma en
  // pantalla (D84). Es la lección del documento real que traía el nombre de
  // otra paciente adentro.
  assert.strictEqual(leido.patientName, 'Bernardo Salas');
  assert.deepStrictEqual(leido.discarded, ['dob', 'phone'], 'fecha de nacimiento y teléfono se descartan a propósito (D61)');

  assert.strictEqual(leido.counts.importable, 3, 'tres citas: la de URUNALYSIS cuelga de la primera, no es una cuarta');
  assert.strictEqual(leido.counts.meals, 1, 'LUNCH BREAK se ve pero no se importa');

  const citas = leido.rows.filter((f) => f.kind === 'appointment');
  // D85 — el diccionario corrige, no adivina. Sin esto el paciente lee
  // "URUNALYSIS" y "CARDIC" en su teléfono.
  assert.ok(citas[0].details.includes('URINALYSIS'), `los sub-estudios llegan corregidos: ${citas[0].details}`);
  assert.match(citas[1].serviceName, /CARDIAC/);
  assert.match(citas[2].serviceName, /OPHTHALMOLOGY/);

  // D82 — lo que hasta esta etapa se perdía entero.
  assert.strictEqual(citas[0].prep, 'FASTING 8-12 HOURS');
  assert.strictEqual(citas[1].doctor, 'DR. LUNA');

  // D80 — el piso 10 existe; "22TH" es ordinal malformado y se tolera al
  // leer. Antes de esta etapa las dos caían en piso27.
  assert.strictEqual(citas[1].locationId, 'piso10');
  assert.strictEqual(citas[2].locationId, 'piso22');

  // D84 — y lo que NO se adivina: sin ubicación reconocida, `null` y una
  // nota. El intérprete jamás manda texto libre de ubicación al servidor.
  assert.strictEqual(citas[0].locationId, null);
  assert.ok(citas[0].notes.some((n) => n.code === 'locationUnknown'));
  assert.strictEqual(leido.counts.needsAttention, 1, 'una fila pide intervención y el conteo lo dice');

  // D86 — "(2 HOURS)" explícito gana; lo que no lo dice son 30 minutos
  // recortados por el hueco, marcados como supuestos.
  assert.strictEqual(citas[2].durationMin, 120);
  assert.ok(citas[0].notes.some((n) => n.code === 'durationInferred'));

  // THRUSDAY → THURSDAY: el typo estaba en la fila de día, y de esa fila
  // sale la fecha de todas las citas del bloque.
  assert.match(citas[0].startsAt, /^2026-07-30T07:30/);
});

let visitaImportada;

await stepAsync(21, 'las tres citas y la visita entran al servidor en UNA sola escritura, con el nombre que confirmó la coordinadora', async () => {
  const payload = buildImportPayload({
    // Confirmado a mano en la pantalla de revisión, no copiado en silencio.
    patientFirstName: 'Bernardo',
    lang: 'es',
    rows: leido.rows
      .filter((f) => f.kind === 'appointment')
      .map((f) => ({
        startsAt: toLocalInput(f.startsAt),
        durationMin: String(f.durationMin),
        serviceName: f.serviceName,
        // Lo que la coordinadora elige en el <select> de esa fila: el
        // laboratorio está en Compass, cosa que el documento no dice porque
        // en esa columna escribió la preparación.
        locationId: f.locationId ?? 'compass',
        prep: f.prep,
        doctor: f.doctor,
        details: f.details,
      })),
  });

  assert.strictEqual(payload.appointments.length, 3, 'la comida no viaja al servidor');
  // D83 — una sola petición. Diecinueve escrituras contra un saveVisit sin
  // compare-and-set multiplican por diecinueve la ventana en la que dos
  // coordinadoras se pisan, y una importación a medias se ve igual que una
  // completa desde el panel.
  const antes = panel.llamadas.length;
  const res = await store.importItinerary(payload);
  assert.ok(res.ok, `la importación falló: ${JSON.stringify(res)}`);
  assert.strictEqual(panel.llamadas.length - antes, 1, 'una sola vuelta a la red para la visita entera');

  visitaImportada = res.visit;
  assert.strictEqual(visitaImportada.patientFirstName, 'Bernardo');
  // La ventana de la visita sale de las citas, no del reloj (INV-1).
  assert.match(visitaImportada.startsAt, /^2026-07-30T07:30/);
  assert.match(visitaImportada.endsAt, /^2026-07-30T15:00/, 'la última cita empieza a la 1:00PM y dura 2 horas');

  const expediente = store.getVisit(visitaImportada.id);
  assert.strictEqual(expediente.appointments.length, 3, 'el panel queda al día sin otra vuelta a la red');
});

await stepAsync(22, 'el paciente abre su enlace y ve el itinerario completo: la preparación, el médico y el piso al que de verdad va', async () => {
  const emitido = await store.issueQpass(visitaImportada.id, { scope: 'torre', format: 'qr', payload: 'payload-e2e-import' });
  assert.ok(emitido.ok, `no se pudo emitir el pase de la visita importada: ${JSON.stringify(emitido)}`);

  // Antes de la cita: el enlace tiene que estar vivo cuando el paciente lo
  // consulta la víspera, que es cuando importa leer "ven en ayunas".
  const LA_VISPERA = '2026-07-29T20:00-07:00';
  const cliente = clienteDelPaciente(LA_VISPERA);
  const resuelto = await resolveVisitContext(visitaImportada.token, { api: cliente, cache: CACHE, now: LA_VISPERA });
  assert.ok(resuelto, 'la visita importada tiene que abrir en el teléfono igual que una capturada a mano');
  assert.strictEqual(resuelto.source, 'network');
  assert.strictEqual(resuelto.record.appointments.length, 3);

  // El hueco más fácil de no ver: visitHandler arma la respuesta campo por
  // campo, así que un campo guardado en Blobs no llega al teléfono solo por
  // estar guardado. Es el mismo tropiezo del paso 18 con los traslados.
  const sangre = resuelto.record.appointments.find((a) => a.serviceName.startsWith('BLOOD WORK'));
  assert.strictEqual(sangre.prep, 'FASTING 8-12 HOURS', 'la preparación tiene que llegar al paciente: es el dato que le cambia la mañana');
  assert.ok(sangre.details.includes('URINALYSIS'), 'los sub-estudios corregidos, no los del typo');

  const cardio = resuelto.record.appointments.find((a) => a.serviceName.includes('CARDIAC'));
  assert.strictEqual(cardio.doctor, 'DR. LUNA');
  assert.strictEqual(cardio.locationId, 'piso10');

  // Y lo que cierra el círculo con la Etapa A: que el mapa lo mande al piso
  // 10 de verdad. Antes de D80 esta cita se capturaba como piso27 y la ruta
  // le confirmaba, con toda seguridad, un piso equivocado.
  const ruta = resolveRoute(defaultOrigin(cardio, resuelto.record.appointments, resuelto.record.lodging), 'piso10', routes);
  assert.ok(ruta && ruta.steps?.length, 'la cita del piso 10 tiene que tener ruta');
  assert.ok(
    ruta.steps.some((s) => s.instruction.es.includes('piso 10')),
    `la ruta debería nombrar el piso 10: ${ruta.steps.map((s) => s.instruction.es).join(' | ')}`,
  );

  // Lo último del camino: que salga pintado. renderItineraryScreen es pura,
  // así que aquí se ve el HTML que leería el paciente.
  const html = renderItineraryScreen({
    appointments: resuelto.record.appointments,
    transfers: resuelto.record.transfers,
    now: LA_VISPERA,
    lang: 'es',
    t: (path) => translate('es', path),
    lastViewedItineraryAt: null,
  });
  assert.ok(html.includes('FASTING 8-12 HOURS'), 'la preparación tiene que verse, no solo viajar');
  assert.ok(html.includes('DR. LUNA'));
  assert.ok(html.includes('URINALYSIS'));
  assert.ok(html.includes('Piso 10'), 'el renglón de la cita nombra el piso correcto');
  assert.ok(!html.includes('LUNCH BREAK'), 'la comida no se importó, así que no puede aparecer en el itinerario');
});

console.log('\n22/22 pasos del recorrido pasaron (10 del paciente + 6 del tramo coordinadora→paciente + 3 de traslados + 3 de importación .docx).');
console.log('Pendiente, fuera del alcance de este script: recorrido visual en navegador (incluidos los cinco .docx reales, fuera del repo) y prueba en teléfono real.');
