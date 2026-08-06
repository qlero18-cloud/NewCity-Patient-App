# Fase 05 — Pantallas del paciente

**Depende de:** fases 01 a 04.
**Entrega:** las siete pantallas del v1 sobre el núcleo ya probado.

## Alcance

La UI **no contiene reglas de negocio**. Todo lo que decide qué mostrar ya está en `src/domain/`. Esta fase solo lee de ahí y pinta.

Queda fuera: el render del QPASS (fase 06) y el panel de coordinadores (fase 08).

## Archivos que toca

```
app.html                    fuente única: contenido de la página
build.py                    envuelve app.html en index.html autocontenido
src/ui/app.js               enrutador y estado de pantalla
src/ui/i18n.js              cadenas es/en
src/ui/screens/home.js
src/ui/screens/itinerary.js
src/ui/screens/map.js
src/ui/screens/plaza.js
src/ui/screens/hours.js
src/ui/screens/stay.js
src/ui/screens/help.js
src/ui/components/          tarjeta, ficha, pestañas, distintivo
assets/                     logo y fotos optimizadas
```

## Estructura de navegación

Pestañas inferiores: **Inicio · Itinerario · Mapa · Plaza · Ayuda**.
Mi pase se abre desde Inicio e Itinerario. Horarios y Mi estancia cuelgan de Inicio y Plaza.

## Detalles por pantalla

**Inicio** — saludo con nombre de pila, fecha, tarjeta grande de "tu siguiente paso" con hora, lugar y botón directo al pase. Accesos rápidos a mapa, estancia y ayuda.

**Mi itinerario** — línea de tiempo agrupada por día con encabezados "Hoy · martes 10" / "Mañana · miércoles 11". Cada cita: hora, nombre del estudio, ubicación, estado. Las canceladas van tachadas y en gris. Las movidas llevan el distintivo "actualizado" según R5.

**Mapa y accesos** — el mapa de la fase 04 más la ruta paso a paso: lista numerada, avance paso por paso y resaltado sincronizado en el mapa.

**Plaza** — Farmer's Table y The Park Restaurante en Nivel 1, Boka dentro del Quartz, con filtro por tipo de comida. Amenidades en una segunda sección.

**Horarios** — Compass, Piso 27 y coordinación, con indicador "abierto ahora / cerrado" calculado con `now` inyectado, nunca con el reloj leído dentro de la vista.

**Mi estancia** — reservación de Quartz en texto grande con botón copiar, más desayuno y recovery si aplican. **Si la visita no tiene hospedaje, la pantalla y su acceso no existen** — no se muestra vacía.

**Ayuda** — botón de WhatsApp (`https://wa.me/<E164>`), botón de llamada (`tel:<E164>`) y horario de atención de coordinación.

## Criterios de aceptación

- [ ] Las siete pantallas se recorren en 375 × 812 sin scroll horizontal ni texto cortado
- [ ] Áreas tocables de al menos 44 × 44 px
- [ ] El toggle ES/EN cambia **todas** las cadenas de **todas** las pantallas; una prueba compara las llaves de `es` y `en` y falla si alguna falta
- [ ] El idioma inicial sale de `navigator.language` y la elección manual persiste en el dispositivo
- [ ] "Mi estancia" no aparece con `v_demo2`, que no tiene hospedaje
- [ ] Las citas canceladas de `v_demo2` salen tachadas y no aparecen como siguiente paso
- [ ] Toda hora en pantalla lleva la etiqueta de hora de Tijuana (INV-5)
- [ ] El botón copiar deja el código de reservación en el portapapeles y da retroalimentación visible
- [ ] Los enlaces de WhatsApp y `tel:` abren la app correspondiente en un teléfono real
- [ ] `v_expired` muestra la pantalla neutra, idéntica a la de un token inexistente (INV-3)
- [ ] El `<title>` no contiene nombre de paciente ni de estudio (INV-6)
- [ ] `noindex, nofollow` presente
- [ ] Cero peticiones a terceros: se comprueba mirando el panel de red con la app en uso
- [ ] Todo dato con `unconfirmed: true` aparece con el distintivo `[POR CONFIRMAR]`
- [ ] Correcta en tema claro y oscuro
- [ ] La UI no contiene lógica de fechas ni de selección: una revisión del diff confirma que solo llama a `src/domain/`

## Verificación

```bash
cd "newcity-patient-app" && python3 build.py && node --test test/ui/i18n.test.js
```

Después, recorrido guionado en el navegador integrado a 375 × 812, con captura de cada pantalla en los dos idiomas y en los dos temas, cargando `v_demo1`, `v_demo2` y `v_expired`.

> `app.html`/`index.html` necesitan `?p=…` (el nombre lo fija phase-07-e2e.md) para mostrar algo — sin eso ven la misma pantalla neutra que un token vencido (INV-3, a propósito). Abrirlos como `file://` directo descarta la query string en este entorno (quirk confirmado del navegador integrado, no del código): sírvelos con `python3 -m http.server` (o cualquier servidor estático) y navega a `http://localhost:<puerto>/newcity-patient-app/app.html?p=fixture-token-v-demo1&now=2026-03-10T10:00-07:00`. `now` es un escape hatch propio de este prototipo (D20 en DECISIONS.md): sin él, la hora real eventualmente deja cualquier fixture vencida.
