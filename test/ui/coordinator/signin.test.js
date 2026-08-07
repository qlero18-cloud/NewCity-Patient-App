// Etapa D — pantalla de entrada al panel. Mismo patrón que el resto de
// test/ui/: este proyecto no trae DOM falso para node:test, así que lo
// automatizado son aserciones sobre el HTML que devuelve
// renderSignInScreen(ctx). El envío real se revisa en navegador.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderSignInScreen, attachSignInScreen } from '../../../src/ui/screens/coordinator/signin.js';
import { translate } from '../../../src/ui/i18n.js';

const ctx = (lang, extra = {}) => ({ t: (path) => translate(lang, path), ...extra });

describe('renderSignInScreen', () => {
  test('título, los dos campos y el botón, en los dos idiomas', () => {
    for (const lang of ['es', 'en']) {
      const html = renderSignInScreen(ctx(lang));
      for (const llave of ['title', 'usernameLabel', 'passwordLabel', 'signIn']) {
        assert.ok(
          html.includes(translate(lang, `coordinator.auth.${llave}`)),
          `falta coordinator.auth.${llave} en ${lang}`,
        );
      }
    }
  });

  test('la contraseña va en un input type="password"', () => {
    // No es cosmético: en una máquina de coordinación con gente pasando
    // detrás, type="text" muestra la contraseña a la sala entera. Y sin
    // type="password" el gestor de contraseñas del navegador no reconoce
    // el campo, así que tampoco lo llena ni lo guarda.
    const html = renderSignInScreen(ctx('es'));
    assert.match(html, /<input[^>]*type="password"[^>]*name="password"|<input[^>]*name="password"[^>]*type="password"/);
  });

  test('trae los autocomplete que el gestor de contraseñas necesita', () => {
    // Sin username/current-password el navegador no ofrece guardar la
    // credencial, y la alternativa real es un papelito pegado al monitor.
    const html = renderSignInScreen(ctx('es'));
    assert.ok(html.includes('autocomplete="username"'));
    assert.ok(html.includes('autocomplete="current-password"'));
  });

  test('sin error no se pinta ningún hueco de error', () => {
    const html = renderSignInScreen(ctx('es'));
    assert.ok(!html.includes(translate('es', 'coordinator.auth.invalidCredentials')));
  });

  test('credenciales malas y servidor caído dicen cosas DISTINTAS', () => {
    // Es la diferencia entre "revisa lo que escribiste" y "no es tu culpa,
    // el servidor no contesta". Sin ella alguien teclea su contraseña seis
    // veces mientras el problema es una variable de entorno sin poner.
    const malas = renderSignInScreen(ctx('es', { error: 'invalidCredentials' }));
    const caido = renderSignInScreen(ctx('es', { error: 'network' }));

    assert.ok(malas.includes(translate('es', 'coordinator.auth.invalidCredentials')));
    assert.ok(caido.includes(translate('es', 'coordinator.error.network')));
    assert.ok(!caido.includes(translate('es', 'coordinator.auth.invalidCredentials')));
  });

  test('el error se anuncia con role="alert"', () => {
    // El error aparece sin que la pantalla cambie de sitio; con lector de
    // pantalla, sin role="alert" no se anuncia y el botón simplemente "no
    // hace nada".
    assert.match(renderSignInScreen(ctx('es', { error: 'invalidCredentials' })), /role="alert"/);
  });

  test('la sesión vencida se distingue de no haber entrado nunca', () => {
    const html = renderSignInScreen(ctx('es', { error: 'expired' }));
    assert.ok(html.includes(translate('es', 'coordinator.auth.expired')));
  });

  test('nunca se rellena la contraseña, ni siquiera tras un error', () => {
    // Repintar con la contraseña dentro la dejaría en el HTML del
    // documento, legible por cualquier extensión y por cualquiera que abra
    // el inspector.
    const html = renderSignInScreen(ctx('es', { error: 'invalidCredentials', username: 'ana.ruiz' }));
    assert.ok(html.includes('value="ana.ruiz"'), 'el usuario sí se conserva, para no volver a teclearlo');
    assert.ok(!/name="password"[^>]*value=/.test(html), 'la contraseña no se rellena');
  });
});

describe('attachSignInScreen', () => {
  test('no truena con un rootEl mínimo', () => {
    // Mismo criterio defensivo del resto de attach*Screen del proyecto.
    assert.doesNotThrow(() => attachSignInScreen({ querySelector: () => null }, {}));
  });
});
