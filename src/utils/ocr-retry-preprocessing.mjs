export async function createFieldRetryCanvas(sourceCanvas, jobKind, preprocessors) {
  const method = jobKind === "SLIP" ? "morphology" : "color-separation";
  const preprocess = jobKind === "SLIP" ? preprocessors.morphology : preprocessors.colorSeparation;

  try {
    return { canvas: await preprocess(sourceCanvas), method, fallbackUsed: false };
  } catch {
    return { canvas: sourceCanvas, method, fallbackUsed: true };
  }
}
