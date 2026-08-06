// Fase 05 — cadenas es/en de las 7 pantallas del paciente. `STRINGS.es` y
// `STRINGS.en` deben tener exactamente el mismo árbol de llaves (probado
// en test/ui/i18n.test.js con un barrido recursivo, no solo de primer
// nivel) — así una llave nueva agregada a un idioma y olvidada en el otro
// rompe la prueba en vez de aparecer en blanco en producción.
//
// Contenido ya confirmado por el cliente (nombres de ubicaciones, menús,
// horarios reales) NO vive aquí: viene de src/data/*.js y ya trae su
// propio es/en. Este archivo es solo texto de interfaz — títulos, botones,
// estados — que no depende de ningún dato del paciente.

export const SUPPORTED_LANGS = ['es', 'en'];
export const DEFAULT_LANG = 'es';

export const STRINGS = {
  es: {
    common: {
      appName: 'NewCity',
      langToggle: 'English',
      unconfirmedBadge: 'POR CONFIRMAR',
      backButton: 'Atrás',
      loading: 'Cargando…',
      neutralTitle: 'Este enlace no está disponible',
      neutralBody: 'Si tu visita sigue vigente, pide a coordinación un enlace nuevo.',
    },
    tabs: {
      home: 'Inicio',
      itinerary: 'Itinerario',
      map: 'Mapa',
      plaza: 'Plaza',
      help: 'Ayuda',
    },
    home: {
      greeting: (name) => `Hola, ${name}`,
      nextStepLabel: 'Tu siguiente paso',
      nextStepCta: 'Ver mi pase',
      nextStepEmptyTitle: 'Completaste tu itinerario',
      nextStepEmptyBody: 'No tienes más citas programadas en esta visita.',
      quickAccessMap: 'Mapa',
      quickAccessStay: 'Mi estancia',
      quickAccessHelp: 'Ayuda',
      hoursLink: 'Horarios de Compass y Piso 27',
    },
    itinerary: {
      title: 'Mi itinerario',
      updatedBadge: 'actualizado',
      status: {
        scheduled: 'Programada',
        in_progress: 'En curso',
        done: 'Completada',
        moved: 'Reprogramada',
        cancelled: 'Cancelada',
      },
      empty: 'No hay citas registradas en esta visita.',
    },
    map: {
      title: 'Mapa y accesos',
      directionsButton: 'Cómo llegar',
      routeTitle: (from, to) => `${from} → ${to}`,
      routeStep: (current, total) => `Paso ${current} de ${total}`,
      routePrev: 'Anterior',
      routeNext: 'Siguiente',
      routeNone: 'Todavía no hay una ruta redactada entre estos dos puntos.',
      chooseDestination: 'Elige un punto del mapa para ver cómo llegar',
      sameLocation: 'Ya estás en el punto de tu próxima cita.',
    },
    plaza: {
      title: 'Plaza',
      restaurantsTitle: 'Restaurantes',
      directoryTitle: 'Directorio',
      amenitiesTitle: 'Amenidades',
      amenitiesEmpty: 'Sin amenidades confirmadas todavía.',
      cuisineFilterAll: 'Todos',
      cuisineUnknown: 'Tipo de comida por confirmar',
      category: {
        gastronomia: 'Gastronomía',
        salud: 'Salud',
        belleza: 'Belleza',
        servicios: 'Servicios',
        moda: 'Moda',
        amenidad: 'Amenidad',
      },
      level: {
        calle: 'Nivel Calle',
        plaza: 'Nivel Plaza',
        ambos: 'Ambos niveles',
      },
    },
    hours: {
      title: 'Horarios',
      openNow: 'Abierto ahora',
      closedNow: 'Cerrado ahora',
      unknown: 'Horario sin confirmar',
    },
    stay: {
      title: 'Mi estancia',
      hotel: 'Hotel',
      reservationCode: 'Código de reservación',
      copyButton: 'Copiar',
      copied: 'Copiado',
      checkIn: 'Check-in',
      checkOut: 'Check-out',
      breakfastIncluded: 'Desayuno incluido',
      recoveryRoom: 'Habitación recovery',
      yes: 'Sí',
      no: 'No',
    },
    help: {
      title: 'Ayuda',
      whatsappButton: 'Escribir por WhatsApp',
      callButton: 'Llamar',
      hoursTitle: 'Horario de atención de coordinación',
    },
    pass: {
      title: 'Mi pase',
      empty: 'No tienes ningún pase visible en este momento.',
      scope: { torre: 'Torre Médica', piso27: 'Piso 27', estacionamiento: 'Estacionamiento' },
      brightnessHint: 'Sube el brillo de tu pantalla para que se lea mejor en el acceso.',
      offline: 'Sin conexión',
      savedAt: (time) => `guardado a las ${time}`,
      validUntil: (time) => `Válido hasta las ${time}`,
      noExpiry: 'Sin fecha de caducidad',
    },
  },
  en: {
    common: {
      appName: 'NewCity',
      langToggle: 'Español',
      unconfirmedBadge: 'TO CONFIRM',
      backButton: 'Back',
      loading: 'Loading…',
      neutralTitle: 'This link isn’t available',
      neutralBody: 'If your visit is still active, ask coordination for a new link.',
    },
    tabs: {
      home: 'Home',
      itinerary: 'Itinerary',
      map: 'Map',
      plaza: 'Plaza',
      help: 'Help',
    },
    home: {
      greeting: (name) => `Hi, ${name}`,
      nextStepLabel: 'Your next step',
      nextStepCta: 'View my pass',
      nextStepEmptyTitle: 'You completed your itinerary',
      nextStepEmptyBody: 'You have no more scheduled appointments on this visit.',
      quickAccessMap: 'Map',
      quickAccessStay: 'My stay',
      quickAccessHelp: 'Help',
      hoursLink: 'Compass and Floor 27 hours',
    },
    itinerary: {
      title: 'My itinerary',
      updatedBadge: 'updated',
      status: {
        scheduled: 'Scheduled',
        in_progress: 'In progress',
        done: 'Done',
        moved: 'Rescheduled',
        cancelled: 'Cancelled',
      },
      empty: 'No appointments on record for this visit.',
    },
    map: {
      title: 'Map & access',
      directionsButton: 'Get directions',
      routeTitle: (from, to) => `${from} → ${to}`,
      routeStep: (current, total) => `Step ${current} of ${total}`,
      routePrev: 'Previous',
      routeNext: 'Next',
      routeNone: 'There isn’t a written route between these two points yet.',
      chooseDestination: 'Choose a point on the map to see directions',
      sameLocation: 'You’re already at the point of your next appointment.',
    },
    plaza: {
      title: 'Plaza',
      restaurantsTitle: 'Restaurants',
      directoryTitle: 'Directory',
      amenitiesTitle: 'Amenities',
      amenitiesEmpty: 'No confirmed amenities yet.',
      cuisineFilterAll: 'All',
      cuisineUnknown: 'Cuisine to be confirmed',
      category: {
        gastronomia: 'Food',
        salud: 'Health',
        belleza: 'Beauty',
        servicios: 'Services',
        moda: 'Fashion',
        amenidad: 'Amenity',
      },
      level: {
        calle: 'Street Level',
        plaza: 'Plaza Level',
        ambos: 'Both levels',
      },
    },
    hours: {
      title: 'Hours',
      openNow: 'Open now',
      closedNow: 'Closed now',
      unknown: 'Hours not confirmed',
    },
    stay: {
      title: 'My stay',
      hotel: 'Hotel',
      reservationCode: 'Reservation code',
      copyButton: 'Copy',
      copied: 'Copied',
      checkIn: 'Check-in',
      checkOut: 'Check-out',
      breakfastIncluded: 'Breakfast included',
      recoveryRoom: 'Recovery room',
      yes: 'Yes',
      no: 'No',
    },
    help: {
      title: 'Help',
      whatsappButton: 'Message on WhatsApp',
      callButton: 'Call',
      hoursTitle: 'Coordination support hours',
    },
    pass: {
      title: 'My pass',
      empty: 'You have no visible pass right now.',
      scope: { torre: 'Medical Tower', piso27: 'Floor 27', estacionamiento: 'Parking' },
      brightnessHint: 'Turn up your screen brightness so it scans well at the access point.',
      offline: 'Offline',
      savedAt: (time) => `saved at ${time}`,
      validUntil: (time) => `Valid until ${time}`,
      noExpiry: 'No expiration date',
    },
  },
};

export function resolveInitialLang(navigatorLanguage, storedLang) {
  if (storedLang && SUPPORTED_LANGS.includes(storedLang)) return storedLang;
  if (navigatorLanguage && navigatorLanguage.toLowerCase().startsWith('en')) return 'en';
  return DEFAULT_LANG;
}

// Acceso por ruta de puntos ("home.nextStepCta"). Lanza si la llave no
// existe en vez de devolver undefined en silencio: una llave mal escrita
// debe romper visiblemente en desarrollo, no aparecer como "undefined" en
// pantalla.
//
// Se llama "translate", no "t": src/ui/app.js necesita el nombre corto "t"
// para la función local que cada pantalla recibe como ctx.t (usada por
// docenas de llamadas en los 7 archivos de src/ui/screens/), y build.py
// (fase 05) no soporta "import { t as translate }" — aplana los módulos a
// un solo scope por nombre declarado, sin manejar alias. Dos nombres
// distintos de origen evita necesitar un alias en primer lugar.
export function translate(lang, path) {
  const dict = STRINGS[SUPPORTED_LANGS.includes(lang) ? lang : DEFAULT_LANG];
  const value = path.split('.').reduce((node, key) => {
    if (node === undefined) throw new Error(`i18n: falta la llave "${path}" en "${lang}"`);
    return node[key];
  }, dict);
  if (value === undefined) throw new Error(`i18n: falta la llave "${path}" en "${lang}"`);
  return value;
}
