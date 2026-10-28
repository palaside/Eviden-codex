import type { SlipExtraction } from "@/schemas/slip.schema";
import { SlipExtractionSchema } from "@/schemas/slip.schema";
import { requestTyphoonOcr } from "@/utils/typhoon-ocr-client.mjs";

/** External OCR is opt-in and never falls back to another remote provider. */
export async function runTyphoonOCR(
  file: File,
  options: { consent: boolean },
): Promise<{ data: SlipExtraction; sha256: string }> {
  const response = await requestTyphoonOcr(file, options);
  const parsed = SlipExtractionSchema.safeParse(response.data);
  if (!parsed.success) throw new Error("Typhoon OCR response does not match the slip schema");
  return { data: parsed.data, sha256: response.sha256 };
}
