// Restaurantes de la Plaza (PRD §7 PlazaVenue, §13). Confirmado por el
// cliente: Farmer's Table y The Park Restaurante están en Nivel 1; Boka
// está DENTRO del Hotel Quartz, no en Nivel 1 (corrección explícita del
// cliente sobre el primer borrador de la presentación — ver
// docs/DECISIONS.md D14 y la nota de nomenclatura del PRD §13).
//
// "The Yard" (nombre usado hasta la fase 06) se renombró a "The Park
// Restaurante": el directorio oficial de la plaza (directorio-plaza-
// exterior.pdf, aportado por el cliente en fase 07) ya no lo lista con el
// nombre anterior, y el cliente confirmó que es el mismo local renombrado,
// no un cierre — ver docs/DECISIONS.md D25.
//
// Tipo de comida y horario de los tres siguen sin confirmar (PRD §15.2:
// "¿Hay algo más en Nivel 1?" tampoco tiene respuesta todavía), así que
// los tres venues van unconfirmed: true completos, no solo en hours.
//
// Amenidades (cajeros, wifi, sanitarios, zonas pet-friendly — PRD §15.3)
// NO están representadas aquí: no hay ni nombre ni ubicación real de
// ninguna. Inventar entradas placeholder sería peor que no tenerlas.
// Cuando el cliente confirme, se agregan como PlazaVenue type: "amenity".

// Nombre único a propósito, ver el mismo comentario en
// src/data/locations.js: build.py (fase 05) aplana todos los módulos a un
// solo scope, y ese archivo tiene un helper privado con la misma forma.
function plazaOpeningHours() {
  return {
    tz: 'America/Tijuana',
    weekly: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '07:00', close: '20:00' })),
    exceptions: [],
    unconfirmed: true,
  };
}

function venue(id, name, level, mapPointId) {
  return {
    id,
    name,
    type: 'restaurant',
    cuisine: [], // PRD §15.2: tipo de comida sin confirmar
    level,
    hours: plazaOpeningHours(),
    mapPointId,
    unconfirmed: true,
  };
}

export const plazaVenues = [
  venue('farmers_table', "Farmer's Table", 'N1', 'mp_level1'),
  venue('the_park', 'The Park Restaurante', 'N1', 'mp_level1'),
  venue('boka', 'Boka', 'Quartz', 'mp_quartz'),
];
