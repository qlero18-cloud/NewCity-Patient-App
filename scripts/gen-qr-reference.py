#!/usr/bin/env python3
"""Regenera test/render/qrReference.fixture.js desde la implementación de referencia.

NO es parte de la aplicación y no corre en ninguna prueba: el fixture está
versionado y es lo que `npm test` consume. Esto existe para que ese fixture
sea REPRODUCIBLE — un archivo generado que nadie puede volver a generar se
convierte en un blob intocable, y entonces la comparación contra una segunda
implementación deja de ser verificación y pasa a ser superstición.

Referencia: nayuki/QR-Code-generator (MIT), la misma que verificó la fase 06.

    pip install qrcodegen
    python3 scripts/gen-qr-reference.py > test/render/qrReference.fixture.js

MODO BYTE A LA FUERZA. `QrSegment.make_segments()` elige el modo óptimo, y
para un texto de puras mayúsculas y dígitos elige ALFANUMÉRICO — otra
codificación, con otra matriz. src/render/qr.js solo emite modo byte, así
que un fixture con segmentos automáticos compararía peras con manzanas: eso
fue exactamente lo que pasó la primera vez que se generó este archivo, y el
caso "A"*42 falló hasta que se forzó `make_bytes`.

`mask=-1` deja que la referencia elija la máscara con su propia puntuación
de penalización, así la comparación cubre también esa elección y no solo el
trazado. `boostecl=False` impide que suba el nivel de corrección al
sobrar espacio, que es lo que hace por defecto.
"""

import json
import sys

try:
    import qrcodegen as q
except ImportError:  # pragma: no cover - camino de diagnóstico, no de prueba
    sys.exit("falta la referencia: pip install qrcodegen")

ENLACE = "https://nchpatient.netlify.app/v/AbCdEfGhIjKlMnOpQrStUv"

# (nombre, texto, versión esperada). La versión se fija a propósito en vez de
# dejar que la referencia la elija: si un caso deja de caber donde debía, se
# quiere un error acá y no un fixture que cambió de tamaño en silencio.
CASOS = [
    ("payload corto, el mismo de las pruebas de la fase 06", "payload-q1", 3),
    ("acentos, ñ y em dash: UTF-8 multibyte en v3", "María, José — ácido, ñoño", 3),
    ("v3 en el límite exacto de 42 bytes", "A" * 42, 3),
    ("el enlace de visita real, con token de 128 bits", ENLACE, 4),
    ("enlace con un token de puros caracteres base64url", "https://nchpatient.netlify.app/v/0123456789abcdefghij-_", 4),
    ("v4 en el límite exacto de 62 bytes", "x" * 62, 4),
    ("multibyte pesado cerca del tope de v4", "日本語" * 6 + "ñ", 4),
]


def matriz(texto, version):
    crudos = texto.encode("utf-8")
    segs = [q.QrSegment.make_bytes(crudos)]  # modo byte a la fuerza, ver el docstring
    qr = q.QrCode.encode_segments(
        segs, q.QrCode.Ecc.MEDIUM, minversion=version, maxversion=version, mask=-1, boostecl=False
    )
    filas = [
        "".join("1" if qr.get_module(c, r) else "0" for c in range(qr.get_size()))
        for r in range(qr.get_size())
    ]
    return qr, filas, len(crudos)


def main():
    salida = [
        "// GENERADO — no editar a mano. Ver scripts/gen-qr-reference.py.",
        "//",
        "// Matrices de nayuki/QR-Code-generator (MIT), la implementación de",
        "// referencia con la que se verificó la fase 06. Congeladas acá para que",
        "// esa verificación deje de ser un ejercicio de una sola vez y se vuelva",
        "// parte de `npm test`. Cada `modules` trae una cadena de '0'/'1' por fila.",
        "",
        "export const REFERENCIAS = [",
    ]
    for nombre, texto, version in CASOS:
        qr, filas, nbytes = matriz(texto, version)
        salida.append("  {")
        salida.append(f"    nombre: {json_str(nombre)},")
        salida.append(f"    texto: {json_str(texto)},")
        salida.append(f"    bytes: {nbytes},")
        salida.append(f"    version: {qr.get_version()},")
        salida.append(f"    size: {qr.get_size()},")
        salida.append(f"    mask: {qr.get_mask()},")
        salida.append("    modules: [")
        for fila in filas:
            salida.append(f"      '{fila}',")
        salida.append("    ],")
        salida.append("  },")
    salida.append("];")
    print("\n".join(salida))


def json_str(s):
    return json.dumps(s, ensure_ascii=False)


if __name__ == "__main__":
    main()
