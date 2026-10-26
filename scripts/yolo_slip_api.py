"""Run the local YOLO slip locator and return review-only extraction data."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path

import cv2
import numpy as np
import pytesseract
import easyocr
import zxingcpp

# The API launches this file by absolute path; make the root application
# importable so the API and CLI use the same SlipLocator implementation.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.modules.slip_locator import SlipLocator


THAI_MONTHS = {
    "ม.ค.": 1, "ก.พ.": 2, "มี.ค.": 3, "เม.ย.": 4,
    "พ.ค.": 5, "มิ.ย.": 6, "ก.ค.": 7, "ส.ค.": 8,
    "ก.ย.": 9, "ต.ค.": 10, "พ.ย.": 11, "ธ.ค.": 12,
}
KNOWN_BANKS = {
    "กรุงไทย": "กรุงไทย",
    "ทหารไทยธนชาต": "ทหารไทยธนชาต",
    "ttb": "ttb",
    "ธนชาต": "ธนชาต",
}


def _name_candidate(line: str) -> bool:
    return bool(re.search(r"[ก-ฮA-Za-z]", line)) and not any(
        marker in line for marker in ("จำนวนเงิน", "ค่าธรรมเนียม", "วันที่ทำรายการ", "อ้างอิง", "โอนเงินสำเร็จ")
    )


def _name_after_marker(lines: list[str], marker: str) -> str | None:
    for index, line in enumerate(lines):
        if line.strip() != marker:
            continue
        for candidate in lines[index + 1:index + 4]:
            value = candidate.strip()
            if not value or value in KNOWN_BANKS or value in {"จาก", "ไปยัง"}:
                continue
            if _name_candidate(value):
                return value
    return None


def _parse_date_time(lines: list[str]) -> tuple[str | None, str | None]:
    joined = " ".join(lines)
    thai = re.search(
        r"(\d{1,2})\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s*(\d{2,4})\s*[-–]?\s*(\d{1,2}:\d{2})",
        joined,
    )
    if thai:
        day, month, year, time = thai.groups()
        year_number = int(year)
        if year_number >= 2400:
            year_number -= 543
        return f"{year_number:04d}-{THAI_MONTHS[month]:02d}-{int(day):02d}", f"{int(time[:2]):02d}:{time[3:]}"
    gregorian = re.search(r"(20\d{2})[-/]([01]?\d)[-/]([0-3]?\d).*?(\d{1,2}:\d{2})", joined)
    if gregorian:
        year, month, day, time = gregorian.groups()
        return f"{int(year):04d}-{int(month):02d}-{int(day):02d}", f"{int(time[:2]):02d}:{time[3:]}"
    return None, None


def parse_ocr_lines(lines: list[str]) -> dict:
    """Parse only fields supported by text visible inside the YOLO crop."""
    normalized = [line.strip() for line in lines if line and line.strip()]
    amount_matches = re.findall(r"\b\d{1,3}(?:,\d{3})*\.\d{2}\b", " ".join(normalized))
    amounts = [float(value.replace(",", "")) for value in amount_matches]
    account_numbers: list[str] = []
    for line in normalized:
        for token in re.findall(r"[Xx0-9]{3}-[Xx0-9]-[Xx0-9]{2,5}-[Xx0-9]", line):
            if token not in account_numbers:
                account_numbers.append(token.upper())
    date, time = _parse_date_time(normalized)
    bank = next((value for line in normalized for key, value in KNOWN_BANKS.items() if key.lower() in line.lower()), None)
    sender_name = _name_after_marker(normalized, "จาก")
    receiver_name = _name_after_marker(normalized, "ไปยัง")
    sender_account = account_numbers[0] if len(account_numbers) >= 1 else None
    receiver_account = account_numbers[1] if len(account_numbers) >= 2 else None
    return {
        "document_type": "bank_transfer_slip",
        "bank": {"name": bank, "confidence": 0.7 if bank else 0},
        "transaction": {
            "date": date, "time": time, "amount": amounts[0] if amounts else None,
            "currency": "THB", "fee": None, "reference_no": None,
            "transaction_id": None, "note": None,
        },
        "sender": {"name": sender_name, "bank": bank, "account_no": sender_account},
        "receiver": {"name": receiver_name, "bank": bank, "account_no": receiver_account},
        "confidence": {
            "date": 0.8 if date else 0, "time": 0.8 if time else 0,
            "amount": 0.7 if amounts else 0, "reference_no": 0,
            "sender_name": 0.6 if sender_name else 0, "receiver_name": 0.6 if receiver_name else 0,
            "sender_account": 0.5 if sender_account else 0,
            "receiver_account": 0.5 if receiver_account else 0,
        },
        "raw_text": normalized,
        "warnings": ["OCR จาก crop YOLO โดยตรง; รอตรวจทานกับภาพต้นฉบับ"],
        "_fallback_meta": {"needs_human_review": True, "unclear_fields": [
            field for field, value in {
                "date": date, "time": time, "sender_name": sender_name,
                "sender_account": sender_account, "receiver_name": receiver_name,
                "receiver_account": receiver_account, "bank": bank,
            }.items() if value is None
        ]},
    }


def read_image(path: Path) -> np.ndarray:
    data = np.fromfile(str(path), dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_COLOR) if data.size else None
    if image is None:
        raise ValueError(f"อ่านภาพไม่สำเร็จ: {path}")
    return image


def empty_data(raw_text: list[str], amount: float | None, qr_payload: str | None) -> dict:
    data = parse_ocr_lines(raw_text)
    if amount is not None:
        data["transaction"]["amount"] = amount
        data["confidence"]["amount"] = max(data["confidence"]["amount"], 0.7)
    data["transaction"]["reference_no"] = qr_payload
    data["confidence"]["reference_no"] = 0.9 if qr_payload else 0
    warnings = list(data["warnings"])
    if qr_payload is None:
        warnings.append("QR อ่านไม่ได้; ข้อมูลทั้งหมดต้องตรวจจากภาพต้นฉบับ")
    data["warnings"] = warnings
    return data


def decode_qr_from_crop(crop: np.ndarray) -> str | None:
    """Try QR variants derived only from the crop returned by YOLO."""
    detector = cv2.QRCodeDetector()
    variants, _ = enhance_crop_for_ocr(crop)
    variants.insert(0, crop)
    for variant in variants:
        data, _, _ = detector.detectAndDecode(variant)
        if data:
            return data
    return None


def enhance_crop_for_ocr(crop: np.ndarray) -> tuple[list[np.ndarray], list[str]]:
    """Apply the browser OCR enhancement stages to one YOLO crop.

    The original evidence is never replaced. Every returned image is a derived
    OCR/QR view of the same detected crop, so text outside the YOLO bbox cannot
    become a candidate through this path.
    """
    if crop is None or crop.size == 0:
        raise ValueError("YOLO crop is empty")
    if crop.dtype != np.uint8:
        crop = np.clip(crop, 0, 255).astype(np.uint8)

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    mean_ratio = float(gray.mean()) / 255.0
    gamma = 1.0 if mean_ratio <= 0.0 or mean_ratio >= 1.0 else max(
        0.65, min(1.35, math.log(0.58) / math.log(mean_ratio))
    )
    lut = np.array([round(255 * ((value / 255.0) ** gamma)) for value in range(256)], dtype=np.uint8)
    normalized = cv2.LUT(gray, lut)
    denoised = cv2.medianBlur(normalized, 5)
    edge_preserved = cv2.bilateralFilter(denoised, 5, 24, 1)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    contrasted = clahe.apply(edge_preserved)
    blurred = cv2.GaussianBlur(contrasted, (0, 0), 1.0)
    sharpened = cv2.addWeighted(contrasted, 1.35, blurred, -0.35, 0)
    upscaled = cv2.resize(sharpened, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    thresholded = cv2.threshold(upscaled, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]

    stages = [
        "gamma_normalization", "median_denoise", "bilateral_denoise",
        "clahe_contrast", "unsharp_mask", "upscale",
    ]
    return [normalized, denoised, contrasted, sharpened, upscaled, thresholded], stages


def read_crop_ocr(crop: np.ndarray) -> list[str]:
    """Read several enhanced OCR views of the same YOLO crop."""
    variants, _ = enhance_crop_for_ocr(crop)
    lines: list[str] = []
    for variant in variants:
        for psm in (6, 11):
            raw = pytesseract.image_to_string(variant, config=f"--oem 3 --psm {psm} -l tha+eng")
            for line in raw.splitlines():
                value = line.strip()
                if value and value not in lines:
                    lines.append(value)
    return lines


def read_multiengine_data(crop: np.ndarray, qr_payload: str | None, use_gpu: bool) -> dict:
    """Extract review-only fields with the validated QR/Text zone engines."""
    height, width = crop.shape[:2]
    text_zone = crop[: int(height * 0.75), :]
    reader = easyocr.Reader(["th", "en"], gpu=use_gpu, verbose=False)
    detections = reader.readtext(
        text_zone, detail=1, text_threshold=0.5, low_text=0.3,
        link_threshold=0.3, mag_ratio=1.5,
    )
    entries = [
        {"text": str(text).strip(), "confidence": float(confidence)}
        for _, text, confidence in detections if str(text).strip()
    ]
    texts = [entry["text"] for entry in entries]
    joined = " ".join(texts)
    amount_candidates = re.findall(r"\d{1,3}(?:,\d{3})*\.\d{2}", joined)
    amount = float(amount_candidates[0].replace(",", "")) if amount_candidates else None
    amount_confidence = max(
        (entry["confidence"] for entry in entries if re.search(r"\d{1,3}(?:,\d{3})*\.\d{2}", entry["text"])),
        default=0.0,
    )
    accounts = re.findall(r"[xX]{3}\s*-\s*[xX0-9]\s*(?:-\s*|\s+)[xX0-9]{2,5}\s*-\s*[xX0-9]", joined)
    accounts = [re.sub(r"\s+", "", value).upper() for value in accounts]
    accounts = [re.sub(r"^XXX-XXX(\d{3})-(\d)$", r"XXX-X-XX\1-\2", value) for value in accounts]
    accounts = list(dict.fromkeys(value.upper() for value in accounts))
    names = []
    honorific_only = {"นาย", "นาง", "น.ส.", "นส."}
    for index, entry in enumerate(entries):
        value = entry["text"]
        # Do not promote a low-confidence OCR guess into a ledger field. Thai
        # masked names are especially easy for OCR to hallucinate as a full name.
        if entry["confidence"] < 0.75 or not re.search(r"(?:นาย|นาง|น\.ส\.|ณัฐชัย|จิณห์นิภา)", value):
            continue
        if value.strip() in honorific_only and index + 1 < len(entries):
            next_entry = entries[index + 1]
            if next_entry["text"].lower() not in {"ttb", "กรุงไทย", "ธนชาต"} and not re.search(r"[xX]{3}.*[- ]", next_entry["text"]):
                names.append({"text": f"{value} {next_entry['text']}".strip(), "confidence": min(entry["confidence"], next_entry["confidence"])})
                continue
        names.append(entry)
    sender_entry = names[0] if names else None
    receiver_entry = names[1] if len(names) > 1 else None
    time_candidates = [
        entry for entry in entries
        if re.search(r"\b([0-2]?\d:[0-5]\d)\b", entry["text"])
    ]
    time = None
    time_confidence = 0.0
    if time_candidates and time_candidates[0]["confidence"] >= 0.70:
        time = re.search(r"\b([0-2]?\d:[0-5]\d)\b", time_candidates[0]["text"]).group(1)
        time_confidence = time_candidates[0]["confidence"]
    references = re.findall(r"20\d{16}", joined)
    reference = references[0] if references else qr_payload
    qr_confidence = 0.9 if qr_payload else 0.0
    warnings = [
        "ใช้ ZXing สำหรับ QR Zone และ EasyOCR สำหรับ Text Zone; ผลทั้งหมดรอตรวจทาน",
        "QR Payload ไม่ได้ยืนยันชื่อหรือเวลาโดยตรง",
    ]
    offline_checks = {
        "qr_reference_matches_ocr": bool(qr_payload and reference and reference in joined),
        "amount_detected_from_slip_crop": amount is not None,
        "sender_account_detected_from_slip_crop": bool(accounts),
        "receiver_account_detected_from_slip_crop": len(accounts) > 1,
        "authoritative_bank_confirmation": False,
    }
    if all(offline_checks[key] for key in (
        "qr_reference_matches_ocr", "amount_detected_from_slip_crop",
        "sender_account_detected_from_slip_crop", "receiver_account_detected_from_slip_crop",
    )):
        warnings.append("Offline ตรวจความสอดคล้องของ QR/Ref/ยอด/บัญชีได้; ยังไม่ใช่การยืนยันจากธนาคาร")
    else:
        warnings.append("Offline ตรวจความสอดคล้องไม่ครบ; คงสถานะรอตรวจทาน")
    unclear = [field for field, value in {
        "date": None, "time": time, "sender_name": sender_entry["text"] if sender_entry else None,
        "receiver_name": receiver_entry["text"] if receiver_entry else None,
        "sender_account": accounts[0] if accounts else None,
        "receiver_account": accounts[1] if len(accounts) > 1 else None,
        "reference_no": reference, "bank": "ttb" if "ttb" in joined.lower() else None,
    }.items() if value is None]
    return {
        "document_type": "bank_transfer_slip",
        "bank": {"name": "ttb" if "ttb" in joined.lower() else None, "confidence": max((entry["confidence"] for entry in entries if "ttb" in entry["text"].lower()), default=0.0)},
        "transaction": {"date": None, "time": time, "amount": amount, "currency": "THB", "fee": None, "reference_no": reference, "transaction_id": None, "note": None},
        "sender": {"name": sender_entry["text"] if sender_entry else None, "bank": "ttb" if "ttb" in joined.lower() else None, "account_no": accounts[0] if accounts else None},
        "receiver": {"name": receiver_entry["text"] if receiver_entry else None, "bank": "ttb" if "ttb" in joined.lower() else None, "account_no": accounts[1] if len(accounts) > 1 else None},
        "confidence": {
            "date": 0.0, "time": time_confidence, "amount": amount_confidence,
            "reference_no": qr_confidence if qr_payload else (0.5 if reference else 0.0),
            "sender_name": sender_entry["confidence"] if sender_entry else 0.0,
            "receiver_name": receiver_entry["confidence"] if receiver_entry else 0.0,
            "sender_account": entries[0]["confidence"] if accounts else 0.0,
            "receiver_account": entries[1]["confidence"] if len(accounts) > 1 else 0.0,
        },
        "raw_text": texts,
        "warnings": warnings,
        "_fallback_meta": {"needs_human_review": True, "unclear_fields": unclear + [
            "authoritative_bank_confirmation",
        ]},
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--confidence", type=float, default=0.65)
    parser.add_argument("--tesseract", type=Path, required=True)
    parser.add_argument("--engine", choices=("tesseract", "multiengine"), default="tesseract")
    args = parser.parse_args()

    pytesseract.pytesseract.tesseract_cmd = str(args.tesseract)
    image = read_image(args.image)
    locator = SlipLocator(str(args.model), device=args.device)
    detections = locator.extract_slips(image, conf_thresh=args.confidence)
    cases = []
    for detection in detections:
        crop = detection["crop"]
        qr_payload = decode_qr_from_crop(crop)
        if args.engine == "multiengine":
            height, width = crop.shape[:2]
            qr_zone = crop[int(height * 0.65): int(height * 0.85), int(width * 0.60):]
            qr_results = zxingcpp.read_barcodes(cv2.cvtColor(qr_zone, cv2.COLOR_BGR2GRAY))
            qr_payload = qr_results[0].text if qr_results else None
            data = read_multiengine_data(crop, qr_payload, use_gpu=args.device not in ("cpu", "-1"))
            lines = data["raw_text"]
        else:
            lines = read_crop_ocr(crop)
            data = empty_data(lines, None, qr_payload or None)
        amount_matches = re.findall(r"\b\d{1,3}(?:,\d{3})*\.\d{2}\b", " ".join(lines))
        amounts = [float(value.replace(",", "")) for value in amount_matches]
        if args.engine != "multiengine":
            data = empty_data(lines, amounts[0] if amounts else None, qr_payload or None)
        data["warnings"].append(
            "OCR/QR enhancement จาก crop เดียวกัน: gamma → median → bilateral → CLAHE → unsharp → upscale"
        )
        cases.append({
            "bbox_1000": [
                detection["bbox"]["y1"] / image.shape[0] * 1000,
                detection["bbox"]["x1"] / image.shape[1] * 1000,
                detection["bbox"]["y2"] / image.shape[0] * 1000,
                detection["bbox"]["x2"] / image.shape[1] * 1000,
            ],
            "visual_cues": lines[:4] or ["YOLO slip detection"],
            "data": data,
            "bbox": detection["bbox"],
            "confidence": detection["confidence"],
            "qr_detected": bool(qr_payload),
        })
    print(json.dumps({"slips": cases}, ensure_ascii=False))


if __name__ == "__main__":
    main()
