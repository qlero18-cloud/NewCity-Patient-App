// Etapa F (#24) — ningún archivo importa lo que no usa.
//
// El barrido que cerró #24 encontró dos: `generateCode128Bars` en
// screens/pass.js (quedó de cuando la pantalla dibujaba las barras a mano,
// antes de que renderCode128Svg existiera) y `classNames` en
// components/badge.js. Ninguno de los dos rompía nada, y ninguno se iba a
// encontrar solo — este proyecto no tiene linter, a propósito (D2, cero
// dependencias), así que el chequeo tiene que vivir donde sí se corre.
//
// Dos razones para que importe más de lo que parece. Una: build.py aplana
// el archivo ENTERO de cada módulo del grafo, sin tree-shaking, y sigue el
// grafo por los imports — un import muerto puede meter un módulo completo
// al bundle publicado sin que nadie lo llame. Dos: un import es una
// declaración de qué necesita este archivo, y cuando miente, la siguiente
// persona que lea el encabezado para entender de qué depende la pantalla,
// se equivoca.
//
// El chequeo es deliberadamente conservador: cuenta como "uso" cualquier
// aparición del nombre en el resto del archivo, incluidos comentarios y
// cadenas. Prefiere dejar pasar un import muerto antes que fallar sobre
// uno vivo — una prueba estática que grita en falso se termina borrando.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

// readdirSync recursivo y no fs.globSync: globSync es de Node 22 y este
// archivo no tiene por qué ser el que suba el piso de versión del
// proyecto.
const bajo = (dir, ext) =>
  readdirSync(path.join(ROOT, dir), { recursive: true })
    .map((n) => path.join(dir, n))
    .filter((n) => n.endsWith(ext));

const archivos = [...bajo('src', '.js'), ...bajo('netlify', '.mjs')].sort();

// Nombres importados de una línea `import ... from '...'`.
// - `import { a, b as c }` -> a, c   (lo que se liga es el alias)
// - `import x`             -> x
// - `import * as ns`       -> ns
// - `import './efecto.js'` -> nada
function nombresLigados(clausula) {
  const nombres = [];
  const llaves = clausula.match(/\{([^}]*)\}/);
  if (llaves) {
    for (const bruto of llaves[1].split(',')) {
      const n = bruto.split(/\s+as\s+/).pop().trim();
      if (n) nombres.push(n);
    }
  }
  const sinLlaves = clausula.replace(/\{[^}]*\}/, '');
  const ns = sinLlaves.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
  if (ns) nombres.push(ns[1]);
  const porOmision = sinLlaves.match(/^\s*([A-Za-z_$][\w$]*)\s*,?/);
  if (porOmision && !ns) nombres.push(porOmision[1]);
  return nombres;
}

describe('imports muertos', () => {
  test('hay archivos que revisar (si no, esto pasaría en falso)', () => {
    assert.ok(archivos.length > 40, `solo encontré ${archivos.length} archivos: el glob se rompió`);
  });

  for (const rel of archivos) {
    test(rel, () => {
      const codigo = readFileSync(path.join(ROOT, rel), 'utf8');
      for (const m of codigo.matchAll(/^import\s+([^;'"]*?)\s*from\s*['"][^'"]+['"]/gm)) {
        const resto = codigo.slice(0, m.index) + codigo.slice(m.index + m[0].length);
        for (const nombre of nombresLigados(m[1])) {
          assert.match(
            resto,
            new RegExp(`\\b${nombre.replace(/\$/g, '\\$')}\\b`),
            `${rel} importa "${nombre}" y no lo usa en ningún lado`,
          );
        }
      }
    });
  }
});
