// Fase 05 — utilidades compartidas de presentación. Sin lógica de fechas ni
// de negocio (eso vive en src/domain/): solo escapado de texto y armado de
// atributos, que es responsabilidad legítima de la capa de UI.

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// classNames(['a', cond && 'b', 'c']) -> "a c"  (omite valores falsy)
export function classNames(list) {
  return list.filter(Boolean).join(' ');
}

// Nombre de ubicación en el idioma activo, con reserva razonable si el id
// no existiera en el catálogo (no debería pasar — probado en fase 03/04 —
// pero una pantalla nunca debe reventar por un locationId huérfano).
export function locationName(locations, locationId, lang) {
  const loc = locations.find((l) => l.id === locationId);
  if (!loc) return locationId;
  return loc.name[lang] ?? loc.name.es;
}
