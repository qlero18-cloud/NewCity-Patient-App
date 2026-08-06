// Canal de soporte (PRD §7 SupportChannel). El único dato real disponible
// es un número sacado de los flyers del cliente: (619) 324.3116. El PRD
// §15.5 deja explícito que no se sabe cuál número es WhatsApp y cuál
// Google Voice — puede incluso ser el mismo número para ambos roles.
//
// Se usa ese número real en los dos campos en vez de inventar un segundo
// número que no existe. `unconfirmed: true` cubre tanto esa ambigüedad de
// rol como el horario de coordinación, que tampoco está confirmado
// (PRD §15.4).

export const supportChannel = {
  whatsappNumber: '+16193243116',
  voiceNumber: '+16193243116',
  hours: {
    tz: 'America/Tijuana',
    weekly: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '07:00', close: '20:00' })),
    exceptions: [],
    unconfirmed: true,
  },
  unconfirmed: true,
};
