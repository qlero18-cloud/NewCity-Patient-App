// Fase 05 — utilidades compartidas de presentación. Sin lógica de fechas ni
// de negocio (eso vive en src/domain/): solo escapado de texto y armado de
// atributos, que es responsabilidad legítima de la capa de UI.

// La comilla simple también se escapa: este proyecto arma atributos por
// concatenación de plantillas, y aunque hoy todas las comillas de atributo
// son dobles, un nombre como "Farmer's Table" dentro de un atributo con
// comillas simples se escaparía del valor. Escapar los cinco caracteres
// cuesta lo mismo que escapar cuatro y quita la dependencia de que quien
// escriba la siguiente plantilla se acuerde de usar comillas dobles.
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// classNames(['a', cond && 'b', 'c']) -> "a c"  (omite valores falsy)
export function classNames(list) {
  return list.filter(Boolean).join(' ');
}

// Nombre de ubicación en el idioma activo, con reserva razonable si el id
// no existiera en el catálogo (no debería pasar — probado en fase 03/04 —
// pero una pantalla nunca debe reventar por un locationId huérfano).
export function locationName(locations, locationId, lang) {
  const loc = getLocationById(locations, locationId);
  if (!loc) return locationId;
  return loc.name[lang] ?? loc.name.es;
}

// El mismo .find() estaba repetido inline en media docena de sitios. Vive
// aquí para que "buscar una Location por id" tenga un solo nombre.
export function getLocationById(locations, locationId) {
  return locations.find((l) => l.id === locationId) ?? null;
}

// Opciones de un <select> de ubicación, en el idioma activo. La comparten
// el formulario de agregar cita y el de editar (src/ui/screens/coordinator/
// itinerary.js), que necesitan la misma lista pero con distinto valor
// preseleccionado.
export function locationOptionsHtml(locations, lang, selectedId = null) {
  return locations
    .map((loc) => {
      const selected = loc.id === selectedId ? ' selected' : '';
      return `<option value="${escapeHtml(loc.id)}"${selected}>${escapeHtml(loc.name[lang] ?? loc.name.es)}</option>`;
    })
    .join('\n');
}
