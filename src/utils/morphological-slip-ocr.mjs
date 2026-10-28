export function createMorphologicalSlipOcrCandidate(cv, rgbaImage) {
  if (!rgbaImage?.rows || !rgbaImage?.cols || rgbaImage.type() !== cv.CV_8UC4) {
    throw new Error("Morphological slip OCR requires a non-empty RGBA image");
  }

  const gray = new cv.Mat();
  const background = new cv.Mat();
  const divided = new cv.Mat();
  const enhanced = new cv.Mat();
  const candidate = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(21, 21));
  const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));

  try {
    cv.cvtColor(rgbaImage, gray, cv.COLOR_RGBA2GRAY);
    cv.morphologyEx(gray, background, cv.MORPH_DILATE, kernel);
    cv.divide(gray, background, divided, 255);
    clahe.apply(divided, enhanced);
    cv.threshold(enhanced, candidate, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
    return candidate;
  } catch (error) {
    candidate.delete();
    throw error;
  } finally {
    gray.delete();
    background.delete();
    divided.delete();
    enhanced.delete();
    kernel.delete();
    clahe.delete();
  }
}
