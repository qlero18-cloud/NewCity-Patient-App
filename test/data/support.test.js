// Etapa K — los datos que salen del documento de información general del
// hospital: teléfonos, correo y los dos horarios reales.
//
// Estas aserciones vivían en test/data/fixtures.test.js, que solo podía
// comprobar que el número de los flyers estaba ahí y que todo el canal iba
// marcado unconfirmed. Ahora hay documento del hospital que respalda los
// datos, así que el contrato es otro y se mueve a su propio archivo — no se
// duplica: el bloque viejo se retira de fixtures.test.js.
//
// D95 — El hallazgo que motiva la mitad de este archivo: whatsappNumber
// apuntaba al número de Estados Unidos. El documento dice que ese es de
// llamadas y texto, y que WhatsApp es el de México. El botón "Escribir por
// WhatsApp" llevaba al número equivocado en producción.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { supportChannel } from '../../src/data/support.js';
import { locations } from '../../src/data/locations.js';
import { isOpenNow } from '../../src/domain/time.js';

const compass = locations.find((l) => l.id === 'compass');

describe('support.js — los dos números tienen roles distintos (D95)', () => {
  test('WhatsApp es el número de México, no el de Estados Unidos', () => {
    assert.strictEqual(supportChannel.whatsappNumber, '+526631115360');
  });

  test('el número de Estados Unidos se queda, pero como línea de llamadas y texto', () => {
    assert.strictEqual(supportChannel.voiceNumber, '+16193243116');
  });

  test('los dos números son distintos: era exactamente la ambigüedad que PRD §15.5 dejaba abierta', () => {
    assert.notStrictEqual(supportChannel.whatsappNumber, supportChannel.voiceNumber);
  });

  test('ambos en formato E.164, que es lo que exige wa.me y tel:', () => {
    for (const n of [supportChannel.whatsappNumber, supportChannel.voiceNumber]) {
      assert.match(n, /^\+\d{10,15}$/, `${n}: debería ser E.164 sin espacios ni guiones`);
    }
  });

  test('el correo del hospital', () => {
    assert.strictEqual(supportChannel.email, 'info@newcityhospital.com');
  });

  test('ya no va marcado unconfirmed: hay documento del hospital que lo respalda', () => {
    assert.strictEqual(supportChannel.unconfirmed, undefined);
    assert.strictEqual(supportChannel.hours.unconfirmed, undefined);
  });
});

describe('support.js — horario de Case Management (D96)', () => {
  test('lunes a viernes de 8:00 a 18:00', () => {
    for (const day of [1, 2, 3, 4, 5]) {
      const tramo = supportChannel.hours.weekly.find((w) => w.day === day);
      assert.ok(tramo, `debería haber horario para el día ${day}`);
      assert.deepStrictEqual({ open: tramo.open, close: tramo.close }, { open: '08:00', close: '18:00' });
    }
  });

  test('el sábado cierra a la 13:30, no a las 18:00', () => {
    const sabado = supportChannel.hours.weekly.find((w) => w.day === 6);
    assert.deepStrictEqual({ open: sabado.open, close: sabado.close }, { open: '08:00', close: '13:30' });
  });

  // D96 — Un día cerrado se representa OMITIENDO el día del arreglo, no con
  // un rango de cero. isOpenNow ya devuelve false para un día ausente
  // (src/domain/time.js), así que no hace falta tocarla.
  test('el domingo no aparece en la lista, y por eso isOpenNow lo da por cerrado', () => {
    assert.strictEqual(supportChannel.hours.weekly.find((w) => w.day === 0), undefined);
    // Domingo 16 de agosto de 2026, mediodía en Tijuana.
    assert.strictEqual(isOpenNow(supportChannel.hours, '2026-08-16T12:00:00-07:00'), false);
  });

  test('un miércoles a mediodía sí está abierto, y a las 19:00 ya no', () => {
    assert.strictEqual(isOpenNow(supportChannel.hours, '2026-08-12T12:00:00-07:00'), true);
    assert.strictEqual(isOpenNow(supportChannel.hours, '2026-08-12T19:00:00-07:00'), false);
  });

  test('el sábado a las 14:00 ya cerró, aunque entre semana a esa hora esté abierto', () => {
    assert.strictEqual(isOpenNow(supportChannel.hours, '2026-08-15T14:00:00-07:00'), false);
    assert.strictEqual(isOpenNow(supportChannel.hours, '2026-08-14T14:00:00-07:00'), true);
  });

  test('son seis días, no siete: el horario de relleno de 7 días ya no está', () => {
    assert.strictEqual(supportChannel.hours.weekly.length, 6);
  });
});

describe('locations.js — horario de Compass (D96)', () => {
  test('lunes a sábado de 6:00 a 20:00', () => {
    for (const day of [1, 2, 3, 4, 5, 6]) {
      const tramo = compass.hours.weekly.find((w) => w.day === day);
      assert.ok(tramo, `Compass debería abrir el día ${day}`);
      assert.deepStrictEqual({ open: tramo.open, close: tramo.close }, { open: '06:00', close: '20:00' });
    }
  });

  test('domingo cerrado, otra vez por omisión', () => {
    assert.strictEqual(compass.hours.weekly.find((w) => w.day === 0), undefined);
    assert.strictEqual(isOpenNow(compass.hours, '2026-08-16T12:00:00-07:00'), false);
  });

  test('Compass ya no lleva [POR CONFIRMAR]', () => {
    assert.strictEqual(compass.hours.unconfirmed, undefined);
  });

  // El documento del hospital no dice nada de los consultorios: solo cambia
  // lo que el documento respalda.
  test('los siete pisos de consultorios conservan su horario de relleno y su distintivo', () => {
    const consultorios = locations.filter((l) => l.kind === 'consultorios');
    assert.strictEqual(consultorios.length, 7);
    for (const l of consultorios) {
      assert.strictEqual(l.hours.unconfirmed, true, `${l.id}: sigue sin horario confirmado`);
      assert.strictEqual(l.hours.weekly.length, 7, `${l.id}: sigue con el horario de relleno de 7 días`);
    }
  });
});
