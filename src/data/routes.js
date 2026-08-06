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

  route('r_lobby_torre_piso27', 'lobby_torre', 'piso27', 3, [
    step(1, 'Desde el lobby, toma el elevador de la Torre Médica al piso 27.', 'From the lobby, take the Medical Tower elevator to floor 27.', 'mp_floor27'),
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
];
