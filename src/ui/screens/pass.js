// Fase 06 — pantalla completa del QPASS. Reemplaza el placeholder de la
// fase 05 (que solo probaba R3 con texto plano). Comportamiento pedido
// por la fase:
//   - símbolo lo más grande posible, margen quieto, negro sobre blanco
//     puro — ESTA pantalla nunca usa tema oscuro, a propósito
//   - debajo: para qué acceso sirve y hasta qué hora vale
//   - varios pases válidos: deslizar entre ellos
//   - sin conexión: último pase guardado, con aviso "guardado a las HH:MM"
//   - Wake Lock mientras la pantalla esté abierta, si el navegador lo
//     soporta
//
// Brillo de pantalla al máximo: NO existe una API web estándar para
// controlarlo (por diseño — ninguna página puede subir el brillo del
// teléfono de alguien sin su permiso explícito fuera de flujos muy
// específicos). Se le pide al paciente que lo suba él mismo con un aviso
// en pantalla, en vez de fingir que la app lo hace.
//
// "Sin conexión" en ESTE prototipo: no hay backend real (fase 08, fuera
// de alcance) — nunca hay una petición de red que de verdad pueda
// fallar. El mecanismo de caché (src/ui/passCache.js) SÍ es real y está
// probado, pero no hay forma honesta de ejercitar "modo avión" sin una
// fuente de datos viva de la que desconectarse; por eso showFallback se
// deja disponible para cuando exista un backend, no se simula aquí.

import { visiblePasses } from '../../domain/index.js';
import { generateQrMatrix, renderQrSvg } from '../../render/qr.js';
import { generateCode128Bars, renderCode128Svg } from '../../render/code128.js';
import { savePassCache, getCachedVisiblePasses } from '../passCache.js';
import { escapeHtml } from '../util.js';

// t como segundo parámetro (fase 09, D29): la rama 'image' necesita
// traducir pass.scope para el atributo alt de la imagen — a diferencia de
// 'qr'/'code128', que nunca tocaron t. Sin este parámetro la rama nueva
// lanzaría ReferenceError la primera vez que corriera (t no existe en el
// scope de nivel de módulo de esta función, solo dentro de
// attachPassScreen más abajo). Documentado así en el doc de fase 09 antes
// de escribir este archivo, precisamente para no repetir ese error.
function renderSymbol(pass, t) {
  try {
    if (pass.format === 'image') {
      // QPASS real (D29): una imagen que ya subió la coordinadora, no un
      // payload corto para que este archivo lo codifique — el símbolo ya
      // viene armado, solo se pinta. No pasa por generateQrMatrix ni por
      // el generador de Code128.
      return `<img src="${escapeHtml(pass.payload)}" alt="${escapeHtml(t(`pass.scope.${pass.scope}`))}" class="nc-pass-image" />`;
    }
    if (pass.format === 'code128') {
      return renderCode128Svg(pass.payload);
    }
    return renderQrSvg(generateQrMatrix(pass.payload));
  } catch (err) {
    // Un payload real que no quepa (QR) o tenga caracteres fuera de
    // subset B (Code128) no debe tumbar la pantalla completa — se avisa
    // en vez de dejar una página en blanco justo donde el paciente más
    // la necesita.
    return `<p class="nc-pass-error">${escapeHtml(err.message)}</p>`;
  }
}

export function renderPassScreen(ctx) {
  const { t } = ctx;
  return `
    <section class="nc-screen nc-pass-screen">
      <h1 class="nc-screen-title">${escapeHtml(t('pass.title'))}</h1>
      <p class="nc-pass-brightness-hint">${escapeHtml(t('pass.brightnessHint'))}</p>
      <div data-role="pass-mount"></div>
    </section>
  `;
}

export function attachPassScreen(rootEl, ctx) {
  const { visit, passes, now, lang, t, ephemeral } = ctx;
  const mount = rootEl.querySelector('[data-role="pass-mount"]');

  const live = visiblePasses(passes, now);
  let source, savedAt;
  if (live.length > 0) {
    // ephemeral (fase 09, D29): bandera opt-in, default undefined/false —
    // el resto del proyecto (la sesión real del paciente vía app.js) nunca
    // la pasa, así que su comportamiento aquí queda byte a byte igual que
    // fase 06. La única llamada que SÍ pasa ephemeral: true es la ruta
    // #/pass-preview de coordinatorApp.js: ese botón abre el pase de una
    // visita AJENA (la que esté armando la coordinadora en ese momento),
    // sobre el mismo localStorage del navegador — sin este guard,
    // guardaría ahí el payload real de esa visita, violando la promesa
    // explícita del doc de esa fase ("nunca... localStorage"). Fix de
    // revisión adversarial, fase 09 — se coló en la primera pasada porque
    // nadie había ejecutado #/pass-preview de verdad, solo leído el código
    // (ver test/ui/pass.test.js para el porqué de la prueba dedicada).
    //
    // format:'image' (D29) sigue quedando fuera del caché aparte de esto,
    // sin importar ephemeral: es una data: URL completa, no el string
    // corto que este mecanismo manejaba hasta ahora, y la demo de fase 09
    // promete que nada de lo que emite sobrevive un refresh — si se
    // guardara aquí, esa promesa se rompería justo por este archivo.
    // qr/code128 se siguen cacheando exactamente igual que en fase 06
    // cuando ephemeral no está activo.
    if (!ephemeral) {
      savePassCache(visit.id, passes.filter((p) => p.format !== 'image'), now);
    }
    source = live;
    savedAt = null;
  } else {
    const cached = getCachedVisiblePasses(visit.id, now);
    source = cached ? cached.passes : [];
    savedAt = cached ? cached.savedAt : null;
  }

  let index = 0;
  requestWakeLock();

  function render() {
    if (source.length === 0) {
      mount.innerHTML = `<p class="nc-pass-empty">${escapeHtml(t('pass.empty'))}</p>`;
      return;
    }
    const pass = source[index];
    const offlineNotice = savedAt
      ? `<p class="nc-pass-offline">${escapeHtml(t('pass.offline'))} · ${escapeHtml(t('pass.savedAt')(formatSavedAt(savedAt)))}</p>`
      : '';
    const validUntilText = pass.validUntil ? t('pass.validUntil')(formatSavedAt(pass.validUntil)) : t('pass.noExpiry');
    const nav =
      source.length > 1
        ? `<div class="nc-pass-nav">
            <button type="button" class="nc-button" data-role="pass-prev" ${index === 0 ? 'disabled' : ''}>${escapeHtml(t('map.routePrev'))}</button>
            <span class="nc-pass-count">${index + 1} / ${source.length}</span>
            <button type="button" class="nc-button" data-role="pass-next" ${index === source.length - 1 ? 'disabled' : ''}>${escapeHtml(t('map.routeNext'))}</button>
          </div>`
        : '';
    mount.innerHTML = `
      ${offlineNotice}
      <div class="nc-pass-symbol">${renderSymbol(pass, t)}</div>
      <p class="nc-pass-scope">${escapeHtml(t(`pass.scope.${pass.scope}`))}</p>
      <p class="nc-pass-expiry">${escapeHtml(validUntilText)}</p>
      ${nav}
    `;
    mount.querySelector('[data-role="pass-prev"]')?.addEventListener('click', () => {
      if (index > 0) { index--; render(); }
    });
    mount.querySelector('[data-role="pass-next"]')?.addEventListener('click', () => {
      if (index < source.length - 1) { index++; render(); }
    });
  }

  render();
}

function formatSavedAt(iso) {
  // Solo hora, formato de reloj de 24h simple para el aviso "guardado a
  // las HH:MM" — no usa formatTimeTijuana (esa función es AM/PM, fase 01)
  // para no forzar una convención horaria distinta a la de esta nota
  // corta; es texto de UI, no una regla de dominio.
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

let wakeLockSentinel = null;
async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
  } catch {
    // Puede fallar por permisos, pestaña no visible, etc. — no es un
    // error que deba interrumpir la pantalla del pase.
  }
}

export const PASS_SCREEN_CSS = `
.nc-pass-screen { background: #FFFFFF; color: #000000; margin: -16px; padding: 16px; min-height: 100%; }
.nc-pass-brightness-hint { font-size: 12px; opacity: 0.7; margin: 0 0 12px; }
.nc-pass-symbol { background: #FFFFFF; padding: 12px; max-width: 320px; margin: 0 auto; }
.nc-pass-symbol svg, .nc-pass-symbol img { display: block; width: 100%; height: auto; }
.nc-pass-scope { text-align: center; font-size: 20px; font-weight: 700; margin: 16px 0 4px; }
.nc-pass-expiry { text-align: center; font-size: 13px; opacity: 0.75; margin: 0; }
.nc-pass-offline { text-align: center; font-size: 12px; background: #FBEBD2; color: #8A5A00; padding: 6px; border-radius: 8px; margin: 0 0 12px; }
.nc-pass-nav { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 20px; }
.nc-pass-count { font-size: 13px; opacity: 0.7; }
.nc-pass-empty, .nc-pass-error { text-align: center; font-size: 14px; opacity: 0.75; }
`;
