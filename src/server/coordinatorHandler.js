// Etapa D — el endpoint de coordinación: lo que convierte el panel de una
// demo en memoria (fase 09) en algo que de verdad escribe.
//
// Puro, como todo src/server/ (D45): recibe un `Request` estándar y las
// dependencias ya construidas, devuelve un `Response` estándar y no importa
// nada de plataforma. netlify/functions/coordinator.mjs es el envoltorio.
//
// Dependencias (`deps`):
//   store              — createVisitStore(...) de visitStore.js
//   requireCoordinator — el guardia de la Etapa C. Se INYECTA en vez de
//                        importarse para poder probar este archivo sin
//                        montar cuentas ni firmar cookies, y para que se
//                        vea en la firma que ninguna ruta pasa sin él.
//   now                — ISO 8601 con desplazamiento, del reloj del servidor
//   newId              — generador de ids, inyectado para fijarlos al probar
//
// Códigos: 401 sin sesión · 404 no existe · 405 método · 422 datos
// inválidos · 400 cuerpo ilegible · 500 lo demás. Se separa 422 de 404
// porque son dos problemas distintos y quien llama no debería adivinar cuál
// a partir de un null — que es justo el #11 del reporte.

import { validateVisitInput } from './visitStore.js';
import {
  addAppointment,
  moveAppointment,
  editAppointment,
  cancelAppointment,
  setLodging,
  issueQpass,
  revokeQpass,
} from './visitMutations.js';

export const COORDINATOR_PREFIX = '/api/coordinator';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  // Expediente clínico (PRD §6.2): ni en la caché del navegador ni en la de
  // ningún intermediario. Misma regla que el endpoint del paciente.
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// UNA sola respuesta de "no existe" para todas las rutas. Que la visita
// fantasma conteste distinto según por dónde entres es el #11 del reporte.
const notFound = () => json(404, { error: 'not_found' });
const unprocessable = (errors) => json(422, { error: 'invalid', errors });

// Toda mutación devuelve el expediente COMPLETO, no solo lo que cambió.
// Es lo que le permite al panel reemplazar su copia local de un golpe con
// la versión del servidor, en vez de aplicar el cambio por su cuenta y
// esperar haber llegado al mismo resultado. Dos coordinadoras tocando la
// misma visita divergen a la primera si cada panel parchea lo suyo; con el
// registro entero, la última respuesta que llega es la verdad.
// La entidad concreta va aparte porque quien acaba de crearla necesita su
// id, y buscarlo dentro del registro sería adivinarlo.
const mutado = (status, res, llave) => json(status, { record: res.record, [llave]: res[llave] });

async function leerJson(request) {
  try {
    const body = await request.json();
    return { ok: true, body };
  } catch {
    // 400 y no 500: el cuerpo roto es de quien lo mandó, no del servidor.
    return { ok: false, response: json(400, { error: 'bad_json' }) };
  }
}

// Cada mutación es leer-modificar-escribir. Blobs no tiene comparar-y-fijar,
// así que dos coordinadoras escribiendo la MISMA visita en el mismo instante
// pueden perder un cambio: la segunda escritura pisa a la primera. Se anota
// aquí y no se resuelve: con dos o tres personas coordinando, la ventana es
// de milisegundos y el arreglo real (versionado optimista) pide un almacén
// que sepa hacerlo. Es la misma limitación que D54 anotó para el contador de
// intentos de login.
async function mutar(deps, visitId, fn) {
  const record = await deps.store.getVisit(visitId);
  if (!record) return notFound();

  const res = fn(record, { now: deps.now, by: deps.by, newId: deps.newId });
  if (res.notFound) return notFound();
  if (!res.ok) return unprocessable(res.errors);

  await deps.store.saveVisit(record);
  return { ...res, record };
}

// El token NO viaja en la lista. Sale al crear la visita y por la ruta de
// una visita concreta, que son los dos momentos en que de verdad hace falta
// para mandárselo al paciente. Una lista que los trae todos convierte
// cualquier fuga de esa respuesta —una captura de pantalla, un registro de
// proxy— en una fuga de todos los expedientes a la vez.
const sinToken = (visit) => {
  const { token, ...resto } = visit;
  return resto;
};

async function crearVisita(request, deps) {
  const leido = await leerJson(request);
  if (!leido.ok) return leido.response;

  // Se valida aquí, antes de llamar al store, porque store.createVisit lanza
  // con los nombres de los campos concatenados en un mensaje y esto necesita
  // los motivos POR CAMPO para que el formulario marque cuál corregir.
  const { ok, errors } = validateVisitInput(leido.body);
  if (!ok) return unprocessable(errors);

  const record = await deps.store.createVisit(leido.body, deps.now, deps.by);
  // Con token: es el único momento en que existe algo que mandarle al
  // paciente, y hasta hoy el router lo tiraba a la basura
  // (coordinatorApp.js:238). La Etapa E arma el QR a partir de esto.
  return json(201, { visit: record.visit });
}

async function listarVisitas(deps) {
  const records = await deps.store.listVisits();
  return json(200, {
    visits: records.map((r) => sinToken(r.visit)),
  });
}

async function verVisita(deps, visitId) {
  // Sin caducidad a propósito: getVisit no aplica R1. Lo que caduca es el
  // enlace del paciente, no el expediente — una visita de la semana pasada
  // sigue siendo de quien la capturó, para consultarla o corregirla.
  const record = await deps.store.getVisit(visitId);
  if (!record) return notFound();
  return json(200, record);
}

async function patchCita(request, deps, visitId, apptId) {
  const leido = await leerJson(request);
  if (!leido.ok) return leido.response;
  const body = leido.body ?? {};

  // Una acción desconocida es 422 y no un no-op silencioso: si un cliente
  // manda `action: 'borrar'` creyendo que borra, tiene que enterarse de que
  // no pasó nada.
  const acciones = {
    move: (r, ctx) => moveAppointment(r, apptId, body.startsAt, ctx),
    edit: (r, ctx) => editAppointment(r, apptId, body, ctx),
    cancel: (r, ctx) => cancelAppointment(r, apptId, ctx),
  };
  const accion = acciones[body.action];
  if (!accion) return unprocessable({ action: 'unsupported' });

  const res = await mutar(deps, visitId, accion);
  return res instanceof Response ? res : mutado(200, res, 'appointment');
}

async function patchPase(request, deps, visitId, passId) {
  const leido = await leerJson(request);
  if (!leido.ok) return leido.response;

  // Revocar es PATCH y no DELETE justamente porque no borra nada: un pase
  // emitido es historia de la visita. Un DELETE prometería otra cosa.
  if (leido.body?.action !== 'revoke') return unprocessable({ action: 'unsupported' });

  const res = await mutar(deps, visitId, (r, ctx) => revokeQpass(r, passId, ctx));
  return res instanceof Response ? res : mutado(200, res, 'qpass');
}

// Devuelve la respuesta ya hecha, o null si la ruta no es de este archivo.
async function rutear(request, deps, segmentos) {
  const [raiz, visitId, seccion, itemId] = segmentos;
  const { method } = request;

  if (raiz !== 'visits') return null;

  if (segmentos.length === 1) {
    if (method === 'GET') return listarVisitas(deps);
    if (method === 'POST') return crearVisita(request, deps);
    return json(405, { error: 'method_not_allowed' });
  }

  if (segmentos.length === 2) {
    if (method !== 'GET') return json(405, { error: 'method_not_allowed' });
    return verVisita(deps, visitId);
  }

  const conCuerpo = async (fn, status, llave) => {
    const leido = await leerJson(request);
    if (!leido.ok) return leido.response;
    const res = await mutar(deps, visitId, (r, ctx) => fn(r, leido.body, ctx));
    return res instanceof Response ? res : mutado(status, res, llave);
  };

  if (segmentos.length === 3) {
    if (seccion === 'appointments') {
      if (method !== 'POST') return json(405, { error: 'method_not_allowed' });
      return conCuerpo(addAppointment, 201, 'appointment');
    }
    if (seccion === 'lodging') {
      if (method !== 'PUT') return json(405, { error: 'method_not_allowed' });
      return conCuerpo(setLodging, 200, 'lodging');
    }
    if (seccion === 'passes') {
      if (method !== 'POST') return json(405, { error: 'method_not_allowed' });
      return conCuerpo(issueQpass, 201, 'qpass');
    }
    return null;
  }

  if (segmentos.length === 4) {
    if (method !== 'PATCH') return json(405, { error: 'method_not_allowed' });
    if (seccion === 'appointments') return patchCita(request, deps, visitId, itemId);
    if (seccion === 'passes') return patchPase(request, deps, visitId, itemId);
    return null;
  }

  return null;
}

export async function handleCoordinatorRequest(request, deps) {
  // El guardia PRIMERO, antes de mirar la ruta o el cuerpo. Si validara
  // antes, un 422 sobre una petición sin sesión ya habría dicho que la ruta
  // existe y qué campos espera — un mapa gratis de la API para quien no
  // debería tenerlo.
  const auth = await deps.requireCoordinator(request, deps);
  if (!auth.ok) return auth.response;

  try {
    const { pathname } = new URL(request.url);
    const segmentos = pathname.slice(COORDINATOR_PREFIX.length).split('/').filter(Boolean);

    // `by` sale de la cuenta autenticada y NUNCA del cuerpo. Si el cliente
    // pudiera mandarlo, las cuentas individuales de la Etapa C serían
    // decorativas: cualquiera firmaría con el nombre de cualquiera.
    const conFirma = { ...deps, by: auth.account.username };

    return (await rutear(request, conFirma, segmentos)) ?? notFound();
  } catch {
    // El detalle se queda del lado del servidor: un mensaje interno dice qué
    // almacén o qué variable falta, y eso no es asunto de quien pide.
    return json(500, { error: 'internal' });
  }
}
