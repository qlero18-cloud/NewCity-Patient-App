#!/usr/bin/env python3
"""Fase 05 / Etapa F — envuelve cada punto de entrada en un HTML
autocontenido: cero peticiones a terceros NI a otros archivos del proyecto
(criterio de aceptación "Cero peticiones a terceros" de la fase 05).

Dos destinos, misma maquinaria:

    app.html             + src/ui/app.js            -> index.html
    coordinator-app.html + src/ui/coordinatorApp.js -> coordinator.html

El segundo lo agregó la Etapa F (#10). Hasta entonces coordinator.html era
el archivo fuente tal cual, servido sin construir: ~30 peticiones para
pintar la primera pantalla, el árbol src/ obligado a publicarse para que el
panel arrancara, y una CSP que autorizaba por hash un <script> que solo
dice "importa esto" — el código real entraba por 'self', sin hash. Para la
pantalla donde se capturan los datos de un paciente, ninguna de las tres
cosas era defendible.

La CSP que hace cumplir todo esto vive en `_headers` desde la Etapa B.

Aplana el grafo de imports ESM del punto de entrada (y todo lo que importa
de forma transitiva: src/domain, src/data, src/map, src/ui, src/render) en
un solo <script> clásico sin `import`/`export`, concatenado en orden de
dependencias dentro de un único scope compartido, y convierte los assets
declarados por destino en data: URI. assets/plaza-map-background.jpg (D30)
no aparece en ningún <img> de app.html — vive como string dentro de
src/map/complexMap.js (MAP_BACKGROUND_SRC), que termina como texto plano
dentro del <script> ya aplanado; la sustitución por substring de abajo lo
encuentra igual, sin necesitar saber si el string vino del HTML original o
del bundle de JS. El bundle de coordinación no toca ninguno de los dos
assets: `complexMap.js` no está en su grafo.

Esto NO es un bundler general — es un transformador deliberadamente simple
que solo tiene que funcionar con el estilo de módulo que usa este
proyecto: import/export con nombre (nunca `export default`), una
declaración top-level por línea, sin reexportar con alias. Aplanar todo a
un solo scope significa que dos archivos no pueden declarar el mismo
nombre top-level — build.py lo detecta y falla fuerte listando los dos
archivos en conflicto, en vez de producir un bundle roto en silencio. El
scope es por destino: que `boot` exista en los dos grafos no es colisión.
"""

import re
import sys
import base64
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ICON = ROOT / 'assets' / 'newcity-icon-96.png'
MAP_BG = ROOT / 'assets' / 'plaza-map-background.jpg'

# Cada destino declara CUÁNTAS veces espera cada asset. Un número exacto y
# no "las que haya" porque el modo de fallo real es silencioso: alguien
# renombra el archivo, la sustitución no encuentra nada, y el bundle sale
# con una ruta relativa muerta que en producción es un ícono roto o un
# mapa sin fondo — verde en todas las pruebas de dominio.
TARGETS = (
    {
        'name': 'paciente',
        'entry': ROOT / 'src' / 'ui' / 'app.js',
        'src_html': ROOT / 'app.html',
        'out': ROOT / 'index.html',
        'assets': ((ICON, 'image/png', 1), (MAP_BG, 'image/jpeg', 1)),
    },
    {
        'name': 'coordinación',
        'entry': ROOT / 'src' / 'ui' / 'coordinatorApp.js',
        'src_html': ROOT / 'coordinator-app.html',
        'out': ROOT / 'coordinator.html',
        'assets': (),
    },
)

IMPORT_RE = re.compile(r"""^import\s+\{[^}]*\}\s+from\s+['"](\.[^'"]+)['"];?\s*$""", re.M)
REEXPORT_RE = re.compile(r"""^export\s+\{[^}]*\}\s+from\s+['"](\.[^'"]+)['"];?\s*$""", re.M)
EXPORT_KEYWORD_RE = re.compile(r"^export\s+(?=(?:async\s+)?(?:function|const|class)\b)", re.M)
TOPLEVEL_DECL_RE = re.compile(r"^(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)", re.M)


def resolve(from_file, spec):
    return (from_file.parent / spec).resolve()


def find_deps(path, text):
    deps = set()
    for m in IMPORT_RE.finditer(text):
        deps.add(resolve(path, m.group(1)))
    for m in REEXPORT_RE.finditer(text):
        deps.add(resolve(path, m.group(1)))
    return deps


def topo_sort(entry):
    order = []
    visiting = set()
    visited = set()

    def visit(path):
        if path in visited:
            return
        if path in visiting:
            raise SystemExit(f'build.py: import circular detectado en {path}')
        visiting.add(path)
        if not path.exists():
            raise SystemExit(f'build.py: {path} no existe (¿import roto?)')
        text = path.read_text(encoding='utf-8')
        for dep in sorted(find_deps(path, text)):
            visit(dep)
        visiting.discard(path)
        visited.add(path)
        order.append(path)

    visit(entry)
    return order


def strip_module_syntax(text):
    text = IMPORT_RE.sub('', text)
    text = REEXPORT_RE.sub('', text)
    text = EXPORT_KEYWORD_RE.sub('', text)
    return text


def flatten(entry):
    """Grafo de `entry` aplanado a un solo scope. Devuelve (bundle, archivos)."""
    files = topo_sort(entry)

    owner_of = {}
    chunks = []
    for f in files:
        raw = f.read_text(encoding='utf-8')
        stripped = strip_module_syntax(raw)
        for m in TOPLEVEL_DECL_RE.finditer(stripped):
            name = m.group(1)
            if name in owner_of and owner_of[name] != f:
                raise SystemExit(
                    f'build.py: colisión de nombre top-level "{name}" entre '
                    f'{owner_of[name].relative_to(ROOT)} y {f.relative_to(ROOT)}. '
                    'El bundler aplana todos los módulos a un solo scope — '
                    'renombra uno de los dos antes de volver a compilar.'
                )
            owner_of[name] = f
        rel = f.relative_to(ROOT)
        chunks.append(f'// --- {rel.as_posix()} ---\n{stripped.strip()}')

    return '\n\n'.join(chunks), files


def embed_asset(html, path, mime, expected, out_name):
    """Sustituye `assets/<archivo>` por su data: URI, exigiendo `expected` usos."""
    if not path.exists():
        raise SystemExit(f'build.py: falta {path}')
    ref = f'assets/{path.name}'
    found = html.count(ref)
    if found != expected:
        raise SystemExit(
            f'build.py [{out_name}]: se esperaban {expected} usos de "{ref}" en el bundle, '
            f'se encontraron {found}. Si el cambio es a propósito, actualiza TARGETS.'
        )
    b64 = base64.b64encode(path.read_bytes()).decode('ascii')
    # str.replace y no re.sub: base64 trae `+` y `/`, que en un patrón son
    # metacaracteres, y la sustitución evita tener que escapar nada.
    return html.replace(ref, f'data:{mime};base64,{b64}'), len(b64)


def render(target):
    """HTML final de un destino, sin escribir nada. Devuelve (html, resumen)."""
    out_name = target['out'].relative_to(ROOT).as_posix()
    bundle, files = flatten(target['entry'])
    # El HTML fuente llama boot() desde su propio <script type="module">,
    # fuera del módulo de entrada — se repite aquí porque ese script se
    # reemplaza entero.
    bundle += '\nboot(document.getElementById("app"));\n'

    html = target['src_html'].read_text(encoding='utf-8')
    new_html, n = re.subn(
        r'<script type="module">.*?</script>',
        '<script>\n(function () {\n' + bundle.replace('\\', '\\\\') + '\n})();\n</script>',
        html,
        flags=re.S,
    )
    if n != 1:
        raise SystemExit(
            f'build.py: no se encontró exactamente un <script type="module"> en '
            f'{target["src_html"].relative_to(ROOT)}'
        )

    embedded = []
    for path, mime, expected in target['assets']:
        new_html, n_b64 = embed_asset(new_html, path, mime, expected, out_name)
        embedded.append(f'{path.name} ({n_b64} chars base64)')

    # Red de seguridad: cualquier ruta a assets/ que quede es una petición a
    # otro archivo del proyecto, justo lo que este script existe para evitar.
    if 'assets/' in new_html:
        raise SystemExit(
            f'build.py [{out_name}]: quedó una ruta "assets/..." sin embeber. '
            'Agrégala a TARGETS o quítala del HTML.'
        )

    resumen = f'{len(files)} módulos aplanados'
    if embedded:
        resumen += ', embebido: ' + ' + '.join(embedded)
    return new_html, resumen


def inline_script_hash(html):
    """sha256 base64 del <script> en línea, tal como lo calcula el navegador."""
    # Los comentarios se quitan antes de buscar: una mención de
    # `<script type="module">` DENTRO de un comentario engancha primero y se
    # lleva prosa hasta el primer </script> real. Pasó de verdad con
    # coordinator.html y el resultado fue un hash que ningún navegador iba a
    # calcular — página en blanco en producción, verde en local.
    sin_comentarios = re.sub(r'<!--.*?-->', '', html, flags=re.S)
    inline = re.search(r'<script\b[^>]*>(.*?)</script>', sin_comentarios, flags=re.S).group(1)
    digest = base64.b64encode(hashlib.sha256(inline.encode('utf-8')).digest()).decode('ascii')
    return f"'sha256-{digest}'"


def build(check_only=False):
    # `--check` no escribe: compara y sale con código distinto de cero si un
    # empaquetado quedó atrás de src/. Existe porque ya pasó una vez: la
    # Etapa A cambió 18 archivos de src/ui y nadie reconstruyó, así que el
    # sitio publicado siguió sirviendo la versión anterior sin que nada
    # fallara. Un artefacto versionado que se genera a mano necesita algo
    # que grite cuando se desincroniza.
    if check_only:
        atrasados = []
        for target in TARGETS:
            out = target['out']
            new_html, _ = render(target)
            actual = out.read_text(encoding='utf-8') if out.exists() else ''
            rel = out.relative_to(ROOT)
            if actual == new_html:
                print(f'build.py --check: {rel} está al día con src/.')
            else:
                atrasados.append(
                    f'  {rel}: {len(actual)} chars versionados vs {len(new_html)} reconstruidos'
                )
        if atrasados:
            raise SystemExit(
                'build.py --check: hay empaquetados que NO corresponden a src/:\n'
                + '\n'.join(atrasados)
                + '\n  Corre `python3 build.py` y vuelve a commitear los HTML.'
            )
        return

    # Etapa B (#26) — el <script> que se escribe cambia en cada build, y la
    # CSP de _headers lo autoriza por hash. Si no coinciden, la página queda
    # EN BLANCO en producción y verde en local: `npm test` no sirve el sitio
    # y `python3 -m http.server` no manda encabezados.
    #
    # test/deploy/csp.test.js lo detecta, pero quien corre este script
    # merece enterarse aquí, con el valor listo para pegar.
    headers = (ROOT / '_headers').read_text(encoding='utf-8')
    faltantes = []
    for target in TARGETS:
        new_html, resumen = render(target)
        target['out'].write_text(new_html, encoding='utf-8')
        rel = target['out'].relative_to(ROOT)
        print(f'build.py: {rel} escrito — {resumen}.')

        esperado = inline_script_hash(new_html)
        if esperado in headers:
            print(f'build.py: hash del script de {rel} ya presente en _headers — {esperado}')
        else:
            faltantes.append(f'  {rel} -> {esperado}')

    if faltantes:
        print(
            'build.py: ATENCIÓN — _headers no trae el hash de este build.\n'
            '  Reemplaza en script-src el sha256 que corresponde a cada archivo:\n'
            + '\n'.join(faltantes),
            file=sys.stderr,
        )


if __name__ == '__main__':
    build(check_only='--check' in sys.argv[1:])
