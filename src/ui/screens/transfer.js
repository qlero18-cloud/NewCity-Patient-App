// Etapa G — Mi traslado: lo que el paciente necesita saber cuando el
// hospital le contrató el coche. A qué hora lo recogen, dónde, quién va por
// él y en qué vehículo.
//
// Ruta sin pestaña, como `stay` y `hours`: no gana un lugar en la barra de
// 5 pestañas (esa jerarquía la fija el PRD §8) — se llega desde la tarjeta
// de Inicio o desde el itinerario. Y como `stay`, se niega a pintarse si la
// llaman sin datos: app.js no debería enrutar aquí sin traslados, pero una
// pantalla vacía es peor que ninguna.
//
// Pinta TODOS los traslados de la visita, no uno: las rutas de este proyecto
// son hashes sin parámetros (#/transfer), así que no hay forma de pedir
// "el traslado t_2". Tampoco hace falta — son dos o tres en toda la visita y
// verlos juntos es más útil que navegar entre ellos.

import { formatTimeTijuana, formatDayLabel } from '../../domain/index.js';
import { escapeHtml, classNames, transferPointName } from '../util.js';
import { transferPoints } from '../../data/transferPoints.js';
import { instantMs } from '../../domain/time.js';
import { renderCard } from '../components/card.js';
import { renderBadge, renderUnconfirmedBadge } from '../components/badge.js';

// wa.me exige solo dígitos; tel: conserva el "+". Dos formatos del mismo
// número, exactamente como en help.js — el nombre cambia porque build.py
// aplana todos los módulos de una entrada a un solo scope y `digitsOnly` ya
// está declarado allá.
function soloDigitos(e164) {
  return e164.replace(/[^\d]/g, '');
}

function renglonTraslado(label, valor, extra = '') {
  if (!valor) return '';
  return `<p class="nc-transfer-row"><span>${escapeHtml(label)}</span> ${escapeHtml(valor)}${extra}</p>`;
}

// Los botones de contacto se omiten en un traslado cancelado, y esa es la
// línea de código que más importa de esta pantalla: llamarle al chofer de un
// traslado que ya no va a salir es la llamada que deja al paciente esperando
// en la banqueta convencido de que alguien viene.
function contactoTraslado(transfer, t) {
  const tel = transfer.driver?.phone;
  if (!tel || transfer.status === 'cancelled') return '';
  return `
    <a class="nc-button nc-button--primary nc-button--block" href="${escapeHtml(`https://wa.me/${soloDigitos(tel)}`)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('transfer.whatsappButton'))}</a>
    <a class="nc-button nc-button--block" href="${escapeHtml(`tel:${tel}`)}">${escapeHtml(t('transfer.callButton'))}</a>
  `;
}

function renderTrasladoCard(transfer, now, lang, t) {
  const cancelled = transfer.status === 'cancelled';
  const punto = transferPoints.find((p) => p.id === transfer.meetingPointId) ?? null;
  const cuando = `${formatDayLabel(transfer.scheduledAt, now, lang)[lang]} · ${formatTimeTijuana(transfer.scheduledAt, lang)}`;

  // El vehículo se arma con lo que haya: la coordinadora captura el traslado
  // días antes y el coche se asigna la víspera, así que "Van · Toyota" es un
  // estado normal, no un dato a medias.
  const vehiculo = [
    transfer.vehicle?.type ? t(`transfer.vehicleType.${transfer.vehicle.type}`) : '',
    transfer.vehicle?.make,
    transfer.vehicle?.model,
    transfer.vehicle?.color,
  ].filter(Boolean).join(' · ');

  const placa = transfer.vehicle?.plate;
  const chofer = transfer.driver?.name;

  return renderCard(`
    <p class="${classNames(['nc-transfer-kind', cancelled && 'nc-transfer-kind--cancelled'])}">${escapeHtml(t(`transfer.kind.${transfer.kind}`))}</p>
    ${cancelled ? `<p class="nc-transfer-status">${renderBadge(t('transfer.cancelledBadge'), 'cancelled')}</p>` : ''}
    <p class="nc-transfer-when">${escapeHtml(cuando)}</p>
    ${renglonTraslado(
      t('transfer.meetingPoint'),
      transferPointName(transferPoints, transfer.meetingPointId, lang),
      // El punto sin confirmar se marca AQUÍ y no en el catálogo: es la
      // diferencia entre "voy a Llegadas" y "voy a Llegadas si nadie me
      // dice otra cosa" (§15.8).
      punto?.unconfirmed ? ` ${renderUnconfirmedBadge(t)}` : '',
    )}
    ${renglonTraslado(t('transfer.flightNumber'), transfer.flightNumber)}
    ${chofer
      ? renglonTraslado(t('transfer.driver'), chofer)
      : `<p class="nc-transfer-pending">${escapeHtml(t('transfer.driverPending'))}</p>`}
    ${renglonTraslado(t('transfer.vehicle'), vehiculo)}
    ${placa ? `
      ${renglonTraslado(t('transfer.plate'), placa)}
      <button type="button" class="nc-button" data-role="copy-plate" data-plate="${escapeHtml(placa)}" data-transfer-id="${escapeHtml(transfer.id)}">${escapeHtml(t('transfer.copyPlate'))}</button>
      <p class="nc-copy-feedback" data-role="copy-feedback" data-transfer-id="${escapeHtml(transfer.id)}" hidden>${escapeHtml(t('transfer.copied'))}</p>
    ` : ''}
    ${renglonTraslado(t('transfer.notes'), transfer.notes)}
    ${contactoTraslado(transfer, t)}
  `, { extraClass: cancelled ? 'nc-card--muted' : '' });
}

export function renderTransferScreen(ctx) {
  const { transfers, now, lang, t } = ctx;
  if (!transfers || transfers.length === 0) return '';

  // Copia antes de ordenar: el arreglo viene del expediente y otras
  // pantallas lo leen en el mismo repintado.
  const ordenados = [...transfers].sort(
    (a, b) => instantMs(a.scheduledAt) - instantMs(b.scheduledAt),
  );

  return `
    <section class="nc-screen">
      <h1 class="nc-screen-title">${escapeHtml(t('transfer.title'))}</h1>
      ${ordenados.map((tr) => renderTrasladoCard(tr, now, lang, t)).join('\n')}
    </section>
  `;
}

// Copiar placas, patrón de stay.js. La diferencia es que aquí hay un botón
// por traslado, así que la confirmación se busca por data-transfer-id y no
// con un querySelector suelto: con dos traslados en pantalla, el genérico
// encendería siempre la del primero.
export function attachTransferScreen(rootEl) {
  rootEl.querySelectorAll('[data-role="copy-plate"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.plate);
      } catch {
        // La Clipboard API puede exigir permiso o gesto del usuario según
        // el navegador. Si falla, no se rompe la pantalla: simplemente no
        // se confirma nada.
        return;
      }
      const feedback = rootEl.querySelector(`[data-role="copy-feedback"][data-transfer-id="${btn.dataset.transferId}"]`);
      if (!feedback) return;
      feedback.hidden = false;
      setTimeout(() => { feedback.hidden = true; }, 2000);
    });
  });
}

export const TRANSFER_CSS = `
.nc-transfer-kind { margin: 0 0 6px; font-size: 17px; font-weight: 700; }
.nc-transfer-kind--cancelled { text-decoration: line-through; opacity: 0.6; }
.nc-transfer-status { margin: 0 0 8px; }
.nc-transfer-when { margin: 0 0 10px; font-size: 15px; font-weight: 600; }
.nc-transfer-row { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; margin: 0 0 8px; }
.nc-transfer-row span { opacity: 0.7; }
/* No es un renglón etiqueta/valor: no hay valor todavía, es un aviso. */
.nc-transfer-pending { margin: 0 0 8px; font-size: 13px; opacity: 0.75; }
`;
