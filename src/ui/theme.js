// Tokens de marca (mismos que la presentación: navy #1C2B53, teal #14BCC4,
// blanco, tinte #EEF3F8, Barlow) más el armazón de layout. `--nc-teal-ink`
// es el color de texto/ícono que SÍ pasa 4.5:1 sobre relleno teal — blanco
// sobre teal da ~2.3:1 (no pasa), navy sobre teal da ~5.9:1 (si pasa);
// mismo cálculo ya documentado en src/map/complexMap.js, reusado aquí para
// que ningún botón o distintivo de esta fase cometa el mismo error.
//
// Barlow (Presentacion Checkup/Recursos/Tipografia Barlow/*.ttf) no se
// embebe como @font-face: son 4 archivos .ttf (~400KB en total) y esta
// fase no tiene todavía un paso de optimización de assets — embeberlos sin
// comprimir infla el index.html autocontenido de build.py de forma
// desproporcionada para un prototipo. Se usa como preferencia con caída a
// system-ui, que ya se ve suficientemente cercano; queda anotado como
// pendiente, no como decisión definitiva.

export const THEME_CSS = `
:root {
  --nc-navy: #1C2B53;
  --nc-teal: #14BCC4;
  --nc-teal-ink: #0E7378;
  --nc-bg: #EEF3F8;
  --nc-surface: #FFFFFF;
  --nc-ink: #1C2B53;
  --nc-card-bg: #FFFFFF;
  --nc-card-border: #D7E1EE;
}
@media (prefers-color-scheme: dark) {
  :root {
    --nc-bg: #0E1830;
    --nc-surface: #152040;
    --nc-ink: #F2F5FA;
    --nc-card-bg: #182449;
    --nc-card-border: #2C3B63;
    --nc-teal-ink: #6FE0E6;
  }
}
/* La pantalla del pase (fase 06) nunca usa tema oscuro — necesita el
   contraste máximo para que una lectora la lea bien. Esta clase, puesta
   por src/ui/app.js solo en la ruta #/pass, gana sobre la media query de
   arriba sin importar el tema del sistema. */
.nc-force-light {
  --nc-bg: #EEF3F8;
  --nc-surface: #FFFFFF;
  --nc-ink: #1C2B53;
  --nc-card-bg: #FFFFFF;
  --nc-card-border: #D7E1EE;
  --nc-teal-ink: #0E7378;
}
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--nc-bg); color: var(--nc-ink);
  font-family: Barlow, system-ui, -apple-system, sans-serif;
  min-height: 100vh; display: flex; flex-direction: column;
}
#app { flex: 1; display: flex; flex-direction: column; min-height: 100vh; }
.nc-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: var(--nc-surface); border-bottom: 1px solid var(--nc-card-border); }
.nc-header-brand { display: flex; align-items: center; gap: 8px; }
.nc-header-icon { display: block; border-radius: 6px; }
.nc-header-title { font-weight: 700; font-size: 15px; letter-spacing: 0.02em; }
.nc-lang-toggle { min-height: 44px; min-width: 44px; padding: 4px 12px; border-radius: 8px; border: 1px solid var(--nc-card-border); background: none; color: var(--nc-ink); font: 600 12px Barlow, system-ui, sans-serif; cursor: pointer; }
.nc-main { flex: 1; padding: 16px; padding-bottom: 24px; max-width: 480px; width: 100%; margin: 0 auto; overflow-x: hidden; }
.nc-screen { display: flex; flex-direction: column; }
.nc-button { min-height: 44px; min-width: 44px; padding: 10px 16px; border-radius: 10px; border: 1px solid var(--nc-card-border); background: var(--nc-card-bg); color: var(--nc-ink); font: 600 14px Barlow, system-ui, sans-serif; cursor: pointer; }
.nc-button--primary { background: var(--nc-teal); border-color: var(--nc-teal); color: var(--nc-teal-ink); }
.nc-neutral { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 32px; gap: 8px; }
.nc-neutral-title { font-size: 18px; font-weight: 700; margin: 0; }
.nc-neutral-body { font-size: 14px; opacity: 0.75; margin: 0; max-width: 320px; }
`;
