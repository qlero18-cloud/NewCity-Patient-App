// Etapa B (#26) — La CSP, verificada contra los archivos que se publican.
//
// `README.md:41` afirma desde la fase 08 que el sitio tiene "CSP estricta".
// No era cierto: no existía `_headers`, ni `netlify.toml`, ni ningún
// `<meta http-equiv>` en el repo. Con la Etapa B entrando datos de salud por
// red, eso deja de ser un detalle de documentación.
//
// Este archivo no revisa que la política "se vea bien": deriva de los HTML
// que se publican los hashes que la política TIENE que traer, y falla si se
// separan. Sin esto, cualquier cambio de una línea en app.html o una
// recorrida de build.py dejaría la página en blanco en producción y verde en
// la suite — el peor modo de fallo posible para una CSP.
//
// Por qué hashes y no 'unsafe-inline': con datos clínicos en pantalla, el
// valor entero de la CSP está en que un script inyectado no corra. Un
// 'unsafe-inline' en script-src desactiva exactamente esa protección.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Los cuatro documentos que Netlify sirve: los dos empaquetados (build.py)
// y sus dos fuentes, que siguen siendo la forma de desarrollar (README).
// Desde la Etapa F (#10) los pares son app.html -> index.html y
// coordinator-app.html -> coordinator.html; antes el panel se publicaba sin
// construir y su <script> solo decía "importa esto", así que el hash de la
// CSP no cubría una sola línea del código que de verdad corría.
const HTML_FILES = ['index.html', 'app.html', 'coordinator.html', 'coordinator-app.html'];

function read(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

// Un <script> sin `src=` es un script en línea, y es lo único que la CSP
// puede autorizar por hash. Los que tienen `src=` los cubre 'self'.
//
// Se recorre el documento de izquierda a derecha en vez de aplicar una
// expresión regular al texto entero, porque las dos formas obvias fallan y
// cada una rompió producción:
//
//   Buscar <script> directo: el encabezado de coordinator.html contenía el
//   texto literal `<script type="module">` explicando su propia estructura.
//   La búsqueda enganchaba esa mención DENTRO del comentario y se llevaba
//   de corrido prosa, <title> y <body> hasta el primer </script> real.
//
//   Quitar los comentarios antes de buscar: arreglaba lo anterior y rompía
//   los bytes. Dentro de un <script> un `<!--` no abre un comentario — es
//   texto del script, y el navegador lo hashea. El bundle del panel trae
//   uno de 393 bytes dentro de una plantilla de JavaScript, así que el
//   guard hasheaba 254220 bytes y el navegador 254613: página en blanco en
//   producción con la suite en verde. Otra vez lo encontró el navegador y
//   no este archivo.
//
// El recorrido satisface a los dos: los comentarios se saltan solo mientras
// estamos FUERA de un script, y una vez dentro el rango se toma crudo. Es la
// regla del propio HTML — el contenido de <script> es texto en bruto.
function inlineScripts(html) {
  const bajo = html.toLowerCase();
  const out = [];
  let i = 0;

  while (i < html.length) {
    const script = bajo.indexOf('<script', i);
    if (script === -1) break;

    // Un comentario que empieza antes del <script> se salta entero: si lo
    // menciona por dentro, esa mención no cuenta.
    const comentario = bajo.indexOf('<!--', i);
    if (comentario !== -1 && comentario < script) {
      const fin = bajo.indexOf('-->', comentario + 4);
      i = fin === -1 ? html.length : fin + 3;
      continue;
    }

    const abre = html.indexOf('>', script);
    if (abre === -1) break;
    const cierra = bajo.indexOf('</script', abre + 1);
    if (cierra === -1) break;

    const attrs = html.slice(script + '<script'.length, abre);
    if (!/\bsrc\s*=/i.test(attrs)) out.push(html.slice(abre + 1, cierra));
    i = cierra + 1;
  }

  return out;
}

// El navegador hashea EXACTAMENTE los bytes entre `>` y `</script>`: ni
// recortados, ni normalizados. Un espacio de más y el script deja de correr.
function hashOf(source) {
  return `'sha256-${createHash('sha256').update(source, 'utf8').digest('base64')}'`;
}

function parseHeadersFile(text) {
  const blocks = new Map();
  let current = null;
  for (const raw of text.split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      current = raw.trim();
      blocks.set(current, new Map());
      continue;
    }
    const i = raw.indexOf(':');
    if (current && i > 0) {
      blocks.get(current).set(raw.slice(0, i).trim(), raw.slice(i + 1).trim());
    }
  }
  return blocks;
}

function directives(policy) {
  const out = new Map();
  for (const part of policy.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) out.set(name, values);
  }
  return out;
}

const HEADERS_PATH = path.join(ROOT, '_headers');

describe('_headers existe y cubre todo el sitio', () => {
  test('el archivo está en la raíz publicada', () => {
    assert.ok(
      existsSync(HEADERS_PATH),
      '`_headers` tiene que vivir en la raíz: netlify.toml publica "." y ahí lo busca Netlify'
    );
  });

  test('hay un bloque /* — una regla por ruta dejaría páginas sin política', () => {
    const blocks = parseHeadersFile(read('_headers'));
    assert.ok(blocks.has('/*'), `rutas declaradas: ${[...blocks.keys()].join(', ') || 'ninguna'}`);
  });
});

// Los dos modos de fallo de la extracción, enfrentados. Cada uno rompió
// producción de verdad, y arreglar uno a la brava reintroduce el otro:
//
//   1. Un `<script type="module">` MENCIONADO dentro de un comentario
//      engancha primero y se lleva de corrido prosa, <title> y <body> hasta
//      el primer </script> real.
//   2. Quitar los comentarios antes de buscar arregla (1) y rompe los bytes:
//      dentro de un <script> un `<!--` NO abre un comentario, es texto del
//      script. El navegador lo hashea; quien lo quita, no.
//
// La regla que satisface a los dos: recorrer el documento de izquierda a
// derecha saltando los comentarios que están FUERA de un script, y una vez
// dentro tomar el rango crudo sin tocarlo.
describe('inlineScripts — extracción, contra sus dos modos de fallo', () => {
  test('un <script> mencionado dentro de un comentario no se extrae ni arrastra al de verdad', () => {
    const html = [
      '<!-- el panel se publicaba con <script type="module"> y el hash no cubría nada -->',
      '<title>NewCity</title>',
      '<script>const a = 1;</script>',
    ].join('\n');
    assert.deepEqual(inlineScripts(html), ['const a = 1;']);
  });

  test('un comentario HTML DENTRO del script es texto del script, y va al hash', () => {
    // Este es el caso que dejó el panel en blanco: coordinator.html trae un
    // `<!-- ... -->` de 393 bytes dentro de una plantilla de JavaScript.
    const cuerpo = 'const t = `<input><!-- sin value, nunca --></input>`;';
    assert.deepEqual(inlineScripts(`<script>${cuerpo}</script>`), [cuerpo]);
  });

  test('los <script src=> los cubre \'self\', no un hash', () => {
    assert.deepEqual(inlineScripts('<script src="./x.js"></script><script>y()</script>'), ['y()']);
  });
});

describe('script-src — un hash por cada script en línea publicado', () => {
  const found = HTML_FILES.flatMap((f) => inlineScripts(read(f)).map((s) => ({ file: f, source: s })));

  test('lo extraído son los bytes literales del archivo, sin normalizar', () => {
    // El navegador hashea el rango crudo entre `>` y `</script>`. Cualquier
    // extracción que "limpie" el HTML antes de recortar produce un hash que
    // ningún navegador va a calcular nunca: suite en verde, página en blanco.
    //
    // Es el único test de este archivo que habría atrapado el fallo del
    // comentario dentro del script — los demás comparan el hash del guard
    // contra `_headers`, y ahí los dos lados venían de la MISMA extracción
    // equivocada, así que coincidían perfectamente entre ellos y con nada.
    for (const { file, source } of found) {
      assert.ok(
        read(file).includes(source),
        `lo extraído de ${file} no aparece tal cual en el archivo: la extracción normalizó bytes`
      );
    }
  });

  test('el guard tiene algo que revisar (si no, pasaría en falso)', () => {
    // Dos empaquetados + dos fuentes = 4. Si build.py deja de emitir uno, o
    // alguien externaliza otro, este número cambia y hay que mirar por qué
    // — no ajustarlo a ciegas.
    assert.equal(found.length, 4, `scripts en línea encontrados: ${found.map((s) => s.file).join(', ')}`);
  });

  test('lo extraído es JavaScript, no HTML que se coló', () => {
    // El bug real que hubo aquí: la búsqueda enganchó una mención de
    // `<script type="module">` dentro de un comentario de coordinator.html
    // y se llevó de corrido prosa, <title> y <body>. El hash resultante era
    // de un texto que ningún navegador iba a calcular nunca.
    // Las marcas son las que un derrame arrastra y el código legítimo no.
    // `<body` y `<div` NO sirven: el bundle de index.html los trae a
    // montones dentro de plantillas de JavaScript, que es exactamente lo
    // que hace la app.
    //
    // `-->` TAMPOCO sirve, y creerlo costó caro: se cayó de esta lista
    // porque el bundle del panel trae un `<!-- ... -->` legítimo dentro de
    // una plantilla de JavaScript. Mientras la extracción quitaba los
    // comentarios, ese `-->` desaparecía y el test parecía válido; era una
    // marca que solo se cumplía porque los bytes ya venían mutilados.
    // Quedan `<script` y `<title`, que sí aparecían en el derrame real y no
    // en ninguno de los scripts del proyecto.
    for (const { file, source } of found) {
      for (const marca of ['<script', '<title']) {
        assert.ok(
          !source.includes(marca),
          `el script "en línea" de ${file} contiene ${marca}: la extracción se salió del <script>`
        );
      }
    }
  });

  test('cada script en línea tiene su hash en la política', () => {
    const policy = parseHeadersFile(read('_headers')).get('/*').get('Content-Security-Policy');
    const scriptSrc = directives(policy).get('script-src') ?? [];

    for (const { file, source } of found) {
      const hash = hashOf(source);
      assert.ok(
        scriptSrc.includes(hash),
        `${file} cambió y su hash ya no está en la CSP. En producción ese script NO corre.\n` +
          `  Pega este valor en script-src de _headers: ${hash}`
      );
    }
  });

  test('no sobran hashes: uno viejo es un permiso que nadie usa', () => {
    const policy = parseHeadersFile(read('_headers')).get('/*').get('Content-Security-Policy');
    const hashes = (directives(policy).get('script-src') ?? []).filter((v) => v.startsWith("'sha256-"));
    const expected = found.map(({ source }) => hashOf(source));

    assert.deepEqual(
      hashes.slice().sort(),
      expected.slice().sort(),
      'sobra o falta un hash en script-src respecto a los HTML publicados'
    );
  });

  test("script-src no trae 'unsafe-inline' ni 'unsafe-eval'", () => {
    const policy = parseHeadersFile(read('_headers')).get('/*').get('Content-Security-Policy');
    const scriptSrc = directives(policy).get('script-src') ?? [];

    // Con hashes presentes el navegador IGNORA 'unsafe-inline', así que
    // ponerlo no rompería nada hoy — y por eso mismo se colaría sin que
    // nadie lo note, hasta el día que se quite el último hash.
    assert.ok(!scriptSrc.includes("'unsafe-inline'"), "script-src con 'unsafe-inline' anula la CSP");
    assert.ok(!scriptSrc.includes("'unsafe-eval'"), "script-src con 'unsafe-eval' anula la CSP");
  });
});

describe('el resto de la política', () => {
  const policy = () => parseHeadersFile(read('_headers')).get('/*').get('Content-Security-Policy');

  test("default-src y connect-src son 'self'", () => {
    const d = directives(policy());
    assert.deepEqual(d.get('default-src'), ["'self'"]);
    // La app del paciente pedirá /api/visit (Etapa D) y nada más. Fijarlo
    // ahora es lo que impide que un script inyectado se lleve el itinerario
    // a otro servidor.
    assert.deepEqual(d.get('connect-src'), ["'self'"]);
  });

  test('img-src permite data: — el build inlinea el ícono, el mapa y los QPASS', () => {
    const imgSrc = directives(policy()).get('img-src') ?? [];
    // build.py mete el PNG del ícono y el JPG del mapa como data URI, y
    // screens/pass.js pinta `<img src="${pass.payload}">` con el data URI
    // que subió la coordinadora (qpass.js:226, readAsDataURL).
    assert.ok(imgSrc.includes('data:'), 'sin data: no se ve ni el mapa ni el pase');
    assert.ok(imgSrc.includes("'self'"));
  });

  test("base-uri, object-src, frame-ancestors y form-action en 'none'", () => {
    const d = directives(policy());
    assert.deepEqual(d.get('base-uri'), ["'none'"], 'un <base> inyectado redirige todos los imports relativos');
    assert.deepEqual(d.get('object-src'), ["'none'"]);
    assert.deepEqual(d.get('frame-ancestors'), ["'none'"], 'nadie debe poder enmarcar el itinerario de un paciente');
    // Ningún <form> del proyecto envía: los seis los intercepta JS. Sin
    // esta directiva, un Enter suelto en un campo navega a la MISMA URL con
    // los campos en la query string — y en la app del paciente esa URL es
    // la que trae `?p=<token>`.
    assert.deepEqual(d.get('form-action'), ["'none'"]);
  });

  test("'unsafe-inline' solo aparece en style-src, y en ninguna otra directiva", () => {
    // El CSS se arma en tiempo de ejecución con document.createElement('style')
    // (app.js:51, coordinatorApp.js:62), concatenando las constantes de cada
    // pantalla: hashearlo obligaría a recalcular la política cada vez que
    // alguien toca un color. Es una excepción real y acotada, no la CSP
    // "estricta" que decía el README — por eso está escrita, no escondida.
    const conUnsafe = [...directives(policy())]
      .filter(([, values]) => values.includes("'unsafe-inline'"))
      .map(([name]) => name);
    assert.deepEqual(conUnsafe, ['style-src']);
  });

  test('la política no nombra ningún dominio externo', () => {
    // README:41 promete "sin peticiones a dominios externos". Esto lo
    // convierte en algo que falla si deja de ser cierto.
    assert.doesNotMatch(policy(), /https?:\/\//, `la CSP autoriza un origen externo: ${policy()}`);
  });
});

describe('encabezados que no son CSP pero protegen lo mismo', () => {
  const head = (name) => parseHeadersFile(read('_headers')).get('/*').get(name);

  test('Referrer-Policy: no-referrer — el token del paciente va en la URL', () => {
    // D01/D02: el enlace del QR es `/?p=<token>`. screens/help.js:19 abre
    // https://wa.me/... — sin esta política, el navegador manda
    // `Referer: https://…/?p=<token>` a whatsapp.com. El token es la
    // credencial completa de la visita.
    assert.equal(head('Referrer-Policy'), 'no-referrer');
  });

  test('X-Content-Type-Options: nosniff', () => {
    assert.equal(head('X-Content-Type-Options'), 'nosniff');
  });

  test('Permissions-Policy apaga cámara y micrófono', () => {
    // La app nunca escanea: el paciente MUESTRA el QR y lo escanea el
    // hospital. La subida del QPASS es un <input type="file"> sin capture.
    const pp = head('Permissions-Policy') ?? '';
    assert.match(pp, /camera=\(\)/);
    assert.match(pp, /microphone=\(\)/);
  });
});

describe('el código no contradice la política', () => {
  test("ningún <form> declara action=: form-action 'none' lo bloquearía", () => {
    const offenders = [];
    let forms = 0;
    for (const dir of ['src/ui/screens', 'src/ui/screens/coordinator']) {
      const full = path.join(ROOT, dir);
      for (const f of readdirSync(full).filter((n) => n.endsWith('.js'))) {
        for (const [m] of readFileSync(path.join(full, f), 'utf8').matchAll(/<form\b[^>]*>/g)) {
          forms += 1;
          if (/\baction\s*=/.test(m)) offenders.push(`${dir}/${f}: ${m}`);
        }
      }
    }
    assert.ok(forms >= 6, `esperaba encontrar los <form> del proyecto, encontré ${forms}`);
    assert.deepEqual(offenders, [], `estos <form> se enviarían de verdad:\n  ${offenders.join('\n  ')}`);
  });
});
