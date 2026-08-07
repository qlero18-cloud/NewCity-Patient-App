// Etapa E — "¿esto tiene forma de expediente?", preguntado en los dos
// bordes por donde puede entrar uno que no lo sea:
//
//   - api.js, cuando el servidor contesta 200 con algo que no es lo que
//     dice ser (proxy, portal cautivo del wifi del hospital).
//   - visitCache.js, cuando lo guardado lo escribió una versión anterior
//     de la app, quedó truncado, o alguien lo editó a mano.
//
// Está en un módulo propio y no copiado en los dos porque es exactamente
// el tipo de predicado que se arregla en un lado y se olvida en el otro:
// el día que las pantallas empiecen a dar por hecho un campo más, hay UN
// lugar donde agregarlo.
//
// Valida solo lo que las pantallas dan por hecho sin preguntar. No valida
// el contenido —eso ya lo hizo el servidor al guardarlo— sino que exista
// la estructura sobre la que renderHomeScreen y compañía iteran a ciegas.

export function isVisitRecord(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && value.visit
    && typeof value.visit.id === 'string'
    && Array.isArray(value.appointments)
    && Array.isArray(value.passes)
  );
}
