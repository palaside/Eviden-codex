export function createColorSeparatedOcrCandidate(cv, rgbaImage) {
  if (!rgbaImage?.rows || !rgbaImage?.cols || rgbaImage.type() !== cv.CV_8UC4) {
    throw new Error("Color-separated OCR requires a non-empty RGBA image");
  }

  const gray = new cv.Mat();
  const rgb = new cv.Mat();
  const hsv = new cv.Mat();
  const lab = new cv.Mat();
  const hsvMask = new cv.Mat();
  const hsvLower = new cv.Mat(rgbaImage.rows, rgbaImage.cols, cv.CV_8UC3, new cv.Scalar(0, 35, 24));
  const hsvUpper = new cv.Mat(rgbaImage.rows, rgbaImage.cols, cv.CV_8UC3, new cv.Scalar(180, 255, 245));
  const channels = new cv.MatVector();
  const lowRange = new cv.Mat(rgbaImage.rows, rgbaImage.cols, cv.CV_8UC1, new cv.Scalar(0));
  const lowNeutral = new cv.Mat(rgbaImage.rows, rgbaImage.cols, cv.CV_8UC1, new cv.Scalar(115));
  const highNeutral = new cv.Mat(rgbaImage.rows, rgbaImage.cols, cv.CV_8UC1, new cv.Scalar(141));
  const highRange = new cv.Mat(rgbaImage.rows, rgbaImage.cols, cv.CV_8UC1, new cv.Scalar(255));
  const masks = Array.from({ length: 4 }, () => new cv.Mat());
  const colorMask = new cv.Mat();
  const localBinary = new cv.Mat();
  const neutralMask = new cv.Mat();
  const neutralGray = new cv.Mat();
  const colorThreshold = new cv.Mat();
  const candidate = new cv.Mat();

  try {
    cv.cvtColor(rgbaImage, gray, cv.COLOR_RGBA2GRAY);
    if (Math.min(rgbaImage.rows, rgbaImage.cols) < 3) {
      gray.copyTo(candidate);
      return candidate;
    }
    cv.cvtColor(rgbaImage, rgb, cv.COLOR_RGBA2RGB);
    cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
    cv.inRange(hsv, hsvLower, hsvUpper, hsvMask);
    cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);
    cv.split(lab, channels);
    const a = channels.get(1);
    const b = channels.get(2);
    try {
      cv.inRange(a, lowRange, lowNeutral, masks[0]);
      cv.inRange(a, highNeutral, highRange, masks[1]);
      cv.inRange(b, lowRange, lowNeutral, masks[2]);
      cv.inRange(b, highNeutral, highRange, masks[3]);
    } finally {
      a.delete();
      b.delete();
    }

    cv.bitwise_or(masks[0], masks[1], masks[0]);
    cv.bitwise_or(masks[2], masks[3], masks[2]);
    cv.bitwise_or(masks[0], masks[2], masks[0]);
    cv.bitwise_or(hsvMask, masks[0], colorMask);

    const minDimension = Math.min(rgbaImage.rows, rgbaImage.cols);
    const maxBlockSize = Math.min(41, minDimension % 2 === 0 ? minDimension - 1 : minDimension);
    const preferredBlockSize = Math.max(15, Math.round(minDimension * 0.035) | 1);
    const blockSize = Math.min(maxBlockSize, preferredBlockSize);
    cv.adaptiveThreshold(gray, localBinary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, blockSize, 7);
    cv.bitwise_not(colorMask, neutralMask);
    cv.bitwise_and(gray, neutralMask, neutralGray);
    cv.bitwise_and(localBinary, colorMask, colorThreshold);
    cv.add(neutralGray, colorThreshold, candidate);
    return candidate;
  } catch (error) {
    candidate.delete();
    throw error;
  } finally {
    gray.delete();
    rgb.delete();
    hsv.delete();
    lab.delete();
    hsvMask.delete();
    hsvLower.delete();
    hsvUpper.delete();
    channels.delete();
    for (const mask of masks) mask.delete();
    colorMask.delete();
    localBinary.delete();
    neutralMask.delete();
    neutralGray.delete();
    colorThreshold.delete();
  }
}
