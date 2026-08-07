// Enrutador y estado de pantalla (fase 05). Único lugar de toda la UI que
// puede leer el reloj real del sistema o `location`/`localStorage`
// directamente — todo lo que cuelga de src/ui/screens/ recibe `now`, `lang`
// y los datos de la visita ya resueltos, nunca los lee por su cuenta.
//
// Contrato de URL de este prototipo (no hay backend real — PRD: en el MVP
// esto lo resuelve el panel de coordinadores, fase 08, fuera de alcance).
// `p` (no `token`) porque así lo fija phase-07-e2e.md ("?p=<token de
// v_demo1>") — fase 05 no dejó el nombre del parámetro por escrito en
// ningún archivo aprobado, así que se alinea al primero que sí lo hace en
// vez de mantener dos convenciones distintas dentro del mismo prototipo:
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
import { fixtures } from '../data/fixtures.js';
import { STRINGS, resolveInitialLang, translate } from './i18n.js';
import { escapeHtml } from './util.js';
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
import { renderHelpScreen, HELP_CSS } from './screens/help.js';
import { renderPassScreen, attachPassScreen, PASS_SCREEN_CSS } from './screens/pass.js';

const ALL_CSS = [THEME_CSS, TABS_CSS, CARD_CSS, BADGE_CSS, FICHA_CSS, HOME_CSS, ITINERARY_CSS, MAP_SCREEN_CSS, PLAZA_CSS, STAY_CSS, HELP_CSS, PASS_SCREEN_CSS].join('\n');

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
  help: { render: renderHelpScreen, tab: 'help' },
  pass: { render: renderPassScreen, attach: attachPassScreen, tab: null },
};

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  return SCREENS[hash] ? hash : 'home';
}

function parseNowOverride(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : raw;
}

function resolveVisitContext(token) {
  const match = Object.values(fixtures).find((f) => f.visit.token === token);
  return match ?? null;
}

function renderNeutralScreen(root, lang) {
  // INV-3: idéntica sin importar si el token nunca existió o ya venció —
  // un solo camino de código para las dos situaciones, para que no puedan
  // divergir por accidente en el futuro.
  document.title = STRINGS[lang].common.appName;
  root.innerHTML = `
    <div class="nc-neutral">
      <p class="nc-neutral-title">${escapeHtml(translate(lang, 'common.neutralTitle'))}</p>
      <p class="nc-neutral-body">${escapeHtml(translate(lang, 'common.neutralBody'))}</p>
    </div>
  `;
}

export function boot(root, { navigatorLanguage = navigator.language, search = location.search } = {}) {
  injectStylesOnce();
  const params = new URLSearchParams(search);
  const token = params.get('p');
  const nowOverride = parseNowOverride(params.get('now'));
  const now = nowOverride ?? new Date().toISOString(); // ÚNICO lugar de todo el proyecto con permiso de leer el reloj real (INV-1 solo rige src/domain/)

  const storedLang = localStorage.getItem(LANG_STORAGE_KEY);
  const langParam = params.get('lang');
  let lang = langParam && STRINGS[langParam] ? langParam : resolveInitialLang(navigatorLanguage, storedLang);

  document.title = STRINGS[lang].common.appName;
  document.documentElement.lang = lang;

  const ctxData = resolveVisitContext(token);
  if (!ctxData || isExpired(ctxData.visit, ctxData.appointments, ctxData.lodging, now)) {
    renderNeutralScreen(root, lang);
    return;
  }

  const { visit, appointments, passes, lodging } = ctxData;
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
    const screen = SCREENS[route];
    const lastViewedItineraryAt = localStorage.getItem(lastViewedKey);
    const ctx = { visit, appointments, passes, lodging, now, lang, t, lastViewedItineraryAt };

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
