// Etapa B — persistencia de visitas. Puro: no importa @netlify/blobs ni
// nada de plataforma. Recibe un almacén de llave/valor con cuatro métodos
// y toda la lógica vive aquí, así que se prueba entera con un Map en
// memoria (test/server/visitStore.test.js) y el adaptador de Blobs queda
// como diez líneas sin lógica (netlify/functions/_kv.mjs).
//
// Contrato del almacén (`kv`), todo asíncrono:
//   get(key)        -> valor ya parseado, o null si no existe
//   set(key, value) -> void
//   delete(key)     -> void
//   list(prefix)    -> array de llaves que empiezan con prefix
//
// Trazado de llaves:
//   visit/<visitId>  -> { visit, appointments, passes, lodging }   (el registro)
//   token/<token>    -> { visitId }                                (índice)
//
// Por qué dos llaves y no una: el paciente busca por token y coordinación
// busca por id. Guardar el registro bajo las dos las dejaría divergir en la
// primera edición, así que el índice guarda solo el apuntador. Y guardar
// SOLO bajo el token obligaría a recorrer todo el almacén para listar
// visitas en el panel.
//
// La forma del registro es idéntica a la de src/ui/coordinatorStore.js
// (fase 09) a propósito: la Etapa D cambia de dónde salen los datos, no qué
// forma tienen.

import { newToken, isValidToken } from '../domain/tokens.js';
import { isExpired } from '../domain/expiry.js';
import { instantMs } from '../domain/time.js';

const VISIT_PREFIX = 'visit/';
const TOKEN_PREFIX = 'token/';

const LANGS = ['es', 'en'];

function trimmed(v) {
  return typeof v === 'string' ? v.trim() : '';
}

// Validación del lado del servidor, no del formulario: esto es lo que
// protege al almacén de lo que llegue por HTTP, venga de nuestro panel o de
// curl. Devuelve motivos por campo, sin texto de interfaz — el mismo
// criterio que validateLodging (Etapa A), para que la respuesta no dependa
// del idioma de quien la pidió.
export function validateVisitInput(input) {
  const errors = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: { input: 'invalid' } };
  }

  if (!trimmed(input.patientFirstName)) errors.patientFirstName = 'required';
  if (!LANGS.includes(input.lang)) errors.lang = 'unsupported';

  const parse = (field) => {
    const raw = trimmed(input[field]);
    if (!raw) {
      errors[field] = 'required';
      return null;
    }
    // Primero "¿es una fecha?" y luego "¿trae zona?", en ese orden: al
    // revés, "mañana" saldría reportado como noOffset, que manda a
    // arreglar algo que no es el problema. Mismo criterio que
    // validateLodging con invalidDate antes que order (Etapa A).
    const ms = instantMs(raw);
    if (!Number.isFinite(ms)) {
      errors[field] = 'invalidDate';
      return null;
    }
    // PRD §7: "Todas las fechas son ISO 8601 con desplazamiento explícito.
    // Nada de fechas sin zona." Una fecha sin offset la interpreta cada
    // runtime con SU zona local: el mismo string guardado por una Function
    // en UTC y leído en Tijuana ya son dos horas distintas.
    if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)) {
      errors[field] = 'noOffset';
      return null;
    }
    return ms;
  };

  const startsMs = parse('startsAt');
  const endsMs = parse('endsAt');
  if (startsMs !== null && endsMs !== null && endsMs <= startsMs) {
    errors.endsAt = 'order';
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

export function createVisitStore(kv, options = {}) {
  const {
    generateToken = newToken,
    generateVisitId = () => `v_${newToken()}`,
  } = options;

  async function readRecord(visitId) {
    return kv.get(`${VISIT_PREFIX}${visitId}`);
  }

  return {
    // `createdBy` es opcional a propósito: la Etapa B creaba visitas sin
    // nadie firmando porque no había cuentas todavía, y las pruebas de esa
    // etapa siguen llamando con dos argumentos. Desde la Etapa D el
    // handler siempre lo manda, porque siempre hay una sesión detrás.
    async createVisit(input, now, createdBy) {
      const { ok, errors } = validateVisitInput(input);
      if (!ok) {
        // Se lanza en vez de devolver null: quien llama tiene que decidir
        // qué código HTTP mandar, y un null se confunde con "no existe".
        throw new Error(`visita inválida: ${Object.keys(errors).join(', ')}`);
      }

      const id = generateVisitId();
      const token = generateToken();
      const record = {
        visit: {
          id,
          token,
          patientFirstName: trimmed(input.patientFirstName),
          lang: input.lang,
          startsAt: trimmed(input.startsAt),
          endsAt: trimmed(input.endsAt),
          status: 'active',
          createdAt: now,
          // Sin llave si no vino nadie firmando, en vez de `undefined`:
          // JSON.stringify borra las llaves con undefined, así que el
          // registro guardado y el que devuelve esta función no serían el
          // mismo objeto — y esa diferencia solo aparecería al releer.
          ...(createdBy ? { createdBy } : {}),
        },
        appointments: [],
        passes: [],
        lodging: null,
      };

      // El registro primero: si la segunda escritura falla queda un
      // registro sin índice (invisible para el paciente, visible para
      // coordinación, que puede reemitir). Al revés quedaría un token que
      // apunta a la nada, que es el fallo peor de los dos.
      await kv.set(`${VISIT_PREFIX}${id}`, record);
      await kv.set(`${TOKEN_PREFIX}${token}`, { visitId: id });
      return record;
    },

    // El camino del PACIENTE. Aplica R1 aquí, no en la Function, para que
    // INV-3 sea estructural: vencida y inexistente salen por la misma
    // línea de código y no pueden divergir después.
    async getVisitByToken(token, now) {
      if (!isValidToken(token)) return null;

      const index = await kv.get(`${TOKEN_PREFIX}${token}`);
      if (!index?.visitId) return null;

      const record = await readRecord(index.visitId);
      if (!record) return null; // índice huérfano

      if (isExpired(record.visit, record.appointments, record.lodging, now)) return null;
      return record;
    },

    // El camino de COORDINACIÓN. No aplica caducidad a propósito: una
    // visita vencida sigue siendo suya para consultarla, corregir fechas o
    // revocar un pase. Lo que caduca es el enlace del paciente, no el
    // expediente.
    async getVisit(visitId) {
      if (typeof visitId !== 'string' || !visitId) return null;
      return readRecord(visitId);
    },

    async listVisits() {
      const keys = await kv.list(VISIT_PREFIX);
      const records = await Promise.all(keys.map((k) => kv.get(k)));
      return records.filter(Boolean);
    },

    async saveVisit(record) {
      const id = record?.visit?.id;
      if (!id || !(await readRecord(id))) {
        throw new Error(`no existe la visita ${id}: saveVisit sobrescribe, no crea`);
      }
      await kv.set(`${VISIT_PREFIX}${id}`, record);
      return record;
    },

    // Borra las DOS llaves. Dejar vivo el índice del token sería dejar un
    // token válido apuntando a la nada — y peor, reciclable si algún día
    // otro registro cae en ese id.
    async deleteVisit(visitId) {
      const record = await readRecord(visitId);
      if (!record) return false;
      await kv.delete(`${TOKEN_PREFIX}${record.visit.token}`);
      await kv.delete(`${VISIT_PREFIX}${visitId}`);
      return true;
    },
  };
}
