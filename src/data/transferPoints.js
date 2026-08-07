// Etapa G — puntos de encuentro de los traslados (aeropuerto ↔ hospital).
//
// Catálogo APARTE de src/data/locations.js, y no por gusto (D70): las 7
// ubicaciones de allá tienen `mapPointId` y participan en el ruteo del mapa
// (fase 02/04). Estos puntos están fuera del complejo y no se dibujan en
// ningún plano; meterlos en `locations` obligaría a inventarles un
// mapPointId que no existe y rompería las tres listas cruzadas que
// test/data/fixtures.test.js verifica.
//
// NINGUNO de los tres puntos de cruce está confirmado por el cliente: no
// sabemos si el chofer recoge en Llegadas de la terminal, del lado
// mexicano de CBX o en la garita. Van `unconfirmed: true` — misma
// convención que la farmacia y que todos los horarios— y la UI los pinta
// con el distintivo [POR CONFIRMAR], nunca como dato real. Se corrige
// editando SOLO este archivo. Entra como punto 8 de docs/PRD.md §15.
//
// `quartz` y `lobby_torre` repiten a propósito el id de la ubicación
// equivalente en locations.js: es el mismo lugar físico. No se comparte el
// objeto porque lo que se necesita aquí (un nombre para un <select>) no es
// lo que se necesita allá (piso, horario y punto de mapa).

// `punto` y no `loc`: build.py aplana todos los módulos de una entrada a un
// solo scope al empaquetar, y locations.js ya declara `loc` arriba — dos
// declaraciones top-level con el mismo nombre son un error de compilación
// del bundle aunque nunca choquen como módulos ES sueltos.
function punto(id, nameEs, nameEn, options = {}) {
  return { id, name: { es: nameEs, en: nameEn }, ...options };
}

export const transferPoints = [
  punto('tij_terminal', 'Aeropuerto de Tijuana (TIJ) · Llegadas', 'Tijuana Airport (TIJ) · Arrivals', { unconfirmed: true }),
  punto('cbx', 'Cross Border Xpress (CBX)', 'Cross Border Xpress (CBX)', { unconfirmed: true }),
  punto('san_ysidro', 'Garita San Ysidro', 'San Ysidro Port of Entry', { unconfirmed: true }),
  punto('quartz', 'Quartz Hotel & Spa', 'Quartz Hotel & Spa'),
  punto('lobby_torre', 'Lobby Torre Médica · Acceso general', 'Medical Tower Lobby · General Access'),
];

export const TRANSFER_POINT_IDS = transferPoints.map((p) => p.id);

// Los dos enum del traslado, aquí y no en src/server/: la pantalla del
// panel los necesita para pintar sus <select> y el servidor para validar, y
// D45 prohíbe que el servidor importe código de UI. src/data/ es el único
// lugar que las dos mitades pueden leer sin que ninguna dependa de la otra.
//
// 'internal' es un traslado DENTRO del complejo (del hotel a la torre, por
// ejemplo). Lo pidió el cliente como ida y vuelta al aeropuerto, pero el
// enum lo admite desde ahora porque agregarlo después obligaría a migrar
// los registros ya guardados.
export const TRANSFER_KINDS = ['arrival', 'departure', 'internal'];

export const VEHICLE_TYPES = ['sedan', 'suv', 'van', 'ambulance', 'other'];
