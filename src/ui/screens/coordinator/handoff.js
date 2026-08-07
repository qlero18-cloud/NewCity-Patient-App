// Etapa E — Enviar al paciente: el enlace, el QR y el botón de WhatsApp.
//
// Esta pantalla es la respuesta a la pregunta que abrió toda la etapa:
// "¿dónde se genera el QR para que la coordinadora se lo mande al
// paciente?". Hasta la Etapa D la respuesta era "en ningún lado" —
// createVisit acuñaba el token y el router lo tiraba; la palabra `token`
// no aparecía en ninguna de las cinco pantallas del panel.
//
// ctx = { store, visitId, lang, t, origin }. `origin` entra por ctx y no
// se lee de `location` aquí adentro para que la pantalla siga siendo pura
// y probable sin DOM, igual que el resto de render*Screen del proyecto.
//
// Es una PESTAÑA de la visita, no un aviso que aparece al crearla. Un
// aviso se pierde con la primera recarga y el enlace es lo único que
// existe para llegar al paciente: si se pierde, la visita queda muda. Como
// pestaña, se puede volver a ella mañana, después de haberle cargado el
// itinerario y el hospedaje — que es el orden en que de verdad se trabaja
// (por eso el alta sigue aterrizando en #/itinerary y no aquí: mandarle a
// alguien un itinerario vacío es peor que no mandarle nada).
//
// El mensaje de WhatsApp va en el idioma del PACIENTE (visit.lang), no en
// el del panel: la coordinadora puede tener la interfaz en español y estar
// atendiendo a alguien que solo lee inglés. Es el único lugar del proyecto
// donde se traducen dos idiomas a la vez en la misma pantalla, y por eso
// este archivo importa `translate` directamente en vez de conformarse con
// el `t` que trae ctx (precedente: coordinator/formErrors.js).
//
// wa.me SIN número, a propósito: el Visit no guarda teléfono del paciente
// (PRD §7) y agregarlo sería empezar a almacenar un dato personal que
// nadie pidió. Sin número, WhatsApp abre con el texto listo y la
// coordinadora elige el chat — que además es el paso donde confirma con
// los ojos a quién se lo está mandando.

import { escapeHtml } from '../../util.js';
import { renderCard } from '../../components/card.js';
import { translate } from '../../i18n.js';
import { generateQrMatrix, renderQrSvg } from '../../../render/qr.js';

// Única definición de la forma del enlace, exportada para que las pruebas
// —y quien mañana tenga que cambiar el prefijo— no la reescriban a mano en
// dos lados. El otro extremo de este contrato es la regla `/v/*` de
// _redirects, que lo traduce a `?p=<token>` (test/deploy/redirects.test.js).
export function visitUrl(origin, token) {
  return `${origin}/v/${token}`;
}

// "null" es lo que devuelve location.origin en file:// (Chrome, Firefox).
// Un doble clic en coordinator.html es exactamente el tipo de cosa que
// pasa, y sin este guard la pantalla armaría `null/v/<token>`: un enlace
// roto que se ve igual de real que uno bueno y que sale por WhatsApp hacia
// un paciente.
function origenUsable(origin) {
  return typeof origin === 'string' && /^https?:\/\/[^/]+$/.test(origin);
}

function pantalla(title, cuerpo) {
  return `
    <section class="nc-screen">
      <h1 class="nc-screen-title">${escapeHtml(title)}</h1>
      ${cuerpo}
    </section>
  `;
}

function aviso(title, mensaje) {
  return pantalla(title, `<p class="nc-empty-state">${escapeHtml(mensaje)}</p>`);
}

// El QR puede no caber: v4/M topa en 62 bytes UTF-8. Con el dominio de hoy
// (https://nchpatient.netlify.app + /v/ + token de 22) son 55 y sobra; con
// un dominio propio más largo, no. Ese día la pantalla tiene que seguir
// sirviendo el enlace copiable en vez de tumbarse — mismo criterio que
// renderSymbol en screens/pass.js.
function bloqueQr(url, t) {
  try {
    return `
      <div class="nc-handoff-qr">${renderQrSvg(generateQrMatrix(url))}</div>
      <p class="nc-handoff-hint">${escapeHtml(t('coordinator.handoff.qrHint'))}</p>
    `;
  } catch {
    return `<p class="nc-handoff-hint">${escapeHtml(t('coordinator.handoff.qrTooLong'))}</p>`;
  }
}

export function renderHandoffScreen(ctx) {
  const { store, visitId, t, origin } = ctx;
  const title = t('coordinator.handoff.title');
  const record = store.getVisit(visitId);

  // Mismo guard y mismo mensaje que itinerary/lodging/qpass: una visita que
  // no está no es un caso especial de esta pantalla.
  if (!record) return aviso(title, t('coordinator.visitNotFound'));

  const { visit } = record;
  // Sin token no hay nada que entregar. No es hipotético: GET /visits borra
  // el token a propósito (sinToken, src/server/coordinatorHandler.js), así
  // que basta con que algún día un resumen acabe en `records` para que esto
  // se vuelva el camino real.
  if (!visit.token) return aviso(title, t('coordinator.handoff.noToken'));
  if (!origenUsable(origin)) return aviso(title, t('coordinator.handoff.noOrigin'));

  const url = visitUrl(origin, visit.token);
  const mensaje = translate(visit.lang, 'coordinator.handoff.waMessage')(visit.patientFirstName, url);
  const waHref = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;

  return pantalla(title, `
    <p class="nc-handoff-intro">${escapeHtml(t('coordinator.handoff.intro'))}</p>
    ${renderCard(`
      <p class="nc-handoff-label">${escapeHtml(t('coordinator.handoff.linkLabel'))}</p>
      <a class="nc-handoff-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>
      <div class="nc-handoff-actions">
        <button type="button" class="nc-button" data-role="copy-link" data-link="${escapeHtml(url)}">${escapeHtml(t('coordinator.handoff.copy'))}</button>
        <a class="nc-button nc-button--primary" href="${escapeHtml(waHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('coordinator.handoff.whatsapp'))}</a>
      </div>
      <p class="nc-handoff-copied" data-role="copy-feedback" hidden>${escapeHtml(t('coordinator.handoff.copied'))}</p>
    `, { variant: 'accent' })}
    ${renderCard(bloqueQr(url, t))}
  `);
}

// Mismo patrón de copiado que screens/stay.js del lado paciente: si el
// navegador niega el portapapeles (requiere gesto o permiso según el
// caso), no se rompe la pantalla — simplemente no aparece la confirmación,
// y el enlace sigue seleccionable a mano en el <a> de arriba.
export function attachHandoffScreen(rootEl) {
  const btn = rootEl.querySelector('[data-role="copy-link"]');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const feedback = rootEl.querySelector('[data-role="copy-feedback"]');
    try {
      await navigator.clipboard.writeText(btn.dataset.link);
    } catch {
      return;
    }
    if (feedback) {
      feedback.hidden = false;
      setTimeout(() => { feedback.hidden = true; }, 2000);
    }
  });
}

export const HANDOFF_CSS = `
.nc-handoff-intro { margin: 0 0 12px; font-size: 14px; opacity: 0.85; }
.nc-handoff-label { margin: 0 0 4px; font-size: 12px; opacity: 0.7; }
.nc-handoff-link { display: block; word-break: break-all; font-size: 14px; margin: 0 0 12px; color: var(--nc-teal-ink); }
.nc-handoff-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.nc-handoff-copied { margin: 8px 0 0; font-size: 12px; color: var(--nc-teal-ink); font-weight: 700; }
.nc-handoff-qr { max-width: 260px; margin: 0 auto; }
.nc-handoff-hint { margin: 10px 0 0; font-size: 13px; opacity: 0.8; text-align: center; }
`;
