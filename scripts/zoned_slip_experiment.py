"""Review-only experiment for the supplied Text/QR/Graphic zone proposal."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
import pytesseract


def read_image(path: Path) -> tuple[np.ndarray, bytes]:
    raw = path.read_bytes()
    image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"อ่านภาพไม่สำเร็จ: {path}")
    return image, raw


def process_text_zone(zone: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(zone, cv2.COLOR_BGR2GRAY)
    enlarged = cv2.resize(gray, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_LANCZOS4)
    binary = cv2.adaptiveThreshold(
        enlarged, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 51, 15
    )
    return cv2.erode(binary, np.ones((2, 2), dtype=np.uint8), iterations=1)


def decode_qr_zone(zone: np.ndarray) -> dict:
    detector = cv2.QRCodeDetector()
    attempts = [("opencv_raw", zone)]
    gray = cv2.cvtColor(zone, cv2.COLOR_BGR2GRAY)
    attempts.append(("opencv_otsu", cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]))
    for label, candidate in attempts:
        payload, _, _ = detector.detectAndDecode(candidate)
        if payload:
            return {"decoder": label, "payload": payload, "attempts": [name for name, _ in attempts]}
    pyzbar_status = "not_checked"
    try:
        from pyzbar.pyzbar import decode
        pyzbar_status = "available"
        for label, candidate in attempts:
            decoded = decode(candidate)
            if decoded:
                return {
                    "decoder": f"pyzbar_{label}", "payload": decoded[0].data.decode("utf-8", errors="replace"),
                    "attempts": [name for name, _ in attempts], "pyzbar": pyzbar_status,
                }
    except Exception as error:  # diagnostic only; do not hide the OpenCV result
        pyzbar_status = f"unavailable: {type(error).__name__}: {error}"
    return {"decoder": None, "payload": None, "attempts": [name for name, _ in attempts], "pyzbar": pyzbar_status}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", type=Path, required=True)
    parser.add_argument("--bbox", type=int, nargs=4, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--tesseract", type=Path, required=True)
    args = parser.parse_args()
    pytesseract.pytesseract.tesseract_cmd = str(args.tesseract)

    full, raw = read_image(args.image)
    x1, y1, x2, y2 = args.bbox
    crop = full[y1:y2, x1:x2].copy()
    h, w = crop.shape[:2]
    text_zone = crop[: int(h * 0.75), :]
    qr_zone = crop[int(h * 0.65): int(h * 0.85), int(w * 0.60):]
    graphic_zone = crop[int(h * 0.85):, :]
    clean_text = process_text_zone(text_zone)
    qr_result = decode_qr_zone(qr_zone)
    ocr_text = pytesseract.image_to_string(clean_text, config="--oem 3 --psm 11 -l tha+eng")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(args.output_dir / "text_zone_adaptive_eroded.png"), clean_text)
    cv2.imwrite(str(args.output_dir / "qr_zone_raw.png"), qr_zone)
    cv2.imwrite(str(args.output_dir / "graphic_zone_discarded.png"), graphic_zone)
    result = {
        "source": {"file_name": args.image.name, "sha256": hashlib.sha256(raw).hexdigest(), "bbox": args.bbox},
        "zone_geometry": {
            "crop": {"width": w, "height": h},
            "text": [0, 0, w, int(h * 0.75)],
            "qr": [int(w * 0.60), int(h * 0.65), w, int(h * 0.85)],
            "graphic_discarded": [0, int(h * 0.85), w, h],
        },
        "text_track": {"ocr_lines": [line.strip() for line in ocr_text.splitlines() if line.strip()]},
        "qr_track": qr_result,
        "graphic_track": {"discarded_from_ocr": True, "height": graphic_zone.shape[0]},
        "status": "review_only",
    }
    (args.output_dir / "trace.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
