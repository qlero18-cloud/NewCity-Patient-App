// Redes de Wi-Fi del complejo, del documento de información general del
// hospital (D98). Dato nuevo en la Etapa K: hasta aquí no había ninguna
// mención de wifi en todo src/.
//
// Archivo propio y no dentro de src/data/locations.js porque una red no es
// una ubicación a la que se pueda caminar: no tiene piso al que subir ni
// punto en el mapa, y "FREE WIFI NewCity Plaza" cubre la plaza entera, que
// ni siquiera es una de las 13 ubicaciones. Misma forma que plaza.js:
// contenido real, plano, sin lógica.
//
// La contraseña se guarda tal cual, en claro. Es la contraseña de invitados
// que el hospital reparte impresa a quien entra — no es un secreto, y
// tratarla como tal (variable de entorno, backend) solo la volvería
// imposible de mostrar en la pantalla que existe justamente para eso.
//
// `password: ''` en la red de la plaza significa ABIERTA, no "no sabemos":
// se distingue a propósito de undefined para que la pantalla pueda decir
// "sin contraseña" en vez de dejar el renglón en blanco.

export const wifiNetworks = [
  {
    id: 'piso27',
    where: { es: 'Torre Médica · Consultorios', en: 'Medical Tower · Consultation Offices' },
    ssid: 'Invitados NCH',
    password: 'bienvenidos',
  },
  {
    id: 'compass',
    where: { es: 'Compass · Laboratorio e imagenología', en: 'Compass · Lab & Imaging' },
    ssid: 'Invitados Compass',
    password: 'bienvenidos',
  },
  {
    id: 'plaza',
    where: { es: 'Plaza NewCity', en: 'NewCity Plaza' },
    ssid: 'FREE WIFI NewCity Plaza',
    password: '',
  },
];
