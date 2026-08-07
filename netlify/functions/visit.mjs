// Etapa B — GET /api/visit. Cinco líneas de enchufe: Blobs de un lado, el
// reloj real del otro, y toda la lógica en src/server/visitHandler.js, que
// se prueba sin levantar nada (test/server/visitHandler.test.js).
//
// Esta es la ÚNICA función publicada de la Etapa B, y es de solo lectura.
// El camino de escritura llega con la autenticación de la Etapa C: publicar
// antes un POST que crea visitas sería publicar una API abierta que guarda
// datos de salud.
//
// El token va en el encabezado X-Visit-Token, nunca en la query string —
// ver el comentario de visitHandler.js.

import { createVisitStore } from '../../src/server/visitStore.js';
import { handleVisitRequest } from '../../src/server/visitHandler.js';
import { blobsKv, VISITS_STORE } from './_kv.mjs';

export default async (request) => {
  const store = createVisitStore(blobsKv(VISITS_STORE));
  // El servidor es el único que dice qué hora es (R1). Este archivo, no el
  // dominio, es el punto sancionado para leer el reloj del lado servidor —
  // el equivalente a lo que src/ui/app.js es del lado navegador (D11, D20).
  return handleVisitRequest(request, store, new Date().toISOString());
};

export const config = {
  path: '/api/visit',
};
