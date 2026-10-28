import argparse
import base64
import json
import re
import sys

from pypdf import PdfReader


def normalize(value):
    return re.sub(r"\s+", " ", value or "").strip().casefold()


def evidence_page_marker(source_file, page_label):
    payload = json.dumps(
        {"source_file": source_file, "page_label": page_label},
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return "APP_EVIDENCE_PAGE:" + base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def map_evidence_pages(pdf_path, descriptors, password=""):
    reader = PdfReader(pdf_path)
    if reader.is_encrypted and not reader.decrypt(password):
        raise ValueError("รหัสผ่านไม่สามารถเปิด PDF เพื่อทำ page index ได้")

    page_texts = [normalize(page.extract_text() or "") for page in reader.pages]
    mappings = []
    for descriptor in descriptors:
        key = descriptor["key"]
        source_file = descriptor["source_file"]
        page_label = descriptor["page_label"]
        if not key or not source_file.strip() or not page_label.strip():
            raise ValueError("descriptor ต้องมี key, source_file และ page_label")
        marker = evidence_page_marker(source_file, page_label)
        pages = [
            page_number
            for page_number, text in enumerate(page_texts, start=1)
            if normalize(marker) in text
        ]
        occurrence_index = descriptor.get("occurrence_index")
        if occurrence_index is not None:
            if type(occurrence_index) is not int or occurrence_index < 0:
                raise ValueError("occurrence_index ต้องเป็นจำนวนเต็มตั้งแต่ศูนย์")
            pages = [pages[occurrence_index]] if occurrence_index < len(pages) else []
        mappings.append({
            "key": key,
            "source_file": descriptor["source_file"],
            "page_label": descriptor["page_label"],
            "pdf_pages": pages,
            "status": "not_found" if not pages else "matched" if len(pages) == 1 else "ambiguous",
        })

    return {
        "schema_version": "1.0",
        "page_count": len(reader.pages),
        "match_method": "exact_embedded_evidence_marker",
        "mappings": mappings,
    }


def main():
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    args = parser.parse_args()
    request = json.load(sys.stdin)
    descriptors = request.get("descriptors")
    if not isinstance(descriptors, list) or len(descriptors) > 10000:
        raise ValueError("descriptors ต้องเป็น array ไม่เกิน 10,000 รายการ")
    for descriptor in descriptors:
        if not isinstance(descriptor, dict) or any(
            not isinstance(descriptor.get(field), str) or len(descriptor[field]) > 512
            for field in ("key", "source_file", "page_label")
        ):
            raise ValueError("descriptor มีรูปแบบไม่ถูกต้อง")
        if "occurrence_index" in descriptor and (
            type(descriptor["occurrence_index"]) is not int or descriptor["occurrence_index"] < 0
        ):
            raise ValueError("occurrence_index ต้องเป็นจำนวนเต็มตั้งแต่ศูนย์")
    result = map_evidence_pages(args.pdf, descriptors, request.get("password", ""))
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
