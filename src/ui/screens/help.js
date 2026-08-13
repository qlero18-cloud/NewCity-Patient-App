// Ayuda — contacto, horario de coordinación y Wi-Fi (fase 05, ampliada en
// la Etapa K con el documento de información general del hospital).
//
// wa.me exige solo dígitos (sin "+"); tel: sí conserva el "+" (E.164
// estándar) — por eso hay dos formatos derivados del mismo número.
//
// D95 — Hasta la Etapa K los dos botones apuntaban al MISMO número, el de
// Estados Unidos, porque el PRD §15.5 no decía cuál rol tenía cada uno. El
// documento del hospital lo resuelve: WhatsApp es el de México y el de
// Estados Unidos es de llamadas y texto. Ahora la pantalla además ESCRIBE
// cuál es cuál: con dos números distintos, un botón que solo dice "Llamar"
// deja al paciente sin saber a cuál le está marcando.
//
// D97 — La ficha del horario pasaba `lines: []`: salía el título y el
// distintivo "Abierto ahora", pero ningún horario. Ahora lo escribe
// formatWeeklyHours.

import { isOpenNow, formatWeeklyHours } from '../../domain/index.js';
import { supportChannel } from '../../data/support.js';
import { wifiNetworks } from '../../data/wifi.js';
import { escapeHtml } from '../util.js';
import { renderCard } from '../components/card.js';
import { renderFicha } from '../components/ficha.js';
import { renderBadge } from '../components/badge.js';

function digitsOnly(e164) {
  return e164.replace(/[^\d]/g, '');
}

// E.164 a algo que un paciente pueda leer o dictar por teléfono:
// "+526631115360" -> "+52 663 111 5360".
//
// Los últimos 10 dígitos son el número nacional y lo de antes es la lada
// del país — cierto para México y para Estados Unidos, que son los dos
// únicos países en juego aquí. No se intenta un formateador universal: sin
// la tabla de longitudes por país sería adivinar, y con ella sería una
// dependencia entera para dos números.
function telVisible(e164) {
  const d = digitsOnly(e164);
  if (d.length < 10) return e164; // no es un número que sepamos partir: se muestra tal cual
  const lada = d.slice(0, d.length - 10);
  const n = d.slice(-10);
  return `+${lada} ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}

function renglonContacto(etiqueta, texto, href) {
  return `
    <p class="nc-help-row">
      <span class="nc-help-label">${escapeHtml(etiqueta)}</span>
      <a class="nc-help-value" href="${escapeHtml(href)}">${escapeHtml(texto)}</a>
    </p>
  `;
}

function tarjetaWifi(red, lang, t) {
  const tieneClave = red.password !== '';
  return `
    <div class="nc-wifi">
      <p class="nc-wifi-where">${escapeHtml(red.where[lang] ?? red.where.en)}</p>
      <p class="nc-help-row">
        <span class="nc-help-label">${escapeHtml(t('wifi.network'))}</span>
        <span class="nc-help-value nc-wifi-ssid">${escapeHtml(red.ssid)}</span>
      </p>
      <p class="nc-help-row">
        <span class="nc-help-label">${escapeHtml(t('wifi.password'))}</span>
        <span class="nc-help-value">${escapeHtml(tieneClave ? red.password : t('wifi.noPassword'))}</span>
      </p>
      ${tieneClave ? `
        <button type="button" class="nc-button" data-role="copy-wifi" data-password="${escapeHtml(red.password)}" data-wifi-id="${escapeHtml(red.id)}">${escapeHtml(t('wifi.copyButton'))}</button>
        <p class="nc-copy-feedback" data-role="copy-feedback" data-wifi-id="${escapeHtml(red.id)}" hidden>${escapeHtml(t('wifi.copied'))}</p>
      ` : ''}
    </div>
  `;
}

export function renderHelpScreen(ctx) {
  const { now, lang, t } = ctx;
  const waHref = `https://wa.me/${digitsOnly(supportChannel.whatsappNumber)}`;
  const telHref = `tel:${supportChannel.voiceNumber}`;
  const open = isOpenNow(supportChannel.hours, now);
  const statusBadge = open === null ? '' : open ? renderBadge(t('hours.openNow'), 'updated') : renderBadge(t('hours.closedNow'), 'cancelled');

  return `
    <section class="nc-screen">
      <h1 class="nc-screen-title">${escapeHtml(t('help.title'))}</h1>
      ${renderCard(`
        <a class="nc-button nc-button--primary nc-button--block" href="${escapeHtml(waHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('help.whatsappButton'))}</a>
        <a class="nc-button nc-button--block" href="${escapeHtml(telHref)}">${escapeHtml(t('help.callButton'))}</a>
      `, { variant: 'accent' })}
      ${renderCard(`
        <h2 class="nc-help-title">${escapeHtml(t('help.contactTitle'))}</h2>
        ${renglonContacto(t('help.whatsappLabel'), telVisible(supportChannel.whatsappNumber), waHref)}
        ${renglonContacto(t('help.voiceLabel'), telVisible(supportChannel.voiceNumber), telHref)}
        ${renglonContacto(t('help.emailLabel'), supportChannel.email, `mailto:${supportChannel.email}`)}
      `)}
      ${renderFicha({
        title: t('help.hoursTitle'),
        lines: formatWeeklyHours(supportChannel.hours, lang),
        unconfirmed: supportChannel.hours?.unconfirmed === true,
        t,
        extra: statusBadge,
      })}
      ${renderCard(`
        <h2 class="nc-help-title">${escapeHtml(t('wifi.title'))}</h2>
        ${wifiNetworks.map((red) => tarjetaWifi(red, lang, t)).join('\n')}
      `)}
    </section>
  `;
}

// Copiar la contraseña del Wi-Fi. Mismo patrón que transfer.js: un botón
// por red, así que la confirmación se busca por data-wifi-id — con un
// querySelector suelto se encendería siempre la de la primera red.
export function attachHelpScreen(rootEl) {
  rootEl.querySelectorAll('[data-role="copy-wifi"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.password);
      } catch {
        // La Clipboard API puede exigir permiso o gesto del usuario según
        // el navegador. Si falla, no se rompe la pantalla.
        return;
      }
      const feedback = rootEl.querySelector(`[data-role="copy-feedback"][data-wifi-id="${btn.dataset.wifiId}"]`);
      if (!feedback) return;
      feedback.hidden = false;
      setTimeout(() => { feedback.hidden = true; }, 2000);
    });
  });
}

export const HELP_CSS = `
.nc-button--block { display: block; width: 100%; text-align: center; text-decoration: none; box-sizing: border-box; margin-bottom: 8px; }
.nc-help-title { margin: 0 0 10px; font-size: 17px; font-weight: 700; }
.nc-help-row { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; margin: 0 0 8px; font-size: 15px; }
.nc-help-label { flex: 0 0 auto; opacity: 0.7; font-size: 13px; }
.nc-help-value { font-weight: 600; word-break: break-word; }
.nc-wifi { padding: 10px 0; border-top: 1px solid var(--nc-card-border); }
.nc-wifi:first-of-type { padding-top: 0; border-top: 0; }
.nc-wifi-where { margin: 0 0 8px; font-size: 15px; font-weight: 700; }
.nc-wifi-ssid { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
`;
