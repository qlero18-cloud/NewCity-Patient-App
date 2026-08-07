// Etapa F (#18) — cada Function está montada donde el cliente la busca.
//
// El `config.path` de una Function y la constante que arma la URL en el
// navegador viven en archivos distintos, y en local NADA los junta: `npm
// test` no despliega, y `python3 -m http.server` no sirve Functions. Si se
// separan, todas las peticiones de ese cliente contestan 404 en producción
// con la suite entera en verde. Es el mismo modo de fallo que ya cubría
// test/ui/api.test.js para /api/visit — esto lo extiende a las tres.
//
// El barrido es por directorio y no por lista escrita a mano: una Function
// nueva sin `config` es exactamente el olvido que esto tiene que atrapar, y
// una lista fija no lo vería nunca.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { AUTH_BASE, COORDINATOR_BASE, VISIT_PATH } from '../../src/ui/api.js';
import { COORDINATOR_PREFIX } from '../../src/server/coordinatorHandler.js';
import { LOGIN_PATH, LOGOUT_PATH, SESSION_PATH } from '../../src/server/authHandler.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FUNCTIONS_DIR = path.join(ROOT, 'netlify', 'functions');

// `_kv.mjs` es un módulo compartido, no un endpoint: el guion bajo es la
// convención de Netlify para "esto no se despliega como Function".
const endpoints = readdirSync(FUNCTIONS_DIR)
  .filter((n) => n.endsWith('.mjs') && !n.startsWith('_'))
  .sort();

describe('netlify/functions — toda Function declara dónde vive', () => {
  test('hay Functions que revisar (si no, esto pasaría en falso)', () => {
    assert.deepEqual(endpoints, ['auth.mjs', 'coordinator.mjs', 'visit.mjs']);
  });

  for (const archivo of endpoints) {
    test(`${archivo} exporta config.path`, async () => {
      const mod = await import(path.join(FUNCTIONS_DIR, archivo));
      assert.ok(mod.config, `${archivo} sin export const config: Netlify la montaría en /.netlify/functions/${archivo.replace('.mjs', '')}`);
      assert.equal(typeof mod.config.path, 'string');
      assert.match(mod.config.path, /^\/api\//, 'todas las rutas del proyecto cuelgan de /api/');
    });

    test(`${archivo} exporta un handler por omisión`, async () => {
      const mod = await import(path.join(FUNCTIONS_DIR, archivo));
      assert.equal(typeof mod.default, 'function');
    });
  }
});

describe('la ruta declarada es la que el cliente pide', () => {
  // Un comodín (`/*`, `/:param`) cubre todo lo que cuelga del prefijo; lo
  // que se compara es el prefijo, no la cadena entera.
  const prefijo = (p) => p.replace(/\/(\*|:[^/]+)$/, '');

  test('/api/visit — el paciente', async () => {
    const { config } = await import(path.join(FUNCTIONS_DIR, 'visit.mjs'));
    assert.strictEqual(config.path, VISIT_PATH);
  });

  test('/api/coordinator/* — el panel', async () => {
    const { config } = await import(path.join(FUNCTIONS_DIR, 'coordinator.mjs'));
    assert.strictEqual(prefijo(config.path), COORDINATOR_BASE);
    // El handler recorta este mismo prefijo antes de rutear; si no
    // coincidiera, el ruteo interno vería rutas con /api/coordinator
    // pegado adelante y ninguna casaría.
    assert.strictEqual(COORDINATOR_PREFIX, COORDINATOR_BASE);
  });

  test('/api/auth/:action — el acceso de coordinación', async () => {
    const { config } = await import(path.join(FUNCTIONS_DIR, 'auth.mjs'));
    assert.strictEqual(prefijo(config.path), AUTH_BASE);
    // `:action` casa UN segmento y nada más. authHandler.js compara
    // pathnames completos, así que el día que alguien agregue algo como
    // /api/auth/session/refresh el handler lo atendería feliz en local y
    // Netlify ni siquiera le entregaría la petición.
    for (const p of [LOGIN_PATH, LOGOUT_PATH, SESSION_PATH]) {
      assert.ok(p.startsWith(`${AUTH_BASE}/`), `${p} debería colgar de ${AUTH_BASE}`);
      assert.match(
        p.slice(AUTH_BASE.length + 1),
        /^[a-z]+$/,
        `${p} tiene más de un segmento después de ${AUTH_BASE}: no cabe en :action`,
      );
    }
  });
});
