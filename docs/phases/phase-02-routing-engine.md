# Fase 02 — Motor de rutas

**Depende de:** fase 01.
**Entrega:** la regla R7 y la resolución de rutas origen→destino como funciones puras.

## Alcance

Dado un origen y un destino, devolver la secuencia de pasos redactados. Resolver el origen por defecto según la cita anterior y el hospedaje.

**No incluye** posicionamiento en vivo, ni geolocalización, ni sensores. La app nunca detecta dónde está parado el paciente: lo propone y él confirma. Ver PRD §6.3.

Tampoco incluye el dibujo del mapa: eso es la fase 04. Aquí solo se devuelve el `mapHighlightId` de cada paso.

## Archivos que toca

```
src/domain/routing.js
src/data/routes.js          catálogo de rutas redactadas, provisional
test/domain/routing.test.js
```

## Firmas públicas

```js
defaultOrigin(appointment, appointments, lodging) -> locationId | null
resolveRoute(fromLocationId, toLocationId, routes) -> Route | SameLocation | null

// SameLocation: { kind: "same_location", locationId }
```

## Catálogo provisional de rutas

Los pares mínimos que el v1 debe cubrir, en ambos sentidos donde aplique:

| Origen | Destino |
|---|---|
| Estacionamiento | Lobby Torre Médica |
| Estacionamiento | Compass |
| Lobby Torre Médica | Compass |
| Lobby Torre Médica | Piso 27 |
| Compass | Piso 27 |
| Compass | Nivel 1 (Farmer's Table / The Yard) |
| Piso 27 | Nivel 1 |
| Piso 27 | Farmacia |
| Quartz Hotel & Spa | Lobby Torre Médica |
| Lobby Torre Médica | Quartz Hotel & Spa |

Cada paso lleva texto en español e inglés y un `mapHighlightId`. **Todo el contenido de esta fase se marca `[POR CONFIRMAR]`** hasta que lleguen los planos oficiales y se haga el recorrido físico (PRD §15.1). El motor es definitivo; el texto de los pasos no.

## Criterios de aceptación

- [ ] **R7** — casos 7a a 7d del PRD §8
- [ ] 7c devuelve `SameLocation`, no una ruta vacía ni `null`
- [ ] 7d prefiere Quartz sobre estacionamiento cuando la visita tiene hospedaje y es la primera cita del día 2
- [ ] Un par sin ruta en el catálogo devuelve `null` y **no** lanza excepción
- [ ] Los pasos de una ruta salen ordenados por `order`, sin huecos ni repetidos
- [ ] Toda ruta del catálogo tiene texto en `es` y en `en`; una prueba falla si falta alguno
- [ ] Todo `mapHighlightId` del catálogo existe en la lista de identificadores que consumirá la fase 04
- [ ] INV-1 e INV-2 se mantienen

## Verificación

```bash
cd "newcity-patient-app" && node --test test/domain/routing.test.js
```
