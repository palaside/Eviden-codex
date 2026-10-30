import { createHash } from "node:crypto";
import { createArtifactRecord, evaluateDetectionGate } from "./dual-stream-enhancement.mjs";
import { bilateralDenoiseOcrPixels } from "./enhance-for-ocr.mjs";

const CROP_VARIANTS = [
  { id: "crop-upscale-2x", operation: "upscale", scale: 2, engine: "bilinear-rgba" },
  { id: "crop-upscale-4x", operation: "upscale", scale: 4, engine: "bilinear-rgba" },
  { id: "crop-clahe", operation: "clahe", engine: "tile-clahe" },
  { id: "crop-denoise", operation: "denoise", engine: "bilateralDenoiseOcrPixels" },
  { id: "crop-sharpen", operation: "sharpen", engine: "unsharp-mask" },
  { id: "crop-grayscale", operation: "grayscale", engine: "luminance-rgb" },
];
const HASH_RE = /^[a-f\d]{64}$/iu;
const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));
const luminanceAt = (pixels, index) => {
  const offset = index * 4;
  return 0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2];
};

function assertImageSize(width, height) {
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    throw new TypeError("source width and height must be positive safe integers");
  }
}

function copyBytes(value, label) {
  if (value instanceof Uint8Array) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new TypeError(`${label} must be a Uint8Array or ArrayBuffer`);
}

function normalizeBbox(detection, index) {
  const bbox = detection?.bbox;
  if (!bbox || typeof bbox !== "object" || Array.isArray(bbox)) {
    throw new TypeError(`detection ${index + 1} requires bbox provenance`);
  }
  const { x, y, width, height } = bbox;
  if (![x, y, width, height].every(Number.isFinite)) {
    throw new TypeError(`detection ${index + 1} bbox values must be finite`);
  }
  if (x < 0 || y < 0) throw new RangeError(`detection ${index + 1} bbox origins must be non-negative`);
  if (width <= 0 || height <= 0) throw new RangeError(`detection ${index + 1} bbox must have positive area`);
  const confidence = detection.confidence ?? null;
  if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
    throw new RangeError(`detection ${index + 1} confidence must be between 0 and 1`);
  }
  return { bbox: { x, y, width, height }, confidence, inputIndex: index };
}

export function normalizeDetections({ detections, imageWidth, imageHeight }) {
  assertImageSize(imageWidth, imageHeight);
  if (!Array.isArray(detections)) throw new TypeError("detections must be an array");
  return detections
    .map(normalizeBbox)
    .sort((left, right) => left.bbox.y - right.bbox.y
      || left.bbox.x - right.bbox.x
      || left.inputIndex - right.inputIndex)
    .map(({ bbox, confidence }, index) => ({ index: index + 1, bbox: { ...bbox }, confidence }));
}

function cropRgba(pixels, imageWidth, imageHeight, bbox) {
  // Keep the original bbox for provenance. Clip only the array access rectangle.
  const x0 = Math.max(0, Math.floor(bbox.x));
  const y0 = Math.max(0, Math.floor(bbox.y));
  const x1 = Math.min(imageWidth, Math.ceil(bbox.x + bbox.width));
  const y1 = Math.min(imageHeight, Math.ceil(bbox.y + bbox.height));
  const width = x1 - x0;
  const height = y1 - y0;
  if (width <= 0 || height <= 0) throw new RangeError("bbox produces an empty or zero-area crop after clipping");
  const output = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceStart = ((y0 + y) * imageWidth + x0) * 4;
    output.set(pixels.subarray(sourceStart, sourceStart + width * 4), y * width * 4);
  }
  return { pixels: output, width, height };
}

function scaleBilinear(pixels, width, height, scale) {
  const outWidth = width * scale;
  const outHeight = height * scale;
  if (!Number.isSafeInteger(outWidth) || !Number.isSafeInteger(outHeight)
    || outWidth * outHeight > 64_000_000) throw new RangeError("scaled crop exceeds safe pixel limit");
  const output = new Uint8ClampedArray(outWidth * outHeight * 4);
  for (let y = 0; y < outHeight; y += 1) {
    const sy = (y + 0.5) / scale - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(height - 1, y0 + 1);
    const fy = Math.max(0, sy - y0);
    for (let x = 0; x < outWidth; x += 1) {
      const sx = (x + 0.5) / scale - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(width - 1, x0 + 1);
      const fx = Math.max(0, sx - x0);
      const target = (y * outWidth + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const top = pixels[(y0 * width + x0) * 4 + channel] * (1 - fx)
          + pixels[(y0 * width + x1) * 4 + channel] * fx;
        const bottom = pixels[(y1 * width + x0) * 4 + channel] * (1 - fx)
          + pixels[(y1 * width + x1) * 4 + channel] * fx;
        output[target + channel] = clampByte(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return { pixels: output, width: outWidth, height: outHeight };
}

function clahe(pixels, width, height) {
  const tileSize = 32;
  const columns = Math.ceil(width / tileSize);
  const rows = Math.ceil(height / tileSize);
  const luts = [];
  for (let tileY = 0; tileY < rows; tileY += 1) for (let tileX = 0; tileX < columns; tileX += 1) {
    const x0 = tileX * tileSize;
    const y0 = tileY * tileSize;
    const x1 = Math.min(width, x0 + tileSize);
    const y1 = Math.min(height, y0 + tileSize);
    const area = (x1 - x0) * (y1 - y0);
    const histogram = new Uint32Array(256);
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
      histogram[clampByte(luminanceAt(pixels, y * width + x))] += 1;
    }
    const clipLimit = Math.max(1, Math.floor(area * 3 / 256));
    let excess = 0;
    for (let value = 0; value < 256; value += 1) {
      if (histogram[value] > clipLimit) {
        excess += histogram[value] - clipLimit;
        histogram[value] = clipLimit;
      }
    }
    const each = Math.floor(excess / 256);
    for (let value = 0; value < 256; value += 1) histogram[value] += each + (value < excess % 256 ? 1 : 0);
    const first = histogram.find((count) => count > 0) ?? 0;
    let cumulative = 0;
    const lut = new Uint8Array(256);
    for (let value = 0; value < 256; value += 1) {
      cumulative += histogram[value];
      lut[value] = clampByte(255 * Math.max(0, cumulative - first) / Math.max(1, area - first));
    }
    luts.push(lut);
  }
  const output = new Uint8ClampedArray(pixels);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const tileX = Math.min(columns - 1, Math.floor(x / tileSize));
    const tileY = Math.min(rows - 1, Math.floor(y / tileSize));
    const index = y * width + x;
    const originalLum = clampByte(luminanceAt(pixels, index));
    const delta = luts[tileY * columns + tileX][originalLum] - originalLum;
    const offset = index * 4;
    for (let channel = 0; channel < 3; channel += 1) output[offset + channel] = clampByte(pixels[offset + channel] + delta * 0.65);
  }
  return { pixels: output, width, height };
}

function denoise(pixels, width, height) {
  const luminance = Uint8Array.from({ length: width * height }, (_, index) => clampByte(luminanceAt(pixels, index)));
  const cleaned = bilateralDenoiseOcrPixels(luminance, width, height);
  const output = new Uint8ClampedArray(pixels);
  for (let index = 0; index < cleaned.length; index += 1) {
    const delta = cleaned[index] - luminance[index];
    const offset = index * 4;
    for (let channel = 0; channel < 3; channel += 1) output[offset + channel] = clampByte(pixels[offset + channel] + delta);
  }
  return { pixels: output, width, height };
}

function sharpen(pixels, width, height) {
  const output = new Uint8ClampedArray(pixels);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = y * width + x;
    let sum = 0;
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const sx = Math.max(0, Math.min(width - 1, x + dx));
      const sy = Math.max(0, Math.min(height - 1, y + dy));
      sum += luminanceAt(pixels, sy * width + sx);
    }
    const delta = (luminanceAt(pixels, index) - sum / 9) * 0.8;
    const offset = index * 4;
    for (let channel = 0; channel < 3; channel += 1) output[offset + channel] = clampByte(pixels[offset + channel] + delta);
  }
  return { pixels: output, width, height };
}

function grayscale(pixels, width, height) {
  const output = new Uint8ClampedArray(pixels);
  for (let index = 0; index < width * height; index += 1) {
    const gray = clampByte(luminanceAt(pixels, index));
    output.set([gray, gray, gray], index * 4);
  }
  return { pixels: output, width, height };
}

function transformCrop(crop, variant) {
  if (variant.operation === "upscale") return scaleBilinear(crop.pixels, crop.width, crop.height, variant.scale);
  if (variant.operation === "clahe") return clahe(crop.pixels, crop.width, crop.height);
  if (variant.operation === "denoise") return denoise(crop.pixels, crop.width, crop.height);
  if (variant.operation === "sharpen") return sharpen(crop.pixels, crop.width, crop.height);
  return grayscale(crop.pixels, crop.width, crop.height);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

async function encodePng(pixels, width, height) {
  if (typeof CompressionStream !== "function") throw new Error("PNG encoding requires CompressionStream support");
  const stride = width * 4;
  const scanlines = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) scanlines.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const compressed = new Uint8Array(await new Response(new Blob([scanlines]).stream()
    .pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  const parts = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header), pngChunk("IDAT", compressed), pngChunk("IEND", new Uint8Array()),
  ];
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { png.set(part, offset); offset += part.length; }
  return png;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function metadataEqual(actual, expected) {
  if (Object.is(actual, expected)) return true;
  if (!actual || !expected || typeof actual !== "object" || typeof expected !== "object") return false;
  if (Array.isArray(actual) !== Array.isArray(expected)) return false;
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index] && metadataEqual(actual[key], expected[key]));
}

async function writeArtifact({ artifactWriter, bytes, artifactName, metadata }) {
  const expected = createArtifactRecord(metadata);
  const record = await artifactWriter({ bytes: new Uint8Array(bytes), artifactName, metadata: structuredClone(expected) });
  if (!record || typeof record !== "object") throw new TypeError(`artifactWriter returned no record for ${artifactName}`);
  const required = ["sourceFileName", "sourceSha256", "artifactPath", "artifactSha256", "stream", "artifactType", "parentArtifact", "bbox", "dimensions", "transform", "reviewOnly"];
  const missing = required.filter((field) => !Object.hasOwn(record, field));
  if (missing.length) throw new TypeError(`artifactWriter returned incomplete provenance for ${artifactName}: ${missing.join(", ")}`);
  for (const field of required) {
    if (!metadataEqual(record[field], expected[field])) throw new Error(`artifactWriter returned mismatched ${field} for ${artifactName}`);
  }
  return { ...structuredClone(record), variant: artifactName };
}

export async function createSlipCropArtifacts({ source, sourceSha256, detections, artifactWriter }) {
  if (!source || typeof source.fileName !== "string" || !source.fileName.trim()) throw new TypeError("source.fileName is required");
  const sourceBytes = copyBytes(source.bytes, "source.bytes");
  if (typeof sourceSha256 !== "string" || !HASH_RE.test(sourceSha256)) throw new TypeError("sourceSha256 must be a 64-character SHA-256 hex string");
  const normalizedHash = sourceSha256.toLowerCase();
  if (sha256(sourceBytes) !== normalizedHash) throw new Error("sourceSha256 does not match source.bytes");
  assertImageSize(source.width, source.height);
  if (!(source.pixelBuffer instanceof Uint8Array) && !(source.pixelBuffer instanceof Uint8ClampedArray)
    || source.pixelBuffer.length !== source.width * source.height * 4) {
    throw new TypeError("source.pixelBuffer must contain width × height RGBA pixels");
  }
  if (typeof artifactWriter !== "function") throw new TypeError("artifactWriter must be a function");

  const ordered = normalizeDetections({ detections, imageWidth: source.width, imageHeight: source.height });
  const countGate = evaluateDetectionGate({ expectedSlipCount: 2, detectedCount: ordered.length });
  const slips = [];
  const errors = [];
  const sourcePixels = new Uint8ClampedArray(source.pixelBuffer);

  for (const detection of ordered) {
    const { index, bbox, confidence } = detection;
    const prefix = `derived/stream-b/slip-${String(index).padStart(2, "0")}`;
    let crop;
    try {
      crop = cropRgba(sourcePixels, source.width, source.height, bbox);
    } catch (error) {
      errors.push({ index, stage: "crop", message: error.message });
      continue;
    }

    let cropOriginal;
    try {
      const bytes = await encodePng(crop.pixels, crop.width, crop.height);
      cropOriginal = await writeArtifact({
        artifactWriter, bytes, artifactName: "crop-original",
        metadata: {
          sourceFileName: source.fileName, sourceSha256: normalizedHash,
          artifactPath: `${prefix}/crop-original.png`, artifactSha256: sha256(bytes),
          stream: "B", artifactType: "slip_crop_original", parentArtifact: null,
          bbox, dimensions: { width: crop.width, height: crop.height },
          transform: { engine: "rgba-crop-png", operations: ["crop"] }, reviewOnly: true,
        },
      });
    } catch (error) {
      errors.push({ index, stage: "crop-original-write", message: error.message });
      continue;
    }

    const slip = { index, bbox: { ...bbox }, confidence, cropOriginal, cropVariants: [], reviewOnly: true };
    for (const variant of CROP_VARIANTS) {
      try {
        const rendered = transformCrop(crop, variant);
        const bytes = await encodePng(rendered.pixels, rendered.width, rendered.height);
        const artifact = await writeArtifact({
          artifactWriter, bytes, artifactName: variant.id,
          metadata: {
            sourceFileName: source.fileName, sourceSha256: normalizedHash,
            artifactPath: `${prefix}/${variant.id}.png`, artifactSha256: sha256(bytes),
            stream: "B", artifactType: "slip_crop_variant", parentArtifact: cropOriginal.artifactPath,
            bbox, dimensions: { width: rendered.width, height: rendered.height },
            transform: {
              engine: variant.engine,
              operations: [variant.operation],
              ...(variant.scale ? { scale: variant.scale, interpolation: "bilinear" } : {}),
              ...(variant.operation === "clahe" ? { tileSize: 32, clipFactor: 3 } : {}),
              ...(variant.operation === "sharpen" ? { amount: 0.8 } : {}),
            },
            reviewOnly: true,
          },
        });
        slip.cropVariants.push(artifact);
      } catch (error) {
        errors.push({ index, stage: variant.id, message: error.message });
      }
    }
    slips.push(slip);
  }

  const allArtifactsCreated = slips.length === ordered.length
    && slips.every((slip) => slip.cropVariants.length === CROP_VARIANTS.length);
  const status = countGate.pass && allArtifactsCreated
    ? "success"
    : slips.length > 0 ? "partial" : "failed";
  return { slips, status, detectionGate: countGate, errors };
}
