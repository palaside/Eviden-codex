"""Create auditable, derived image views for forensic OCR experiments."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


def read_image(path: Path) -> tuple[np.ndarray, bytes]:
    raw = path.read_bytes()
    image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"อ่านภาพไม่สำเร็จ: {path}")
    return image, raw


def gamma_normalize(gray: np.ndarray) -> tuple[np.ndarray, float]:
    mean_ratio = float(gray.mean()) / 255.0
    gamma = 1.0 if mean_ratio <= 0.0 or mean_ratio >= 1.0 else max(
        0.8, min(1.2, math.log(0.58) / math.log(mean_ratio))
    )
    lut = np.array([round(255 * ((value / 255.0) ** gamma)) for value in range(256)], dtype=np.uint8)
    return cv2.LUT(gray, lut), gamma


def enhance_forensic(image: np.ndarray) -> tuple[dict[str, np.ndarray], dict]:
    """Run the four stages described by the supplied skill/spec.

    All outputs are derived views. The input array is never modified.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    normalized, gamma = gamma_normalize(gray)

    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    # Preserve dark/text-like pixels while suppressing low-saturation wallpaper.
    text_mask = cv2.inRange(hsv, np.array([0, 0, 0]), np.array([180, 170, 205]))
    lab_l = lab[:, :, 0]
    segmented = cv2.bitwise_and(lab_l, lab_l, mask=text_mask)
    segmented[text_mask == 0] = normalized[text_mask == 0]

    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    contrasted = clahe.apply(segmented)
    bilateral = cv2.bilateralFilter(contrasted, 5, 24, 1)
    bilateral_float = bilateral.astype(np.float32)
    laplacian = cv2.Laplacian(bilateral_float, cv2.CV_32F, ksize=3)
    sharpened = np.clip(bilateral_float * 1.35 - laplacian * 0.25, 0, 255).astype(np.uint8)
    adaptive = cv2.adaptiveThreshold(
        sharpened, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 11
    )
    upscaled = cv2.resize(sharpened, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    upscaled_binary = cv2.resize(adaptive, None, fx=3, fy=3, interpolation=cv2.INTER_NEAREST)
    return {
        "01_gamma_normalized": normalized,
        "02_color_segmented": segmented,
        "03_clahe_contrast": contrasted,
        "04_bilateral_denoised": bilateral,
        "05_unsharp_laplacian": sharpened,
        "06_adaptive_threshold": adaptive,
        "07_upscaled_ocr": upscaled,
        "08_upscaled_binary": upscaled_binary,
    }, {
        "stages": [
            "brightness_gamma_normalization", "hsv_lab_color_segmentation",
            "clahe_adaptive_contrast", "bilateral_denoise",
            "unsharp_laplacian_sharpening", "adaptive_threshold", "upscale",
        ],
        "gamma": gamma,
        "source_dimensions": {"width": int(image.shape[1]), "height": int(image.shape[0])},
        "aspect_ratio_preserved": True,
        "derived_only": True,
    }


def enhance_ttb_recipe(
    image: np.ndarray,
    gamma: float = 0.72,
    sharpen_amount: float = 1.8,
    thicken_faint_ink: bool = False,
) -> tuple[np.ndarray, dict]:
    """Run the supplied ttb recipe as an isolated, review-only experiment."""
    if not 0.5 <= gamma <= 1.0:
        raise ValueError("gamma ต้องอยู่ระหว่าง 0.5 ถึง 1.0")
    enlarged = cv2.resize(image, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_LANCZOS4)
    table = np.array([round(((value / 255.0) ** (1.0 / gamma)) * 255) for value in range(256)], dtype=np.uint8)
    gamma_image = cv2.LUT(enlarged, table)
    lab = cv2.cvtColor(gamma_image, cv2.COLOR_BGR2LAB)
    l_channel = lab[:, :, 0]
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    contrasted = clahe.apply(l_channel)
    p5, p90 = np.percentile(contrasted, (5, 90))
    stretched = np.clip((contrasted.astype(np.float32) - p5) * (255.0 / max(1.0, p90 - p5)), 0, 255).astype(np.uint8)
    denoised = cv2.bilateralFilter(stretched, d=5, sigmaColor=35, sigmaSpace=35)
    blurred = cv2.GaussianBlur(denoised, (0, 0), sigmaX=1.2)
    sharpened = cv2.addWeighted(denoised, 1.0 + sharpen_amount, blurred, -sharpen_amount, 0)
    if thicken_faint_ink:
        sharpened = cv2.erode(sharpened, np.ones((2, 2), dtype=np.uint8), iterations=1)
    return sharpened, {
        "recipe": "supplied_ttb_forensic_recipe",
        "gamma": gamma,
        "upscale": 2.0,
        "clahe_clip": 2.5,
        "bilateral": {"d": 5, "sigma_color": 35, "sigma_space": 35},
        "sharpen_amount": sharpen_amount,
        "thicken_faint_ink": thicken_faint_ink,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--bbox", type=int, nargs=4, metavar=("X1", "Y1", "X2", "Y2"))
    parser.add_argument("--source-dpi", type=int, default=150)
    parser.add_argument("--target-dpi", type=int, default=300)
    args = parser.parse_args()
    if args.source_dpi <= 0 or args.target_dpi <= 0:
        raise ValueError("DPI ต้องเป็นจำนวนเต็มบวก")
    image, raw = read_image(args.image)
    source_bbox = None
    if args.bbox:
        x1, y1, x2, y2 = args.bbox
        h, w = image.shape[:2]
        x1, y1, x2, y2 = max(0, x1), max(0, y1), min(w, x2), min(h, y2)
        if x2 <= x1 or y2 <= y1:
            raise ValueError("bbox ไม่อยู่ในขอบเขตภาพ")
        source_bbox = {"x1": x1, "y1": y1, "x2": x2, "y2": y2}
        image = image[y1:y2, x1:x2].copy()
    outputs, trace = enhance_forensic(image)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for name, output in outputs.items():
        if not cv2.imwrite(str(args.output_dir / f"{name}.png"), output):
            raise RuntimeError(f"เขียนภาพ derived ไม่สำเร็จ: {name}")
    dpi_scale = args.target_dpi / args.source_dpi
    target_size = (
        max(1, round(outputs["05_unsharp_laplacian"].shape[1] * dpi_scale)),
        max(1, round(outputs["05_unsharp_laplacian"].shape[0] * dpi_scale)),
    )
    target_ocr = cv2.resize(outputs["05_unsharp_laplacian"], target_size, interpolation=cv2.INTER_CUBIC)
    target_binary = cv2.resize(outputs["06_adaptive_threshold"], target_size, interpolation=cv2.INTER_NEAREST)
    for name, output in (("09_target_300dpi_ocr", target_ocr), ("10_target_300dpi_binary", target_binary)):
        if not cv2.imwrite(str(args.output_dir / f"{name}.png"), output):
            raise RuntimeError(f"เขียนภาพ DPI derived ไม่สำเร็จ: {name}")
        Image.fromarray(output).save(args.output_dir / f"{name}_metadata.png", dpi=(args.target_dpi, args.target_dpi))
    manifest = {
        "source": {"file_name": args.image.name, "sha256": hashlib.sha256(raw).hexdigest()},
        "source_bbox": source_bbox,
        "dpi": {"source_assumed": args.source_dpi, "target": args.target_dpi, "scale": dpi_scale},
        "output_dir": str(args.output_dir),
        **trace,
    }
    (args.output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False))


if __name__ == "__main__":
    main()
