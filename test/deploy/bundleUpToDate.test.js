// Etapa B — index.html versionado tiene que corresponder a src/.
//
// Esto no es hipotético: pasó. La Etapa A cambió 18 archivos de src/ui
// (incluido el catálogo de rutas de D41, que es lo que hace que el mapa
// dibuje estacionamiento→piso27) y nadie corrió `python3 build.py`. El
// commit quedó verde, la suite en 308/308, y el sitio publicado siguió
// sirviendo el bundle anterior. Ninguna prueba podía notarlo porque todas
// importan de src/, que sí estaba bien — el que estaba mal era el único
// archivo que ve el paciente.
//
// Con la CSP de la Etapa B el costo sube: `_headers` autoriza el script en
// línea de index.html por hash, así que un index.html viejo ya no es "una
// versión atrasada", es una página en blanco o un hash que ya no cuadra.
//
// El trabajo real lo hace `build.py --check`, que reconstruye en memoria y
// compara sin escribir nada. Aquí solo se ejecuta, para que corra con
// `npm test` y no dependa de que alguien se acuerde.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('index.html está al día con src/', () => {
  const run = spawnSync('python3', ['build.py', '--check'], { cwd: ROOT, encoding: 'utf8' });

  test('python3 está disponible (el proyecto ya lo exige: build.py y el server local)', () => {
    assert.equal(run.error, undefined, `no se pudo ejecutar python3: ${run.error?.message}`);
  });

  test('reconstruir el bundle no produce ningún cambio', () => {
    assert.equal(
      run.status,
      0,
      `${run.stdout ?? ''}${run.stderr ?? ''}\n` +
        'index.html quedó atrás de src/. Los cambios de src/ NO están publicados.'
    );
  });
});
