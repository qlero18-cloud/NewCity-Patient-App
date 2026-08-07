// Fase 09 (D28) — attachNav(root): cablea todo elemento [data-nav] de root
// a navegación por hash (location.hash = '#/<valor>'). Extraído del
// cableado que antes vivía inline dentro de render() en src/ui/app.js,
// para que src/ui/coordinatorApp.js (fase 09) use exactamente el mismo
// mecanismo — no una copia independiente que pudiera volver a divergir en
// el nombre del atributo, que es justo la causa raíz de D28
// (docs/DECISIONS.md): src/ui/components/tabs.js emitía data-tab="${id}"
// mientras que app.js solo escuchaba [data-nav], y la barra inferior del
// paciente nunca navegó al tocarla, en ningún despliegue, hasta que el
// cliente lo reportó en producción.
//
// Requisito para cualquier pantalla nueva que agregue un elemento
// clicable de navegación: usar data-nav="<destino>", nunca otro nombre.
// test/ui/nav.test.js prueba el comportamiento real de clic→hash con un
// doble mínimo de DOM (mismo criterio que ya usa createHighlighter en
// test/map/ids.test.js) — a diferencia de un render*Screen, esto SÍ es
// lógica de cableado, no solo texto, y D28 ya probó que puede fallar en
// silencio si nadie la prueba.
export function attachNav(root) {
  root.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => {
      location.hash = `#/${el.dataset.nav}`;
    });
  });
}
