# Fase 09 — Demo del panel de coordinadores

> **Demo de clic, no el MVP.** Esta fase agrega, al mismo repositorio y al mismo sitio de Netlify que ya aloja el prototipo del paciente (D23), una interfaz navegable del flujo de trabajo de coordinación — dar de alta una visita, capturar el itinerario, emitir un QPASS, registrar el hospedaje — con el mismo enfoque técnico de las fases 01 a 07: JavaScript plano (ESM), sin framework, sin servidor, sin base de datos, sin autenticación, sitio estático.
>
> **No es** el MVP real de `docs/phases/phase-08-coordinator-panel.md`. Esa fase sigue exactamente como está escrita — diferida, sin construirse, condicionada a hosting y a sus 6 decisiones abiertas —; esta fase no la adelanta, no la reemplaza y no resuelve ninguna de esas decisiones. De hecho puede construirse *ahora*, sin esperar al cliente, precisamente porque no necesita ninguna de ellas: no hay hosting que decidir, ni base de datos, ni acceso de coordinadoras que administrar, porque nada de lo que aquí se captura persiste de verdad.
>
> Lo que esta demo "edita" son los mismos datos ficticios de `src/data/fixtures.js` (fase 03), copiados a un estado en memoria dentro de la pestaña del navegador. Dar de alta una visita, mover una cita o emitir un QPASS muta esa copia — nunca el archivo `fixtures.js`, nunca `localStorage`, nunca un servidor. Recargar la pestaña, o abrir la demo en una pestaña distinta, regresa todo al estado inicial de las fixtures: no hay nada compartido ni guardado fuera de esa pestaña, en ese momento. Esta fase existe para que el cliente **vea y recorra el flujo de trabajo** de principio a fin; no entrega un sistema que una coordinadora real pueda operar.

**Depende de:** fases 01 a 07 aprobadas, más la barra de navegación corregida en D28. **No depende de la fase 08** ni la sustituye.
**Entrega:** una demo navegable del flujo de coordinación (alta de visita, itinerario, emisión de QPASS, hospedaje), sin persistencia real, para que el cliente la recorra con el clic.

## Alcance

- **Sin pantalla de login.** No hay autenticación en esta fase — eso es la decisión abierta #3 de fase 08 ("Acceso de las coordinadoras"), que sigue sin resolver y que esta demo no necesita resolver. Al abrir la demo se aterriza directo en la vista de coordinadora, sin credenciales de por medio.
- **Lista de visitas** — todas las visitas disponibles (las fixtures de `src/data/fixtures.js`: `v_demo1`, `v_demo2`, `v_longstay`, `v_expired`, `v_revoked`, más las que se den de alta durante la demo) en tarjetas, con nombre de pila, idioma y fechas. Es el punto de entrada de la demo.
- **Alta de visita** — formulario con nombre de pila (`patientFirstName`), idioma (`lang`: es/en) y fechas de la visita (`startsAt`/`endsAt`), el subconjunto de `Visit` (PRD §7) que le toca capturar a la coordinadora. Al guardar, la visita nueva aparece de inmediato en la lista.
- **Editor de itinerario** — por visita: agregar una cita, editarla, moverla (cambiar `startsAt`) y cancelarla (`status: "cancelled"`), sobre el modelo `Appointment` (PRD §7). Una cita movida reordena la línea de tiempo de esa visita; una cancelada se muestra tachada — mismo tratamiento visual que la pantalla de itinerario del paciente (fase 05), para que el flujo se sienta continuo con el resto del prototipo.
- **Emisión de QPASS** — existe como un paso visible dentro del flujo de una visita (p. ej. un botón o un estado "QPASS pendiente" → "QPASS emitido"), con una vista adicional para verlo tal como lo vería el paciente, sin salir de la pestaña. El mecanismo es que la coordinadora sube una imagen ya existente del pase — no pega un `payload` corto para que `qr.js`/`code128.js` lo codifiquen; ver "Emisión de QPASS: imagen subida por el coordinador" más abajo para el diseño completo.
- **Registro de hospedaje** — formulario con hotel, código de reservación, check-in, check-out, desayuno y recovery (`Lodging`, PRD §7), asociado a una visita.

Queda fuera, a propósito, todo lo que solo tiene sentido con persistencia real: revocar un QPASS, generar y enviar el QR por WhatsApp, bitácora de quién vio o cambió qué, control de acceso de coordinadoras. Eso sigue siendo fase 08, no esta.

### Emisión de QPASS: imagen subida por el coordinador

Información nueva del cliente que cambia la premisa de esta sección: la coordinadora **no** escribe ni pega un `payload` corto para que `qr.js`/`code128.js` lo codifiquen. El QPASS es una imagen que ya existe — foto o export de un pase físico/pre-hecho — y esa imagen, tal cual, es lo que ve el teléfono del paciente. Esto actualiza la idea de "pegar el `payload`" que hoy aparece en el borrador de fase-08; fase-08 en sí no se toca aquí (ver "Fuera de alcance" al final). Lo que sigue es el diseño concreto para esta fase — demo, sin backend, sin almacenamiento real de archivos, sin servidor, misma restricción que las fases 1–7.

#### Modelo de datos: `QPass.format` gana un tercer valor

```
format             "qr" | "code128" | "image"
payload            string   símbolo codificado ('qr'/'code128') o data: URL en
                             base64 de la imagen subida ('image')
```

Para `format: "image"`, `payload` deja de ser el string corto que consumen los generadores algorítmicos y pasa a contener la imagen completa como **data: URL en base64** (`data:image/jpeg;base64,...` o el tipo que corresponda al archivo subido).

Consecuencia directa: para este formato `payload` queda **sin acotar** en tamaño — una foto en base64 pesa fácilmente decenas o cientos de KB, muy por encima de los 42 bytes UTF-8 a los que D21 acotó a propósito `qr.js` (versión 3 / nivel M / modo byte). Esto no reabre D21: ese límite siempre fue del **generador algorítmico** — cuánto cabe en un símbolo Versión 3 / nivel M — no una regla general sobre el campo `payload`. `format: "image"` no pasa por `generateQrMatrix` en absoluto; el símbolo ya viene armado en la imagen. D21 simplemente no aplica a este valor nuevo de `format`. `qr.js` y `code128.js` no cambian ni un carácter, y siguen acotados exactamente como antes para `'qr'`/`'code128'`.

El resto del modelo de `QPass` no cambia: `scope`, `validFrom`, `validUntil` y `revokedAt` funcionan igual para un pase `format: 'image'` que para uno `qr`/`code128` — R3 (qué QPASS se muestra) e INV-4 (un pase revocado o fuera de ventana nunca se renderiza, ni desde caché) no distinguen por `format`. Lo único que cambia es cómo se pinta el símbolo, no si se pinta.

Esto sí bloquea esta fase si no se ajusta, y no es un simple detalle a tener presente: `attachPassScreen` llama hoy `savePassCache(visit.id, passes, now)` — sin filtrar por `format` — cada vez que "Mi pase" se abre con algún pase vigente (`src/ui/screens/pass.js:64`). Sin cambios, un `QPass` con un `payload` de imagen en base64 se guardaría en `localStorage` igual que uno `qr`/`code128`, y sobreviviría exactamente el refresh que esta fase promete que borra todo — el tamaño (mucho mayor que el string corto que este mecanismo manejaba hasta ahora, aunque lejos de los límites típicos de `localStorage` por origen) es lo de menos comparado con esa contradicción. "Cambio del lado paciente en `pass.js`" más abajo trae el ajuste puntual: los pases `format: 'image'` quedan excluidos de `savePassCache`. `qr`/`code128` se siguen cacheando exactamente como hoy — comportamiento ya aprobado en fase 06 — y `passCache.js` en sí no cambia; solo cambia qué le pasa `attachPassScreen`.

#### Flujo del lado coordinador (demo)

Un `<input type="file" accept="image/*">`, enganchado con el mismo mecanismo que ya usa este proyecto para controles interactivos: buscar el elemento con `querySelector` dentro de un `attach*Screen(rootEl, ctx)` y colgarle `addEventListener`, en vez de manejar un `<form onsubmit>` completo — es el patrón de `attachPlazaScreen` en `src/ui/screens/plaza.js`. (El atributo de enganche concreto sigue la convención `data-role` de un solo elemento que ya usan `pass.js`, `stay.js` y `map.js`, más apropiada aquí que los atributos `data-cuisine`/`data-category` de `plaza.js`, pensados para varios chips repetidos. Nota aparte: hoy no existe ningún `<input>` en `src/ui` — este sería el primer control de formulario del proyecto, así que hace falta una clase CSS nueva, p. ej. `nc-file-input`, no una que ya exista.)

Algo así:

```html
<input type="file" accept="image/*" data-role="qpass-image-input" class="nc-file-input" />
```

```js
let qpassImageDataUrl = null; // ver nota de efimeridad abajo

const input = rootEl.querySelector('[data-role="qpass-image-input"]');
input?.addEventListener('change', () => {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    qpassImageDataUrl = reader.result; // "data:image/...;base64,...."
    render(); // repinta: vista previa, habilita "Emitir"
  };
  reader.readAsDataURL(file);
});
```

Al cambiar el input se lee el archivo con `FileReader.readAsDataURL`, y el resultado (la data: URL) se guarda **solo en memoria**: una variable de JavaScript común, viva mientras el tab siga abierto en esa pantalla — misma naturaleza que `index` en `attachPassScreen` (`pass.js`) o el estado de los chips de filtro en `attachPlazaScreen` (`plaza.js`). Al "emitir" el pase en esta demo, ese valor es lo que se asigna como `payload` del nuevo `QPass` con `format: 'image'`.

**En términos llanos:** esta fase no tiene backend, así que no hay dónde más guardar la imagen que en esa variable. Si la coordinadora recarga la página, cierra el tab, o navega a otra pantalla y vuelve, la imagen subida se pierde y hay que subirla de nuevo. No es un bug de la demo — es exactamente lo que "sin backend" significa aquí, igual que todo lo demás en este prototipo. No debe confundirse con persistencia real: nada en esta fase sobrevive un refresh, y eso incluye la imagen del QPASS.

Esa misma variable en memoria es, sin ningún paso intermedio, lo que consume la vista previa descrita a continuación: como vive en la misma pestaña y el mismo módulo de JavaScript que el resto de la demo, no hace falta guardarla en ningún otro lado para que la coordinadora pueda ver, dentro de esta misma sesión, qué vería el paciente.

#### Vista previa en la misma pestaña: cómo llega la imagen a la pantalla del paciente

`coordinatorStore.js` vive solo dentro de la pestaña de `coordinator.html` — no hay `localStorage`, no hay servidor, nada que un documento HTML distinto pueda leer. Eso importa porque `coordinator.html` y `app.html` son dos puntos de entrada separados (`coordinator.html` "arranca directo en la lista de visitas", sin `?p=` ni token — ver "Archivos que toca"), y `app.html` resuelve sus visitas con `resolveVisitContext(token)`, que lee directamente el `fixtures.js` estático (`src/ui/app.js:82-85`), no la copia mutada de `coordinatorStore.js`. Navegar de una pestaña a la otra recarga el documento completo y reinicia todo el estado de JavaScript; sin más, no habría forma de que la pantalla del pase del paciente (`pass.js`, solo alcanzable hoy vía `app.html`) llegara a ver una imagen que la coordinadora acaba de subir en `coordinator.html`.

Esta fase no resuelve esto con un puente de almacenamiento — eso violaría la misma restricción de "nunca `localStorage`, nunca un servidor" del resto de la demo. Lo resuelve reutilizando la pantalla real del paciente **dentro de la pestaña de la coordinadora**: `coordinatorApp.js` agrega una ruta `#/pass-preview` que importa, sin copiarlas ni reescribirlas, las mismas `renderPassScreen`/`attachPassScreen` que ya usa `app.js`, y las llama con un `ctx` armado desde el estado en memoria de `coordinatorStore.js` — la visita seleccionada, sus `QPass` (incluido el `format: 'image'` recién emitido), el `lang` y el `now` de la demo — en vez del `ctx` que arma `resolveVisitContext` a partir de `fixtures.js`. Algo así:

```js
// src/ui/coordinatorApp.js
import { renderPassScreen, attachPassScreen } from './screens/pass.js';

function renderPassPreviewRoute(state) {
  const { visit, passes } = coordinatorStore.getVisitWithPasses(state.selectedVisitId);
  return renderPassScreen({ visit, passes, now: new Date(), lang: state.lang, t });
}
// después de insertar el HTML en el DOM, se llama attachPassScreen(mount, ctx)
// con el mismo ctx — igual que boot() hace en app.js
```

Mismo documento, mismo heap de JavaScript, misma pestaña: la imagen que acaba de subir la coordinadora es la misma variable en memoria (`qpassImageDataUrl`, ver arriba) que termina en el `payload` del `QPass` que lee esta ruta — sin ningún puente de almacenamiento de por medio. Esto solo funciona sin contradecir "nada sobrevive un refresh" porque `attachPassScreen` deja de guardar en `localStorage` los pases `format: 'image'` que ve — el ajuste concreto está en la siguiente sección, y no es opcional: sin él, esta misma vista previa sería la que filtrara la imagen a `passCache` y rompería la promesa de la fase.

#### Cambio del lado paciente en `src/ui/screens/pass.js`

Dos ajustes a un archivo existente de la fase 06, no un rediseño — más un tercero, chico, ya conocido del borrador original.

**1. `renderSymbol` gana una rama nueva para `format === 'image'`, y un segundo parámetro.** Hoy `renderSymbol(pass)` es una función de nivel de módulo con un solo parámetro; `t` no existe en ese scope — solo vive dentro de `attachPassScreen(rootEl, ctx)`, varios scopes más arriba (`const { visit, passes, now, lang, t } = ctx;`, `src/ui/screens/pass.js:58`). Sin el parámetro nuevo, la rama `format === 'image'` lanzaría `ReferenceError: t is not defined` la primera vez que corriera:

```js
function renderSymbol(pass, t) {
  try {
    if (pass.format === 'image') {
      return `<img src="${escapeHtml(pass.payload)}" alt="${escapeHtml(t(`pass.scope.${pass.scope}`))}" class="nc-pass-image" />`;
    }
    if (pass.format === 'code128') {
      return renderCode128Svg(pass.payload);
    }
    return renderQrSvg(generateQrMatrix(pass.payload));
  } catch (err) {
    return `<p class="nc-pass-error">${escapeHtml(err.message)}</p>`;
  }
}
```

Su único punto de llamada, dentro de `render()` en `attachPassScreen` (`src/ui/screens/pass.js:96`), pasa de `renderSymbol(pass)` a `renderSymbol(pass, t)` — `t` ya está en el scope de `render()` por el mismo closure que hoy usa para todo lo demás en esa función, así que no hace falta importarlo ni pasarlo por ningún otro lado.

Para `format: 'image'` no se llama a `generateQrMatrix`/`renderQrSvg` ni al equivalente de Code128 — el símbolo ya viene armado en la imagen subida, así que solo se pinta un `<img>` con la data: URL guardada (`escapeHtml` alrededor del `src`, igual que el resto del archivo escapa todo lo que interpola en HTML, aunque una data: URL en base64 no traiga caracteres que lo requieran). El `alt` sugerido reutiliza `t(\`pass.scope.${pass.scope}\`)`, la misma cadena que ya se muestra debajo del símbolo — un detalle menor, no algo que el cliente pidió. Las ramas `qr`/`code128` no cambian su comportamiento.

**2. `attachPassScreen` deja de guardar en `localStorage` los pases `format: 'image'`.** Hoy llama `savePassCache(visit.id, passes, now)` sin filtrar (`src/ui/screens/pass.js:64`) — el arreglo completo de `passes` de la visita, no solo el que se está mostrando. Sin ajuste, un `QPass` con un `payload` de imagen en base64 se guardaría igual, y sobreviviría exactamente el refresh que esta fase promete que borra todo (ver la nota en "Modelo de datos" arriba). El cambio es acotado, en el punto de llamada, no en `passCache.js`:

```js
// antes: savePassCache(visit.id, passes, now);
savePassCache(visit.id, passes.filter((p) => p.format !== 'image'), now);
```

`passCache.js` no cambia ni una línea: sigue cacheando `qr`/`code128` exactamente como hoy — comportamiento ya aprobado en fase 06 — y simplemente nunca vuelve a ver un `payload` de imagen. Este ajuste es lo que hace posible que la "Vista previa en la misma pestaña" de arriba reutilice `attachPassScreen` sin violar "nada sobrevive un refresh".

**3. Regla CSS para `img`.** En `PASS_SCREEN_CSS`, `.nc-pass-symbol svg { display: block; width: 100%; height: auto; }` hoy solo apunta a `svg` (`src/ui/screens/pass.js:136`). Hace falta la misma regla para `img`:

```css
.nc-pass-symbol svg, .nc-pass-symbol img { display: block; width: 100%; height: auto; }
```

para que la imagen llene `.nc-pass-symbol` igual que los símbolos generados.

#### Pregunta abierta real para el cliente

D22 verificó el QR y el Code128 de esta app contra una librería de referencia externa y un decodificador independiente (OpenCV): existe un algoritmo conocido contra el cual comparar, así que "¿este símbolo codifica lo que debería?" tiene una respuesta comprobable dentro de este repo. Una imagen subida por la coordinadora no tiene ese ancla — no hay algoritmo que decodificar ni con qué comparar el archivo que suba. Si esa imagen en verdad escanea en el lector físico del acceso deja de ser una pregunta de código y pasa a ser **puramente una pregunta de dispositivo físico**: el mismo cajón, todavía sin resolver, donde ya vive el criterio de aceptación de fase-06 "una lectora real lee el símbolo desde la pantalla de un teléfono, a brillo normal de interior" (sigue sin marcar, pendiente de prueba en sitio). Ningún test ni verificación de este proyecto puede confirmar esto para `format: 'image'`; solo una prueba física en el acceso real, con el archivo real que suba la coordinadora, lo contesta.

#### Fuera de alcance de esta fase

Esto cubre solo el flujo de la demo (fase 9, sin almacenamiento real); el almacenamiento y la retención reales de la imagen del QPASS para uso real de pacientes quedan como un ítem más en la lista de decisiones abiertas de fase-08 (junto con hosting y base de datos), no se resuelven aquí.

## Archivos que toca

Mismo patrón de módulo de pantalla que ya usa `src/ui/screens/home.js`: `render*Screen(ctx)` regresa un string HTML; el cableado de eventos vive aparte, en `attach*Screen(root)`.

```
coordinator.html                        fuente única de la demo — mismo espíritu que app.html (fase 05), pero sin `?p=` ni token que resolver: arranca directo en la lista de visitas
src/ui/coordinatorApp.js                enrutador y estado de la demo (equivalente a app.js, pero sin resolución de fixtures por token ni `now` override); además de las cuatro pantallas propias, resuelve `#/qpass` y la ruta de solo lectura `#/pass-preview`, que reutiliza `renderPassScreen`/`attachPassScreen` de `pass.js` contra el estado en memoria de `coordinatorStore.js` (ver "Vista previa en la misma pestaña" arriba)
src/ui/coordinatorStore.js              copia en memoria de src/data/fixtures.js; toda "edición" de la demo muta esta copia, nunca el módulo de fixtures. Vive en src/ui/, no en src/data/, porque es estado de sesión del navegador, no datos de dominio reutilizables
src/ui/screens/coordinator/visits.js    lista de visitas (pantalla de entrada)
src/ui/screens/coordinator/intake.js    alta de visita
src/ui/screens/coordinator/itinerary.js editor de itinerario
src/ui/screens/coordinator/lodging.js   registro de hospedaje
src/ui/screens/coordinator/qpass.js     input de imagen, vista previa y estado "pendiente" → "emitido" (ver "Emisión de QPASS" arriba); ningún símbolo se genera aquí; al emitir, enlaza con `data-nav="pass-preview"` hacia la vista previa como paciente
src/ui/nav.js                           archivo nuevo — `attachNav(root)`, el helper compartido de cableado `[data-nav]` que usan tanto `app.js` como `coordinatorApp.js` (ver "Convención obligatoria: data-nav" abajo); no vive en `util.js`, que es explícitamente solo texto, sin DOM
src/ui/app.js                           se ajusta para importar `attachNav(root)` desde `nav.js` en vez de su `querySelectorAll('[data-nav]')` inline actual (`src/ui/app.js:175-179`) — mismo selector, mismo comportamiento, ahora en un solo lugar compartido con `coordinatorApp.js`
src/ui/i18n.js                          se extienden `es`/`en` con las cadenas nuevas del panel; ninguna cadena existente del paciente se toca
src/ui/screens/pass.js                  archivo existente de la fase 06, no nuevo — gana la rama `format === 'image'` en `renderSymbol` (que ahora recibe `t` como segundo parámetro), la regla CSS equivalente para `img`, y un ajuste en `attachPassScreen` para excluir los pases `format: 'image'` de `savePassCache` (ver "Emisión de QPASS" arriba); las ramas `qr`/`code128` y su cacheo no cambian
test/ui/coordinator/*.test.js           una prueba por pantalla nueva, mismo patrón que test/ui/plaza.test.js y test/ui/tabs.test.js
```

Las pantallas nuevas se anidan bajo `src/ui/screens/coordinator/` — el único directorio anidado dentro de `src/` (`domain/`, `data/`, `ui/screens/` y `ui/components/` son planos). La razón es puntual, no un cambio de convención: `visits.js`, `itinerary.js` y `lodging.js` colisionarían por nombre con archivos que ya existen en `src/ui/screens/` (`itinerary.js` de la fase 05, entre otros); anidar bajo `coordinator/` evita inventar prefijos o renombrar archivos del paciente que ya están aprobados.

El hash de `coordinatorApp.js` codifica la pantalla (`#/visits`, `#/intake`, `#/itinerary`, `#/lodging`, `#/qpass`, `#/pass-preview`); qué visita está seleccionada vive en el estado en memoria del router, no en la URL — esta demo no necesita deep-linking a una visita concreta. `#/pass-preview` es la excepción a "cada pantalla es un archivo nuevo bajo `coordinator/`": no tiene pantalla propia, es la reutilización directa de `pass.js` descrita arriba.

`build.py` (fase 05, D19) hoy empaqueta solo `app.html`. Si esta demo necesita publicarse igual de autocontenida, ese ajuste se decide al implementar la fase, no aquí — mientras tanto, servir `coordinator.html` sin construir (`python3 -m http.server`, igual que el resto de esta fase) genera una petición same-origin por cada import de módulo ES, igual que ya le pasa hoy a `app.html` sin construir. Por eso "cero peticiones de red" en los criterios de aceptación y en el recorrido manual se acota a terceros/dominios externos — mismo criterio que usan fase-05 y fase-07 — y no a same-origin.

## Convención obligatoria: `data-nav`

> Todo elemento clicable que navegue entre pantallas de esta demo **debe** usar el atributo `data-nav="<destino>"` — nunca otro nombre. `src/ui/app.js` conecta el clic de toda la app del paciente a un solo selector, `root.querySelectorAll('[data-nav]')`; si `coordinatorApp.js` no cablea sus clics exactamente igual, cualquier botón que use un atributo distinto — `data-tab`, `data-route`, `data-target`, lo que sea — **no navega, y no se nota**: el navegador le da foco visual al botón al tocarlo aunque no tenga ningún listener detrás.
>
> Esto ya pasó. **D28** en `docs/DECISIONS.md` documenta que `src/ui/components/tabs.js` emitía `data-tab="${id}"` en los cinco botones de la barra inferior mientras que `app.js` solo escuchaba `[data-nav]`. La barra inferior del paciente (Inicio/Itinerario/Mapa/Plaza/Ayuda) nunca navegó al tocarla, en ningún despliegue, desde que existe ese archivo — nada lo detectó hasta que el cliente lo reportó en producción como "el menu inferior no funciona". La cobertura se agregó después, en `test/ui/tabs.test.js`.

Dos consecuencias concretas para esta fase:

1. `src/ui/nav.js` — archivo nuevo, no una extensión de `util.js` — trae un helper pequeño y compartido, `attachNav(root)`, que hace el `querySelectorAll('[data-nav]')` + el `addEventListener`. Lo usan **tanto** `app.js` (que se ajusta para importarlo, en vez de su cableado inline actual) **como** `coordinatorApp.js`, para que las dos entradas de la app no puedan volver a divergir en el nombre del atributo — la causa raíz de D28 fue justo que dos archivos implementaron la misma idea por separado. No vive en `util.js`: el comentario de cabecera de ese archivo es explícito — "Sin lógica de fechas ni de negocio... solo escapado de texto y armado de atributos" — y hoy, en efecto, no toca el DOM ni una vez; `querySelectorAll`/`addEventListener` serían el primer código de `util.js` que sí lo hace, y contradirían ese alcance ya documentado.
2. Cada pantalla nueva (`visits.js`, `intake.js`, `itinerary.js`, `lodging.js`, `qpass.js`) trae una prueba que confirma `data-nav="..."` en cada destino clicable y la ausencia de cualquier otro nombre, mismo patrón que `test/ui/tabs.test.js`.

## Criterios de aceptación

- [ ] Abrir `coordinator.html` aterriza directo en la lista de visitas — cero pantallas de login, cero campos de usuario/contraseña
- [ ] La lista de visitas muestra las fixtures existentes de `src/data/fixtures.js` sin transformarlas ni pedir credenciales
- [ ] El alta de visita (nombre de pila, idioma, fechas) agrega una tarjeta nueva a la lista, visible de inmediato, sin recargar
- [ ] El editor de itinerario agrega, edita, mueve y cancela una cita de una visita existente
- [ ] Una cita movida reordena la línea de tiempo de esa visita; una cancelada se muestra tachada, mismo tratamiento visual que la pantalla de itinerario del paciente (fase 05)
- [ ] El paso "emitir QPASS" sube una imagen (`input[type="file"]` + `FileReader.readAsDataURL`) y muestra una vista previa antes de emitir; al emitir, el `QPass` resultante queda con `format: 'image'` y `payload` como esa data: URL — no un símbolo generado ni un `payload` corto escrito a mano
- [ ] `src/ui/screens/pass.js` pinta un QPASS `format: 'image'` como `<img>` (rama nueva de `renderSymbol(pass, t)`), sin pasar por `generateQrMatrix` ni por el generador de Code128; las ramas `qr`/`code128` existentes no cambian su salida
- [ ] Dentro de la misma pestaña de `coordinator.html`, la ruta `#/pass-preview` muestra el QPass `format: 'image'` recién emitido reutilizando `renderPassScreen`/`attachPassScreen` de `pass.js` — sin abrir `app.html`, sin recargar
- [ ] Abrir `#/pass-preview` después de emitir un QPass `format: 'image'` no agrega nada a `localStorage` — `savePassCache` excluye esos pases; verificado inspeccionando Application → Local Storage en las herramientas de desarrollador
- [ ] El registro de hospedaje captura hotel, código de reservación, check-in, check-out, desayuno y recovery, asociados a la visita correcta
- [ ] Todo elemento clicable de navegación usa `data-nav`; ninguna pantalla nueva usa `data-tab`, `data-route` ni ningún otro nombre (D28) — verificado con una aserción de substring por pantalla
- [ ] `app.js` y `coordinatorApp.js` cablean la navegación con el mismo helper compartido (`attachNav(root)` en `src/ui/nav.js`), mínimo el mismo selector `[data-nav]`
- [ ] Recargar la pestaña (F5) en cualquier punto del flujo borra todo lo capturado en la demo — incluida la imagen del QPASS subida, sin rastro en `localStorage` — y regresa al estado inicial de `fixtures.js`
- [ ] Dos pestañas de `coordinator.html` abiertas a la vez no comparten estado: un cambio en una no aparece en la otra
- [ ] Cero peticiones de red a terceros/dominios externos al recorrer el flujo completo (alta, itinerario, QPASS, vista previa del pase, hospedaje) — se comprueba en el panel de red; leer la imagen del QPASS con `FileReader` no genera ninguna
- [ ] Las pantallas nuevas se recorren en 375 × 812 sin scroll horizontal ni texto cortado
- [ ] Áreas tocables de al menos 44 × 44 px
- [ ] Correcta en tema claro y oscuro
- [ ] Los formularios usan cadenas es/en de `i18n.js`; ninguna cadena nueva queda fija en un solo idioma
- [ ] `docs/phases/phase-08-coordinator-panel.md` no se modifica ni queda contradicho por esta fase

## Verificación

```bash
cd "newcity-patient-app" && node --test 'test/ui/coordinator/**/*.test.js'
```

> Mismo ajuste de tooling que las fases anteriores (nota en `phase-01-domain-model.md`): las rutas de directorio fallan con `MODULE_NOT_FOUND` en este Node, así que se usa el patrón glob.

Este proyecto no trae un DOM falso para `node:test` (nota al inicio de `test/ui/plaza.test.js`), así que lo automatizado aquí es del mismo tipo que ya hacen `test/ui/plaza.test.js` y `test/ui/tabs.test.js`: aserciones de substring sobre el HTML que devuelve cada `render*Screen(ctx)` — que aparezcan los campos de cada formulario, que una cita cancelada traiga la clase de tachado, que el input de imagen de `qpass.js` traiga `accept="image/*"`, que cada destino clicable traiga `data-nav="..."` y nunca `data-tab=`, etc. Ningún test de este proyecto simula un clic real ni una carga de archivo real; eso solo se comprueba en el navegador. `pass.js` no tiene suite propia en este repo (se verifica por recorrido, igual que en fase 06) — su rama `format: 'image'`, el segundo parámetro nuevo de `renderSymbol`, el resguardo de `savePassCache` para ese formato, y la ruta `#/pass-preview` que reutiliza todo eso se confirman en el recorrido manual de abajo, no con una prueba nueva.

Recorrido manual, sirviendo el proyecto igual que las fases anteriores (`python3 -m http.server`, nunca `file://` — mismo motivo que README.md):

1. Abrir `coordinator.html` y confirmar que se aterriza en la lista de visitas sin login
2. Dar de alta una visita nueva y verla aparecer en la lista
3. Abrir esa visita, agregar dos citas, mover una y cancelar otra; confirmar que el itinerario se ve como el de la pantalla del paciente (tachado para la cancelada)
4. Tocar "emitir QPASS", subir una imagen con el input de archivo y confirmar que aparece la vista previa antes de emitir
5. Emitir el QPASS y tocar "ver como paciente" (ruta `#/pass-preview`, misma pestaña de `coordinator.html`); confirmar que se ve la imagen subida — no un QR ni un Code128 — usando la pantalla real de `pass.js`, sin abrir `app.html`
6. Registrar hospedaje para esa visita y confirmar que los datos quedan asociados a la visita correcta, no a otra
7. Recorrer las cinco pantallas nuevas más la vista previa del pase con el panel de red abierto: cero peticiones a terceros/dominios externos, incluida la carga de la imagen del QPASS (las peticiones same-origin del import de módulos sin construir no cuentan — ver la nota de `build.py` en "Archivos que toca")
8. Recargar la pestaña (F5) y confirmar que todo lo anterior desapareció — la demo volvió a las fixtures originales, incluida la imagen del QPASS — y que Application → Local Storage no quedó con ningún pase `format: 'image'`
9. Abrir una segunda pestaña de la demo y confirmar que no ve los cambios hechos en la primera
10. Repetir los pasos 2–6 en tema oscuro y en inglés
