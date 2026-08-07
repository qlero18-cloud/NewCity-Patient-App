// Etapa B — token de visita. PRD §6.1 ("token aleatorio de 128 bits") y §7
// ("token  string  128 bits, base64url").
//
// Este módulo corre en los DOS lados sin ramas: en la Function que acuña el
// token (Node) y en el navegador que lo valida antes de pedirlo por red.
// Por eso usa `crypto.getRandomValues` y `btoa`, globales en Node ≥20 y en
// todo navegador con soporte, en vez de `node:crypto` o `Buffer`, que solo
// existen de un lado.
//
// La aleatoriedad se INYECTA, con la misma disciplina con la que `now` se
// inyecta en todo el dominio (INV-1). No es ceremonia: sin eso la única
// prueba posible sería mirar 22 caracteres al azar y confiar en que el
// codificado está bien. Con un generador determinista se fija el codificado
// contra un vector conocido, y aparte se prueba que el azar de verdad no
// repita.

export const TOKEN_BYTES = 16; // 128 bits
export const TOKEN_LENGTH = 22; // 16 bytes en base64url, sin los dos '=' de relleno

// El alfabeto de base64url (RFC 4648 §5): igual que base64 pero con '-' y
// '_' en vez de '+' y '/', para que el token viaje en una URL sin escapar.
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

function cryptoRandomBytes(n) {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

function base64url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function newToken(randomBytes = cryptoRandomBytes) {
  return base64url(randomBytes(TOKEN_BYTES));
}

// Filtro barato de forma, NO una comprobación de que el token exista: eso
// solo lo sabe el almacén. Sirve para que la Function descarte basura antes
// de tocar Blobs, y para que nunca se use un valor de la query string como
// llave sin revisarlo.
//
// A propósito NO valida que los últimos 2 bits sobrantes del carácter 22
// sean cero (lo son, porque 22×6 = 132 > 128). Eso ataría el validador a
// que el token mida exactamente 16 bytes para siempre; el largo y el
// alfabeto ya descartan todo lo que hay que descartar aquí.
export function isValidToken(value) {
  return typeof value === 'string' && TOKEN_RE.test(value);
}
