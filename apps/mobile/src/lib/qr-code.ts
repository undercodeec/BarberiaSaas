const VERSION = 5;
const SIZE = VERSION * 4 + 17;
const DATA_CODEWORDS = 108;
const ERROR_CORRECTION_CODEWORDS = 26;
const MAX_BYTE_LENGTH = 106;

type Matrix = boolean[][];

function multiply(left: number, right: number): number {
  let result = 0;
  for (let index = 0; index < 8; index += 1) {
    result = (result << 1) ^ ((result >>> 7) * 0x11d);
    result ^= ((right >>> (7 - index)) & 1) * left;
  }
  return result;
}

function reedSolomonDivisor(degree: number): Uint8Array {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let index = 0; index < degree; index += 1) {
    for (let position = 0; position < result.length; position += 1) {
      result[position] = multiply(result[position]!, root);
      if (position + 1 < result.length)
        result[position] = result[position]! ^ result[position + 1]!;
    }
    root = multiply(root, 0x02);
  }
  return result;
}

function reedSolomonRemainder(
  data: Uint8Array,
  divisor: Uint8Array,
): Uint8Array {
  const result = new Uint8Array(divisor.length);
  for (const value of data) {
    const factor = value ^ result[0]!;
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let index = 0; index < result.length; index += 1)
      result[index] = result[index]! ^ multiply(divisor[index]!, factor);
  }
  return result;
}

function appendBits(bits: number[], value: number, length: number): void {
  for (let index = length - 1; index >= 0; index -= 1)
    bits.push((value >>> index) & 1);
}

function encodeData(value: string): Uint8Array | null {
  const bytes = new TextEncoder().encode(value);
  if (!bytes.length || bytes.length > MAX_BYTE_LENGTH) return null;
  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  for (const byte of bytes) appendBits(bits, byte, 8);
  appendBits(bits, 0, Math.min(4, DATA_CODEWORDS * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const data = Array.from({ length: bits.length / 8 }, (_, byteIndex) => {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1)
      byte = (byte << 1) | bits[byteIndex * 8 + bit]!;
    return byte;
  });
  for (let pad = 0; data.length < DATA_CODEWORDS; pad += 1)
    data.push(pad % 2 === 0 ? 0xec : 0x11);

  const dataCodewords = Uint8Array.from(data);
  const correction = reedSolomonRemainder(
    dataCodewords,
    reedSolomonDivisor(ERROR_CORRECTION_CODEWORDS),
  );
  return Uint8Array.from([...dataCodewords, ...correction]);
}

function createEmptyMatrix(): {
  readonly functionModules: Matrix;
  readonly modules: Matrix;
} {
  return {
    functionModules: Array.from({ length: SIZE }, () =>
      Array<boolean>(SIZE).fill(false),
    ),
    modules: Array.from({ length: SIZE }, () =>
      Array<boolean>(SIZE).fill(false),
    ),
  };
}

function setFunctionModule(
  modules: Matrix,
  functionModules: Matrix,
  x: number,
  y: number,
  dark: boolean,
): void {
  modules[y]![x] = dark;
  functionModules[y]![x] = true;
}

function drawFinderPattern(
  modules: Matrix,
  functionModules: Matrix,
  centerX: number,
  centerY: number,
): void {
  for (let offsetY = -4; offsetY <= 4; offsetY += 1) {
    for (let offsetX = -4; offsetX <= 4; offsetX += 1) {
      const x = centerX + offsetX;
      const y = centerY + offsetY;
      if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) continue;
      const distance = Math.max(Math.abs(offsetX), Math.abs(offsetY));
      setFunctionModule(
        modules,
        functionModules,
        x,
        y,
        distance !== 2 && distance !== 4,
      );
    }
  }
}

function drawAlignmentPattern(
  modules: Matrix,
  functionModules: Matrix,
  centerX: number,
  centerY: number,
): void {
  for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
    for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
      setFunctionModule(
        modules,
        functionModules,
        centerX + offsetX,
        centerY + offsetY,
        Math.max(Math.abs(offsetX), Math.abs(offsetY)) !== 1,
      );
    }
  }
}

function drawFormatBits(
  modules: Matrix,
  functionModules: Matrix,
  mask: number,
): void {
  const data = (1 << 3) | mask;
  let remainder = data;
  for (let index = 0; index < 10; index += 1)
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  const bits = ((data << 10) | remainder) ^ 0x5412;
  const bit = (index: number) => ((bits >>> index) & 1) !== 0;

  for (let index = 0; index <= 5; index += 1)
    setFunctionModule(modules, functionModules, 8, index, bit(index));
  setFunctionModule(modules, functionModules, 8, 7, bit(6));
  setFunctionModule(modules, functionModules, 8, 8, bit(7));
  setFunctionModule(modules, functionModules, 7, 8, bit(8));
  for (let index = 9; index < 15; index += 1)
    setFunctionModule(modules, functionModules, 14 - index, 8, bit(index));
  for (let index = 0; index < 8; index += 1)
    setFunctionModule(
      modules,
      functionModules,
      SIZE - 1 - index,
      8,
      bit(index),
    );
  for (let index = 8; index < 15; index += 1)
    setFunctionModule(
      modules,
      functionModules,
      8,
      SIZE - 15 + index,
      bit(index),
    );
  setFunctionModule(modules, functionModules, 8, SIZE - 8, true);
}

function drawFunctionPatterns(modules: Matrix, functionModules: Matrix): void {
  for (let index = 0; index < SIZE; index += 1) {
    setFunctionModule(modules, functionModules, 6, index, index % 2 === 0);
    setFunctionModule(modules, functionModules, index, 6, index % 2 === 0);
  }
  drawFinderPattern(modules, functionModules, 3, 3);
  drawFinderPattern(modules, functionModules, SIZE - 4, 3);
  drawFinderPattern(modules, functionModules, 3, SIZE - 4);
  drawAlignmentPattern(modules, functionModules, 30, 30);
  drawFormatBits(modules, functionModules, 0);
}

function drawCodewords(
  modules: Matrix,
  functionModules: Matrix,
  codewords: Uint8Array,
): void {
  let bitIndex = 0;
  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < SIZE; vertical += 1) {
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? SIZE - 1 - vertical : vertical;
      for (let column = 0; column < 2; column += 1) {
        const x = right - column;
        if (functionModules[y]![x]) continue;
        const dark =
          bitIndex < codewords.length * 8 &&
          ((codewords[bitIndex >>> 3]! >>> (7 - (bitIndex & 7))) & 1) !== 0;
        modules[y]![x] = (x + y) % 2 === 0 ? !dark : dark;
        bitIndex += 1;
      }
    }
  }
}

export function generateLocalQrMatrix(value: string): Matrix | null {
  const codewords = encodeData(value);
  if (!codewords) return null;
  const { functionModules, modules } = createEmptyMatrix();
  drawFunctionPatterns(modules, functionModules);
  drawCodewords(modules, functionModules, codewords);
  return modules;
}
