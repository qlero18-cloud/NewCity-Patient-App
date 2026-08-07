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

export function blobsKv(storeName) {
  const store = getStore(storeName);

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
