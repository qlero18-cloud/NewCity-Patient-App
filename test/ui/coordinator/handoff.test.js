// Etapa E — la pantalla de entrega: dónde sale el enlace y el QR que la
// coordinadora le manda al paciente. Es la respuesta literal a la pregunta
// que abrió todo esto ("¿dónde se genera el QR para mandárselo al
// paciente?"): hasta la Etapa D el token se acuñaba y se tiraba, y la
// palabra `token` no aparecía en ninguna de las cinco pantallas del panel.
//
// Mismo patrón que el resto de test/ui/coordinator/*.test.js: este
// proyecto no trae un DOM falso para node:test, así que lo automatizado
// aquí son aserciones sobre el HTML que devuelve renderHandoffScreen. El
// clic real de "Copiar" y el que WhatsApp abra de verdad se comprueban en
// navegador (docs/phases/…), no acá.
//
// Lo que sí se prueba a fondo y no es cosmético:
//
//   · El QR no se compara "hay un <svg>": se compara contra el SVG EXACTO
//     que sale de generateQrMatrix(url), y además se decodifica esa matriz
//     para probar que el símbolo lleva el enlace y no otra cosa. Un QR que
//     se pinta bonito y codifica basura se ve idéntico en pantalla y solo
//     falla en el teléfono del paciente, que es donde ya no hay vuelta.
//   · El mensaje de WhatsApp va en el idioma del PACIENTE, no en el del
//     panel. Son dos idiomas distintos a la vez en la misma pantalla: la
//     coordinadora puede tener el panel en español y estar atendiendo a
//     alguien que solo lee inglés.
//   · El enlace largo NO tumba la pantalla. v4 topa en 62 bytes; con el
//     dominio de hoy sobra, con un dominio propio más largo no cabe, y ese
//     día la pantalla tiene que seguir sirviendo el enlace copiable.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderHandoffScreen, visitUrl } from '../../../src/ui/screens/coordinator/handoff.js';
import { panelConVisita } from '../../helpers/loopback.js';
import { translate } from '../../../src/ui/i18n.js';
import { generateQrMatrix, renderQrSvg, decodeQrMatrix } from '../../../src/render/qr.js';

const ORIGEN = 'https://nchpatient.netlify.app';

function ctx(store, visitId, lang, extra = {}) {
  return { store, visitId, lang, origin: ORIGEN, t: (path) => translate(lang, path), ...extra };
}

// Devuelve el mensaje de WhatsApp tal como lo va a ver el paciente. El
// atributo pasa por dos capas —encodeURIComponent y luego escapeHtml— y el
// navegador deshace las dos antes de que WhatsApp lo reciba; comparar
// contra el href crudo probaría el escapado, no el mensaje. Las entidades
// se deshacen en el orden inverso al que las puso escapeHtml (&amp; al
// final) para no reintroducir una entidad al revés.
function mensajeWhatsapp(html) {
  const m = html.match(/href="https:\/\/wa\.me\/\?text=([^"]*)"/);
  if (!m) return null;
  const sinEntidades = m[1]
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
  return decodeURIComponent(sinEntidades);
}

describe('renderHandoffScreen — el enlace de la visita', () => {
  test('arma ${origin}/v/${token} con el token real de la visita', async () => {
    const { store, visit } = await panelConVisita();
    const html = renderHandoffScreen(ctx(store, visit.id, 'es'));

    assert.ok(visit.token, 'la visita de prueba debería traer token; si no, esta prueba no prueba nada');
    assert.ok(
      html.includes(`${ORIGEN}/v/${visit.token}`),
      `el enlace no aparece en la pantalla; se esperaba ${ORIGEN}/v/${visit.token}`
    );
  });

  test('visitUrl es la única fuente de esa forma, y la pantalla la usa', async () => {
    const { store, visit } = await panelConVisita();
    const url = visitUrl(ORIGEN, visit.token);

    assert.strictEqual(url, `${ORIGEN}/v/${visit.token}`);
    assert.ok(renderHandoffScreen(ctx(store, visit.id, 'es')).includes(url));
  });

  test('el enlace es un <a> abrible: la coordinadora puede ver lo que verá el paciente', async () => {
    const { store, visit } = await panelConVisita();
    const html = renderHandoffScreen(ctx(store, visit.id, 'es'));
    const url = visitUrl(ORIGEN, visit.token);

    assert.match(html, new RegExp(`<a[^>]*href="${url}"`), 'el enlace debería ser un <a href> real');
    assert.match(html, /rel="noopener noreferrer"/, 'un target="_blank" sin noopener es el patrón que help.js ya evita');
  });

  test('el botón de copiar carga el enlace completo, no solo el token', async () => {
    const { store, visit } = await panelConVisita();
    const html = renderHandoffScreen(ctx(store, visit.id, 'es'));

    assert.match(html, /data-role="copy-link"/, 'falta el botón de copiar');
    assert.match(
      html,
      new RegExp(`data-role="copy-link"[^>]*data-link="${visitUrl(ORIGEN, visit.token)}"`),
      'el botón de copiar debe llevar la URL completa: un token suelto no se puede pegar en WhatsApp'
    );
  });
});

describe('renderHandoffScreen — el QR', () => {
  test('pinta exactamente el SVG de generateQrMatrix(url), no un <svg> cualquiera', async () => {
    const { store, visit } = await panelConVisita();
    const url = visitUrl(ORIGEN, visit.token);
    const esperado = renderQrSvg(generateQrMatrix(url));

    assert.ok(
      renderHandoffScreen(ctx(store, visit.id, 'es')).includes(esperado),
      'el SVG de la pantalla no coincide módulo a módulo con el que produce el generador'
    );
  });

  test('el símbolo lleva el enlace: decodificarlo devuelve la misma URL', async () => {
    const { store, visit } = await panelConVisita();
    const url = visitUrl(ORIGEN, visit.token);

    // No se lee el SVG de la pantalla (sería un parser de SVG en una
    // prueba de UI); se prueba que el enlace que la pantalla muestra es
    // codificable y redondea. Junto con la prueba de arriba —el SVG es el
    // de ESTA url— eso cierra el círculo.
    assert.strictEqual(decodeQrMatrix(generateQrMatrix(url)), url);
    assert.ok(renderHandoffScreen(ctx(store, visit.id, 'es')).includes(url));
  });

  test('el enlace real cabe en versión 4: 33×33 módulos', async () => {
    const { store, visit } = await panelConVisita();
    const url = visitUrl(ORIGEN, visit.token);

    assert.strictEqual(generateQrMatrix(url).size, 33, `el enlace mide ${Buffer.byteLength(url)} bytes y ya no cabe en v4`);
    assert.ok(renderHandoffScreen(ctx(store, visit.id, 'es')).includes('viewBox="0 0 328 328"'));
  });
});

describe('renderHandoffScreen — enlace que no cabe en un QR (dominio propio largo)', () => {
  // 58 caracteres de origen + "/v/" + 22 del token = 83 bytes. v4 topa en
  // 62. Es el escenario del día que el hospital ponga su propio dominio.
  const ORIGEN_LARGO = `https://${'pacientes-hospital-newcity'.padEnd(50, 'x')}.mx`;

  test('no lanza: la pantalla se pinta completa', async () => {
    const { store, visit } = await panelConVisita();
    assert.doesNotThrow(() => renderHandoffScreen(ctx(store, visit.id, 'es', { origin: ORIGEN_LARGO })));
  });

  test('el enlace, el copiar y el WhatsApp siguen ahí — lo único que falta es el QR', async () => {
    const { store, visit } = await panelConVisita();
    const html = renderHandoffScreen(ctx(store, visit.id, 'es', { origin: ORIGEN_LARGO }));
    const url = visitUrl(ORIGEN_LARGO, visit.token);

    assert.ok(html.includes(url), 'el enlace debe seguir visible aunque el QR no quepa');
    assert.match(html, /data-role="copy-link"/);
    assert.match(html, /https:\/\/wa\.me\//);
    assert.doesNotMatch(html, /<svg/, 'no debe quedar un símbolo a medias en pantalla');
  });

  test('dice por qué no hay QR, en vez de dejar un hueco', async () => {
    const { store, visit } = await panelConVisita();
    const html = renderHandoffScreen(ctx(store, visit.id, 'es', { origin: ORIGEN_LARGO }));

    assert.ok(html.includes(translate('es', 'coordinator.handoff.qrTooLong')));
  });
});

describe('renderHandoffScreen — WhatsApp en el idioma del paciente', () => {
  test('el href es wa.me sin número: el destinatario lo elige la coordinadora', async () => {
    const { store, visit } = await panelConVisita();
    const html = renderHandoffScreen(ctx(store, visit.id, 'es'));

    assert.match(html, /href="https:\/\/wa\.me\/\?text=/, 'debe ser wa.me/?text=…');
    assert.doesNotMatch(
      html,
      /wa\.me\/\d/,
      'no debe llevar número: el Visit no guarda teléfono del paciente y no vamos a inventar uno'
    );
  });

  test('el mensaje va en el idioma del PACIENTE aunque el panel esté en el otro', async () => {
    for (const [langPaciente, langPanel] of [['en', 'es'], ['es', 'en']]) {
      const { store, visit } = await panelConVisita({ lang: langPaciente, patientFirstName: 'Ana' });
      const html = renderHandoffScreen(ctx(store, visit.id, langPanel));
      const url = visitUrl(ORIGEN, visit.token);

      const esperado = translate(langPaciente, 'coordinator.handoff.waMessage')('Ana', url);
      const otro = translate(langPanel, 'coordinator.handoff.waMessage')('Ana', url);

      assert.strictEqual(
        mensajeWhatsapp(html),
        esperado,
        `el mensaje de WhatsApp debería ir en ${langPaciente} (idioma del paciente), no en ${langPanel} (idioma del panel)`
      );
      assert.notStrictEqual(mensajeWhatsapp(html), otro, 'y no debería ir en el idioma del panel');
    }
  });

  test('el mensaje trae el enlace y el nombre de pila del paciente', async () => {
    const { store, visit } = await panelConVisita({ patientFirstName: 'Rocío', lang: 'es' });
    const html = renderHandoffScreen(ctx(store, visit.id, 'es'));
    const mensaje = translate('es', 'coordinator.handoff.waMessage')('Rocío', visitUrl(ORIGEN, visit.token));

    assert.ok(mensaje.includes(visitUrl(ORIGEN, visit.token)), 'la cadena i18n debe interpolar el enlace');
    assert.ok(mensaje.includes('Rocío'), 'la cadena i18n debe interpolar el nombre');
    assert.strictEqual(mensajeWhatsapp(html), mensaje);
  });

  test('un nombre con & o comillas no rompe el atributo href', async () => {
    const { store, visit } = await panelConVisita({ patientFirstName: 'Ana & "Pepe"', lang: 'es' });
    const html = renderHandoffScreen(ctx(store, visit.id, 'es'));

    // Lo que se prueba es el resultado: el atributo cierra donde debe, y
    // el mensaje que sale del otro lado trae el nombre tal cual y el
    // enlace completo — ni cortado por una comilla ni con el & convertido
    // en otro parámetro de la URL.
    const mensaje = mensajeWhatsapp(html);
    assert.ok(mensaje, 'el href de WhatsApp no quedó bien formado');
    assert.ok(mensaje.includes('Ana & "Pepe"'), `el nombre se deformó: ${mensaje}`);
    assert.ok(mensaje.includes(visitUrl(ORIGEN, visit.token)), 'el enlace se perdió al escapar el nombre');
  });
});

describe('renderHandoffScreen — textos propios, traducidos de verdad', () => {
  test('título, instrucción y los dos botones salen de i18n en los dos idiomas', async () => {
    for (const lang of ['es', 'en']) {
      const { store, visit } = await panelConVisita({ lang });
      const html = renderHandoffScreen(ctx(store, visit.id, lang));

      for (const key of ['title', 'intro', 'linkLabel', 'copy', 'whatsapp', 'qrHint']) {
        assert.ok(
          html.includes(translate(lang, `coordinator.handoff.${key}`)),
          `falta coordinator.handoff.${key} en ${lang}`
        );
      }
    }
  });

  test('las cadenas están de verdad traducidas: es y en no son la misma', () => {
    for (const key of ['title', 'intro', 'linkLabel', 'copy', 'whatsapp', 'qrHint', 'qrTooLong']) {
      assert.notStrictEqual(
        translate('es', `coordinator.handoff.${key}`),
        translate('en', `coordinator.handoff.${key}`),
        `coordinator.handoff.${key} quedó igual en los dos idiomas`
      );
    }
  });
});

describe('renderHandoffScreen — cuando no hay enlace que dar', () => {
  test('visita inexistente: el mismo mensaje que las otras pantallas, sin enlace', async () => {
    const { store } = await panelConVisita();
    const html = renderHandoffScreen(ctx(store, 'v_no_existe', 'es'));

    assert.ok(html.includes(translate('es', 'coordinator.visitNotFound')));
    assert.doesNotMatch(html, /\/v\//, 'no debe armar un enlace de una visita que no existe');
    assert.doesNotMatch(html, /data-role="copy-link"/);
  });

  test('expediente sin token: avisa, en vez de ofrecer /v/undefined', async () => {
    // No es hipotético: GET /visits (la lista) borra el token a propósito
    // (sinToken, coordinatorHandler.js). El día que alguien meta un
    // resumen en `records`, esta pantalla no debe entregarle a un paciente
    // un enlace roto que se ve igual de real que uno bueno.
    const { store, visit } = await panelConVisita();
    const sinToken = {
      ...store.getVisit(visit.id),
      visit: Object.fromEntries(Object.entries(store.getVisit(visit.id).visit).filter(([k]) => k !== 'token')),
    };
    const falso = { getVisit: () => sinToken };
    const html = renderHandoffScreen(ctx(falso, visit.id, 'es'));

    assert.ok(html.includes(translate('es', 'coordinator.handoff.noToken')));
    assert.doesNotMatch(html, /\/v\/undefined/);
    assert.doesNotMatch(html, /data-role="copy-link"/);
  });

  test('panel abierto como archivo local (origin "null"): avisa en vez de armar null/v/…', async () => {
    // Chrome y Firefox devuelven la cadena "null" en location.origin para
    // file://. Un doble clic en coordinator.html es exactamente el tipo de
    // cosa que pasa, y el resultado sería un enlace roto mandado por
    // WhatsApp a un paciente.
    const { store, visit } = await panelConVisita();
    for (const malo of ['null', '', 'file://']) {
      const html = renderHandoffScreen(ctx(store, visit.id, 'es', { origin: malo }));
      assert.ok(html.includes(translate('es', 'coordinator.handoff.noOrigin')), `origin ${JSON.stringify(malo)} debería avisar`);
      assert.doesNotMatch(html, /data-role="copy-link"/, `origin ${JSON.stringify(malo)} no debe ofrecer copiar un enlace roto`);
    }
  });
});
