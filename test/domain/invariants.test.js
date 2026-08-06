// Fase 01 — pruebas de INV-1, INV-2 e INV-5 (PRD §7.1).
//
// INV-1 e INV-2 se comprueban leyendo el texto de cada módulo de
// src/domain/ (rastreo estático), no ejecutándolo. Antes de que exista la
// carpeta src/domain/ esto falla con ENOENT — rojo esperado y correcto.
//
// Los patrones usan \b (límite de palabra) a propósito: "documento" o
// "ventana" en un comentario en español NO deben disparar un falso
// positivo de INV-2 solo por contener "document" o "window" como
// subcadena.
//
// El rastreo quita los comentarios antes de aplicar los patrones: un
// módulo puede (y debe) documentar en prosa qué patrón evita — por
// ejemplo explicar por qué no usa "new Date()" sin argumento — sin que esa
// explicación se lea a sí misma como una violación.
//
// INV-5 se prueba aquí con una aserción de comportamiento sobre
// formatTimeTijuana. La prueba real de "misma salida sin importar TZ del
// proceso" no se hace mutando process.env.TZ a mitad de ejecución (Node
// no lo garantiza de forma confiable dentro de un mismo proceso) sino
// corriendo este archivo tres veces como procesos separados con el
// comando de verificación de la fase:
//   for z in UTC America/New_York America/Tijuana; do TZ=$z node --test test/domain/; done
// Si esta aserción da el mismo resultado en las tres corridas, INV-5 queda
// probado empíricamente.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { formatTimeTijuana } from '../../src/domain/time.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOMAIN_DIR = path.join(__dirname, '..', '..', 'src', 'domain');

// Quita comentarios de bloque y de línea antes de rastrear. Pragmático, no
// un tokenizador completo de JS: suficiente para módulos de dominio que no
// tienen strings con "//" o "/*" dentro (URLs, regex-como-string, etc. no
// aparecen en este código — INV-2 ya prohíbe fetch/red).
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function domainModuleTexts() {
  return readdirSync(DOMAIN_DIR)
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ file: f, text: stripComments(readFileSync(path.join(DOMAIN_DIR, f), 'utf8')) }));
}

describe('INV-1 — ninguna función de dominio lee el reloj del sistema', () => {
  test('ningún módulo de src/domain/ contiene Date.now( o new Date() sin argumento', () => {
    const bareNewDate = /new\s+Date\s*\(\s*\)/;
    const dateNow = /Date\s*\.\s*now\s*\(/;
    const offenders = [];
    for (const { file, text } of domainModuleTexts()) {
      if (bareNewDate.test(text)) offenders.push(`${file}: usa "new Date()" sin argumento`);
      if (dateNow.test(text)) offenders.push(`${file}: usa "Date.now("`);
    }
    assert.deepStrictEqual(offenders, []);
  });
});

describe('INV-2 — ningún módulo de dominio toca DOM, red o almacenamiento del navegador', () => {
  test('ningún módulo de src/domain/ contiene document, window, fetch( o localStorage', () => {
    const patterns = [
      { name: 'document', re: /\bdocument\b/ },
      { name: 'window', re: /\bwindow\b/ },
      { name: 'fetch(', re: /\bfetch\s*\(/ },
      { name: 'localStorage', re: /\blocalStorage\b/ },
    ];
    const offenders = [];
    for (const { file, text } of domainModuleTexts()) {
      for (const { name, re } of patterns) {
        if (re.test(text)) offenders.push(`${file}: contiene "${name}"`);
      }
    }
    assert.deepStrictEqual(offenders, []);
  });
});

describe('INV-5 — toda hora se formatea en America/Tijuana, sin importar la TZ del proceso', () => {
  test('formatTimeTijuana da el mismo resultado sin importar process.env.TZ (probar con el loop de TZ de la fase)', () => {
    assert.strictEqual(formatTimeTijuana('2026-03-10T09:30-07:00', 'en'), '9:30 AM');
    assert.strictEqual(formatTimeTijuana('2026-03-10T09:30-07:00', 'es'), '9:30 a.m.');
    assert.strictEqual(formatTimeTijuana('2026-03-10T00:00-07:00', 'en'), '12:00 AM');
    assert.strictEqual(formatTimeTijuana('2026-03-10T12:00-07:00', 'en'), '12:00 PM');
  });

  test('ningún módulo de src/domain/ usa Date#getHours, getMinutes o getDay (dependerían de la TZ del proceso)', () => {
    const patterns = [/\.getHours\s*\(/, /\.getMinutes\s*\(/, /\.getDay\s*\(/, /\.getDate\s*\(/];
    const offenders = [];
    for (const { file, text } of domainModuleTexts()) {
      for (const re of patterns) {
        if (re.test(text)) offenders.push(`${file}: usa ${re}`);
      }
    }
    assert.deepStrictEqual(offenders, []);
  });
});
