// Etapa F (#10) — los dos documentos que se publican tienen que bastarse
// solos.
//
// index.html lo cumplía desde la fase 05. coordinator.html no: era el
// archivo fuente tal cual, con `<script type="module">` importando
// ./src/ui/coordinatorApp.js, que a su vez importa otros ~30 módulos. Eso
// significaba tres cosas, y ninguna era aceptable para el panel donde se
// capturan datos de un paciente:
//
//   1. ~30 peticiones encadenadas para pintar la primera pantalla.
//   2. El árbol src/ TENÍA que publicarse para que el panel funcionara —
//      no por decisión, sino porque el HTML lo pedía.
//   3. La CSP autorizaba por hash un script que solo dice "importa esto",
//      así que el código real llegaba por 'self' sin hash que lo fije.
//
// El archivo fuente ahora se llama coordinator-app.html (simétrico con
// app.html → index.html) y build.py escribe el empaquetado.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

// Los dos empaquetados y su fuente, en pares. Lo que se publica es el
// primero; el segundo es lo que se edita y lo que se abre en local.
const BUNDLES = [
  { built: 'index.html', source: 'app.html', entry: 'src/ui/app.js' },
  { built: 'coordinator.html', source: 'coordinator-app.html', entry: 'src/ui/coordinatorApp.js' },
];

describe('cada punto de entrada tiene su par fuente/empaquetado', () => {
  for (const { built, source } of BUNDLES) {
    test(`${source} y ${built} existen`, () => {
      assert.ok(existsSync(path.join(ROOT, source)), `falta la fuente ${source}`);
      assert.ok(existsSync(path.join(ROOT, built)), `falta el empaquetado ${built} — corre \`python3 build.py\``);
    });
  }

  test('la fuente sí usa módulos ES (es como se desarrolla)', () => {
    for (const { source, entry } of BUNDLES) {
      const html = read(source);
      assert.match(html, /<script type="module">/, `${source} dejó de ser la fuente sin construir`);
      assert.ok(html.includes(entry), `${source} debería importar ./${entry}`);
    }
  });
});

describe('el empaquetado no pide nada más para funcionar', () => {
  for (const { built, entry } of BUNDLES) {
    describe(built, () => {
      const html = () => read(built);

      test('no queda ningún <script type="module">', () => {
        // Un módulo dispara peticiones por cada import y, con la CSP por
        // hash, ninguna de esas queda fijada.
        assert.doesNotMatch(html(), /type="module"/);
      });

      test('no referencia el árbol src/', () => {
        assert.ok(
          !html().includes('./src/') && !html().includes('"src/'),
          `${built} sigue pidiendo archivos de src/ — no está empaquetado`
        );
      });

      test('trae el código de su punto de entrada, aplanado', () => {
        // build.py escribe una línea `// --- ruta ---` antes de cada
        // módulo; sirve para leer el bundle y también para esto.
        assert.ok(html().includes(`// --- ${entry} ---`), `no aparece el módulo de entrada ${entry}`);
      });

      test('ningún <script src=> ni <link href=>: cero peticiones a archivos', () => {
        // El criterio literal de la fase 05 ("cero peticiones a terceros
        // NI a otros archivos del proyecto"), ahora exigido a los dos.
        assert.doesNotMatch(html(), /<script\b[^>]*\bsrc\s*=/);
        assert.doesNotMatch(html(), /<link\b[^>]*\bhref\s*=/);
      });

      test('no quedan rutas a assets/: lo que se usa va como data: URI', () => {
        assert.ok(!html().includes('assets/'), `${built} referencia assets/ sin embeber`);
      });

      test('exactamente un <script> en línea', () => {
        const scripts = [...html().replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b/g)];
        assert.equal(scripts.length, 1, 'el hash de la CSP se calcula sobre uno solo');
      });
    });
  }
});
