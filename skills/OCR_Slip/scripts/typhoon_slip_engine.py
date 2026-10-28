#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
_skills/OCR_Slip/scripts/typhoon_slip_engine.py — OpenTyphoon Thai Sovereign Vision Engine
Two-Stage Extraction Pipeline:
  - Stage 1 (Vision OCR): typhoon-ocr-v1.5 extracts native Thai characters, accents, and memo text.
  - Stage 2 (Forensic Judge): typhoon-v2.5-30b-a3b-instruct audits and normalizes data into 10-column schema.
Features:
  - Pure Python Standard Library (urllib.request, json, base64)
  - Persistent SHA-256 Cache: Folder_Out/typhoon_cache.json
  - Safe API Key loading from .env (TYPHOON_API_KEY)
"""

import os
import sys
import json
import base64
import hashlib
import time
import urllib.request
import urllib.error
import cv2

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
CACHE_FILE = os.path.join(PROJECT_ROOT, "Folder_Out", "typhoon_cache.json")
ENV_FILE = os.path.join(PROJECT_ROOT, ".env")
BASE_URL = "https://api.opentyphoon.ai/v1"


def load_typhoon_api_key() -> str:
    """Reads TYPHOON_API_KEY safely from environment or .env without logging secrets."""
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
    """Loads persistent Typhoon cache from JSON."""
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_cache(cache_data: dict):
    """Saves updated cache to disk safely."""
    try:
        os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache_data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        sys.stderr.write(f"[Typhoon Engine] Warning: Could not save cache: {e}\n")


def compute_image_hash(img_bytes: bytes) -> str:
    """Computes SHA-256 hash of image bytes for deduplicated caching."""
    return hashlib.sha256(img_bytes).hexdigest()


def typhoon_stage1_ocr(img_bytes: bytes, api_key: str, max_retries: int = 2) -> str:
    """
    Stage 1: Sends image to typhoon-ocr-v1.5 to perform native Thai multimodal OCR.
    Returns detected text string.
    """
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
        "max_tokens": 1200
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
            sys.stderr.write(f"[Typhoon Stage 1 OCR] HTTP {e.code}: {e.reason}\n")
            break
        except Exception as e:
            sys.stderr.write(f"[Typhoon Stage 1 OCR] Request error: {e}\n")
            break
    return ""


STAGE2_PROMPT = """คุณคือผู้เชี่ยวชาญด้านการตรวจสอบพยานหลักฐานการเงินดิจิทัล (Digital Financial Evidence Auditor)
หน้าที่ของคุณคือรับข้อความ OCR ดิบจากสลิปธนาคารไทย แล้วจัดรูปแบบเป็น JSON 10 คอลัมน์ตามมาตรฐานศาล:

กฎเหล็กความถูกต้อง:
1. Zero Guessing: ห้ามเดาหรือมโนข้อมูล ถ้าในข้อความไม่มีฟิลด์ใด ให้ใส่ "-" เท่านั้น
2. Amount: ยอดเงินตัวเลขพร้อมคอมม่าและทศนิยม 2 ตำแหน่ง เช่น "35,000.00"
3. Date: วันที่ในรูปแบบ DD/MM/YYYY (พ.ศ. 256X หรือ ค.ศ.) เช่น "30/05/2568"
4. Time: เวลาในรูปแบบ HH:MM (เช่น "14:21")
5. Sender Bank: ชื่อธนาคารผู้โอน (เช่น "กรุงไทย", "ทีเอ็มบีธนชาต (ttb)", "กสิกรไทย")
6. Sender Name: ชื่อผู้โอน โดยตัดเลขบัญชีและวงเล็บออก เหลือเฉพาะชื่อ-นามสกุลเท่านั้น (เช่น "สิบตรี ณัฐชัย รักษาวงษ์", "นายณัฐชัย")
7. Receiver Bank: ชื่อธนาคารผู้รับ
8. Receiver Name: ชื่อผู้รับ โดยตัดเลขบัญชีและวงเล็บออก เหลือเฉพาะชื่อ-นามสกุลเท่านั้น (เช่น "น.ส. จิณห์นิภา ประสาทเขตการ")
9. Remarks: รหัสอ้างอิงธุรกรรม / Ref ID
10. Memo: ข้อความบันทึกช่วยจำ (ถ้ามี)

ตอบกลับเป็น JSON แท้เท่านั้นในโครงสร้างนี้:
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


def typhoon_stage2_judge(raw_ocr_text: str, api_key: str, max_retries: int = 2) -> dict:
    """
    Stage 2: Passes raw OCR text to typhoon-v2.5-30b-a3b-instruct to audit, validate,
    and format into clean 10-column evidence schema.
    """
    if not raw_ocr_text:
        return {}

    payload = {
        "model": "typhoon-v2.5-30b-a3b-instruct",
        "messages": [
            {"role": "system", "content": STAGE2_PROMPT},
            {"role": "user", "content": f"ข้อความ OCR ดิบจากสลิป:\n{raw_ocr_text}"}
        ],
        "temperature": 0.0,
        "max_tokens": 800
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
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                choices = data.get("choices", [])
                if choices:
                    content = choices[0].get("message", {}).get("content", "").strip()
                    # Clean markdown wrappers
                    if content.startswith("```json"):
                        content = content[7:]
                    if content.startswith("```"):
                        content = content[3:]
                    if content.endswith("```"):
                        content = content[:-3]
                    res = json.loads(content.strip())
                    for k in ["sender_name", "receiver_name"]:
                        if k in res and res[k] and res[k] != "-":
                            res[k] = re.sub(r"\s*[\(\[][Xx\d\s\-*.]+[\)\]]", "", str(res[k]))
                            res[k] = re.sub(r"\s+", " ", res[k]).strip() or "-"
                    return res
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(3 * (attempt + 1))
                continue
            sys.stderr.write(f"[Typhoon Stage 2 Judge] HTTP {e.code}: {e.reason}\n")
            break
        except Exception as e:
            sys.stderr.write(f"[Typhoon Stage 2 Judge] Request error: {e}\n")
            break
    return {}


def extract_slip_with_typhoon(image_input, use_cache: bool = True) -> dict:
    """
    Full 2-Stage Typhoon Pipeline with persistent cache.
    Input can be a file path, raw bytes, or a numpy array (cv2).
    """
    api_key = load_typhoon_api_key()
    if not api_key:
        sys.stderr.write("[Typhoon Engine] Warning: TYPHOON_API_KEY not found in .env\n")
        return {}

    # Prepare image bytes
    if isinstance(image_input, str):
        if not os.path.exists(image_input):
            return {}
        with open(image_input, "rb") as f:
            img_bytes = f.read()
    elif isinstance(image_input, (bytes, bytearray)):
        img_bytes = bytes(image_input)
    else:
        success, encoded = cv2.imencode(".jpg", image_input)
        if not success:
            return {}
        img_bytes = encoded.tobytes()

    img_hash = compute_image_hash(img_bytes)
    cache = load_cache() if use_cache else {}

    if use_cache and img_hash in cache and cache[img_hash].get("amount") != "-":
        return cache[img_hash]

    # Stage 1: Native Thai Multimodal OCR
    raw_ocr = typhoon_stage1_ocr(img_bytes, api_key)
    if not raw_ocr:
        return {}

    # Stage 2: Forensic Judge & Schema Standardization
    judged_data = typhoon_stage2_judge(raw_ocr, api_key)
    if not judged_data:
        judged_data = {"raw_ocr": raw_ocr}

    judged_data["_engine"] = "OpenTyphoon-2Stage-Thai-Sovereign"
    judged_data["_raw_ocr_snippet"] = raw_ocr[:200]

    # Save to persistent cache
    cache[img_hash] = judged_data
    save_cache(cache)

    return judged_data
