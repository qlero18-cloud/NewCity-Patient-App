// Etapa G — línea de tiempo unificada del itinerario (citas + traslados).
//
// El día del paciente no está hecho solo de citas: si contrató el traslado,
// el coche que lo recoge a las 06:00 es lo primero que le pasa, y tiene que
// salir arriba de la cita de las 08:00 y no en otra pantalla.
//
// Este módulo NO agrupa ni formatea: solo etiqueta y ordena. El agrupado lo
// sigue haciendo groupByDay, que ya era genérico (solo lee `startsAt` y
// dayKeyTijuana) y por eso no se tocó — sus pruebas siguen significando
// exactamente lo mismo que antes de esta etapa.
//
// Los cancelados NO se filtran aquí, igual que groupByDay nunca filtró las
// citas canceladas (PRD §9): un traslado cancelado tachado es información;
// que se esfume, no. Filtrar es decisión de quien pinta, no del dominio.

import { instantMs } from './time.js';

export function timelineItems(appointments, transfers) {
  const items = [
    ...(appointments ?? []).map((a) => ({ kind: 'appointment', startsAt: a.startsAt, entity: a })),
    ...(transfers ?? []).map((tr) => ({ kind: 'transfer', startsAt: tr.scheduledAt, entity: tr })),
  ];

  // Empate exacto de hora: primero la cita. Es a lo que el paciente tiene
  // que llegar; el traslado de esa misma hora es cómo llega o cómo se va.
  return items.sort((a, b) => {
    const diff = instantMs(a.startsAt) - instantMs(b.startsAt);
    if (diff !== 0) return diff;
    return a.kind === b.kind ? 0 : a.kind === 'appointment' ? -1 : 1;
  });
}

// El traslado que se anuncia en la tarjeta de Inicio (D71). Vive aquí y no
// en la pantalla por la misma razón que nextStep vive en el dominio: "cuál
// es el siguiente" es una regla, y una pantalla no puede probarse sin DOM.
//
// R2 no se toca: nextStep sigue siendo SOLO de citas, con sus ejemplos
// trabajados del PRD §8 intactos. Esto es su hermano para traslados, en su
// propia tarjeta.
//
// `now` entra como parámetro, nunca se lee el reloj (INV-1).
export function nextTransfer(transfers, now) {
  const nowMs = instantMs(now);

  // Cancelados fuera, al revés que en timelineItems. No es incoherencia: el
  // itinerario tiene que mostrar el traslado cancelado —tachado— para que
  // el paciente no se plante a esperarlo; anunciarlo en Inicio como "tu
  // próximo traslado" sería justo lo contrario.
  const candidatos = (transfers ?? []).filter(
    (tr) => tr.status !== 'cancelled' && instantMs(tr.scheduledAt) >= nowMs,
  );
  if (candidatos.length === 0) return null;

  // Desempate por id, como nextStep: dos repintados del mismo minuto tienen
  // que anunciar el mismo traslado, no uno u otro según el orden en que
  // vinieron del servidor.
  return candidatos.reduce((mejor, tr) => {
    const diff = instantMs(tr.scheduledAt) - instantMs(mejor.scheduledAt);
    if (diff < 0) return tr;
    if (diff > 0) return mejor;
    return tr.id < mejor.id ? tr : mejor;
  });
}
