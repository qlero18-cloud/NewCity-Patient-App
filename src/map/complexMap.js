// Fase 04 — mapa esquemático del complejo en SVG en línea (no PNG: los
// puntos tienen que ser tocables, resaltables y escalables, y el archivo
// se publica bajo una CSP estricta). PRD §15.1: no hay planos oficiales
// todavía, así que esto es un esquema referencial, no un plano a escala —
// se etiqueta así en pantalla a propósito, en es y en.
//
// mapa.py (el generador de la presentación, mencionado en esta fase como
// la fuente a portar) no está disponible en este proyecto — solo su salida
// ya renderizada ("Presentacion Checkup/Recursos/Mapa_complejo_ES.png").
// La geometría de aquí se portó leyendo esa imagen (misma idea de tres
// columnas — Estacionamiento · Quartz · Torre Médica — con una fila
// secundaria debajo), no el código fuente de mapa.py. El CONTENIDO sí es
// el ya corregido y aprobado, nunca el que la imagen de referencia todavía
// muestra:
//   - Compass = laboratorio e imagenología, no "Nivel 1 · Gastronomía"
//   - The Yard existe (la imagen de referencia solo mostraba Farmer's Table)
//   - Piso 27 y Farmacia son puntos propios de esta fase, no una nota al
//     pie ("línea de apoyo" / "bloque de la torre", según la corrección ya
//     confirmada por el cliente)
//
// mapPointId comparte espacio de nombres uno a uno con locationId
// (src/data/locations.js, fase 03) y con mapHighlightId
// (src/data/routes.js, fase 02) — probado de forma cruzada y genérica en
// test/map/ids.test.js.

import { locations } from '../data/locations.js';
import { routes } from '../data/routes.js';

export const MAP_POINT_IDS = ['mp_parking', 'mp_lobby', 'mp_compass', 'mp_floor27', 'mp_quartz', 'mp_level1', 'mp_pharmacy'];

export const MAP_VIEWBOX = '0 0 420 380';
const [, , VB_WIDTH, VB_HEIGHT] = MAP_VIEWBOX.split(' ').map(Number);

// "Qué hay ahí" por punto (ficha, PRD/fase 04) — texto tomado literal de la
// propia tabla de docs/phases/phase-04-map-svg.md (columna "Qué es"), no
// inventado aquí. Location (fase 03) no tiene un campo dedicado a esto: su
// `name` ya combina nombre y contenido para las ubicaciones compuestas
// (p. ej. "Compass · Laboratorio e imagenología"), pero no para todas —
// Quartz en locations.js es solo "Quartz Hotel & Spa", mientras que la
// tabla de esta fase sí detalla "hospedaje, recovery y Boka". En vez de
// tocar locations.js (fase ya aprobada, fuera de alcance de esta fase) o
// duplicar de forma inconsistente, este texto se toma de la tabla ya
// aprobada de la fase 04.
const POINT_BLURB = {
  mp_parking: { es: 'Acceso vehicular y valet', en: 'Vehicle access and valet' },
  mp_lobby: { es: 'Acceso general', en: 'General access' },
  mp_compass: { es: 'Laboratorio e imagenología', en: 'Lab and imaging' },
  mp_floor27: { es: 'Consultorios', en: 'Consultation offices' },
  mp_quartz: { es: 'Hospedaje, recovery y Boka', en: 'Lodging, recovery, and Boka' },
  mp_level1: { es: "Farmer's Table y The Yard", en: "Farmer's Table and The Yard" },
  mp_pharmacy: { es: 'Farmacia', en: 'Pharmacy' },
};

// Geometría del esquema — coordenadas propias de este SVG (viewBox
// 420×380), sin relación con escala real (PRD §15.1: "no es un plano a
// escala"). Radio 32 en las 7: si el SVG ocupara los 375px completos de
// viewport, 32 × 2 × (375/420) ≈ 57px de diámetro tocable. En la práctica
// ningún contenedor real es borde a borde — se midió con
// getBoundingClientRect() en src/map/demo.html dentro de su propio padding
// (SVG efectivo de 343px, no 375) y dio 52.3px, todavía con margen sano
// sobre el mínimo de 44px pedido. Un radio de 28 medía apenas 45.7px en
// ese mismo contenedor — de ahí el ajuste a 32: la aritmética sola no
// bastaba, hacía falta medir el caso real y corregir.
const POINT_LAYOUT = {
  mp_parking: { x: 70, y: 80, r: 32 },
  mp_quartz: { x: 200, y: 80, r: 32 },
  mp_lobby: { x: 330, y: 80, r: 32 },
  mp_pharmacy: { x: 70, y: 190, r: 32 },
  mp_level1: { x: 200, y: 190, r: 32 },
  mp_floor27: { x: 330, y: 190, r: 32 },
  mp_compass: { x: 265, y: 290, r: 32 },
};

const CAPTION = {
  es: 'Esquema referencial — sujeto a los planos oficiales',
  en: 'Reference schematic — subject to official floor plans',
};

const ARIA_MAP_LABEL = {
  es: 'Mapa esquemático del complejo NewCity',
  en: 'Schematic map of the NewCity complex',
};

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shortLabel(location, lang) {
  // Etiqueta corta bajo cada punto: primera parte del nombre bilingüe
  // (antes del " · "), para no saturar un círculo de 56 unidades con el
  // nombre completo de ubicaciones compuestas como "Nivel 1 · Gastronomía
  // (Farmer's Table, The Yard)".
  const full = location.name[lang] ?? location.name.es;
  return full.split(' · ')[0];
}

export function getMapPointMeta(mapPointId, lang = 'es') {
  const location = locations.find((l) => l.mapPointId === mapPointId);
  if (!location) return null;
  const blurb = POINT_BLURB[mapPointId]?.[lang] ?? POINT_BLURB[mapPointId]?.es ?? '';
  return {
    id: mapPointId,
    locationId: location.id,
    name: location.name[lang] ?? location.name.es,
    blurb,
    hours: location.hours,
    unconfirmed: location.unconfirmed === true,
  };
}

function pointGroupSvg(mapPointId, lang) {
  const layout = POINT_LAYOUT[mapPointId];
  const location = locations.find((l) => l.mapPointId === mapPointId);
  if (!layout || !location) return '';
  const label = escapeXml(shortLabel(location, lang));
  const ariaLabel = escapeXml(location.name[lang] ?? location.name.es);
  const labelY = layout.y + layout.r + 16;
  return `
    <g class="nc-map-point" data-map-point-id="${mapPointId}" role="button" tabindex="0" aria-label="${ariaLabel}">
      <circle class="nc-map-point-hit" cx="${layout.x}" cy="${layout.y}" r="${layout.r}"></circle>
      <text class="nc-map-point-label" x="${layout.x}" y="${labelY}" text-anchor="middle">${label}</text>
    </g>`;
}

// Líneas conectoras decorativas — no interactivas, solo dan idea de
// "todos los puntos están conectados dentro del mismo complejo" (misma
// leyenda que ya traía la imagen de referencia). Se derivan del catálogo
// real de rutas (src/data/routes.js) en vez de inventar qué conecta con
// qué: cada par from→to del catálogo dibuja una línea entre sus dos
// mapPointId, sin duplicar cuando el catálogo trae ambos sentidos (p. ej.
// quartz→lobby_torre y lobby_torre→quartz son la misma línea visual).
function connectorsSvg() {
  const mapPointIdByLocationId = new Map(locations.map((l) => [l.id, l.mapPointId]));
  const seen = new Set();
  const lines = [];
  for (const route of routes) {
    const fromId = mapPointIdByLocationId.get(route.fromLocationId);
    const toId = mapPointIdByLocationId.get(route.toLocationId);
    if (!fromId || !toId || fromId === toId) continue;
    const key = [fromId, toId].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const a = POINT_LAYOUT[fromId];
    const b = POINT_LAYOUT[toId];
    if (!a || !b) continue;
    lines.push(`<line class="nc-map-connector" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`);
  }
  return lines.join('\n    ');
}

// Colores: navy #1C2B53, teal #14BCC4, tinte #EEF3F8 (misma paleta de
// marca que la presentación). Contraste verificado a mano (fórmula WCAG de
// luminancia relativa) antes de fijar esta hoja de estilos, no solo
// elegido a ojo:
//   - texto navy sobre fondo blanco/tinte: ~12.4:1
//   - texto claro sobre fondo navy oscuro: ~13.8:1 (claro) / ~16:1 (oscuro)
//   - texto navy sobre relleno teal (usado en el punto resaltado y en la
//     etiqueta): ~5.9:1
//   - un color que SÍ se descartó por no pasar 4.5:1: texto blanco sobre
//     relleno teal da ~2.3:1 — por eso el punto resaltado usa texto/trazo
//     navy sobre teal, nunca blanco sobre teal, en ningún tema.
const STYLE = `
  .nc-map-root { --nc-navy: #1C2B53; --nc-teal: #14BCC4; --nc-bg: #EEF3F8; --nc-ink: #1C2B53; --nc-connector: #B9C6DA; }
  @media (prefers-color-scheme: dark) {
    .nc-map-root { --nc-bg: #10192E; --nc-ink: #F2F5FA; --nc-connector: #33415E; }
  }
  .nc-map-bg { fill: var(--nc-bg); }
  .nc-map-connector { stroke: var(--nc-connector); stroke-width: 2; stroke-dasharray: 4 5; }
  .nc-map-point-hit { fill: var(--nc-teal); stroke: var(--nc-ink); stroke-width: 2; cursor: pointer; }
  .nc-map-point:focus-visible .nc-map-point-hit { outline: none; stroke-width: 4; }
  .nc-map-point-label { fill: var(--nc-ink); font: 600 13px Barlow, system-ui, sans-serif; }
  .nc-map-point.nc-map-highlight .nc-map-point-hit { fill: var(--nc-navy); stroke: var(--nc-teal); stroke-width: 5; }
  .nc-map-point.nc-map-highlight .nc-map-point-label { font-weight: 700; }
  .nc-map-caption { fill: var(--nc-ink); font: 500 11px Barlow, system-ui, sans-serif; opacity: 0.75; }
`;

export function renderComplexMapSvg({ lang = 'es' } = {}) {
  const points = MAP_POINT_IDS.map((id) => pointGroupSvg(id, lang)).join('\n');
  const connectors = connectorsSvg();
  const caption = escapeXml(CAPTION[lang] ?? CAPTION.es);
  const ariaLabel = escapeXml(ARIA_MAP_LABEL[lang] ?? ARIA_MAP_LABEL.es);
  return `<svg class="nc-map-root" viewBox="${MAP_VIEWBOX}" role="img" aria-label="${ariaLabel}" xmlns="http://www.w3.org/2000/svg">
  <style>${STYLE}</style>
  <rect class="nc-map-bg" x="0" y="0" width="${VB_WIDTH}" height="${VB_HEIGHT}"></rect>
  <g class="nc-map-connectors">
    ${connectors}
  </g>
  <g class="nc-map-points">${points}
  </g>
  <text class="nc-map-caption" x="${VB_WIDTH / 2}" y="${VB_HEIGHT - 15}" text-anchor="middle">${caption}</text>
</svg>`;
}

export function renderFichaHtml(mapPointId, lang = 'es') {
  const meta = getMapPointMeta(mapPointId, lang);
  if (!meta) return null;
  const confirmar = lang === 'en' ? 'TO CONFIRM' : 'POR CONFIRMAR';
  const horarioBadge = meta.hours?.unconfirmed ? ` <span class="nc-ficha-badge">[${confirmar}]</span>` : '';
  const fichaBadge = meta.unconfirmed ? ` <span class="nc-ficha-badge">[${confirmar}]</span>` : '';
  const horarioLabel = lang === 'en' ? 'Hours' : 'Horario';
  const directionsLabel = lang === 'en' ? 'Get directions' : 'Cómo llegar';
  const weekly = meta.hours?.weekly?.[0];
  const horarioText = weekly ? `${weekly.open}–${weekly.close}` : '—';
  return `
    <div class="nc-ficha" data-ficha-for="${escapeXml(mapPointId)}">
      <h3 class="nc-ficha-title">${escapeXml(meta.name)}${fichaBadge}</h3>
      <p class="nc-ficha-blurb">${escapeXml(meta.blurb)}</p>
      <p class="nc-ficha-hours">${escapeXml(horarioLabel)}: ${escapeXml(horarioText)}${horarioBadge}</p>
      <button type="button" class="nc-ficha-directions" data-directions-for="${escapeXml(mapPointId)}">${escapeXml(directionsLabel)}</button>
    </div>`;
}
