#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
_skills/OCR_Slip/scripts/gemini_slip_fallback.py — Gemini Multimodal Emergency Fallback
Role: Tier-3 Emergency Fallback Engine for damaged/unresolved Thai bank transfer slips.
Triggered ONLY when:
  1. EMVCo QR Code failed to decode (remarks == "-")
  2. Primary Local OCR failed to extract critical financial fields (amount == "-" OR date == "-")

Features:
- Pure Python Standard Library (urllib.request, json, base64) — Zero external pip dependencies
- Multi-Model Resilience: Tries gemini-2.5-flash, then falls back to gemini-1.5-flash
- Persistent Caching: Saves raw response to Folder_Out/gemini_fallback_cache.json by SHA256
- Strict Zero-Guessing: Prompt enforces strict output or "-" if unreadable
- Rate Limit & Timeout Protection
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
CACHE_FILE = os.path.join(PROJECT_ROOT, "Folder_Out", "gemini_fallback_cache.json")
ENV_FILE = os.path.join(PROJECT_ROOT, ".env")

# Preferred Gemini models for structured vision extraction
SUPPORTED_MODELS = ["gemini-2.5-flash", "gemini-1.5-flash"]


def load_api_key() -> str:
    """Reads GEMINI_API_KEY from environment or .env file (safe loading, no logging of secrets)."""
    key = os.environ.get("GEMINI_API_KEY")
    if key and key.strip():
        return key.strip()

    if os.path.exists(ENV_FILE):
        try:
            with open(ENV_FILE, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        if k.strip() == "GEMINI_API_KEY":
                            val = v.strip().strip("'\"")
                            if val:
                                return val
        except Exception:
            pass
    return ""


def load_cache() -> dict:
    """Loads persistent fallback cache from JSON."""
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_cache(cache_data: dict):
    """Saves updated fallback cache to disk safely."""
    try:
        os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache_data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        sys.stderr.write(f"[Gemini Fallback] Warning: Could not save cache: {e}\n")


def compute_image_hash(img_bytes: bytes) -> str:
    """Computes SHA-256 hash of image bytes for deduplicated caching."""
    return hashlib.sha256(img_bytes).hexdigest()


def should_trigger_gemini(slip_data: dict) -> bool:
    """
    Decides whether an image warrants invoking the Tier-3 Emergency Fallback.
    Constraint: Only triggers if QR code failed AND (amount is missing OR date is missing).
    """
    if not slip_data:
        return False
    qr_failed = (slip_data.get("remarks") == "-" or not slip_data.get("remarks"))
    amount_missing = (slip_data.get("amount") == "-" or not slip_data.get("amount") or slip_data.get("amount") == "0.00")
    date_missing = (slip_data.get("date") == "-" or not slip_data.get("date"))
    return qr_failed and (amount_missing or date_missing)


SYSTEM_PROMPT = """You are an elite forensic specialist in Thai banking transfer slips (หลักฐานสลิปโอนเงินธนาคารไทย).
Your task is to accurately extract financial transaction evidence from the provided slip image.

STRICT EVIDENCE INTEGRITY RULES:
1. Zero Guessing: If any field is blurry, cropped, or not present, output "-" for that field. Never invent names or numbers.
2. Amount: Extract total transferred amount in Baht with 2 decimal places (e.g. "1,500.00" or "350.00").
3. Date: Extract date formatted as DD/MM/YYYY in Thai Buddhist Era (256X) or Gregorian (e.g. "15/04/2567").
4. Time: Format as HH:MM (24-hour, e.g. "14:35").
5. Sender Bank: Name of originating bank in Thai (e.g. "กรุงไทย", "ทีเอ็มบีธนชาต (ttb)", "กสิกรไทย", "ไทยพาณิชย์", "กรุงศรีอยุธยา").
6. Sender Name: Sender full name and account number if visible (e.g. "นายสมชาย ใจดี (xxx-1-23456-7)").
7. Receiver Bank: Name of destination bank in Thai.
8. Receiver Name: Receiver full name and account number if visible.
9. Ref ID: Transaction reference code (รหัสอ้างอิงธุรกรรม / Ref ID).
10. Memo: Transaction note or memo if present (บันทึกช่วยจำ).

Return ONLY valid JSON matching this exact structure:
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


def call_gemini_vision(img_bytes: bytes, api_key: str, max_retries: int = 2) -> dict:
    """
    Dispatches image to Gemini Multimodal API via HTTPS POST.
    Tries preferred models and handles rate limits.
    """
    b64_image = base64.b64encode(img_bytes).decode("utf-8")
    
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": SYSTEM_PROMPT},
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": b64_image
                        }
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.0,
            "response_mime_type": "application/json"
        }
    }
    payload_json = json.dumps(payload).encode("utf-8")

    for model in SUPPORTED_MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        headers = {"Content-Type": "application/json"}

        for attempt in range(max_retries):
            req = urllib.request.Request(url, data=payload_json, headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    resp_data = json.loads(resp.read().decode("utf-8"))
                    candidates = resp_data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts:
                            raw_text = parts[0].get("text", "").strip()
                            # Clean possible markdown wrapping
                            if raw_text.startswith("```json"):
                                raw_text = raw_text[7:]
                            if raw_text.startswith("```"):
                                raw_text = raw_text[3:]
                            if raw_text.endswith("```"):
                                raw_text = raw_text[:-3]
                            return json.loads(raw_text.strip())
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    # Rate limit encountered: wait and retry
                    time.sleep(3 * (attempt + 1))
                    continue
                elif e.code == 404:
                    # Model not available, try next model
                    break
                else:
                    sys.stderr.write(f"[Gemini Fallback] HTTP {e.code}: {e.reason}\n")
                    break
            except Exception as e:
                sys.stderr.write(f"[Gemini Fallback] Request error ({model}): {e}\n")
                break
    return {}


def recover_unresolved_slip(image_input, slip_data: dict) -> dict:
    """
    Main entry point for Tier-3 Emergency Fallback.
    Only called when slip_data requires recovery.
    Integrates results non-destructively, preserving valid fields from Primary Local OCR.
    """
    if not should_trigger_gemini(slip_data):
        return slip_data

    # 1. Prioritize OpenTyphoon Thai Sovereign 2-Stage Engine if configured
    typhoon_key = os.environ.get("TYPHOON_API_KEY")
    if not typhoon_key and os.path.exists(ENV_FILE):
        try:
            with open(ENV_FILE, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip().startswith("TYPHOON_API_KEY="):
                        typhoon_key = line.strip().split("=", 1)[1].strip().strip("'\"")
        except Exception:
            pass

    if typhoon_key:
        try:
            try:
                from typhoon_slip_engine import extract_slip_with_typhoon
            except ImportError:
                from _skills.OCR_Slip.scripts.typhoon_slip_engine import extract_slip_with_typhoon

            typhoon_res = extract_slip_with_typhoon(image_input)
            if typhoon_res and (typhoon_res.get("amount") != "-" or typhoon_res.get("date") != "-"):
                merged = dict(slip_data)
                for field in ["amount", "date", "time", "sender_bank", "sender_name", "receiver_bank", "receiver_name", "remarks", "memo"]:
                    curr_val = merged.get(field, "-")
                    t_val = typhoon_res.get(field, "-")
                    if (curr_val == "-" or not curr_val or curr_val == "ไม่ระบุชื่อ (อ่านจากภาพไม่ได้)") and t_val and t_val != "-":
                        merged[field] = t_val
                merged["_recovered_by"] = "OpenTyphoon-Thai-Sovereign-2Stage"
                return merged
        except Exception as e:
            sys.stderr.write(f"[Fallback] Typhoon attempt note: {e}\n")

    api_key = load_api_key()
    if not api_key:
        # Graceful no-op when neither key is configured
        return slip_data

    # Prepare image bytes
    if isinstance(image_input, str):
        if not os.path.exists(image_input):
            return slip_data
        with open(image_input, "rb") as f:
            img_bytes = f.read()
    elif isinstance(image_input, (bytes, bytearray)):
        img_bytes = bytes(image_input)
    else:
        # Numpy array from cv2
        success, encoded = cv2.imencode(".jpg", image_input)
        if not success:
            return slip_data
        img_bytes = encoded.tobytes()

    img_hash = compute_image_hash(img_bytes)
    cache = load_cache()

    # Check cache first
    if img_hash in cache:
        gemini_res = cache[img_hash]
    else:
        gemini_res = call_gemini_vision(img_bytes, api_key)
        if gemini_res:
            cache[img_hash] = gemini_res
            save_cache(cache)

    if not gemini_res:
        return slip_data

    # Non-destructive merge: Only fill fields that are currently "-"
    merged = dict(slip_data)
    for field in ["amount", "date", "time", "sender_bank", "sender_name", "receiver_bank", "receiver_name", "remarks", "memo"]:
        curr_val = merged.get(field, "-")
        gemini_val = gemini_res.get(field, "-")
        if (curr_val == "-" or not curr_val or curr_val == "ไม่ระบุชื่อ (อ่านจากภาพไม่ได้)") and gemini_val and gemini_val != "-":
            merged[field] = gemini_val

    merged["_recovered_by"] = "Gemini-Multimodal-Emergency-Fallback"
    return merged
