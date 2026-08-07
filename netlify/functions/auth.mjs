// Etapa C — POST /api/auth/login, POST /api/auth/logout, GET /api/auth/session.
// Enchufe, como visit.mjs: Blobs de un lado, la llave y el reloj del otro, y
// toda la lógica en src/server/authHandler.js, que se prueba sin levantar
// nada (test/server/authHandler.test.js).
//
// Las tres rutas caben en una sola Function a propósito: comparten el mismo
// almacén de cuentas y el mismo firmante, y separarlas serían tres arranques
// en frío distintos para el mismo trabajo.
//
// SESSION_SECRET no tiene default. Si falta, createSessionSigner lanza y la
// función contesta 500 desde el primer intento — que es exactamente lo que
// debe pasar. Un fallback silencioso significaría que la misma llave firma en
// todas partes y cualquiera que haya visto el repo se fabrica una sesión.
// Ver README, "Variables de entorno".

import { createAccountStore } from '../../src/server/accountStore.js';
import { createSessionSigner } from '../../src/server/sessions.js';
import { handleAuthRequest } from '../../src/server/authHandler.js';
import { blobsKv, ACCOUNTS_STORE } from './_kv.mjs';

export default async (request) => {
  const accounts = createAccountStore(blobsKv(ACCOUNTS_STORE));
  const signer = createSessionSigner(process.env.SESSION_SECRET);
  // El servidor es el único que dice qué hora es, aquí igual que en visit.mjs
  // (D11, D20): la caducidad de la sesión no la negocia el cliente.
  return handleAuthRequest(request, { accounts, signer, nowMs: Date.now() });
};

export const config = {
  path: '/api/auth/:action',
};
