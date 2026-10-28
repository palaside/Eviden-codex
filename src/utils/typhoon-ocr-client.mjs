export async function requestTyphoonOcr(file, { consent = false, fetchImpl = fetch } = {}) {
  if (consent !== true) throw new Error("Explicit consent is required before external OCR");

  const formData = new FormData();
  formData.append("file", file, file.name || "evidence.png");
  formData.append("externalOcrConsent", "confirmed");
  const response = await fetchImpl("/api/slips/typhoon", {
    method: "POST",
    headers: { "x-evidence-upload-consent": "confirmed" },
    body: formData,
  });
  const result = await response.json();
  if (!response.ok || result.success !== true || !result.data) {
    throw new Error(result.message || `Typhoon OCR failed (${response.status})`);
  }
  return result;
}
