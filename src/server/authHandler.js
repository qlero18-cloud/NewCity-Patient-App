// Etapa C — login, logout y "¿quién soy?". Puro, igual que visitHandler:
// recibe un `Request` estándar más sus dependencias ya construidas y
// devuelve un `Response` estándar. netlify/functions/auth.mjs es el
// envoltorio que enchufa Blobs, la llave y el reloj, y no decide nada.
//
// La regla que ordena casi todo este archivo: los tres fallos de login
// —usuario inexistente, contraseña equivocada y cuenta bloqueada— tienen que
// salir por la MISMA línea, con el mismo código y el mismo cuerpo. Si
// difieren en cualquier cosa, el endpoint se vuelve un directorio de quién
// trabaja en coordinación, y de paso dice contra quién vale la pena insistir.

import {
  readSessionCookie,
  serializeSessionCookie,
  clearedSessionCookie,
  DEFAULT_TTL_MS,
} from './sessions.js';

export const LOGIN_PATH = '/api/auth/login';
export const LOGOUT_PATH = '/api/auth/logout';
export const SESSION_PATH = '/api/auth/session';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  // Ninguna respuesta de autenticación debe quedar en la caché del navegador
  // ni en la de ningún intermediario.
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

// Una sola función para los tres fallos, para que no puedan divergir sin que
// alguien la edite a propósito. Mismo criterio que el notFound() único de
// visitHandler (INV-3).
function invalidCredentials() {
  return json(401, { error: 'invalid_credentials' });
}

function unauthenticated() {
  return json(401, { error: 'unauthenticated' });
}

// Lo único de la cuenta que sale hacia el navegador. El resto —hash,
// intentos fallidos, hasta cuándo está bloqueada— se queda del lado del
// servidor.
function publicUser(account) {
  return { username: account.username, displayName: account.displayName };
}

// Solo firma y caducidad: cero red. Sirve donde alcanza con saber que la
// cookie es legítima.
export function readSession(request, signer, nowMs) {
  const value = readSessionCookie(request.headers.get('cookie'));
  if (!value) return null;
  return signer.verify(value, nowMs);
}

// Firma, caducidad Y que la cuenta siga existiendo. Esa última comprobación
// cuesta una lectura del almacén, y es lo que compra la revocación: una
// cookie firmada no se puede invalidar, así que sin esto, borrar la cuenta de
// alguien no surtiría efecto hasta que su sesión venciera sola —ocho horas
// después, que es justo cuando ya no sirve—. Se usa en las rutas que mutan,
// donde de todos modos venía una escritura y la lectura extra no se nota.
export async function requireCoordinator(request, { accounts, signer, nowMs }) {
  const claims = readSession(request, signer, nowMs);
  if (!claims) return { ok: false, response: unauthenticated() };

  const account = await accounts.getAccount(claims.sub);
  if (!account) return { ok: false, response: unauthenticated() };

  return { ok: true, account, claims };
}

async function handleLogin(request, { accounts, signer, nowMs }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'bad_request' });
  }

  // Que falten campos es un problema de FORMA, no de credenciales: contestar
  // 400 aquí no delata nada sobre ninguna cuenta, y contestar 401 haría
  // creer que el usuario existe y la contraseña falló.
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json(400, { error: 'bad_request' });
  }
  const { username, password } = body;
  if (typeof username !== 'string' || typeof password !== 'string') {
    return json(400, { error: 'bad_request' });
  }

  // No se acota el largo de la contraseña aquí a propósito: ya está acotado
  // donde importa. verifyPassword rechaza sin derivar nada arriba de
  // MAX_PASSWORD_LENGTH, y el camino del usuario inexistente recorta antes de
  // hashear. Repetir la cota aquí sería un segundo lugar que mantener, y el
  // día que los dos se desincronicen gana el más flojo.
  const result = await accounts.authenticate(username, password, nowMs);
  if (!result.ok) return invalidCredentials();

  const value = signer.sign({ sub: result.account.username }, nowMs);
  return json(
    200,
    { user: publicUser(result.account) },
    { 'set-cookie': serializeSessionCookie(value, { maxAgeSec: Math.floor(DEFAULT_TTL_MS / 1000) }) },
  );
}

function handleLogout() {
  // 204 siempre, con o sin sesión: salir es idempotente, y decir "no estabas
  // dentro" es información que no le sirve a nadie más que a quien prueba.
  return new Response(null, {
    status: 204,
    headers: { 'cache-control': 'no-store', 'set-cookie': clearedSessionCookie() },
  });
}

async function handleSession(request, deps) {
  const auth = await requireCoordinator(request, deps);
  if (!auth.ok) return auth.response;
  return json(200, { user: publicUser(auth.account) });
}

export async function handleAuthRequest(request, deps) {
  const { pathname } = new URL(request.url);

  try {
    // La ruta primero y el método después: así una ruta inexistente da 404
    // aunque venga con el verbo equivocado.
    if (pathname === LOGIN_PATH) {
      if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
      return await handleLogin(request, deps);
    }
    if (pathname === LOGOUT_PATH) {
      if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
      return handleLogout();
    }
    if (pathname === SESSION_PATH) {
      if (request.method !== 'GET') return json(405, { error: 'method_not_allowed' });
      return await handleSession(request, deps);
    }
    return json(404, { error: 'not_found' });
  } catch {
    // El detalle se queda del lado del servidor: un mensaje interno dice qué
    // almacén o qué variable falta, y eso no es asunto de quien pide.
    return json(500, { error: 'internal' });
  }
}
