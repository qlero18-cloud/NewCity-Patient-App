#!/usr/bin/env python3
"""Fase 05 — envuelve app.html en index.html autocontenido: cero peticiones
a terceros NI a otros archivos del proyecto (CSP estricta — PRD, y el
propio criterio de aceptación "Cero peticiones a terceros" de esta fase).

Aplana el grafo de imports ESM de src/ui/app.js (y todo lo que importa de
forma transitiva: src/domain, src/data, src/map, src/ui) en un solo
<script> clásico sin `import`/`export`, concatenado en orden de
dependencias dentro de un único scope compartido, y convierte
assets/newcity-icon-96.png en un data: URI.

Esto NO es un bundler general — es un transformador deliberadamente simple
que solo tiene que funcionar con el estilo de módulo que usa este
proyecto: import/export con nombre (nunca `export default`), una
declaración top-level por línea, sin reexportar con alias. Aplanar todo a
un solo scope significa que dos archivos no pueden declarar el mismo
nombre top-level — build.py lo detecta y falla fuerte listando los dos
archivos en conflicto, en vez de producir un bundle roto en silencio.
"""

import re
import sys
import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENTRY = ROOT / 'src' / 'ui' / 'app.js'
APP_HTML = ROOT / 'app.html'
OUT = ROOT / 'index.html'
ICON = ROOT / 'assets' / 'newcity-icon-96.png'

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


def build():
    files = topo_sort(ENTRY)

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

    bundle = '\n\n'.join(chunks)
    # app.html llama boot() desde su propio <script type="module">, fuera
    # de app.js — se repite aquí porque ese script se reemplaza entero.
    bundle += '\nboot(document.getElementById("app"));\n'

    if not ICON.exists():
        raise SystemExit(f'build.py: falta {ICON} (ver src/ui/app.js, header)')
    icon_b64 = base64.b64encode(ICON.read_bytes()).decode('ascii')
    icon_data_uri = f'data:image/png;base64,{icon_b64}'

    html = APP_HTML.read_text(encoding='utf-8')
    new_html, n = re.subn(
        r'<script type="module">.*?</script>',
        '<script>\n(function () {\n' + bundle.replace('\\', '\\\\') + '\n})();\n</script>',
        html,
        flags=re.S,
    )
    if n != 1:
        raise SystemExit('build.py: no se encontró exactamente un <script type="module"> en app.html')
    new_html = new_html.replace('assets/newcity-icon-96.png', icon_data_uri)

    OUT.write_text(new_html, encoding='utf-8')
    print(f'build.py: {OUT.relative_to(ROOT)} escrito — {len(files)} módulos aplanados, ícono embebido ({len(icon_b64)} chars base64).')


if __name__ == '__main__':
    build()
