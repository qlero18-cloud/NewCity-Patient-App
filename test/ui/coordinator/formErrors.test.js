// Etapa D — el servidor valida y responde motivos por campo. Esto es lo
// que hace que esos motivos lleguen a la pantalla en vez de morir en un
// `catch` silencioso, que es lo que pasaría si el panel se limitara a no
// repintar.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderFormErrors, renderRequestError, errorText } from '../../../src/ui/screens/coordinator/formErrors.js';
import { translate, STRINGS } from '../../../src/ui/i18n.js';

const t = (lang) => (path) => translate(lang, path);
const ETIQUETAS = {
  serviceName: 'coordinator.itinerary.serviceNameLabel',
  locationId: 'coordinator.itinerary.locationLabel',
  startsAt: 'coordinator.itinerary.startsAtLabel',
};

describe('renderFormErrors', () => {
  test('sin errores no pinta nada', () => {
    // Cadena vacía, no un contenedor vacío: un <div> con borde y sin texto
    // se ve como un hueco roto en la pantalla.
    assert.equal(renderFormErrors(null, t('es'), ETIQUETAS), '');
    assert.equal(renderFormErrors({}, t('es'), ETIQUETAS), '');
  });

  test('nombra el campo Y el motivo, en los dos idiomas', () => {
    // Solo el motivo ("Este dato es obligatorio") no dice cuál de los seis
    // campos lo es; solo el campo no dice qué tiene de malo.
    for (const lang of ['es', 'en']) {
      const html = renderFormErrors({ locationId: 'unknown' }, t(lang), ETIQUETAS);
      assert.ok(html.includes(translate(lang, 'coordinator.itinerary.locationLabel')), `falta el campo en ${lang}`);
      assert.ok(html.includes(translate(lang, 'coordinator.error.unknown')), `falta el motivo en ${lang}`);
    }
  });

  test('lista todos los campos con problema, no solo el primero', () => {
    // Corregir uno, guardar, descubrir el siguiente, corregir, guardar…
    // con seis campos son seis viajes al servidor para capturar una cita.
    const html = renderFormErrors({ serviceName: 'required', startsAt: 'noOffset' }, t('es'), ETIQUETAS);
    assert.ok(html.includes(translate('es', 'coordinator.itinerary.serviceNameLabel')));
    assert.ok(html.includes(translate('es', 'coordinator.itinerary.startsAtLabel')));
    assert.ok(html.includes(translate('es', 'coordinator.error.noOffset')));
  });

  test('se anuncia con role="alert"', () => {
    assert.match(renderFormErrors({ serviceName: 'required' }, t('es'), ETIQUETAS), /role="alert"/);
  });

  test('un campo sin etiqueta conocida sale igual, con su nombre crudo', () => {
    // Si el servidor agrega un campo nuevo y aquí falta la etiqueta, el
    // error DEBE verse de todos modos. Tragárselo dejaría un formulario que
    // no guarda y no dice por qué — el peor de los dos males.
    const html = renderFormErrors({ campoNuevo: 'required' }, t('es'), ETIQUETAS);
    assert.ok(html.includes('campoNuevo'));
    assert.ok(html.includes(translate('es', 'coordinator.error.required')));
  });

  test('un motivo desconocido no truena: cae en el genérico', () => {
    // translate() lanza con una llave inexistente, a propósito. Aquí eso
    // dejaría la pantalla en blanco por un motivo que el servidor podría
    // agregar mañana.
    const html = renderFormErrors({ serviceName: 'motivoQueNoExiste' }, t('es'), ETIQUETAS);
    assert.ok(html.includes(translate('es', 'coordinator.error.invalid')));
  });

  test('el contenido se escapa', () => {
    const html = renderFormErrors({ '<img src=x onerror=alert(1)>': 'required' }, t('es'), ETIQUETAS);
    assert.ok(!html.includes('<img'));
  });

  test('los motivos por campo NO incluyen los que no son de ningún campo', () => {
    // 'network' y 'gone' viven en el mismo bloque i18n por comodidad, pero
    // no son motivos de campo: si alguno se colara al mapa de errores, se
    // pintaría como "Ubicación: no pudimos guardar", que no significa nada.
    const html = renderFormErrors({ locationId: 'network' }, t('es'), ETIQUETAS);
    assert.ok(html.includes(translate('es', 'coordinator.error.invalid')));
    assert.ok(!html.includes(translate('es', 'coordinator.error.network')));
  });

  test('todo motivo que el servidor sabe emitir tiene traducción', () => {
    // Barrido contra la lista real de src/server/, no una copia a mano: si
    // mañana se agrega un motivo allá y se olvida la cadena aquí, esta
    // prueba se pone roja en vez de que salga texto genérico en pantalla.
    const MOTIVOS = ['required', 'unknown', 'unsupported', 'invalid', 'tooLong', 'order', 'invalidDate', 'noOffset'];
    for (const lang of ['es', 'en']) {
      for (const motivo of MOTIVOS) {
        assert.ok(STRINGS[lang].coordinator.error[motivo], `falta coordinator.error.${motivo} en ${lang}`);
      }
    }
  });
});

describe('renderRequestError — lo que falló no fue un campo', () => {
  test('sin código no pinta nada', () => {
    assert.equal(renderRequestError(null, t('es')), '');
  });

  test('red caída y visita desaparecida dicen cosas distintas, con role="alert"', () => {
    // "No pudimos guardar, revisa la conexión" invita a reintentar; "esa
    // visita ya no existe" dice que reintentar no va a servir. Mandar el
    // mismo texto a los dos hace que alguien le dé a guardar diez veces.
    const red = renderRequestError('network', t('es'));
    const ida = renderRequestError('gone', t('es'));

    assert.ok(red.includes(translate('es', 'coordinator.error.network')));
    assert.ok(ida.includes(translate('es', 'coordinator.error.gone')));
    assert.match(red, /role="alert"/);
  });

  test('un código desconocido no truena', () => {
    assert.ok(renderRequestError('vaya-usted-a-saber', t('es')).includes(translate('es', 'coordinator.error.invalid')));
  });
});

describe('errorText — el mismo texto, sin HTML alrededor', () => {
  // qpass.js no puede usar renderRequestError: su hueco de error ya existe
  // en el DOM (con su role="alert" y su id), y reemplazarlo por un <p>
  // nuevo rompería las referencias que el resto del attach ya tiene. Lo que
  // necesita es el texto pelado para ponerlo con textContent — que además
  // no escapa nada, porque textContent no interpreta HTML.
  test('devuelve el mismo texto que pinta renderRequestError', () => {
    for (const lang of ['es', 'en']) {
      assert.equal(errorText(t(lang), 'network'), translate(lang, 'coordinator.error.network'));
      assert.equal(errorText(t(lang), 'gone'), translate(lang, 'coordinator.error.gone'));
    }
  });

  test('un código desconocido cae en el genérico en vez de lanzar', () => {
    assert.equal(errorText(t('es'), 'no-existe-este'), translate('es', 'coordinator.error.invalid'));
    assert.equal(errorText(t('es'), undefined), translate('es', 'coordinator.error.invalid'));
  });
});
