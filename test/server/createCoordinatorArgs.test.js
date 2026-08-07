// Etapa C — parseo de argumentos de scripts/create-coordinator.mjs. Se
// escribe antes que el script (rojo esperado).
//
// El resto del script no se puede probar aquí —pide contraseña por teclado y
// escribe en el Blobs real de un sitio— pero esta parte SÍ, y es la que
// importa: `--delete` borra una cuenta. Un guion mal leído, un `--delete`
// que se cuela junto a un `--list`, o un `--username` que se traga la
// bandera siguiente como si fuera un nombre, y el script hace algo distinto
// de lo que se escribió.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, applyKey, INITIAL_KEYS } from '../../scripts/create-coordinator.mjs';

describe('parseArgs — alta', () => {
  test('lee usuario y nombre visible', () => {
    const r = parseArgs(['--username', 'ana.ruiz', '--name', 'Ana Ruiz']);
    assert.deepEqual(r, { command: 'create', username: 'ana.ruiz', displayName: 'Ana Ruiz', error: null });
  });

  test('acepta el orden invertido y la forma --clave=valor', () => {
    const r = parseArgs(['--name=Ana Ruiz', '--username=ana.ruiz']);
    assert.equal(r.command, 'create');
    assert.equal(r.username, 'ana.ruiz');
    assert.equal(r.displayName, 'Ana Ruiz');
  });

  test('exige el nombre visible: es lo que se ve en el registro de cambios', () => {
    assert.match(parseArgs(['--username', 'ana']).error, /--name/);
  });

  test('exige el usuario si viene el nombre', () => {
    assert.match(parseArgs(['--name', 'Ana']).error, /--username/);
  });

  test('NUNCA acepta la contraseña por argumento', () => {
    // Un `--password` en la línea de comandos queda en el historial de la
    // shell y lo ve cualquiera que corra `ps` mientras el script trabaja.
    // Que sea un error explícito, no una bandera ignorada en silencio.
    const r = parseArgs(['--username', 'ana', '--name', 'Ana', '--password', 'secreta12345']);
    assert.match(r.error, /--password/);
    assert.equal(r.command, 'error');
  });
});

describe('parseArgs — los demás comandos', () => {
  test('--list', () => {
    assert.deepEqual(parseArgs(['--list']), { command: 'list', username: null, displayName: null, error: null });
  });

  test('--delete con usuario', () => {
    const r = parseArgs(['--delete', 'ana.ruiz']);
    assert.equal(r.command, 'delete');
    assert.equal(r.username, 'ana.ruiz');
  });

  test('--delete sin usuario es error, no un borrado de algo', () => {
    assert.match(parseArgs(['--delete']).error, /--delete/);
  });

  test('--delete no se traga la bandera siguiente como si fuera un usuario', () => {
    // `--delete --list` no debe leerse como "borra la cuenta llamada
    // --list": debe fallar.
    assert.equal(parseArgs(['--delete', '--list']).command, 'error');
  });

  test('--gen-secret', () => {
    assert.equal(parseArgs(['--gen-secret']).command, 'gen-secret');
  });

  test('sin argumentos, ayuda', () => {
    assert.equal(parseArgs([]).command, 'help');
  });

  test('--help', () => {
    assert.equal(parseArgs(['--help']).command, 'help');
  });
});

describe('parseArgs — lo que rechaza', () => {
  test('dos comandos a la vez', () => {
    for (const argv of [
      ['--list', '--gen-secret'],
      ['--list', '--delete', 'ana'],
      ['--delete', 'ana', '--username', 'beto', '--name', 'Beto'],
    ]) {
      const r = parseArgs(argv);
      assert.equal(r.command, 'error', `${argv.join(' ')} debería ser error`);
      assert.match(r.error, /a la vez|solo un/i);
    }
  });

  test('banderas que no existen', () => {
    assert.match(parseArgs(['--borrar-todo']).error, /--borrar-todo/);
  });

  test('argumentos sueltos sin bandera', () => {
    assert.match(parseArgs(['ana.ruiz']).error, /ana\.ruiz/);
  });

  test('valores vacíos', () => {
    assert.equal(parseArgs(['--username=', '--name=Ana']).command, 'error');
    assert.equal(parseArgs(['--delete', '']).command, 'error');
  });
});

// El lector de contraseña corre sin eco y con la terminal en modo crudo, así
// que nadie ve lo que hace — ni al usarlo ni al revisarlo. Las teclas que
// maneja (DEL, ESC, Ctrl-C, Ctrl-D) son caracteres invisibles en el fuente:
// escribir DEL como carácter crudo en vez de '' se lee idéntico a una
// cadena vacía en la mayoría de las herramientas, y `JSON.stringify` tampoco
// lo distingue. Si esa rama se rompiera, la tecla de borrar AGREGARÍA un
// carácter en vez de quitarlo —DEL pasa el filtro `ch >= ' '`— y no se notaría
// al teclear: se notaría semanas después, cuando alguien no pueda entrar.
//
// De ahí las dos reglas: el manejo de teclas vive en una función pura, y estos
// literales se escriben con \uXXXX. Los de aquí se declaran aparte, a
// propósito: si el test importara las constantes del script, una constante
// equivocada coincidiría consigo misma y el test pasaría igual.
const teclear = (texto) => [...texto].reduce(
  (estado, ch) => applyKey(estado, ch).state,
  INITIAL_KEYS,
);

describe('applyKey — lectura de contraseña sin eco', () => {
  const DEL = '\u007f';
  const ESC = '\u001b';

  test('escribir acumula', () => {
    assert.equal(teclear('Contraseña 42').value, 'Contraseña 42');
  });

  test('DEL borra el último carácter, no lo agrega', () => {
    assert.equal(teclear(`abc${DEL}`).value, 'ab');
    assert.equal(teclear(`abc${DEL}${DEL}${DEL}${DEL}`).value, '');
  });

  test('backspace también borra, para las terminales que lo mandan', () => {
    assert.equal(teclear('abc\b').value, 'ab');
  });

  test('enter y Ctrl-D entregan lo escrito', () => {
    for (const fin of ['\r', '\n', '\u0004']) {
      const { state, action } = applyKey(teclear('secreta'), fin);
      assert.equal(action, 'submit', `${JSON.stringify(fin)} debería entregar`);
      assert.equal(state.value, 'secreta');
    }
  });

  test('Ctrl-C aborta y no deja la contraseña a medias', () => {
    const { state, action } = applyKey(teclear('secreta'), '\u0003');
    assert.equal(action, 'abort');
    assert.equal(state.value, '');
  });

  test('las flechas no inyectan "[A" en la contraseña', () => {
    // Una flecha llega como ESC [ A. Sin tratar la secuencia, el ESC se ignora
    // por ser control y los otros dos se acumulan — y como no hay eco, la
    // persona teclea una contraseña distinta de la que cree.
    assert.equal(teclear(`ab${ESC}[Acd`).value, 'abcd');
    assert.equal(teclear(`ab${ESC}[3~cd`).value, 'abcd'); // suprimir
  });

  test('los demás caracteres de control se ignoran', () => {
    assert.equal(teclear('ab\u0000\u0001\u0016cd').value, 'abcd');
  });

  test('pegar acentos y emoji entra tal cual', () => {
    // La contraseña se recorre por punto de código; un emoji no debe partirse.
    assert.equal(teclear('año–🔐').value, 'año–🔐');
  });

  test('el estado inicial está vacío y no se comparte entre lecturas', () => {
    assert.equal(INITIAL_KEYS.value, '');
    teclear('primera');
    assert.equal(INITIAL_KEYS.value, '', 'INITIAL_KEYS quedó contaminado');
  });
});
