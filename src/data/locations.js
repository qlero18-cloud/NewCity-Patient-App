// Ubicaciones del complejo (PRD §7 Location, §13 nomenclatura confirmada
// por el cliente). Contenido real de NewCity — a diferencia de
// src/data/fixtures.js, esto sobrevive al prototipo.
//
// Los 7 id de aquí coinciden a propósito con los locationId que ya usa el
// catálogo de rutas (src/data/routes.js, fase 02) y con los 7 mapPointId
// de docs/phases/phase-04-map-svg.md. Las tres listas se prueban cruzadas
// en test/data/fixtures.test.js: si una cambia sin las otras, la prueba
// lo detecta.
//
// El PRD §15 no trae ningún horario confirmado por el cliente para NINGÚN
// punto del complejo — el ítem 4 lo dice explícito para Compass/Piso
// 27/coordinación, pero tampoco hay dato real para el resto. Por eso
// `hours` va unconfirmed: true en las 7, con un horario placeholder
// razonable (07:00–20:00 todos los días) que la UI debe mostrar con el
// distintivo [POR CONFIRMAR], nunca como si fuera un dato real.
//
// NOTA — hueco entre fases: phase-03-fixtures.md menciona "tienda de
// conveniencia" como contenido confirmado, pero phase-04-map-svg.md fija
// exactamente 7 mapPointId y ninguno le corresponde. No se inventa aquí
// un mapPointId nuevo (esa lista la fija la fase 04, no esta) ni se
// fuerza la tienda dentro de un punto existente por adivinar. Queda fuera
// de este archivo hasta que se resuelva esa inconsistencia entre fases.

// Nombre único a propósito (no solo "openingHours"): src/data/plaza.js
// tiene un helper privado con la misma forma, y build.py (fase 05) aplana
// todos los módulos a un solo scope al empaquetar — dos declaraciones
// top-level con el mismo nombre chocarían ahí aunque nunca chocan como
// módulos ES sueltos. Comportamiento idéntico, solo el nombre cambia.
function locationsOpeningHours() {
  return {
    tz: 'America/Tijuana',
    weekly: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '07:00', close: '20:00' })),
    exceptions: [],
    unconfirmed: true,
  };
}

function loc(id, nameEs, nameEn, kind, floor, mapPointId, options = {}) {
  return {
    id,
    name: { es: nameEs, en: nameEn },
    kind,
    floor,
    hours: locationsOpeningHours(),
    mapPointId,
    ...options,
  };
}

export const locations = [
  loc('estacionamiento', 'Estacionamiento', 'Parking', 'parking', 'P', 'mp_parking'),
  loc('lobby_torre', 'Lobby Torre Médica · Acceso general', 'Medical Tower Lobby · General Access', 'lobby', 'PB', 'mp_lobby'),
  loc('compass', 'Compass · Laboratorio e imagenología', 'Compass · Lab & Imaging', 'lab_imaging', 'N1', 'mp_compass'),
  loc('piso27', 'Piso 27 · Consultorios', 'Floor 27 · Consultation Offices', 'consultorios', '27', 'mp_floor27'),
  loc('quartz', 'Quartz Hotel & Spa', 'Quartz Hotel & Spa', 'hotel', 'N1', 'mp_quartz'),
  loc('nivel1', "Nivel 1 · Gastronomía (Farmer's Table, The Park Restaurante)", 'Level 1 · Dining (Farmer\'s Table, The Park Restaurante)', 'dining', 'N1', 'mp_level1'),
  // Nombre y ubicación exacta de la farmacia sin confirmar (PRD §15.6):
  // aquí va marcada unconfirmed a nivel de ubicación completa, no solo el
  // horario, porque más que el horario está pendiente.
  loc('farmacia', 'Farmacia', 'Pharmacy', 'pharmacy', 'PB', 'mp_pharmacy', { unconfirmed: true }),
];

export const LOCATION_IDS = locations.map((l) => l.id);
