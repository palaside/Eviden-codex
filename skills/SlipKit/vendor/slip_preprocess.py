import cv2
import sys
import os
import numpy as np

def auto_crop(image):
    """Detect the largest rectangular contour (assumed to be the slip) and crop to it."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    # Blur and threshold to isolate the slip region
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    # Find contours
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return image  # fallback
    # Choose the contour with the largest area
    max_cnt = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(max_cnt)
    # Add a small margin (5% of width/height) to avoid cutting off edges
    margin_w = int(w * 0.02)
    margin_h = int(h * 0.02)
    x = max(x - margin_w, 0)
    y = max(y - margin_h, 0)
    w = min(w + 2 * margin_w, image.shape[1] - x)
    h = min(h + 2 * margin_h, image.shape[0] - y)
    return image[y:y + h, x:x + w]

def preprocess_slip(input_path: str, output_path: str):
    img = cv2.imread(input_path)
    if img is None:
        raise FileNotFoundError(f"Cannot read image: {input_path}")
    # 1. Auto‑crop to slip region
    img = auto_crop(img)
    # 2. Grayscale conversion
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # 3. Denoise (Non‑local Means)
    denoised = cv2.fastNlMeansDenoising(gray, None, h=10, templateWindowSize=7, searchWindowSize=21)
    # 4. Contrast Limited Adaptive Histogram Equalization (CLAHE)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)
    # 5. Binarization (Otsu)
    _, binary = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    # Save result
    cv2.imwrite(output_path, binary)
    print(f"[SlipPreprocess] saved {output_path}")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python slip_preprocess.py <input_image> <output_image>")
        sys.exit(1)
    inp, outp = sys.argv[1], sys.argv[2]
    os.makedirs(os.path.dirname(outp), exist_ok=True)
    preprocess_slip(inp, outp)
