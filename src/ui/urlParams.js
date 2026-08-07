// Etapa F (#17) — lectura de la query string, compartida por los dos
// puntos de entrada.
//
// `?now=` nació en la fase 05 dentro de src/ui/app.js: ancla el "ahora" a
// la fecha de las fixtures (todas de 2026) para poder recorrer el
// prototipo sin que cada cita se vea vencida. El panel de coordinación no
// lo tenía, y #/pass-preview —que reusa la misma pantalla del pase del
// paciente— aplicaba R3 contra el reloj real: el pase de una visita de
// marzo de 2026 se veía revocado siempre.
//
// Copiar la función al otro archivo habría bastado hoy y se habría
// separado mañana. Vive aquí por eso, y porque encerrada dentro de
// app.js no había forma de probarla: app.js necesita DOM.
//
// Lo que este módulo NO hace: leer el reloj real. Eso sigue siendo
// privilegio de los dos boot() (D20, y el encabezado de coordinatorApp.js
// para el segundo). Aquí solo se decide si lo que trae la URL es una
// fecha usable.

// parseNowOverride(search) -> string ISO tal cual venía | null
//
// Devuelve el TEXTO ORIGINAL, no un Date. Todo src/domain/ compara ISO
// contra ISO y el offset forma parte del dato: pasar por Date y volver a
// serializar convertiría '2026-03-10T10:00-07:00' en UTC y movería siete
// horas la hora que ve el paciente.
export function parseNowOverride(search) {
  const raw = new URLSearchParams(search).get('now');
  if (!raw) return null;
  // Un `now` que no se entiende se DESCARTA, no rompe: un enlace mal
  // pegado en WhatsApp no puede ser la diferencia entre ver el itinerario
  // y ver una pantalla en blanco.
  return Number.isNaN(new Date(raw).getTime()) ? null : raw;
}
