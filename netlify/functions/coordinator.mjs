// Etapa D — /api/coordinator/*. Enchufe, como visit.mjs y auth.mjs: Blobs de
// un lado, el reloj y el guardia del otro, y toda la lógica en
// src/server/coordinatorHandler.js, que se prueba sin levantar nada
// (test/server/coordinatorHandler.test.js).
//
// Esta es la primera Function del proyecto que ESCRIBE. Por eso el guardia
// no es opcional ni se decide aquí: se le pasa al handler, que lo aplica a
// toda ruta antes de mirar siquiera el cuerpo.
//
// Igual que auth.mjs, si falta SESSION_SECRET esto truena con 500 desde el
// primer intento, y así debe ser. Ver README, "Cuentas de coordinación y
// variables de entorno".

import { createVisitStore } from '../../src/server/visitStore.js';
import { createAccountStore } from '../../src/server/accountStore.js';
import { createSessionSigner } from '../../src/server/sessions.js';
import { requireCoordinator } from '../../src/server/authHandler.js';
import { handleCoordinatorRequest } from '../../src/server/coordinatorHandler.js';
import { blobsKv, VISITS_STORE, ACCOUNTS_STORE } from './_kv.mjs';
import { randomUUID } from 'node:crypto';

export default async (request) => {
  const store = createVisitStore(blobsKv(VISITS_STORE));
  const accounts = createAccountStore(blobsKv(ACCOUNTS_STORE));
  const signer = createSessionSigner(process.env.SESSION_SECRET);

  return handleCoordinatorRequest(request, {
    store,
    // El guardia lee la cookie y RELEE la cuenta en el almacén, para que dar
    // de baja a alguien surta efecto en la siguiente petición y no hasta que
    // caduque su cookie (D53).
    requireCoordinator: (req) => requireCoordinator(req, { accounts, signer, nowMs: Date.now() }),
    // El servidor es el único que dice qué hora es (D11, D20). ISO con
    // desplazamiento y no epoch: estas fechas se guardan en el expediente y
    // se comparan contra las citas, que son ISO. Auth usa epoch porque ahí
    // lo único que se compara son caducidades de sesión.
    now: new Date().toISOString(),
    newId: (prefijo) => `${prefijo}_${randomUUID()}`,
  });
};

export const config = {
  // El comodín cubre /visits, /visits/:id y los tres niveles de abajo; el
  // ruteo fino lo hace el handler, que se puede probar sin desplegar.
  path: '/api/coordinator/*',
};
