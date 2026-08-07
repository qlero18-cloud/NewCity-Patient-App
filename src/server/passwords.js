// Etapa C — hasheo de contraseñas de coordinación. PBKDF2-HMAC-SHA256 de
// `node:crypto`, sin dependencias nuevas.
//
// A diferencia de src/domain/tokens.js, este módulo SÍ usa `node:crypto` y
// `Buffer`: aquel corre en los dos lados —Function y navegador— y por eso se
// limita a globales; este nunca sale del servidor. build.py sigue el grafo de
// imports desde src/ui/app.js y jamás llega hasta aquí, así que nada de esto
// termina dentro de index.html.
//
// El registro guardado tiene forma de PHC: `algoritmo$iteraciones$sal$llave`.
// Guardar las iteraciones DENTRO del registro es lo que permite subir el
// costo más adelante sin dejar fuera a las cuentas ya creadas: cada una se
// verifica con el número con el que se creó.
//
// Por qué PBKDF2 y no scrypt o Argon2id, que resisten mejor el ataque con
// hardware dedicado: Argon2 exige una dependencia nativa, y scrypt pide
// bastante memoria por intento —justo lo más escaso en una función
// serverless, donde además ese costo lo paga el endpoint de login y lo puede
// disparar cualquiera. PBKDF2 con 600 000 vueltas es lo que OWASP recomienda
// cuando las otras dos no están disponibles, y no lo están sin salir del
// runtime que ya tenemos.

import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2Async = promisify(pbkdf2);

export const ALGORITHM = 'pbkdf2-sha256';
export const DEFAULT_ITERATIONS = 600_000; // OWASP Password Storage Cheat Sheet, PBKDF2-HMAC-SHA256
export const SALT_BYTES = 16;
export const KEY_BYTES = 32;

// Sin reglas de composición. NIST SP 800-63B las retiró justamente porque
// empujan a "Coordinacion1!" —corta, adivinable y anotada en un post-it— y
// castigan la frase larga, que es lo que de verdad cuesta adivinar.
export const MIN_PASSWORD_LENGTH = 12;
// El tope tampoco es estético: PBKDF2 usa la contraseña como llave del HMAC,
// así que un campo sin límite es CPU gratis para quien mande diez megabytes
// al login.
export const MAX_PASSWORD_LENGTH = 200;

// Cota superior al leer un registro. Un registro editado a mano con
// 999 999 999 vueltas dejaría la Function girando hasta que la plataforma la
// mate, en cada intento.
const MAX_STORED_ITERATIONS = 10_000_000;

export function validatePassword(password) {
  if (typeof password !== 'string') return { ok: false, errors: { password: 'invalid' } };
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, errors: { password: 'tooShort' } };
  if (password.length > MAX_PASSWORD_LENGTH) return { ok: false, errors: { password: 'tooLong' } };
  return { ok: true, errors: {} };
}

export async function hashPassword(password, options = {}) {
  const { iterations = DEFAULT_ITERATIONS, salt = randomBytes(SALT_BYTES) } = options;
  const key = await pbkdf2Async(password, salt, iterations, KEY_BYTES, 'sha256');
  return [ALGORITHM, iterations, salt.toString('base64url'), key.toString('base64url')].join('$');
}

// Nunca lanza: cualquier registro que no entienda es un `false`. Un throw
// aquí sería un 500 en el login, y un 500 distinto del 401 le dice a quien
// prueba a ciegas que ESA cuenta existe y tiene el registro corrupto.
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  // Se rechaza antes de derivar nada: una contraseña que pasa del tope no
  // pudo haber creado ninguna cuenta, así que gastar CPU en confirmarlo solo
  // sirve para tumbar el endpoint.
  if (password.length > MAX_PASSWORD_LENGTH) return false;

  const parts = stored.split('$');
  if (parts.length !== 4) return false;

  const [algo, iterRaw, saltB64, keyB64] = parts;
  if (algo !== ALGORITHM) return false;
  if (!/^\d+$/.test(iterRaw)) return false;

  const iterations = Number(iterRaw);
  if (iterations < 1 || iterations > MAX_STORED_ITERATIONS) return false;

  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(keyB64, 'base64url');
  // El largo de la llave no viaja en el registro, así que es fijo. Exigirlo
  // también corta el registro recortado a un byte, donde acertar sería
  // cuestión de 256 intentos.
  if (salt.length === 0 || expected.length !== KEY_BYTES) return false;

  const actual = await pbkdf2Async(password, salt, iterations, KEY_BYTES, 'sha256');
  // Comparar con `===` filtraría, por el tiempo que tarda en salirse, cuántos
  // bytes iniciales van bien — suficiente para reconstruir el hash byte por
  // byte.
  return timingSafeEqual(actual, expected);
}
