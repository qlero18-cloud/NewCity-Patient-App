// Plaza — tres secciones sobre el mismo catálogo (src/data/plaza.js):
// Restaurantes (category: gastronomia, con filtro por tipo de comida, sin
// cambios de fase 05), Directorio (salud/belleza/servicios/moda, fase 07 —
// D27) y Amenidades (antes siempre vacía, PRD §15.3 — fase 07 la llena con
// dato real). Fase 03 no confirmó ningún tipo de comida todavía (cuisine:
// [] en gastronomia) ni horario de ningún local — el filtro de comida se
// arma leyendo los tags que de verdad existan (hoy: ninguno además de
// "Todos"), listo para cuando haya dato real sin tocar este archivo otra
// vez.

import { plazaVenues } from '../../data/plaza.js';
import { escapeHtml } from '../util.js';
import { renderFicha } from '../components/ficha.js';

// venue.name es un string (nombre de marca, igual en los dos idiomas —
// "7-Eleven", "Skin Point") en la mayoría de los locales, pero un objeto
// {es,en} en las amenidades (D27): "Baños"/"Restrooms" sí necesita
// traducirse, a diferencia de una marca. Mismo patrón `?? .es` que ya usa
// locationName() en util.js para Location.
function venueName(venue, lang) {
  if (typeof venue.name === 'string') return venue.name;
  return venue.name[lang] ?? venue.name.es;
}

function byCategory(category) {
  return plazaVenues.filter((v) => v.category === category);
}

function allCuisineTags() {
  return [...new Set(byCategory('gastronomia').flatMap((v) => v.cuisine))].sort();
}

function allDirectoryCategories() {
  // Orden fijo (el mismo del documento fuente), no alfabético.
  return ['salud', 'belleza', 'servicios', 'moda'].filter((c) => byCategory(c).length > 0);
}

// venue.level es "N1"/"Quartz" (código corto, sin traducir, desde fase 03
// — se muestra tal cual en los dos idiomas) en los venues originales, o
// "calle"/"plaza"/"ambos" (D27) en los nuevos: esos SÍ son palabras reales
// que deben traducirse, no códigos. LEVEL_KEYS distingue los dos casos sin
// necesitar un campo aparte.
const LEVEL_KEYS = new Set(['calle', 'plaza', 'ambos']);
function levelLine(venue, t) {
  return LEVEL_KEYS.has(venue.level) ? t(`plaza.level.${venue.level}`) : venue.level;
}

function venueLines(venue, t, lang) {
  if (venue.category === 'gastronomia') {
    const cuisineLine = venue.cuisine.length > 0 ? venue.cuisine.join(', ') : t('plaza.cuisineUnknown');
    return [cuisineLine, levelLine(venue, t)];
  }
  if (venue.category === 'amenidad') {
    return [levelLine(venue, t)];
  }
  return [t(`plaza.category.${venue.category}`), levelLine(venue, t)];
}

export function renderPlazaScreen(ctx) {
  const { t, lang } = ctx;
  const cuisineTags = allCuisineTags();
  const directoryCategories = allDirectoryCategories();
  const amenities = byCategory('amenidad');

  const cuisineFilterHtml = `
    <div class="nc-cuisine-filter" role="group" aria-label="${escapeHtml(t('plaza.restaurantsTitle'))}">
      <button type="button" class="nc-chip nc-chip--active" data-cuisine="">${escapeHtml(t('plaza.cuisineFilterAll'))}</button>
      ${cuisineTags.map((tag) => `<button type="button" class="nc-chip" data-cuisine="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('\n')}
    </div>
  `;
  const restaurantsHtml = byCategory('gastronomia')
    .map((v) => `<div data-venue-cuisines="${escapeHtml(v.cuisine.join('|'))}">${renderFicha({ title: venueName(v, lang), lines: venueLines(v, t, lang), unconfirmed: v.unconfirmed === true, t })}</div>`)
    .join('\n');

  const categoryFilterHtml = `
    <div class="nc-cuisine-filter" role="group" aria-label="${escapeHtml(t('plaza.directoryTitle'))}">
      <button type="button" class="nc-chip nc-chip--active" data-category="">${escapeHtml(t('plaza.cuisineFilterAll'))}</button>
      ${directoryCategories.map((c) => `<button type="button" class="nc-chip" data-category="${escapeHtml(c)}">${escapeHtml(t(`plaza.category.${c}`))}</button>`).join('\n')}
    </div>
  `;
  const directoryHtml = directoryCategories
    .flatMap((c) => byCategory(c))
    .map((v) => `<div data-venue-category="${escapeHtml(v.category)}">${renderFicha({ title: venueName(v, lang), lines: venueLines(v, t, lang), unconfirmed: v.unconfirmed === true, t })}</div>`)
    .join('\n');

  const amenitiesHtml = amenities.length === 0
    ? `<p class="nc-empty-state">${escapeHtml(t('plaza.amenitiesEmpty'))}</p>`
    : amenities.map((v) => renderFicha({ title: venueName(v, lang), lines: venueLines(v, t, lang), unconfirmed: v.unconfirmed === true, t })).join('\n');

  return `
    <section class="nc-screen">
      <h1 class="nc-screen-title">${escapeHtml(t('plaza.title'))}</h1>

      <h2 class="nc-section-title">${escapeHtml(t('plaza.restaurantsTitle'))}</h2>
      ${cuisineFilterHtml}
      <div class="nc-venue-list" data-role="venue-list">${restaurantsHtml}</div>

      <h2 class="nc-section-title">${escapeHtml(t('plaza.directoryTitle'))}</h2>
      ${categoryFilterHtml}
      <div class="nc-venue-list" data-role="directory-list">${directoryHtml}</div>

      <h2 class="nc-section-title">${escapeHtml(t('plaza.amenitiesTitle'))}</h2>
      <div class="nc-venue-list" data-role="amenities-list">${amenitiesHtml}</div>
    </section>
  `;
}

export function attachPlazaScreen(rootEl) {
  // data-cuisine y data-category no se traslapan (son dos filtros
  // distintos, cada chip lleva solo uno de los dos atributos), así que
  // seleccionar por atributo alcanza sin necesitar acotar por contenedor.
  const cuisineChips = rootEl.querySelectorAll('[data-cuisine]');
  const venues = rootEl.querySelectorAll('[data-venue-cuisines]');
  cuisineChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      cuisineChips.forEach((c) => c.classList.remove('nc-chip--active'));
      chip.classList.add('nc-chip--active');
      const wanted = chip.dataset.cuisine;
      venues.forEach((v) => {
        const cuisines = v.dataset.venueCuisines.split('|').filter(Boolean);
        v.style.display = !wanted || cuisines.includes(wanted) ? '' : 'none';
      });
    });
  });

  const categoryChips = rootEl.querySelectorAll('[data-category]');
  const directoryVenues = rootEl.querySelectorAll('[data-venue-category]');
  categoryChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      categoryChips.forEach((c) => c.classList.remove('nc-chip--active'));
      chip.classList.add('nc-chip--active');
      const wanted = chip.dataset.category;
      directoryVenues.forEach((v) => {
        v.style.display = !wanted || v.dataset.venueCategory === wanted ? '' : 'none';
      });
    });
  });
}

export const PLAZA_CSS = `
.nc-cuisine-filter { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.nc-chip { min-height: 44px; min-width: 44px; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--nc-card-border); background: var(--nc-card-bg); color: var(--nc-ink); font: 600 12px Barlow, system-ui, sans-serif; cursor: pointer; }
.nc-chip--active { background: var(--nc-teal); color: var(--nc-navy); border-color: var(--nc-teal); }
.nc-venue-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
.nc-empty-state { font-size: 13px; opacity: 0.65; }
`;
