# Fase 01 — Modelo de dominio y reglas puras

**Depende de:** nada. Es la primera fase.
**Entrega:** las reglas R1, R2, R3 y R5 del PRD como funciones puras, con pruebas que fallan primero.

## Alcance

Tipos y funciones puras. **Sin UI, sin red, sin DOM, sin reloj del sistema.** Todo lo que decide qué ve el paciente vive aquí y se comprueba en Node.

Queda fuera de esta fase: rutas (fase 02), datos de ejemplo completos (fase 03), cualquier pantalla.

## Archivos que toca

```
src/domain/time.js          formato y comparación en America/Tijuana
src/domain/expiry.js        R1
src/domain/nextStep.js      R2
src/domain/passes.js        R3
src/domain/itinerary.js     R5 — orden, agrupación por día, distintivo "actualizado"
src/domain/index.js         re-exporta la superficie pública

test/domain/expiry.test.js
test/domain/nextStep.test.js
test/domain/passes.test.js
test/domain/itinerary.test.js
test/domain/invariants.test.js
```

## Firmas públicas

```js
// expiry.js  — lodging puede ser null
computeExpiresAt(visit, appointments, lodging) -> ISO string
isExpired(visit, appointments, lodging, now) -> boolean

// nextStep.js
nextStep(appointments, now) -> Appointment | null

// passes.js
visiblePasses(passes, now) -> QPass[]        // filtradas y ordenadas

// itinerary.js
groupByDay(appointments, now) -> [{ dayKey, label: {es,en}, items: Appointment[] }]
isUpdated(appointment, lastViewedItineraryAt) -> boolean

// time.js
formatTimeTijuana(iso, lang) -> "9:00 AM"
formatDayLabel(iso, now, lang) -> { es: "Hoy · martes 10", en: "Today · Tuesday 10" }
```

## Criterios de aceptación

- [ ] **R1** — casos 1a a 1g del PRD §8, incluidos el checkout como parte del `max`, la estancia extendida (1f), la visita sin hospedaje (1g) y "todas las citas canceladas" (1e)
- [ ] **R2** — casos 2a a 2f, incluidos cita `in_progress` que gana sobre una futura, salto al día siguiente y desempate por `id`
- [ ] **R3** — casos 3a a 3e, con el orden `torre → piso27 → estacionamiento`. **`validUntil: null` significa que el pase no caduca**; el caso 3c falla si se trata `null` como fecha inválida o como cero
- [ ] **R5** — casos 5a a 5c, incluido dispositivo sin `lastViewedItineraryAt`
- [ ] **INV-1** — ninguna función de dominio llama a `Date.now()` ni a `new Date()` sin argumento. Se comprueba leyendo el texto de cada módulo de `src/domain/` y fallando si aparece alguno de los dos patrones
- [ ] **INV-2** — todos los módulos de dominio se importan y ejecutan en Node sin DOM. Se comprueba con una prueba que busca `document`, `window`, `fetch` y `localStorage` en el texto de los módulos
- [ ] **INV-5** — `formatTimeTijuana` produce la misma salida con `process.env.TZ` puesto en `America/New_York` y en `UTC`

## Verificación

```bash
cd "newcity-patient-app" && node --test 'test/domain/**/*.test.js'
```

> **Nota de tooling:** en este entorno (Node v24.14.1), `node --test test/domain/` con ruta de directorio explícita falla con `MODULE_NOT_FOUND` en vez de recorrer la carpeta — comportamiento confirmado empíricamente, no un error de configuración del proyecto. El patrón glob de arriba sí recorre la carpeta correctamente y es lo que usan `npm test` / `npm run test:domain`. `node --test` sin argumentos, corrido desde la raíz del proyecto, también funciona (descubrimiento por convención).

Y la prueba de zona horaria, que debe dar idéntico resultado en las tres corridas:

```bash
cd "newcity-patient-app" && for z in UTC America/New_York America/Tijuana; do echo "--- TZ=$z ---"; TZ=$z node --test 'test/domain/**/*.test.js'; done
```

## Nota para el escritor de pruebas

Las pruebas se escriben **antes** que la implementación y deben fallar por la razón correcta: función inexistente o resultado distinto al esperado, no por un error de sintaxis. Cada caso del PRD §8 se traduce a un `test()` con el nombre del caso (`"1c — mover la última cita recalcula expiresAt"`).
