// Etapa D — el transporte HTTP del panel. Lo único de src/ui/ que toca la
// red, y a propósito: coordinatorStore.js recibe esto inyectado, así que se
// prueba entero sin fetch y sin fake DOM.
//
// createHttpApi devuelve `{ status, body }` crudo y NO interpreta nada.
// Quién decide que un 422 es "corrige el formulario" y un 401 es "vuelve a
// entrar" es el store; aquí solo se traduce de Response a objeto. Meter esa
// decisión en las dos capas es garantizar que un día no coincidan.
//
// createVisitApi (Etapa E, al final del archivo) sí interpreta, y ahí se
// explica por qué el lado paciente es distinto.

import { isVisitRecord } from './visitRecord.js';

const FALLA_LECTURA = 'respuesta ilegible del servidor';

// Dos bases, porque son dos Functions distintas: coordinator.mjs atiende
// /api/coordinator/* y auth.mjs atiende /api/auth/*. Están aquí como
// constantes con nombre y no incrustadas en una cadena porque boot() ya se
// equivocó una vez: reusó el api de coordinación para el cliente de acceso
// y el panel entró a /api/coordinator/login, que no existe. La pantalla se
// veía bien y ningún test lo veía (test/ui/api.test.js lo fija ahora,
// contra las constantes que exporta el servidor).
export const COORDINATOR_BASE = '/api/coordinator';
export const AUTH_BASE = '/api/auth';

export function createHttpApi({ fetch: fetchImpl = globalThis.fetch, base = COORDINATOR_BASE } = {}) {
  return {
    async request(method, path, body) {
      const init = {
        method,
        // La sesión es una cookie HttpOnly firmada (Etapa C): el navegador
        // solo la manda si se le pide. Sin esta línea TODO contesta 401 y
        // el síntoma que se ve —"el panel no guarda"— no apunta para acá.
        credentials: 'same-origin',
      };

      // Sin cuerpo en GET: `new Request` lo prohíbe, y mandar content-type
      // sin cuerpo convierte una petición simple en una con preflight sin
      // ganar nada a cambio.
      if (body !== undefined) {
        init.headers = { 'content-type': 'application/json' };
        init.body = JSON.stringify(body);
      }

      // Un fallo de red (fetch rechaza) sube tal cual: el store lo atrapa y
      // lo reporta como falla. Envolverlo aquí en un `{status: 0}` inventado
      // sería fabricar una respuesta que nunca existió.
      const res = await fetchImpl(`${base}${path}`, init);

      // 204 no tiene cuerpo y eso no es un error: es lo que contesta
      // logout.
      if (res.status === 204) return { status: 204, body: null };

      let parsed = null;
      let ilegible = false;
      try {
        parsed = await res.json();
      } catch {
        ilegible = true;
      }

      // Un 2xx cuyo cuerpo no se puede leer NO es un éxito con datos
      // vacíos: es un servidor roto, un proxy metiéndose en medio, o una
      // página de login de algún intermediario. Devolverlo como éxito haría
      // que el store guarde un expediente vacío y lo pinte como cierto.
      // En un error, en cambio, el status ya dice lo suficiente: un 401 con
      // página HTML de Netlify sigue siendo un 401.
      if (ilegible && res.status >= 200 && res.status < 300) {
        throw new Error(`${FALLA_LECTURA} (${res.status})`);
      }

      return { status: res.status, body: ilegible ? null : parsed };
    },
  };
}

// El mismo transporte apuntando a la otra Function. Existe como función
// propia y no como `createHttpApi({ base: AUTH_BASE })` en el llamador para
// que armar el cliente de acceso no dependa de que quien lo arma se
// acuerde de cambiar la base — que es exactamente lo que no pasó.
export function createAuthApi(opciones = {}) {
  return createHttpApi({ ...opciones, base: AUTH_BASE });
}

// Etapa E — el lado del PACIENTE. Vive aquí porque este archivo es lo
// único de src/ui/ con permiso de tocar la red, pero no comparte cuerpo con
// createHttpApi y es a propósito:
//
//   - Se identifica con un encabezado, no con una cookie de sesión.
//   - Manda credentials:'omit'. Si la coordinadora abre el enlace de un
//     paciente desde el mismo navegador donde tiene el panel abierto, su
//     cookie de sesión NO tiene por qué viajar a este endpoint público.
//   - Interpreta el status y devuelve un resultado. En el panel esa
//     decisión la toma el store; del lado paciente no hay store, y dejar
//     `{status}` crudo solo movería el `if` a app.js.
//
// Los valores están duplicados a propósito respecto del servidor —
// importar src/server/ desde src/ui/ metería el handler entero en el bundle
// del paciente (build.py sigue los imports). La paridad la fija
// test/ui/api.test.js contra visitHandler.js y contra el config de la
// propia Function.
export const VISIT_PATH = '/api/visit';
export const VISIT_TOKEN_HEADER = 'X-Visit-Token';

// getVisit(token) -> { ok: true, record } | { ok: false, notFound: true }
//                                         | { ok: false, failed: true }
//
// `notFound` y `failed` son dos cosas distintas y la diferencia importa:
// un 404 significa "esta visita ya no existe o venció" (el servidor
// contesta lo mismo para los tres casos, INV-3) y obliga a tirar la caché
// local; una falla significa "no se pudo preguntar" y es justo cuando la
// caché tiene que servir. Confundirlas deja visitas vencidas abriéndose
// para siempre en el teléfono, o pantallas en blanco por perder el wifi.
export function createVisitApi({ fetch: fetchImpl = globalThis.fetch } = {}) {
  return {
    async getVisit(token) {
      let res;
      try {
        res = await fetchImpl(VISIT_PATH, {
          method: 'GET',
          headers: { [VISIT_TOKEN_HEADER]: token },
          credentials: 'omit',
          cache: 'no-store',
        });
      } catch {
        return { ok: false, failed: true };
      }

      if (res.status === 404) return { ok: false, notFound: true };
      if (res.status < 200 || res.status >= 300) return { ok: false, failed: true };

      let body;
      try {
        body = await res.json();
      } catch {
        // 200 ilegible: portal cautivo del wifi del hospital, proxy, página
        // de error. No es un expediente vacío, es no haber llegado.
        return { ok: false, failed: true };
      }

      if (!isVisitRecord(body)) return { ok: false, failed: true };
      return { ok: true, record: body };
    },
  };
}
