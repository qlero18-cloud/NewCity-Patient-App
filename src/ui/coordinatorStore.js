// Etapa D — el store del panel. Era una copia en memoria de las fixtures
// (fase 09) y ahora habla con /api/coordinator.
//
// Lo que cambia respecto de la fase 09:
//
//   · Recargar ya no borra nada (#16). Lo que se captura queda en Blobs.
//   · El token que se acuña al crear la visita SALE de aquí, en vez de
//     morir en el router (coordinatorApp.js:238). Es lo que la Etapa E
//     convierte en enlace y QR.
//   · "No existe" tiene un solo resultado con nombre en vez de un null que
//     se confunde con "no válido" (#11).
//   · Nadie valida en el navegador y ya: el servidor rechaza, y el motivo
//     por campo vuelve al formulario.
//
// FORMA: las lecturas son SÍNCRONAS y salen de una copia local; las
// mutaciones son asíncronas. Es a propósito. Las cinco pantallas del panel
// pintan HTML de un jalón, sin await, y sus ~1400 líneas de prueba dependen
// de eso; volverlas asíncronas sería reescribir la fase 09 entera para
// mover datos de un lado a otro. Así que el ciclo es: cargar → pintar, y la
// copia local es lo que se pintó.
//
// La copia local es una VISTA, no una segunda fuente de verdad: se
// reemplaza entera con lo que devuelve el servidor y nunca se parchea a
// mano. Si el panel adivinara el resultado de cada mutación, dos
// coordinadoras sobre la misma visita divergirían a la primera edición y
// ninguna de las dos sabría cuál pantalla está mintiendo.
//
// `now` desaparece de la firma de las mutaciones. Antes lo pasaba
// coordinatorApp.js desde el reloj del navegador; ahora la hora de lo que
// se guarda la pone el servidor, que es el único que puede decirla igual
// para todos. Un reloj mal puesto en la máquina de coordinación estampaba
// esa hora en el expediente que después lee el paciente.

// El transporte se inyecta (`api.request(method, path, body)`) en vez de
// llamar a fetch aquí: así este archivo se prueba entero sin red y sin
// fake DOM, que es la regla del proyecto. createHttpApi() de api.js es la
// implementación real.
export function createCoordinatorStore({ api }) {
  // Dos mapas y no uno, porque son dos cosas distintas y confundirlas se
  // ve igual en pantalla: `summaries` es lo que trae GET /visits (solo los
  // Visit, sin citas ni pases ni token); `records` es lo que trae GET
  // /visits/:id (el expediente completo). Meter resúmenes en `records` con
  // `appointments: []` diría "esta visita no tiene citas" cuando lo cierto
  // es "todavía no las pedí" — y un itinerario vacío se pinta idéntico.
  const summaries = new Map();
  const records = new Map();

  // Traduce la respuesta HTTP al resultado que la pantalla sabe manejar.
  // Cuatro fallos distintos y con nombre, porque la pantalla hace cuatro
  // cosas distintas: marcar campos, decir "esa visita ya no está", mandar
  // a entrar de nuevo, o pedir que se reintente.
  async function pedir(method, path, body) {
    let res;
    try {
      res = await api.request(method, path, body);
    } catch {
      // Red caída, DNS, el túnel de netlify dev apagado. Es lo mismo que
      // un 500 para quien está capturando: no es su culpa y no hay campo
      // que corregir.
      return { ok: false, failed: true };
    }

    if (res.status >= 200 && res.status < 300) return { ok: true, body: res.body ?? {} };
    if (res.status === 401) return { ok: false, unauthenticated: true };
    if (res.status === 404) return { ok: false, notFound: true };
    // 422 sin `errors` sería una respuesta rota del servidor; el objeto
    // vacío deja que el formulario marque "algo" en vez de tronar al
    // recorrer undefined.
    if (res.status === 422) return { ok: false, errors: res.body?.errors ?? {} };
    return { ok: false, failed: true };
  }

  // Toda mutación devuelve el expediente completo (`record`) más la
  // entidad que tocó. Se guarda el expediente y se entrega la entidad:
  // quien acaba de crear una cita necesita su id, y buscarlo dentro del
  // registro sería adivinar cuál de las citas es la nueva.
  async function mutar(method, path, body, llave) {
    const res = await pedir(method, path, body);
    if (!res.ok) return res;

    if (res.body.record) records.set(res.body.record.visit.id, res.body.record);
    return { ok: true, [llave]: res.body[llave] };
  }

  return {
    // ---- carga ----

    async loadVisits() {
      const res = await pedir('GET', '/visits');
      if (!res.ok) return res;

      summaries.clear();
      for (const visit of res.body.visits ?? []) summaries.set(visit.id, { visit });
      return { ok: true };
    },

    async loadVisit(visitId) {
      const res = await pedir('GET', `/visits/${encodeURIComponent(visitId)}`);
      if (!res.ok) return res;

      records.set(visitId, res.body);
      return { ok: true };
    },

    // ---- lecturas (síncronas, de la copia local) ----

    // Los resúmenes NO traen appointments/passes/lodging. La pantalla de
    // visitas solo lee `.visit` (screens/coordinator/visits.js:41), y si
    // algún día lee más, lo correcto es que reviente ahí y no que pinte
    // una lista vacía como si fuera un dato.
    listVisits() {
      return [...summaries.values()];
    },

    getVisit(visitId) {
      return records.get(visitId) ?? null;
    },

    getVisitWithPasses(visitId) {
      const r = records.get(visitId);
      return r ? { visit: r.visit, passes: r.passes } : null;
    },

    // ---- mutaciones (asíncronas, contra el servidor) ----

    async createVisit(input) {
      const res = await pedir('POST', '/visits', input);
      if (!res.ok) return res;

      const { visit } = res.body;
      // El resumen se agrega de una vez para que la lista quede al día sin
      // otra vuelta a la red. Es el único caso en que se escribe la copia
      // local con algo que no vino de una relectura — y aun así el dato es
      // del servidor, no del formulario.
      summaries.set(visit.id, { visit });
      // El expediente recién creado se conoce entero: está vacío porque
      // acaba de nacer, no porque falte pedirlo.
      records.set(visit.id, { visit, appointments: [], passes: [], lodging: null });
      // Con token: es lo único que hay para mandarle al paciente y hasta
      // hoy se tiraba a la basura.
      return { ok: true, visit };
    },

    addAppointment(visitId, input) {
      return mutar('POST', `/visits/${encodeURIComponent(visitId)}/appointments`, input, 'appointment');
    },

    moveAppointment(visitId, appointmentId, startsAt) {
      return mutar(
        'PATCH',
        `/visits/${encodeURIComponent(visitId)}/appointments/${encodeURIComponent(appointmentId)}`,
        { action: 'move', startsAt },
        'appointment',
      );
    },

    // Editar cubre serviceName/durationMin/locationId nada más. startsAt
    // sigue siendo trabajo de moveAppointment, y status no se toca: el
    // enum cerrado de Appointment.status (PRD §7) no tiene un valor para
    // "editado" porque editar contenido no es un cambio de estado. El
    // servidor lo impone además de esto (visitMutations.js).
    editAppointment(visitId, appointmentId, input) {
      return mutar(
        'PATCH',
        `/visits/${encodeURIComponent(visitId)}/appointments/${encodeURIComponent(appointmentId)}`,
        { action: 'edit', ...input },
        'appointment',
      );
    },

    cancelAppointment(visitId, appointmentId) {
      return mutar(
        'PATCH',
        `/visits/${encodeURIComponent(visitId)}/appointments/${encodeURIComponent(appointmentId)}`,
        { action: 'cancel' },
        'appointment',
      );
    },

    setLodging(visitId, lodging) {
      return mutar('PUT', `/visits/${encodeURIComponent(visitId)}/lodging`, lodging, 'lodging');
    },

    issueQpass(visitId, input) {
      return mutar('POST', `/visits/${encodeURIComponent(visitId)}/passes`, input, 'qpass');
    },

    // Revocar es PATCH y no DELETE porque no borra nada: le estampa
    // revokedAt al pase y lo deja en la lista. Un pase emitido es historia
    // de la visita — quién entró con qué y hasta cuándo — y esa historia
    // no se reescribe (§6.5).
    revokeQpass(visitId, passId) {
      return mutar(
        'PATCH',
        `/visits/${encodeURIComponent(visitId)}/passes/${encodeURIComponent(passId)}`,
        { action: 'revoke' },
        'qpass',
      );
    },
  };
}
