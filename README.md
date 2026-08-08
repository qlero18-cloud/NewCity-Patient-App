# NewCity Hospital Patient App

Implementación del PRD en `docs/PRD.md`: la coordinadora captura la visita en su panel, le manda al paciente un enlace con QR, y el paciente lo abre en su propio teléfono y ve a dónde ir, a qué hora, con qué pase de acceso y cómo pedir ayuda, sin descargar nada. Construido fase por fase según `docs/phases/`, con núcleo de dominio puro y probado antes que cualquier pantalla (`docs/DECISIONS.md` D13).

El circuito está cerrado: lo que captura coordinación es lo que ve el paciente. Lo que falta para producción son las dos pruebas en hardware real (lectora y teléfono) y las decisiones del hospital sobre datos de salud — ambas al final de este archivo, y ninguna la puede hacer quien escribe el código.

## Qué SÍ hace

Las ocho pantallas del paciente (Inicio, Mi itinerario, Mapa y accesos, Plaza, Horarios, Mi estancia, Mi traslado, Ayuda), el panel de coordinación y lo que une a los dos:

- Caducidad del enlace, "tu siguiente paso", múltiples QPASS visibles y ruteo por defecto (R1–R7 del PRD), como funciones puras y probadas en `src/domain/` — ver `docs/phases/phase-01-domain-model.md` y `phase-02-routing-engine.md`.
- Contenido real del complejo (`src/data/`) y datos de ejemplo ficticios que ejercitan cada caso límite del PRD §9 — `phase-03-fixtures.md`.
- Mapa esquemático interactivo con resaltado sincronizado a la ruta — `phase-04-map-svg.md`.
- Bilingüe ES/EN con paridad de cadenas probada, tema claro/oscuro, `index.html` autocontenido (cero peticiones a terceros) — `phase-05-patient-ui.md`.
- QPASS con símbolo QR o Code128 generado sin dependencias externas, con caché para seguir viéndose sin conexión — `phase-06-qpass-render.md`.
- Panel de coordinadores (`coordinator.html`) — alta de visita, itinerario (agregar, editar, mover, cancelar), hospedaje, traslados (alta, edición y cancelación, con chofer y vehículo) y emisión de QPASS (subiendo una imagen ya existente), con cuenta propia por persona y todo guardado del lado del servidor. **Ya no es una demo en memoria**: desde la Etapa D lo que se captura sobrevive a recargar la página y a abrirla en otra máquina, y cada cambio queda firmado con quién lo hizo — `phase-09-coordinator-demo.md` describe el flujo de pantallas, que no cambió; lo que cambió está en `docs/DECISIONS.md` D37–D38 y D45–D58.
- **El traslado contratado** (Etapa G): si el paciente pagó la recogida de ida y vuelta, la app le dice a qué hora pasan por él, en qué punto de encuentro, con qué vuelo, quién es el chofer y en qué coche —con el teléfono como `tel:` y `wa.me`, y las placas con botón de copiar—. Sale intercalado por hora en el itinerario, junto a las citas, y anunciado en Inicio en su propia tarjeta. El traslado de regreso **cuenta para la caducidad del enlace** (R1): sin eso, la app se apagaba mientras el paciente esperaba el coche, con el teléfono del chofer adentro (D68–D73).
- **La entrega al paciente**, que es lo que cierra el circuito: una pestaña de la visita con el enlace `https://<sitio>/v/<token>`, su QR en pantalla, copiar al portapapeles y mandar por WhatsApp (D61). El paciente abre ese enlace y `src/ui/app.js` resuelve el token en orden **fixture → red → caché local** (D62): una visita real se busca en el servidor, y una vez cargada sobrevive a quedarse sin señal en el acceso.

## Qué NO hace (a propósito)

- **Comprobado contra Blobs en producción.** Lo que queda sin cubrir es la escritura simultánea de dos personas sobre la MISMA visita (D54): Blobs no tiene comparar-y-fijar y la segunda escritura pisa a la primera. Con dos o tres personas coordinando la ventana es de milisegundos, y el arreglo de verdad pide un almacén que sepa versionar. Ver abajo cómo se cubre el resto.
- **Servir solo lo construido.** `netlify.toml` publica la raíz del repositorio (`publish = "."`), así que `src/`, `docs/` y `test/` quedan accesibles en el sitio junto a las dos páginas. Nada de eso es secreto —es el mismo código del repositorio— pero tampoco hay razón para publicarlo: lo correcto es un directorio `dist/` armado por `build.py`. Se dejó fuera de la Etapa F a propósito, porque cambiar el directorio de publicación de un sitio que ya está en línea se comprueba desplegando, y eso no se puede hacer desde aquí.
- **Resultados clínicos, expediente, pagos, ni cuenta del paciente** — fuera del v1 desde el PRD (D09). El paciente nunca escribe una contraseña: su enlace es su acceso, y sirve para esa visita y nada más. El login es solo del lado de coordinación.
- **Posicionamiento en vivo dentro del edificio** — el ruteo es paso a paso pre-escrito (D06), no un "estás aquí" en tiempo real.

## Pendientes del cliente (PRD §15)

Todo lo que depende de esto sigue marcado `[POR CONFIRMAR]` / `unconfirmed: true` en pantalla, no como si fuera dato real:

1. Planos oficiales del complejo — parcialmente resuelto (`directorio-plaza-exterior.pdf`, fase 07, D26 y D30): el mapa ya usa esa señalética real como fondo, en dos niveles, pero sigue sin cubrir el interior de la Torre Médica piso por piso (Piso 27 no aparece ahí), así que el mapa y las rutas siguen siendo un esquema referencial, no un plano a escala.
2. Tipo de comida y horarios de Farmer's Table, The Park Restaurante, Boka y José Café — ¿hay algo más en Nivel 1?
3. ~~Amenidades~~ Resuelto para cajeros, sanitarios, elevador, escaleras, rampa y valet (D27) — sigue faltando el nombre de la red wifi y zonas pet-friendly.
4. Horarios reales de Compass, Piso 27 y coordinación (hoy: 07:00–20:00 todos los días, placeholder) — el directorio nuevo tampoco trae horarios de ningún local.
5. Cuál número es WhatsApp y cuál Google Voice (hoy se usa el mismo número real de los flyers en los dos campos).
6. ~~Nombre y ubicación exacta de la farmacia~~ Resuelto: "Farmacia La + Barata" (D26).
7. Formato real del payload del QPASS y qué lectora lo lee — el generador se acotó a propósito a las versiones 3 y 4, nivel M, modo byte (`docs/DECISIONS.md` D21 y D60) hasta saber qué hace falta de verdad.
8. Puntos de encuentro de los traslados — falta la **instrucción exacta**, no el lugar: en qué punto de Llegadas del aeropuerto de Tijuana espera el chofer, de qué lado de CBX, y si en San Ysidro es el cruce peatonal o el vehicular. Los tres salen marcados `[POR CONFIRMAR]` en la pantalla del paciente y se corrigen editando solo `src/data/transferPoints.js` (D70). El hotel y el lobby de la Torre ya están confirmados.
9. **Tratamiento de los datos del chofer** — el traslado guarda nombre y teléfono de un tercero en un expediente que se sirve a cualquiera con el token (D72). No es un bloqueo técnico y la app ya funciona; es una decisión del hospital, del mismo paquete que el tratamiento de datos de salud (LFPDPPP, y lo que aplique del lado de EE.UU. por los pacientes que cruzan).

Ya resuelto (antes listado aquí como hueco entre fases): "tienda de conveniencia" es 7-Eleven (D27) — `docs/DECISIONS.md` D17 queda marcada como resuelta.

## Publicado

**https://nchpatient.netlify.app/** — la app del paciente
**https://nchpatient.netlify.app/coordinator.html** — el panel de coordinación

Dos páginas estáticas autocontenidas y sus Functions, publicadas en Netlify a partir del mismo repositorio de GitHub. Ninguna de las dos pide nada a dominios externos: el paciente le habla a `/api/visit` y el panel a `/api/auth/*` y `/api/coordinator/*`, todo del mismo origen.

> **Corregido en la Etapa B.** Esta línea decía "CSP estricta" desde la fase 08 y era falsa: no existía `_headers`, ni `netlify.toml`, ni ningún `<meta http-equiv>` en el repo. Lo que sí era cierto —y lo único que se había comprobado, en el panel de red— es que la página no pide nada a terceros. La CSP existe desde la Etapa B (`_headers`), y no es del todo estricta: `script-src` va por hash, sin `'unsafe-inline'`, pero `style-src` sí lo necesita porque el CSS se arma en tiempo de ejecución (`src/ui/app.js:51`). `test/deploy/csp.test.js` verifica las dos cosas, y que esa excepción no se extienda a ninguna otra directiva. GitHub Pages fue la primera opción, pero su primer deploy se quedó atorado en la cola de Actions sin completarse ni fallar explícitamente; Netlify construye en su propia infraestructura y no depende de esa cola (`docs/DECISIONS.md` D23).

Enlace corto para demo — apunta a la fixture `v_demo1` con `now` fijado, vía una redirección propia del sitio (`_redirects`, mismo origen, no es un acortador de terceros):

```
https://nchpatient.netlify.app/demo
```

`qr-demo.png` codifica ese enlace corto: el largo, con `?p=` y `now=`, no cabe ni siquiera en los 62 bytes de la versión 4 (D60), que es la más grande que sabe emitir este generador. El enlace real que la coordinadora le manda al paciente sí cabe: `https://nchpatient.netlify.app/v/<token>` mide 55 bytes con el token de 128 bits y entra en la versión 4 con 7 de sobra — por eso el QR de la pantalla de entrega se genera en vivo y no hace falta acortarlo. (El largo mide 82: de ahí la regla `/v/*` de `_redirects`.)

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

`p` es el token de una de las fixtures de `src/data/fixtures.js` (`fixture-token-v-demo1`, `-v-demo2`, `-v-longstay`, `-v-expired`, `-v-revoked`). `now` ancla la hora "actual" a la fecha de la fixture (D20): sin él, la fecha real eventualmente deja cualquier fixture vencida (INV-3), porque nada del lado del servidor las mantiene vigentes. Funciona igual en `coordinator.html` desde la Etapa F — la pestaña del pase reusa la pantalla del paciente y sin `?now=` mostraba como revocado el pase de una visita de marzo de 2026.

Con `?p=<token real>` no basta un servidor estático: un token emitido por coordinación se busca contra `/api/visit`, que aquí no existe. Ese es el caso de la siguiente sección. En producción el enlace que recibe el paciente es `/v/<token>`, y `_redirects` lo traduce a `/?p=<token>` con un 302 — un rewrite dejaría la barra en `/v/…` y `params.get('p')` daría `null`.

### Cómo se construyen las dos páginas

`index.html` y `coordinator.html` **no se editan a mano**: los genera `build.py` aplanando todo el grafo de módulos de cada punto de entrada en un solo script en línea, y embebiendo el ícono y el fondo del mapa como `data:` URI.

| Se edita | Genera |
|---|---|
| `app.html` + `src/ui/app.js` | `index.html` (40 módulos) |
| `coordinator-app.html` + `src/ui/coordinatorApp.js` | `coordinator.html` (31 módulos) |

Las dos fuentes sí usan módulos ES normales y sirven para desarrollar con recarga; las dos salidas son lo que se publica. Al terminar, `build.py` imprime el hash sha256 de cada script en línea y avisa si no coincide con el de `_headers` — un hash desfasado no rompe nada en local, rompe la página en producción, en blanco y sin aviso. `python3 build.py --check` no escribe nada y falla si alguna salida quedó atrás de sus fuentes.

### El panel de coordinación necesita las Functions

`coordinator.html` no funciona con un servidor estático a secas: desde la Etapa D cada pantalla habla con `/api/auth/*` y `/api/coordinator/*`, y con `python3 -m http.server` esas rutas devuelven 404 — la pantalla de acceso se ve bien y no deja entrar. Hace falta levantar las Functions:

```bash
npx netlify dev
```

Aviso de honestidad: **este comando no se ha corrido en este entorno.** `netlify-cli` no está instalado aquí y no se instaló (es una dependencia grande, y Blobs en local pide sesión de Netlify). La verificación en navegador de la Etapa D se hizo montando los mismos handlers de `src/server/` sobre un KV en memoria, que es exactamente lo que hacen las pruebas. Lo que eso comprueba es el panel completo —entrar, capturar, validar, recargar, salir— y lo que NO comprueba es la capa de Netlify por debajo. Para esa capa están las dos verificaciones de la sección siguiente.

## Probar contra Netlify Blobs de verdad

Son dos cosas distintas y hacen falta las dos.

**1. El adaptador, dentro de `npm test`.** `test/deploy/blobsKv.test.js` corre `netlify/functions/_kv.mjs` contra un servidor de Blobs de verdad —`BlobsServer`, que viene dentro de `@netlify/blobs` y es el mismo que `netlify dev` levanta por debajo— sobre un directorio temporal. Sin red, sin cuenta de Netlify, sin dependencias nuevas: ya corre con el resto de la suite. Cubre lo que el `Map` en memoria no puede: la forma real de `list()`, qué contesta `get()` con una llave que no existe, que los acentos y la estructura anidada sobrevivan el viaje por JSON, y que los dos almacenes estén de verdad separados.

**2. El sitio desplegado, a mano.** Lo único que el punto 1 no puede reproducir es lo que hace peligroso al Blobs de producción: tiene DOS direcciones de edge, una con caché y otra sin ella. El servidor local es un directorio en disco, siempre consistente. Para eso:

```bash
NETLIFY_SITE_ID=... NETLIFY_AUTH_TOKEN=... node scripts/smoke-blobs.mjs --site https://nchpatient.netlify.app --username tu.usuario
```

Entra con tu cuenta, crea una visita marcada `PRUEBA-SMOKE`, le agrega **dos citas seguidas sin pausa** —que es justo donde una lectura cacheada pierde la primera—, guarda un hospedaje, y luego relee todo por tres caminos: la API, Blobs directo (sin pasar por la Function, para que no sea el mismo servidor confirmándose a sí mismo) y el endpoint del paciente con el token recién emitido. Al terminar borra lo que creó, también si algo falló a la mitad. Sale con 0 si pasó y con 1 si no.

Pide la contraseña por teclado, nunca por argumento (mismo motivo que `create-coordinator.mjs`), y **se niega a arrancar sin `NETLIFY_SITE_ID` y `NETLIFY_AUTH_TOKEN`**: la API no expone borrado de visitas, así que la limpieza va directa a Blobs, y sin credenciales dejaría un expediente de mentira suelto en producción.

Por qué existe: la consistencia por defecto de `@netlify/blobs` es `eventual`, y todo el servidor de este proyecto es leer-modificar-escribir. Con lectura cacheada, dos cambios seguidos pierden el primero **en silencio** — la coordinadora captura dos citas, ve dos citas, y al día siguiente hay una. `_kv.mjs` pide `strong` para evitarlo (D59); el smoke es lo que comprueba que sigue siendo cierto en producción.

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
npm test                              # los 1056 casos automatizados de todas las fases y etapas
python3 build.py --check              # confirma que index.html y coordinator.html están al día
node test/e2e/patient-journey.mjs     # los 19 pasos del recorrido (10 del paciente + 6 de coordinación + 3 de traslados)
```

Lo que ningún comando automatizado cubre, y que sigue pendiente:

- **`node scripts/smoke-blobs.mjs`** contra el sitio desplegado — ver "Probar contra Netlify Blobs de verdad" arriba. Es lo único que comprueba el comportamiento de Blobs en producción, y necesita un sitio con `SESSION_SECRET` puesto y una cuenta ya creada.
- **Prueba física con una lectora real** contra la pantalla del QPASS (fase 06) — sin ella esa fase no se considera terminada, es la única forma de saber si el pase realmente abre la puerta.
- **Prueba en un teléfono real** (iPhone y Android): que la URL publicada cargue, que "Agregar a inicio" produzca ícono y nombre correctos, y que la cámara del teléfono abra la app al escanear el QR — fase 07. La publicación en sí ya está hecha y verificada en navegador (carga correcta, cero peticiones externas, símbolo del pase, cambio de idioma); lo que falta es específicamente la prueba en hardware real, que solo el cliente puede hacer.

  Desde la Etapa E la prueba que de verdad importa no es `qr-demo.png` sino la de extremo a extremo: dar de alta una visita en el panel, escanear con un teléfono el QR de la pestaña de entrega, y ver **el itinerario de esa visita**. El round-trip del símbolo está probado en software (`generateQrMatrix` → `decodeQrMatrix`, paso 12 del e2e), pero eso comprueba que la matriz es correcta, no que la cámara de un iPhone la lea a la distancia y con la luz de un mostrador.
