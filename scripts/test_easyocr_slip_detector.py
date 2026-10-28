"""Run the OpenCV contour + EasyOCR slip detector against one image.

This is an isolated evidence test harness. It does not create or confirm an
application candidate; it records the proposed crop and OCR evidence only.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

import cv2
import easyocr
import numpy as np


AMOUNT_PATTERN = re.compile(r"\b\d{1,3}(?:,\d{3})*\.\d{2}\b")


def extract_slip_from_chat(image_path: Path, output_dir: Path, gpu: bool = False) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    # cv2.imread does not reliably handle non-ASCII Windows paths.
    image_bytes = np.fromfile(str(image_path), dtype=np.uint8)
    image = cv2.imdecode(image_bytes, cv2.IMREAD_COLOR) if image_bytes.size else None
    if image is None:
        return {"status": "ERROR", "message": "ไม่พบไฟล์ภาพ", "image": str(image_path)}

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    image_area = image.shape[0] * image.shape[1]
    contour_candidates: list[dict[str, Any]] = []
    for contour in contours:
        area = float(cv2.contourArea(contour))
        x, y, width, height = cv2.boundingRect(contour)
        if width <= 0:
            continue
        aspect_ratio = height / float(width)
        accepted = 1.2 < aspect_ratio < 2.5 and area > image_area * 0.15
        contour_candidates.append(
            {
                "bbox": {"x": x, "y": y, "width": width, "height": height},
                "area": area,
                "area_ratio": area / image_area,
                "aspect_ratio": aspect_ratio,
                "accepted": accepted,
            }
        )

    contour_candidates.sort(key=lambda item: item["area"], reverse=True)

    accepted = [item for item in contour_candidates if item["accepted"]]
    accepted.sort(key=lambda item: item["area"], reverse=True)
    selected = accepted[0] if accepted else None
    result: dict[str, Any] = {
        "status": "SUCCESS" if selected else "FAILED",
        "image": str(image_path),
        "image_size": {"width": image.shape[1], "height": image.shape[0]},
        "contours": {
            "total": len(contour_candidates),
            "accepted": len(accepted),
            "selected": selected,
            "top_candidates": contour_candidates[:20],
        },
        "ocr": None,
    }

    if selected is None:
        result["message"] = "ไม่พบโครงสร้างสลิปตามเงื่อนไข contour"
        (output_dir / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        return result

    box = selected["bbox"]
    x, y, width, height = box["x"], box["y"], box["width"], box["height"]
    x0, y0 = max(0, x - 10), max(0, y - 10)
    x1, y1 = min(image.shape[1], x + width + 10), min(image.shape[0], y + height + 10)
    slip_roi = image[y0:y1, x0:x1]
    crop_path = output_dir / "selected-slip-roi.png"
    cv2.imwrite(str(crop_path), slip_roi)

    reader = easyocr.Reader(["th", "en"], gpu=gpu)
    ocr_results = reader.readtext(slip_roi, detail=1)
    raw_text = " ".join(str(item[1]) for item in ocr_results)
    result["ocr"] = {
        "raw_text": raw_text,
        "detected_amounts": AMOUNT_PATTERN.findall(raw_text),
        "items": [
            {
                "text": item[1],
                "confidence": float(item[2]),
                "box": [[int(point[0]), int(point[1])] for point in item[0]],
            }
            for item in ocr_results
        ],
        "crop_bbox": {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0},
        "crop_path": str(crop_path),
    }
    (output_dir / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("image", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--gpu", action="store_true")
    args = parser.parse_args()
    result = extract_slip_from_chat(args.image, args.output_dir, args.gpu)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
