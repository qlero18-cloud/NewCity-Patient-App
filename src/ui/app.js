// Enrutador y estado de pantalla (fase 05). Único lugar de toda la UI que
// puede leer el reloj real del sistema o `location`/`localStorage`
// directamente — todo lo que cuelga de src/ui/screens/ recibe `now`, `lang`
// y los datos de la visita ya resueltos, nunca los lee por su cuenta.
//
// Contrato de URL. `p` (no `token`) porque así lo fija phase-07-e2e.md
// ("?p=<token de v_demo1>") — fase 05 no dejó el nombre del parámetro por
// escrito en ningún archivo aprobado, así que se alinea al primero que sí
// lo hace en vez de mantener dos convenciones distintas:
//
// (Etapa E: el enlace que se le manda al paciente es /v/<token>, y
// _redirects lo traduce a ?p=<token>. El token ya no se busca solo entre
// las fixtures del bundle — ver src/ui/visitSource.js.)
//   ?p=<Visit.token>       obligatorio en la práctica — sin token
//                          coincidente se ve la misma pantalla neutra que
//                          un token vencido (INV-3: no debe distinguirse)
//   ?now=<ISO con offset>  opcional, solo para este prototipo: ancla "now"
//                          a la fecha de la fixture en vez de la fecha real
//                          del sistema. Sin esto, cualquier fixture cargada
//                          después de sus propias citas (que es HOY para
//                          casi cualquier fecha real, dado que las cinco
//                          fixtures están fechadas en 2026) se vería
//                          siempre vencida — inútil para recorrer el
//                          prototipo. Se descarta un valor no parseable en
//                          vez de romper la app.
//   ?lang=es|en            opcional, conveniencia para verificación manual
//                          — la fuente de verdad real es localStorage +
//                          navigator.language (resolveInitialLang).

import { isExpired } from '../domain/index.js';
import { createVisitApi } from './api.js';
import { resolveVisitContext } from './visitSource.js';
import { saveVisitCache, loadVisitCache, clearVisitCache } from './visitCache.js';
import { parseNowOverride } from './urlParams.js';
import { STRINGS, resolveInitialLang, translate } from './i18n.js';
import { escapeHtml } from './util.js';
import { renderNeutralScreen, renderLoadingScreen } from './screens/neutral.js';
import { attachNav } from './nav.js';
import { THEME_CSS } from './theme.js';
import { renderTabBar, TABS_CSS } from './components/tabs.js';
import { CARD_CSS } from './components/card.js';
import { BADGE_CSS } from './components/badge.js';
import { FICHA_CSS } from './components/ficha.js';
import { renderHomeScreen, HOME_CSS } from './screens/home.js';
import { renderItineraryScreen, ITINERARY_CSS } from './screens/itinerary.js';
import { renderMapScreen, attachMapScreen, MAP_SCREEN_CSS } from './screens/map.js';
import { renderPlazaScreen, attachPlazaScreen, PLAZA_CSS } from './screens/plaza.js';
import { renderHoursScreen } from './screens/hours.js';
import { renderStayScreen, attachStayScreen, STAY_CSS } from './screens/stay.js';
import { renderTransferScreen, attachTransferScreen, TRANSFER_CSS } from './screens/transfer.js';
import { renderHelpScreen, attachHelpScreen, HELP_CSS } from './screens/help.js';
import { renderPassScreen, attachPassScreen, PASS_SCREEN_CSS } from './screens/pass.js';

const ALL_CSS = [THEME_CSS, TABS_CSS, CARD_CSS, BADGE_CSS, FICHA_CSS, HOME_CSS, ITINERARY_CSS, MAP_SCREEN_CSS, PLAZA_CSS, STAY_CSS, TRANSFER_CSS, HELP_CSS, PASS_SCREEN_CSS].join('\n');

function injectStylesOnce() {
  if (document.getElementById('nc-styles')) return;
  const style = document.createElement('style');
  style.id = 'nc-styles';
  style.textContent = ALL_CSS;
  document.head.appendChild(style);
}

const LANG_STORAGE_KEY = 'nc_lang';
const LAST_VIEWED_ITINERARY_KEY_PREFIX = 'nc_last_viewed_itinerary_at:';

const TAB_ROUTES = new Set(['home', 'itinerary', 'map', 'plaza', 'help']);
const SCREENS = {
  home: { render: renderHomeScreen, tab: 'home' },
  itinerary: { render: renderItineraryScreen, tab: 'itinerary' },
  map: { render: renderMapScreen, attach: attachMapScreen, tab: 'map' },
  plaza: { render: renderPlazaScreen, attach: attachPlazaScreen, tab: 'plaza' },
  hours: { render: renderHoursScreen, tab: null },
  stay: { render: renderStayScreen, attach: attachStayScreen, tab: null },
  // Etapa G — sin pestaña, como stay y hours: la barra de 5 la fija el PRD
  // §8. Se llega desde la tarjeta de Inicio o desde el itinerario.
  transfer: { render: renderTransferScreen, attach: attachTransferScreen, tab: null },
  help: { render: renderHelpScreen, attach: attachHelpScreen, tab: 'help' },
  pass: { render: renderPassScreen, attach: attachPassScreen, tab: null },
};

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  return SCREENS[hash] ? hash : 'home';
}

// La caché es un módulo de funciones sueltas (habla con localStorage);
// visitSource la recibe como objeto para poder probarse con un doble. Este
// adaptador es el único lugar donde se juntan las dos formas.
const CACHE_DE_VISITA = { save: saveVisitCache, load: loadVisitCache, clear: clearVisitCache };

// Etapa E — boot pasa a ser async porque resolver el token puede implicar
// una ida al servidor. Quienes la llaman (app.html y el bloque en línea que
// genera build.py) no la esperan, y está bien: no hay nada que hacer
// después de que la app se pinte sola. `api` entra por opciones para poder
// probar y para el e2e, con el cliente real como valor por omisión.
//
// (Sin la etiqueta escrita entera a propósito: este archivo termina DENTRO
// del bloque en línea de index.html, y test/deploy/csp.test.js usa esa
// cadena como marca de que la extracción del script se salió de su lugar.)
export async function boot(root, {
  navigatorLanguage = navigator.language,
  search = location.search,
  api = createVisitApi(),
} = {}) {
  injectStylesOnce();
  const params = new URLSearchParams(search);
  const token = params.get('p');
  const nowOverride = parseNowOverride(search);
  const now = nowOverride ?? new Date().toISOString(); // uno de los dos únicos lugares con permiso de leer el reloj real (D20; el otro es coordinatorApp.js) — INV-1 solo rige src/domain/

  const storedLang = localStorage.getItem(LANG_STORAGE_KEY);
  const langParam = params.get('lang');
  let lang = langParam && STRINGS[langParam] ? langParam : resolveInitialLang(navigatorLanguage, storedLang);

  document.title = STRINGS[lang].common.appName;
  document.documentElement.lang = lang;

  root.innerHTML = renderLoadingScreen(lang);
  const resuelto = await resolveVisitContext(token, { api, cache: CACHE_DE_VISITA, now });

  // isExpired se vuelve a evaluar SIEMPRE, venga de donde venga el
  // expediente. Para el camino de red es redundante (el servidor ya
  // aplicó R1 y contestó 404), pero para la caché no lo es en absoluto:
  // un expediente guardado ayer puede haber vencido durante la noche, y
  // sin esta línea seguiría abriéndose sin señal para siempre. Mismo
  // criterio que passCache con R3 (INV-4): se filtra con el `now` de
  // ahora, nunca con el que tenía el dispositivo al guardar.
  //
  // INV-3: un SOLO camino de código para "no existe" y para "venció", y la
  // pantalla ni siquiera recibe cuál de los dos fue (ver screens/
  // neutral.js) — no pueden divergir ni por accidente.
  if (!resuelto || isExpired(resuelto.record, now)) {
    document.title = STRINGS[lang].common.appName; // INV-6, igual que en render()
    root.innerHTML = renderNeutralScreen(lang);
    return;
  }

  // `transfers` con `?? []`: un teléfono con la caché anterior a la Etapa G
  // entrega un expediente sin esa llave, y ninguna pantalla debe enterarse
  // de la diferencia entre "no tiene traslados" y "esta caché es vieja".
  const { visit, appointments, passes, lodging } = resuelto.record;
  const transfers = resuelto.record.transfers ?? [];
  const lastViewedKey = LAST_VIEWED_ITINERARY_KEY_PREFIX + visit.id;
  let itineraryStamped = false;

  function t(path) {
    return translate(lang, path);
  }

  function render() {
    const route = currentRoute();
    if (route === 'stay' && !lodging) {
      location.hash = '#/home';
      return;
    }
    // Mismo guard que stay, por lo mismo: un enlace viejo a #/transfer en
    // una visita sin traslados pintaría una pantalla en blanco con la barra
    // de pestañas abajo, que parece la app rota y no "esto no aplica".
    if (route === 'transfer' && transfers.length === 0) {
      location.hash = '#/home';
      return;
    }
    const screen = SCREENS[route];
    const lastViewedItineraryAt = localStorage.getItem(lastViewedKey);
    const ctx = { visit, appointments, passes, lodging, transfers, now, lang, t, lastViewedItineraryAt };

    document.title = STRINGS[lang].common.appName; // constante a propósito: INV-6, nunca nombre de paciente ni de estudio

    // La pantalla del pase nunca usa tema oscuro (fase 06 — la lectora
    // necesita contraste máximo): se fuerza tema claro en TODO el árbol,
    // no solo en el símbolo, con una clase que gana sobre la media query
    // de prefers-color-scheme (ver theme.js). Va en <body>, no en #app:
    // el fondo de <body> es un ancestro de #app, así que una variable CSS
    // puesta solo en #app nunca lo alcanza (las variables bajan a
    // descendientes, no suben a ancestros) — se vio en el propio
    // navegador antes de darlo por bueno: la franja entre la tarjeta del
    // pase y la barra de pestañas seguía oscura.
    document.body.className = route === 'pass' ? 'nc-force-light' : '';

    root.innerHTML = `
      <header class="nc-header">
        <span class="nc-header-brand">
          <img class="nc-header-icon" src="assets/newcity-icon-96.png" alt="" width="28" height="28" />
          <span class="nc-header-title">${escapeHtml(STRINGS[lang].common.appName)}</span>
        </span>
        <button type="button" class="nc-lang-toggle" data-role="lang-toggle">${escapeHtml(t('common.langToggle'))}</button>
      </header>
      <main class="nc-main" data-role="screen-mount"></main>
      ${renderTabBar(TAB_ROUTES.has(route) ? screen.tab : '', t)}
    `;

    const mount = root.querySelector('[data-role="screen-mount"]');
    mount.innerHTML = screen.render(ctx);
    if (screen.attach) screen.attach(mount, ctx);

    if (route === 'itinerary' && !itineraryStamped) {
      itineraryStamped = true;
      // Se escribe DESPUÉS de pintar con el valor viejo (arriba), nunca
      // antes: si se escribiera antes, ninguna cita se vería nunca como
      // "actualizada" en la primera visita a esta pantalla.
      localStorage.setItem(lastViewedKey, now);
    }

    attachNav(root);
    root.querySelector('[data-role="lang-toggle"]')?.addEventListener('click', () => {
      lang = lang === 'es' ? 'en' : 'es';
      localStorage.setItem(LANG_STORAGE_KEY, lang);
      render();
    });
  }

  window.addEventListener('hashchange', render);
  render();
}
