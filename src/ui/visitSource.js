// Etapa E — de dónde sale el expediente que ve el paciente.
//
// Hasta hoy app.js buscaba el token SOLO entre las fixtures compiladas en
// el bundle. Esa era la mitad no dicha de la pregunta que abrió la etapa:
// aunque el panel hubiera mostrado el QR, una visita creada por la
// coordinadora nunca se habría podido abrir.
//
// El orden es fixture → red → caché, y cada escalón está donde está por
// una razón:
//
//   1. Fixture primero, sin tocar la red. /demo y las cinco fixtures tienen
//      que abrir en un teléfono en modo avión, que es lo que hoy funciona y
//      no se puede romper. Un token real nunca colisiona: son 22 caracteres
//      base64url, no `fixture-token-*`.
//   2. Red. Es la única fuente que puede estar al día — la coordinadora
//      mueve citas y revoca pases después de mandar el enlace.
//   3. Caché, SOLO si la red falló. Es el caso del PRD: llegar al acceso
//      sin señal con el pase en la mano.
//
// El 404 es el caso delicado y por eso vive aquí y no en app.js: el
// servidor contesta un único 404 para "no existe", "malformado" y "ya
// venció" (INV-3). Servir la caché ante un 404 sería deshacer la caducidad
// desde el cliente. Se borra.
//
// Vive fuera de app.js para poder probarse: app.js necesita DOM y este
// proyecto no monta fake DOM. Las tres dependencias entran inyectadas.

import { fixtures } from '../data/fixtures.js';

// resolveVisitContext(token, { api, cache, now, catalog })
//   -> { record, source: 'fixture'|'network'|'cache', savedAt? } | null
//
// `null` significa siempre lo mismo para quien llama: pantalla neutra. No
// se distingue "no existe" de "venció" ni de "no hay nada guardado y no
// hay señal" — INV-3 exige que el paciente no pueda inferir cuál es.
export async function resolveVisitContext(token, { api, cache, now, catalog = fixtures } = {}) {
  if (!token) return null;

  const fixture = Object.values(catalog).find((f) => f.visit.token === token);
  if (fixture) return { record: fixture, source: 'fixture' };

  const res = await api.getVisit(token);

  if (res.ok) {
    cache.save(token, res.record, now);
    return { record: res.record, source: 'network' };
  }

  if (res.notFound) {
    cache.clear(token);
    return null;
  }

  // Falla de red o del servidor: exactamente para esto existe la caché.
  // Nótese que NO se borra — perder la señal no puede ser lo que tire el
  // respaldo.
  const guardado = cache.load(token);
  if (!guardado) return null;
  return { record: guardado.record, source: 'cache', savedAt: guardado.savedAt };
}
