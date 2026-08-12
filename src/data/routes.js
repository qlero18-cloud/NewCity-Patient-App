// Catálogo de rutas redactadas — PROVISIONAL (PRD §15.1, phase-02 §"Catálogo
// provisional de rutas"). El motor que consume este catálogo (routing.js)
// es definitivo; el contenido de aquí NO lo es: depende de los planos
// oficiales del complejo y de un recorrido físico que todavía no se hace.
// Por eso cada Route lleva `unconfirmed: true` y cada texto de paso incluye
// "[POR CONFIRMAR]" de forma visible.
//
// Convención de mapHighlightId (elección de esta fase, documentada aquí
// porque el PRD no la fija): en una ruta de 2 pasos, el primer paso resalta
// el mapPointId del origen y el último resalta el del destino. Los 7
// mapPointId vienen de docs/phases/phase-04-map-svg.md — si esa lista
// cambia, MAP_HIGHLIGHT_IDS y este catálogo deben actualizarse juntos.
//
// locationId aquí es un slug provisional propio de esta fase (fase 03 aún
// no define src/data/locations.js). Cuando fase 03 se construya, sus
// Location.id deben coincidir exactamente con estos slugs:
// estacionamiento, lobby_torre, compass, piso27, nivel1, farmacia, quartz.

export const MAP_HIGHLIGHT_IDS = ['mp_parking', 'mp_lobby', 'mp_compass', 'mp_floor27', 'mp_quartz', 'mp_level1', 'mp_pharmacy'];

function route(id, fromLocationId, toLocationId, estimatedMinutes, steps) {
  return { id, fromLocationId, toLocationId, estimatedMinutes, unconfirmed: true, steps };
}

function step(order, es, en, mapHighlightId) {
  return { order, instruction: { es: `[POR CONFIRMAR] ${es}`, en: `[TO CONFIRM] ${en}`, }, mapHighlightId };
}

// Los pisos de consultorios de la Torre Médica (D80). La lista se repite
// aquí en vez de importarse de src/data/locations.js porque este archivo es
// la capa de abajo — locations.js declara que sus id coinciden con los slugs
// de este catálogo, no al revés — y porque routes.js no importa nada, a
// propósito. La copia no puede derivar en silencio: test/data/fixtures.test.js
// exige que los locationId usados por las rutas coincidan EXACTAMENTE con
// LOCATION_IDS, así que agregar un piso en un archivo y no en el otro rompe
// la suite de inmediato.
//
// Nombres distintos de los de locations.js (allá es CONSULTORIO_FLOORS) a
// propósito: build.py aplana todos los módulos de un entry a un solo scope
// top-level y dos declaraciones homónimas serían un error duro de build.
const PISOS_CONSULTORIO = [10, 11, 16, 22, 27, 28, 29];

function routesPisoConsultorio(n) {
  return [
    route(`r_lobby_torre_piso${n}`, 'lobby_torre', `piso${n}`, 3, [
      step(1, `Desde el lobby, toma el elevador de la Torre Médica al piso ${n}.`, `From the lobby, take the Medical Tower elevator to floor ${n}.`, 'mp_floor27'),
    ]),
    route(`r_piso${n}_lobby_torre`, `piso${n}`, 'lobby_torre', 3, [
      step(1, `Desde el piso ${n}, baja en el elevador de la Torre Médica hasta el lobby.`, `From floor ${n}, take the Medical Tower elevator down to the lobby.`, 'mp_lobby'),
    ]),
  ];
}

export const routes = [
  route('r_estacionamiento_lobby_torre', 'estacionamiento', 'lobby_torre', 4, [
    step(1, 'Sal del estacionamiento hacia la entrada principal de la Torre Médica.', 'Exit the parking area toward the Medical Tower main entrance.', 'mp_parking'),
    step(2, 'Entra por el lobby de acceso general.', 'Enter through the general-access lobby.', 'mp_lobby'),
  ]),

  route('r_estacionamiento_compass', 'estacionamiento', 'compass', 6, [
    step(1, 'Sal del estacionamiento hacia la entrada principal de la Torre Médica.', 'Exit the parking area toward the Medical Tower main entrance.', 'mp_parking'),
    step(2, 'Sigue las señales de Compass (laboratorio e imagenología) en Nivel 1.', 'Follow the signs for Compass (lab and imaging) on Level 1.', 'mp_compass'),
  ]),

  route('r_lobby_torre_compass', 'lobby_torre', 'compass', 3, [
    step(1, 'Desde el lobby, dirígete a Compass en Nivel 1.', 'From the lobby, head to Compass on Level 1.', 'mp_compass'),
  ]),

  route('r_compass_piso27', 'compass', 'piso27', 5, [
    step(1, 'Sal de Compass hacia los elevadores de la Torre Médica.', 'Exit Compass toward the Medical Tower elevators.', 'mp_compass'),
    step(2, 'Sube al piso 27 (consultorios).', 'Go up to floor 27 (consultation offices).', 'mp_floor27'),
  ]),

  route('r_compass_nivel1', 'compass', 'nivel1', 4, [
    step(1, 'Sal de Compass hacia el Nivel 1.', 'Exit Compass toward Level 1.', 'mp_compass'),
    step(2, 'Encontrarás Farmer\'s Table y The Park Restaurante en Nivel 1.', 'You\'ll find Farmer\'s Table and The Park Restaurante on Level 1.', 'mp_level1'),
  ]),

  route('r_piso27_nivel1', 'piso27', 'nivel1', 5, [
    step(1, 'Desde el piso 27, baja en el elevador de la Torre Médica.', 'From floor 27, take the Medical Tower elevator down.', 'mp_floor27'),
    step(2, 'Nivel 1 tiene Farmer\'s Table y The Park Restaurante.', 'Level 1 has Farmer\'s Table and The Park Restaurante.', 'mp_level1'),
  ]),

  route('r_piso27_farmacia', 'piso27', 'farmacia', 5, [
    step(1, 'Desde el piso 27, baja en el elevador de la Torre Médica.', 'From floor 27, take the Medical Tower elevator down.', 'mp_floor27'),
    step(2, 'La farmacia está cerca del lobby de acceso general.', 'The pharmacy is near the general-access lobby.', 'mp_pharmacy'),
  ]),

  route('r_quartz_lobby_torre', 'quartz', 'lobby_torre', 4, [
    step(1, 'Sal del Quartz Hotel & Spa hacia la Torre Médica.', 'Exit Quartz Hotel & Spa toward the Medical Tower.', 'mp_quartz'),
    step(2, 'Entra por el lobby de acceso general.', 'Enter through the general-access lobby.', 'mp_lobby'),
  ]),

  route('r_lobby_torre_quartz', 'lobby_torre', 'quartz', 4, [
    step(1, 'Desde el lobby, dirígete al Quartz Hotel & Spa.', 'From the lobby, head to Quartz Hotel & Spa.', 'mp_quartz'),
  ]),

  // --- Tramos contra el lobby (D41) ---
  // Arriba están los pares mínimos que redactó la fase 02 (menos los del
  // piso 27, que se movieron al bloque generado del final). Estos completan
  // la estrella alrededor de lobby_torre, de forma que TODA ubicación tenga
  // ruta directa de ida y de vuelta al lobby. Eso es lo que le permite a
  // resolveRoute() componer cualquier par restante sin que haya que inventar
  // decenas de rutas más a mano.
  //
  // Faltaba, entre otros, estacionamiento → piso27: el origen por defecto de
  // la primera cita del día (R7) contra el destino más común (consultorios),
  // que hasta ahora dejaba el mapa sin nada que dibujar.

  route('r_lobby_torre_estacionamiento', 'lobby_torre', 'estacionamiento', 4, [
    step(1, 'Sal del lobby por la entrada principal de la Torre Médica.', 'Exit the lobby through the Medical Tower main entrance.', 'mp_lobby'),
    step(2, 'Cruza hacia el estacionamiento.', 'Cross over to the parking area.', 'mp_parking'),
  ]),

  route('r_compass_lobby_torre', 'compass', 'lobby_torre', 3, [
    step(1, 'Sal de Compass y regresa al lobby de acceso general.', 'Exit Compass and return to the general-access lobby.', 'mp_lobby'),
  ]),

  route('r_nivel1_lobby_torre', 'nivel1', 'lobby_torre', 4, [
    step(1, 'Desde Nivel 1, regresa al lobby de acceso general.', 'From Level 1, head back to the general-access lobby.', 'mp_lobby'),
  ]),

  route('r_lobby_torre_nivel1', 'lobby_torre', 'nivel1', 4, [
    step(1, 'Desde el lobby, sube a Nivel 1 (Farmer\'s Table y The Park Restaurante).', 'From the lobby, go up to Level 1 (Farmer\'s Table and The Park Restaurante).', 'mp_level1'),
  ]),

  route('r_farmacia_lobby_torre', 'farmacia', 'lobby_torre', 2, [
    step(1, 'Desde la farmacia, regresa al lobby de acceso general.', 'From the pharmacy, head back to the general-access lobby.', 'mp_lobby'),
  ]),

  route('r_lobby_torre_farmacia', 'lobby_torre', 'farmacia', 2, [
    step(1, 'La farmacia está cerca del lobby de acceso general.', 'The pharmacy is near the general-access lobby.', 'mp_pharmacy'),
  ]),

  // --- Pisos de consultorios de la Torre Médica (D80/D81) ---
  // Los siete pisos, el 27 incluido, salen de UNA sola definición. El 27
  // estaba escrito a mano aquí arriba y se movió a este bloque a propósito:
  // con dos redacciones distintas para el mismo recorrido, el texto del 27 y
  // el de los demás pisos se separan en cuanto alguien toque uno solo, y el
  // paciente acaba leyendo instrucciones distintas para el mismo elevador.
  // El resultado para el 27 es idéntico al que había, id y minutos incluidos.
  //
  // A cada piso le bastan sus dos tramos contra el lobby: resolveRoute()
  // compone lo demás (compass → piso10 sale como compass → lobby → piso10,
  // que además es como se camina de verdad). Escribir a mano los otros pares
  // habría sido inventar contenido par por par — justo lo que D41 rechazó al
  // preferir la composición.
  ...PISOS_CONSULTORIO.flatMap(routesPisoConsultorio),
];
