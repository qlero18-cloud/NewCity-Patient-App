// Fase 06 — generador de Code128 (subset B) sin dependencias externas.
//
// Solo Code Set B: cubre ASCII imprimible 32–126 (`valor = código - 32`),
// que es todo lo que produce src/data/fixtures.js hoy (`payload-${id}`).
// A diferencia de qr.js (modo byte, acepta UTF-8 arbitrario), Code128 no
// tiene un "modo byte" universal — un payload con acentos simplemente no
// es representable en subset B y esta función lo rechaza con un mensaje
// claro en vez de corromperlo o transliterarlo por su cuenta.
//
// La tabla de 107 patrones de barras (CODES) y el algoritmo de checksum
// (start + Σ valor_i × posición_i, mod 103) se verificaron leyendo el
// código fuente de la librería de referencia python-barcode (MIT, PyPI)
// instalada en este entorno — no de memoria — y el símbolo resultante se
// decodificó con éxito con cv2.barcode_BarcodeDetector de OpenCV
// (independiente de este archivo y de esa librería) para varios textos.

const CODES = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100',
  '10001001100', '10011001000', '10011000100', '10001100100', '11001001000',
  '11001000100', '11000100100', '10110011100', '10011011100', '10011001110',
  '10111001100', '10011101100', '10011100110', '11001110010', '11001011100',
  '11001001110', '11011100100', '11001110100', '11101101110', '11101001100',
  '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000',
  '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
  '11000101000', '11000100010', '10110111000', '10110001110', '10001101110',
  '10111011000', '10111000110', '10001110110', '11101110110', '11010001110',
  '11000101110', '11011101000', '11011100010', '11011101110', '11101011000',
  '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100',
  '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
  '10110000100', '10011010000', '10011000010', '10000110100', '10000110010',
  '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
  '10100111100', '10010111100', '10010011110', '10111100100', '10011110100',
  '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110',
  '10111101000', '10111100010', '11110101000', '11110100010', '10111011110',
  '10111101110', '11101011110', '11110101110', '11010000100', '11010010000',
  '11010011100',
];
const STOP_PATTERN = '11000111010' + '11'; // patrón de paro + barra final ancha

const START_B = 104;
const MIN_CHAR = 32;
const MAX_CHAR = 126;

function charValueB(char) {
  const code = char.charCodeAt(0);
  if (code < MIN_CHAR || code > MAX_CHAR) {
    throw new Error(`code128: el carácter "${char}" (código ${code}) no está en el subset B (ASCII ${MIN_CHAR}–${MAX_CHAR})`);
  }
  return code - MIN_CHAR;
}

function encodedValues(text) {
  const values = [START_B];
  for (const char of text) values.push(charValueB(char));
  let checksum = values[0];
  for (let i = 1; i < values.length; i++) checksum += i * values[i];
  values.push(checksum % 103);
  return values;
}

// generateCode128Bars(text) -> string de '1'/'0' (ancho de barra=1 unidad
// por carácter), sin margen quieto. El renderer decide unidades por
// símbolo y margen.
export function generateCode128Bars(text) {
  const values = encodedValues(text);
  return values.map((v) => CODES[v]).join('') + STOP_PATTERN;
}

export function renderCode128Svg(text, { quietZone = 10, unitWidth = 2, height = 80 } = {}) {
  const bars = generateCode128Bars(text);
  const totalUnits = bars.length + quietZone * 2;
  const px = totalUnits * unitWidth;
  let rects = '';
  let x = quietZone * unitWidth;
  for (const bit of bars) {
    if (bit === '1') rects += `<rect x="${x}" y="0" width="${unitWidth}" height="${height}"/>`;
    x += unitWidth;
  }
  // Sin width/height explícitos en el <svg>: "auto" no es un valor válido
  // para el atributo SVG height (a diferencia de CSS) — el viewBox solo ya
  // alcanza para que escale, y el ancho/alto real lo pone el CSS del
  // contenedor (.nc-pass-symbol svg en src/ui/screens/pass.js).
  return `<svg viewBox="0 0 ${px} ${height}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><rect x="0" y="0" width="${px}" height="${height}" fill="#FFFFFF"/><g fill="#000000">${rects}</g></svg>`;
}

// decodeCode128Bars — SOLO para el redondeo de las pruebas de esta fase,
// igual que decodeQrMatrix en qr.js: no es un lector general (asume un
// símbolo bien formado, subset B puro, sin corrección de errores — Code128
// no la tiene, a diferencia de QR).
export function decodeCode128Bars(bars) {
  if (!bars.endsWith(STOP_PATTERN)) {
    throw new Error('code128 decode: no termina en el patrón de paro esperado');
  }
  const body = bars.slice(0, -STOP_PATTERN.length);
  if (body.length % 11 !== 0) {
    throw new Error('code128 decode: longitud de cuerpo no es múltiplo de 11');
  }
  const values = [];
  for (let i = 0; i < body.length; i += 11) {
    const chunk = body.slice(i, i + 11);
    const idx = CODES.indexOf(chunk);
    if (idx === -1) throw new Error(`code128 decode: patrón de 11 bits no reconocido en la posición ${i}`);
    values.push(idx);
  }
  if (values[0] !== START_B) throw new Error('code128 decode: no empieza con START B — este decodificador solo entiende subset B');
  const dataValues = values.slice(1, -1);
  const checksum = values[values.length - 1];
  let expected = values[0];
  for (let i = 0; i < dataValues.length; i++) expected += (i + 1) * dataValues[i];
  if (expected % 103 !== checksum) throw new Error('code128 decode: checksum no coincide');
  return dataValues.map((v) => String.fromCharCode(v + MIN_CHAR)).join('');
}

export const CODE128_CONFIG = { minChar: MIN_CHAR, maxChar: MAX_CHAR };
