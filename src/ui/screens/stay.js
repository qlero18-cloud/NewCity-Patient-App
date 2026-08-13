// Mi estancia — reservación de Quartz con botón copiar (fase 05). "Si la
// visita no tiene hospedaje, la pantalla y su acceso no existen — no se
// muestra vacía": src/ui/app.js nunca enruta aquí sin lodging, y esta
// función además se niega a pintar algo si de todos modos la llaman así
// (defensa en profundidad, no el único lugar que decide).

import { formatTimeTijuana, formatDayLabel } from '../../domain/index.js';
import { escapeHtml } from '../util.js';
import { renderCard } from '../components/card.js';

// Etapa L (D101). Los cuatro campos que trae el Word son opcionales: el
// hotel se aparta antes de saber la tarifa, y un expediente guardado antes
// de esta etapa no tiene ninguna de las cuatro llaves. Un renglón con la
// etiqueta y nada al lado se lee como un error de la app, así que se omite
// entero — mismo criterio que renglonTraslado en transfer.js.
//
// La prueba es contra vacío/nulo y NO contra "falsy" a propósito: `nights:
// 0` es un número que alguien capturó, no un hueco.
function renglonEstancia(label, valor) {
  if (valor === '' || valor === null || valor === undefined) return '';
  return `<p class="nc-stay-row"><span>${escapeHtml(label)}</span> ${escapeHtml(String(valor))}</p>`;
}

export function renderStayScreen(ctx) {
  const { lodging, now, lang, t } = ctx;
  if (!lodging) return '';

  const checkInLabel = `${formatDayLabel(lodging.checkIn, now, lang)[lang]} · ${formatTimeTijuana(lodging.checkIn, lang)}`;
  const checkOutLabel = `${formatDayLabel(lodging.checkOut, now, lang)[lang]} · ${formatTimeTijuana(lodging.checkOut, lang)}`;
  const yesNo = (v) => (v ? t('stay.yes') : t('stay.no'));

  return `
    <section class="nc-screen">
      <h1 class="nc-screen-title">${escapeHtml(t('stay.title'))}</h1>
      ${renderCard(`
        <p class="nc-stay-hotel">${escapeHtml(lodging.hotel)}</p>
        <p class="nc-stay-row"><span>${escapeHtml(t('stay.reservationCode'))}</span> <strong data-role="res-code">${escapeHtml(lodging.reservationCode)}</strong></p>
        <button type="button" class="nc-button" data-role="copy-code" data-code="${escapeHtml(lodging.reservationCode)}">${escapeHtml(t('stay.copyButton'))}</button>
        <p class="nc-copy-feedback" data-role="copy-feedback" hidden>${escapeHtml(t('stay.copied'))}</p>
      `, { variant: 'accent' })}
      ${renderCard(`
        <p class="nc-stay-row"><span>${escapeHtml(t('stay.checkIn'))}</span> ${escapeHtml(checkInLabel)}</p>
        <p class="nc-stay-row"><span>${escapeHtml(t('stay.checkOut'))}</span> ${escapeHtml(checkOutLabel)}</p>
        ${renglonEstancia(t('stay.nights'), lodging.nights)}
        ${renglonEstancia(t('stay.roomType'), lodging.roomType)}
        ${renglonEstancia(t('stay.occupancy'), lodging.occupancy)}
        <p class="nc-stay-row"><span>${escapeHtml(t('stay.breakfastIncluded'))}</span> ${escapeHtml(yesNo(lodging.breakfastIncluded))}</p>
        <p class="nc-stay-row"><span>${escapeHtml(t('stay.recoveryRoom'))}</span> ${escapeHtml(yesNo(lodging.recoveryRoom))}</p>
        ${renglonEstancia(t('stay.total'), lodging.total)}
      `)}
    </section>
  `;
}

export function attachStayScreen(rootEl) {
  const btn = rootEl.querySelector('[data-role="copy-code"]');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const feedback = rootEl.querySelector('[data-role="copy-feedback"]');
    try {
      await navigator.clipboard.writeText(btn.dataset.code);
    } catch {
      // Clipboard API puede requerir permiso/gesto del usuario según el
      // navegador — si falla, no rompemos la pantalla, solo no mostramos
      // la retroalimentación de éxito.
      return;
    }
    if (feedback) {
      feedback.hidden = false;
      setTimeout(() => { feedback.hidden = true; }, 2000);
    }
  });
}

export const STAY_CSS = `
.nc-stay-hotel { font-size: 18px; font-weight: 700; margin: 0 0 10px; }
.nc-stay-row { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; margin: 0 0 8px; }
.nc-stay-row span { opacity: 0.7; }
.nc-copy-feedback { margin: 8px 0 0; font-size: 12px; color: var(--nc-teal-ink); font-weight: 700; }
`;
