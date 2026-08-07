// Etapa D — el transporte HTTP del panel. Lo único de src/ui/ que toca la
// red, y a propósito: coordinatorStore.js recibe esto inyectado, así que se
// prueba entero sin fetch y sin fake DOM.
//
// Devuelve `{ status, body }` crudo y NO interpreta nada. Quién decide que
// un 422 es "corrige el formulario" y un 401 es "vuelve a entrar" es el
// store; aquí solo se traduce de Response a objeto. Meter esa decisión en
// las dos capas es garantizar que un día no coincidan.

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
