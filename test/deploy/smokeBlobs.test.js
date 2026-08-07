// scripts/smoke-blobs.mjs — la única prueba que toca el Blobs de PRODUCCIÓN.
//
// Lo que ese script comprueba no se puede comprobar aquí: hace falta un sitio
// desplegado, una cuenta real y las dos direcciones de edge que Netlify solo
// inyecta allá. Pero sí se puede comprobar —y hay que hacerlo— la parte que
// decide si el resultado pasa o falla. Un smoke que da verde pase lo que pase
// es peor que no tenerlo: da permiso para creerle.
//
// Por eso `revisarRegistro` es una función pura que recibe el registro leído y
// lo que se esperaba, y devuelve la lista de problemas. Aquí se le dan
// registros rotos a mano —incluido el roto EXACTO que produce la consistencia
// eventual— y se verifica que los vea.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, revisarRegistro } from '../../scripts/smoke-blobs.mjs';

const TOKEN = 'ZmFsc28tZGUtcHJ1ZWJhMDA';

function registroCompleto() {
  return {
    visit: { id: 'v_x', token: TOKEN, patientFirstName: 'PRUEBA-SMOKE', status: 'active' },
    appointments: [
      { id: 'a_1', serviceName: 'PRUEBA-SMOKE 1', locationId: 'piso27' },
      { id: 'a_2', serviceName: 'PRUEBA-SMOKE 2', locationId: 'plaza' },
    ],
    lodging: { hotel: 'PRUEBA-SMOKE' },
    passes: [],
  };
}

const ESPERADO = { token: TOKEN, appointmentIds: ['a_1', 'a_2'], hotel: 'PRUEBA-SMOKE' };

describe('revisarRegistro — el juicio del smoke', () => {
  test('un registro completo no reporta nada', () => {
    assert.deepStrictEqual(revisarRegistro(registroCompleto(), ESPERADO), []);
  });

  // El caso que justifica todo el script. Con lectura de consistencia
  // eventual, la segunda cita se escribe sobre una versión del registro
  // anterior a la primera: queda a_2 y desaparece a_1. Ninguna petición
  // devuelve error — el 201 de la primera cita fue verdad cuando se dio.
  test('la PRIMERA cita desaparecida se reporta, y el mensaje dice qué la desaparece', () => {
    const registro = registroCompleto();
    registro.appointments = registro.appointments.filter((a) => a.id !== 'a_1');

    const problemas = revisarRegistro(registro, ESPERADO);
    assert.strictEqual(problemas.length, 1, `se esperaba un problema, salieron: ${JSON.stringify(problemas)}`);
    assert.match(problemas[0], /a_1/, 'el problema no dice cuál cita falta');
    assert.match(
      problemas[0],
      /consistencia/i,
      'el mensaje no nombra la causa: quien corra esto a las 3am necesita saber qué mirar',
    );
  });

  test('las dos citas desaparecidas se reportan por separado, no como una sola queja', () => {
    const registro = registroCompleto();
    registro.appointments = [];
    assert.strictEqual(revisarRegistro(registro, ESPERADO).length, 2);
  });

  test('el hospedaje que no llegó se reporta', () => {
    const registro = registroCompleto();
    registro.lodging = null;
    assert.strictEqual(revisarRegistro(registro, ESPERADO).length, 1);
    assert.match(revisarRegistro(registro, ESPERADO)[0], /hospedaje|lodging/i);
  });

  test('un hotel distinto al que se mandó se reporta: llegó otra escritura, no la nuestra', () => {
    const registro = registroCompleto();
    registro.lodging = { hotel: 'otro' };
    assert.strictEqual(revisarRegistro(registro, ESPERADO).length, 1);
  });

  // El token es lo que va dentro del QR. Si el registro guardado trae otro,
  // el enlace que la coordinadora acaba de mandar apunta a la nada.
  test('un token distinto al que devolvió la creación se reporta', () => {
    const registro = registroCompleto();
    registro.visit.token = 'b3Ryby10b2tlbi1kaXN0aW50bw';
    assert.match(revisarRegistro(registro, ESPERADO)[0], /token/i);
  });

  test('un registro que no se pudo leer se reporta sin tronar', () => {
    for (const nada of [null, undefined, {}]) {
      const problemas = revisarRegistro(nada, ESPERADO);
      assert.ok(problemas.length >= 1, `${JSON.stringify(nada)} debería reportar algo`);
    }
  });

  test('citas de más no son problema: otra corrida en paralelo no invalida esta', () => {
    const registro = registroCompleto();
    registro.appointments.push({ id: 'a_9', serviceName: 'de otra corrida', locationId: 'plaza' });
    assert.deepStrictEqual(revisarRegistro(registro, ESPERADO), []);
  });
});

describe('parseArgs — el smoke escribe en producción, así que no adivina nada', () => {
  test('con --site y --username sale limpio', () => {
    const r = parseArgs(['--site', 'https://ejemplo.netlify.app', '--username', 'ana.ruiz']);
    assert.strictEqual(r.error, null);
    assert.strictEqual(r.site, 'https://ejemplo.netlify.app');
    assert.strictEqual(r.username, 'ana.ruiz');
  });

  test('la diagonal final se quita: si no, las URLs quedan con // en medio', () => {
    const r = parseArgs(['--site', 'https://ejemplo.netlify.app/', '--username', 'ana.ruiz']);
    assert.strictEqual(r.site, 'https://ejemplo.netlify.app');
  });

  test('sin --site no corre: no hay sitio por defecto ni lo va a haber', () => {
    assert.match(parseArgs(['--username', 'ana.ruiz']).error, /--site/);
  });

  test('sin --username no corre', () => {
    assert.match(parseArgs(['--site', 'https://ejemplo.netlify.app']).error, /--username/);
  });

  // Mismo motivo que en create-coordinator.mjs: el historial de la shell y
  // `ps`. Que exista la bandera y se rechace es mejor que ignorarla en
  // silencio — quien la teclee se entera de por qué no está.
  test('--password se rechaza explicando por qué, no se ignora', () => {
    const r = parseArgs(['--site', 'https://x.netlify.app', '--username', 'a', '--password', 'hunter2']);
    assert.match(r.error, /historial|ps/);
  });

  test('un sitio que no es http(s) se rechaza antes de mandarle una contraseña', () => {
    for (const malo of ['ejemplo.netlify.app', 'ftp://ejemplo', 'javascript:alert(1)']) {
      const r = parseArgs(['--site', malo, '--username', 'ana']);
      assert.ok(r.error, `"${malo}" debería rechazarse: se le manda una contraseña a esa dirección`);
    }
  });

  test('un argumento suelto se rechaza en vez de tomarse por otra cosa', () => {
    assert.ok(parseArgs(['https://x.netlify.app', '--username', 'a']).error);
  });
});
