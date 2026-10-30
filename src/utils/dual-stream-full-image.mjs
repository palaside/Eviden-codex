import { bilateralDenoiseOcrPixels, enhanceOcrPixels } from "./enhance-for-ocr.mjs";

const VARIANTS = [
  { variant: "original-reference", kind: "source" },
  { variant: "upscale-2x", kind: "upscale", scale: 2 },
  { variant: "upscale-4x", kind: "upscale", scale: 4 },
  { variant: "brightness-gamma", kind: "gamma" },
  { variant: "clahe", kind: "clahe" },
  { variant: "denoise", kind: "denoise" },
  { variant: "sharpen", kind: "sharpen" },
  { variant: "grayscale", kind: "grayscale" },
  { variant: "adaptive-threshold", kind: "threshold" },
];

const SHA256_PATTERN = /^[\da-f]{64}$/iu;
const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));

function asBytes(value, label) {
  if (value instanceof Uint8Array) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new TypeError(`${label} must be a Uint8Array or ArrayBuffer`);
}

async function sha256(bytes) {
  const copy = new Uint8Array(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
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
  const output = new Uint8Array(12 + data.length);
  const view = new DataView(output.buffer);
  view.setUint32(0, data.length);
  output.set(typeBytes, 4);
  output.set(data, 8);
  view.setUint32(8 + data.length, crc32(output.subarray(4, 8 + data.length)));
  return output;
}

function concatBytes(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
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
  return concatBytes([
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

function luminanceAt(pixels, index) {
  const offset = index * 4;
  return 0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2];
}

function scaleBilinear(pixels, width, height, scale) {
  const outWidth = width * scale;
  const outHeight = height * scale;
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
        const top = pixels[(y0 * width + x0) * 4 + channel] * (1 - fx) + pixels[(y0 * width + x1) * 4 + channel] * fx;
        const bottom = pixels[(y1 * width + x0) * 4 + channel] * (1 - fx) + pixels[(y1 * width + x1) * 4 + channel] * fx;
        output[target + channel] = clampByte(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return { pixels: output, width: outWidth, height: outHeight };
}

function gammaVariant(pixels, width, height) {
  const { gamma } = enhanceOcrPixels(pixels, width, height);
  const output = new Uint8ClampedArray(pixels);
  for (let offset = 0; offset < output.length; offset += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      output[offset + channel] = clampByte(255 * ((pixels[offset + channel] / 255) ** gamma));
    }
  }
  return { pixels: output, width, height, transform: { engine: "enhanceOcrPixels-gamma", operations: ["brightness-gamma"], gamma } };
}

function claheVariant(pixels, width, height) {
  const tileSize = 64;
  const columns = Math.ceil(width / tileSize);
  const rows = Math.ceil(height / tileSize);
  const luts = [];
  for (let ty = 0; ty < rows; ty += 1) {
    for (let tx = 0; tx < columns; tx += 1) {
      const left = tx * tileSize;
      const top = ty * tileSize;
      const right = Math.min(width, left + tileSize);
      const bottom = Math.min(height, top + tileSize);
      const area = (right - left) * (bottom - top);
      const hist = new Uint32Array(256);
      for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) hist[clampByte(luminanceAt(pixels, y * width + x))] += 1;
      const limit = Math.max(1, Math.floor(3 * area / 256));
      let excess = 0;
      for (let value = 0; value < hist.length; value += 1) {
        if (hist[value] > limit) { excess += hist[value] - limit; hist[value] = limit; }
      }
      const share = Math.floor(excess / 256);
      for (let value = 0; value < 256; value += 1) hist[value] += share;
      for (let value = 0; value < excess - share * 256; value += 1) hist[value] += 1;
      const lut = new Uint8Array(256);
      let cumulative = 0;
      const first = hist.find((count) => count > 0) || 0;
      for (let value = 0; value < 256; value += 1) {
        cumulative += hist[value];
        lut[value] = clampByte(255 * Math.max(0, cumulative - first) / Math.max(1, area - first));
      }
      luts.push(lut);
    }
  }

  const output = new Uint8ClampedArray(pixels);
  for (let y = 0; y < height; y += 1) {
    const gy = Math.max(0, Math.min(rows - 1, (y + 0.5) / tileSize - 0.5));
    const y0 = Math.floor(gy);
    const y1 = Math.min(rows - 1, y0 + 1);
    const fy = gy - y0;
    for (let x = 0; x < width; x += 1) {
      const gx = Math.max(0, Math.min(columns - 1, (x + 0.5) / tileSize - 0.5));
      const x0 = Math.floor(gx);
      const x1 = Math.min(columns - 1, x0 + 1);
      const fx = gx - x0;
      const index = y * width + x;
      const lum = clampByte(luminanceAt(pixels, index));
      const top = luts[y0 * columns + x0][lum] * (1 - fx) + luts[y0 * columns + x1][lum] * fx;
      const bottom = luts[y1 * columns + x0][lum] * (1 - fx) + luts[y1 * columns + x1][lum] * fx;
      const targetLum = top * (1 - fy) + bottom * fy;
      const delta = targetLum - lum;
      const offset = index * 4;
      for (let channel = 0; channel < 3; channel += 1) output[offset + channel] = clampByte(pixels[offset + channel] + delta * 0.65);
    }
  }
  return { pixels: output, width, height };
}

function denoiseVariant(pixels, width, height) {
  const luminance = Uint8Array.from({ length: width * height }, (_, index) => clampByte(luminanceAt(pixels, index)));
  const denoised = bilateralDenoiseOcrPixels(luminance, width, height);
  const output = new Uint8ClampedArray(pixels);
  for (let index = 0; index < denoised.length; index += 1) {
    const delta = denoised[index] - luminance[index];
    const offset = index * 4;
    for (let channel = 0; channel < 3; channel += 1) output[offset + channel] = clampByte(pixels[offset + channel] + delta);
  }
  return { pixels: output, width, height };
}

function sharpenVariant(pixels, width, height) {
  const output = new Uint8ClampedArray(pixels);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const center = luminanceAt(pixels, index);
      let sum = 0;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const sx = Math.max(0, Math.min(width - 1, x + dx));
        const sy = Math.max(0, Math.min(height - 1, y + dy));
        sum += luminanceAt(pixels, sy * width + sx);
      }
      const delta = (center - sum / 9) * 0.8;
      const offset = index * 4;
      for (let channel = 0; channel < 3; channel += 1) output[offset + channel] = clampByte(pixels[offset + channel] + delta);
    }
  }
  return { pixels: output, width, height };
}

function grayscaleVariant(pixels, width, height) {
  const output = new Uint8ClampedArray(pixels);
  for (let index = 0; index < width * height; index += 1) {
    const value = clampByte(luminanceAt(pixels, index));
    output.set([value, value, value], index * 4);
  }
  return { pixels: output, width, height };
}

function adaptiveThresholdVariant(pixels, width, height) {
  const stride = width + 1;
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let rowSum = 0;
    for (let x = 1; x <= width; x += 1) {
      rowSum += luminanceAt(pixels, (y - 1) * width + x - 1);
      integral[y * stride + x] = integral[(y - 1) * stride + x] + rowSum;
    }
  }
  const output = new Uint8ClampedArray(pixels);
  const radius = 7;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const left = Math.max(0, x - radius);
    const right = Math.min(width, x + radius + 1);
    const top = Math.max(0, y - radius);
    const bottom = Math.min(height, y + radius + 1);
    const sum = integral[bottom * stride + right] - integral[top * stride + right] - integral[bottom * stride + left] + integral[top * stride + left];
    const mean = sum / ((right - left) * (bottom - top));
    const value = luminanceAt(pixels, y * width + x) >= mean - 7 ? 255 : 0;
    const offset = (y * width + x) * 4;
    output.set([value, value, value], offset);
  }
  return { pixels: output, width, height };
}

function makeVariant(variant, sourcePixels, width, height) {
  if (variant.kind === "upscale") return { ...scaleBilinear(sourcePixels, width, height, variant.scale), transform: { engine: "bilinear-rgba", operations: ["upscale"], scale: variant.scale, interpolation: "bilinear" } };
  if (variant.kind === "gamma") return gammaVariant(sourcePixels, width, height);
  if (variant.kind === "clahe") return { ...claheVariant(sourcePixels, width, height), transform: { engine: "tile-clahe", operations: ["clahe"], tileSize: 64, clipFactor: 3 } };
  if (variant.kind === "denoise") return { ...denoiseVariant(sourcePixels, width, height), transform: { engine: "bilateralDenoiseOcrPixels", operations: ["denoise"] } };
  if (variant.kind === "sharpen") return { ...sharpenVariant(sourcePixels, width, height), transform: { engine: "unsharp-mask", operations: ["sharpen"], amount: 0.8 } };
  if (variant.kind === "grayscale") return { ...grayscaleVariant(sourcePixels, width, height), transform: { engine: "luminance-rgb", operations: ["grayscale"] } };
  if (variant.kind === "threshold") return { ...adaptiveThresholdVariant(sourcePixels, width, height), transform: { engine: "integral-image-local-mean", operations: ["adaptive-threshold"], windowSize: 15, offset: 7 } };
  throw new TypeError(`Unsupported Stream A variant: ${variant.variant}`);
}

function validateResult(record, metadata) {
  if (!record || typeof record !== "object") throw new TypeError("artifactWriter must return an ArtifactRecord");
  if (record.sourceSha256?.toLowerCase() !== metadata.sourceSha256
    || record.artifactSha256?.toLowerCase() !== metadata.artifactSha256
    || record.artifactPath !== metadata.artifactPath
    || record.stream !== "A"
    || record.artifactType !== metadata.artifactType
    || record.reviewOnly !== true) {
    throw new Error(`artifactWriter returned an inconsistent record for ${metadata.variant}`);
  }
  return { ...record, variant: metadata.variant };
}

export async function createFullImageVariants({ source, sourceSha256, width, height, pixelBuffer, artifactWriter }) {
  if (!source || typeof source.fileName !== "string" || !source.fileName.trim()) throw new TypeError("source.fileName is required");
  const sourceBytes = asBytes(source.bytes, "source.bytes");
  if (typeof sourceSha256 !== "string" || !SHA256_PATTERN.test(sourceSha256)) throw new TypeError("sourceSha256 must be a 64-character SHA-256 hex string");
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) throw new RangeError("width and height must be positive safe integers");
  if (!(pixelBuffer instanceof Uint8Array) && !(pixelBuffer instanceof Uint8ClampedArray) || pixelBuffer.length !== width * height * 4) throw new TypeError("pixelBuffer must contain width × height RGBA pixels");
  if (typeof artifactWriter !== "function") throw new TypeError("artifactWriter must be a function");
  const normalizedSourceSha = sourceSha256.toLowerCase();
  if (await sha256(sourceBytes) !== normalizedSourceSha) throw new Error("sourceSha256 does not match source.bytes");

  const sourcePixels = new Uint8ClampedArray(pixelBuffer);
  const artifacts = [];
  for (const variant of VARIANTS) {
    try {
      const isOriginal = variant.kind === "source";
      const rendered = isOriginal
        ? { pixels: sourcePixels, width, height, transform: { engine: "none", operations: [] } }
        : makeVariant(variant, sourcePixels, width, height);
      const bytes = isOriginal ? new Uint8Array(sourceBytes) : await encodePng(rendered.pixels, rendered.width, rendered.height);
      if (bytes.length === 0) throw new Error(`${variant.variant} produced empty bytes`);
      const artifactSha256 = isOriginal ? normalizedSourceSha : await sha256(bytes);
      const metadata = {
        sourceFileName: source.fileName,
        sourceSha256: normalizedSourceSha,
        artifactSha256,
        artifactPath: isOriginal ? `source/${normalizedSourceSha}` : `derived/stream-a/${variant.variant}.png`,
        stream: "A",
        artifactType: isOriginal ? "original_reference" : "full_image_variant",
        dimensions: { width: rendered.width, height: rendered.height },
        transform: rendered.transform,
        variant: variant.variant,
        reviewOnly: true,
      };
      const record = await artifactWriter({ bytes: new Uint8Array(bytes), artifactName: variant.variant, metadata });
      artifacts.push(validateResult(record, metadata));
    } catch {
      // Keep successful artifacts; a storage or encoding failure makes the run partial.
    }
  }
  return { artifacts, status: artifacts.length === VARIANTS.length ? "success" : "partial" };
}
