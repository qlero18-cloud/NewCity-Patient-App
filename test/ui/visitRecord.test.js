// Etapa F (#18) — isVisitRecord, el portero de los dos bordes por donde
// puede entrar algo que no es un expediente.
//
// No tenía ninguna prueba propia. Importa porque es un predicado con
// respuesta binaria en el que un `false` de más deja al paciente en la
// pantalla neutra teniendo su visita, y un `true` de más deja que las
// pantallas iteren a ciegas sobre campos que no existen — reventando
// DESPUÉS de haber dicho "aquí está tu itinerario".
//
// El caso que lo motivó (api.js): un 200 que no es lo que dice ser. El
// portal cautivo del wifi de un hospital contesta 200 con HTML a todo, y
// `res.json()` de eso puede perfectamente devolver un objeto.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isVisitRecord } from '../../src/ui/visitRecord.js';
import { fixtures } from '../../src/data/fixtures.js';

const valido = () => ({
  visit: { id: 'v_1', lang: 'es', patientFirstName: 'Ana', status: 'active' },
  appointments: [],
  passes: [],
  lodging: null,
});

describe('isVisitRecord acepta lo que las pantallas dan por hecho', () => {
  test('el expediente mínimo: listas vacías siguen siendo listas', () => {
    assert.strictEqual(isVisitRecord(valido()), true);
  });

  test('las cinco fixtures pasan — son la referencia de lo que es un expediente', () => {
    for (const [nombre, f] of Object.entries(fixtures)) {
      assert.strictEqual(isVisitRecord(f), true, `la fixture ${nombre} debería ser un expediente válido`);
    }
  });

  test('lodging null o ausente no descalifica: v_demo2 no tiene hospedaje', () => {
    const sinLodging = valido();
    delete sinLodging.lodging;
    assert.strictEqual(isVisitRecord(sinLodging), true);
  });

  test('campos de más no estorban — el servidor puede crecer sin romper clientes viejos', () => {
    assert.strictEqual(isVisitRecord({ ...valido(), camposQueLlegaronDespues: { a: 1 } }), true);
  });
});

describe('isVisitRecord rechaza lo que rompería una pantalla', () => {
  const rechazos = [
    ['null', null],
    ['undefined', undefined],
    ['una cadena', 'v_demo1'],
    ['un número', 42],
    ['un arreglo', [valido()]],
    ['el objeto vacío', {}],
    ['sin visit', { appointments: [], passes: [] }],
    ['visit sin id', { visit: { lang: 'es' }, appointments: [], passes: [] }],
    ['visit.id que no es cadena', { visit: { id: 7 }, appointments: [], passes: [] }],
    ['visit null', { visit: null, appointments: [], passes: [] }],
    ['sin appointments', { visit: { id: 'v_1' }, passes: [] }],
    ['appointments que no es arreglo', { visit: { id: 'v_1' }, appointments: {}, passes: [] }],
    ['sin passes', { visit: { id: 'v_1' }, appointments: [] }],
    ['passes que no es arreglo', { visit: { id: 'v_1' }, appointments: [], passes: null }],
  ];

  for (const [nombre, valor] of rechazos) {
    test(nombre, () => {
      assert.strictEqual(isVisitRecord(valor), false);
    });
  }

  test('el cuerpo de error del servidor NO pasa por expediente', () => {
    // handleVisitRequest contesta {error:'not_found'} y {error:'internal'}.
    // api.js ya los separa por código, pero si alguna vez llegaran con 200
    // —un proxy que "arregla" códigos de error es cosa real— esto es lo
    // que impide pintarlos como si fueran una visita.
    assert.strictEqual(isVisitRecord({ error: 'not_found' }), false);
    assert.strictEqual(isVisitRecord({ error: 'internal' }), false);
  });

  test('una página HTML parseada como objeto tampoco', () => {
    assert.strictEqual(isVisitRecord({ html: '<!doctype html>' }), false);
  });
});
