// La costura con Netlify Blobs — el único pedazo del proyecto que D45 dejó
// deliberadamente sin probar, y el que resultó tener el bug más caro.
//
// D45 dice que toda la lógica vive en `src/server/*.js` contra un almacén
// llave/valor inyectado, y que la suite corre con un `Map` en memoria. Eso
// sigue siendo correcto: un test que necesita `netlify dev` deja de correrse.
// Pero el `Map` no es Blobs, y `netlify/functions/_kv.mjs` —las veinte líneas
// que traducen de uno al otro— quedaba fuera de toda verificación. Tres cosas
// podían estar mal ahí sin que nada lo notara:
//
//   1. La forma de `list()`: Blobs devuelve `{ blobs: [{ key, etag }] }`, no
//      un arreglo de llaves.
//   2. Qué contesta `get()` con una llave que no existe.
//   3. Si los datos sobreviven el viaje de ida y vuelta por JSON.
//
// Y una cuarta que NO se ve probando, sino leyendo el cliente — ver abajo.
//
// Esto no necesita netlify-cli ni cuenta de Netlify: `@netlify/blobs`, que ya
// es dependencia, trae `BlobsServer` en `@netlify/blobs/server` — el mismo
// servidor local que `netlify dev` levanta por debajo. Habla el protocolo HTTP
// de verdad contra el cliente de verdad, sobre un directorio temporal que se
// borra al terminar. Cero red, cero credenciales, cero dependencias nuevas.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BlobsServer } from '@netlify/blobs/server';
import { blobsKv, VISITS_STORE, ACCOUNTS_STORE } from '../../netlify/functions/_kv.mjs';

// Las llaves de verdad, copiadas de src/server/visitStore.js:31-32 y
// src/server/accountStore.js:24. Van con DIAGONAL, y por eso están aquí y no
// inventadas: Blobs le da semántica de directorio a la diagonal —`list()`
// acepta `{ directories: true }` y en ese modo agrupa `visit/aaa` y
// `visit/bbb` bajo un solo prefijo en vez de devolver las dos llaves. El
// adaptador no pide ese modo, pero probar con `visit:` en vez de `visit/`
// dejaría esa diferencia sin cubrir justo en el único test que toca Blobs.
const VISIT = 'visit/';
const TOKEN_IDX = 'token/';
const ACCOUNT = 'account/';

const TOKEN = 'token-local-de-prueba';
const SITE_ID = 'sitio-de-prueba';

let server;
let directorio;
let url;

before(async () => {
  directorio = await mkdtemp(join(tmpdir(), 'nc-blobs-'));
  server = new BlobsServer({ directory: directorio, token: TOKEN, port: 0 });
  const { port } = await server.start();
  url = `http://localhost:${port}`;
});

after(async () => {
  await server?.stop();
  if (directorio) await rm(directorio, { recursive: true, force: true });
});

// El adaptador tal cual lo usan las Functions, pero apuntando al servidor
// local en vez de al Blobs de producción. `uncachedEdgeURL` va igual que
// `edgeURL` porque el servidor local no tiene caché que saltarse; en
// producción son dos direcciones distintas, y de ahí sale el punto 4.
function kv(store) {
  return blobsKv(store, {
    siteID: SITE_ID,
    token: TOKEN,
    edgeURL: url,
    uncachedEdgeURL: url,
  });
}

describe('blobsKv — el contrato de cuatro métodos contra Blobs de verdad', () => {
  test('lo que se guarda se lee igual, con estructura anidada y acentos', async () => {
    const store = kv(VISITS_STORE);
    const visita = {
      id: 'v_1',
      patient: { firstName: 'María', lang: 'es' },
      appointments: [{ id: 'a1', title: 'Consulta de valoración', durationMin: 45 }],
      qpasses: [],
    };
    await store.set(`${VISIT}v_1`, visita);
    assert.deepStrictEqual(await store.get(`${VISIT}v_1`), visita);
  });

  test('una llave que no existe devuelve null, no una excepción ni undefined', async () => {
    // visitStore.js hace `if (!registro) return null` sobre esto. Si Blobs
    // tirara una excepción, la Function contestaría 500 donde debería
    // contestar 404 — y con D46 ese 404 es lo que impide distinguir "no
    // existe" de "venció".
    const store = kv(VISITS_STORE);
    assert.strictEqual(await store.get(`${VISIT}no-existe`), null);
  });

  test('list(prefijo) devuelve LLAVES, no los objetos { key, etag } que da Blobs', async () => {
    // El error natural aquí es devolver `blobs` tal cual: la lista de visitas
    // del panel quedaría llena de objetos y `store.get(llave)` recibiría un
    // objeto donde espera una cadena. Con el Map en memoria no se distingue,
    // porque ese fake ya devuelve llaves.
    const store = kv(VISITS_STORE);
    await store.set(`${VISIT}aaa`, { id: 'aaa' });
    await store.set(`${VISIT}bbb`, { id: 'bbb' });
    await store.set(`${TOKEN_IDX}zzz`, { visitId: 'aaa' });

    const llaves = await store.list(VISIT);
    assert.ok(Array.isArray(llaves), 'list debe devolver un arreglo');
    for (const llave of llaves) {
      assert.strictEqual(typeof llave, 'string', `list devolvió ${JSON.stringify(llave)} en vez de una llave`);
    }
    assert.ok(llaves.includes(`${VISIT}aaa`));
    assert.ok(llaves.includes(`${VISIT}bbb`));
    assert.ok(!llaves.includes(`${TOKEN_IDX}zzz`), 'el prefijo no se está aplicando');
  });

  test('delete borra, y borrar algo que no existe no truena', async () => {
    const store = kv(VISITS_STORE);
    await store.set(`${VISIT}temporal`, { id: 'temporal' });
    await store.delete(`${VISIT}temporal`);
    assert.strictEqual(await store.get(`${VISIT}temporal`), null);
    await store.delete(`${VISIT}nunca-existio`);
  });

  test('los dos almacenes están de verdad separados: un list en visitas no roza las cuentas', async () => {
    // D45/Etapa C: las cuentas van en OTRO almacén, no en otro prefijo del
    // mismo. Con un Map en memoria por almacén eso es cierto por construcción;
    // contra Blobs depende de que `getStore(nombre)` de verdad aísle.
    const visitas = kv(VISITS_STORE);
    const cuentas = kv(ACCOUNTS_STORE);
    await cuentas.set(`${ACCOUNT}ana.ruiz`, { username: 'ana.ruiz' });
    await visitas.set(`${VISIT}ccc`, { id: 'ccc' });

    assert.strictEqual(await visitas.get(`${ACCOUNT}ana.ruiz`), null);
    assert.deepStrictEqual(await (await cuentas.list(ACCOUNT)), [`${ACCOUNT}ana.ruiz`]);
    assert.ok(!(await visitas.list('')).includes(`${ACCOUNT}ana.ruiz`));
  });
});

describe('blobsKv — consistencia fuerte (bug real, encontrado leyendo el cliente)', () => {
  // El punto 4, el que ningún test local puede provocar y que por eso se fija
  // como contrato en vez de como comportamiento.
  //
  // `@netlify/blobs` arranca en consistencia EVENTUAL por defecto
  // (`this.consistency = consistency ?? "eventual"`, dist/chunk-*.js). Dentro
  // de una Function eso significa que las lecturas van al edge CON caché
  // (`edgeURL`) y solo con `consistency: 'strong'` van al de sin caché
  // (`uncachedEdgeURL`). Y todo el servidor de este proyecto es
  // leer-modificar-escribir: `addAppointment` lee la visita, le agrega la cita
  // y vuelve a escribir el registro completo.
  //
  // Con lectura cacheada, dos cambios seguidos pierden el primero en silencio:
  // se agrega la cita A, se escribe; se agrega la cita B, pero esa lectura
  // devuelve la versión ANTERIOR a A, así que se escribe una visita con B y
  // sin A. Nadie ve un error. La coordinadora ve desaparecer una cita que
  // acababa de capturar, o peor, no la ve desaparecer hasta después.
  //
  // El servidor local es un directorio en disco: es fuertemente consistente
  // pase lo que pase, así que aquí NO se puede reproducir la pérdida de datos.
  // Lo que sí se puede probar —y sin leer el texto del archivo, que solo
  // demostraría que una cadena está escrita— es que el adaptador la PIDE, y se
  // prueba con la maquinaria del propio cliente: cuando hay `edgeURL` pero no
  // `uncachedEdgeURL`, una lectura fuerte tira `BlobsConsistencyError` y una
  // eventual no. Si alguien le quita el `consistency` a _kv.mjs, esto se cae.
  test('_kv.mjs pide consistencia FUERTE: sin uncachedEdgeURL, la lectura se niega en vez de servir caché', async () => {
    const store = blobsKv(VISITS_STORE, { siteID: SITE_ID, token: TOKEN, edgeURL: url });
    await assert.rejects(
      () => store.get(`${VISIT}lo-que-sea`),
      /strong consistency/,
      'el adaptador está leyendo con consistencia eventual: dos cambios seguidos pierden el primero en silencio',
    );
  });

  test('…y la prueba de arriba no es vacía: con la consistencia por defecto, esa misma lectura pasa', async () => {
    // Sin este contraste, el test anterior podría estar pasando por cualquier
    // otro motivo (una URL mal armada, un token rechazado) y nadie lo notaría.
    const { getStore } = await import('@netlify/blobs');
    const crudo = getStore({ name: VISITS_STORE, siteID: SITE_ID, token: TOKEN, edgeURL: url });
    assert.strictEqual(await crudo.get(`${VISIT}lo-que-sea`, { type: 'json' }), null);
  });

  test('pedir strong no rompe el camino normal: se sigue leyendo lo que se escribió', async () => {
    const store = kv(VISITS_STORE);
    await store.set(`${VISIT}fuerte`, { id: 'fuerte', appointments: [] });
    const leida = await store.get(`${VISIT}fuerte`);
    leida.appointments.push({ id: 'a1' });
    await store.set(`${VISIT}fuerte`, leida);
    const releida = await store.get(`${VISIT}fuerte`);
    assert.strictEqual(releida.appointments.length, 1);
  });
});
