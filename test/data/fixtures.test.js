// Fase 03 — pruebas de contenido del complejo y visitas ficticias. Rojo
// esperado: src/data/{locations,plaza,support,fixtures}.js no existen
// todavía.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { locations, LOCATION_IDS } from '../../src/data/locations.js';
import { plazaVenues } from '../../src/data/plaza.js';
import { supportChannel } from '../../src/data/support.js';
import { fixtures } from '../../src/data/fixtures.js';
import { routes, MAP_HIGHLIGHT_IDS } from '../../src/data/routes.js';
import { computeExpiresAt, isExpired } from '../../src/domain/expiry.js';
import { nextStep } from '../../src/domain/nextStep.js';
import { visiblePasses } from '../../src/domain/passes.js';
import { groupByDay } from '../../src/domain/itinerary.js';

const ISO_LIKE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ISO_WITH_EXPLICIT_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?[+-]\d{2}:\d{2}$/;

// Recorre cualquier estructura (objeto/arreglo) y junta todos los strings
// que "parecen fecha" (empiezan como ISO), sin importar el nombre del
// campo. Así la prueba de desplazamiento explícito no depende de que
// alguien mantenga a mano una lista de nombres de campo de fecha.
function collectDateLikeStrings(value, out = []) {
  if (typeof value === 'string') {
    if (ISO_LIKE.test(value)) out.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectDateLikeStrings(v, out));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((v) => collectDateLikeStrings(v, out));
  }
  return out;
}

describe('locations.js — ubicaciones del complejo', () => {
  test('existen las 7 ubicaciones que corresponden a los 7 mapPointId de la fase 04', () => {
    assert.deepStrictEqual([...LOCATION_IDS].sort(), ['compass', 'estacionamiento', 'farmacia', 'lobby_torre', 'nivel1', 'piso27', 'quartz'].sort());
  });

  test('todo mapPointId de locations.js existe en la lista fija de la fase 04', () => {
    for (const loc of locations) {
      assert.ok(MAP_HIGHLIGHT_IDS.includes(loc.mapPointId), `${loc.id}: mapPointId "${loc.mapPointId}" no está en la lista de la fase 04`);
    }
  });

  test('los locationId de locations.js coinciden exactamente con los que usa el catálogo de rutas de la fase 02', () => {
    const usedByRoutes = new Set(routes.flatMap((r) => [r.fromLocationId, r.toLocationId]));
    assert.deepStrictEqual([...usedByRoutes].sort(), [...LOCATION_IDS].sort());
  });

  test('cada ubicación con horario sin confirmar lleva unconfirmed: true en hours', () => {
    for (const loc of locations) {
      assert.strictEqual(loc.hours.unconfirmed, true, `${loc.id}: hours debería estar marcado unconfirmed`);
    }
  });
});

describe('plaza.js — restaurantes (PRD §15.2: tipo de comida y horarios sin confirmar)', () => {
  test('existen Farmer\'s Table y The Yard en Nivel 1, y Boka dentro del Quartz (no en Nivel 1)', () => {
    const byName = Object.fromEntries(plazaVenues.map((v) => [v.name, v]));
    assert.strictEqual(byName["Farmer's Table"].mapPointId, 'mp_level1');
    assert.strictEqual(byName['The Yard'].mapPointId, 'mp_level1');
    assert.strictEqual(byName['Boka'].mapPointId, 'mp_quartz');
  });

  test('los tres venues están marcados unconfirmed (tipo de comida y horario sin confirmar)', () => {
    for (const venue of plazaVenues) {
      assert.strictEqual(venue.unconfirmed, true, `${venue.name}: debería estar unconfirmed`);
    }
  });

  test('todo mapPointId de plaza.js existe en la lista fija de la fase 04', () => {
    for (const venue of plazaVenues) {
      assert.ok(MAP_HIGHLIGHT_IDS.includes(venue.mapPointId), `${venue.name}: mapPointId "${venue.mapPointId}" no está en la lista de la fase 04`);
    }
  });
});

describe('support.js — WhatsApp, voz y horario de coordinación', () => {
  test('el número real de los flyers está presente y el canal está marcado unconfirmed (no se sabe cuál rol tiene)', () => {
    assert.strictEqual(supportChannel.whatsappNumber, '+16193243116');
    assert.strictEqual(supportChannel.voiceNumber, '+16193243116');
    assert.strictEqual(supportChannel.unconfirmed, true);
  });
});

describe('fixtures.js — declaración de datos ficticios', () => {
  test('el archivo declara explícitamente que los pacientes son ficticios', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = await import('node:path');
    const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'data', 'fixtures.js');
    const text = readFileSync(filePath, 'utf8');
    assert.match(text.slice(0, 400), /ficticio/i, 'el encabezado del archivo debería declarar que los datos son ficticios');
  });

  test('existen exactamente las 5 visitas que pide la fase', () => {
    assert.deepStrictEqual(Object.keys(fixtures).sort(), ['v_demo1', 'v_demo2', 'v_expired', 'v_longstay', 'v_revoked'].sort());
  });

  test('todas las fechas de todas las fixtures llevan desplazamiento explícito (nunca Z, nunca sin zona)', () => {
    const dates = collectDateLikeStrings(fixtures);
    assert.ok(dates.length > 20, 'se esperaban muchas fechas en las fixtures');
    for (const d of dates) {
      assert.match(d, ISO_WITH_EXPLICIT_OFFSET, `fecha sin desplazamiento explícito: ${d}`);
    }
  });

  test('toda locationId referida por una cita de cualquier fixture existe en locations.js', () => {
    for (const [id, f] of Object.entries(fixtures)) {
      for (const appt of f.appointments) {
        assert.ok(LOCATION_IDS.includes(appt.locationId), `${id}/${appt.id}: locationId "${appt.locationId}" no existe en locations.js`);
      }
    }
  });

  test('caso §9 "paciente que solo habla inglés": al menos una fixture tiene lang: "en"', () => {
    const langs = Object.values(fixtures).map((f) => f.visit.lang);
    assert.ok(langs.every((l) => l === 'es' || l === 'en'), 'lang debe ser siempre "es" o "en"');
    assert.ok(langs.includes('en'), 'ninguna fixture tiene lang: "en"');
    assert.ok(langs.includes('es'), 'ninguna fixture tiene lang: "es"');
  });

  // Dos filas de la tabla del PRD §9 no son responsabilidad de esta fase
  // porque no son datos de fixture, son comportamiento:
  //   - "Sin señal en el acceso" — depende de src/ui/passCache.js, que es
  //     fase 06 (ver docs/phases/phase-06-qpass-render.md).
  //   - "Teléfono en otra zona horaria" — ya lo prueba fase 01 corriendo
  //     toda la suite de dominio bajo TZ=UTC/America/New_York/
  //     America/Tijuana (npm run test:tz); no depende de qué fixture se
  //     use, así que no hace falta repetirlo aquí con datos reales.
});

describe('v_demo1 reproduce exactamente el ejemplo trabajado del PRD §8', () => {
  test('computeExpiresAt(v_demo1) da 2026-03-12T12:00-07:00, igual que el PRD', () => {
    const f = fixtures.v_demo1;
    const expiresAt = computeExpiresAt(f.visit, f.appointments, f.lodging);
    assert.strictEqual(new Date(expiresAt).getTime(), new Date('2026-03-12T12:00-07:00').getTime());
  });

  test('nextStep en 2026-03-10T09:00-07:00 con A1 done da A2 (caso 2a)', () => {
    const f = fixtures.v_demo1;
    const withA1Done = f.appointments.map((a) => (a.id === 'a1' ? { ...a, status: 'done' } : a));
    const step = nextStep(withA1Done, '2026-03-10T09:00-07:00');
    assert.strictEqual(step.serviceName, 'Resonancia magnética');
  });

  test('los dos QPASS de v_demo1 no caducan y ambos son visibles el tercer día (caso 3c)', () => {
    const f = fixtures.v_demo1;
    assert.strictEqual(f.passes.length, 2);
    assert.ok(f.passes.every((p) => p.validUntil === null));
    const visible = visiblePasses(f.passes, '2026-03-11T23:00-07:00');
    assert.strictEqual(visible.length, 2);
  });
});

describe('v_demo2 — sin hospedaje, una cancelada, una movida', () => {
  test('no tiene hospedaje: "Mi estancia" no debe tener de dónde salir', () => {
    assert.strictEqual(fixtures.v_demo2.lodging, null);
  });

  test('tiene exactamente una cita cancelada', () => {
    const cancelled = fixtures.v_demo2.appointments.filter((a) => a.status === 'cancelled');
    assert.strictEqual(cancelled.length, 1);
  });

  test('la cita cancelada aparece en groupByDay pero nunca en nextStep', () => {
    const f = fixtures.v_demo2;
    const now = '2026-04-06T07:00-07:00';
    const groups = groupByDay(f.appointments, now);
    const allIds = groups.flatMap((g) => g.items.map((a) => a.id));
    const cancelledId = f.appointments.find((a) => a.status === 'cancelled').id;
    assert.ok(allIds.includes(cancelledId), 'la cancelada debe seguir en la línea de tiempo');

    const step = nextStep(f.appointments, now);
    assert.notStrictEqual(step?.id, cancelledId, 'la cancelada nunca es el siguiente paso');
  });

  test('R1 caso 1g: sin hospedaje, manda la última cita no cancelada', () => {
    const f = fixtures.v_demo2;
    const lastNonCancelled = f.appointments.filter((a) => a.status !== 'cancelled').sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt))[0];
    const expectedEnd = new Date(lastNonCancelled.startsAt).getTime() + lastNonCancelled.durationMin * 60000 + 24 * 3600000;
    const expiresAt = computeExpiresAt(f.visit, f.appointments, f.lodging);
    assert.strictEqual(new Date(expiresAt).getTime(), expectedEnd);
  });
});

describe('v_longstay — estancia extendida (caso 1f) con pase sin caducidad', () => {
  test('expiresAt lo gobierna el checkout, muy posterior a la última cita', () => {
    const f = fixtures.v_longstay;
    const expiresAt = computeExpiresAt(f.visit, f.appointments, f.lodging);
    const checkoutMs = new Date(f.lodging.checkOut).getTime();
    const lastApptEndMs = Math.max(...f.appointments.map((a) => new Date(a.startsAt).getTime() + a.durationMin * 60000));
    assert.ok(checkoutMs > lastApptEndMs, 'fixture mal construida: el checkout debe ser posterior a la última cita');
    assert.strictEqual(new Date(expiresAt).getTime(), checkoutMs + 24 * 3600000);
  });

  test('el pase sigue visible el último día de la estancia (validUntil: null)', () => {
    const f = fixtures.v_longstay;
    const lastDay = f.lodging.checkOut.slice(0, 10); // "YYYY-MM-DD" del checkout
    const nowOnLastDay = `${lastDay}T08:00-07:00`;
    const visible = visiblePasses(f.passes, nowOnLastDay);
    assert.strictEqual(visible.length, f.passes.length, 'todos los pases deben seguir visibles el último día');
  });
});

describe('v_expired — el enlace ya venció', () => {
  test('isExpired da true con un now muy posterior a expiresAt', () => {
    const f = fixtures.v_expired;
    assert.strictEqual(f.lodging, null, 'v_expired no necesita hospedaje para este caso');
    const expiresAt = computeExpiresAt(f.visit, f.appointments, f.lodging);
    const wayAfter = new Date(new Date(expiresAt).getTime() + 30 * 24 * 3600000).toISOString();
    assert.strictEqual(isExpired(f.visit, f.appointments, f.lodging, wayAfter), true);
  });
});

describe('v_revoked — INV-4 y caso 3b', () => {
  test('tiene un QPASS revocado y uno activo', () => {
    const f = fixtures.v_revoked;
    const revoked = f.passes.filter((p) => p.revokedAt !== null);
    const active = f.passes.filter((p) => p.revokedAt === null);
    assert.strictEqual(revoked.length, 1);
    assert.strictEqual(active.length, 1);
  });

  test('visiblePasses excluye el revocado incluso después de su revokedAt', () => {
    const f = fixtures.v_revoked;
    const revoked = f.passes.find((p) => p.revokedAt !== null);
    const now = new Date(new Date(revoked.revokedAt).getTime() + 60000).toISOString();
    const visible = visiblePasses(f.passes, now);
    assert.ok(!visible.some((p) => p.id === revoked.id), 'el pase revocado no debe aparecer');
    assert.strictEqual(visible.length, f.passes.length - 1);
  });
});
