// Etapa E — guard de _redirects.
//
// La regla `/v/*` es la que hace que el enlace del QR exista. Sin ella,
// cada código que la coordinadora manda por WhatsApp abre un 404 en el
// teléfono del paciente — y eso no lo atrapa ninguna prueba de UI, ni el
// e2e, ni `python3 -m http.server`: solo falla en producción, en la mano
// de la persona que menos puede hacer algo al respecto. Mismo razonamiento
// que test/deploy/csp.test.js.
//
// 302 y no 200 a propósito. Un rewrite (200) deja la barra del navegador
// en /v/<token> y el token nunca llega a `?p=`: src/ui/app.js lee
// params.get('p') y encontraría null. El 302 cambia la URL de verdad.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REDIRECTS = readFileSync(path.join(__dirname, '../../_redirects'), 'utf8');

const reglas = REDIRECTS.split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => l.split(/\s+/));

describe('_redirects — el enlace del paciente', () => {
  test('existe una regla para /v/*', () => {
    const regla = reglas.find(([from]) => from === '/v/*');
    assert.ok(regla, `_redirects no trae ninguna regla /v/*; reglas actuales:\n  ${reglas.map((r) => r.join(' ')).join('\n  ')}`);
  });

  test('manda el token a ?p=, que es donde app.js lo busca', () => {
    const [, to] = reglas.find(([from]) => from === '/v/*');
    assert.strictEqual(to, '/?p=:splat', 'el destino debe pasar el splat como parámetro p');
  });

  test('es 302 y no 200: un rewrite dejaría el token fuera del query string', () => {
    const [, , status] = reglas.find(([from]) => from === '/v/*');
    assert.strictEqual(status, '302', 'con 200 la URL no cambia y params.get("p") sale null');
  });
});

describe('_redirects — lo que ya estaba sigue estando', () => {
  test('/demo sigue apuntando a la fixture con hora congelada', () => {
    const regla = reglas.find(([from]) => from === '/demo');
    assert.ok(regla, 'se perdió la regla /demo');
    assert.match(regla[1], /^\/\?p=fixture-token-/, 'el atajo /demo debe seguir abriendo una fixture, no una visita real');
  });

  test('ninguna regla manda a una fixture desde /v/: el token real no se sustituye', () => {
    for (const [from, to] of reglas) {
      if (from.startsWith('/v/')) {
        assert.doesNotMatch(to, /fixture-token-/, `${from} apunta a una fixture: eso serviría el itinerario de demo a un paciente real`);
      }
    }
  });
});
