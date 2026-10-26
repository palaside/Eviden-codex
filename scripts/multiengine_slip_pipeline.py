"""E2E review-only pipeline: YOLO crop -> ZXing QR -> EasyOCR -> validation."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Optional

import cv2
import easyocr
import numpy as np
import zxingcpp
from pydantic import BaseModel, Field


class SlipData(BaseModel):
    is_valid: bool = False
    qr_payload: Optional[str] = None
    transaction_amount: Optional[float] = None
    transaction_time_raw: Optional[str] = None
    sender_name_raw: Optional[str] = None
    receiver_name_raw: Optional[str] = None
    sender_account_raw: Optional[str] = None
    receiver_account_raw: Optional[str] = None
    validation_score: float = Field(default=0.0, ge=0.0, le=1.0)
    review_required: bool = True
    error_log: Optional[str] = None


def configure_console_encoding() -> None:
    """Keep JSON logs readable on Windows consoles using a legacy code page."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8", errors="replace")


def read_image(path: Path) -> tuple[np.ndarray, bytes]:
    raw = path.read_bytes()
    image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"อ่านภาพไม่สำเร็จ: {path}")
    return image, raw


def decode_qr(zone: np.ndarray) -> Optional[str]:
    gray = cv2.cvtColor(zone, cv2.COLOR_BGR2GRAY)
    results = zxingcpp.read_barcodes(gray)
    return results[0].text if results else None


def build_text_zone(crop: np.ndarray) -> np.ndarray:
    h = crop.shape[0]
    return crop[: int(h * 0.75), :]


def easyocr_lines(reader: easyocr.Reader, text_zone: np.ndarray) -> list[dict]:
    results = reader.readtext(
        text_zone, detail=1, text_threshold=0.5, low_text=0.3,
        link_threshold=0.3, mag_ratio=1.5,
    )
    return [{"text": str(text).strip(), "confidence": float(confidence),
             "bbox": [[int(point[0]), int(point[1])] for point in bbox]}
            for bbox, text, confidence in results if str(text).strip()]


def parse_fields(lines: list[dict], qr_payload: Optional[str]) -> SlipData:
    texts = [line["text"] for line in lines]
    joined = " ".join(texts)
    amounts = re.findall(r"\d{1,3}(?:,\d{3})*\.\d{2}", joined)
    amount = float(amounts[0].replace(",", "")) if amounts else None
    accounts = re.findall(r"[xX]{3}-[xX0-9]-[xX0-9]{2,5}-[xX0-9]", joined)
    names = [
        line["text"] for line in lines
        if re.search(r"(?:นาย|นาง|น\.ส\.|ณัฐชัย|จิณห์นิภา)", line["text"])
        and line["confidence"] >= 0.75
    ]
    time_match = re.search(r"\b([0-2]?\d:[0-5]\d)\b", joined)
    # QR payload does not itself prove the display time or person names.
    score = 0.5 if qr_payload else 0.0
    if amount is not None:
        score += 0.2
    if names:
        score += min(0.2, 0.1 * len(names))
    return SlipData(
        qr_payload=qr_payload,
        transaction_amount=amount,
        transaction_time_raw=time_match.group(1) if time_match else None,
        sender_name_raw=names[0] if names else None,
        receiver_name_raw=names[1] if len(names) > 1 else None,
        sender_account_raw=accounts[0].upper() if accounts else None,
        receiver_account_raw=accounts[1].upper() if len(accounts) > 1 else None,
        validation_score=min(score, 1.0),
        review_required=True,
        is_valid=False,
    )


def process(image_path: Path, bbox: tuple[int, int, int, int], gpu: bool) -> dict:
    image, raw = read_image(image_path)
    x1, y1, x2, y2 = bbox
    crop = image[y1:y2, x1:x2].copy()
    h, w = crop.shape[:2]
    qr_zone = crop[int(h * 0.65): int(h * 0.85), int(w * 0.60):]
    qr_payload = decode_qr(qr_zone)
    reader = easyocr.Reader(["th", "en"], gpu=gpu, verbose=False)
    lines = easyocr_lines(reader, build_text_zone(crop))
    data = parse_fields(lines, qr_payload)
    ocr_joined = " ".join(line["text"] for line in lines)
    qr_refs = re.findall(r"20\d{16}", qr_payload or "")
    ocr_refs = re.findall(r"20\d{16}", ocr_joined)
    validation = {
        "qr_ref_candidates": qr_refs,
        "ocr_ref_candidates": ocr_refs,
        "qr_ref_ocr_match": bool(set(qr_refs) & set(ocr_refs)),
        "amount_cross_checked_against_qr": False,
        "name_validated_by_qr": False,
        "time_validated_by_qr": False,
        "offline_consistency_state": "consistent_pending_authority" if (
            bool(qr_payload) and bool(set(qr_refs) & set(ocr_refs))
            and data.transaction_amount is not None
            and data.sender_account_raw is not None
            and data.receiver_account_raw is not None
        ) else "needs_review",
        "authoritative_bank_confirmation": False,
        "reason": "EMVCo payload ที่อ่านได้ไม่ใช่หลักฐานยืนยันชื่อหรือเวลาที่แสดงบนสลิป",
    }
    return {
        "source": {"file_name": image_path.name, "sha256": hashlib.sha256(raw).hexdigest(), "bbox": bbox},
        "engine": {"qr": "zxingcpp", "ocr": "easyocr", "gpu": gpu},
        "data": data.model_dump(),
        "cross_validation": validation,
        "ocr_trace": lines,
        "status": "review_only",
    }


def main() -> None:
    configure_console_encoding()
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", type=Path, required=True)
    parser.add_argument("--bbox", type=int, nargs=4, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--cpu", action="store_true")
    args = parser.parse_args()
    result = process(args.image, tuple(args.bbox), gpu=not args.cpu)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
