# Fase 03 — Datos de ejemplo y contenido del complejo

**Depende de:** fases 01 y 02.
**Entrega:** visitas ficticias que ejercitan todos los casos límite, más el contenido estático del complejo.

## Alcance

Dos cosas distintas que conviene no mezclar:

1. **Fixtures de visita** — datos ficticios de paciente. Existen para el prototipo y para las pruebas. En el MVP los sustituye el panel de coordinadores.
2. **Contenido del complejo** — ubicaciones, restaurantes, amenidades y horarios. Es contenido real de NewCity y sobrevive al prototipo.

## Archivos que toca

```
src/data/fixtures.js        visitas ficticias
src/data/locations.js       ubicaciones del complejo
src/data/plaza.js           restaurantes y amenidades
src/data/support.js         WhatsApp, Google Voice, horarios de coordinación
test/data/fixtures.test.js
```

## Visitas ficticias

| Id | Para qué sirve |
|---|---|
| `v_demo1` | La visita del PRD §8: dos días, cuatro citas, dos QPASS **sin caducidad**, hospedaje en Quartz con checkout el día 2. Es la que se usa para enseñar el prototipo |
| `v_demo2` | **Sin hospedaje**, un solo día, una cita cancelada y una movida. Ejercita "Mi estancia no aparece", la cita tachada, el distintivo "actualizado" y R1 sin checkout (caso 1g) |
| `v_longstay` | **Estancia extendida**: última cita el día 2, checkout el día 5. Ejercita el caso 1f de R1 y que el pase sin caducidad siga visible el último día |
| `v_expired` | Visita cuyo `expiresAt` ya pasó. Sirve para ver la pantalla neutra |
| `v_revoked` | Visita con un QPASS revocado y otro activo. Ejercita INV-4 y el caso 3b |

Nombres inventados, sin parecido con pacientes reales. El archivo abre con un comentario que lo dice de forma explícita.

## Contenido del complejo

Confirmado por el cliente:

- **Compass** — laboratorio e imagenología
- **Piso 27** — consultorios
- **Acceso general** — lobby de la Torre Médica
- **Nivel 1** — Farmer's Table y The Yard
- **Boka** — dentro del Hotel Quartz
- Estacionamiento, farmacia, tienda de conveniencia

Todo lo que el cliente aún no confirma (tipo de comida, horarios, amenidades, teléfonos, ubicación de la farmacia — PRD §15) lleva la bandera `unconfirmed: true`, que la UI convierte en el distintivo `[POR CONFIRMAR]`.

## Criterios de aceptación

- [ ] Cada caso límite del PRD §9 queda cubierto por al menos una fixture; una prueba lo verifica caso por caso
- [ ] `v_demo1` reproduce exactamente los datos del PRD §8, de modo que las pruebas de la fase 01 y el prototipo coinciden
- [ ] Todas las fechas llevan desplazamiento explícito; una prueba falla si encuentra una fecha sin zona
- [ ] Todo campo aún no confirmado por el cliente lleva `unconfirmed: true`
- [ ] Toda `locationId` referida por una cita existe en `locations.js`
- [ ] Todo `mapPointId` referido existe en la lista de identificadores del mapa
- [ ] Los datos de paciente son ficticios y el archivo lo declara

## Verificación

```bash
cd "newcity-patient-app" && node --test 'test/data/**/*.test.js' 'test/domain/**/*.test.js'
```

> Mismo ajuste de tooling que fase 01 (ver nota en phase-01-domain-model.md): rutas de directorio explícitas fallan con `MODULE_NOT_FOUND` en este Node, así que se usa el patrón glob.

Las pruebas de dominio deben seguir pasando con las fixtures reales, no solo con datos inventados dentro de cada prueba.
