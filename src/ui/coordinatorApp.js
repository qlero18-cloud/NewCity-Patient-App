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
// data-nav (D28): este archivo cablea TODOS los [data-nav] del árbol
// completo con attachNav(root) (src/ui/nav.js) — el mismo helper
// compartido que usa app.js, no una copia independiente — exactamente
// una vez por render(). Ninguna de las cinco pantallas de coordinator/
// llama attachNav ni engancha su propio listener sobre un elemento
// [data-nav]; si alguna lo hiciera, un clic dispararía la navegación dos
// veces.

import { createCoordinatorStore } from './coordinatorStore.js';
import { resolveInitialLang, translate } from './i18n.js';
import { escapeHtml, classNames } from './util.js';
import { attachNav } from './nav.js';
import { THEME_CSS } from './theme.js';
import { CARD_CSS } from './components/card.js';
import { BADGE_CSS } from './components/badge.js';
import { renderVisitsScreen, attachVisitsScreen, VISITS_CSS } from './screens/coordinator/visits.js';
import { renderIntakeScreen, attachIntakeScreen, INTAKE_CSS } from './screens/coordinator/intake.js';
import { renderItineraryScreen, attachItineraryScreen, ITINERARY_CSS } from './screens/coordinator/itinerary.js';
import { renderLodgingScreen, attachLodgingScreen, LODGING_CSS } from './screens/coordinator/lodging.js';
import { renderQpassScreen, attachQpassScreen, QPASS_CSS } from './screens/coordinator/qpass.js';
import { renderPassScreen, attachPassScreen, PASS_SCREEN_CSS } from './screens/pass.js';

// Envoltorio flex nada más — el botón en sí (color, tamaño mínimo de
// toque, tipografía) ya sale completo de .nc-button/.nc-button--primary
// (THEME_CSS); no hace falta ninguna regla de color nueva para esto (D36).
const SUBNAV_CSS = `
.nc-visit-subnav { display: flex; gap: 8px; padding: 10px 16px; background: var(--nc-surface); border-bottom: 1px solid var(--nc-card-border); overflow-x: auto; }
.nc-visit-subnav .nc-button { flex: 1; white-space: nowrap; }
`;

const ALL_CSS = [THEME_CSS, CARD_CSS, BADGE_CSS, VISITS_CSS, INTAKE_CSS, ITINERARY_CSS, LODGING_CSS, QPASS_CSS, PASS_SCREEN_CSS, SUBNAV_CSS].join('\n');

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
  itinerary: { render: renderItineraryScreen, attach: attachItineraryScreen, needsVisit: true },
  lodging: { render: renderLodgingScreen, attach: attachLodgingScreen, needsVisit: true },
  qpass: { render: renderQpassScreen, attach: attachQpassScreen, needsVisit: true },
};
const ROUTES = new Set([...Object.keys(SCREENS), 'pass-preview']);

// Fix (D36): bug real reportado por el cliente — no existía NINGÚN
// [data-nav] real que llevara de Itinerario a Hospedaje o QPASS (o
// viceversa) para la misma visita, solo "volver a visitas" en el
// encabezado. VISIT_SUBNAV_ROUTES se deriva de SCREENS (needsVisit: true)
// en vez de un arreglo aparte, para que nunca puedan desincronizarse — hoy
// coincide con ['itinerary', 'lodging', 'qpass'], pass-preview queda fuera
// a propósito (no es una pantalla propia de coordinator/, ver más abajo).
const VISIT_SUBNAV_ROUTES = Object.keys(SCREENS).filter((id) => SCREENS[id].needsVisit);
// Reusa la misma llave i18n que cada pantalla ya usa en su propio <h1> —
// sin cadenas nuevas, mismo criterio que D33/D29 ya aplicaron en esta fase.
const VISIT_SUBNAV_LABEL_KEY = {
  itinerary: 'coordinator.itinerary.title',
  lodging: 'coordinator.lodging.title',
  qpass: 'coordinator.qpass.title',
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
  // aria-label fijo en español, nunca traducido: mismo precedente ya
  // establecido por tabs.js ("Navegación principal") para esta misma app
  // bilingüe — no se "corrige" aquí como cambio suelto fuera de alcance.
  return `<nav class="nc-visit-subnav" role="tablist" aria-label="Navegación de la visita">${items}</nav>`;
}

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  return ROUTES.has(hash) ? hash : 'visits';
}

export function boot(root) {
  injectStylesOnce();

  const store = createCoordinatorStore();
  let selectedVisitId = null;

  const storedLang = localStorage.getItem(LANG_STORAGE_KEY);
  const lang = resolveInitialLang(navigator.language, storedLang);
  // Sin selector de idioma en esta demo — el encargo de esta pantalla
  // describe el alcance mínimo pedido para su chrome ("just enough to
  // navigate"): un botón para volver a la lista de visitas, nada más. lang
  // se resuelve una sola vez al boot y no cambia dentro de la sesión;
  // cambiar el idioma del navegador/SO, o escribir 'nc-coordinator-lang' a
  // mano en localStorage antes de abrir la pestaña, sigue siendo la forma
  // de ver la demo en el otro idioma — mismo mecanismo de
  // resolveInitialLang que usa app.js para su propio primer render. Nota
  // aparte, no una corrección: si esta pantalla llega a necesitar su
  // propio botón de idioma más adelante, la llave de localStorage ya
  // distinta de la de app.js (ver arriba) es justo lo que evita que ese
  // futuro cambio choque con la preferencia del lado paciente.
  function t(path) {
    return translate(lang, path);
  }

  function render() {
    // Recalculado en cada render(), nunca cacheado al boot (ver
    // encabezado del archivo): una coordinadora que lleve rato con la
    // demo abierta no debe arrastrar un `now` viejo a una acción
    // posterior (agregar/mover una cita, emitir un QPASS).
    const now = new Date().toISOString();
    const route = currentRoute();

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

    // Mismas tres rutas que needsVisit ya filtra arriba (VISIT_SUBNAV_
    // ROUTES) — para cuando llegamos aquí, needsVisit && !selectedVisitId
    // ya habría cortado con el return de arriba, así que route !==
    // 'pass-preview' && SCREENS[route].needsVisit basta, sin repetir el
    // chequeo de selectedVisitId (D36 — ver también el comentario junto a
    // renderVisitSubnav, más arriba).
    const showSubnav = route !== 'pass-preview' && SCREENS[route].needsVisit;

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

    root.innerHTML = `
      <header class="nc-header">
        <span class="nc-header-title">${escapeHtml(t('coordinator.appName'))}</span>
        <button type="button" class="nc-button" data-nav="visits">${escapeHtml(t('coordinator.backToVisits'))}</button>
      </header>
      ${showSubnav ? renderVisitSubnav(route, t) : ''}
      <main class="nc-main" data-role="screen-mount"></main>
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
        now,
        // intake.js no navega por sí mismo (su propio reporte lo dice
        // explícito: "el enrutador decide qué hacer con la visita
        // nueva"). Aterrizar de vuelta en la lista es justo lo que hace
        // "visible de inmediato" a la visita nueva (criterio de
        // aceptación de esta fase) — solo se cambia el hash, igual que el
        // resto de la navegación de esta demo (D28/attachNav); el
        // listener de 'hashchange' de abajo es quien de verdad vuelve a
        // pintar, no una llamada a render() aquí.
        onCreated: () => {
          location.hash = '#/visits';
        },
        // itinerary.js/lodging.js mutan la MISMA visita y se quedan en la
        // misma ruta — no hay cambio de hash que un listener de
        // 'hashchange' pueda aprovechar, así que la única forma de que la
        // pantalla refleje la mutación es volver a llamar render()
        // directamente. Barato e idempotente para el tamaño de esta demo.
        onChange: render,
        // qpass.js deliberadamente no pinta su propio estado "emitido"
        // (ver su propio encabezado): solo muta la store y llama esto.
        // render() de nuevo es lo que hace aparecer, ya cableado por
        // attachNav, el botón data-nav="pass-preview" de la vista
        // "emitido".
        onIssued: render,
      };
      mount.innerHTML = screen.render(ctx);
      if (screen.attach) screen.attach(mount, ctx);
    }

    attachNav(root);
    // data-select-visit (visits.js) no es un destino fijo de navegación —
    // carga un id variable que data-nav no puede expresar — así que este
    // router lo cablea aparte, con su propio listener, en vez de forzar
    // ese caso dentro de attachNav (que D28 define solo para destinos
    // fijos).
    root.querySelectorAll('[data-select-visit]').forEach((el) => {
      el.addEventListener('click', () => {
        selectedVisitId = el.dataset.selectVisit;
        // Aterrizaje default tras elegir una visita: esta demo no tiene
        // una pantalla de "detalle" propia, y el itinerario es lo primero
        // que necesita ver una coordinadora de una visita ya existente.
        location.hash = '#/itinerary';
      });
    });
  }

  window.addEventListener('hashchange', render);
  render();
}
