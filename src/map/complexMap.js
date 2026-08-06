// Fase 04 — mapa esquemático del complejo en SVG en línea (no PNG: los
// puntos tienen que ser tocables, resaltables y escalables, y el archivo
// se publica bajo una CSP estricta). PRD §15.1: no hay planos oficiales
// completos todavía, así que esto sigue siendo un esquema referencial, no
// un plano a escala — se etiqueta así en pantalla a propósito, en es y en.
//
// Geometría original (fase 04): portada leyendo
// "Presentacion Checkup/Recursos/Mapa_complejo_ES.png" (mapa.py, su fuente,
// no estaba disponible), tres columnas en una sola fila más una fila
// secundaria debajo, sin distinguir niveles reales del complejo.
//
// Geometría de fase 07 (D26): reemplazada al recibir
// `directorio-plaza-exterior.pdf` — dos niveles explícitos, Nivel Calle y
// Nivel Plaza, con los 7 puntos en el nivel que de verdad les corresponde,
// pero todavía como fila pareja abstracta (sin fondo real), superada por
// D30 abajo.
//
// Geometría actual (fase 07, D30): el cliente aportó el JPG de esa misma
// señalética a resolución de impresión y pidió usarla como fondo real en
// vez de la fila abstracta de D26 — el archivo de fondo del mapa (nombre
// exacto: ver MAP_BACKGROUND_SRC abajo; deliberadamente no repetido aquí
// como string literal, ver la nota de build.py sobre por qué debe
// aparecer una sola vez en este archivo) es un recorte de solo la columna
// del mapa, sin el panel de directorio ni los logos, redimensionado a
// 700×676 para no inflar demasiado index.html una vez embebido en base64
// por build.py, igual que ya hace con el ícono. Los 7
// círculos se reposicionaron a mano leyendo esa imagen a resolución
// completa, sobre el ícono/bloque real de cada uno:
//   - mp_parking: el ícono "P" de la izquierda (con flecha ▸, el más
//     prominente de los dos que trae el documento)
//   - mp_pharmacy: bloque "H4" (Farmacia La + Barata)
//   - mp_lobby: ícono "LOBBY" (entrada a Torre Médica)
//   - mp_floor27: SIGUE sin aparecer en el documento (es un piso interior
//     de la Torre Médica/H5, no una zona de planta baja) — se aproxima
//     justo arriba del ícono LOBBY, sobre el bloque H5, en vez de
//     inventar una posición sin ninguna base en la imagen
//   - mp_quartz: bloque "S9 Quartz Hotel & Spa"
//   - mp_level1: el documento muestra "The Park Restaurante" (G3, bloque
//     grande) y "Farmer's Table" (G4, ícono aparte) en posiciones
//     DISTINTAS de Nivel Plaza — un solo punto (límite de 7 ya fijado por
//     D26/D27) no puede representar los dos exactos, así que se usa la
//     posición de G3 (el bloque más grande y prominente de los dos)
//   - mp_compass: bloque "H8" (Compass Lab)
// Las etiquetas de nivel en código (LEVEL_LABEL, D26) se quitan: la imagen
// ya trae "NIVEL CALLE | STREET LEVEL" / "NIVEL PLAZA | PLAZA LEVEL"
// impreso, bilingüe de forma permanente — repetirlas por encima habría
// sido redundante (y, a diferencia del texto en código, el de la imagen no
// cambia con el idioma de la app, así que ya no tiene caso intentarlo).
// Sigue siendo un esquema referencial (PRD §15.1: "no es un plano a
// escala"), ahora con una imagen real de fondo en vez de una fila
// abstracta — el aviso en pantalla no cambia.
//
// El CONTENIDO sigue siendo el ya corregido y aprobado, nunca el de
// ninguna imagen de referencia superada:
//   - Compass = laboratorio e imagenología, no "Nivel 1 · Gastronomía" (D14)
//   - La Plaza tiene Farmer's Table y The Park Restaurante en Nivel 1 — "The
//     Yard" se renombró (D25), ver src/data/plaza.js
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

export const MAP_VIEWBOX = '0 0 700 676';
const [, , VB_WIDTH, VB_HEIGHT] = MAP_VIEWBOX.split(' ').map(Number);

// Fondo del mapa (D30) — mismo recorte, mismas dimensiones que el viewBox
// de arriba, así que 1 unidad de este SVG = 1px de la imagen: no hace
// falta ningún factor de escala aparte al leer coordenadas directamente de
// la imagen a resolución completa (ver el comentario de cabecera de este
// archivo). build.py la embebe como data: URI igual que ya hace con el
// ícono — build.py exige que este string literal aparezca EXACTAMENTE una
// vez en todo el archivo (para no embeber la misma imagen varias veces por
// accidente si el string se repitiera en un comentario), así que no lo
// menciones en ningún otro comentario de este archivo, solo aquí.
const MAP_BACKGROUND_SRC = 'assets/plaza-map-background.jpg';

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
  mp_level1: { es: "Farmer's Table y The Park Restaurante", en: "Farmer's Table and The Park Restaurante" },
  mp_pharmacy: { es: 'Farmacia', en: 'Pharmacy' },
};

// Geometría del esquema (D30) — coordenadas leídas directamente del fondo
// del mapa a resolución completa (1 unidad de este SVG = 1px de esa
// imagen, ver MAP_BACKGROUND_SRC arriba), no una fila
// abstracta como en D26. El ancho del viewBox SÍ cambió esta vez (420→700):
// a diferencia de D26, aquí no había forma de preservar el ancho anterior
// y a la vez mostrar la imagen real sin recortarla ni deformarla, así que
// la medición de radio de toque de D26 (52.27px) queda invalidada a
// propósito y hay que volver a medirla con getBoundingClientRect() en el
// navegador real antes de dar esto por terminado — no reescribir este
// comentario con un número sin haberlo medido de nuevo.
//
// Radio 46 en las 7 (antes 32, viewBox 420 ancho; un primer intento con
// 44 en el viewBox 700 de ahora midió 43.12px, por debajo del mínimo).
// Medido de verdad con getBoundingClientRect() en el navegador, a 375px de
// ancho de viewport: el SVG ocupa 343px efectivos dentro de su contenedor
// (mismo número que D26, el padding del contenedor no cambió), y con
// radio 46 el diámetro tocable real dio 45.08px — por encima del mínimo de
// 44px pedido, no solo cerca.
const POINT_LAYOUT = {
  mp_parking: { x: 60, y: 165, r: 46 },
  mp_pharmacy: { x: 620, y: 175, r: 46 },
  mp_lobby: { x: 522, y: 235, r: 46 },
  mp_floor27: { x: 500, y: 115, r: 46 },
  mp_quartz: { x: 130, y: 609, r: 46 },
  mp_level1: { x: 130, y: 489, r: 46 },
  mp_compass: { x: 550, y: 435, r: 46 },
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
  // (Farmer's Table, The Park Restaurante)".
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

// Ancho estimado del texto de la etiqueta, para dibujar una placa de
// fondo detrás de ella (D30): sobre un fondo blanco liso bastaba con el
// contraste de color, pero sobre la imagen real esas mismas letras caen a
// veces sobre bloques de color oscuro o intenso (H8 azul, G3 morado) donde
// dejarían de leerse. No hay DOM real aquí para medir el ancho de verdad
// (mismo motivo que ya documenta test/ui/plaza.test.js para no simular
// clics) — 7.2px por carácter es un promedio razonable para Barlow 600
// 13px, con margen de sobra a propósito: una placa un poco más ancha de lo
// estrictamente necesario es inofensiva, una más angosta corta letras.
function estimateLabelWidth(text) {
  return text.length * 7.2 + 16;
}

function pointGroupSvg(mapPointId, lang) {
  const layout = POINT_LAYOUT[mapPointId];
  const location = locations.find((l) => l.mapPointId === mapPointId);
  if (!layout || !location) return '';
  const label = escapeXml(shortLabel(location, lang));
  const ariaLabel = escapeXml(location.name[lang] ?? location.name.es);
  const labelY = layout.y + layout.r + 16;
  const labelWidth = estimateLabelWidth(label);
  return `
    <g class="nc-map-point" data-map-point-id="${mapPointId}" role="button" tabindex="0" aria-label="${ariaLabel}">
      <circle class="nc-map-point-hit" cx="${layout.x}" cy="${layout.y}" r="${layout.r}"></circle>
      <rect class="nc-map-label-bg" x="${layout.x - labelWidth / 2}" y="${labelY - 13}" width="${labelWidth}" height="18" rx="5"></rect>
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
  .nc-map-root { --nc-navy: #1C2B53; --nc-teal: #14BCC4; --nc-bg: #EEF3F8; --nc-ink: #1C2B53; --nc-connector: #B9C6DA; --nc-label-bg: #FFFFFF; }
  @media (prefers-color-scheme: dark) {
    .nc-map-root { --nc-bg: #10192E; --nc-ink: #F2F5FA; --nc-connector: #33415E; --nc-label-bg: #1C2B53; }
    .nc-map-bg-image { filter: brightness(0.85) saturate(0.9); }
  }
  .nc-map-bg { fill: var(--nc-bg); }
  .nc-map-connector { stroke: var(--nc-connector); stroke-width: 2; stroke-dasharray: 4 5; }
  .nc-map-point-hit { fill: var(--nc-teal); fill-opacity: 0.82; stroke: var(--nc-ink); stroke-width: 2; cursor: pointer; }
  .nc-map-point:focus-visible .nc-map-point-hit { outline: none; stroke-width: 4; }
  .nc-map-label-bg { fill: var(--nc-label-bg); fill-opacity: 0.88; }
  .nc-map-point-label { fill: var(--nc-ink); font: 600 13px Barlow, system-ui, sans-serif; }
  .nc-map-point.nc-map-highlight .nc-map-point-hit { fill: var(--nc-navy); fill-opacity: 0.92; stroke: var(--nc-teal); stroke-width: 5; }
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
  <image class="nc-map-bg-image" href="${MAP_BACKGROUND_SRC}" x="0" y="0" width="${VB_WIDTH}" height="${VB_HEIGHT}" preserveAspectRatio="xMidYMid slice"></image>
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
