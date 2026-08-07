// Fase 09 (D29) — Emisión de QPASS: la coordinadora sube una imagen ya
// existente del pase (foto o export de un pase físico/pre-hecho) en vez de
// escribir un payload corto para que qr.js/code128.js lo codifiquen. Ver
// "Emisión de QPASS: imagen subida por el coordinador" en
// docs/phases/phase-09-coordinator-demo.md para el diseño completo — este
// archivo sigue ese diseño al pie de la letra, no lo reinterpreta.
//
// ctx de renderQpassScreen: { store, visitId, lang, t }.
// ctx de attachQpassScreen: lo anterior + { onIssued }.
//
// Etapa D — `now` desapareció: la hora de emisión la pone el servidor. El
// reloj de la máquina de coordinación no tiene por qué ser el que quede
// escrito en el expediente.
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
import { isRevoked } from '../../../domain/passes.js';
import { errorText } from './formErrors.js';

const SCOPES = ['torre', 'piso27', 'estacionamiento'];

// 2 MB. La imagen se guarda como data URL en el pase (payload), así que
// el peso del archivo se convierte casi 1:1 en peso del registro y de lo
// que después viaja a la pantalla del paciente. El límite es de producto,
// no técnico: una foto de un pase impreso cabe de sobra.
export const QPASS_MAX_BYTES = 2 * 1024 * 1024;

// Puro y exportado a propósito: es la única forma de probar la validación
// bajo la restricción de este proyecto de no simular DOM en node:test —
// el <input type="file"> y FileReader no existen ahí, pero el criterio sí
// se puede ejercitar con un objeto { type, size }.
//
// accept="image/*" en el input es una sugerencia del navegador, no una
// garantía: el selector de archivos deja cambiar el filtro a "todos", y
// arrastrar y soltar lo ignora por completo. Por eso se vuelve a revisar
// aquí. Motivos: 'missing' | 'type' | 'size'.
export function validateQpassFile(file) {
  if (!file) return { ok: false, reason: 'missing' };
  if (typeof file.type !== 'string' || !file.type.startsWith('image/')) {
    return { ok: false, reason: 'type' };
  }
  if (typeof file.size === 'number' && file.size > QPASS_MAX_BYTES) {
    return { ok: false, reason: 'size' };
  }
  return { ok: true };
}

// "Emitido" = tiene un QPass de imagen VIGENTE. Un pase revocado sigue en
// record.passes (es historia, ver coordinatorStore.revokeQpass), pero no
// debe dejar la pantalla atorada en el estado emitido: si se revocó, la
// coordinadora tiene que poder subir otro. isRevoked viene de domain/
// passes.js — el mismo criterio que usa R3 del lado del paciente.
function activeImagePass(passes) {
  return passes.find((p) => p.format === 'image' && !isRevoked(p)) ?? null;
}

export function renderQpassScreen(ctx) {
  const { store, visitId, t } = ctx;
  const title = t('coordinator.qpass.title');
  const record = store.getVisit(visitId);

  // Guard: visita inexistente -> fallback corto, sin formulario, sin
  // lanzar (misma disciplina de defensa en profundidad que ya usa
  // src/ui/screens/stay.js para lodging ausente, y
  // src/ui/screens/coordinator/lodging.js para visitId inexistente).
  // coordinator.visitNotFound es compartida con itinerary.js y lodging.js
  // — ver el comentario de itinerary.js para el porqué.
  if (!record) {
    return `
      <section class="nc-screen">
        <h1 class="nc-screen-title">${escapeHtml(title)}</h1>
        <p class="nc-qpass-fallback">${escapeHtml(t('coordinator.visitNotFound'))}</p>
      </section>
    `;
  }

  const active = activeImagePass(record.passes);

  if (active) {
    // Revocar lleva el data-pass-id del pase vigente: la visita puede
    // tener varios pases de imagen a lo largo del tiempo (uno revocado y
    // otro nuevo), así que el botón no puede decir "revoca el de imagen"
    // en abstracto. "Emitir otro" no necesita id: revoca este y vuelve al
    // formulario, en un solo clic (attachQpassScreen, abajo).
    return `
      <section class="nc-screen">
        <h1 class="nc-screen-title">${escapeHtml(title)}</h1>
        <p class="nc-qpass-status">${renderBadge(t('coordinator.qpass.issuedBadge'), 'updated')}</p>
        <button type="button" class="nc-button nc-button--primary" data-nav="pass-preview">${escapeHtml(t('coordinator.qpass.viewAsPatient'))}</button>
        <div class="nc-qpass-actions">
          <button type="button" class="nc-button" data-role="reissue-qpass" data-pass-id="${escapeHtml(active.id)}">${escapeHtml(t('coordinator.qpass.reissue'))}</button>
          <button type="button" class="nc-button" data-role="revoke-qpass" data-pass-id="${escapeHtml(active.id)}">${escapeHtml(t('coordinator.qpass.revoke'))}</button>
        </div>
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
        <p class="nc-qpass-error" data-role="qpass-error" role="alert" hidden></p>

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
  const { store, visitId, onIssued, t } = ctx;

  // Local al closure de ESTA llamada (no variable de módulo): una segunda
  // llamada a attach para otra visita no debe heredar la imagen de la
  // anterior.
  let qpassImageDataUrl = null; // efímera a propósito: solo en memoria, nunca localStorage ni servidor (docs/phases/phase-09-coordinator-demo.md, "Emisión de QPASS")

  // Vista "emitido": revocar y re-emitir. Ninguno de los dos existe en la
  // vista de captura, y viceversa — por eso ambos bloques usan `?.` y
  // conviven en la misma función, igual que el resto de attach*Screen.
  const revokeBtn = rootEl.querySelector('[data-role="revoke-qpass"]');
  const reissueBtn = rootEl.querySelector('[data-role="reissue-qpass"]');

  // Los dos hacen lo mismo en el store — la diferencia es de intención, y
  // se nota en lo que ve la coordinadora después: "revocar" deja la visita
  // sin pase (y la pantalla, al re-renderizarse, vuelve al formulario
  // vacío), "emitir otro" es el mismo camino leído como "empiezo de
  // nuevo". Se separan porque son dos decisiones distintas para quien las
  // toma, aunque compartan implementación.
  for (const btn of [revokeBtn, reissueBtn]) {
    btn?.addEventListener('click', async () => {
      const passId = btn.dataset.passId;
      if (!passId) return;
      btn.disabled = true; // aquí sí: revocar dos veces el mismo pase es un 404 confuso, y no hay nada escrito que perder
      const res = await store.revokeQpass(visitId, passId);
      // Mismo callback: "el estado del pase cambió, vuelve a pintar". Ahora
      // lleva el resultado, para que un fallo no se vea igual que un éxito.
      onIssued?.(res);
      if (!res.ok) btn.disabled = false;
    });
  }

  const input = rootEl.querySelector('[data-role="qpass-image-input"]');
  const scopeSelect = rootEl.querySelector('[data-role="qpass-scope-select"]');
  const preview = rootEl.querySelector('[data-role="qpass-preview"]');
  const issueBtn = rootEl.querySelector('[data-role="issue-qpass"]');
  const errorEl = rootEl.querySelector('[data-role="qpass-error"]');

  function showError(reason) {
    qpassImageDataUrl = null;
    if (issueBtn) issueBtn.disabled = true; // que no quede emitible con la imagen anterior
    if (preview) {
      preview.innerHTML = `<p class="nc-qpass-preview-empty">${escapeHtml(t('coordinator.qpass.noImage'))}</p>`;
    }
    if (errorEl) {
      errorEl.textContent = t(`coordinator.qpass.error.${reason}`);
      errorEl.hidden = false;
    }
  }

  // El store devuelve banderas, no códigos: aquí se elige cuál explica
  // mejor lo que pasó. `gone` (la visita ya no está) es el caso en que
  // reintentar no sirve de nada.
  //
  // La sesión caída NO sale por aquí: no es un problema de esta pantalla
  // sino del panel entero, y se resuelve volviendo a entrar. Se le pasa al
  // router, que es quien sabe pintar la pantalla de acceso.
  function motivoDeFallo(res) {
    if (res.notFound) return 'gone';
    if (res.errors) return Object.values(res.errors)[0] ?? 'invalid';
    return 'network';
  }

  function clearError() {
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.hidden = true;
    }
  }

  input?.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return; // cancelar el diálogo no es un error: no se toca nada
    const check = validateQpassFile(file);
    if (!check.ok) {
      showError(check.reason);
      return;
    }
    clearError();
    const reader = new FileReader();
    reader.onload = () => {
      qpassImageDataUrl = reader.result; // "data:image/...;base64,...."
      if (preview) {
        preview.innerHTML = `<img src="${escapeHtml(qpassImageDataUrl)}" alt="${escapeHtml(t('coordinator.qpass.previewTitle'))}" class="nc-qpass-preview-image" />`;
      }
      if (issueBtn) issueBtn.disabled = false;
    };
    // Antes no existía: un archivo ilegible (permisos, unidad de red que
    // se cayó, archivo borrado entre elegirlo y leerlo) dejaba la pantalla
    // en silencio, con el botón deshabilitado y sin decir por qué.
    reader.onerror = () => showError('read');
    reader.readAsDataURL(file);
  });

  issueBtn?.addEventListener('click', async () => {
    if (!qpassImageDataUrl) return;
    const scope = scopeSelect?.value ?? SCOPES[0];

    clearError();
    issueBtn.disabled = true; // la imagen puede pesar 2 MB: la subida tarda y el doble clic emitiría dos pases
    const res = await store.issueQpass(visitId, { format: 'image', payload: qpassImageDataUrl, scope });

    if (!res.ok) {
      // Sesión caída: la arregla el router volviendo a pedir acceso, no
      // esta pantalla con un renglón rojo.
      if (res.unauthenticated) {
        onIssued?.(res);
        return;
      }
      // A diferencia de showError, esto NO tira la imagen ni vacía la vista
      // previa: lo que falló fue el viaje, no el archivo, y volver a elegir
      // una foto de 2 MB por un tropiezo de red es trabajo perdido por nada.
      // Tampoco se repinta la pantalla, por lo mismo.
      if (errorEl) {
        errorEl.textContent = errorText(t, motivoDeFallo(res));
        errorEl.hidden = false;
      }
      issueBtn.disabled = false;
      return;
    }

    onIssued?.(res);
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
.nc-qpass-error { margin: 0 0 14px; font-size: 13px; color: var(--nc-danger, #b3261e); }
.nc-qpass-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
`;
