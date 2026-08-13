// Etapa K — las redes de Wi-Fi del documento de información general del
// hospital (D98).
//
// Dato nuevo: hasta ahora no había ninguna mención de wifi en todo src/.
// Va en su propio archivo de datos, con la misma forma que plaza.js, y no
// dentro de locations.js: una red no es una ubicación a la que se pueda
// caminar, y "FREE WIFI NewCity Plaza" cubre la plaza entera, que ni
// siquiera es una de las 13 ubicaciones.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { wifiNetworks } from '../../src/data/wifi.js';

const byId = Object.fromEntries(wifiNetworks.map((w) => [w.id, w]));

describe('wifi.js — las tres redes del documento', () => {
  test('son exactamente tres, en el orden del documento', () => {
    assert.deepStrictEqual(wifiNetworks.map((w) => w.id), ['piso27', 'compass', 'plaza']);
  });

  test('Piso 27: Invitados NCH / bienvenidos', () => {
    assert.strictEqual(byId.piso27.ssid, 'Invitados NCH');
    assert.strictEqual(byId.piso27.password, 'bienvenidos');
  });

  test('Compass: Invitados Compass / bienvenidos', () => {
    assert.strictEqual(byId.compass.ssid, 'Invitados Compass');
    assert.strictEqual(byId.compass.password, 'bienvenidos');
  });

  // La red de la plaza es abierta. Se distingue de "no sabemos la
  // contraseña" con cadena vacía y no con undefined, para que la pantalla
  // pueda decir "sin contraseña" en vez de dejar el renglón en blanco.
  test('Plaza: FREE WIFI NewCity Plaza, abierta', () => {
    assert.strictEqual(byId.plaza.ssid, 'FREE WIFI NewCity Plaza');
    assert.strictEqual(byId.plaza.password, '');
  });

  test('cada red dice dónde alcanza, en los dos idiomas', () => {
    for (const w of wifiNetworks) {
      assert.strictEqual(typeof w.where.es, 'string', `${w.id}: falta where.es`);
      assert.strictEqual(typeof w.where.en, 'string', `${w.id}: falta where.en`);
      assert.ok(w.where.es.length > 0 && w.where.en.length > 0, `${w.id}: where vacío`);
    }
  });

  test('ninguna va marcada unconfirmed: las tres salen del documento del hospital', () => {
    for (const w of wifiNetworks) {
      assert.strictEqual(w.unconfirmed, undefined, `${w.id}: no debería llevar distintivo`);
    }
  });

  test('los id son únicos', () => {
    assert.strictEqual(new Set(wifiNetworks.map((w) => w.id)).size, wifiNetworks.length);
  });
});
