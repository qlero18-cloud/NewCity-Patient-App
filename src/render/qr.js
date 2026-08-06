// Fase 06 — generador de QR sin dependencias externas (ISO/IEC 18004).
//
// ALCANCE DELIBERADAMENTE ACOTADO, no un generador general: Versión 3
// (29×29), nivel de corrección de errores M, modo byte, un solo bloque
// (sin entrelazado). PRD §15.7 no tiene todavía el formato real del
// payload del QPASS confirmado — en vez de construir las 40 versiones ×
// 4 niveles del spec completo sin saber qué hace falta de verdad,
// se acota a una configuración que cubre payloads cortos (hasta 42 bytes
// UTF-8) y se documenta el límite: un payload real más largo obliga a
// ampliar esto, no a que el generador falle en silencio (por eso
// generateQrMatrix lanza una excepción clara si no cabe, en vez de
// truncar o corromper el símbolo).
//
// Verificación real de este archivo (no solo que mi propio decodificador
// esté de acuerdo consigo mismo, que es una prueba débil — encoder y
// decoder comparten código, así que un error sistemático en los dos se
// disfraza de éxito): se instaló la librería de referencia
// nayuki/QR-Code-generator (MIT, PyPI: qrcodegen) y OpenCV, y se comparó
// byte a byte / módulo a módulo contra ella para la misma versión, nivel
// y máscara — 0 diferencias tras la corrección final — y por separado se
// decodificó el símbolo generado por ESTE archivo con QRCodeDetector de
// OpenCV (independiente de nayuki y de mi propio código) para varios
// textos, incluyendo no-ASCII y el largo máximo: los 6 casos coincidieron
// exactos. En el camino aparecieron y se corrigieron cuatro bugs reales
// que las pruebas de redondeo propias NUNCA habrían detectado por sí
// solas (compartían el mismo malentendido en encode y decode): el
// recorrido en zigzag de columnas, las dos copias de información de
// formato con fila/columna transpuestas, y — el más caro de encontrar —
// que `FORMAT_INFO_M` está indexado bit-más-significativo-primero (como
// lo publica thonky.com y como lo da mi propio cálculo de BCH) mientras
// que el algoritmo de referencia coloca los bits contando desde el menos
// significativo; bitAt() traduce entre las dos convenciones.
//
// Lo que esta verificación NO cubre: una prueba contra un lector físico
// real, que es justo lo que el archivo de esta fase exige antes de darla
// por terminada — un símbolo que decodifica bien en dos programas no
// garantiza que se lea bien desde la pantalla de un teléfono a brillo
// normal.

const GF_EXP = new Array(512);
const GF_LOG = new Array(256);
(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // x^8 + x^4 + x^3 + x^2 + 1
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

// Multiplica dos polinomios (coeficientes de mayor a menor grado) en GF(256).
function polyMulGf(a, b) {
  const result = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      result[i + j] ^= gfMul(a[i], b[j]);
    }
  }
  return result;
}

function rsGeneratorPoly(numEccCodewords) {
  let g = [1];
  for (let i = 0; i < numEccCodewords; i++) {
    g = polyMulGf(g, [1, GF_EXP[i]]);
  }
  return g;
}

// Codewords de corrección de error para un solo bloque de datos, vía
// división polinomial "sintética" (LFSR) — algoritmo estándar de
// libro de texto para codificar Reed-Solomon sistemático.
function rsComputeEcc(dataCodewords, numEccCodewords) {
  const generator = rsGeneratorPoly(numEccCodewords);
  const remainder = dataCodewords.concat(new Array(numEccCodewords).fill(0));
  for (let i = 0; i < dataCodewords.length; i++) {
    const factor = remainder[i];
    if (factor === 0) continue;
    for (let j = 0; j < generator.length; j++) {
      remainder[i + j] ^= gfMul(generator[j], factor);
    }
  }
  return remainder.slice(dataCodewords.length);
}

// --- Versión 3 / nivel M — constantes verificadas, ver comentario de cabecera ---
const SIZE = 29;
const DATA_CODEWORDS = 44;
const ECC_CODEWORDS = 26;
const MAX_BYTES = Math.floor((DATA_CODEWORDS * 8 - 4 - 8) / 8); // 4 bits modo + 8 bits contador (bytes, versión ≤9) — 42

// Strings de información de formato (15 bits, ya con BCH + máscara XOR
// aplicados) para nivel M, índice = patrón de máscara 0–7. Verificados por
// partida doble: coinciden con thonky.com/qr-code-tutorial/format-version-tables
// Y con un cálculo propio de BCH(15,5) (generador 0x537, máscara 0x5412).
const FORMAT_INFO_M = [
  '101010000010010',
  '101000100100101',
  '101111001111100',
  '101101101001011',
  '100010111111001',
  '100000011001110',
  '100111110010111',
  '100101010100000',
];

// Posiciones del patrón de alineación — fórmula de
// nayuki/QR-Code-generator (getAlignmentPatternPositions), no una tabla
// copiada a mano. Para versión 3 da [6, 22]; se excluyen las
// combinaciones que caen sobre un patrón buscador, dejando un único
// patrón de alineación en (22, 22).
function alignmentPatternCenters(version) {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const size = 17 + version * 4;
  const step = Math.floor((version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
  const positions = [6];
  for (let pos = size - 7; positions.length < numAlign; pos -= step) {
    positions.splice(1, 0, pos);
  }
  return positions;
}

function isNearFinder(r, c) {
  const inTopLeft = r < 9 && c < 9;
  const inTopRight = r < 9 && c >= SIZE - 8;
  const inBottomLeft = r >= SIZE - 8 && c < 9;
  return inTopLeft || inTopRight || inBottomLeft;
}

function createGrid(fill) {
  return Array.from({ length: SIZE }, () => new Array(SIZE).fill(fill));
}

function stampFinderPattern(modules, reserved, topRow, leftCol) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = topRow + r;
      const cc = leftCol + c;
      if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) continue;
      reserved[rr][cc] = true;
      if (r < 0 || r > 6 || c < 0 || c > 6) {
        modules[rr][cc] = false; // separador
      } else {
        const onRing = r === 0 || r === 6 || c === 0 || c === 6;
        const onCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        modules[rr][cc] = onRing || onCore;
      }
    }
  }
}

function stampAlignmentPattern(modules, reserved, centerRow, centerCol) {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const rr = centerRow + r;
      const cc = centerCol + c;
      reserved[rr][cc] = true;
      const onRing = r === -2 || r === 2 || c === -2 || c === 2;
      modules[rr][cc] = onRing || (r === 0 && c === 0);
    }
  }
}

function buildFunctionPatterns() {
  const modules = createGrid(false);
  const reserved = createGrid(false);

  stampFinderPattern(modules, reserved, 0, 0);
  stampFinderPattern(modules, reserved, 0, SIZE - 7);
  stampFinderPattern(modules, reserved, SIZE - 7, 0);

  // Patrón de temporización (timing): fila 6 y columna 6, alternando,
  // entre los separadores de los tres buscadores.
  for (let i = 8; i < SIZE - 8; i++) {
    modules[6][i] = i % 2 === 0;
    reserved[6][i] = true;
    modules[i][6] = i % 2 === 0;
    reserved[i][6] = true;
  }

  const centers = alignmentPatternCenters(3);
  for (const cr of centers) {
    for (const cc of centers) {
      if (isNearFinder(cr, cc)) continue;
      stampAlignmentPattern(modules, reserved, cr, cc);
    }
  }

  // Módulo oscuro fijo, versión V: (4V+9, 8) en (fila, columna).
  modules[4 * 3 + 9][8] = true;
  reserved[4 * 3 + 9][8] = true;

  // Áreas reservadas para información de formato (se rellenan después de
  // elegir máscara): franjas junto a los tres buscadores. Deben calzar
  // EXACTO con dónde escribe stampFormatInfo — de ahí el error real que
  // tuvo esta fase: un `i <= 8` simétrico para las cuatro franjas parecía
  // razonable pero reservaba una celda de más en cada una de las dos
  // mitades de la segunda copia (columna 8 fila 8, y fila 8 columna 20),
  // celdas que en realidad le tocaban a los datos — verificado generando
  // 12 símbolos con codewords aleatorios vía la librería de referencia de
  // nayuki y viendo cuáles celdas nunca cambiaban.
  for (let i = 0; i <= 8; i++) {
    reserved[8][i] = true; // copia 1, primera mitad: fila 8, columnas 0–8
    reserved[i][8] = true; // copia 1, segunda mitad: columna 8, filas 0–8
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][SIZE - 1 - i] = true; // copia 2, primera mitad: fila 8, columnas 21–28
  }
  for (let i = 8; i < 15; i++) {
    reserved[SIZE - 15 + i][8] = true; // copia 2, segunda mitad: columna 8, filas 22–28
  }

  return { modules, reserved };
}

// FORMAT_INFO_M[m][0] es el bit MÁS significativo (así se publican en
// thonky.com y así los devuelve mi propio cálculo de BCH). El algoritmo de
// referencia (nayuki) coloca los bits con `(valor >> i) & 1` — es decir,
// i=0 es el bit MENOS significativo. bitAt(bits, i) traduce entre las dos
// convenciones; usarla en vez de `bits[i]` directo en todo este archivo es
// justo lo que faltaba — confirmado leyendo el algoritmo verbatim con
// marcadores de índice en vez de booleanos (no hay forma de que ese
// resultado sea ambiguo) y viéndolo coincidir bit a bit contra
// FORMAT_INFO_M solo después de invertir el índice.
function bitAt(bits, i) {
  return bits[14 - i] === '1';
}

function stampFormatInfo(modules, maskPattern) {
  const bits = FORMAT_INFO_M[maskPattern];
  // Copia 1 — envuelve la esquina del buscador superior izquierdo: baja
  // por la columna 8 (bits 0–5, filas 0–5), gira en (7,8)/(8,8) [bits
  // 6–7], gira otra vez en (8,7) [bit 8] y cruza la fila 8 hacia la
  // izquierda (bits 9–14, columnas 5..0).
  for (let i = 0; i < 6; i++) modules[i][8] = bitAt(bits, i);
  modules[7][8] = bitAt(bits, 6);
  modules[8][8] = bitAt(bits, 7);
  modules[8][7] = bitAt(bits, 8);
  for (let i = 9; i < 15; i++) modules[8][14 - i] = bitAt(bits, i);

  // Copia 2: fila 8 cerca del buscador superior derecho (bits 0–7,
  // columnas 28..21), luego columna 8 cerca del buscador inferior
  // izquierdo (bits 8–14, filas 22..28).
  for (let i = 0; i < 8; i++) modules[8][SIZE - 1 - i] = bitAt(bits, i);
  for (let i = 8; i < 15; i++) modules[SIZE - 15 + i][8] = bitAt(bits, i);
}

function encodeDataCodewords(bytes) {
  if (bytes.length > MAX_BYTES) {
    throw new Error(`qr: el payload mide ${bytes.length} bytes UTF-8, el máximo para esta configuración (versión 3, nivel M, modo byte) es ${MAX_BYTES}`);
  }
  const bits = [];
  const pushBits = (value, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };
  pushBits(0b0100, 4); // indicador de modo: byte
  pushBits(bytes.length, 8); // contador de caracteres, 8 bits (versión ≤9, modo byte)
  for (const b of bytes) pushBits(b, 8);

  const capacityBits = DATA_CODEWORDS * 8;
  for (let i = 0; i < 4 && bits.length < capacityBits; i++) bits.push(0); // terminador, hasta 4 ceros
  while (bits.length % 8 !== 0) bits.push(0); // relleno a byte completo

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  const pads = [0xec, 0x11];
  let padIndex = 0;
  while (codewords.length < DATA_CODEWORDS) {
    codewords.push(pads[padIndex % 2]);
    padIndex++;
  }
  return codewords;
}

// Recorre las columnas de derecha a izquierda en pares, de abajo hacia
// arriba y luego de arriba hacia abajo alternando, saltando la columna de
// temporización (6) sin perder ni duplicar ninguna otra. Antes esto se
// resolvía sustituyendo col=5 solo en la iteración de colPair=6 sin
// arrastrar el ajuste a las iteraciones siguientes: la columna 4 quedaba
// escrita dos veces y la columna 0 nunca se tocaba. Verificado con
// OpenCV (QRCodeDetector, fuera de este proyecto) contra el bug original:
// ubicaba el símbolo (los patrones buscadores estaban bien) pero no podía
// decodificar el contenido — exactamente el síntoma de un mapeo de bits
// de datos incorrecto. Con el puntero `right` mutable y arrastrado entre
// iteraciones, las 28 columnas de datos (todas menos la 6) se visitan
// una vez cada una.
function walkColumnPairs(callback) {
  let upward = true;
  let right = SIZE - 1;
  while (right >= 1) {
    if (right === 6) right = 5;
    for (let step = 0; step < SIZE; step++) {
      const row = upward ? SIZE - 1 - step : step;
      callback(row, right);
      callback(row, right - 1);
    }
    upward = !upward;
    right -= 2;
  }
}

function placeDataBits(modules, reserved, allCodewords) {
  const bits = [];
  for (const byte of allCodewords) {
    for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  }
  let bitIndex = 0;
  walkColumnPairs((row, c) => {
    if (reserved[row][c]) return;
    const bit = bitIndex < bits.length ? bits[bitIndex] : 0;
    modules[row][c] = bit === 1;
    bitIndex++;
  });
  return modules;
}

function applyMask(modules, reserved, maskPattern) {
  const maskFn = MASK_FUNCTIONS[maskPattern];
  const out = createGrid(false);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const bit = modules[r][c];
      out[r][c] = reserved[r][c] ? bit : bit !== maskFn(r, c);
    }
  }
  return out;
}

const MASK_FUNCTIONS = [
  (r, c) => (r + c) % 2 === 0,
  (r, c) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

// Puntuación de penalización (ISO/IEC 18004 §8.8.2), las 4 reglas
// estándar — más bajo es mejor. Se usa para elegir, de las 8 máscaras
// posibles, la que produce el símbolo más "parejo" (mejor fiabilidad de
// lectura real, aunque cualquiera de las 8 sea técnicamente decodificable).
function maskPenalty(modules) {
  let penalty = 0;

  // Regla 1: 5+ módulos iguales seguidos, por fila y por columna.
  for (let r = 0; r < SIZE; r++) {
    penalty += runPenalty(Array.from({ length: SIZE }, (_, c) => modules[r][c]));
  }
  for (let c = 0; c < SIZE; c++) {
    penalty += runPenalty(Array.from({ length: SIZE }, (_, r) => modules[r][c]));
  }

  // Regla 2: bloques 2×2 del mismo color.
  for (let r = 0; r < SIZE - 1; r++) {
    for (let c = 0; c < SIZE - 1; c++) {
      const v = modules[r][c];
      if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) {
        penalty += 3;
      }
    }
  }

  // Regla 3: patrón 1:1:3:1:1 (como un buscador) con margen de 4 claros.
  const finderLike = [true, false, true, true, true, false, true, false, false, false, false];
  const finderLikeRev = [...finderLike].reverse();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c <= SIZE - 11; c++) {
      const window = Array.from({ length: 11 }, (_, i) => modules[r][c + i]);
      if (arraysEqual(window, finderLike) || arraysEqual(window, finderLikeRev)) penalty += 40;
    }
  }
  for (let c = 0; c < SIZE; c++) {
    for (let r = 0; r <= SIZE - 11; r++) {
      const window = Array.from({ length: 11 }, (_, i) => modules[r + i][c]);
      if (arraysEqual(window, finderLike) || arraysEqual(window, finderLikeRev)) penalty += 40;
    }
  }

  // Regla 4: qué tan lejos del 50% está la proporción de módulos oscuros.
  let dark = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (modules[r][c]) dark++;
  const percent = (dark * 100) / (SIZE * SIZE);
  penalty += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return penalty;
}

function runPenalty(line) {
  let penalty = 0;
  let runLen = 1;
  for (let i = 1; i < line.length; i++) {
    if (line[i] === line[i - 1]) {
      runLen++;
    } else {
      if (runLen >= 5) penalty += runLen - 2;
      runLen = 1;
    }
  }
  if (runLen >= 5) penalty += runLen - 2;
  return penalty;
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function utf8Bytes(text) {
  return Array.from(new TextEncoder().encode(text));
}

// generateQrMatrix(text) -> { size: 29, modules: boolean[29][29] }
// modules[row][col] === true significa módulo oscuro.
export function generateQrMatrix(text) {
  const bytes = utf8Bytes(text);
  const dataCodewords = encodeDataCodewords(bytes);
  const eccCodewords = rsComputeEcc(dataCodewords, ECC_CODEWORDS);
  const allCodewords = dataCodewords.concat(eccCodewords);

  const { modules: base, reserved } = buildFunctionPatterns();
  const withData = placeDataBits(base, reserved, allCodewords);

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const masked = applyMask(withData, reserved, mask);
    stampFormatInfo(masked, mask);
    const penalty = maskPenalty(masked);
    if (best === null || penalty < best.penalty) best = { mask, modules: masked, penalty };
  }

  return { size: SIZE, modules: best.modules, maskPattern: best.mask };
}

export function renderQrSvg(matrix, { quietZone = 4, moduleSize = 8 } = {}) {
  const total = matrix.size + quietZone * 2;
  const px = total * moduleSize;
  let rects = '';
  for (let r = 0; r < matrix.size; r++) {
    for (let c = 0; c < matrix.size; c++) {
      if (!matrix.modules[r][c]) continue;
      const x = (c + quietZone) * moduleSize;
      const y = (r + quietZone) * moduleSize;
      rects += `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}"/>`;
    }
  }
  return `<svg viewBox="0 0 ${px} ${px}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><rect x="0" y="0" width="${px}" height="${px}" fill="#FFFFFF"/><g fill="#000000">${rects}</g></svg>`;
}

// --- decodeQrMatrix — SOLO para probar el redondeo encode→decode en las
// pruebas de esta fase (test/render/qr.test.js). No es un lector general:
// no corrige errores (no usa los codewords EC para reparar nada), asume
// exactamente la versión 3 / nivel M / modo byte que este archivo genera.
// Un lector real de verdad es justo lo que la fase deja para la prueba
// física con lectora, no algo que este archivo deba reemplazar.
export function decodeQrMatrix(matrix) {
  const maskPattern = detectMaskPattern(matrix);
  const { reserved } = buildFunctionPatterns();
  const maskFn = MASK_FUNCTIONS[maskPattern];
  const unmasked = createGrid(false);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      unmasked[r][c] = reserved[r][c] ? matrix.modules[r][c] : matrix.modules[r][c] !== maskFn(r, c);
    }
  }
  const bits = readDataBits(unmasked, reserved);
  const codewordsBits = bits.slice(0, DATA_CODEWORDS * 8);
  const dataCodewords = [];
  for (let i = 0; i < codewordsBits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | codewordsBits[i + j];
    dataCodewords.push(byte);
  }
  const mode = dataCodewords[0] >> 4;
  if (mode !== 0b0100) throw new Error(`qr decode: modo inesperado ${mode.toString(2)}, este decodificador solo entiende modo byte`);
  const length = ((dataCodewords[0] & 0x0f) << 4) | (dataCodewords[1] >> 4);
  const outBytes = [];
  for (let i = 0; i < length; i++) {
    const hi = dataCodewords[1 + i] & 0x0f;
    const lo = dataCodewords[2 + i] >> 4;
    outBytes.push((hi << 4) | lo);
  }
  return new TextDecoder().decode(new Uint8Array(outBytes));
}

function detectMaskPattern(matrix) {
  // Se lee por posición (i=0..14, igual que stampFormatInfo escribe) y
  // luego se arma el string en el orden MSB-primero de FORMAT_INFO_M
  // (byI[14] primero) — el mismo giro de índice que bitAt(), en la
  // dirección contraria.
  const byI = new Array(15);
  for (let i = 0; i < 6; i++) byI[i] = matrix.modules[i][8] ? '1' : '0';
  byI[6] = matrix.modules[7][8] ? '1' : '0';
  byI[7] = matrix.modules[8][8] ? '1' : '0';
  byI[8] = matrix.modules[8][7] ? '1' : '0';
  for (let i = 9; i < 15; i++) byI[i] = matrix.modules[8][14 - i] ? '1' : '0';
  const str = byI.slice().reverse().join('');
  const idx = FORMAT_INFO_M.indexOf(str);
  if (idx === -1) throw new Error('qr decode: información de formato no reconocida (¿matriz corrupta o de otra versión/nivel?)');
  return idx;
}

function readDataBits(modules, reserved) {
  const bits = [];
  walkColumnPairs((row, c) => {
    if (reserved[row][c]) return;
    bits.push(modules[row][c] ? 1 : 0);
  });
  return bits;
}

export const QR_CONFIG = { size: SIZE, dataCodewords: DATA_CODEWORDS, eccCodewords: ECC_CODEWORDS, maxBytes: MAX_BYTES };
