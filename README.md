# NewCity Hospital Patient App — prototipo navegable

Prototipo del PRD en `docs/PRD.md`: el paciente escanea su QR y ve a dónde ir, a qué hora, con qué pase de acceso y cómo pedir ayuda, sin descargar nada. Construido fase por fase según `docs/phases/`, con núcleo de dominio puro y probado antes que cualquier pantalla (`docs/DECISIONS.md` D13).

## Qué SÍ hace este prototipo

Las siete pantallas del paciente (Inicio, Mi itinerario, Mapa y accesos, Plaza, Horarios, Mi estancia, Ayuda), con:

- Caducidad del enlace, "tu siguiente paso", múltiples QPASS visibles y ruteo por defecto (R1–R7 del PRD), como funciones puras y probadas en `src/domain/` — ver `docs/phases/phase-01-domain-model.md` y `phase-02-routing-engine.md`.
- Contenido real del complejo (`src/data/`) y datos de ejemplo ficticios que ejercitan cada caso límite del PRD §9 — `phase-03-fixtures.md`.
- Mapa esquemático interactivo con resaltado sincronizado a la ruta — `phase-04-map-svg.md`.
- Bilingüe ES/EN con paridad de cadenas probada, tema claro/oscuro, `index.html` autocontenido (cero peticiones a terceros) — `phase-05-patient-ui.md`.
- QPASS con símbolo QR o Code128 generado sin dependencias externas, con caché para seguir viéndose sin conexión — `phase-06-qpass-render.md`.
- Demo del panel de coordinadores — alta de visita, itinerario (agregar, editar, mover, cancelar), hospedaje y emisión de QPASS (subiendo una imagen ya existente) — punto de entrada aparte (`coordinator.html`), sin login, todo en memoria del navegador sobre su propia copia de `src/data/fixtures.js` — `phase-09-coordinator-demo.md`.

## Qué NO hace (a propósito)

- **Panel de coordinadores con backend real** (fase 08): persistencia de verdad, autenticación de coordinadoras y que lo que ahí se capture alimente de verdad la sesión de un paciente real. Fuera del prototipo — se planea, no se construye. La demo de fase 09 (arriba) ensaya el mismo flujo de clic, pero por completo en memoria del navegador: se pierde al recargar y nunca toca la sesión real de ningún paciente ni persiste nada más allá de la pestaña abierta.
- **Backend real**: no hay servidor, base de datos ni autenticación. El "token" de la URL (`?p=`) se resuelve contra las fixtures en el propio navegador.
- **Resultados clínicos, expediente, pagos ni login** — fuera del v1 desde el PRD (D09).
- **Posicionamiento en vivo dentro del edificio** — el ruteo es paso a paso pre-escrito (D06), no un "estás aquí" en tiempo real.

## Pendientes del cliente (PRD §15)

Todo lo que depende de esto sigue marcado `[POR CONFIRMAR]` / `unconfirmed: true` en pantalla, no como si fuera dato real:

1. Planos oficiales del complejo — parcialmente resuelto (`directorio-plaza-exterior.pdf`, fase 07, D26 y D30): el mapa ya usa esa señalética real como fondo, en dos niveles, pero sigue sin cubrir el interior de la Torre Médica piso por piso (Piso 27 no aparece ahí), así que el mapa y las rutas siguen siendo un esquema referencial, no un plano a escala.
2. Tipo de comida y horarios de Farmer's Table, The Park Restaurante, Boka y José Café — ¿hay algo más en Nivel 1?
3. ~~Amenidades~~ Resuelto para cajeros, sanitarios, elevador, escaleras, rampa y valet (D27) — sigue faltando el nombre de la red wifi y zonas pet-friendly.
4. Horarios reales de Compass, Piso 27 y coordinación (hoy: 07:00–20:00 todos los días, placeholder) — el directorio nuevo tampoco trae horarios de ningún local.
5. Cuál número es WhatsApp y cuál Google Voice (hoy se usa el mismo número real de los flyers en los dos campos).
6. ~~Nombre y ubicación exacta de la farmacia~~ Resuelto: "Farmacia La + Barata" (D26).
7. Formato real del payload del QPASS y qué lectora lo lee — el generador de esta fase se acotó a versión 3/nivel M/modo byte (`docs/DECISIONS.md` D21) hasta saber qué hace falta de verdad.

Ya resuelto (antes listado aquí como hueco entre fases): "tienda de conveniencia" es 7-Eleven (D27) — `docs/DECISIONS.md` D17 queda marcada como resuelta.

## Prototipo publicado

**https://nchpatient.netlify.app/**

Página estática autocontenida, sin peticiones a dominios externos, publicada en Netlify a partir del mismo repositorio de GitHub.

> **Corregido en la Etapa B.** Esta línea decía "CSP estricta" desde la fase 08 y era falsa: no existía `_headers`, ni `netlify.toml`, ni ningún `<meta http-equiv>` en el repo. Lo que sí era cierto —y lo único que se había comprobado, en el panel de red— es que la página no pide nada a terceros. La CSP existe desde la Etapa B (`_headers`), y no es del todo estricta: `script-src` va por hash, sin `'unsafe-inline'`, pero `style-src` sí lo necesita porque el CSS se arma en tiempo de ejecución (`src/ui/app.js:51`). `test/deploy/csp.test.js` verifica las dos cosas, y que esa excepción no se extienda a ninguna otra directiva. GitHub Pages fue la primera opción, pero su primer deploy se quedó atorado en la cola de Actions sin completarse ni fallar explícitamente; Netlify construye en su propia infraestructura y no depende de esa cola (`docs/DECISIONS.md` D23).

Enlace corto para demo — apunta a la fixture `v_demo1` con `now` fijado, vía una redirección propia del sitio (`_redirects`, mismo origen, no es un acortador de terceros):

```
https://nchpatient.netlify.app/demo
```

`qr-demo.png` codifica ese enlace corto (el largo con `?p=` y `now=` no cabe en los 42 bytes del generador de QR de la fase 06 — D21 — que se acotó a propósito a un tamaño conservador).

## Cómo correrlo localmente

Desde la Etapa B el proyecto **sí** tiene una dependencia (`@netlify/blobs`), así que hay un `npm install` que correr. Las pruebas siguen sin necesitarla: corren contra un almacén en memoria y no tocan la red (D45).

Para las pantallas del paciente basta un servidor estático — **no lo abras como `file://` directo**: la mayoría de navegadores (confirmado en el navegador integrado de este entorno) descartan la query string en esa modalidad, y `?p=` es obligatorio para ver algo.

```bash
cd "newcity-patient-app" && python3 -m http.server 8743
```

Luego, en el navegador:

```
http://localhost:8743/app.html?p=fixture-token-v-demo1&now=2026-03-10T10:00-07:00
```

`python3 -m http.server` no manda `Cache-Control` en sus respuestas, así que tras editar un archivo y recargar, el navegador puede seguir sirviendo una copia vieja de algún `.js` desde su propio caché (comprobado de primera mano verificando la fase 09: un `.click()` sobre una pestaña que llevaba rato abierta seguía corriendo `pass.js` de antes de un fix ya guardado en disco). Si un cambio no se refleja, recarga forzando caché vacío (Cmd+Shift+R en Mac) en vez de una recarga normal.

`p` es el token de una de las fixtures de `src/data/fixtures.js` (`fixture-token-v-demo1`, `-v-demo2`, `-v-longstay`, `-v-expired`, `-v-revoked`). `now` es un escape hatch de este prototipo (D20): ancla la hora "actual" a la fecha de la fixture — sin él, la fecha real eventualmente deja cualquier fixture vencida (INV-3), porque no hay backend que las mantenga vigentes.

## Cuentas de coordinación y variables de entorno

Esta parte **no la hago yo**. Construí el mecanismo y el script de alta; las cuentas reales y sus contraseñas las capturas tú, y ni las contraseñas ni el secreto de sesión pasan por mí ni quedan escritos en ninguna conversación.

### 1. `SESSION_SECRET` (obligatorio)

Es la llave con la que se firman las cookies de sesión. **No tiene valor por defecto a propósito**: si falta, la Function de auth responde 500 desde el primer intento. Un respaldo silencioso significaría que la misma llave firma en todas partes y cualquiera que haya visto el repo se fabrica una sesión válida (D53).

Generar uno:

```bash
node scripts/create-coordinator.mjs --gen-secret
```

Pegarlo en Netlify → *Site configuration* → *Environment variables* → `SESSION_SECRET`. No lo commitees. Cambiarlo cierra la sesión de todas las coordinadoras al instante, que es justo lo que quieres si crees que se filtró.

### 2. Dar de alta a cada persona

El script habla con el Blobs del sitio desde tu máquina, y para eso hacen falta dos variables más — el runtime de Netlify las inyecta solo cuando el código corre allá, no en tu terminal:

| Variable | Dónde sale |
|---|---|
| `NETLIFY_SITE_ID` | *Site configuration* → *General* → Site ID |
| `NETLIFY_AUTH_TOKEN` | *User settings* → *Applications* → Personal access tokens |

Ese token es de administración del sitio: no lo pegues en el repo, no lo mandes por chat, y bórralo de Netlify cuando termines de dar de alta.

```bash
node scripts/create-coordinator.mjs --username ana.ruiz --name "Ana Ruiz"
```

La contraseña se pide por teclado, sin eco, y se confirma dos veces. **No se puede pasar por argumento**, y no es un descuido: la línea de comandos queda en el historial de la shell y la ve cualquiera que corra `ps` mientras el script trabaja. Mínimo 12 caracteres, sin reglas de composición (NIST SP 800-63B). Entrégasela a la persona por un canal distinto de aquel por el que le mandes el usuario.

Los otros comandos:

```bash
node scripts/create-coordinator.mjs --list
```

```bash
node scripts/create-coordinator.mjs --delete ana.ruiz
```

Dar de baja surte efecto en la siguiente petición, no hasta que caduque su cookie: cada mutación vuelve a comprobar que la cuenta siga existiendo (D53). Borrar pide teclear el usuario completo, no un "s/n".

### 3. Lo que este mecanismo NO resuelve

Cinco intentos fallidos bloquean la cuenta 15 minutos y el bloqueo se vence solo — frena la adivinanza a fuerza bruta, no la vuelve imposible, y con peticiones simultáneas el contador puede quedarse corto porque Blobs no tiene comparar-y-fijar (D54). No hay segundo factor, ni recuperación de contraseña: si alguien la olvida, se da de baja la cuenta y se vuelve a dar de alta.

Y lo más importante, que es decisión del hospital y no de la implementación: **antes de capturar pacientes reales**, el tratamiento de datos de salud (LFPDPPP, y lo que aplique del lado estadounidense si hay pacientes cruzando) tiene que estar resuelto por quien es responsable de esos datos. Este README documenta el mecanismo; no constituye una evaluación de cumplimiento.

## Verificación

Cada fase tiene su propio comando exacto en la sección "Verificación" de `docs/phases/phase-0N-*.md`. El resumen:

```bash
cd "newcity-patient-app"
npm test                              # los 509 casos automatizados de todas las fases y etapas
python3 build.py                      # genera index.html autocontenido
node test/e2e/patient-journey.mjs     # los 10 pasos del recorrido, fase 07
```

Lo que ningún comando automatizado cubre, y que sigue pendiente:

- **Prueba física con una lectora real** contra la pantalla del QPASS (fase 06) — sin ella esa fase no se considera terminada, es la única forma de saber si el pase realmente abre la puerta.
- **Prueba en un teléfono real** (iPhone y Android): que la URL publicada cargue, que "Agregar a inicio" produzca ícono y nombre correctos, y que `qr-demo.png` abra el prototipo al escanearlo con la cámara del teléfono — fase 07. La publicación en sí ya está hecha y verificada en navegador (carga correcta, cero peticiones externas, símbolo del pase, cambio de idioma); lo que falta es específicamente la prueba en hardware real, que solo el cliente puede hacer.
