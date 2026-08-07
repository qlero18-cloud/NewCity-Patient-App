// Etapa F — las dos pantallas sin datos de la app del paciente.
//
// Vivían dentro de boot() (src/ui/app.js) escribiendo innerHTML directo,
// y por eso eran las únicas dos pantallas del proyecto sin una sola
// prueba: mirarlas exigía DOM, y aquí no se monta DOM falso (D8). Ahora
// son funciones puras que devuelven HTML, como las otras nueve.
//
// La neutra es la mitad visible de INV-3. El servidor contesta un único
// 404 para "no existe", "malformado" y "ya venció" (visitHandler.js) y
// resolveVisitContext devuelve null en los tres casos; esta pantalla
// cierra la cadena. Recibe SOLO el idioma —ni la visita, ni el motivo—
// porque es la forma más barata de garantizar que no pueda distinguirlos:
// no hay nada que distinguir con lo que se le pasa.
//
// El CSS (.nc-neutral y sus dos hijos) no viaja aquí: vive en THEME_CSS
// desde la fase 05 y lo inyecta app.js con el resto.

import { escapeHtml } from '../util.js';
import { translate } from '../i18n.js';

export function renderNeutralScreen(lang) {
  return `
    <div class="nc-neutral">
      <p class="nc-neutral-title">${escapeHtml(translate(lang, 'common.neutralTitle'))}</p>
      <p class="nc-neutral-body">${escapeHtml(translate(lang, 'common.neutralBody'))}</p>
    </div>
  `;
}

// Etapa E — traer el expediente por red toma tiempo, y sin esto la página
// se queda en blanco mientras tanto: en un teléfono con mala señal eso son
// varios segundos indistinguibles de "la app no sirve".
//
// Deliberadamente NO es la pantalla neutra: decirle "este enlace no está
// disponible" a alguien mientras su itinerario todavía viene en camino es
// peor que no decirle nada.
export function renderLoadingScreen(lang) {
  return `
    <div class="nc-neutral">
      <p class="nc-neutral-body">${escapeHtml(translate(lang, 'common.loading'))}</p>
    </div>
  `;
}
