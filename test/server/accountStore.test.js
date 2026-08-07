// Etapa C — cuentas de coordinación en el almacén. Se escribe antes que
// src/server/accountStore.js (rojo esperado).
//
// Mismo patrón que visitStore: la lógica entera vive en el módulo puro y se
// prueba con un Map en memoria. El KV falso clona en get y en set A
// PROPÓSITO — Blobs serializa a JSON, así que quien lee nunca recibe una
// referencia viva. Sin el clon, un `record.failedAttempts++` sobre el objeto
// devuelto pasaría estas pruebas y perdería la escritura en producción.
//
// Casi todo corre con `iterations: 1`: lo que se prueba aquí es el bloqueo,
// la normalización y el manejo de errores, no el KDF —eso ya está en
// passwords.test.js.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAccountStore,
  validateUsername,
  normalizeUsername,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_MS,
  MIN_USERNAME_LENGTH,
  MAX_USERNAME_LENGTH,
} from '../../src/server/accountStore.js';

const NOW = Date.parse('2026-03-10T10:00:00Z');
const PASS = 'coordinacion-torre-27';
const FAST = { iterations: 1 };

function memoryKv() {
  const data = new Map();
  return {
    async get(key) {
      return data.has(key) ? structuredClone(data.get(key)) : null;
    },
    async set(key, value) {
      data.set(key, structuredClone(value));
    },
    async delete(key) {
      data.delete(key);
    },
    async list(prefix) {
      return [...data.keys()].filter((k) => k.startsWith(prefix));
    },
    _raw: data,
  };
}

async function seeded(options = FAST) {
  const kv = memoryKv();
  const store = createAccountStore(kv, options);
  await store.createAccount({ username: 'ana', displayName: 'Ana Ruiz', password: PASS }, NOW);
  return { kv, store };
}

describe('normalizeUsername', () => {
  test('recorta y baja a minúsculas', () => {
    assert.equal(normalizeUsername('  Ana.Ruiz  '), 'ana.ruiz');
  });

  test('devuelve cadena vacía con lo que no es texto', () => {
    for (const basura of [null, undefined, 42, {}]) assert.equal(normalizeUsername(basura), '');
  });
});

describe('validateUsername', () => {
  test('acepta los formatos razonables', () => {
    for (const u of ['ana', 'ana.ruiz', 'ana-ruiz', 'ana_r1', 'a'.repeat(MAX_USERNAME_LENGTH)]) {
      assert.equal(validateUsername(u).ok, true, `debería aceptar "${u}"`);
    }
  });

  test('rechaza por largo', () => {
    assert.equal(validateUsername('a'.repeat(MIN_USERNAME_LENGTH - 1)).ok, false);
    assert.equal(validateUsername('a'.repeat(MAX_USERNAME_LENGTH + 1)).ok, false);
  });

  test('rechaza una diagonal — el usuario es parte de la LLAVE del almacén', () => {
    // Esto no es cosmético: la llave es `account/<usuario>`. Un usuario con
    // diagonales se sale de su prefijo y puede escribir sobre el espacio de
    // las visitas.
    assert.equal(validateUsername('ana/ruiz').ok, false);
    assert.equal(validateUsername('../visit/v_1').ok, false);
    assert.equal(validateUsername('account/ana').ok, false);
  });

  test('rechaza espacios, acentos y símbolos raros', () => {
    for (const u of ['ana ruiz', 'ana@nch', 'ané', 'ana%2f', 'ana\nruiz']) {
      assert.equal(validateUsername(u).ok, false, `no debería aceptar "${u}"`);
    }
  });

  test('rechaza los que empiezan con puntuación', () => {
    for (const u of ['.ana', '-ana', '_ana']) {
      assert.equal(validateUsername(u).ok, false, `no debería aceptar "${u}"`);
    }
  });
});

describe('createAccount', () => {
  test('guarda la cuenta y la deja consultable', async () => {
    const { store } = await seeded();
    const cuenta = await store.getAccount('ana');
    assert.equal(cuenta.username, 'ana');
    assert.equal(cuenta.displayName, 'Ana Ruiz');
    assert.equal(cuenta.createdAt, NOW);
  });

  test('NUNCA guarda la contraseña en claro', async () => {
    const { kv } = await seeded();
    const guardado = JSON.stringify([...kv._raw.values()]);
    assert.ok(!guardado.includes(PASS), 'la contraseña aparece en claro en el almacén');
  });

  test('normaliza el usuario antes de guardarlo', async () => {
    const kv = memoryKv();
    const store = createAccountStore(kv, FAST);
    await store.createAccount({ username: '  Ana.RUIZ ', displayName: 'A', password: PASS }, NOW);
    assert.ok(await store.getAccount('ana.ruiz'));
    assert.deepEqual([...kv._raw.keys()], ['account/ana.ruiz']);
  });

  test('rechaza un usuario inválido', async () => {
    const store = createAccountStore(memoryKv(), FAST);
    await assert.rejects(
      () => store.createAccount({ username: 'ana/ruiz', displayName: 'A', password: PASS }, NOW),
      /usuario/i,
    );
  });

  test('rechaza una contraseña corta, con el motivo de validatePassword', async () => {
    const store = createAccountStore(memoryKv(), FAST);
    await assert.rejects(
      () => store.createAccount({ username: 'ana', displayName: 'A', password: 'corta' }, NOW),
      /tooShort/,
    );
  });

  test('rechaza duplicados en vez de sobrescribir', async () => {
    const { store } = await seeded();
    await assert.rejects(
      () => store.createAccount({ username: 'ANA', displayName: 'Otra', password: PASS }, NOW),
      /ya existe/i,
    );
    // Y la cuenta original sigue intacta.
    assert.equal((await store.getAccount('ana')).displayName, 'Ana Ruiz');
  });

  test('exige displayName', async () => {
    const store = createAccountStore(memoryKv(), FAST);
    await assert.rejects(
      () => store.createAccount({ username: 'ana', displayName: '  ', password: PASS }, NOW),
      /displayName/,
    );
  });
});

describe('getAccount / listAccounts / deleteAccount', () => {
  test('getAccount devuelve null con lo que no existe o no es texto', async () => {
    const { store } = await seeded();
    assert.equal(await store.getAccount('nadie'), null);
    assert.equal(await store.getAccount(''), null);
    assert.equal(await store.getAccount(null), null);
  });

  test('listAccounts no devuelve el hash de nadie', async () => {
    const { store } = await seeded();
    await store.createAccount({ username: 'beto', displayName: 'Beto', password: PASS }, NOW);
    const cuentas = await store.listAccounts();
    assert.equal(cuentas.length, 2);
    for (const c of cuentas) {
      assert.equal(c.passwordHash, undefined, `listAccounts filtró el hash de ${c.username}`);
      assert.ok(c.username && c.displayName);
    }
  });

  test('deleteAccount borra y devuelve si había algo', async () => {
    const { store } = await seeded();
    assert.equal(await store.deleteAccount('ana'), true);
    assert.equal(await store.getAccount('ana'), null);
    assert.equal(await store.deleteAccount('ana'), false);
  });
});

describe('authenticate — camino feliz', () => {
  test('acepta la contraseña correcta y dice quién es', async () => {
    const { store } = await seeded();
    const res = await store.authenticate('ana', PASS, NOW);
    assert.equal(res.ok, true);
    assert.equal(res.account.username, 'ana');
    assert.equal(res.account.displayName, 'Ana Ruiz');
  });

  test('no devuelve el hash junto con la cuenta', async () => {
    const { store } = await seeded();
    const { account } = await store.authenticate('ana', PASS, NOW);
    assert.equal(account.passwordHash, undefined);
  });

  test('normaliza el usuario al entrar', async () => {
    const { store } = await seeded();
    assert.equal((await store.authenticate('  ANA ', PASS, NOW)).ok, true);
  });

  test('sella lastLoginAt', async () => {
    const { store } = await seeded();
    await store.authenticate('ana', PASS, NOW + 5000);
    assert.equal((await store.getAccount('ana')).lastLoginAt, NOW + 5000);
  });
});

describe('authenticate — fallos', () => {
  test('rechaza la contraseña equivocada', async () => {
    const { store } = await seeded();
    const res = await store.authenticate('ana', 'otra-cosa-larga', NOW);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'badPassword');
    assert.equal(res.account, undefined);
  });

  test('rechaza un usuario que no existe, sin crearlo', async () => {
    const { store, kv } = await seeded();
    const res = await store.authenticate('nadie', PASS, NOW);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'unknown');
    assert.equal(kv._raw.size, 1);
  });

  test('con un usuario desconocido SÍ deriva una llave, para no delatar por tiempo', async () => {
    // Sin esto, "usuario inexistente" contesta al instante y "contraseña
    // equivocada" tarda lo que tarda PBKDF2. Esa diferencia es un
    // enumerador de cuentas: se prueban usuarios y el reloj dice cuáles
    // existen. Se comprueba con un espía porque medir tiempos en una suite
    // es una prueba intermitente.
    const kv = memoryKv();
    let derivaciones = 0;
    const store = createAccountStore(kv, {
      iterations: 1,
      hash: async (...args) => {
        derivaciones += 1;
        const { hashPassword } = await import('../../src/server/passwords.js');
        return hashPassword(...args);
      },
    });
    await store.createAccount({ username: 'ana', displayName: 'A', password: PASS }, NOW);
    const antes = derivaciones;
    await store.authenticate('nadie', PASS, NOW);
    assert.ok(derivaciones > antes, 'el usuario desconocido salió sin derivar nada');
  });

  test('rechaza entradas que no son texto sin tocar el almacén', async () => {
    const { store } = await seeded();
    for (const [u, p] of [[null, PASS], ['ana', null], [42, 42], ['', '']]) {
      const res = await store.authenticate(u, p, NOW);
      assert.equal(res.ok, false);
      assert.equal(res.reason, 'invalidInput', `usuario=${u} contraseña=${p}`);
    }
  });
});

describe('authenticate — bloqueo por intentos', () => {
  async function fallar(store, veces, now = NOW) {
    for (let i = 0; i < veces; i += 1) await store.authenticate('ana', 'no-es-la-buena', now);
  }

  test('cuenta los intentos fallidos', async () => {
    const { store } = await seeded();
    await fallar(store, 2);
    assert.equal((await store.getAccount('ana')).failedAttempts, 2);
  });

  test(`a los ${MAX_FAILED_ATTEMPTS} fallos bloquea, aunque después llegue la contraseña buena`, async () => {
    const { store } = await seeded();
    await fallar(store, MAX_FAILED_ATTEMPTS);
    const res = await store.authenticate('ana', PASS, NOW);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'locked');
  });

  test('un fallo menos NO bloquea', async () => {
    const { store } = await seeded();
    await fallar(store, MAX_FAILED_ATTEMPTS - 1);
    assert.equal((await store.authenticate('ana', PASS, NOW)).ok, true);
  });

  test('el bloqueo se levanta solo al pasar la ventana', async () => {
    const { store } = await seeded();
    await fallar(store, MAX_FAILED_ATTEMPTS);
    assert.equal((await store.authenticate('ana', PASS, NOW + LOCKOUT_MS - 1)).reason, 'locked');
    assert.equal((await store.authenticate('ana', PASS, NOW + LOCKOUT_MS)).ok, true);
  });

  test('entrar bien limpia el contador y el bloqueo', async () => {
    const { store } = await seeded();
    await fallar(store, MAX_FAILED_ATTEMPTS - 1);
    await store.authenticate('ana', PASS, NOW);
    const cuenta = await store.getAccount('ana');
    assert.equal(cuenta.failedAttempts, 0);
    assert.equal(cuenta.lockedUntil, null);
  });

  test('bloquear a una NO bloquea a la otra', async () => {
    const { store } = await seeded();
    await store.createAccount({ username: 'beto', displayName: 'Beto', password: PASS }, NOW);
    await fallar(store, MAX_FAILED_ATTEMPTS);
    assert.equal((await store.authenticate('beto', PASS, NOW)).ok, true);
  });

  test('estando bloqueada no gasta CPU en derivar', async () => {
    // El bloqueo existe justo para eso: si siguiera hasheando cada intento,
    // seguiría siendo un canal para tumbar la Function a puro login.
    const kv = memoryKv();
    let derivaciones = 0;
    const store = createAccountStore(kv, {
      iterations: 1,
      verify: async (...args) => {
        derivaciones += 1;
        const { verifyPassword } = await import('../../src/server/passwords.js');
        return verifyPassword(...args);
      },
    });
    await store.createAccount({ username: 'ana', displayName: 'A', password: PASS }, NOW);
    await fallar(store, MAX_FAILED_ATTEMPTS);
    const antes = derivaciones;
    await store.authenticate('ana', PASS, NOW);
    assert.equal(derivaciones, antes, 'derivó estando bloqueada');
  });
});
