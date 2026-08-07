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
      // Endónimo: el nombre de cada idioma EN ese idioma, por eso es
      // idéntico en el bloque es y en el bloque en. Es lo que espera quien
      // usa un selector de idioma — "Español" se reconoce aunque la
      // interfaz esté en inglés — y evita que la coordinadora tenga que
      // traducir mentalmente para elegir el idioma del paciente.
      langName: { es: 'Español', en: 'English' },
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
    // Fase 09 — demo del panel de coordinadores (docs/phases/phase-09-
    // coordinator-demo.md). Texto de interfaz nuevo, sin dato del
    // paciente — mismo criterio del resto de este archivo. Reutiliza
    // pass.scope.* para el selector de alcance del QPASS en vez de
    // duplicar esas tres cadenas aquí.
    coordinator: {
      appName: 'NewCity — Coordinación',
      backToVisits: 'Volver a visitas',
      subnavLabel: 'Navegación de la visita',
      // Un solo mensaje para las tres pantallas que necesitan una visita
      // seleccionada (itinerario/hospedaje/QPASS). Antes cada una lo
      // resolvía por su cuenta con un `lang === 'en' ? … : …` escrito a
      // mano, y hospedaje ni siquiera mostraba nada.
      visitNotFound: 'No encontramos esa visita.',
      // Etapa D — el hueco entre pedir los datos y tenerlos. Antes no
      // existía: el panel arrancaba con una copia de las fixtures ya en
      // memoria.
      loading: 'Cargando…',
      retry: 'Reintentar',
      // Etapa D — sesión de coordinación. La Etapa C construyó
      // /api/auth/*, pero el panel no tenía por dónde entrar.
      auth: {
        title: 'Coordinación NewCity',
        intro: 'Entra con tu cuenta para capturar y editar visitas.',
        usernameLabel: 'Usuario',
        passwordLabel: 'Contraseña',
        signIn: 'Entrar',
        signingIn: 'Entrando…',
        signOut: 'Salir',
        checking: 'Verificando sesión…',
        // Un solo mensaje para usuario inexistente, contraseña mala y
        // cuenta bloqueada, porque el servidor da una sola respuesta para
        // los tres (authHandler.js:38): decir cuál de los tres fue le
        // sirve más a quien prueba usuarios que a quien olvidó su clave.
        invalidCredentials: 'Usuario o contraseña incorrectos.',
        expired: 'Tu sesión terminó. Vuelve a entrar.',
      },
      // Motivos que devuelve el servidor, por campo. Vienen como códigos
      // sin idioma (`required`, `unknown`, …) justamente para poder
      // traducirlos aquí: la respuesta HTTP no depende del idioma de quien
      // la pidió. Compartidos por los cuatro formularios del panel.
      error: {
        required: 'Este dato es obligatorio.',
        unknown: 'Esa opción no existe. Elige una de la lista.',
        unsupported: 'Esa opción no está permitida.',
        invalidDate: 'Fecha no reconocida. Usa el formato 2026-03-09T15:00-07:00.',
        noOffset: 'Falta la zona horaria. Termina la fecha con -07:00.',
        order: 'La fecha de fin debe ser posterior a la de inicio.',
        tooLong: 'Ese texto es demasiado largo.',
        invalid: 'Ese dato no es válido.',
        // Fallas que no son de ningún campo.
        gone: 'Esa visita ya no existe. Vuelve a la lista.',
        network: 'No pudimos guardar: revisa la conexión e inténtalo otra vez.',
      },
      visits: {
        title: 'Visitas',
        empty: 'No hay visitas todavía.',
        newVisit: 'Nueva visita',
      },
      intake: {
        title: 'Alta de visita',
        firstNameLabel: 'Nombre de pila',
        langLabel: 'Idioma',
        startsAtLabel: 'Inicio de la visita',
        endsAtLabel: 'Fin de la visita',
        save: 'Guardar visita',
      },
      itinerary: {
        title: 'Itinerario',
        empty: 'Esta visita todavía no tiene citas.',
        addAppointment: 'Agregar cita',
        serviceNameLabel: 'Estudio o consulta',
        startsAtLabel: 'Fecha y hora',
        durationLabel: 'Duración (minutos)',
        locationLabel: 'Ubicación',
        move: 'Mover',
        edit: 'Editar',
        cancel: 'Cancelar',
        cancelledBadge: 'Cancelada',
        movedBadge: 'Movida',
      },
      lodging: {
        title: 'Hospedaje',
        hotelLabel: 'Hotel',
        reservationCodeLabel: 'Código de reservación',
        checkInLabel: 'Check-in',
        checkOutLabel: 'Check-out',
        breakfastLabel: 'Desayuno incluido',
        recoveryLabel: 'Habitación recovery',
        save: 'Guardar hospedaje',
        saved: 'Hospedaje guardado.',
        error: {
          required: 'Este dato es obligatorio.',
          invalidDate: 'Fecha no reconocida. Usa el formato 2026-03-09T15:00-07:00.',
          order: 'El check-out debe ser posterior al check-in.',
        },
      },
      qpass: {
        title: 'Emitir QPASS',
        uploadLabel: 'Subir imagen del pase',
        scopeLabel: 'Alcance',
        noImage: 'Todavía no se ha subido ninguna imagen.',
        previewTitle: 'Vista previa',
        issue: 'Emitir QPASS',
        pendingBadge: 'QPASS pendiente',
        issuedBadge: 'QPASS emitido',
        viewAsPatient: 'Ver como paciente',
        reissue: 'Emitir otro QPASS',
        revoke: 'Revocar QPASS',
        error: {
          type: 'Ese archivo no es una imagen. Sube una foto o captura del pase.',
          size: 'La imagen pesa demasiado. Usa uno de menos de 2 MB.',
          read: 'No se pudo leer el archivo. Inténtalo otra vez.',
        },
      },
      // Etapa E — la entrega al paciente. `waMessage` es una función
      // porque interpola dos cosas (nombre y enlace) y el orden de esas
      // dos piezas cambia entre idiomas; concatenar afuera obligaría a la
      // pantalla a decidir ese orden, que es justo lo que este archivo
      // existe para no hacer.
      //
      // Este mensaje es el ÚNICO texto de todo el archivo que se pinta en
      // el idioma del paciente estando el panel en otro: la coordinadora
      // puede tener la interfaz en español y estar atendiendo a alguien
      // que solo lee inglés (ver src/ui/screens/coordinator/handoff.js).
      handoff: {
        title: 'Enviar al paciente',
        intro: 'Manda este enlace al paciente. Al abrirlo en su teléfono ve su itinerario, el mapa del complejo y su pase de acceso.',
        linkLabel: 'Enlace de la visita',
        copy: 'Copiar enlace',
        copied: 'Enlace copiado.',
        whatsapp: 'Enviar por WhatsApp',
        qrHint: 'O deja que lo escanee con la cámara de su teléfono.',
        qrTooLong: 'Este enlace es demasiado largo para caber en un código QR. Cópialo y mándalo como texto.',
        noToken: 'Esta visita no trae enlace. Recarga la página; si sigue igual, avisa a sistemas.',
        noOrigin: 'Abre el panel desde su dirección web (https://…) para poder armar el enlace del paciente.',
        waMessage: (nombre, enlace) =>
          `Hola ${nombre}: aquí está tu guía de visita en NewCity Hospital — itinerario, mapa y pase de acceso. Ábrela en tu teléfono: ${enlace}`,
      },
    },
  },
  en: {
    common: {
      appName: 'NewCity',
      langToggle: 'Español',
      // Igual que en el bloque es, a propósito: ver el comentario de allá.
      langName: { es: 'Español', en: 'English' },
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
    coordinator: {
      appName: 'NewCity — Coordination',
      backToVisits: 'Back to visits',
      subnavLabel: 'Visit navigation',
      visitNotFound: 'We couldn’t find that visit.',
      loading: 'Loading…',
      retry: 'Retry',
      auth: {
        title: 'NewCity Coordination',
        intro: 'Sign in with your account to create and edit visits.',
        usernameLabel: 'Username',
        passwordLabel: 'Password',
        signIn: 'Sign in',
        signingIn: 'Signing in…',
        signOut: 'Sign out',
        checking: 'Checking session…',
        invalidCredentials: 'Incorrect username or password.',
        expired: 'Your session ended. Please sign in again.',
      },
      error: {
        required: 'This field is required.',
        unknown: 'That option doesn’t exist. Pick one from the list.',
        unsupported: 'That option isn’t allowed.',
        invalidDate: 'We couldn’t read that date. Use the format 2026-03-09T15:00-07:00.',
        noOffset: 'The time zone is missing. End the date with -07:00.',
        order: 'The end date must be after the start date.',
        tooLong: 'That text is too long.',
        invalid: 'That value isn’t valid.',
        gone: 'That visit no longer exists. Go back to the list.',
        network: 'We couldn’t save: check your connection and try again.',
      },
      visits: {
        title: 'Visits',
        empty: 'No visits yet.',
        newVisit: 'New visit',
      },
      intake: {
        title: 'Visit intake',
        firstNameLabel: 'First name',
        langLabel: 'Language',
        startsAtLabel: 'Visit start',
        endsAtLabel: 'Visit end',
        save: 'Save visit',
      },
      itinerary: {
        title: 'Itinerary',
        empty: 'This visit has no appointments yet.',
        addAppointment: 'Add appointment',
        serviceNameLabel: 'Study or consultation',
        startsAtLabel: 'Date and time',
        durationLabel: 'Duration (minutes)',
        locationLabel: 'Location',
        move: 'Move',
        edit: 'Edit',
        cancel: 'Cancel',
        cancelledBadge: 'Cancelled',
        movedBadge: 'Moved',
      },
      lodging: {
        title: 'Lodging',
        hotelLabel: 'Hotel',
        reservationCodeLabel: 'Reservation code',
        checkInLabel: 'Check-in',
        checkOutLabel: 'Check-out',
        breakfastLabel: 'Breakfast included',
        recoveryLabel: 'Recovery room',
        save: 'Save lodging',
        saved: 'Lodging saved.',
        error: {
          required: 'This field is required.',
          invalidDate: 'We couldn’t read that date. Use the format 2026-03-09T15:00-07:00.',
          order: 'Check-out must be after check-in.',
        },
      },
      qpass: {
        title: 'Issue QPASS',
        uploadLabel: 'Upload pass image',
        scopeLabel: 'Scope',
        noImage: 'No image uploaded yet.',
        previewTitle: 'Preview',
        issue: 'Issue QPASS',
        pendingBadge: 'QPASS pending',
        issuedBadge: 'QPASS issued',
        viewAsPatient: 'View as patient',
        reissue: 'Issue another QPASS',
        revoke: 'Revoke QPASS',
        error: {
          type: 'That file isn’t an image. Upload a photo or screenshot of the pass.',
          size: 'That image is too large. Use one under 2 MB.',
          read: 'We couldn’t read that file. Please try again.',
        },
      },
      handoff: {
        title: 'Send to patient',
        intro: 'Send this link to the patient. Opening it on their phone shows their itinerary, the campus map and their access pass.',
        linkLabel: 'Visit link',
        copy: 'Copy link',
        copied: 'Link copied.',
        whatsapp: 'Send on WhatsApp',
        qrHint: 'Or let them scan it with their phone camera.',
        qrTooLong: 'This link is too long to fit in a QR code. Copy it and send it as text.',
        noToken: 'This visit has no link. Reload the page; if it stays this way, tell IT.',
        noOrigin: 'Open the panel from its web address (https://…) so the patient link can be built.',
        waMessage: (name, link) =>
          `Hi ${name}, here's your NewCity Hospital visit guide — itinerary, map and access pass. Open it on your phone: ${link}`,
      },
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
