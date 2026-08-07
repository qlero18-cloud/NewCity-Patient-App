// Etapa C — sesión de coordinadora: cookie firmada con HMAC-SHA256.
//
// FIRMADA, no cifrada. El contenido viaja legible en el navegador; lo que la
// llave garantiza es que nadie lo cambie. Por eso aquí dentro solo va de
// quién es la sesión y hasta cuándo vale — nada que deba quedarse del lado
// del servidor. test/server/sessions.test.js fija esa propiedad a propósito,
// para que quien agregue un campo se tope con ella.
//
// Por qué firmar y no guardar sesiones en Blobs: una sesión en el almacén
// obliga a una lectura de red en CADA petición autenticada, y a limpiar las
// vencidas. Una cookie firmada se verifica con puro CPU. El costo es real y
// hay que decirlo: no se puede revocar una sesión antes de que expire sin
// una lista negra. Por eso el TTL es de una jornada y no de un mes — si hay
// que sacar a alguien, se borra su cuenta (deja de poder entrar) y su sesión
// muere al terminar el turno.

import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'nc_session';
export const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000; // un turno
// 32 caracteres es el piso, no la recomendación: el script de alta genera
// 64 hex al azar.
export const MIN_SECRET_LENGTH = 32;

export function createSessionSigner(secret) {
  // Sin default y sin fallback. Un "dev-secret" silencioso significa que la
  // misma llave firma en todas partes y cualquiera que haya visto el repo se
  // fabrica una sesión de coordinadora; que reviente al arrancar es
  // muchísimo mejor que arrancar inseguro sin avisar.
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET ausente o demasiado corto (mínimo ${MIN_SECRET_LENGTH} caracteres). ` +
        'Genera uno con `node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"` ' +
        'y captúralo como variable de entorno en Netlify.',
    );
  }

  const signPayload = (payload) => createHmac('sha256', secret).update(payload).digest();

  return {
    sign(claims, nowMs, { ttlMs = DEFAULT_TTL_MS } = {}) {
      const body = { ...claims, iat: nowMs, exp: nowMs + ttlMs };
      const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
      return `${payload}.${signPayload(payload).toString('base64url')}`;
    },

    // Devuelve las claims o null. Nunca lanza: toda entrada viene de una
    // cookie, o sea de fuera.
    verify(value, nowMs) {
      if (typeof value !== 'string') return null;

      const parts = value.split('.');
      if (parts.length !== 2) return null;
      const [payload, sig] = parts;
      if (!payload || !sig) return null;

      const provided = Buffer.from(sig, 'base64url');
      const expected = signPayload(payload);
      // timingSafeEqual lanza si los largos no coinciden, y el largo no es
      // secreto: se compara antes.
      if (provided.length !== expected.length) return null;
      if (!timingSafeEqual(provided, expected)) return null;

      let claims;
      try {
        claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      } catch {
        return null;
      }
      if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return null;

      // Una sesión firmada pero sin dueño no sirve para nada: todo lo que
      // sigue la usa para saber quién hizo cada cambio.
      if (typeof claims.sub !== 'string' || !claims.sub) return null;
      if (typeof claims.exp !== 'number' || !(nowMs < claims.exp)) return null;

      return claims;
    },
  };
}

// HttpOnly: un XSS no se lleva la sesión, porque ningún script la lee.
// Secure: nunca viaja en claro (los navegadores tratan localhost como seguro,
//   así que esto no estorba en desarrollo).
// SameSite=Strict: es TODA la defensa contra CSRF de este panel — un POST
//   desde otro sitio simplemente no lleva la cookie. Se puede usar Strict, y
//   no el Lax de siempre, porque coordinator.html es estático y no necesita
//   la sesión para cargar: la ocupa después, en peticiones del mismo origen.
export function serializeSessionCookie(value, { maxAgeSec }) {
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearedSessionCookie() {
  return serializeSessionCookie('', { maxAgeSec: 0 });
}

export function readSessionCookie(header) {
  if (typeof header !== 'string' || !header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    // Comparación por nombre exacto: un `includes` aceptaría
    // "evil_nc_session" como si fuera la nuestra.
    if (part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    return part.slice(eq + 1).trim() || null;
  }
  return null;
}
