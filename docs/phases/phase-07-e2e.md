# Fase 07 — Recorrido completo y publicación del prototipo

> **Actualizado en la Etapa F.** El recorrido de `test/e2e/patient-journey.mjs` creció de 10 a **16 pasos**: los 10 originales del paciente sobre fixtures, y 6 nuevos del tramo coordinadora→paciente que no existía cuando se escribió esta fase — la coordinadora captura una visita real, se genera el enlace `/v/<token>`, ese enlace hace round-trip por `generateQrMatrix`/`decodeQrMatrix`, el paciente lo resuelve por red, sobrevive a quedarse sin señal, y al revocarse el pase deja de verse **también desde la caché** (INV-4). Donde este documento dice "diez pasos", léase dieciséis. El resto sigue vigente, incluida la prueba en hardware real, que sigue pendiente.

**Depende de:** fases 01 a 06.
**Entrega:** el prototipo probado de punta a punta y accesible desde un teléfono real por QR.

## Alcance

Cerrar el ciclo que vive el paciente: escanear el QR, ver su itinerario, seguir la ruta, mostrar el pase y pedir ayuda. Y dejarlo abierto en una URL que el cliente pueda enseñar internamente.

## Archivos que toca

```
test/e2e/patient-journey.mjs
qr-demo.png                 QR que apunta al prototipo publicado
README.md                   qué es, qué cubre, qué falta
```

## Recorrido que se prueba

1. Abrir la URL con `?p=<token de v_demo1>` — la app carga en el idioma del navegador
2. Inicio muestra el siguiente paso correcto para un `now` fijado
3. Tocar "cómo llegar" abre la ruta con el origen por defecto de R7
4. Avanzar los pasos de la ruta y ver el resaltado moverse en el mapa
5. Abrir el pase y comprobar que se dibuja el símbolo
6. Activar modo avión y volver a abrir el pase: sigue visible con el aviso
7. Cambiar a inglés y repetir el recorrido: ninguna cadena queda en español
8. Repetir con `v_demo2` — "Mi estancia" no existe, hay una cita tachada y una con "actualizado"
9. Abrir `v_expired` — pantalla neutra
10. Abrir un token inventado — **exactamente la misma pantalla** que el paso 9 (INV-3)

## Publicación

El prototipo se publica como página privada, autocontenida bajo CSP estricta: CSS, JavaScript, fuente Barlow e imágenes en línea o como data URI. Límite de 16 MB, así que las fotos van comprimidas a 200 KB o menos.

Con la URL se genera `qr-demo.png` para que el cliente lo escanee con su propio teléfono y viva el flujo real.

Los datos son ficticios (fase 03), así que publicar no expone información de nadie.

## Criterios de aceptación

- [ ] Los diez pasos del recorrido pasan
- [ ] El paso 10 produce una salida idéntica byte a byte a la del paso 9 (INV-3)
- [ ] La página pesa menos de 16 MB
- [ ] Cero peticiones a dominios externos; se comprueba en el panel de red
- [ ] La URL publicada carga en un teléfono real, iPhone y Android
- [ ] "Agregar a inicio" produce un ícono y un nombre correctos
- [ ] El QR de `qr-demo.png` abre el prototipo al escanearlo con la cámara
- [ ] El README lista lo que el prototipo **no** hace y los siete pendientes del PRD §15

## Verificación

```bash
cd "newcity-patient-app" && node --test 'test/domain/**/*.test.js' 'test/data/**/*.test.js' 'test/map/**/*.test.js' 'test/render/**/*.test.js' 'test/ui/**/*.test.js' && node test/e2e/patient-journey.mjs
```

> Mismo ajuste de tooling que las fases anteriores (ver nota en phase-01-domain-model.md): rutas de directorio fallan con `MODULE_NOT_FOUND` en este Node, así que se usa el patrón glob. `patient-journey.mjs` sí se corre tal cual (un solo archivo, no un directorio).

Más la comprobación en teléfono real, que no se puede automatizar aquí.
