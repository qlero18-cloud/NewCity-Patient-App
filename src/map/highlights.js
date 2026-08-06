// Fase 04 — resaltado del mapa. `highlightStep(mapHighlightId)` debe
// "resaltar el tramo correspondiente y quitar el resaltado anterior"
// (criterio de aceptación de la fase). mapHighlightId y mapPointId
// comparten el mismo espacio de 7 valores (routes.js reusa a propósito el
// vocabulario de mapPointId para resaltar, ver su comentario de cabecera),
// así que "resaltar un tramo" en la práctica es resaltar el punto del mapa
// asociado al paso de ruta actual.
//
// División deliberada en dos partes:
//   - computeHighlightChange: pura, decide QUÉ cambia (qué se quita, qué se
//     agrega). Se prueba con node:test sin ningún DOM.
//   - createHighlighter: envoltorio delgado que aplica ese cambio sobre un
//     `root` real (clases CSS en el SVG vivo). No asume el DOM completo del
//     navegador — solo pide un objeto con getElementsByMapPointId(id), que
//     el propio SVG generado por complexMap.js implementa vía
//     querySelectorAll y que un doble de prueba puede implementar con un
//     Map en memoria (ver test/map/ids.test.js). Así "quita el resaltado
//     anterior" queda probado con node:test puro; solo la verificación de
//     que el SVG *vivo* en un navegador real de verdad se ve resaltado
//     queda para el navegador integrado, como pide la fase 04 en su propia
//     sección de Verificación.

export const HIGHLIGHT_CLASS = 'nc-map-highlight';

export function computeHighlightChange(previousId, nextId) {
  return {
    remove: previousId ?? null,
    add: nextId,
  };
}

export function createHighlighter(root) {
  let currentId = null;
  return {
    highlightStep(mapHighlightId) {
      const change = computeHighlightChange(currentId, mapHighlightId);
      if (change.remove !== null) {
        for (const el of root.getElementsByMapPointId(change.remove)) {
          el.classList.remove(HIGHLIGHT_CLASS);
        }
      }
      for (const el of root.getElementsByMapPointId(change.add)) {
        el.classList.add(HIGHLIGHT_CLASS);
      }
      currentId = change.add;
      return change;
    },
    currentHighlightId() {
      return currentId;
    },
  };
}

// Adaptador de conveniencia para usar createHighlighter contra un SVG real
// insertado en el DOM del navegador (elementNode = <svg> o cualquier
// contenedor que lo envuelva). No se prueba con node:test (no hay DOM ahí);
// lo ejercita src/map/demo.html a mano en el navegador integrado.
export function highlighterForSvgElement(svgElement) {
  return createHighlighter({
    getElementsByMapPointId(id) {
      return Array.from(svgElement.querySelectorAll(`[data-map-point-id="${id}"]`));
    },
  });
}
