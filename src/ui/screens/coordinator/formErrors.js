// Etapa D — resumen de los errores que devuelve el servidor.
//
// La API contesta `{ errors: { locationId: 'unknown', startsAt: 'noOffset' } }`:
// motivos por campo, en códigos sin idioma, para que la respuesta HTTP no
// dependa del idioma de quien la pidió. Traducirlos es trabajo del
// navegador, y esto es donde se hace — una sola vez, compartido por los
// cuatro formularios del panel, en vez de una copia por pantalla que se
// desincronice.
//
// Se lista TODO lo que está mal de una vez, no el primer error: con seis
// campos, corregir-guardar-descubrir-el-siguiente son seis viajes al
// servidor para capturar una cita.

import { escapeHtml } from '../../util.js';
import { STRINGS, DEFAULT_LANG } from '../../i18n.js';

// Estos viven en el mismo bloque i18n por comodidad, pero NO son motivos de
// un campo: "Ubicación: no pudimos guardar" no significa nada. Se excluyen
// del resumen por campo y salen por renderRequestError.
const NO_SON_DE_CAMPO = ['network', 'gone'];

// El servidor puede agregar un motivo nuevo antes que nosotros la cadena
// para traducirlo. translate() lanza con una llave inexistente —a
// propósito, para que un typo no salga como "undefined" en pantalla— pero
// aquí eso dejaría la pantalla en blanco por algo que ya se corrigió del
// otro lado. Así que se comprueba antes y se cae en el genérico.
function conocido(motivo) {
  return typeof motivo === 'string' && Object.hasOwn(STRINGS[DEFAULT_LANG].coordinator.error, motivo);
}

function traducirMotivo(t, motivo, permitidos) {
  const usable = conocido(motivo) && permitidos(motivo);
  return t(`coordinator.error.${usable ? motivo : 'invalid'}`);
}

export function renderFormErrors(errors, t, labelKeys = {}) {
  const campos = Object.keys(errors ?? {});
  // Cadena vacía y no un contenedor vacío: un recuadro con borde y sin
  // texto se ve como un hueco roto.
  if (campos.length === 0) return '';

  const items = campos
    .map((campo) => {
      // Sin etiqueta conocida se usa el nombre crudo del campo. Feo, pero
      // el error se VE — tragárselo dejaría un formulario que no guarda y
      // no dice por qué, que es peor.
      const etiqueta = labelKeys[campo] ? t(labelKeys[campo]) : campo;
      const motivo = traducirMotivo(t, errors[campo], (m) => !NO_SON_DE_CAMPO.includes(m));
      return `<li>${escapeHtml(etiqueta)}: ${escapeHtml(motivo)}</li>`;
    })
    .join('');

  // role="alert": el resumen aparece sin que la pantalla cambie de sitio,
  // así que con lector de pantalla, sin esto, guardar simplemente "no hace
  // nada".
  return `<ul class="nc-form-errors" role="alert" data-role="form-errors">${items}</ul>`;
}

// El texto pelado, sin HTML. Lo usa qpass.js, que ya tiene su hueco de
// error en el DOM (con su role="alert" puesto por el render) y lo llena con
// textContent: reemplazarlo por un <p> nuevo rompería las referencias que
// su attach ya tiene guardadas. textContent tampoco interpreta HTML, así
// que aquí no se escapa nada — escapar dejaría "&amp;" visible en pantalla.
export function errorText(t, code) {
  return traducirMotivo(t, code, () => true);
}

// Lo que falló no fue ningún campo: no hay conexión, o la visita
// desapareció mientras estaba abierta en pantalla. Se separa del resumen
// por campo porque pide cosas distintas: "revisa la conexión" invita a
// reintentar, "esa visita ya no existe" dice que reintentar no va a servir.
export function renderRequestError(code, t) {
  if (!code) return '';
  return `<p class="nc-form-errors" role="alert" data-role="request-error">${escapeHtml(errorText(t, code))}</p>`;
}

export const FORM_ERRORS_CSS = `
.nc-form-errors { margin: 0; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--nc-danger, #b3261e); color: var(--nc-danger, #b3261e); font-size: 13px; }
ul.nc-form-errors { padding-left: 28px; display: flex; flex-direction: column; gap: 4px; }
`;
