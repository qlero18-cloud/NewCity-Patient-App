// Directorio de la Plaza (PRD §7 PlazaVenue, §13). Confirmado por el
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
// Fase 07 (D27): el mismo documento trae los ~27 locales y amenidades
// restantes de la plaza (Salud, Belleza, Servicios, Moda, más las
// amenidades que PRD §15.3 marcaba como sin ningún dato real — cajeros,
// sanitarios, elevador, escaleras, rampa, pago de estacionamiento, valet,
// emergencias). Se agregan aquí con `category` (los 5 rótulos del propio
// documento, más "amenidad"), no como "restaurant": ese type se queda
// exclusivo de Gastronomía para no romper el filtro por tipo de comida ya
// existente en pantalla.
//
// mapPointId: ninguno de estos 27 es un punto nuevo en el mapa SVG (fase
// 04 fija exactamente 7 — D26 ya los reubicó en dos niveles reales). Cada
// entrada nueva apunta al punto existente MÁS CERCANO en el documento de
// referencia, no a uno propio: 27 círculos tocables más saturarían un
// esquema de teléfono ya ajustado, y src/ui/screens/plaza.js no usa
// mapPointId para "cómo llegar" (renderFicha, a diferencia de la ficha del
// mapa, no tiene ese botón) — aquí es solo una referencia de zona, no un
// destino de ruteo, así que aproximar es razonable. test/data/fixtures.test.js
// ya prueba de forma genérica que todo mapPointId de este archivo existe
// en la lista fija de la fase 04; eso sigue cumpliéndose porque no se
// inventa ninguno nuevo.
//
// Tipo de comida y horario de gastronomía siguen sin confirmar (PRD
// §15.2), y tampoco hay horario real de ningún local nuevo — todo sigue
// unconfirmed: true completo, mismo criterio que los tres venues
// originales.
//
// Dos códigos del documento comparten nombre de marca ("Luxor Óptica" en
// H3 y en S5): se listan como dos entradas distintas (`luxor_optica_h3`,
// `luxor_optica_s5`) en vez de asumir que es un error de imprenta — dos
// sucursales de una misma óptica dentro del mismo complejo no es algo
// inusual, y no hay forma de confirmar cuál sería "la" correcta si se
// borrara una.

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

// category: 'gastronomia' | 'salud' | 'belleza' | 'servicios' | 'moda' | 'amenidad'
// (los 5 rótulos tal cual los usa directorio-plaza-exterior.pdf, más
// "amenidad" para los íconos de servicio sin marca propia). `type` se
// deriva de category solo para las dos vistas que el PRD ya nombraba
// (PlazaVenue type: "restaurant" | "amenity"); category es el dato real.
function venue(id, name, category, level, mapPointId) {
  return {
    id,
    name,
    type: category === 'gastronomia' ? 'restaurant' : category === 'amenidad' ? 'amenity' : 'directory',
    category,
    cuisine: [], // PRD §15.2: tipo de comida sin confirmar (solo aplica a gastronomia)
    level,
    hours: plazaOpeningHours(),
    mapPointId,
    unconfirmed: true,
  };
}

export const plazaVenues = [
  // --- Gastronomía | Food ---
  venue('farmers_table', "Farmer's Table", 'gastronomia', 'N1', 'mp_level1'),
  venue('the_park', 'The Park Restaurante', 'gastronomia', 'N1', 'mp_level1'),
  venue('boka', 'Boka', 'gastronomia', 'Quartz', 'mp_quartz'),
  venue('jose_cafe', 'José Café', 'gastronomia', 'calle', 'mp_lobby'),

  // --- Salud | Health ---
  venue('dreyes_uniformes', "D'Reyes Uniformes Médicos", 'salud', 'calle', 'mp_parking'),
  venue('previa_imagen_dental', 'Previa Imagen Dental', 'salud', 'calle', 'mp_parking'),
  venue('luxor_optica_h3', 'Luxor Óptica', 'salud', 'calle', 'mp_pharmacy'),
  venue('luxor_optica_s5', 'Luxor Óptica', 'salud', 'plaza', 'mp_compass'),
  venue('hospital', 'Hospital', 'salud', 'calle', 'mp_lobby'),
  venue('centro_luz_ada', 'Centro de Luz Ada', 'salud', 'calle', 'mp_lobby'),
  venue('lumati', 'Lumati', 'salud', 'plaza', 'mp_compass'),
  venue('rehab_ortopedia', 'Rehabilitación y Ortopedia Avanzada', 'salud', 'plaza', 'mp_compass'),

  // --- Belleza | Beauty ---
  venue('skin_point', 'Skin Point', 'belleza', 'calle', 'mp_parking'),

  // --- Servicios | Services ---
  venue('dr_zoo', 'Dr. Zoo', 'servicios', 'calle', 'mp_parking'),
  venue('bankaool', 'Bankaool', 'servicios', 'calle', 'mp_parking'),
  venue('reyes_room_barber', 'Reyes Room Barber Shop', 'servicios', 'calle', 'mp_parking'),
  venue('credinspira', 'Credinspira', 'servicios', 'calle', 'mp_pharmacy'),
  venue('emotion_tours', 'Emotion Tours', 'servicios', 'calle', 'mp_pharmacy'),
  venue('medi_exchange', 'Medi Exchange', 'servicios', 'calle', 'mp_pharmacy'),
  venue('seven_eleven', '7-Eleven', 'servicios', 'calle', 'mp_pharmacy'), // D17: resuelve "tienda de conveniencia"

  // --- Moda | Fashion ---
  venue('atalier_calzado', 'Atalier del Calzado', 'moda', 'calle', 'mp_parking'),
  venue('slender_waist', 'Slender Waist', 'moda', 'calle', 'mp_pharmacy'),

  // --- Amenidades (PRD §15.3: cajeros, sanitarios, etc. — antes sin ningún dato real) ---
  // level aquí usa los mismos códigos ('calle' | 'plaza' | 'ambos') que
  // src/ui/screens/plaza.js traduce vía t('plaza.level.*') — a diferencia
  // de "N1"/"Quartz" en los venues de arriba (códigos cortos que se
  // muestran tal cual, sin traducir, igual que desde fase 03), estos sí
  // son palabras reales en español y deben verse traducidas en inglés.
  venue('restrooms', { es: 'Baños', en: 'Restrooms' }, 'amenidad', 'ambos', 'mp_lobby'),
  venue('atm', { es: 'Cajero automático', en: 'ATM' }, 'amenidad', 'calle', 'mp_lobby'),
  venue('elevator', { es: 'Elevador', en: 'Elevator' }, 'amenidad', 'ambos', 'mp_lobby'),
  venue('escalator', { es: 'Escaleras eléctricas', en: 'Escalator' }, 'amenidad', 'ambos', 'mp_lobby'),
  venue('handicap_ramp', { es: 'Rampa para discapacitados', en: 'Handicap ramp' }, 'amenidad', 'calle', 'mp_parking'),
  venue('parking_payment', { es: 'Pago de estacionamiento', en: 'Parking payment machine' }, 'amenidad', 'calle', 'mp_parking'),
  venue('valet', { es: 'Valet', en: 'Valet parking' }, 'amenidad', 'calle', 'mp_lobby'),
  venue('emergency', { es: 'Emergencias', en: 'Emergency' }, 'amenidad', 'calle', 'mp_lobby'),
];
