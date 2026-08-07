// Etapa B — el único archivo del proyecto que sabe que existe Netlify
// Blobs. Traduce el contrato de cuatro métodos que pide
// src/server/visitStore.js a la API real de @netlify/blobs, y nada más:
// aquí no vive ninguna decisión, para que cambiar de proveedor sea
// reescribir estas veinte líneas y no tocar el resto.
//
// El guion bajo del nombre no es adorno: Netlify trata cada archivo de
// netlify/functions/ como un endpoint publicado, salvo los que empiezan
// con `_`. Sin él, este adaptador se publicaría como una función más.

import { getStore } from '@netlify/blobs';

// `options` solo lo usa scripts/create-coordinator.mjs, que corre en la
// máquina de quien administra y no dentro de Netlify: allá el runtime inyecta
// solo las credenciales del sitio, aquí hay que pasarle { siteID, token } a
// mano. Las Functions siguen llamando blobsKv(STORE) sin nada más.
// CONSISTENCIA FUERTE, y no es un ajuste fino: es lo único que impide perder
// datos en silencio. `@netlify/blobs` arranca en `eventual` si no se le dice
// nada (`this.consistency = consistency ?? "eventual"`), y dentro de una
// Function eso manda las LECTURAS al edge con caché. Todo el servidor de este
// proyecto es leer-modificar-escribir —`addAppointment` lee la visita entera,
// le agrega la cita y vuelve a escribirla— así que dos cambios seguidos
// pierden el primero: la segunda lectura devuelve la versión anterior y la
// escritura la pisa. Sin error, sin aviso, sobre el expediente de un paciente.
//
// El costo es que la lectura no se cachea, y aquí no importa: son unas cuantas
// coordinadoras, no tráfico público.
//
// Si el runtime alguna vez expusiera `edgeURL` sin `uncachedEdgeURL`, el
// cliente TIRA `BlobsConsistencyError` en vez de degradar a eventual, y esta
// función contestaría 500 en la primera petición. Se deja así a propósito, por
// la misma razón que `SESSION_SECRET` no tiene valor por defecto (D53): un
// respaldo silencioso reintroduce exactamente el bug que esta línea evita, y
// encima lo esconde. Un 500 se ve el primer día; una cita que desaparece, no.
// `scripts/smoke-blobs.mjs` existe para toparse con eso antes que una persona.
const CONSISTENCIA = 'strong';

export function blobsKv(storeName, options) {
  const store = getStore({ name: storeName, consistency: CONSISTENCIA, ...options });

  return {
    // `type: 'json'` ya devuelve null si la llave no existe, que es
    // exactamente el contrato que espera visitStore.
    async get(key) {
      return store.get(key, { type: 'json' });
    },

    async set(key, value) {
      await store.setJSON(key, value);
    },

    async delete(key) {
      await store.delete(key);
    },

    // Blobs devuelve { blobs: [{ key, etag }], directories }; el contrato
    // pide solo las llaves.
    async list(prefix) {
      const { blobs } = await store.list({ prefix });
      return blobs.map((b) => b.key);
    },
  };
}

// Un solo almacén para todo el expediente de visitas. Los pases y el
// hospedaje viven DENTRO del registro de la visita (misma forma que
// src/data/fixtures.js), así que no hacen falta almacenes aparte.
export const VISITS_STORE = 'visits';

// Las cuentas van en OTRO almacén, no en otro prefijo del mismo (Etapa C).
// Son lo único que puede darle a alguien acceso a todos los expedientes, así
// que separarlas hace que un `list()` sobre las visitas no las roce nunca y
// que se puedan respaldar, migrar o borrar por su cuenta.
export const ACCOUNTS_STORE = 'accounts';
