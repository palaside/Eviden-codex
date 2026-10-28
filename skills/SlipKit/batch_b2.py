# -*- coding: utf-8 -*-
"""Batch B2 จริง (ไม่ใช่ mock): preprocess -> EasyOCR -> parse/trim/amounts/parties -> report."""
import asyncio
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "vendor"))
from slip_preprocess import auto_crop
from bank_slip_reader.slip_parser import SlipParser
from amounts import find_amount_candidates

sys.path.insert(0, r"F:\Project")
from slip_names import extract_candidates
from parties import assign_parties

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "samples", "uploads")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "batch_b2_report.json")


def main():
    import cv2
    import easyocr
    files = sorted(f for f in os.listdir(SRC) if os.path.isfile(os.path.join(SRC, f)))[:32]
    reader = easyocr.Reader(["th", "en"], gpu=False)
    parser = SlipParser(mode="rule_based")
    recs, fails = [], []

    async def one(fn):
        img = cv2.imread(os.path.join(SRC, fn))
        if img is None:
            return None
        h, w = img.shape[:2]
        sc = 960 / w if w > 960 else 1.0
        base = cv2.resize(img, (int(w * sc), int(h * sc))) if sc < 1 else img
        gray = cv2.cvtColor(auto_crop(base), cv2.COLOR_BGR2GRAY)
        enh = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(
            cv2.fastNlMeansDenoising(gray, None, h=10, templateWindowSize=7, searchWindowSize=21))
        res = reader.readtext(enh, detail=0)
        full = " ".join(res)
        try:
            d = await parser.parse(full, file_name=fn)
            dd = {k: (str(x) if x is not None else None) for k, x in vars(d).items()}
        except Exception as e:
            dd = {"_error": str(e)[:80]}
        cands = extract_candidates(full)
        parties = assign_parties(cands, full)
        amts = find_amount_candidates(full)
        amt = next((v for v, s in amts if s == "amount_label"),
                   next((v for v, s in amts if s not in ("fee", "ref_label")), "-"))
        return {"file": fn, "bank": dd.get("bank_name"), "date": dd.get("transaction_date"),
                "ref": dd.get("transaction_id"), "amount": amt,
                "sender": parties["sender_name"], "receiver": parties["receiver_name"],
                "review": parties["needs_review"]}

    for i, fn in enumerate(files):
        t0 = time.time()
        try:
            r = asyncio.run(one(fn))
            if r:
                r["secs"] = round(time.time() - t0, 1)
                recs.append(r)
        except Exception as e:
            fails.append((fn, str(e)[:80]))
        if (i + 1) % 4 == 0:
            json.dump({"records": recs, "failed": fails}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
            print(f"b2 {i + 1}/{len(files)}", flush=True)
    json.dump({"records": recs, "failed": fails}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    print("B2_DONE n=", len(recs), flush=True)


if __name__ == "__main__":
    main()
