// Fase 09 — enrutador y estado de la demo del panel de coordinadores
// (docs/phases/phase-09-coordinator-demo.md). Mismo tipo de módulo que
// src/ui/app.js (fase 05): un boot(root) que resuelve idioma, arma un
// render() cerrado sobre el estado de la sesión, y escucha 'hashchange'
// para repintar. A diferencia de app.js no hay token que resolver
// (?p=...) ni fixtures estáticas que leer directo — todo el estado vive
// en una única instancia de coordinatorStore.js (copia en memoria de
// src/data/fixtures.js, mutable, perdida al recargar) y en qué visita
// está seleccionada, que vive aquí, en el router, no en la URL (esta
// demo no necesita deep-linking a una visita concreta — mismo criterio
// que ya deja por escrito el doc de esta fase).
//
// SEGUNDA excepción sancionada a leer el reloj real: D20 (docs/
// DECISIONS.md) documenta el permiso para src/ui/app.js por nombre — "un
// único punto de todo el proyecto con permiso de leer el reloj real"
// dentro de la UI del paciente. coordinatorApp.js es, a propósito, la
// segunda: es un punto de entrada real y separado (coordinator.html), no
// una pantalla que reciba `now` de otro lado — a diferencia de las cinco
// pantallas de screens/coordinator/, que nunca llaman Date.now()/new
// Date() por su cuenta (ver sus propios encabezados) y siempre reciben
// `now` ya resuelto vía ctx. INV-1 (src/domain/) no se toca por esto:
// ese invariante nunca dependió de dónde vive el reloj real en la UI,
// solo de que src/domain/ mismo nunca lo lea.
//
// Etapa F (#17) — y como es un punto de entrada real, también acepta
// `?now=`, igual que app.html desde la fase 05. No es simetría por
// simetría: #/pass-preview reusa renderPassScreen, que aplica R3, así que
// con el reloj real el pase de cualquier visita de fixture (todas
// fechadas en 2026) se veía revocado y no había forma de revisar cómo le
// va a llegar al paciente. La lectura del parámetro es compartida
// (src/ui/urlParams.js), no una segunda copia que se separe de la de
// app.js.
//
// data-nav (D28): este archivo cablea TODOS los [data-nav] del árbol
// completo con attachNav(root) (src/ui/nav.js) — el mismo helper
// compartido que usa app.js, no una copia independiente — exactamente
// una vez por render(). Ninguna de las cinco pantallas de coordinator/
// llama attachNav ni engancha su propio listener sobre un elemento
// [data-nav]; si alguna lo hiciera, un clic dispararía la navegación dos
// veces.

import { createCoordinatorStore } from './coordinatorStore.js';
import { createHttpApi, createAuthApi } from './api.js';
import { createAuthClient } from './authClient.js';
import { parseNowOverride } from './urlParams.js';
import { resolveInitialLang, translate } from './i18n.js';
import { escapeHtml, classNames } from './util.js';
import { attachNav } from './nav.js';
import { THEME_CSS } from './theme.js';
import { CARD_CSS } from './components/card.js';
import { BADGE_CSS } from './components/badge.js';
import { renderVisitsScreen, attachVisitsScreen, VISITS_CSS } from './screens/coordinator/visits.js';
import { renderIntakeScreen, attachIntakeScreen, INTAKE_CSS } from './screens/coordinator/intake.js';
import { renderImportScreen, attachImportScreen, IMPORT_CSS } from './screens/coordinator/import.js';
import { renderItineraryScreen, attachItineraryScreen, ITINERARY_CSS } from './screens/coordinator/itinerary.js';
import { renderLodgingScreen, attachLodgingScreen, LODGING_CSS } from './screens/coordinator/lodging.js';
import { renderTransfersScreen, attachTransfersScreen, TRANSFERS_CSS } from './screens/coordinator/transfers.js';
import { renderQpassScreen, attachQpassScreen, QPASS_CSS } from './screens/coordinator/qpass.js';
import { renderHandoffScreen, attachHandoffScreen, HANDOFF_CSS } from './screens/coordinator/handoff.js';
import { renderSignInScreen, attachSignInScreen, SIGNIN_CSS } from './screens/coordinator/signin.js';
import { errorText, FORM_ERRORS_CSS } from './screens/coordinator/formErrors.js';
import { renderPassScreen, attachPassScreen, PASS_SCREEN_CSS } from './screens/pass.js';

// Envoltorio flex nada más — el botón en sí (color, tamaño mínimo de
// toque, tipografía) ya sale completo de .nc-button/.nc-button--primary
// (THEME_CSS); no hace falta ninguna regla de color nueva para esto (D36).
const SUBNAV_CSS = `
.nc-visit-subnav { display: flex; gap: 8px; padding: 10px 16px; background: var(--nc-surface); border-bottom: 1px solid var(--nc-card-border); overflow-x: auto; }
.nc-visit-subnav .nc-button { flex: 1; white-space: nowrap; }
/* El encabezado pasó de un solo botón a dos (volver + idioma); sin esto,
   el segundo se apila en vez de quedar a un lado. */
.nc-coord-header-actions { display: flex; gap: 8px; align-items: center; }
.nc-coord-user { font-size: 12px; opacity: 0.75; white-space: nowrap; }
`;

const GATE_CSS = `
.nc-gate { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
.nc-gate-msg { margin: 0; font-size: 14px; opacity: 0.8; }
`;

const ALL_CSS = [THEME_CSS, CARD_CSS, BADGE_CSS, VISITS_CSS, INTAKE_CSS, IMPORT_CSS, ITINERARY_CSS, LODGING_CSS, TRANSFERS_CSS, QPASS_CSS, HANDOFF_CSS, PASS_SCREEN_CSS, SUBNAV_CSS, SIGNIN_CSS, FORM_ERRORS_CSS, GATE_CSS].join('\n');

function injectStylesOnce() {
  if (document.getElementById('nc-styles')) return;
  const style = document.createElement('style');
  style.id = 'nc-styles';
  style.textContent = ALL_CSS;
  document.head.appendChild(style);
}

// Distinta de LANG_STORAGE_KEY en app.js ('nc_lang'): son dos apps
// separadas (coordinator.html / app.html) que, si alguna vez se abren en
// dos pestañas del mismo navegador, no deben pisarse la preferencia de
// idioma una a la otra.
const LANG_STORAGE_KEY = 'nc-coordinator-lang';

// pass-preview no vive aquí adentro: no es una pantalla propia de
// coordinator/, es la reutilización directa de renderPassScreen/
// attachPassScreen (src/ui/screens/pass.js) — mismo criterio que ya deja
// por escrito el doc de esta fase ("#/pass-preview es la excepción a
// 'cada pantalla es un archivo nuevo bajo coordinator/'"). needsVisit
// distingue las rutas que no tienen sentido sin saber de qué visita se
// trata (itinerary/lodging/qpass, y pass-preview aparte, más abajo) de
// las que nunca necesitan una visita seleccionada (visits/intake).
const SCREENS = {
  visits: { render: renderVisitsScreen, attach: attachVisitsScreen, needsVisit: false },
  intake: { render: renderIntakeScreen, attach: attachIntakeScreen, needsVisit: false },
  // Etapa I — needsVisit: false porque esta pantalla CREA la visita, no la
  // edita: pedirle una seleccionada la mandaría a #/visits antes de poder
  // subir nada. Aterriza en el itinerario por el mismo onCreated que usa el
  // alta manual, así que lo importado se revisa en la pantalla de siempre.
  import: { render: renderImportScreen, attach: attachImportScreen, needsVisit: false },
  itinerary: { render: renderItineraryScreen, attach: attachItineraryScreen, needsVisit: true },
  lodging: { render: renderLodgingScreen, attach: attachLodgingScreen, needsVisit: true },
  // Etapa G — junto a hospedaje porque es lo mismo de la visita que no pasa
  // dentro del complejo: dónde duerme y cómo llega. El orden del subnav sale
  // de este objeto, así que aquí es donde se decide.
  transfers: { render: renderTransfersScreen, attach: attachTransfersScreen, needsVisit: true },
  qpass: { render: renderQpassScreen, attach: attachQpassScreen, needsVisit: true },
  // Etapa E — última del subnav a propósito: es el paso que cierra la
  // captura, no el que la abre. Va después de itinerario/hospedaje/QPASS
  // porque mandarle al paciente un enlace a una visita todavía vacía es
  // peor que no mandarle nada (por eso el alta tampoco aterriza aquí).
  handoff: { render: renderHandoffScreen, attach: attachHandoffScreen, needsVisit: true },
};
const ROUTES = new Set([...Object.keys(SCREENS), 'pass-preview']);

// Fix (D36): bug real reportado por el cliente — no existía NINGÚN
// [data-nav] real que llevara de Itinerario a Hospedaje o QPASS (o
// viceversa) para la misma visita, solo "volver a visitas" en el
// encabezado. VISIT_SUBNAV_ROUTES se deriva de SCREENS (needsVisit: true)
// en vez de un arreglo aparte, para que nunca puedan desincronizarse — hoy
// coincide con ['itinerary', 'lodging', 'transfers', 'qpass', 'handoff'],
// pass-preview queda fuera a propósito (no es una pantalla propia de
// coordinator/, ver más abajo). La Etapa E agregó 'handoff' y la G
// 'transfers', y esta lista se enteró sola las dos veces: eso es
// exactamente para lo que se derivaba de SCREENS.
const VISIT_SUBNAV_ROUTES = Object.keys(SCREENS).filter((id) => SCREENS[id].needsVisit);
// Reusa la misma llave i18n que cada pantalla ya usa en su propio <h1> —
// sin cadenas nuevas, mismo criterio que D33/D29 ya aplicaron en esta fase.
const VISIT_SUBNAV_LABEL_KEY = {
  itinerary: 'coordinator.itinerary.title',
  lodging: 'coordinator.lodging.title',
  transfers: 'coordinator.transfers.title',
  qpass: 'coordinator.qpass.title',
  handoff: 'coordinator.handoff.title',
};

// Pieza pura, exportada para prueba directa por substring (test/ui/
// coordinator/subnav.test.js) — mismo criterio que cada render*Screen de
// screens/coordinator/. Reusa .nc-button/.nc-button--primary (THEME_CSS)
// para el estado activo en vez del patrón .nc-tab/.nc-tab--active propio
// de tabs.js (barra inferior del paciente): son dos contextos visuales a
// propósito distintos, no un descuido — tabs.js es chrome permanente de 5
// pestañas siempre visible, este subnav son 3 botones contextuales que
// solo aparecen con una visita ya elegida (ver dónde se cablea, abajo en
// render()).
export function renderVisitSubnav(route, t) {
  const items = VISIT_SUBNAV_ROUTES.map((id) => {
    const isActive = id === route;
    return `<button type="button" class="${classNames(['nc-button', isActive && 'nc-button--primary'])}" data-nav="${id}" role="tab" aria-selected="${isActive}">${escapeHtml(t(VISIT_SUBNAV_LABEL_KEY[id]))}</button>`;
  }).join('\n');
  // El aria-label ya no está fijo en español (lo estuvo, siguiendo el
  // precedente de tabs.js): con el panel traducible de verdad — ahora tiene
  // su propio botón de idioma, ver renderCoordinatorHeader — dejar la única
  // etiqueta accesible en español significaba que un lector de pantalla en
  // inglés anunciaba este nav en otro idioma que el resto de la pantalla.
  return `<nav class="nc-visit-subnav" role="tablist" aria-label="${escapeHtml(t('coordinator.subnavLabel'))}">${items}</nav>`;
}

// Encabezado del panel. Pieza pura y exportada por la misma razón que
// renderVisitSubnav: render() vive dentro de boot(), cerrado sobre
// document/location, y así el chrome sí se puede probar por substring
// (test/ui/coordinator/header.test.js).
//
// Dos cambios respecto a la fase 09:
//   - Botón de idioma (data-role="lang-toggle"). El panel resolvía `lang`
//     una sola vez al boot y no había forma de cambiarlo sin tocar el
//     idioma del navegador o escribir localStorage a mano. Reutiliza
//     common.langToggle, la misma llave del lado paciente (src/ui/app.js),
//     así que no entra ninguna cadena nueva.
//   - "Volver a visitas" ya no se pinta estando en #/visits: ahí el clic no
//     llevaba a ningún lado (el hash no cambia, no hay 'hashchange', no
//     pasa nada). Un control que no hace nada es peor que ninguno.
//   - Etapa D: quién está dentro y el botón de salir. Sin él no había forma
//     de terminar una sesión: la máquina de coordinación se comparte y la
//     cookie dura un turno completo de ocho horas (src/server/sessions.js),
//     así que la siguiente persona que se sentara quedaría firmando cada
//     mutación con la cuenta de quien se levantó — justo lo que las cuentas
//     individuales existían para evitar. `user` es opcional: sin sesión
//     (pantalla de acceso) no se pinta ninguna de las dos cosas.
export function renderCoordinatorHeader(route, t, { user } = {}) {
  // Dos condiciones, no una. La segunda salió del navegador: al darle a
  // Salir estando en #/qpass, el hash se queda donde estaba y la pantalla
  // de acceso heredaba este botón. El clic cambiaba el hash y repintaba…
  // la misma pantalla de acceso, porque sin sesión no hay ruta que valga.
  // El #20 otra vez, entrando por la puerta que abrió la Etapa C.
  const backButton = route === 'visits' || !user
    ? ''
    : `<button type="button" class="nc-button" data-nav="visits">${escapeHtml(t('coordinator.backToVisits'))}</button>`;
  // displayName primero, username de respaldo: el nombre para mostrar es
  // opcional en la cuenta (src/server/accountStore.js) y un encabezado en
  // blanco no dice quién está firmando.
  const quien = user
    ? `<span class="nc-coord-user">${escapeHtml(user.displayName || user.username || '')}</span>`
    : '';
  const salir = user
    ? `<button type="button" class="nc-button" data-role="sign-out">${escapeHtml(t('coordinator.auth.signOut'))}</button>`
    : '';
  return `
    <header class="nc-header">
      <span class="nc-header-title">${escapeHtml(t('coordinator.appName'))}</span>
      <div class="nc-coord-header-actions">
        ${quien}
        ${backButton}
        <button type="button" class="nc-button" data-role="lang-toggle">${escapeHtml(t('common.langToggle'))}</button>
        ${salir}
      </div>
    </header>
  `;
}

// Los tres estados en que el panel todavía no puede pintar una pantalla:
// verificando la sesión, esperando datos, o sin haber podido traerlos.
//
// Ninguno existía antes de la Etapa D — el store era una copia en memoria
// de las fixtures, así que siempre había algo que pintar desde el primer
// milisegundo. Con la API de por medio hay un hueco, y pintar la pantalla
// vacía mientras llega la respuesta diría "esta visita no tiene citas"
// cuando lo cierto es "todavía no me contestan": la misma mentira que el
// store se cuida de no contar con sus dos mapas separados.
export function renderCoordinatorGate({ kind, code }, t) {
  if (kind === 'error') {
    // Reintentar una visita que ya no existe no la va a resucitar; ofrecer
    // el botón invita a picarle diez veces contra un 404.
    const reintentar = code === 'gone'
      ? ''
      : `<button type="button" class="nc-button nc-button--primary" data-role="retry">${escapeHtml(t('coordinator.retry'))}</button>`;
    return `
      <section class="nc-screen nc-gate">
        <p class="nc-gate-msg" role="alert">${escapeHtml(errorText(t, code))}</p>
        ${reintentar}
      </section>
    `;
  }
  // role="status" y no "alert": esperar no es una emergencia, y anunciarlo
  // como tal interrumpe lo que el lector de pantalla esté diciendo.
  return `
    <section class="nc-screen nc-gate">
      <p class="nc-gate-msg" role="status" aria-live="polite">${escapeHtml(t(kind === 'checking' ? 'coordinator.auth.checking' : 'coordinator.loading'))}</p>
    </section>
  `;
}

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  return ROUTES.has(hash) ? hash : 'visits';
}

// `search` entra por opciones con location.search por omisión, mismo
// patrón que boot() del lado paciente: es lo que permite que exista
// siquiera una prueba de esto sin montar DOM.
export function boot(root, { search = location.search } = {}) {
  injectStylesOnce();

  // Se resuelve UNA vez al arrancar, no en cada render(): la URL no cambia
  // durante la sesión (la navegación del panel es por hash) y releerla en
  // cada repintado solo daría más lugares donde equivocarse.
  const nowOverride = parseNowOverride(search);

  // Etapa D — el panel deja de ser una copia en memoria de las fixtures.
  //
  // DOS transportes, no uno. Aquí había uno solo, con el argumento de que
  // "la cookie viaja igual para /api/auth y /api/coordinator" — cierto, y
  // sin embargo son dos Functions en dos rutas distintas
  // (netlify/functions/auth.mjs y coordinator.mjs). Con uno solo, entrar
  // pegaba en /api/coordinator/login: la pantalla de acceso se veía
  // perfecta y nadie podía entrar. Las bases viven con nombre en api.js y
  // test/ui/api.test.js las ata a las que exporta el servidor.
  const store = createCoordinatorStore({ api: createHttpApi() });
  const auth = createAuthClient({ api: createAuthApi() });

  let selectedVisitId = null;

  // ---- sesión -----------------------------------------------------------
  // 'checking' al arrancar y no 'out': mostrar la pantalla de acceso a
  // alguien que YA tiene sesión válida —el caso normal al recargar— le
  // pediría la contraseña sin necesidad, y ese hábito es justo el que
  // entrena a teclearla en cualquier formulario que la pida.
  let sesion = 'checking'; // 'checking' | 'in' | 'out'
  let user = null;
  let authError = null;
  let authBusy = false;
  // Sobrevive a un intento fallido; la contraseña jamás (ver signin.js).
  let usuarioTecleado = '';

  // ---- carga de datos ----------------------------------------------------
  let listaCargada = false;
  let listaError = null;
  let visitaError = null;
  let enVuelo = false;

  // ---- resultado de la última mutación -----------------------------------
  let pendingErrors = null;
  let pendingRequestError = null;

  const storedLang = localStorage.getItem(LANG_STORAGE_KEY);
  // `let`, no `const`: el panel ya tiene su propio botón de idioma
  // (renderCoordinatorHeader). Antes se resolvía una sola vez al boot y la
  // única forma de ver el panel en el otro idioma era cambiar el idioma del
  // navegador/SO o escribir 'nc-coordinator-lang' a mano en localStorage —
  // impracticable para una coordinadora que atiende pacientes en los dos
  // idiomas. Mismo mecanismo que ya usa app.js del lado paciente; la llave
  // de localStorage distinta (ver arriba) es justo lo que evita que las dos
  // preferencias se pisen.
  let lang = resolveInitialLang(navigator.language, storedLang);
  function t(path) {
    return translate(lang, path);
  }

  // Mensaje de confirmación que debe sobrevivir EXACTAMENTE un repintado.
  // Vive aquí y no en la pantalla porque la pantalla se destruye y se
  // vuelve a construir en cada render(): cualquier cosa que una pantalla
  // escriba en su propio DOM justo antes de pedir un repintado se pierde.
  // render() lo consume y lo limpia, así que navegar o volver a pintar por
  // cualquier otro motivo ya no lo muestra.
  //
  // render() se queda SIN parámetros a propósito: también es el listener
  // de 'hashchange', y ahí recibiría un Event como primer argumento.
  let pendingFlash = null;

  // La sesión se cayó a media captura. No es un error de esta pantalla ni
  // de este campo: se resuelve volviendo a entrar, y lo que estuviera
  // pintado ya no vale porque se pintó con datos que ya no podemos
  // refrescar.
  function caducar() {
    sesion = 'out';
    user = null;
    authError = 'expired';
    listaCargada = false;
    visitaError = null;
  }

  // Traduce el resultado de una mutación a lo que hay que pintar después.
  // Devuelve si salió bien, para que quien llama decida si además navega.
  //
  // Los tres estados pendientes se limpian SIEMPRE al empezar: si no, el
  // error del intento anterior seguiría en pantalla junto al éxito del
  // nuevo, y "Guardado" debajo de "Falta la zona horaria" no dice nada
  // útil sobre cuál de los dos es el estado real.
  function aplicarResultado(res, flashOk) {
    pendingFlash = null;
    pendingErrors = null;
    pendingRequestError = null;

    // Sin resultado (una pantalla que solo pide repintar) cuenta como bien:
    // no hay nada que reportar.
    if (!res || res.ok) {
      pendingFlash = typeof flashOk === 'string' ? flashOk : null;
      return true;
    }
    if (res.unauthenticated) {
      caducar();
      return false;
    }
    // Errores por campo o un fallo de la petición entera, nunca los dos:
    // son dos huecos distintos en el formulario y llenarlos a la vez
    // duplicaría el mismo problema con dos redacciones.
    if (res.errors) pendingErrors = res.errors;
    else pendingRequestError = res.notFound ? 'gone' : 'network';
    return false;
  }

  // Cambiar de visita invalida lo que supiéramos de la anterior: si la que
  // se abrió antes no se pudo cargar, ese error no es de esta.
  function seleccionar(visitId) {
    selectedVisitId = visitId;
    visitaError = null;
  }

  async function verificarSesion() {
    const res = await auth.session();
    if (res.ok) {
      sesion = 'in';
      user = res.user;
      authError = null;
    } else {
      sesion = 'out';
      user = null;
      // Un fallo de red al arrancar NO se anuncia como sesión vencida: no
      // sabemos si venció, solo que no pudimos preguntar.
      authError = res.failed ? 'network' : null;
    }
    render();
  }

  // render() es síncrono a propósito (también es el listener de
  // 'hashchange', que no espera promesas), así que la carga se dispara
  // desde aquí y vuelve a pintar cuando termina. `enVuelo` evita que dos
  // repintados seguidos lancen dos veces la misma petición; los flags de
  // error evitan el ciclo infinito de "no hay datos -> pide -> falla -> no
  // hay datos".
  function asegurarDatos(route) {
    if (enVuelo || sesion !== 'in') return;

    if (!listaCargada && !listaError) {
      enVuelo = true;
      store.loadVisits().then((res) => {
        enVuelo = false;
        if (res.ok) listaCargada = true;
        else if (res.unauthenticated) caducar();
        else listaError = 'network';
        render();
      });
      return;
    }

    const necesitaVisita = route === 'pass-preview' || SCREENS[route]?.needsVisit;
    if (necesitaVisita && selectedVisitId && !store.getVisit(selectedVisitId) && !visitaError) {
      enVuelo = true;
      const pedida = selectedVisitId;
      store.loadVisit(pedida).then((res) => {
        enVuelo = false;
        // Si mientras tanto se cambió de visita, esta respuesta ya no
        // describe lo que hay en pantalla: se ignora en vez de escribir el
        // error de una visita sobre otra.
        if (pedida !== selectedVisitId) return render();
        if (res.unauthenticated) caducar();
        else if (!res.ok) visitaError = res.notFound ? 'gone' : 'network';
        render();
      });
    }
  }

  // Pinta el chrome mínimo (encabezado, para poder cambiar de idioma o
  // salir) más un solo bloque de contenido. Lo usan la pantalla de acceso y
  // los tres estados de espera.
  function pintarSolo(route, contenido, conUsuario) {
    root.innerHTML = `
      ${renderCoordinatorHeader(route, t, conUsuario ? { user } : {})}
      <main class="nc-main" data-role="screen-mount"></main>
    `;
    root.querySelector('[data-role="screen-mount"]').innerHTML = contenido;
    return root.querySelector('[data-role="screen-mount"]');
  }

  async function entrar(credenciales) {
    authBusy = true;
    authError = null;
    usuarioTecleado = credenciales.username;
    render();

    const res = await auth.signIn(credenciales);
    authBusy = false;
    if (res.ok) {
      sesion = 'in';
      user = res.user;
      usuarioTecleado = '';
      listaCargada = false;
      listaError = null;
    } else {
      authError = res.invalidCredentials ? 'invalidCredentials' : 'network';
    }
    render();
  }

  async function salir() {
    // El estado local se tira ANTES de esperar la respuesta: si la petición
    // falla, la sesión del navegador sigue viva pero la pantalla ya no
    // muestra el expediente de nadie. Al revés —esperar y luego limpiar—
    // deja los datos del paciente en pantalla mientras la red decide.
    sesion = 'out';
    user = null;
    authError = null;
    listaCargada = false;
    visitaError = null;
    selectedVisitId = null;
    render();
    await auth.signOut();
  }

  // El chrome que existe en TODAS las pantallas, incluidas las tres puertas
  // (acceso, espera, fallo): navegación, idioma, salir, y el reintento
  // cuando lo hay. Vivía dentro de render(), al final, así que las puertas
  // —que devuelven antes de llegar ahí— se quedaban con un botón de idioma
  // muerto: la única forma de cambiar de idioma en la pantalla de acceso
  // habría sido entrar primero.
  function cablearChrome(onRetry) {
    attachNav(root);

    // El toggle de idioma no es un [data-nav] (no navega a ningún lado:
    // cambia el idioma de la ruta actual), así que se cablea aparte, igual
    // que data-select-visit. Persistir ANTES de repintar: si render()
    // fallara, la preferencia ya quedó guardada y la recarga muestra el
    // idioma que la coordinadora eligió.
    root.querySelector('[data-role="lang-toggle"]')?.addEventListener('click', () => {
      lang = lang === 'es' ? 'en' : 'es';
      try {
        localStorage.setItem(LANG_STORAGE_KEY, lang);
      } catch {
        // Modo privado / almacenamiento lleno: cambiar de idioma en esta
        // sesión debe funcionar igual, solo no se recuerda para la próxima.
      }
      render();
    });

    root.querySelector('[data-role="sign-out"]')?.addEventListener('click', salir);
    if (onRetry) root.querySelector('[data-role="retry"]')?.addEventListener('click', onRetry);
  }

  // Navegar por hash tiene un hueco: si YA estamos en ese hash, el
  // navegador no dispara 'hashchange' y no se repinta nada. Antes eso no se
  // notaba porque el único destino era #/itinerary desde #/intake; ahora
  // que un alta puede fallar y quedarse donde está, sí.
  function irA(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function render() {
    const flash = pendingFlash;
    const errors = pendingErrors;
    const requestError = pendingRequestError;
    pendingFlash = null;
    pendingErrors = null;
    pendingRequestError = null;

    // Recalculado en cada render(), nunca cacheado al boot (ver
    // encabezado del archivo). Desde la Etapa D solo lo usa #/pass-preview:
    // las mutaciones ya no lo llevan porque la hora que queda escrita en el
    // expediente la pone el servidor.
    //
    // Etapa F — salvo que la URL traiga `?now=`, y entonces ese valor manda
    // y no se mueve entre repintados. Es solo del navegador: el servidor
    // se niega a honrar ningún `?now=` (visitHandler.js), así que esto no
    // puede volver opcional la caducidad de nada, solo lo que se pinta.
    const now = nowOverride ?? new Date().toISOString();
    const route = currentRoute();

    // --- puerta de sesión, antes que cualquier otra cosa ------------------
    // Antes de esto no había ninguna: el panel pedía datos a
    // /api/coordinator, que exige sesión en toda ruta, y recibía 401 en
    // todo sin decir por qué.
    if (sesion === 'checking') {
      pintarSolo(route, renderCoordinatorGate({ kind: 'checking' }, t), false);
      cablearChrome();
      return;
    }

    if (sesion === 'out') {
      const ctx = { t, error: authError, username: usuarioTecleado, busy: authBusy, onSubmit: entrar };
      const mount = pintarSolo(route, renderSignInScreen(ctx), false);
      attachSignInScreen(mount, ctx);
      cablearChrome();
      return;
    }

    // --- puerta de datos ---------------------------------------------------
    asegurarDatos(route);

    if (listaError) {
      pintarSolo(route, renderCoordinatorGate({ kind: 'error', code: listaError }, t), true);
      cablearChrome(() => {
        listaError = null;
        render();
      });
      return;
    }
    if (!listaCargada) {
      pintarSolo(route, renderCoordinatorGate({ kind: 'loading' }, t), true);
      cablearChrome();
      return;
    }

    const necesitaVisita = route === 'pass-preview' || SCREENS[route].needsVisit;
    if (necesitaVisita && selectedVisitId) {
      if (visitaError) {
        pintarSolo(route, renderCoordinatorGate({ kind: 'error', code: visitaError }, t), true);
        cablearChrome(() => {
          visitaError = null;
          render();
        });
        return;
      }
      if (!store.getVisit(selectedVisitId)) {
        // El expediente completo todavía no llega. Pintar la pantalla vacía
        // aquí diría "esta visita no tiene citas" — la misma mentira que el
        // store se cuida de no contar (ver sus dos mapas separados).
        pintarSolo(route, renderCoordinatorGate({ kind: 'loading' }, t), true);
        cablearChrome();
        return;
      }
    }

    const passRecord = route === 'pass-preview' ? store.getVisitWithPasses(selectedVisitId) : null;

    if (route === 'pass-preview') {
      // selectedVisitId nulo Y "la visita ya no existe" caen en el mismo
      // `!passRecord`: getVisitWithPasses(null) también regresa null
      // (Map#get(null) nunca coincide con un id real), así que un solo
      // chequeo cubre las dos condiciones que pide el encargo.
      if (!passRecord) {
        location.hash = '#/visits';
        return;
      }
    } else if (SCREENS[route].needsVisit && !selectedVisitId) {
      location.hash = '#/visits';
      return;
    }

    // pass-preview ENTRA aquí (antes quedaba fuera): era la misma clase de
    // callejón sin salida que arregló D36. Desde la vista previa del pase,
    // el único control era "volver a visitas", que además pierde la visita
    // seleccionada — no había forma de regresar a QPASS, itinerario u
    // hospedaje de la MISMA visita sin volver a buscarla en la lista.
    // Para cuando llegamos aquí ya hay visita garantizada en las dos ramas:
    // needsVisit && !selectedVisitId cortó con el return de arriba, y
    // pass-preview cortó con !passRecord.
    const showSubnav = route === 'pass-preview' || SCREENS[route].needsVisit;

    document.title = t('coordinator.appName'); // constante a propósito, nunca nombre de paciente — mismo espíritu que INV-6 del lado app.js
    document.documentElement.lang = lang;
    // pass.js nunca usa tema oscuro (fase 06): mismo mecanismo que
    // src/ui/app.js aplica a su propia ruta #/pass, reutilizado aquí para
    // #/pass-preview porque reutiliza el mismo renderPassScreen/
    // attachPassScreen sin copiarlos. Va en <body>, no en #app: el fondo
    // de <body> es un ancestro de #app, así que una variable puesta solo
    // en #app nunca sube hasta él (razón ya documentada, casi textual, en
    // src/ui/app.js).
    document.body.className = route === 'pass-preview' ? 'nc-force-light' : '';

    // role="tabpanel" solo cuando de verdad hay un tablist arriba: los
    // botones del subnav se anuncian role="tab", y un tab sin panel al que
    // corresponder es una promesa que la pantalla no cumple.
    const mainRole = showSubnav ? ' role="tabpanel"' : '';
    root.innerHTML = `
      ${renderCoordinatorHeader(route, t, { user })}
      ${showSubnav ? renderVisitSubnav(route, t) : ''}
      <main class="nc-main" data-role="screen-mount"${mainRole}></main>
    `;
    const mount = root.querySelector('[data-role="screen-mount"]');

    if (route === 'pass-preview') {
      // ephemeral: true (fix de revisión adversarial, fase 09; ver
      // src/ui/screens/pass.js y test/ui/pass.test.js): esta vista previa
      // muestra el pase de la visita que esté armando la coordinadora en
      // ese momento, no la sesión real de un paciente — sin esta bandera,
      // attachPassScreen guardaría ese payload en el MISMO localStorage
      // del navegador (nc_pass_cache:<visitId>), violando la promesa
      // explícita del doc de esta fase ("nunca... localStorage").
      const ctx = { visit: passRecord.visit, passes: passRecord.passes, now, lang, t, ephemeral: true };
      mount.innerHTML = renderPassScreen(ctx);
      attachPassScreen(mount, ctx);
    } else {
      const screen = SCREENS[route];
      // Un solo ctx superset para las cinco pantallas propias, en vez de
      // una forma distinta por pantalla: cada render*Screen/attach*Screen
      // ya desestructura solo las llaves que le tocan (ver el reporte de
      // cada pantalla) e ignora el resto — más simple que armar cinco
      // formas de ctx para un router de este tamaño.
      const ctx = {
        store,
        visitId: selectedVisitId,
        lang,
        t,
        flash,
        // Etapa E — de dónde sale el enlace que se le manda al paciente.
        // Entra por ctx y no lo lee handoff.js de `location` por su cuenta:
        // las pantallas de este directorio son puras y se prueban sin DOM,
        // y este archivo ya es el punto sancionado para tocar `location`
        // (igual que con el reloj real, ver el encabezado).
        origin: location.origin,
        // Etapa D — lo que el servidor rechazó del último intento. Antes
        // no existía nada de esto porque no había servidor que rechazara
        // nada: el store guardaba lo que le dieran. `errors` es por campo,
        // `requestError` es de la petición entera.
        errors,
        requestError,
        // intake.js no navega por sí mismo (su propio reporte lo dice
        // explícito: "el enrutador decide qué hacer con la visita
        // nueva"). El `newVisit` que entrega se DESCARTABA: había que
        // volver a buscar la visita recién creada en la lista y hacer clic
        // para poder capturarle nada. Ahora queda seleccionada y se
        // aterriza en su itinerario — el mismo destino al que lleva elegir
        // una visita de la lista (ver [data-select-visit], abajo), y lo
        // primero que hay que capturar tras dar de alta a alguien.
        // Solo se cambia el hash, igual que el resto de la navegación de
        // este panel (D28/attachNav); el listener de 'hashchange' de abajo
        // es quien vuelve a pintar, no una llamada a render() aquí.
        // Etapa D — recibe el resultado del store, no la visita. La visita
        // solo existe si el servidor la aceptó, y antes esa diferencia no
        // viajaba a ningún lado: un alta rechazada se veía igual que una
        // buena, con `newVisit` en undefined, y el `.id` tronaba.
        onCreated: (res) => {
          if (!aplicarResultado(res)) return render();
          seleccionar(res.visit.id);
          irA('#/itinerary');
        },
        // itinerary.js/lodging.js mutan la MISMA visita y se quedan en la
        // misma ruta — no hay cambio de hash que un listener de
        // 'hashchange' pueda aprovechar, así que la única forma de que la
        // pantalla refleje la mutación es volver a llamar render()
        // directamente. Barato e idempotente para el tamaño de esta demo.
        //
        // Etapa D — el primer argumento es el resultado del store; el
        // segundo, opcional, el mensaje a mostrar si salió bien (lodging.js
        // manda 'saved'; itinerary.js no manda ninguno porque ahí el cambio
        // se ve solo en las tarjetas). Antes solo llegaba el mensaje, así
        // que un rechazo del servidor se repintaba idéntico a un guardado
        // correcto: la cita simplemente no aparecía y nadie decía por qué.
        onChange: (res, flashOk) => {
          aplicarResultado(res, flashOk);
          render();
        },
        // qpass.js deliberadamente no pinta su propio estado "emitido"
        // (ver su propio encabezado): solo muta la store y llama esto.
        // render() de nuevo es lo que hace aparecer, ya cableado por
        // attachNav, el botón data-nav="pass-preview" de la vista
        // "emitido".
        onIssued: (res) => {
          aplicarResultado(res);
          render();
        },
      };
      mount.innerHTML = screen.render(ctx);
      if (screen.attach) screen.attach(mount, ctx);
    }

    cablearChrome();

    // data-select-visit (visits.js) no es un destino fijo de navegación —
    // carga un id variable que data-nav no puede expresar — así que este
    // router lo cablea aparte, con su propio listener, en vez de forzar
    // ese caso dentro de attachNav (que D28 define solo para destinos
    // fijos).
    root.querySelectorAll('[data-select-visit]').forEach((el) => {
      el.addEventListener('click', () => {
        seleccionar(el.dataset.selectVisit);
        // Aterrizaje default tras elegir una visita: esta demo no tiene
        // una pantalla de "detalle" propia, y el itinerario es lo primero
        // que necesita ver una coordinadora de una visita ya existente.
        location.hash = '#/itinerary';
      });
    });
  }

  window.addEventListener('hashchange', render);
  render();          // pinta "verificando sesión…" de inmediato
  verificarSesion(); // y pregunta; cuando conteste, vuelve a pintar
}
