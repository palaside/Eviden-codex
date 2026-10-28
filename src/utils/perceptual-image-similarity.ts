export const DEFAULT_PHASH_MAX_DISTANCE = 8;
const HASH_SIZE = 8;
const SAMPLE_SIZE = 32;
const COSINE = Array.from({ length: HASH_SIZE }, (_, frequency) =>
  Array.from({ length: SAMPLE_SIZE }, (_, position) =>
    Math.cos(((2 * position + 1) * frequency * Math.PI) / (2 * SAMPLE_SIZE)),
  ),
);

export interface PerceptualHashRecord {
  id: string;
  hash: string | null;
}

export interface SimilarImagePair {
  leftId: string;
  rightId: string;
  distance: number;
}

export function perceptualHashFromGrayscale(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
): string {
  if (width !== SAMPLE_SIZE || height !== SAMPLE_SIZE || pixels.length !== width * height) {
    throw new Error("pHash expects a 32x32 grayscale image");
  }

  const coefficients: number[] = [];
  for (let v = 0; v < HASH_SIZE; v += 1) {
    for (let u = 0; u < HASH_SIZE; u += 1) {
      let sum = 0;
      for (let y = 0; y < SAMPLE_SIZE; y += 1) {
        const vertical = COSINE[v][y];
        for (let x = 0; x < SAMPLE_SIZE; x += 1) {
          sum += pixels[y * SAMPLE_SIZE + x]
            * COSINE[u][x]
            * vertical;
        }
      }
      coefficients.push(sum);
    }
  }

  const acCoefficients = coefficients.slice(1);
  const sorted = [...acCoefficients].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  let bits = "";
  coefficients.forEach((value) => {
    bits += value >= median ? "1" : "0";
  });
  return BigInt(`0b${bits}`).toString(16).padStart(16, "0");
}

export function hammingDistance64(leftHash: string, rightHash: string): number {
  if (!/^[0-9a-f]{16}$/i.test(leftHash) || !/^[0-9a-f]{16}$/i.test(rightHash)) {
    throw new Error("Expected two 64-bit hexadecimal perceptual hashes");
  }
  let xor = BigInt(`0x${leftHash}`) ^ BigInt(`0x${rightHash}`);
  let distance = 0;
  while (xor > BigInt(0)) {
    distance += Number(xor & BigInt(1));
    xor >>= BigInt(1);
  }
  return distance;
}

export function findSimilarImagePairs(
  records: PerceptualHashRecord[],
  maxDistance = DEFAULT_PHASH_MAX_DISTANCE,
): SimilarImagePair[] {
  const pairs: SimilarImagePair[] = [];
  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    const left = records[leftIndex];
    if (!left.hash || !/^[0-9a-f]{16}$/i.test(left.hash)) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
      const right = records[rightIndex];
      if (left.id === right.id || !right.hash || !/^[0-9a-f]{16}$/i.test(right.hash)) continue;
      const distance = hammingDistance64(left.hash, right.hash);
      if (distance <= maxDistance) pairs.push({ leftId: left.id, rightId: right.id, distance });
    }
  }
  return pairs;
}

export async function perceptualHashFromDataUrl(dataUrl: string): Promise<string> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D context unavailable");
  context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const grayscale = new Float32Array(SAMPLE_SIZE * SAMPLE_SIZE);
  for (let index = 0; index < grayscale.length; index += 1) {
    const offset = index * 4;
    grayscale[index] = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
  }
  return perceptualHashFromGrayscale(grayscale, SAMPLE_SIZE, SAMPLE_SIZE);
}
