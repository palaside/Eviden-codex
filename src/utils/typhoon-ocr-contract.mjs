export const MAX_EXTERNAL_OCR_IMAGE_BYTES = 20 * 1024 * 1024;

export function validateTyphoonUpload({ consentHeader, consentField, mimeType, size }) {
  if (consentHeader !== "confirmed" || consentField !== "confirmed") {
    return "Explicit consent is required before external OCR";
  }
  if (mimeType !== "image/png" && mimeType !== "image/jpeg") {
    return "Only PNG or JPEG images are supported";
  }
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_EXTERNAL_OCR_IMAGE_BYTES) {
    return "Image must be between 1 byte and 20 MB";
  }
  return null;
}
