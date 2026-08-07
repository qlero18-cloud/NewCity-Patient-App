// Etapa A (#22) — Convención de nombres de clase del panel de coordinadores.
//
// La regla real del proyecto no es "prefija todo con algo", es: una clase
// con prefijo de PANTALLA le pertenece a esa pantalla, y ninguna otra
// pantalla la declara ni la usa. Las primitivas compartidas (.nc-button,
// .nc-card, .nc-badge, .nc-screen-title, .nc-empty-state) no llevan
// prefijo de pantalla justamente porque sí se comparten a propósito, y
// cada archivo trae su copia idéntica por el orden de carga (ver el
// encabezado de coordinator/itinerary.js).
//
// El encabezado de src/ui/screens/coordinator/itinerary.js dice que ese
// directorio existe "precisamente para no chocar de nombre con las
// pantallas del paciente ya aprobadas" — y aun así ese archivo tomaba
// prestado .nc-itin-what/.nc-itin-what--cancelled, que son del itinerario
// del PACIENTE (src/ui/screens/itinerary.js). Hoy no rompe nada (los dos
// bundles son documentos distintos y las reglas son idénticas), pero es
// un conflicto latente de los caros: cambiar el tachado del paciente
// dejaría al coordinador con el estilo viejo en silencio, y si algún día
// los dos CSS caen en el mismo documento el orden de carga decide cuál
// gana. Este test lo cierra por construcción.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COORD_DIR = path.join(__dirname, '../../../src/ui/screens/coordinator');
const PATIENT_DIR = path.join(__dirname, '../../../src/ui/screens');

// Prefijos que SÍ son primitivas compartidas del proyecto: no pertenecen a
// ninguna pantalla, y por eso está bien que se repitan.
const SHARED = ['nc-screen', 'nc-empty', 'nc-button', 'nc-card', 'nc-badge', 'nc-input', 'nc-main', 'nc-header', 'nc-link', 'nc-section', 'nc-field'];

// Mismo helper que test/domain/invariants.test.js: lo que interesa es el
// código, no la prosa. Un comentario que explique por qué un nombre viejo
// dejó de usarse es documentación válida y no debe hacer fallar el guard.
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

// El lookbehind descarta las variables de tema (var(--nc-ink), --nc-surface,
// definidas en theme.js): son propiedades personalizadas de CSS, no clases,
// y compartirlas es justamente para lo que existen.
function classesIn(text) {
  return new Set(
    [...stripComments(text).matchAll(/(?<![-a-z0-9])nc-[a-z0-9]+(?:-[a-z0-9]+)*(?:--[a-z0-9-]+)?/g)].map((m) => m[0])
  );
}

function isShared(cls) {
  return SHARED.some((p) => cls === p || cls.startsWith(`${p}-`) || cls.startsWith(`${p}--`));
}

const coordFiles = readdirSync(COORD_DIR).filter((f) => f.endsWith('.js'));
const patientFiles = readdirSync(PATIENT_DIR).filter((f) => f.endsWith('.js'));

describe('convención de clases CSS del panel de coordinadores (Etapa A, #22)', () => {
  test('hay archivos que revisar de los dos lados (si no, el test pasaría en falso)', () => {
    assert.ok(coordFiles.length >= 5, `esperaba ≥5 pantallas de coordinador, hay ${coordFiles.length}`);
    assert.ok(patientFiles.length >= 5, `esperaba ≥5 pantallas de paciente, hay ${patientFiles.length}`);
  });

  test('ninguna pantalla del coordinador usa una clase del espacio de nombres de una pantalla del paciente', () => {
    const patientOwned = new Map(); // clase -> archivo del paciente que la declara
    for (const f of patientFiles) {
      for (const cls of classesIn(readFileSync(path.join(PATIENT_DIR, f), 'utf8'))) {
        if (!isShared(cls)) patientOwned.set(cls, f);
      }
    }

    const trespassing = [];
    for (const f of coordFiles) {
      for (const cls of classesIn(readFileSync(path.join(COORD_DIR, f), 'utf8'))) {
        if (patientOwned.has(cls)) {
          trespassing.push(`coordinator/${f} usa .${cls}, que es de screens/${patientOwned.get(cls)}`);
        }
      }
    }

    assert.deepStrictEqual(
      trespassing,
      [],
      `clases del paciente reutilizadas desde el panel:\n  ${trespassing.join('\n  ')}`
    );
  });

  test('el itinerario del coordinador tacha las canceladas con su propia clase, no con la del paciente', () => {
    const code = stripComments(readFileSync(path.join(COORD_DIR, 'itinerary.js'), 'utf8'));
    assert.match(code, /nc-coord-itin-what--cancelled/, 'debe declarar y usar su propia clase de tachado');
    assert.doesNotMatch(
      code,
      /(?<![-a-z])nc-itin-what/,
      'no debe volver a nombrar .nc-itin-what, que es del itinerario del paciente'
    );
  });

  test('el itinerario del PACIENTE se queda intacto: este cambio no lo toca', () => {
    const text = readFileSync(path.join(PATIENT_DIR, 'itinerary.js'), 'utf8');
    assert.match(text, /nc-itin-what--cancelled/, 'la pantalla del paciente conserva su clase de siempre');
    assert.doesNotMatch(text, /nc-coord-/, 'la pantalla del paciente no debe saber que existe el panel');
  });
});
