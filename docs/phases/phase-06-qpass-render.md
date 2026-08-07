# Fase 06 — Render del QPASS

**Depende de:** fases 01, 03 y 05.
**Entrega:** la pantalla del pase de acceso, lista para que una lectora la lea de la pantalla del teléfono.

## Alcance

Es la pantalla de la que depende que el paciente entre al edificio. Si falla, el paciente se queda en la puerta. Merece su propia fase.

Cubre: render del símbolo, legibilidad física, y funcionamiento **sin conexión**.

## Archivos que toca

```
src/render/qr.js            generador de QR, sin dependencias externas
src/render/code128.js       generador de Code128
src/ui/screens/pass.js      pantalla a pantalla completa
src/ui/passCache.js         guarda el último pase válido en el dispositivo
test/render/qr.test.js
test/render/code128.test.js
test/ui/passCache.test.js
```

Los generadores se escriben sin dependencias: la página se publica con CSP estricta y todo va en línea.

## Comportamiento

- El símbolo ocupa el mayor cuadrado posible, con margen quieto alrededor
- Negro sobre blanco puro, sin tema oscuro en esta pantalla — la lectora necesita contraste máximo
- Al abrir: brillo al máximo donde el navegador lo permita, y pantalla activa vía Wake Lock cuando exista
- Debajo del símbolo: para qué acceso sirve (`torre`, `piso 27`, `estacionamiento`) y hasta qué hora vale
- Si hay varios pases válidos, se pasa entre ellos deslizando, en el orden de R3
- **Sin conexión:** se muestra el último pase válido guardado, con el aviso "sin conexión · guardado a las 10:42"
- **Nunca** se muestra un pase revocado o fuera de ventana, ni siquiera desde caché (INV-4). La caché guarda `validUntil` y `revokedAt` y se vuelve a evaluar en cada apertura
- **`validUntil: null` es el caso normal y significa que el pase no caduca** (PRD §6.5). La caché tiene que distinguir "sin caducidad" de "sin dato": un `null` mal interpretado como fecha inválida apagaría el pase y dejaría al paciente fuera del edificio. Es el fallo más caro de esta fase

## Criterios de aceptación

- [ ] Un QR generado por `qr.js` se decodifica correctamente; la prueba compara contra vectores conocidos
- [ ] Un Code128 generado se decodifica correctamente contra vectores conocidos
- [ ] `payload` con caracteres no ASCII se codifica sin corromperse
- [ ] La pantalla del pase no aplica tema oscuro
- [ ] Con modo avión activado, el último pase válido sigue visible con su aviso
- [ ] Un pase revocado **no** se muestra desde caché aunque no haya conexión (INV-4); una prueba de `passCache` lo cubre
- [ ] Un pase con `validUntil` en el pasado tampoco se muestra desde caché
- [ ] Un pase con `validUntil: null` **sí** se muestra desde caché, sin importar cuántos días lleve guardado; prueba explícita con 7 días transcurridos
- [ ] Con dos pases válidos se puede pasar de uno a otro
- [ ] **Prueba física:** una lectora real lee el símbolo desde la pantalla de un teléfono, a brillo normal de interior — con un QPASS **real** (D31: la imagen que suba una coordinadora, fase 09), no el QR generado por `qr.js` a partir de un `payload` de fixture. Ese QR sigue verificado módulo a módulo (ver abajo), pero probarlo contra la lectora real no confirmaría nada: no está ligado a ningún acceso real del edificio

## Verificación

```bash
cd "newcity-patient-app" && node --test 'test/render/**/*.test.js' 'test/ui/passCache.test.js'
```

> Mismo ajuste de tooling que las fases anteriores (ver nota en phase-01-domain-model.md): `test/render/` como ruta de directorio falla con `MODULE_NOT_FOUND` en este Node, así que se usa el patrón glob.

La prueba de decodificación es automática — y va más allá del redondeo contra el propio decodificador (que no distingue un algoritmo bien hecho de un malentendido compartido entre encoder y decoder): el símbolo QR se verificó módulo a módulo contra `nayuki/QR-Code-generator` (librería de referencia externa, MIT) y decodificándolo con `cv2.QRCodeDetector` de OpenCV; el Code128 se generó con la tabla de patrones de `python-barcode` (también externa). La prueba física con lectora real la hace el cliente en sitio; sin ella la fase no se declara terminada, porque es la única forma de saber si el pase realmente abre la puerta.

D31 (fase 09): el cliente probó `qr-demo.png` en su teléfono (URL, ícono al agregar a inicio) pero no intentó la prueba física de este criterio, porque el QR de esta fase sale de un `payload` de fixture (`payload-q1` etc., `src/data/fixtures.js`) — no un QPASS real emitido por NewCity, así que no hay ningún acceso real que debiera abrir. Confirma, desde el otro lado, la decisión de fase 09: el QPASS real es una imagen que sube la coordinadora (`QPass.format: 'image'`), no un `payload` que este generador codifique. La prueba física de este criterio queda bloqueada hasta que exista esa imagen real, no hasta que el cliente tenga tiempo de probar con la de fixture — son cosas distintas.
