// Fase 09 (D29) — Emisión de QPASS: la coordinadora sube una imagen ya
// existente del pase (foto o export de un pase físico/pre-hecho) en vez de
// escribir un payload corto para que qr.js/code128.js lo codifiquen. Ver
// "Emisión de QPASS: imagen subida por el coordinador" en
// docs/phases/phase-09-coordinator-demo.md para el diseño completo — este
// archivo sigue ese diseño al pie de la letra, no lo reinterpreta.
//
// ctx de renderQpassScreen: { store, visitId, lang, t }.
// ctx de attachQpassScreen: lo anterior + { now, onIssued }.
//
// "Emitido" para ESTA pantalla significa específicamente que la visita ya
// tiene un QPass con format:'image' — no "la visita ya tiene algún QPass".
// Varias fixtures (v_demo1 entre ellas) ya traen pases qr/code128 de
// fábrica (src/data/fixtures.js); esos no deben hacer que esta pantalla
// salte directo al estado "emitido" la primera vez que se abre.
//
// Ningún símbolo se genera aquí (no se importa generateQrMatrix ni el
// generador de Code128): el símbolo ya viene armado en la imagen que sube
// la coordinadora. Al emitir, esta pantalla solo enlaza con
// data-nav="pass-preview" hacia la vista previa como paciente —
// coordinatorApp.js (el enrutador, construido aparte) es quien resuelve
// esa ruta reutilizando renderPassScreen/attachPassScreen de pass.js.

import { escapeHtml } from '../../util.js';
import { renderCard } from '../../components/card.js';
import { renderBadge } from '../../components/badge.js';

const SCOPES = ['torre', 'piso27', 'estacionamiento'];

function hasIssuedImagePass(passes) {
  return passes.some((p) => p.format === 'image');
}

export function renderQpassScreen(ctx) {
  const { store, visitId, lang, t } = ctx;
  const title = t('coordinator.qpass.title');
  const record = store.getVisit(visitId);

  // Guard: visita inexistente -> fallback corto, sin formulario, sin
  // lanzar (misma disciplina de defensa en profundidad que ya usa
  // src/ui/screens/stay.js para lodging ausente, y
  // src/ui/screens/coordinator/lodging.js para visitId inexistente). No
  // hay llave i18n bajo coordinator.* para "visita no encontrada" — texto
  // literal corto en vez de inventar una llave nueva compartida (ver
  // reporte final de esta tarea).
  if (!record) {
    const fallback = lang === 'en' ? 'Visit not found.' : 'Visita no encontrada.';
    return `
      <section class="nc-screen">
        <h1 class="nc-screen-title">${escapeHtml(title)}</h1>
        <p class="nc-qpass-fallback">${escapeHtml(fallback)}</p>
      </section>
    `;
  }

  const issued = hasIssuedImagePass(record.passes);

  if (issued) {
    return `
      <section class="nc-screen">
        <h1 class="nc-screen-title">${escapeHtml(title)}</h1>
        <p class="nc-qpass-status">${renderBadge(t('coordinator.qpass.issuedBadge'), 'updated')}</p>
        <button type="button" class="nc-button nc-button--primary" data-nav="pass-preview">${escapeHtml(t('coordinator.qpass.viewAsPatient'))}</button>
      </section>
    `;
  }

  const scopeOptionsHtml = SCOPES.map(
    (scope) => `<option value="${escapeHtml(scope)}">${escapeHtml(t(`pass.scope.${scope}`))}</option>`
  ).join('\n');

  return `
    <section class="nc-screen">
      <h1 class="nc-screen-title">${escapeHtml(title)}</h1>
      <p class="nc-qpass-status">${renderBadge(t('coordinator.qpass.pendingBadge'), 'neutral')}</p>
      ${renderCard(`
        <label class="nc-qpass-field">
          <span class="nc-qpass-field-label">${escapeHtml(t('coordinator.qpass.uploadLabel'))}</span>
          <input type="file" accept="image/*" data-role="qpass-image-input" class="nc-file-input" />
        </label>

        <label class="nc-qpass-field">
          <span class="nc-qpass-field-label">${escapeHtml(t('coordinator.qpass.scopeLabel'))}</span>
          <select data-role="qpass-scope-select" class="nc-qpass-select">
            ${scopeOptionsHtml}
          </select>
        </label>

        <p class="nc-qpass-field-label">${escapeHtml(t('coordinator.qpass.previewTitle'))}</p>
        <div class="nc-qpass-preview" data-role="qpass-preview">
          <p class="nc-qpass-preview-empty">${escapeHtml(t('coordinator.qpass.noImage'))}</p>
        </div>

        <button type="button" class="nc-button nc-button--primary" data-role="issue-qpass" disabled>${escapeHtml(t('coordinator.qpass.issue'))}</button>
      `)}
    </section>
  `;
}

// Llamado después de insertar renderQpassScreen en el DOM (mismo contrato
// que el resto de attach*Screen de esta fase). No llama attachNav ni
// engancha su propio listener sobre [data-nav="pass-preview"] — ese botón
// lo cablea el enrutador central con attachNav(root) una sola vez sobre
// todo el árbol ya renderizado (src/ui/nav.js, D28); esta función NO debe
// competir con eso ni disparar dos veces el mismo clic. Por eso, al
// emitir, esta función solo muta el store y llama onIssued?.() — no pinta
// ella misma la vista de "emitido": eso lo decide coordinatorApp.js
// volviendo a llamar renderQpassScreen/attachQpassScreen (y attachNav)
// para la misma ruta, para que el botón data-nav="pass-preview" que
// aparece recién nazca ya cableado.
export function attachQpassScreen(rootEl, ctx) {
  const { store, visitId, now, onIssued, t } = ctx;

  // Local al closure de ESTA llamada (no variable de módulo): una segunda
  // llamada a attach para otra visita no debe heredar la imagen de la
  // anterior.
  let qpassImageDataUrl = null; // efímera a propósito: solo en memoria, nunca localStorage ni servidor (docs/phases/phase-09-coordinator-demo.md, "Emisión de QPASS")

  const input = rootEl.querySelector('[data-role="qpass-image-input"]');
  const scopeSelect = rootEl.querySelector('[data-role="qpass-scope-select"]');
  const preview = rootEl.querySelector('[data-role="qpass-preview"]');
  const issueBtn = rootEl.querySelector('[data-role="issue-qpass"]');

  input?.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      qpassImageDataUrl = reader.result; // "data:image/...;base64,...."
      if (preview) {
        preview.innerHTML = `<img src="${escapeHtml(qpassImageDataUrl)}" alt="${escapeHtml(t('coordinator.qpass.previewTitle'))}" class="nc-qpass-preview-image" />`;
      }
      if (issueBtn) issueBtn.disabled = false;
    };
    reader.readAsDataURL(file);
  });

  issueBtn?.addEventListener('click', () => {
    if (!qpassImageDataUrl) return;
    const scope = scopeSelect?.value ?? SCOPES[0];
    store.issueQpass(visitId, { format: 'image', payload: qpassImageDataUrl, scope }, now);
    onIssued?.();
  });
}

export const QPASS_CSS = `
.nc-qpass-status { margin: 0 0 14px; }
.nc-qpass-field { display: flex; flex-direction: column; gap: 4px; margin: 0 0 14px; }
.nc-qpass-field-label { font-size: 13px; font-weight: 600; opacity: 0.85; }
.nc-file-input { display: block; min-height: 44px; width: 100%; padding: 10px 0; box-sizing: border-box; font: 400 14px Barlow, system-ui, sans-serif; color: var(--nc-ink); }
.nc-qpass-select { min-height: 44px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--nc-card-border); background: var(--nc-surface); color: var(--nc-ink); font: 400 15px Barlow, system-ui, sans-serif; }
.nc-qpass-preview { margin: 4px 0 16px; padding: 12px; min-height: 100px; border: 1px dashed var(--nc-card-border); border-radius: 10px; display: flex; align-items: center; justify-content: center; background: var(--nc-surface); }
.nc-qpass-preview-empty { margin: 0; font-size: 13px; opacity: 0.65; text-align: center; }
.nc-qpass-preview-image { display: block; max-width: 100%; max-height: 220px; border-radius: 6px; }
.nc-qpass-fallback { font-size: 14px; opacity: 0.75; }
`;
