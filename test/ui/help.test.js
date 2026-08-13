// Etapa K — pruebas de renderHelpScreen.
//
// La pantalla de Ayuda tenía dos botones y una ficha con `lines: []`: el
// paciente veía "Horario de atención de coordinación" y el distintivo
// "Abierto ahora", pero NUNCA el horario. Y el botón de WhatsApp apuntaba
// al número de Estados Unidos, que según el documento del hospital no
// contesta WhatsApp (D95).
//
// Sin DOM falso (D8): aserciones sobre el HTML que devuelve el render, como
// en hours.test.js y plaza.test.js.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderHelpScreen, attachHelpScreen } from '../../src/ui/screens/help.js';
import { translate } from '../../src/ui/i18n.js';
import { supportChannel } from '../../src/data/support.js';
import { wifiNetworks } from '../../src/data/wifi.js';

const ctx = (now, lang = 'es') => ({ now, lang, t: (path) => translate(lang, path) });

const cuenta = (html, texto) => html.split(texto).length - 1;

// Miércoles 12 de agosto de 2026, 10:00 en Tijuana: Case Management abierto.
const ABIERTO = '2026-08-12T10:00:00-07:00';
// Domingo 16 de agosto: cerrado por omisión del día (D96).
const DOMINGO = '2026-08-16T12:00:00-07:00';

describe('renderHelpScreen — los dos números van a donde deben (D95)', () => {
  test('el botón de WhatsApp usa el número de México, no el de Estados Unidos', () => {
    const html = renderHelpScreen(ctx(ABIERTO));
    assert.ok(html.includes('https://wa.me/526631115360'), 'el botón de WhatsApp debería llevar al número mexicano');
    assert.ok(!html.includes('wa.me/16193243116'), 'el número de Estados Unidos no contesta WhatsApp');
  });

  test('el botón de llamar usa el número de Estados Unidos', () => {
    const html = renderHelpScreen(ctx(ABIERTO));
    assert.ok(html.includes('tel:+16193243116'), 'falta el tel: del número de llamadas');
  });

  test('los dos números se ven escritos, no solo escondidos en el href', () => {
    const html = renderHelpScreen(ctx(ABIERTO));
    assert.ok(html.includes('+52 663 111 5360'), 'falta el número de México legible');
    assert.ok(html.includes('+1 619 324 3116'), 'falta el número de Estados Unidos legible');
  });

  test('cada número dice para qué sirve: el paciente no puede adivinar cuál es WhatsApp', () => {
    const html = renderHelpScreen(ctx(ABIERTO));
    assert.ok(html.includes(translate('es', 'help.whatsappLabel')), 'falta la etiqueta de WhatsApp');
    assert.ok(html.includes(translate('es', 'help.voiceLabel')), 'falta la etiqueta de llamadas');
  });

  test('el correo del hospital es un enlace mailto', () => {
    const html = renderHelpScreen(ctx(ABIERTO));
    assert.ok(html.includes('mailto:info@newcityhospital.com'), 'falta el mailto');
    assert.ok(html.includes('info@newcityhospital.com'), 'el correo debería verse escrito');
  });
});

describe('renderHelpScreen — el horario por fin se lee (D97)', () => {
  // El cliente pidió el nombre interno del hospital, no una paráfrasis. Se
  // fija aquí porque "Case Manager" no se deduce de nada del código: quien
  // lo vea suelto en i18n.js va a querer "traducirlo" a coordinación, y
  // ésta es la prueba que le dice que no.
  test('la tarjeta se llama Case Manager, en los dos idiomas', () => {
    assert.match(renderHelpScreen(ctx(ABIERTO)), /Case Manager/);
    assert.match(renderHelpScreen(ctx(ABIERTO, 'en')), /Case Manager/);
    assert.ok(!renderHelpScreen(ctx(ABIERTO)).includes('coordinación'), 'quedó el nombre viejo en español');
  });

  test('las tres líneas del horario están escritas, no solo el distintivo', () => {
    const html = renderHelpScreen(ctx(ABIERTO));
    assert.ok(html.includes('Lunes a viernes · 8:00 a.m.–6:00 p.m.'), 'falta el horario entre semana');
    assert.ok(html.includes('Sábado · 8:00 a.m.–1:30 p.m.'), 'falta el sábado');
    assert.ok(html.includes('Domingo · cerrado'), 'falta el domingo cerrado');
  });

  test('en inglés, con el reloj de 12 horas de siempre', () => {
    const html = renderHelpScreen(ctx(ABIERTO, 'en'));
    assert.ok(html.includes('Monday to Friday · 8:00 AM–6:00 PM'));
    assert.ok(html.includes('Saturday · 8:00 AM–1:30 PM'));
    assert.ok(html.includes('Sunday · closed'));
    assert.ok(!html.includes('Lunes'), 'se coló el español');
  });

  test('ya no aparece [POR CONFIRMAR]: hay documento del hospital que respalda el horario', () => {
    assert.strictEqual(cuenta(renderHelpScreen(ctx(ABIERTO)), translate('es', 'common.unconfirmedBadge')), 0);
  });

  test('el estado abierto/cerrado sigue saliendo de `now` y no del reloj', () => {
    assert.ok(renderHelpScreen(ctx(ABIERTO)).includes(translate('es', 'hours.openNow')));
    assert.ok(renderHelpScreen(ctx(DOMINGO)).includes(translate('es', 'hours.closedNow')));
  });

  test('el domingo dice cerrado aunque sean las 10 de la mañana: el día no está en la lista', () => {
    const html = renderHelpScreen(ctx('2026-08-16T10:00:00-07:00'));
    assert.ok(html.includes(translate('es', 'hours.closedNow')));
    assert.ok(!html.includes(translate('es', 'hours.openNow')));
  });
});

describe('renderHelpScreen — Wi-Fi (D98)', () => {
  test('las tres redes están, con su nombre exacto', () => {
    const html = renderHelpScreen(ctx(ABIERTO));
    for (const w of wifiNetworks) {
      assert.ok(html.includes(w.ssid), `falta la red ${w.ssid}`);
    }
  });

  test('la contraseña se ve y se puede copiar', () => {
    const html = renderHelpScreen(ctx(ABIERTO));
    assert.ok(html.includes('bienvenidos'), 'la contraseña debería verse escrita');
    // Dos botones, no tres: la red de la plaza es abierta y no hay qué copiar.
    assert.strictEqual(cuenta(html, 'data-role="copy-wifi"'), 2);
    assert.ok(html.includes('data-wifi-id="piso27"'));
    assert.ok(html.includes('data-wifi-id="compass"'));
    assert.ok(!html.includes('data-wifi-id="plaza"'), 'la red abierta no lleva botón de copiar');
  });

  test('la red abierta lo dice, en vez de dejar el renglón vacío', () => {
    assert.ok(renderHelpScreen(ctx(ABIERTO)).includes(translate('es', 'wifi.noPassword')));
    assert.ok(renderHelpScreen(ctx(ABIERTO, 'en')).includes(translate('en', 'wifi.noPassword')));
  });

  test('dónde alcanza cada red se traduce', () => {
    const es = renderHelpScreen(ctx(ABIERTO));
    const en = renderHelpScreen(ctx(ABIERTO, 'en'));
    // "Compass · Lab & Imaging" sale como "Lab &amp; Imaging": el render
    // escapa, que es justo lo que debe hacer. Mismo criterio que
    // hours.test.js.
    const escapado = (s) => s.replace(/&/g, '&amp;');
    for (const w of wifiNetworks) {
      assert.ok(es.includes(escapado(w.where.es)), `falta "${w.where.es}" en español`);
      assert.ok(en.includes(escapado(w.where.en)), `falta "${w.where.en}" en inglés`);
    }
  });

  test('hay una función para enganchar los botones de copiar, como en stay.js y transfer.js', () => {
    assert.strictEqual(typeof attachHelpScreen, 'function');
  });
});

describe('renderHelpScreen — el HTML no se rompe', () => {
  test('todo el texto del paciente sale escapado (ningún < ni > sueltos de los datos)', () => {
    const html = renderHelpScreen(ctx(ABIERTO));
    assert.ok(!/&(?!amp;|lt;|gt;|quot;|#39;)/.test(html.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, '')), 'quedó un & sin escapar');
  });

  test('los datos vienen del catálogo, no están escritos a mano en la pantalla', () => {
    const html = renderHelpScreen(ctx(ABIERTO));
    // Si alguien cambia support.js, la pantalla tiene que seguirlo sola.
    assert.ok(html.includes(supportChannel.email));
    assert.ok(html.includes(`tel:${supportChannel.voiceNumber}`));
  });
});
