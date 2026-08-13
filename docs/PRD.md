# PRD — NewCity Hospital Patient App

**Versión:** 1.0 (borrador para revisión)
**Fecha:** 5 de agosto de 2026
**Fuente de requerimientos:** `Sugerencias App.pdf` + decisiones tomadas con el cliente el 5 de agosto de 2026

---

## 1. Problema

Un paciente de check-up llega a NewCity Medical Plaza sin saber dónde estacionarse, por qué acceso entrar, a qué hora es cada estudio, en qué piso, con qué pase entra al edificio ni dónde comer entre citas. Hoy todo eso vive en la cabeza y el WhatsApp de la coordinadora. El resultado: llamadas repetidas, pacientes perdidos en el complejo y una experiencia que no corresponde al nivel de las instalaciones.

Muchos pacientes cruzan desde San Diego, llegan por primera vez y no hablan español.

## 2. V1 en una línea

**El paciente escanea su QR y ve a dónde ir, a qué hora, con qué pase de acceso y cómo pedir ayuda — sin descargar nada.**

## 3. Objetivos

| # | Objetivo | Cómo se mide |
|---|---|---|
| O1 | El paciente sabe su siguiente paso sin preguntar | La pantalla de inicio responde "dónde, cuándo, con qué pase" en un vistazo |
| O2 | El paciente entra al complejo sin fricción | El QPASS se muestra listo para escanear, legible bajo cualquier luz |
| O3 | El paciente se mueve solo dentro del complejo | Ruta paso a paso desde donde está hasta su siguiente cita |
| O4 | Bajan las llamadas de logística a coordinación | Menos consultas de "dónde estoy / a qué hora / dónde como" |
| O5 | Cero fricción de instalación | Escanear y usar; nada de tiendas de aplicaciones |

## 4. No-objetivos del v1

Lo siguiente queda **explícitamente fuera** y no debe construirse ni insinuarse en la interfaz:

- Resultados de estudios y expediente clínico
- Pagos, cotizaciones y venta de paquetes — eso sigue por WhatsApp con la coordinadora
- Cuenta, contraseña e historial de visitas **del paciente** — el QR es el acceso y sirve solo para esa visita. (Las coordinadoras sí tienen cuenta desde la Etapa C; esto se refiere al lado del paciente, que sigue sin login.)
- Posicionamiento en vivo dentro del edificio (dónde está parado el paciente ahora). Ver §6.3
- Notificaciones push
- Multi-hospital / multi-sede

> **Construido después (Etapas A–F, 2026-08-07).** El panel de coordinadores estaba en esta lista como "se planea en `phases/phase-08`, se construye después del prototipo". Ya está construido y es lo que alimenta la app del paciente: `coordinator.html`, con cuentas propias, persistencia en Netlify Blobs y entrega del enlace por QR. Ver `README.md` y `docs/DECISIONS.md` D37 en adelante. El resto de esta lista sigue vigente sin cambios.

## 5. Usuarios

**Paciente (usuario principal).** Adulto, con frecuencia mayor de 40, muchas veces angustiado por el motivo de su visita, a veces sin datos móviles en México. Usa el teléfono con una mano, de pie, en un lobby. Puede no hablar español. **No va a instalar nada.**

**Coordinadora (usuario del panel).** Da de alta la visita, captura el itinerario, emite los QPASS y entrega el QR al paciente. Trabaja bajo presión y con varios pacientes a la vez.

---

## 6. Decisiones de producto y sus consecuencias

### 6.1 Identidad: un QR personal por visita

La coordinadora genera un enlace único por visita con un token aleatorio de 128 bits. El paciente escanea y ve su información sin escribir nada.

### 6.2 La app muestra información de salud

El cliente eligió que el itinerario muestre el **nombre del estudio** ("Mastografía · 10:00") y no solo la logística ("Compass · 10:00"). Eso convierte la pantalla en información de salud. La decisión está tomada; el diseño compensa donde sí se puede:

- Token de 128 bits, imposible de adivinar
- Solo HTTPS; `<meta name="robots" content="noindex, nofollow">`
- Caducidad a 24 h de la última cita (§ R1)
- **El título de la página nunca contiene nombres de estudio ni el nombre del paciente** — evita filtrarlos al historial del navegador y al conmutador de apps
- Sin analítica de terceros en ninguna pantalla que muestre itinerario
- `Cache-Control: no-store` en las respuestas con datos de la visita

### 6.3 "Paso a paso" significa rutas pre-escritas

Navegación indoor real requiere balizas o huella wifi: hardware, levantamiento y semanas de trabajo. El v1 entrega **rutas redactadas por par origen→destino**, con pasos numerados y resaltado del tramo correspondiente en el mapa. El paciente elige o confirma su origen; la app no lo detecta.

> **Bloqueo abierto:** el contenido real de esas rutas depende de los planos oficiales y de un recorrido físico del complejo. El prototipo lleva rutas provisionales marcadas `[POR CONFIRMAR]` en pantalla.

### 6.4 El QPASS es un código escaneable

Es un pase de acceso a las instalaciones que emite coordinación, en formato QR o código de barras. La app lo renderiza en pantalla para que una lectora lo lea. Implica: alto contraste, brillo elevado, pantalla que no se apaga, y **funcionar sin conexión** — el acceso puede estar en un sótano sin señal.

### 6.5 El QPASS no caduca por tiempo

El pase es de **estancia**, no de cita: el paciente lo usa muchas veces al día para entrar y salir de las instalaciones. Un pase que vence a media visita deja al paciente en la puerta, y ese es el peor fallo posible de esta app.

Por eso `validUntil` admite `null`, que significa **no caduca**. Un pase así solo deja de servir cuando coordinación lo revoca.

Dos consecuencias que hay que tener presentes:

- **La revocación deja de ser un detalle y pasa a ser el único control.** Un QR de acceso al edificio que nunca caduca y que nadie revoca sigue abriendo puertas meses después de que el paciente se fue. La recomendación operativa es revocar al cierre de la estancia; el panel de coordinadoras (fase 08) debe hacer eso fácil y evidente. Es una práctica de operación, no una caducidad técnica: la app respeta lo que diga `validUntil`.
- **Obliga a cambiar la caducidad del enlace.** Si el enlace muriera 24 h después de la última cita, un paciente que se queda más días perdería la pantalla donde vive su pase. Ver R1.

---

## 7. Modelo de datos

Todas las fechas son ISO 8601 **con desplazamiento explícito**. Nada de fechas sin zona.

```
Visit
  id                 string
  token              string   128 bits, base64url
  patientFirstName   string   solo nombre de pila; nunca apellido en pantalla
  lang               "es" | "en"
  startsAt           ISO
  endsAt             ISO
  expiresAt          ISO      derivado, ver R1
  status             "active" | "cancelled"

Appointment
  id                 string
  visitId            string
  startsAt           ISO
  durationMin        number
  serviceName        string   ej. "Resonancia magnética"  (dato de salud)
  locationId         string
  status             "scheduled" | "in_progress" | "done" | "cancelled"
  updatedAt          ISO

QPass
  id                 string
  visitId            string
  appointmentId      string | null   normalmente null: el pase es de estancia,
                                     no de una cita concreta
  format             "qr" | "code128"
  payload            string   lo que codifica el símbolo
  scope              "torre" | "piso27" | "estacionamiento"
  validFrom          ISO
  validUntil         ISO | null      null = no caduca por tiempo. Ver §6.5
  revokedAt          ISO | null      única forma de invalidar un pase sin caducidad
  issuedAt           ISO

Location
  id                 string
  name               { es, en }
  kind               "lab_imaging" | "consultorios" | "hospital" | "lobby"
                     | "parking" | "hotel" | "dining" | "pharmacy" | "amenity"
  floor              string          ej. "N1", "27"
  hours              OpeningHours
  mapPointId         string

Route
  id                 string
  fromLocationId     string
  toLocationId       string
  estimatedMinutes   number
  steps[]            { order, instruction: {es,en}, mapHighlightId }

Lodging
  visitId            string
  hotel              string          "Quartz Hotel & Spa"
  reservationCode    string
  checkIn            ISO
  checkOut           ISO
  breakfastIncluded  boolean
  recoveryRoom       boolean

Transfer                             traslado contratado (ida y/o vuelta)
  id                 string
  visitId            string
  kind               "arrival" | "departure" | "internal"
  scheduledAt        ISO             hora de RECOGIDA, no de llegada
  meetingPointId     string          catálogo propio, ver TransferPoint
  flightNumber       string          opcional
  driver             { name, phone } opcional: al chofer lo asignan la
                                     víspera. phone en E.164 con "+"
  vehicle            { type, make, model, color, plate }   opcional
  status             "scheduled" | "cancelled"     cancelado se muestra
                                     tachado, nunca desaparece
  notes              string          opcional
  createdAt/createdBy/updatedAt/updatedBy

TransferPoint                        punto de encuentro del traslado
  id                 string
  name               { es, en }
  unconfirmed        boolean         true = por confirmar con el cliente
```

`TransferPoint` es un catálogo **aparte** de `Location`: las ubicaciones del
complejo tienen `mapPointId` y alimentan el ruteo del mapa, y un aeropuerto o
una garita no están en ese mapa ni pueden estarlo.

```

PlazaVenue
  id                 string
  name               string
  type               "restaurant" | "amenity"
  cuisine[]          string[]        vacío si es amenidad
  level              string
  hours              OpeningHours
  mapPointId         string

SupportChannel
  whatsappNumber     E.164
  voiceNumber        E.164
  hours              OpeningHours

OpeningHours
  tz                 "America/Tijuana"
  weekly[]           { day: 0-6, open: "HH:mm", close: "HH:mm" }
  exceptions[]       { date: "YYYY-MM-DD", open?, close?, closed? }
```

### 7.1 Invariantes no negociables

| # | Invariante |
|---|---|
| **INV-1** | Ninguna función de dominio lee el reloj del sistema. `now` siempre se recibe como parámetro. |
| **INV-2** | Ninguna función de dominio toca `document`, `window`, `fetch` ni `localStorage`. |
| **INV-3** | Un token vencido, revocado o inexistente producen **exactamente la misma respuesta**. Nunca se revela que un enlace existió. |
| **INV-4** | Un QPASS revocado o fuera de su ventana nunca se renderiza, ni siquiera desde caché. |
| **INV-5** | Toda hora en pantalla se formatea en `America/Tijuana` y va etiquetada como tal. |
| **INV-6** | El `<title>` de la página y cualquier texto que llegue al historial del navegador jamás contienen nombre de paciente ni nombre de estudio. |

---

## 8. Reglas de dominio con ejemplos trabajados

Los ejemplos usan esta visita ficticia. Marzo de 2026 cae en horario de verano del Pacífico, así que el desplazamiento es **-07:00**.

```
Visit v_demo1 — paciente "María", lang: es

A1  2026-03-10T08:00-07:00  45 min  "Laboratorio"                 Compass (N1)
A2  2026-03-10T09:30-07:00  60 min  "Resonancia magnética"        Compass (N1)
A3  2026-03-10T12:00-07:00  30 min  "Consulta de Medicina Interna" Piso 27
A4  2026-03-11T09:00-07:00  30 min  "Consulta de Cardiología"      Piso 27

Q1  scope torre           qr       validFrom 2026-03-10T06:00-07:00  validUntil null
Q2  scope estacionamiento code128  validFrom 2026-03-10T06:00-07:00  validUntil null

Lodging  Quartz · QZ-8841-MX · desayuno incluido · sin habitación recovery
         checkIn  2026-03-10T15:00-07:00
         checkOut 2026-03-11T12:00-07:00
```

Los dos pases son de estancia y **no caducan** (§6.5): el paciente los usa muchas veces al día.

---

### R1 — Caducidad del enlace

```
expiresAt = max( última cita no cancelada ,
                 checkout del hospedaje ,
                 último traslado no cancelado ) + 24 h
```

Se recalcula cada vez que se agrega, mueve o cancela una cita, y cada vez que cambia el hospedaje o un traslado.

**El checkout entra en el cálculo por el QPASS.** El pase no caduca (§6.5), pero vive dentro de esta app: si el enlace muriera antes de que el paciente se vaya del complejo, se quedaría sin la pantalla que le abre las puertas. El enlace tiene que sobrevivir a la estancia completa, no solo a la última cita.

**El traslado de regreso entra por la misma razón, y es el caso más filoso de los tres.** Ocurre después de la última cita *y* después del checkout: sin él en el máximo, el enlace se apagaba justo mientras el paciente esperaba el coche en la banqueta, con el nombre del chofer y su teléfono adentro. Un traslado es un instante y no un intervalo —se captura la hora de recogida, no cuánto dura el trayecto—, así que cuenta su `scheduledAt` tal cual y las 24 h de gracia cubren el camino.

**Cálculo con los datos de arriba**
Última cita: A4 termina `2026-03-11T09:30-07:00`. Checkout: `2026-03-11T12:00-07:00`.
`max` = checkout → **`expiresAt = 2026-03-12T12:00-07:00`**

| # | Entrada (`now`) | Salida | Por qué |
|---|---|---|---|
| 1a | `2026-03-12T11:59-07:00` | La app carga normal | Falta un minuto para vencer |
| 1b | `2026-03-12T12:01-07:00` | Pantalla neutra: "Este enlace ya no está disponible. Escríbenos si necesitas ayuda." | Venció. Mismo texto que un token inexistente (INV-3) |
| 1c | A4 se mueve a `2026-03-12T09:00-07:00` (termina 09:30) | `expiresAt` pasa a `2026-03-13T09:30-07:00` | Ahora la cita es posterior al checkout y manda ella |
| 1d | A4 se cancela; la última no cancelada es A3 (termina `2026-03-10T12:30`) | `expiresAt = 2026-03-12T12:00-07:00`, **sin cambio** | El checkout sigue siendo posterior. Las canceladas no cuentan, pero el hospedaje sí |
| 1e | Todas las citas canceladas, sin hospedaje | `expiresAt = visit.startsAt + 24 h` | Caso degenerado: el enlace no queda vivo para siempre |
| 1f | **El paciente extiende su estancia**: checkout pasa a `2026-03-13T12:00-07:00` | `expiresAt = 2026-03-14T12:00-07:00` | Sigue necesitando el pase para entrar. Este es el caso que motivó incluir el checkout |
| 1g | Visita sin hospedaje, última cita A4 | `expiresAt = 2026-03-12T09:30-07:00` | Sin estancia, manda la última cita |
| 1h | **Traslado de regreso** a `2026-03-11T15:00-07:00` (posterior a la última cita y al checkout) | `expiresAt = 2026-03-12T15:00-07:00` | Manda el traslado. Sin esta línea el enlace moría a las 12:00 del día 12 y el paciente perdía el teléfono del chofer tres horas antes de que pasara por él |
| 1i | Ese mismo traslado se **cancela** | `expiresAt` vuelve a `2026-03-12T12:00-07:00` | Igual que las citas canceladas: no cuentan |

El traslado de regreso del ejemplo de §8 se recoge en el hotel **a la hora del checkout**, así que el `max` sigue siendo el checkout y el cálculo de arriba no se mueve.

---

### R2 — "Tu siguiente paso"

Si existe una cita `in_progress`, esa es el siguiente paso. Si no, la `scheduled` más próxima con `startsAt >= now`. Las `cancelled` y `done` nunca son candidatas.
**Desempate determinista:** ordenar por `startsAt`, luego `locationId`, luego `id`.

| # | Entrada (`now` + estados) | Salida | Por qué |
|---|---|---|---|
| 2a | `2026-03-10T09:00`, A1 `done` | **A2** — Resonancia magnética, 9:30, Compass | Es la siguiente `scheduled` |
| 2b | `2026-03-10T09:45`, A2 `in_progress` | **A2** | Una cita en curso gana sobre cualquier futura |
| 2c | `2026-03-10T13:00`, A1–A3 `done` | **A4** — mañana 9:00, Piso 27 | Salta al día siguiente; la tarjeta dice "Mañana" |
| 2d | `2026-03-11T09:35`, todas `done` | "Completaste tu itinerario." | Sin candidatas y el enlace aún vive |
| 2e | `2026-03-10T11:00`, A3 `cancelled` | **A4** | Una cancelada nunca es el siguiente paso |
| 2f | Dos citas exactamente a las `12:00`, ids `a_x` y `a_b` | **`a_b`** | Mismo `startsAt` y misma ubicación → gana el `id` menor |

---

### R3 — Qué QPASS se muestra

Visible si se cumplen las tres:

1. `now >= validFrom`
2. `validUntil == null` **o** `now <= validUntil`
3. `revokedAt == null`

Pueden convivir varios. Orden en pantalla: `torre` → `piso27` → `estacionamiento`.

**`validUntil == null` significa que el pase no caduca** (§6.5). Es el caso normal: el paciente lo usa muchas veces durante toda su estancia. La revocación es el único modo de invalidarlo.

| # | Entrada (`now`) | Salida | Por qué |
|---|---|---|---|
| 3a | `2026-03-10T07:00` | Dos pases: Q1 (torre) arriba, Q2 (estacionamiento) abajo | Los dos ya entraron en `validFrom` y ninguno caduca |
| 3b | Q1 revocado a las `12:00`; `now = 2026-03-10T12:00:01` | Solo Q2. Q1 desaparece también de la caché | INV-4. Es el único mecanismo que apaga un pase sin caducidad |
| 3c | `2026-03-11T23:00`, tercer día de estancia, ambos con `validUntil: null` | **Los dos siguen visibles** | No caducan. Antes este caso los apagaba: era el fallo que motivó §6.5 |
| 3d | `2026-03-10T05:59` | Ningún pase; se indica desde qué hora estará disponible | Aún no llega su `validFrom` |
| 3e | Un pase con `validUntil: 2026-03-10T23:59`; `now = 2026-03-11T00:01` | Ese pase no se muestra; los de `validUntil: null` sí | Si coordinación decide poner ventana a un pase concreto, se respeta |

---

### R4 — Actualización sin recargar

La pantalla activa consulta cada **30 s**, y de inmediato al volver a primer plano (`visibilitychange`).

| # | Entrada | Salida |
|---|---|---|
| 4a | Pantalla visible desde `10:58:00`; coordinación emite Q3 a las `11:00:05` | Q3 aparece a más tardar a las `11:00:35` |
| 4b | El paciente pone el teléfono en el bolsillo a las `11:05`, lo saca a las `11:40` | La app consulta al instante al volver, no espera los 30 s |

---

### R5 — Cita movida

Al cambiar `startsAt`, la línea de tiempo se reordena y la cita lleva un distintivo **"actualizado"**.
El distintivo se muestra si `appointment.updatedAt > lastViewedItineraryAt` (marca guardada en el dispositivo). Se apaga al ver la pantalla de itinerario.

| # | Entrada | Salida | Por qué |
|---|---|---|---|
| 5a | A3 pasa de `12:00` a `14:00`; `updatedAt = 11:10`; `lastViewedItineraryAt = 10:30` | A3 se muestra a las 14:00, después de A2, con "actualizado" | El cambio es posterior a la última vez que miró |
| 5b | El paciente abre el itinerario a las `11:12` y vuelve a las `11:20` | Sin distintivo | `lastViewedItineraryAt` quedó en `11:12`, ya posterior al cambio |
| 5c | Dispositivo nuevo, sin `lastViewedItineraryAt` | Sin distintivos | Sin referencia previa, no se inventa una |

---

### R6 — Zona horaria

Todo se formatea en `America/Tijuana` y se etiqueta. La zona del dispositivo se ignora por completo.

| # | Entrada | Salida | Por qué |
|---|---|---|---|
| 6a | Cita `2026-03-11T09:00-07:00`, teléfono en `America/New_York` | **"9:00 AM · hora de Tijuana"** | Nunca se convierte a la zona del dispositivo. Mostrar 12:00 PM haría que el paciente pierda su cita |
| 6b | Teléfono en `America/Los_Angeles` | **"9:00 AM · hora de Tijuana"** | Misma hora, pero la etiqueta se mantiene para que no haya duda |

---

### R7 — Origen por defecto de la ruta

Al abrir una cita, el origen propuesto es la ubicación de la cita anterior del mismo día. Si es la primera del día, el estacionamiento.

| # | Entrada | Salida | Por qué |
|---|---|---|---|
| 7a | Abre A1 (primera del día) | Origen **Estacionamiento** → destino Compass | Acaba de llegar en coche |
| 7b | Abre A3 (Piso 27); la anterior fue A2 en Compass | Origen **Compass** → destino Piso 27 | Viene de su estudio previo |
| 7c | Abre A2 (Compass); la anterior fue A1, también en Compass | "Ya estás en Compass" + opción de elegir otro origen | Origen y destino iguales: no se inventa una ruta |
| 7d | Abre A4 (primera del día 2) y hay hospedaje en Quartz | Origen **Quartz Hotel & Spa** | Durmió en el complejo; el estacionamiento no aplica |

---

## 9. Casos límite que la implementación debe demostrar

| Caso | Comportamiento esperado |
|---|---|
| Enlace abierto después de vencer | Pantalla neutra idéntica a token inexistente (INV-3) |
| QPASS revocado con la pantalla abierta | Desaparece en el siguiente ciclo de 30 s y se borra de la caché |
| Dos QPASS válidos a la vez | Ambos visibles, ordenados por `scope` |
| **QPASS sin caducidad** (`validUntil: null`) | Sigue visible todos los días de la estancia, sin importar cuánto se alargue |
| **Estancia más larga que la última cita** | El enlace vive hasta el checkout + 24 h, para que el pase siga alcanzable (R1, caso 1f) |
| Visita sin hospedaje | La sección "Mi estancia" **no aparece**; no se muestra vacía |
| Visita de varios días | Itinerario agrupado por día con encabezado "Hoy · martes 10" / "Mañana · miércoles 11" |
| Cita cancelada | Permanece en la línea de tiempo, tachada y en gris; excluida de "tu siguiente paso" |
| **Sin señal en el acceso** | El último QPASS válido sigue en pantalla desde caché, con aviso "sin conexión · guardado a las 10:42". Si ya venció o fue revocado, no se muestra (INV-4) |
| Teléfono en otra zona horaria | Todo en hora de Tijuana y etiquetado (R6) |
| Paciente que solo habla inglés | Detecta `navigator.language`; toggle ES/EN siempre visible en el encabezado |
| Contenido aún no confirmado por el cliente | Se muestra con distintivo `[POR CONFIRMAR]` para que se detecte en la revisión |

---

## 10. Pantallas del v1

| Pantalla | Módulo del PDF | Contenido |
|---|---|---|
| **Inicio** | — | Saludo con nombre de pila, fecha, tarjeta de "tu siguiente paso" (hora · lugar · botón al pase), accesos rápidos |
| **Mi itinerario** | Agenda e Itinerario | Línea de tiempo agrupada por día, con estado y distintivo "actualizado" |
| **Mi pase** | Agenda e Itinerario | QPASS a pantalla completa, brillo alto, pantalla activa, funciona sin conexión |
| **Mapa y accesos** | Mapa Dinámico y Accesos | Mapa SVG con puntos tocables; ruta paso a paso con resaltado por tramo |
| **Plaza** | Directorio y Servicios | Farmer's Table y The Park Restaurante (Nivel 1), Boka (dentro del Quartz), con filtro por tipo de comida; amenidades |
| **Horarios** | Horarios y Operaciones | Compass, Piso 27 y coordinación, con indicador "abierto ahora" |
| **Mi estancia** | Información de Hospedaje | Reservación Quartz con botón copiar; desayuno y recovery si aplican |
| **Ayuda** | Soporte y Contacto | WhatsApp (`wa.me`), llamada (`tel:`), horario de atención |

Navegación inferior de cinco pestañas: **Inicio · Itinerario · Mapa · Plaza · Ayuda**. Mi pase se abre desde Inicio e Itinerario. Horarios y Mi estancia cuelgan de Inicio y Plaza.

## 11. Marca

Navy `#1C2B53` · teal `#14BCC4` · blanco · tinte `#EEF3F8` · tipografía **Barlow**. Mismos tokens que la presentación de Experiencia Check-up. Logos ya extraídos del manual en `Presentacion Checkup/Recursos/Logos/`.

## 12. Terminología (bilingüe, tomada de los flyers oficiales)

| Español | English |
|---|---|
| check-up | check-up |
| Laboratorio | Laboratory testing |
| Estudios de imagen | Imaging studies |
| Consulta con especialista | Specialist consultation |
| Hospedaje | Lodging |
| Gastronomía | Dining |
| Pase de acceso (QPASS) | Access pass (QPASS) |
| Torre Médica | Medical Tower |

## 13. Nomenclatura del complejo (confirmada por el cliente)

| Punto | Qué es |
|---|---|
| **Compass** | Laboratorio e imagenología |
| **Piso 27** | Consultorios |
| **Acceso general** | Lobby de la Torre Médica |
| **Nivel 1** | Gastronomía: Farmer's Table y The Park Restaurante |
| **Boka** | Restaurante dentro del Hotel Quartz |

---

## 14. Criterios de aceptación

### Dominio
- [ ] R1 calcula `expiresAt` con la última cita **y el checkout**, y lo recalcula al mover, agregar, cancelar y al extender la estancia (casos 1a–1g)
- [ ] R2 elige el siguiente paso, incluyendo cita en curso, salto de día y desempate (2a–2f)
- [ ] R3 filtra y ordena los QPASS visibles, tratando `validUntil: null` como "no caduca" (3a–3e)
- [ ] R5 decide el distintivo "actualizado" a partir de `updatedAt` y `lastViewedItineraryAt` (5a–5c)
- [ ] R7 resuelve el origen por defecto, incluido origen igual a destino y noche en Quartz (7a–7d)
- [ ] INV-1: ninguna función de dominio llama a `Date.now()` ni a `new Date()` sin argumento — verificado con una prueba que rastrea el módulo
- [ ] INV-2: los módulos de dominio se importan y ejecutan en Node sin DOM

### Experiencia
- [ ] Las 7 pantallas se recorren en un viewport de 375 × 812 sin scroll horizontal ni texto cortado
- [ ] Áreas tocables de al menos 44 × 44 px
- [ ] El toggle ES/EN cambia todas las cadenas de todas las pantallas
- [ ] El QPASS se lee con una lectora real desde la pantalla del teléfono
- [ ] Con el modo avión activado, el último pase válido sigue visible con su aviso
- [ ] Un pase con `validUntil: null` sigue visible el último día de una estancia extendida
- [ ] "Mi estancia" no aparece en una visita sin hospedaje
- [ ] Todas las horas llevan la etiqueta de hora de Tijuana

### Privacidad
- [ ] El `<title>` no contiene nombre de paciente ni de estudio (INV-6)
- [ ] Un token vencido y uno inexistente devuelven exactamente la misma pantalla (INV-3)
- [ ] `noindex, nofollow` presente en todas las pantallas
- [ ] Sin peticiones a terceros desde las pantallas con itinerario

### Contenido
- [ ] Todo dato aún no confirmado por el cliente aparece marcado `[POR CONFIRMAR]`

---

## 15. Información pendiente del cliente

1. **Planos oficiales del complejo** — bloqueo principal para las rutas paso a paso. Parcialmente resuelto en fase 07: el cliente aportó `directorio-plaza-exterior.pdf` (directorio de señalética de la plaza), que sí da distribución espacial real de Nivel Calle y Nivel Plaza — pero no cubre el interior de la Torre Médica piso por piso (Piso 27 no aparece ahí), así que las rutas siguen siendo un esquema referencial, no un plano a escala completo
2. **Tipo de comida y horarios** de Farmer's Table, The Park Restaurante y Boka. ¿Hay algo más en el Nivel 1?
3. ~~**Amenidades** — cajeros, sanitarios~~ Resuelto en fase 07 para cajeros, sanitarios, elevador, escaleras eléctricas, rampa para discapacitados, pago de estacionamiento, valet y emergencias (`directorio-plaza-exterior.pdf`). ~~El **nombre de la red wifi**~~ llegó en la Etapa K (`Informacion_General.pdf`): son tres redes, en `src/data/wifi.js` (D98). Siguen sin confirmar las **zonas pet-friendly**
4. ~~**Horarios** de Compass, Piso 27 y del equipo de coordinación~~ Resuelto **en parte** en la Etapa K (`Informacion_General.pdf`): coordinación L–V 08:00–18:00 y sábado 08:00–13:30; Compass L–S 06:00–20:00; los dos cerrados en domingo (D96). **El Piso 27 y los otros seis pisos de consultorios siguen pendientes** — ese documento no los cubre y conservan su horario de relleno con [POR CONFIRMAR] a la vista del paciente
5. ~~**Teléfonos** — cuál número es WhatsApp y cuál Google Voice. De los flyers solo tengo (619) 324.3116~~ Resuelto en la Etapa K: WhatsApp es el número de **México**, +52 663 111 5360 ("Llamadas y WhatsApp"); el (619) 324-3116 de los flyers es el de **Estados Unidos** y es de llamadas y mensajes de texto, no de WhatsApp. Estaba al revés en el código (D95). El correo es `info@newcityhospital.com`
6. ~~**Farmacia** — nombre y ubicación exacta~~ Resuelto en fase 07: "Farmacia La + Barata" (`directorio-plaza-exterior.pdf`, punto H4)
7. **Formato real del QPASS** — qué codifica el `payload` y qué lectora lo lee, para decidir entre QR y Code128
8. **Puntos de encuentro de los traslados** — `src/data/transferPoints.js` arranca con tres marcados `unconfirmed: true`, y lo que falta es la instrucción exacta, no el lugar: **Aeropuerto de Tijuana (TIJ)** (¿en qué punto de Llegadas espera el chofer?), **Cross Border Xpress (CBX)** (¿del lado mexicano o del estadounidense?) y **Garita San Ysidro** (¿peatonal o vehicular, y en qué acceso?). Se corrigen editando solo ese archivo; el hotel y el lobby de la Torre ya están confirmados
9. **Tratamiento de los datos del chofer** — el traslado guarda nombre y teléfono de un **tercero** (un proveedor del hospital, no el paciente) en un expediente que se sirve a cualquiera con el token. Contrasta con la decisión de no guardar el teléfono del paciente (D61). No es bloqueo técnico, pero es del hospital decidirlo, junto con el resto del tratamiento de datos de salud
