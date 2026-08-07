// Etapa D — entrada al panel. La Etapa C construyó /api/auth/*, pero no
// había pantalla: el panel pedía datos a /api/coordinator, que exige sesión
// en toda ruta, y contestaba 401 a todo sin decir por qué.
//
// Esta pantalla no decide nada de sesión: junta usuario y contraseña y se
// los pasa a coordinatorApp.js, que llama al authClient. La contraseña
// nunca se guarda ni se repinta — sale del campo, va al servidor y se
// suelta.

import { escapeHtml } from '../../util.js';

// `error` es un código, no un texto: 'invalidCredentials' y 'expired'
// salen del bloque auth (son cosas de la sesión), y el resto del bloque
// coordinator.error, que comparten los cuatro formularios del panel.
function mensajeDeError(t, error) {
  if (!error) return '';
  const llave = error === 'invalidCredentials' || error === 'expired' ? `coordinator.auth.${error}` : `coordinator.error.${error}`;
  // role="alert" y no un párrafo cualquiera: el error aparece sin que la
  // pantalla cambie de sitio, así que con lector de pantalla, sin esto, el
  // botón simplemente "no hace nada".
  return `<p class="nc-signin-error" role="alert" data-role="signin-error">${escapeHtml(t(llave))}</p>`;
}

export function renderSignInScreen(ctx) {
  const { t, error, username = '', busy = false } = ctx;

  return `
    <section class="nc-screen nc-signin">
      <h1 class="nc-screen-title">${escapeHtml(t('coordinator.auth.title'))}</h1>
      <p class="nc-signin-intro">${escapeHtml(t('coordinator.auth.intro'))}</p>
      <form class="nc-form" data-role="signin-form">
        <label class="nc-field">
          <span class="nc-field-label">${escapeHtml(t('coordinator.auth.usernameLabel'))}</span>
          <input
            type="text"
            name="username"
            class="nc-input"
            value="${escapeHtml(username)}"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
            required
          />
        </label>

        <label class="nc-field">
          <span class="nc-field-label">${escapeHtml(t('coordinator.auth.passwordLabel'))}</span>
          <!-- Sin value, nunca, ni después de un error: repintarla la
               dejaría escrita en el HTML del documento, legible por
               cualquier extensión y por quien abra el inspector.
               autocomplete="current-password" es lo que hace que el gestor
               del navegador ofrezca guardarla — la alternativa real es un
               papelito pegado al monitor. -->
          <input type="password" name="password" class="nc-input" autocomplete="current-password" required />
        </label>

        ${mensajeDeError(t, error)}

        <button type="submit" class="nc-button nc-button--primary"${busy ? ' disabled' : ''}>
          ${escapeHtml(t(busy ? 'coordinator.auth.signingIn' : 'coordinator.auth.signIn'))}
        </button>
      </form>
    </section>
  `;
}

export function attachSignInScreen(rootEl, ctx = {}) {
  const { onSubmit } = ctx;
  const form = rootEl.querySelector('[data-role="signin-form"]');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    onSubmit?.({ username: String(data.get('username') ?? ''), password: String(data.get('password') ?? '') });
    // El campo se vacía en cuanto sale, sin esperar la respuesta: si la red
    // tarda, la contraseña no se queda en pantalla mientras tanto.
    form.elements.password.value = '';
  });

  // El foco donde toca: al usuario si está vacío, a la contraseña si el
  // usuario ya viene puesto de un intento anterior.
  const usuario = rootEl.querySelector('[name="username"]');
  const clave = rootEl.querySelector('[name="password"]');
  (usuario?.value ? clave : usuario)?.focus?.();
}

export const SIGNIN_CSS = `
.nc-signin { max-width: 380px; margin: 0 auto; }
.nc-signin-intro { font-size: 13px; opacity: 0.75; margin: 0 0 4px; }
.nc-signin-error { font-size: 13px; color: var(--nc-danger, #b3261e); margin: 0; }
`;
