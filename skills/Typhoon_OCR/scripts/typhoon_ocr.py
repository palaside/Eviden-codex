#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
_skills/Typhoon_OCR/scripts/typhoon_ocr.py — OpenTyphoon Thai Document & Slip OCR Specialist
Model: typhoon-ocr-v1.5 (with optional typhoon-v2.5-30b-a3b judge)
Base URL: https://api.opentyphoon.ai/v1

Features:
- Native Thai OCR: Accents, vowels, honorifics, Buddhist era dates, transaction memos
- Zero external pip requirements: Uses Python stdlib (urllib.request, json, base64)
- Persistent SHA-256 Cache to Folder_Out/typhoon_cache.json
- PDF page extraction support via PyMuPDF (fitz)
- CLI & Python Import Interface
"""

import os
import sys
import re
import json
import base64
import hashlib
import time
import argparse
import urllib.request
import urllib.error

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
CACHE_FILE = os.path.join(PROJECT_ROOT, "Folder_Out", "typhoon_cache.json")
ENV_FILE = os.path.join(PROJECT_ROOT, ".env")
BASE_URL = "https://api.opentyphoon.ai/v1"

try:
    if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass


def load_api_key() -> str:
    """Reads TYPHOON_API_KEY from environment or .env file."""
    key = os.environ.get("TYPHOON_API_KEY")
    if key and key.strip():
        return key.strip()

    if os.path.exists(ENV_FILE):
        try:
            with open(ENV_FILE, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        if k.strip() == "TYPHOON_API_KEY":
                            val = v.strip().strip("'\"")
                            if val:
                                return val
        except Exception:
            pass
    return ""


def load_cache() -> dict:
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_cache(cache_data: dict):
    try:
        os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache_data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        sys.stderr.write(f"[Typhoon OCR] Warning: Could not save cache: {e}\n")


def compute_hash(data_bytes: bytes) -> str:
    return hashlib.sha256(data_bytes).hexdigest()


def ocr_image_raw(img_bytes: bytes, api_key: str = None, max_retries: int = 2) -> str:
    """Sends image to typhoon-ocr and returns detected text."""
    if not api_key:
        api_key = load_api_key()
    if not api_key:
        raise ValueError("TYPHOON_API_KEY is not set in .env or environment.")

    b64_image = base64.b64encode(img_bytes).decode("utf-8")
    payload = {
        "model": "typhoon-ocr",
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Extract all text from the image."
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{b64_image}"}
                    }
                ]
            }
        ],
        "max_tokens": 1500
    }
    payload_json = json.dumps(payload).encode("utf-8")
    url = f"{BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    for attempt in range(max_retries):
        req = urllib.request.Request(url, data=payload_json, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=35) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                choices = data.get("choices", [])
                if choices:
                    return choices[0].get("message", {}).get("content", "").strip()
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(3 * (attempt + 1))
                continue
            sys.stderr.write(f"[Typhoon OCR] HTTP {e.code}: {e.reason}\n")
            break
        except Exception as e:
            sys.stderr.write(f"[Typhoon OCR] Request error: {e}\n")
            break
    return ""


JUDGE_SYSTEM_PROMPT = """คุณคือผู้เชี่ยวชาญด้านการตรวจสอบพยานหลักฐานการเงินดิจิทัล (Digital Financial Evidence Auditor)
หน้าที่ของคุณคือรับข้อความ OCR ดิบจากสลิปธนาคารไทย แล้วจัดรูปแบบเป็น JSON 10 คอลัมน์ตามมาตรฐานศาล:

กฎเหล็ก:
1. Zero Guessing: ห้ามเดาข้อมูล ถ้าในข้อความไม่มีฟิลด์ใด ให้ใส่ "-" เท่านั้น
2. Amount: ยอดเงินตัวเลขพร้อมคอมม่าและทศนิยม 2 ตำแหน่ง เช่น "35,000.00"
3. Date: วันที่ในรูปแบบ DD/MM/YYYY (พ.ศ. 256X หรือ ค.ศ.) เช่น "30/05/2568"
4. Time: เวลาในรูปแบบ HH:MM (เช่น "14:21")
5. Sender Bank: ชื่อธนาคารผู้โอน (เช่น "กรุงไทย", "ทีเอ็มบีธนชาต (ttb)", "กสิกรไทย")
6. Sender Name: ชื่อผู้โอน โดยตัดเลขบัญชีและวงเล็บออก เหลือเฉพาะชื่อ-นามสกุลเท่านั้น (เช่น "สิบตรี ณัฐชัย รักษาวงษ์", "นายณัฐชัย")
7. Receiver Bank: ชื่อธนาคารผู้รับ
8. Receiver Name: ชื่อผู้รับ โดยตัดเลขบัญชีและวงเล็บออก เหลือเฉพาะชื่อ-นามสกุลเท่านั้น (เช่น "น.ส. จิณห์นิภา ประสาทเขตการ")
9. Remarks: รหัสอ้างอิงธุรกรรม / Ref ID
10. Memo: ข้อความบันทึกช่วยจำ (ถ้ามี)

ตอบกลับเป็น JSON แท้เท่านั้น:
{
  "amount": "-",
  "date": "-",
  "time": "-",
  "sender_bank": "-",
  "sender_name": "-",
  "receiver_bank": "-",
  "receiver_name": "-",
  "remarks": "-",
  "memo": "-"
}"""


def judge_structured_slip(raw_text: str, api_key: str = None) -> dict:
    """Uses typhoon-v2.5-30b-a3b-instruct to parse raw OCR text into evidence schema."""
    if not api_key:
        api_key = load_api_key()
    if not api_key or not raw_text:
        return {}

    payload = {
        "model": "typhoon-v2.5-30b-a3b-instruct",
        "messages": [
            {"role": "system", "content": JUDGE_SYSTEM_PROMPT},
            {"role": "user", "content": f"ข้อความ OCR ดิบ:\n{raw_text}"}
        ],
        "temperature": 0.0,
        "max_tokens": 600
    }
    payload_json = json.dumps(payload).encode("utf-8")
    url = f"{BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    req = urllib.request.Request(url, data=payload_json, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            choices = data.get("choices", [])
            if choices:
                content = choices[0].get("message", {}).get("content", "").strip()
                if content.startswith("```json"):
                    content = content[7:]
                if content.startswith("```"):
                    content = content[3:]
                res = json.loads(content.strip())
                for k in ["sender_name", "receiver_name"]:
                    if k in res and res[k] and res[k] != "-":
                        res[k] = re.sub(r"\s*[\(\[][Xx\d\s\-*.]+[\)\]]", "", str(res[k]))
                        res[k] = re.sub(r"\s+", " ", res[k]).strip() or "-"
                return res
    except Exception as e:
        sys.stderr.write(f"[Typhoon Judge] Error: {e}\n")
    return {}


def process_slip(image_input, structured: bool = True, use_cache: bool = True) -> dict:
    """
    Main entry point for Typhoon OCR skill.
    Supports file path or image bytes.
    """
    api_key = load_api_key()
    if not api_key:
        raise ValueError("TYPHOON_API_KEY is not configured in .env or environment.")

    # Read bytes
    if isinstance(image_input, str):
        if not os.path.exists(image_input):
            raise FileNotFoundError(f"File not found: {image_input}")
        with open(image_input, "rb") as f:
            img_bytes = f.read()
    else:
        img_bytes = bytes(image_input)

    img_hash = compute_hash(img_bytes)
    cache = load_cache() if use_cache else {}

    if use_cache and img_hash in cache and cache[img_hash].get("amount") != "-":
        return cache[img_hash]

    raw_text = ocr_image_raw(img_bytes, api_key)
    if not raw_text:
        return {"amount": "-", "date": "-", "time": "-", "sender_bank": "-", "sender_name": "-", "receiver_bank": "-", "receiver_name": "-", "remarks": "-", "memo": "-", "_raw_text": ""}

    if structured:
        result = judge_structured_slip(raw_text, api_key)
        if not result:
            result = {"raw_text": raw_text}
        else:
            result["_raw_text"] = raw_text
    else:
        result = {"raw_text": raw_text}

    result["_model"] = "typhoon-ocr"
    result["_hash"] = img_hash

    if use_cache:
        cache[img_hash] = result
        save_cache(cache)

    return result


def main():
    parser = argparse.ArgumentParser(description="Typhoon_OCR — OpenTyphoon Thai Document & Slip OCR")
    parser.add_argument("file", help="Path to image file or PDF")
    parser.add_argument("--page", type=int, default=1, help="Page number if input is PDF (1-indexed)")
    parser.add_argument("--raw", action="store_true", help="Output raw OCR text without JSON judging")
    parser.add_argument("--no-cache", action="store_true", help="Bypass cache and force fresh API query")
    parser.add_argument("--out", help="Path to save output JSON or text")
    args = parser.parse_args()

    file_path = args.file
    if not os.path.exists(file_path):
        print(f"❌ File not found: {file_path}")
        sys.exit(1)

    # Handle PDF input
    if file_path.lower().endswith(".pdf"):
        try:
            import fitz
            doc = fitz.open(file_path)
            if args.page < 1 or args.page > len(doc):
                print(f"❌ Invalid page number {args.page}. Document has {len(doc)} pages.")
                sys.exit(1)
            pix = doc[args.page - 1].get_pixmap(dpi=200)
            img_bytes = pix.tobytes("png")
            doc.close()
        except ImportError:
            print("❌ PyMuPDF (fitz) required to process PDF pages directly.")
            sys.exit(1)
    else:
        with open(file_path, "rb") as f:
            img_bytes = f.read()

    print(f"🌪️ Processing {os.path.basename(file_path)} with typhoon-ocr-v1.5...")
    res = process_slip(img_bytes, structured=not args.raw, use_cache=not args.no_cache)

    if args.raw:
        output_str = res.get("raw_text", "") or res.get("_raw_text", "") or res.get("_raw_ocr_snippet", "")
        print("\n--- RAW OCR OUTPUT ---")
        print(output_str)
    else:
        output_str = json.dumps(res, ensure_ascii=False, indent=2)
        print("\n--- STRUCTURED 10-COLUMN EVIDENCE ---")
        print(output_str)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(output_str)
        print(f"\n💾 Saved result to: {args.out}")


if __name__ == "__main__":
    main()
