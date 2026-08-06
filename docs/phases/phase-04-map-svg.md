# Fase 04 — Mapa del complejo en SVG

**Depende de:** fases 02 y 03.
**Entrega:** el mapa esquemático como SVG en línea, con puntos tocables y resaltado por tramo de ruta.

## Alcance

Portar a SVG la geometría del esquema que ya existe para la presentación (`mapa.py` del generador del deck) y hacerla interactiva.

SVG en línea, no PNG: los puntos tienen que ser tocables, resaltables y escalables, y el archivo se publica bajo una CSP estricta.

**No es un plano a escala.** Es un esquema referencial, y así se etiqueta en pantalla, hasta que lleguen los planos oficiales (PRD §15.1).

## Archivos que toca

```
src/map/complexMap.js       genera el SVG y expone la lista de mapPointId
src/map/highlights.js       resalta un mapHighlightId
test/map/ids.test.js
```

## Puntos del mapa

| `mapPointId` | Qué es |
|---|---|
| `mp_parking` | Estacionamiento — acceso vehicular y valet |
| `mp_lobby` | Lobby Torre Médica — acceso general |
| `mp_compass` | Compass — laboratorio e imagenología |
| `mp_floor27` | Piso 27 — consultorios |
| `mp_quartz` | Quartz Hotel & Spa — hospedaje, recovery y Boka |
| `mp_level1` | Nivel 1 — Farmer's Table y The Park Restaurante |
| `mp_pharmacy` | Farmacia |

Cada punto: círculo tocable de al menos 44 × 44 px de área efectiva, con etiqueta. Al tocarlo se abre una ficha con nombre, qué hay ahí, horario y botón "cómo llegar".

## Criterios de aceptación

- [ ] Los siete puntos existen, son tocables y abren su ficha
- [ ] El área tocable es de al menos 44 × 44 px en un viewport de 375 px de ancho
- [ ] `highlightStep(mapHighlightId)` resalta el tramo correspondiente y quita el resaltado anterior
- [ ] Todo `mapHighlightId` que aparece en el catálogo de rutas de la fase 02 existe en el mapa; una prueba falla si sobra o falta alguno
- [ ] El SVG escala sin deformarse entre 320 y 768 px de ancho
- [ ] Legible en tema claro y oscuro
- [ ] Etiquetado visiblemente como esquema referencial
- [ ] Contraste de texto sobre fondo de al menos 4.5:1

## Verificación

```bash
cd "newcity-patient-app" && node --test test/map/ids.test.js
```

La prueba comprueba la correspondencia entre identificadores del mapa y del catálogo de rutas. Lo visual se revisa abriendo la página en el navegador integrado a 375 × 812 y tocando los siete puntos, uno por uno, más un recorrido completo de una ruta paso a paso comprobando que el resaltado avanza.
