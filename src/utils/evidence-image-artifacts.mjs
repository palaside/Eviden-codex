function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function sha256Bytes(bytes) {
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

/**
 * @param {{ id: string, kind?: "source" | "ocr_variant" | "segmentation_mask", variant: string, canvas: HTMLCanvasElement, scale?: number, sourceBounds?: { x: number, y: number, width: number, height: number }, stages?: string[] }} input
 */
export async function createCanvasEvidenceArtifact({ id, kind = "ocr_variant", variant, canvas, scale = 1, sourceBounds, stages = [] }) {
  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return {
    id,
    kind,
    variant,
    width: canvas.width,
    height: canvas.height,
    scale,
    sha256: await sha256Bytes(bytes),
    ...(sourceBounds ? { sourceBounds } : {}),
    stages,
    dataUrl,
  };
}
