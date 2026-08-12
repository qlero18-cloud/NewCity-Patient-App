// Etapa J — el panel se adapta al ancho de la pantalla en que se usa.
//
// El bug es de medida, no de estilo. `.nc-main` sale de theme.js con
// `max-width: 480px`, que es la medida del TELÉFONO del paciente y la
// correcta para él; el panel de coordinación se ve en la computadora del
// escritorio, y hereda la misma regla. Medido en el navegador antes de
// tocar nada, a 1280px de ancho: el expediente queda en una columna de
// 480px con 800px en blanco a los lados, y la tabla de revisión de la
// importación pide 618px dentro de un contenedor de 448px, así que se
// desplaza en horizontal enseñando cuatro letras por campo ("BLOC",
// "Médi") con la columna de notas fuera de pantalla.
//
// Se prueba por substring sobre las constantes *_CSS exportadas, no
// montando DOM: D8 (este proyecto no trae DOM falso para node:test). Lo
// que ninguna aserción de cadena puede demostrar —que a 390/768/1280 se
// VEA bien— se revisa en el navegador, y por eso el reporte de esta etapa
// trae las capturas.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { LAYOUT_CSS, COORDINATOR_CSS } from '../../../src/ui/coordinatorApp.js';
import { THEME_CSS } from '../../../src/ui/theme.js';
import { VISITS_CSS } from '../../../src/ui/screens/coordinator/visits.js';
import { IMPORT_CSS } from '../../../src/ui/screens/coordinator/import.js';
import { INTAKE_CSS } from '../../../src/ui/screens/coordinator/intake.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '../../../src/ui');

// Devuelve los bloques @media (min-width: N) de una hoja: [{ min, cuerpo }].
// Cuenta llaves en vez de usar un regex perezoso porque adentro hay reglas
// con sus propias llaves y `[^}]*` cortaría en la primera.
function mediaBlocks(css) {
  const out = [];
  const re = /@media\s*\(min-width:\s*(\d+)px\s*\)\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    let i = re.lastIndex;
    let nivel = 1;
    while (i < css.length && nivel > 0) {
      if (css[i] === '{') nivel += 1;
      else if (css[i] === '}') nivel -= 1;
      i += 1;
    }
    out.push({ min: Number(m[1]), cuerpo: css.slice(re.lastIndex, i - 1) });
  }
  return out;
}

// El valor de `prop` dentro de la primera regla cuyo selector contenga
// `selector`. Devuelve null si esa regla no existe.
function declaracion(css, selector, prop) {
  for (const bloque of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!bloque[1].includes(selector)) continue;
    const v = new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`).exec(bloque[2]);
    if (v) return v[1].trim();
  }
  return null;
}

describe('Etapa J — ancho útil del panel', () => {
  test('en pantalla grande el panel deja de ser una columna de teléfono', () => {
    const anchos = mediaBlocks(LAYOUT_CSS)
      .map((b) => ({ min: b.min, max: declaracion(b.cuerpo, '.nc-main', 'max-width') }))
      .filter((x) => x.max)
      .map((x) => ({ min: x.min, max: Number.parseInt(x.max, 10) }));

    assert.ok(
      anchos.length >= 1,
      'LAYOUT_CSS no ensancha .nc-main en ninguna media query: el panel se queda en los 480px del teléfono aunque la pantalla mida 1280'
    );
    for (const a of anchos) {
      assert.ok(
        a.max > 480,
        `a partir de ${a.min}px el panel sigue en ${a.max}px, que no es más que la columna de teléfono de theme.js`
      );
    }
    // La tabla de revisión pide ~1050px con sus seis columnas legibles. Sin
    // un escalón que llegue hasta ahí, la importación —lo que de verdad
    // duele— seguiría desplazándose en horizontal en una laptop.
    assert.ok(
      Math.max(...anchos.map((a) => a.max)) >= 1000,
      `el escalón más ancho es de ${Math.max(...anchos.map((a) => a.max))}px; la tabla de revisión necesita ~1050px para no desplazarse en una laptop`
    );
  });

  test('los escalones van de menor a mayor y ninguno arranca antes de una tablet', () => {
    const mins = mediaBlocks(LAYOUT_CSS).map((b) => b.min);
    assert.ok(mins.length >= 2, `esperaba al menos dos escalones (tablet y escritorio), hay ${mins.length}`);
    assert.deepStrictEqual([...mins].sort((a, b) => a - b), mins, 'los @media no están en orden creciente: el escalón chico pisaría al grande');
    assert.ok(Math.min(...mins) >= 600, `el primer escalón arranca en ${Math.min(...mins)}px, dentro del rango de un teléfono`);
  });

  test('LAYOUT_CSS entra al bundle del panel DESPUÉS de theme.js, o no gana', () => {
    assert.ok(COORDINATOR_CSS.includes(LAYOUT_CSS), 'LAYOUT_CSS no está en el bundle del panel: no lo vería nadie');
    assert.ok(
      COORDINATOR_CSS.indexOf(LAYOUT_CSS) > COORDINATOR_CSS.indexOf(THEME_CSS),
      'LAYOUT_CSS va antes que THEME_CSS: a igual especificidad gana la última, así que el max-width de 480px se impondría'
    );
    assert.ok(
      COORDINATOR_CSS.indexOf(LAYOUT_CSS) > COORDINATOR_CSS.indexOf(IMPORT_CSS),
      'LAYOUT_CSS debe ir al final del bundle para poder ajustar lo que declaran las pantallas'
    );
  });

  test('la columna del PACIENTE se queda intacta: su app sí es un teléfono', () => {
    assert.match(
      THEME_CSS,
      /\.nc-main\s*\{[^}]*max-width:\s*480px/,
      'theme.js ya no fija la columna de 480px; theme.js lo comparten los dos bundles y el del paciente debe seguir siendo de teléfono'
    );
    // Solo los `import`, no la prosa: app.js menciona coordinatorApp.js en un
    // comentario (el permiso de leer el reloj real, D20) y eso es documentación
    // válida, no una dependencia.
    const imports = readFileSync(path.join(SRC, 'app.js'), 'utf8')
      .split('\n')
      .filter((l) => /^\s*import\b/.test(l))
      .join('\n');
    assert.doesNotMatch(
      imports,
      /LAYOUT_CSS|coordinatorApp/,
      'la app del paciente importó algo del panel: ensancharía su columna de teléfono sin que nadie lo pidiera'
    );
  });
});

describe('Etapa J — el encabezado en un teléfono', () => {
  test('el encabezado se acomoda en varios renglones en vez de empujar los botones fuera', () => {
    assert.ok(
      /\.nc-header[^{]*\{[^}]*flex-wrap:\s*wrap/.test(LAYOUT_CSS),
      'el encabezado del panel no envuelve: con nombre + volver + idioma + salir, a 390px el último botón se sale'
    );
  });

  test('el nombre largo de una coordinadora se recorta, no desplaza el encabezado', () => {
    assert.strictEqual(
      declaracion(LAYOUT_CSS, '.nc-coord-user', 'text-overflow'),
      'ellipsis',
      '.nc-coord-user es white-space: nowrap; sin recorte, un nombre largo empuja los botones fuera de la pantalla'
    );
  });
});

describe('Etapa J — la tabla de revisión de la importación', () => {
  const MINIMOS = [...IMPORT_CSS.matchAll(/th:nth-child\((\d)\)\s*\{[^}]*min-width:\s*(\d+)px/g)]
    .map((m) => ({ col: Number(m[1]), min: Number(m[2]) }));

  test('cada una de las seis columnas reserva un ancho mínimo legible', () => {
    assert.deepStrictEqual(
      MINIMOS.map((x) => x.col),
      [1, 2, 3, 4, 5, 6],
      'faltan columnas con ancho mínimo: sin eso la tabla se comprime hasta dejar campos de 44px ("BLOC")'
    );
    for (const { col, min } of MINIMOS) {
      assert.ok(min >= 76, `la columna ${col} reserva ${min}px, menos que un campo numérico de dos dígitos`);
    }
  });

  test('las seis columnas caben en el escalón más ancho del panel, sin desplazamiento horizontal', () => {
    const suma = MINIMOS.reduce((a, x) => a + x.min, 0);
    // El padding sale del mismo bloque, no de una constante: si alguien sube
    // el padding lateral sin tocar las columnas, la tabla vuelve a
    // desplazarse y la cuenta tiene que enterarse.
    const escalones = mediaBlocks(LAYOUT_CSS)
      .map((b) => ({
        ancho: Number.parseInt(declaracion(b.cuerpo, '.nc-main', 'max-width') ?? '0', 10),
        padding: declaracion(b.cuerpo, '.nc-main', 'padding'),
      }))
      .sort((a, b) => a.ancho - b.ancho);
    const masAncho = escalones[escalones.length - 1];
    // padding shorthand: 1 valor = todos; 2 o más = el segundo es el lateral.
    const partes = (masAncho.padding ?? '16px').trim().split(/\s+/).map((v) => Number.parseInt(v, 10));
    const lateral = partes.length === 1 ? partes[0] : partes[1];
    // 12px de relleno por celda (padding: 6px de .nc-coord-import-cell).
    const disponible = masAncho.ancho - 2 * lateral - 6 * 12;
    assert.ok(
      suma <= disponible,
      `las columnas suman ${suma}px y en el panel más ancho caben ${disponible}px: la revisión seguiría desplazándose en horizontal en una laptop`
    );
  });

  test('la ficha del paciente no se estira a lo ancho de la pantalla', () => {
    const max = declaracion(IMPORT_CSS, '.nc-coord-import-patient', 'max-width');
    assert.ok(max, 'sin tope, el "Nombre de pila" mide 1100px en una laptop y se lee peor que en el teléfono');
  });
});

describe('Etapa J — las listas y los formularios aprovechan el ancho', () => {
  test('las tarjetas de visitas se acomodan en rejilla cuando hay ancho', () => {
    const conRejilla = mediaBlocks(VISITS_CSS).some((b) => declaracion(b.cuerpo, '.nc-visit-list', 'grid-template-columns'));
    assert.ok(conRejilla, 'la lista de visitas sigue en una sola columna: en una laptop son tres tarjetas y un metro de blanco');
  });

  test('el alta de visita no estira sus campos a lo ancho del panel', () => {
    const conTope = mediaBlocks(INTAKE_CSS).some((b) => declaracion(b.cuerpo, '.nc-form', 'max-width'));
    assert.ok(conTope, 'el formulario de alta no tiene tope de ancho: un campo de texto de 1100px es peor que uno de 480');
  });
});

describe('Etapa J — nada rompe el teléfono', () => {
  test('ninguna regla del panel fija un ancho mayor que la pantalla más angosta (320px)', () => {
    // Sin quitar la condición del @media, el `min-width: 1280px` de un
    // escalón contaría como un ancho fijo de regla y esta prueba fallaría
    // por lo contrario de lo que vigila: que EXISTAN escalones está bien.
    const soloReglas = COORDINATOR_CSS.replace(/@media[^{]*\{/g, '{');
    const anchos = [...soloReglas.matchAll(/(?<!max-)(?<![-a-z])(?:min-)?width:\s*(\d+)px/g)]
      .map((m) => Number(m[1]))
      .filter((n) => n > 320);
    assert.deepStrictEqual(anchos, [], `hay anchos fijos de ${anchos.join(', ')}px: en un iPhone SE eso desborda la pantalla`);
  });
});
