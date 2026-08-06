// Fase 07 (D27) — pruebas de la pantalla Plaza con las tres secciones:
// Restaurantes (sin cambios de fase 05), Directorio y Amenidades (nuevas).
// Igual que renderComplexMapSvg/renderFichaHtml (fase 04): se prueba el
// HTML devuelto por render*Screen con aserciones de substring, no
// attachPlazaScreen — este proyecto no trae un DOM falso para node:test en
// ningún otro archivo, y la interacción real de los filtros (clic, que
// oculte/muestre tarjetas) se revisa en navegador, no aquí.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderPlazaScreen } from '../../src/ui/screens/plaza.js';
import { plazaVenues } from '../../src/data/plaza.js';
import { translate } from '../../src/ui/i18n.js';

function ctx(lang) {
  return { lang, t: (path) => translate(lang, path) };
}

describe('renderPlazaScreen — tres secciones', () => {
  test('las tres secciones existen, en los dos idiomas', () => {
    for (const lang of ['es', 'en']) {
      const html = renderPlazaScreen(ctx(lang));
      assert.match(html, new RegExp(translate(lang, 'plaza.restaurantsTitle')));
      assert.match(html, new RegExp(translate(lang, 'plaza.directoryTitle')));
      assert.match(html, new RegExp(translate(lang, 'plaza.amenitiesTitle')));
    }
  });

  test('Restaurantes sigue mostrando exactamente los venues de gastronomía (Farmer\'s Table, The Park Restaurante, Boka, José Café)', () => {
    const html = renderPlazaScreen(ctx('es'));
    for (const name of ["Farmer's Table", 'The Park Restaurante', 'Boka', 'José Café']) {
      assert.ok(html.includes(name), `falta "${name}" en la pantalla`);
    }
  });

  test('Amenidades ya NO está vacía (PRD §15.3) — aparecen los 8 íconos del documento, traducidos en cada idioma', () => {
    const htmlEs = renderPlazaScreen(ctx('es'));
    const htmlEn = renderPlazaScreen(ctx('en'));
    assert.ok(!htmlEs.includes(translate('es', 'plaza.amenitiesEmpty')), 'no debería mostrar el estado vacío en es');
    assert.ok(!htmlEn.includes(translate('en', 'plaza.amenitiesEmpty')), 'no debería mostrar el estado vacío en en');
    assert.ok(htmlEs.includes('Baños') && htmlEs.includes('Cajero automático'), 'faltan nombres de amenidad en es');
    assert.ok(htmlEn.includes('Restrooms') && htmlEn.includes('ATM'), 'faltan nombres de amenidad en en');
  });

  test('Directorio muestra los locales de salud/belleza/servicios/moda, con la categoría traducida como línea', () => {
    const html = renderPlazaScreen(ctx('es'));
    assert.ok(html.includes('7-Eleven'), 'falta 7-Eleven (resuelve D17, "tienda de conveniencia")');
    assert.ok(html.includes('Skin Point'), 'falta Skin Point (belleza)');
    assert.ok(html.includes('Atalier del Calzado'), 'falta Atalier del Calzado (moda)');
    assert.match(html, /Salud/);
    assert.match(html, /Belleza/);
    assert.match(html, /Servicios/);
    assert.match(html, /Moda/);
  });

  test('los dos "Luxor Óptica" (H3 y S5 del documento) aparecen como dos tarjetas, no una sola', () => {
    const html = renderPlazaScreen(ctx('es'));
    const count = (html.match(/Luxor Óptica/g) || []).length;
    assert.strictEqual(count, 2, 'deberían existir dos tarjetas "Luxor Óptica" (dos sucursales, códigos H3 y S5)');
  });

  test('el filtro de categoría del Directorio trae un botón por cada categoría no vacía, más "Todos"', () => {
    const html = renderPlazaScreen(ctx('es'));
    for (const cat of ['salud', 'belleza', 'servicios', 'moda']) {
      assert.ok(html.includes(`data-category="${cat}"`), `falta el chip de filtro para "${cat}"`);
    }
  });
});

describe('plazaVenues (src/data/plaza.js) — cobertura del directorio completo', () => {
  test('todo venue tiene name no vacío (string o {es,en}) en las dos formas', () => {
    for (const v of plazaVenues) {
      if (typeof v.name === 'string') {
        assert.ok(v.name.length > 0, `${v.id}: name vacío`);
      } else {
        assert.ok(v.name.es?.length > 0 && v.name.en?.length > 0, `${v.id}: name.es/name.en vacío`);
      }
    }
  });

  test('category es una de las 6 conocidas (5 del documento + amenidad)', () => {
    const known = new Set(['gastronomia', 'salud', 'belleza', 'servicios', 'moda', 'amenidad']);
    for (const v of plazaVenues) {
      assert.ok(known.has(v.category), `${v.id}: category "${v.category}" desconocida`);
    }
  });

  test('todos siguen unconfirmed: true (ningún horario ni tipo de comida real todavía)', () => {
    for (const v of plazaVenues) {
      assert.strictEqual(v.unconfirmed, true, `${v.id}: debería estar unconfirmed`);
    }
  });

  test('ningún id se repite', () => {
    const ids = plazaVenues.map((v) => v.id);
    assert.strictEqual(new Set(ids).size, ids.length, 'hay ids de plazaVenues repetidos');
  });
});
