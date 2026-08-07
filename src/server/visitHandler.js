// Etapa B — el manejador del endpoint del paciente. Puro: recibe un
// `Request` estándar, un store ya construido y el `now` del servidor, y
// devuelve un `Response` estándar. No importa nada de Netlify, así que se
// prueba entero sin instalar ni levantar nada
// (test/server/visitHandler.test.js).
//
// netlify/functions/visit.mjs es el envoltorio: enchufa Blobs y el reloj
// real, y no toma ninguna decisión propia.
//
// Solo lectura, y solo en esta etapa. El camino de escritura no se publica
// hasta que exista la autenticación de la Etapa C: una API abierta que crea
// visitas sería una API abierta que guarda datos de salud.

import { visiblePasses } from '../domain/passes.js';

// El token va en un encabezado, NUNCA en la query string. La URL completa
// queda en los registros de acceso de la plataforma, en el historial del
// navegador y en el Referer de cualquier salida a otro sitio; el token es
// la credencial completa de la visita.
//
// (El enlace que abre el paciente sí lleva `?p=<token>` — eso es D01/D02 y
// no cambia aquí: es la única forma de que un QR entregue la credencial.
// Pero la petición que hace la app después no tiene por qué repetir esa
// exposición.)
export const TOKEN_HEADER = 'X-Visit-Token';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  // Datos de salud (PRD §6.2): que no queden en la caché del navegador ni
  // en la de ningún intermediario.
  'cache-control': 'no-store',
  // La respuesta no es HTML, y nadie debe intentar adivinar que sí.
  'x-content-type-options': 'nosniff',
};

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// UNA sola respuesta para "no existe", "no tiene forma de token", "no vino
// el encabezado" y "ya venció" (INV-3, R1). Si fueran distintas —un 400
// para el mal formado, un 404 para el inexistente— cualquiera probando
// tokens a ciegas sabría cuáles vale la pena seguir intentando.
function notFound() {
  return json(404, { error: 'not_found' });
}

export async function handleVisitRequest(request, store, now) {
  if (request.method !== 'GET') {
    return json(405, { error: 'method_not_allowed' });
  }

  const token = request.headers.get(TOKEN_HEADER);

  try {
    // `now` es siempre el del servidor. A propósito no se lee ningún
    // `?now=` de la petición: D20 lo dejó como recurso de la demo en el
    // navegador, y aceptarlo aquí volvería opcional la caducidad de R1.
    const record = await store.getVisitByToken(token, now);
    if (!record) return notFound();

    return json(200, {
      // El token no se devuelve: el cliente ya lo tiene, y repetirlo solo
      // le da una segunda vida en cachés y registros.
      visit: { ...record.visit, token: undefined },
      appointments: record.appointments,
      // R3 se aplica aquí, no solo en la pantalla: un pase revocado no
      // debe llegar siquiera al dispositivo. Filtrarlo solo al pintar
      // dejaría la imagen del QPASS en la memoria del teléfono después de
      // revocarlo, que es justo lo que revocar tiene que impedir.
      passes: visiblePasses(record.passes, now),
      lodging: record.lodging,
      // Etapa G. `?? []` y no `record.transfers` a secas: los expedientes
      // guardados antes de esta etapa no traen la llave, y mandar
      // `undefined` haría reventar el itinerario de un paciente con visita
      // vieja. Aquí se normaliza una vez y la app ya no se entera.
      //
      // Los cancelados SÍ se mandan, al revés que un pase revocado. No es
      // incoherencia: revocar un pase le quita un permiso que ya no debe
      // tener (R3 lo filtra arriba); un traslado cancelado es información
      // que necesita —tachada, para que no se plante a esperar un coche
      // que no va a llegar.
      transfers: record.transfers ?? [],
    });
  } catch {
    // El detalle se queda del lado del servidor. Un mensaje de error
    // interno dice qué hay detrás (qué almacén, qué variable falta) y eso
    // no es asunto de quien pide.
    return json(500, { error: 'internal' });
  }
}
