// Etapa I — la pantalla de revisión de un itinerario de Word.
//
// La regla de esta pantalla, y la razón de que sea obligatoria: **el
// intérprete propone; la coordinadora dispone** (D84). Nada de lo que salga
// del documento se manda al servidor sin que alguien lo haya visto. En
// particular el nombre del paciente, que se confirma marcando una casilla:
// uno de los cinco documentos reales que se midieron para esta etapa
// llevaba en el nombre del archivo a una paciente y adentro los datos de
// otra. Ningún software puede desempatar eso; una persona sí.
//
// De ahí salen las tres cosas que hace este archivo:
//
//   1. Enseñar TODO lo que el intérprete tocó —typos corregidos, horas
//      invertidas, duraciones supuestas— en vez de entregar un resultado
//      limpio que oculte de dónde salió.
//   2. Enseñar también lo que NO va a importar (las comidas) y lo que
//      descarta del encabezado (fecha de nacimiento, teléfono, correo), en
//      lugar de tirarlo en silencio.
//   3. Obligar a que la ubicación salga de un <select> del catálogo, nunca
//      del texto del documento (D40, D70). Sin coincidencia se queda vacía
//      y el navegador frena el envío: adivinar mandaría al paciente a un
//      piso equivocado con toda seguridad.
//
// El servidor sigue siendo la autoridad: valida lo mismo otra vez y
// contesta 422 por índice de fila. Esta pantalla es comodidad (D75).

import { escapeHtml, locationOptionsHtml } from '../../util.js';
import { errorText } from './formErrors.js';
import { locations } from '../../../data/locations.js';
import { docxTableRows, docxParagraphsOutsideTables } from '../../../domain/docxTable.js';
import { parseItinerary, ITIN_ATTENTION_CODES } from '../../../domain/itineraryParse.js';
import { toIsoTijuana, toLocalInput } from '../../../domain/time.js';
import { readDocxDocumentXml, validateDocxFile } from '../../docxFile.js';

const IMP_ACCEPT = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const IMP_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;
const IMP_OPCIONALES = ['prep', 'doctor', 'details'];

function impTrim(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function impPad(n) {
  return String(n).padStart(2, '0');
}

// El texto de una nota o de un aviso. Las cadenas con dato adentro
// ("URUNALYSIS → URINALYSIS") viven en i18n como funciones y reciben la
// nota entera, para que el sitio de llamada sea uno solo.
//
// Si el intérprete gana un código antes que su traducción, se muestra el
// código crudo: feo, pero una corrección invisible es peor que una fea, y
// translate() lanzaría y dejaría la pantalla en blanco.
function impNoteText(nota, t) {
  if (!nota || typeof nota.code !== 'string') return '';
  let valor;
  try {
    valor = t(`coordinator.import.${nota.kind === 'warning' ? 'warning' : 'note'}.${nota.code}`);
  } catch {
    return nota.code;
  }
  return typeof valor === 'function' ? valor(nota) : valor;
}

function impNeedsAttention(fila) {
  return fila.notes.some((n) => ITIN_ATTENTION_CODES.has(n.code));
}

function impNotesHtml(notas, t, kind) {
  return notas
    .map((n) => {
      const atencion = kind === 'warning' || ITIN_ATTENTION_CODES.has(n.code);
      const clase = atencion ? 'nc-coord-import-note--attention' : 'nc-coord-import-note--fixed';
      return `<li class="nc-coord-import-note ${clase}">${escapeHtml(impNoteText({ ...n, kind }, t))}</li>`;
    })
    .join('');
}

// Un <select> con placeholder vacío cuando no hubo coincidencia. Sin esa
// opción el navegador selecciona la PRIMERA del catálogo, y el itinerario
// se importaría mandando al paciente al estacionamiento sin que nadie lo
// haya decidido.
function impLocationSelect(locationId, lang, t) {
  const vacio = locationId
    ? ''
    : `<option value="" disabled selected>${escapeHtml(t('coordinator.import.locationPlaceholder'))}</option>`;
  return `<select name="locationId" class="nc-coord-import-input" required>`
    + `${vacio}${locationOptionsHtml(locations, lang, locationId)}</select>`;
}

function impAppointmentRow(fila, lang, t) {
  const atencion = impNeedsAttention(fila) ? ' nc-coord-import-row--attention' : '';
  const etiqueta = (llave) => escapeHtml(t(`coordinator.import.col.${llave}`));

  return `
    <tr data-role="import-row" data-index="${fila.index}" class="nc-coord-import-row${atencion}">
      <td class="nc-coord-import-cell">
        <input type="datetime-local" name="startsAt" class="nc-coord-import-input" required
               aria-label="${etiqueta('time')}" value="${escapeHtml(toLocalInput(fila.startsAt))}" />
      </td>
      <td class="nc-coord-import-cell">
        <input type="text" name="serviceName" class="nc-coord-import-input" required
               aria-label="${etiqueta('service')}" value="${escapeHtml(fila.serviceName)}" />
        <input type="text" name="doctor" class="nc-coord-import-input"
               aria-label="${etiqueta('doctor')}" placeholder="${etiqueta('doctor')}" value="${escapeHtml(fila.doctor)}" />
      </td>
      <td class="nc-coord-import-cell">
        <input type="number" name="durationMin" class="nc-coord-import-input" required min="1" step="1"
               aria-label="${etiqueta('duration')}" value="${escapeHtml(fila.durationMin ?? '')}" />
      </td>
      <td class="nc-coord-import-cell">${impLocationSelect(fila.locationId, lang, t)}</td>
      <td class="nc-coord-import-cell">
        <input type="text" name="prep" class="nc-coord-import-input"
               aria-label="${etiqueta('prep')}" placeholder="${etiqueta('prep')}" value="${escapeHtml(fila.prep)}" />
        <textarea name="details" class="nc-coord-import-input nc-coord-import-details" rows="2"
                  aria-label="${etiqueta('details')}" placeholder="${etiqueta('details')}">${escapeHtml(fila.details)}</textarea>
      </td>
      <td class="nc-coord-import-cell nc-coord-import-cell--notes">
        <ul class="nc-coord-import-notes">${impNotesHtml(fila.notes, t)}</ul>
        <p class="nc-coord-import-row-error" data-role="import-row-error" role="alert" hidden></p>
      </td>
    </tr>
  `;
}

// Comidas y continuaciones. Se ven —para que nadie descubra tres días
// después que el documento traía algo que la app nunca mostró— pero no
// traen campos: lo que no se importa no se edita.
function impSkippedRow(fila, t) {
  const texto = fila.kind === 'meal' ? fila.serviceName : fila.details;
  const hora = Array.isArray(fila.raw) ? impTrim(fila.raw[0]) : '';
  const marca = fila.kind === 'meal'
    ? t('coordinator.import.notImported')
    : t('coordinator.import.mergedInto');

  return `
    <tr data-role="import-row" data-index="${fila.index}" class="nc-coord-import-row nc-coord-import-row--skipped">
      <td class="nc-coord-import-cell">${escapeHtml(hora)}</td>
      <td class="nc-coord-import-cell" colspan="4">
        <span class="nc-coord-import-skipped-text">${escapeHtml(texto)}</span>
        <span class="nc-badge nc-coord-import-badge">${escapeHtml(marca)}</span>
      </td>
      <td class="nc-coord-import-cell nc-coord-import-cell--notes">
        <ul class="nc-coord-import-notes">${impNotesHtml(fila.notes, t)}</ul>
      </td>
    </tr>
  `;
}

function impDiscarded(discarded, t) {
  if (!Array.isArray(discarded) || discarded.length === 0) return '';
  const items = discarded
    .map((d) => `<li>${escapeHtml(t(`coordinator.import.discarded.${d}`))}</li>`)
    .join('');
  return `
    <div class="nc-coord-import-discarded">
      <h3 class="nc-coord-import-subtitle">${escapeHtml(t('coordinator.import.discardedTitle'))}</h3>
      <ul class="nc-coord-import-notes">${items}</ul>
    </div>
  `;
}

/**
 * La revisión completa a partir de lo que devolvió parseItinerary.
 *
 * Pura y exportada: es donde vive todo lo que hay que probar de esta
 * pantalla, y así se prueba sin DOM (D8).
 */
export function renderImportReview(res, ctx = {}) {
  const t = ctx.t ?? ((p) => p);
  const lang = ctx.lang === 'en' ? 'en' : 'es';

  const filas = (res.rows ?? []).filter((f) => f.kind !== 'ignored');
  // Las filas de encabezado y las vacías no se pintan —serían diez renglones
  // de ruido en un itinerario real— pero SÍ se cuentan en voz alta: sin
  // esto, el "29 filas leídas" del conteo no cuadraría con lo que se ve y
  // parecería que algo se perdió.
  const saltadas = (res.rows ?? []).length - filas.length;
  const avisos = res.warnings ?? [];

  const cuerpo = filas
    .map((f) => (f.kind === 'appointment' ? impAppointmentRow(f, lang, t) : impSkippedRow(f, t)))
    .join('');

  const col = (llave) => escapeHtml(t(`coordinator.import.col.${llave}`));

  return `
    <form data-role="import-form" class="nc-coord-import-form">
      <fieldset class="nc-coord-import-patient">
        <legend class="nc-coord-import-subtitle">${escapeHtml(t('coordinator.import.patientTitle'))}</legend>

        <label class="nc-field">
          <span class="nc-field-label">${escapeHtml(t('coordinator.import.patientNameLabel'))}</span>
          <input type="text" name="patientFirstName" class="nc-input" required
                 value="${escapeHtml(res.patientName ?? '')}" />
        </label>

        <label class="nc-field">
          <span class="nc-field-label">${escapeHtml(t('coordinator.import.langLabel'))}</span>
          <select name="lang" class="nc-input" required>
            <option value="" disabled selected>${escapeHtml(t('coordinator.import.langPlaceholder'))}</option>
            <option value="es">${escapeHtml(t('common.langName.es'))}</option>
            <option value="en">${escapeHtml(t('common.langName.en'))}</option>
          </select>
        </label>

        <label class="nc-coord-import-confirm">
          <input type="checkbox" data-role="import-confirm-name" required />
          <span>${escapeHtml(t('coordinator.import.confirmNameLabel'))}</span>
        </label>
        <p class="nc-coord-import-hint">${escapeHtml(t('coordinator.import.confirmNameHint'))}</p>
      </fieldset>

      ${impDiscarded(res.discarded, t)}

      <p class="nc-coord-import-counts">${escapeHtml(
        t('coordinator.import.counts')(res.counts.read, res.counts.importable, res.counts.needsAttention),
      )}</p>
      ${saltadas > 0 ? `<p class="nc-coord-import-hint">${escapeHtml(t('coordinator.import.skippedNote')(saltadas))}</p>` : ''}
      ${avisos.length > 0 ? `<ul class="nc-coord-import-notes nc-coord-import-warnings" role="alert">${impNotesHtml(avisos, t, 'warning')}</ul>` : ''}

      <div class="nc-coord-import-scroll">
        <table class="nc-coord-import-table">
          <caption class="nc-coord-import-caption">${escapeHtml(t('coordinator.import.tableCaption'))}</caption>
          <thead>
            <tr>
              <th scope="col">${col('time')}</th>
              <th scope="col">${col('service')}</th>
              <th scope="col">${col('duration')}</th>
              <th scope="col">${col('location')}</th>
              <th scope="col">${col('prep')}</th>
              <th scope="col">${col('notes')}</th>
            </tr>
          </thead>
          <tbody>${cuerpo}</tbody>
        </table>
      </div>

      <button type="submit" class="nc-button nc-button--primary" data-role="import-submit">${escapeHtml(t('coordinator.import.submit'))}</button>
    </form>
  `;
}

export function renderImportScreen(ctx = {}) {
  const t = ctx.t ?? ((p) => p);

  return `
    <section class="nc-screen nc-coord-import">
      <h2 class="nc-coord-import-title">${escapeHtml(t('coordinator.import.title'))}</h2>
      <p class="nc-coord-import-intro">${escapeHtml(t('coordinator.import.intro'))}</p>

      <label class="nc-field">
        <span class="nc-field-label">${escapeHtml(t('coordinator.import.uploadLabel'))}</span>
        <input type="file" accept="${IMP_ACCEPT}" data-role="import-file-input" class="nc-coord-import-file" />
      </label>
      <p class="nc-coord-import-hint">${escapeHtml(t('coordinator.import.uploadHint'))}</p>

      <p class="nc-coord-import-error" data-role="import-error" role="alert" hidden></p>

      <div data-role="import-review"></div>
    </section>
  `;
}

// Suma minutos a una hora de pared. Aritmética de calendario sobre el
// string local, no sobre un instante: `new Date(ms)` a partir de Date.UTC
// es determinista y no consulta el reloj (INV-1), y el desplazamiento se lo
// pone después toIsoTijuana, que sí sabe si esa fecha cae en horario de
// verano (D76).
function impLocalPlus(local, minutos) {
  const m = IMP_LOCAL_RE.exec(local);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + minutos * 60000);
  return `${d.getUTCFullYear()}-${impPad(d.getUTCMonth() + 1)}-${impPad(d.getUTCDate())}`
    + `T${impPad(d.getUTCHours())}:${impPad(d.getUTCMinutes())}`;
}

/**
 * Lo revisado en pantalla se vuelve el cuerpo de POST /import.
 *
 * Pura y exportada por la misma razón que renderImportReview: es la otra
 * mitad de lo que hay que probar sin DOM.
 *
 * Lo ininteligible viaja como `null` en vez de omitirse o corregirse: el
 * servidor es la autoridad y tiene que poder contestar 422 sobre la fila
 * exacta (D75).
 */
export function buildImportPayload({ patientFirstName = '', lang = 'es', rows = [] } = {}) {
  const appointments = rows.map((r) => {
    const minutos = Number.parseInt(r.durationMin, 10);
    const cita = {
      startsAt: toIsoTijuana(impTrim(r.startsAt)) ?? null,
      durationMin: Number.isFinite(minutos) ? minutos : null,
      serviceName: impTrim(r.serviceName),
      locationId: impTrim(r.locationId),
    };
    // Vacío se omite, no se manda como cadena vacía: son opcionales, y un
    // '' guardado hace que la pantalla del paciente pinte un renglón de
    // "preparación" sin nada adentro.
    for (const campo of IMP_OPCIONALES) {
      const v = impTrim(r[campo]);
      if (v !== '') cita[campo] = v;
    }
    return cita;
  });

  // La ventana de la visita se DERIVA de las citas: la primera que empieza
  // y la última que termina. La alternativa —medianoche a medianoche del
  // día del documento— sería inventar dos horas que nadie escribió.
  const conHora = rows
    .map((r, i) => ({ local: impTrim(r.startsAt), dur: appointments[i].durationMin }))
    .filter((x) => IMP_LOCAL_RE.test(x.local));

  let startsAt = null;
  let endsAt = null;
  if (conHora.length > 0) {
    // Comparación de strings: 'YYYY-MM-DDTHH:mm' ordena cronológicamente
    // por sí solo mientras todos sean hora de pared del mismo huso, que es
    // el caso — vienen del mismo formulario.
    const inicio = conHora.reduce((a, b) => (b.local < a ? b.local : a), conHora[0].local);
    const fin = conHora
      .map((x) => impLocalPlus(x.local, x.dur > 0 ? x.dur : 0))
      .reduce((a, b) => (b > a ? b : a));
    startsAt = toIsoTijuana(inicio);
    endsAt = toIsoTijuana(fin);
  }

  return {
    visit: { patientFirstName: impTrim(patientFirstName), lang, startsAt, endsAt },
    appointments,
  };
}

export function attachImportScreen(rootEl, ctx = {}) {
  if (!rootEl || typeof rootEl.querySelector !== 'function') return;

  const { store, onCreated } = ctx;
  const t = ctx.t ?? ((p) => p);
  const lang = ctx.lang === 'en' ? 'en' : 'es';

  const entrada = rootEl.querySelector('[data-role="import-file-input"]');
  const revision = rootEl.querySelector('[data-role="import-review"]');
  const errorEl = rootEl.querySelector('[data-role="import-error"]');
  if (!entrada || !revision) return;

  // Local al closure de ESTA llamada y no variable de módulo: una segunda
  // importación no debe heredar el documento de la anterior (mismo criterio
  // que qpass.js con la imagen del pase). El documento nunca se guarda en
  // ningún lado: se lee, se revisa y lo que queda son las citas.
  let leido = null;

  function limpiarError() {
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.hidden = true;
    }
  }

  // Un archivo que no se pudo leer TIRA la revisión anterior. Dejarla en
  // pantalla es lo peligroso: se ve un itinerario que ya no corresponde al
  // archivo que se acaba de elegir.
  function mostrarError(reason) {
    leido = null;
    revision.innerHTML = '';
    if (errorEl) {
      errorEl.textContent = t(`coordinator.import.fileError.${reason}`);
      errorEl.hidden = false;
    }
  }

  function valor(nodo, nombre) {
    return nodo.querySelector(`[name="${nombre}"]`)?.value ?? '';
  }

  function pintarErroresDeFila(errors, filas) {
    const porFila = Array.isArray(errors?.appointments) ? errors.appointments : [];
    for (const { index, errors: motivos } of porFila) {
      const destino = filas[index]?.querySelector('[data-role="import-row-error"]');
      if (!destino) continue;
      destino.textContent = Object.entries(motivos ?? {})
        .map(([campo, motivo]) => `${campo}: ${errorText(t, motivo)}`)
        .join(' · ');
      destino.hidden = false;
    }

    // Lo que no era de una fila —el nombre, las fechas de la visita, o un
    // 'required'/'tooLong' sobre la lista entera— sube al aviso de arriba.
    const generales = Object.entries(errors ?? {}).filter(([campo]) => campo !== 'appointments');
    const lista = Array.isArray(errors?.appointments) ? generales : Object.entries(errors ?? {});
    if (lista.length > 0 && errorEl) {
      errorEl.textContent = lista.map(([campo, motivo]) => `${campo}: ${errorText(t, motivo)}`).join(' · ');
      errorEl.hidden = false;
    } else if (porFila.length > 0 && errorEl) {
      errorEl.textContent = t('coordinator.import.rowErrors');
      errorEl.hidden = false;
    }
  }

  function cablearFormulario() {
    const form = revision.querySelector('[data-role="import-form"]');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!leido || !store) return;

      const boton = form.querySelector('[data-role="import-submit"]');
      if (boton) boton.disabled = true; // importar dos veces deja dos expedientes del mismo paciente
      limpiarError();

      // Solo las filas con campos son citas: las comidas y las
      // continuaciones se pintan sin controles a propósito.
      const filas = [...form.querySelectorAll('[data-role="import-row"]')]
        .filter((tr) => tr.querySelector('[name="serviceName"]'));

      for (const tr of filas) {
        const aviso = tr.querySelector('[data-role="import-row-error"]');
        if (aviso) {
          aviso.textContent = '';
          aviso.hidden = true;
        }
      }

      const res = await store.importItinerary(buildImportPayload({
        patientFirstName: valor(form, 'patientFirstName'),
        lang: valor(form, 'lang'),
        rows: filas.map((tr) => ({
          startsAt: valor(tr, 'startsAt'),
          durationMin: valor(tr, 'durationMin'),
          serviceName: valor(tr, 'serviceName'),
          locationId: valor(tr, 'locationId'),
          prep: valor(tr, 'prep'),
          doctor: valor(tr, 'doctor'),
          details: valor(tr, 'details'),
        })),
      }));

      if (!res.ok) {
        // La sesión caída la arregla el router pidiendo acceso otra vez, no
        // esta pantalla con un renglón rojo (mismo criterio que qpass.js).
        if (res.unauthenticated) {
          onCreated?.(res);
          return;
        }
        if (res.errors) pintarErroresDeFila(res.errors, filas);
        else if (errorEl) {
          errorEl.textContent = errorText(t, res.notFound ? 'gone' : 'network');
          errorEl.hidden = false;
        }
        if (boton) boton.disabled = false;
        return;
      }

      onCreated?.(res);
    });
  }

  entrada.addEventListener('change', async () => {
    const file = entrada.files?.[0];
    if (!file) return; // cancelar el diálogo no es un error: no se toca nada

    const check = validateDocxFile(file);
    if (!check.ok) {
      mostrarError(check.reason);
      return;
    }

    const lectura = await readDocxDocumentXml(file);
    if (!lectura.ok) {
      mostrarError(lectura.reason);
      return;
    }

    const res = parseItinerary({
      rows: docxTableRows(lectura.xml),
      headings: docxParagraphsOutsideTables(lectura.xml),
      locations,
    });

    // Un .docx legítimo del que no salió ni una cita es un documento con
    // otra estructura, no un itinerario. Decirlo es mejor que pintar una
    // tabla vacía con un botón que no va a funcionar.
    if (res.counts.importable === 0) {
      mostrarError('noRows');
      return;
    }

    limpiarError();
    leido = res;
    revision.innerHTML = renderImportReview(res, { t, lang });
    cablearFormulario();
  });
}

export const IMPORT_CSS = `
.nc-coord-import { display: flex; flex-direction: column; gap: 12px; }
.nc-coord-import-title { margin: 0; font-size: 18px; }
.nc-coord-import-subtitle { margin: 0; font-size: 14px; font-weight: 600; }
.nc-coord-import-intro, .nc-coord-import-hint { margin: 0; font-size: 13px; opacity: 0.8; }
.nc-coord-import-file { min-height: 44px; font: 400 14px Barlow, system-ui, sans-serif; color: var(--nc-ink); }
.nc-coord-import-error { margin: 0; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--nc-danger, #b3261e); color: var(--nc-danger, #b3261e); font-size: 13px; }
.nc-coord-import-form { display: flex; flex-direction: column; gap: 14px; margin-top: 16px; }
.nc-coord-import-patient { display: flex; flex-direction: column; gap: 10px; border: 1px solid var(--nc-card-border); border-radius: 12px; padding: 12px; }
.nc-coord-import-confirm { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 600; min-height: 44px; }
.nc-coord-import-confirm input { width: 20px; height: 20px; }
.nc-coord-import-discarded { border: 1px solid var(--nc-card-border); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
.nc-coord-import-counts { margin: 0; font-size: 14px; font-weight: 600; }
.nc-coord-import-notes { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 3px; font-size: 12px; }
.nc-coord-import-warnings { padding: 10px 12px 10px 30px; border-radius: 10px; border: 1px solid var(--nc-danger, #b3261e); color: var(--nc-danger, #b3261e); }
.nc-coord-import-note--attention { color: var(--nc-danger, #b3261e); font-weight: 600; }
.nc-coord-import-note--fixed { opacity: 0.75; }
.nc-coord-import-scroll { overflow-x: auto; }
.nc-coord-import-table { border-collapse: collapse; width: 100%; font-size: 13px; }
.nc-coord-import-caption { text-align: left; font-size: 12px; opacity: 0.75; padding-bottom: 6px; }
.nc-coord-import-table th { text-align: left; font-size: 12px; opacity: 0.75; padding: 4px 6px; border-bottom: 1px solid var(--nc-card-border); }
.nc-coord-import-cell { vertical-align: top; padding: 6px; border-bottom: 1px solid var(--nc-card-border); }
.nc-coord-import-cell--notes { min-width: 160px; }
.nc-coord-import-row--attention { background: color-mix(in srgb, var(--nc-danger, #b3261e) 8%, transparent); }
.nc-coord-import-row--skipped { opacity: 0.7; }
.nc-coord-import-row-error { margin: 4px 0 0; font-size: 12px; color: var(--nc-danger, #b3261e); }
.nc-coord-import-input { display: block; width: 100%; min-height: 36px; margin-bottom: 4px; border-radius: 8px; border: 1px solid var(--nc-card-border); background: var(--nc-card-bg); color: var(--nc-ink); font: 400 13px Barlow, system-ui, sans-serif; padding: 4px 8px; }
select.nc-coord-import-input { appearance: none; -webkit-appearance: none; background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%); background-position: calc(100% - 18px) center, calc(100% - 13px) center; background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; }
.nc-coord-import-details { min-height: 44px; }
.nc-coord-import-badge { margin-left: 8px; }
`;
