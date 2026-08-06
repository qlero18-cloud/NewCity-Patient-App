// Plaza — restaurantes (Farmer's Table, The Park Restaurante, Boka) con filtro por
// tipo de comida, más amenidades en sección aparte (fase 05). Fase 03 no
// confirmó ningún tipo de comida todavía (cuisine: [] en las tres) ni
// ninguna amenidad real — el filtro se arma leyendo los tags que de verdad
// existan en los datos (hoy: ninguno además de "Todos"), listo para cuando
// haya dato real sin tocar este archivo otra vez.

import { plazaVenues } from '../../data/plaza.js';
import { escapeHtml } from '../util.js';
import { renderFicha } from '../components/ficha.js';

function allCuisineTags() {
  return [...new Set(plazaVenues.flatMap((v) => v.cuisine))].sort();
}

function venueLines(venue, t, lang) {
  const cuisineLine = venue.cuisine.length > 0 ? venue.cuisine.join(', ') : t('plaza.cuisineUnknown');
  const levelLine = venue.level;
  return [cuisineLine, levelLine];
}

export function renderPlazaScreen(ctx) {
  const { t, lang } = ctx;
  const tags = allCuisineTags();

  const filterHtml = `
    <div class="nc-cuisine-filter" role="group" aria-label="${escapeHtml(t('plaza.restaurantsTitle'))}">
      <button type="button" class="nc-chip nc-chip--active" data-cuisine="">${escapeHtml(t('plaza.cuisineFilterAll'))}</button>
      ${tags.map((tag) => `<button type="button" class="nc-chip" data-cuisine="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('\n')}
    </div>
  `;

  const venuesHtml = plazaVenues
    .map((v) =>
      `<div data-venue-cuisines="${escapeHtml(v.cuisine.join('|'))}">${renderFicha({
        title: v.name,
        lines: venueLines(v, t, lang),
        unconfirmed: v.unconfirmed === true,
        t,
      })}</div>`
    )
    .join('\n');

  return `
    <section class="nc-screen">
      <h1 class="nc-screen-title">${escapeHtml(t('plaza.title'))}</h1>
      <h2 class="nc-section-title">${escapeHtml(t('plaza.restaurantsTitle'))}</h2>
      ${filterHtml}
      <div class="nc-venue-list" data-role="venue-list">${venuesHtml}</div>

      <h2 class="nc-section-title">${escapeHtml(t('plaza.amenitiesTitle'))}</h2>
      <p class="nc-empty-state">${escapeHtml(t('plaza.amenitiesEmpty'))}</p>
    </section>
  `;
}

export function attachPlazaScreen(rootEl) {
  const chips = rootEl.querySelectorAll('.nc-chip');
  const venues = rootEl.querySelectorAll('[data-venue-cuisines]');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('nc-chip--active'));
      chip.classList.add('nc-chip--active');
      const wanted = chip.dataset.cuisine;
      venues.forEach((v) => {
        const cuisines = v.dataset.venueCuisines.split('|').filter(Boolean);
        v.style.display = !wanted || cuisines.includes(wanted) ? '' : 'none';
      });
    });
  });
}

export const PLAZA_CSS = `
.nc-cuisine-filter { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.nc-chip { min-height: 44px; min-width: 44px; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--nc-card-border); background: var(--nc-card-bg); color: var(--nc-ink); font: 600 12px Barlow, system-ui, sans-serif; cursor: pointer; }
.nc-chip--active { background: var(--nc-teal); color: var(--nc-navy); border-color: var(--nc-teal); }
.nc-venue-list { display: flex; flex-direction: column; gap: 8px; }
.nc-empty-state { font-size: 13px; opacity: 0.65; }
`;
