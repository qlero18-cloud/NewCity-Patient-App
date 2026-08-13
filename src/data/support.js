// Canal de soporte (PRD §7 SupportChannel).
//
// Hasta la Etapa K aquí no había dato real: los dos campos llevaban el
// mismo número sacado de los flyers, (619) 324.3116, porque PRD §15.5 no
// decía cuál rol tenía cada uno, y el horario era relleno inventado
// (7 días, 07:00–20:00) marcado unconfirmed por PRD §15.4.
//
// D95 — El documento de información general del hospital resuelve los dos
// puntos, y de paso descubre un error que estaba en vivo: el número de
// Estados Unidos es de LLAMADAS Y TEXTO, y el de WhatsApp es el de México.
// `whatsappNumber` apuntaba al de Estados Unidos, así que el botón
// "Escribir por WhatsApp" del paciente llevaba a un número que no contesta
// WhatsApp.
//
// D96 — El horario también sale de ese documento: Case Management abre de
// lunes a viernes de 8:00 a 18:00 y el sábado hasta la 13:30. El DOMINGO
// CERRADO se representa OMITIENDO el día del arreglo `weekly`, no con un
// rango de cero: isOpenNow (src/domain/time.js) ya devuelve false para un
// día que no está en la lista, y formatWeeklyHours lo escribe como
// "Domingo · cerrado". Un rango vacío tendría que interpretarse en los dos
// lugares y no significaría nada más.
//
// Con documento que los respalda, se quita `unconfirmed` de los dos
// niveles: el paciente ya no ve [POR CONFIRMAR] en un dato que sí está
// confirmado. Los pisos de consultorios NO los cubre el documento y siguen
// con su horario de relleno y su distintivo (src/data/locations.js).

export const supportChannel = {
  // México — el documento lo rotula "Llamadas y WhatsApp".
  whatsappNumber: '+526631115360',
  // Estados Unidos — el documento lo rotula "Calls & text", no WhatsApp.
  voiceNumber: '+16193243116',
  email: 'info@newcityhospital.com',
  hours: {
    tz: 'America/Tijuana',
    weekly: [
      ...[1, 2, 3, 4, 5].map((day) => ({ day, open: '08:00', close: '18:00' })),
      { day: 6, open: '08:00', close: '13:30' },
      // day 0 (domingo) ausente a propósito: ver D96 arriba.
    ],
    exceptions: [],
  },
};
