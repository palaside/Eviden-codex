export interface QrDecodeHit {
  data: string;
  location: {
    topLeftCorner: { x: number; y: number };
    topRightCorner: { x: number; y: number };
    bottomLeftCorner: { x: number; y: number };
    bottomRightCorner: { x: number; y: number };
  };
}

export type QrDecodeResult = QrDecodeHit & {
  source: "primary" | "fallback" | "upscaled";
  decoder: "primary" | "fallback";
  resolution: "original" | "upscaled";
  enhanced?: boolean;
};

export function formatQrDecoderRoute(result: QrDecodeResult): "jsQR/original" | "ZXing/original" | "jsQR/upscaled" | "ZXing/upscaled" | "jsQR/enhanced" | "ZXing/enhanced" | "jsQR/enhanced-upscaled" | "ZXing/enhanced-upscaled";
export function buildQrDecoderDiagnostics(routes: Array<string | undefined>): string[];
export function decodeQrWithEnhancedPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  enhance: (pixels: Uint8ClampedArray, width: number, height: number) => { pixels: Uint8ClampedArray; stages?: string[] },
  decode: (pixels: Uint8ClampedArray, width: number, height: number) => QrDecodeHit | null | Promise<QrDecodeHit | null>,
): Promise<{ result: (QrDecodeHit & { enhanced: true }) | null; pixels: Uint8ClampedArray; stages: string[] }>;
export function scaleQrPixelsNearest(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  scale: number,
): { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number };
export function cropQrPixelRegion(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  region: { x: number; y: number; width: number; height: number },
): { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number };
export function thresholdQrPixelsOtsu(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number; threshold: number };

export function decodeQrWithFallback(
  primaryDecode: () => QrDecodeHit | null | Promise<QrDecodeHit | null>,
  fallbackDecode: () => QrDecodeHit | null | Promise<QrDecodeHit | null>,
): Promise<QrDecodeResult | null>;

export function decodeQrWithUpscaleFallback(
  primaryDecode: () => QrDecodeHit | null | Promise<QrDecodeHit | null>,
  fallbackDecode: () => QrDecodeHit | null | Promise<QrDecodeHit | null>,
  upscaledPrimaryDecode: () => QrDecodeHit | null | Promise<QrDecodeHit | null>,
  upscaledFallbackDecode: () => QrDecodeHit | null | Promise<QrDecodeHit | null>,
  scale: number,
): Promise<QrDecodeResult | null>;
