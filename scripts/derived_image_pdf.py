import argparse
import hashlib
import json
import os
import sys
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


EXPECTED_MODEL_SHA256 = "dd35ce3cae53ecee2d16045e08a932c3e7242d641bb65cb971d123e06904347f"
MAX_INPUT_BYTES = 20 * 1024 * 1024
MAX_WORKING_PIXELS = 300_000
MAX_SOURCE_PIXELS = 40_000_000
SUPERRES_TILE_SIZE = 256
SUPERRES_TILE_OVERLAP = 16


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_archive_source_name(source_name):
    name = str(source_name or "").replace("\\", "/").rsplit("/", 1)[-1].replace("\x00", "").strip()
    return name if name not in ("", ".", "..") else "source"


def verify_model(model_path, expected=EXPECTED_MODEL_SHA256):
    path = Path(model_path)
    if not path.is_file():
        raise ValueError("ไม่พบไฟล์ EDSR model ที่ติดตั้งไว้ในระบบ")
    actual = sha256_file(path)
    if actual.lower() != expected.lower():
        raise ValueError("EDSR model checksum ไม่ตรงกับรุ่นที่ pin ไว้")
    return actual


def find_quiet_zone_slices(row_edge_counts, width, max_height_ratio=1.414):
    height = len(row_edge_counts)
    if height == 0 or width <= 0 or max_height_ratio <= 0:
        raise ValueError("ขนาดภาพสำหรับแบ่งหน้าไม่ถูกต้อง")
    max_slice_height = max(1, int(width * max_height_ratio))
    slices = []
    start = 0
    while start < height:
        target = min(start + max_slice_height, height)
        if target == height:
            end = height
        else:
            quiet_rows = [index for index in range(start + 1, target + 1) if row_edge_counts[index] == 0]
            if quiet_rows:
                end = quiet_rows[-1]
            else:
                next_quiet = next((index for index in range(target + 1, height) if row_edge_counts[index] == 0), None)
                end = next_quiet if next_quiet is not None else target
        end = max(start + 1, min(end, height))
        slices.append((start, end))
        start = end
    return slices


def prepare_working_image(image, max_pixels=MAX_WORKING_PIXELS):
    height, width = image.shape[:2]
    if height * width <= max_pixels:
        return image, 1.0
    scale = (max_pixels / float(height * width)) ** 0.5
    target_width = max(1, int(width * scale))
    target_height = max(1, int(height * scale))
    working = cv2.resize(image, (target_width, target_height), interpolation=cv2.INTER_AREA)
    return working, min(target_width / width, target_height / height)


def map_processing_row_to_source(row, source_height, processing_height):
    if source_height <= 0 or processing_height <= 0:
        raise ValueError("ขนาดภาพสำหรับ map พิกัดไม่ถูกต้อง")
    return min(source_height, max(0, round(row * source_height / processing_height)))


def map_processing_slices_to_source(slices, source_height, processing_height):
    if source_height <= 0 or processing_height <= 0:
        raise ValueError("ขนาดภาพสำหรับ map พิกัดไม่ถูกต้อง")
    boundaries = [start for start, _ in slices] + ([slices[-1][1]] if slices else [])
    mapped = [map_processing_row_to_source(row, source_height, processing_height) for row in boundaries]
    if mapped:
        mapped[0] = 0
        mapped[-1] = source_height
    return list(zip(mapped, mapped[1:]))


def upsample_tiled(superres, image, scale=4, tile_size=SUPERRES_TILE_SIZE, overlap=SUPERRES_TILE_OVERLAP):
    height, width = image.shape[:2]
    output = np.empty((height * scale, width * scale, image.shape[2]), dtype=np.uint8)
    for core_y in range(0, height, tile_size):
        core_y_end = min(core_y + tile_size, height)
        for core_x in range(0, width, tile_size):
            core_x_end = min(core_x + tile_size, width)
            source_x = max(0, core_x - overlap)
            source_y = max(0, core_y - overlap)
            source_x_end = min(width, core_x_end + overlap)
            source_y_end = min(height, core_y_end + overlap)
            tile = superres.upsample(image[source_y:source_y_end, source_x:source_x_end])
            crop_x = (core_x - source_x) * scale
            crop_y = (core_y - source_y) * scale
            crop_width = (core_x_end - core_x) * scale
            crop_height = (core_y_end - core_y) * scale
            output[core_y * scale:core_y_end * scale, core_x * scale:core_x_end * scale] = tile[
                crop_y:crop_y + crop_height,
                crop_x:crop_x + crop_width,
            ]
    return output


def build_provenance(source_name, source_sha256, model_sha256, slices, dimensions=None, pdf_sha256=None, processing_dimensions=None):
    processing_dimensions = processing_dimensions or dimensions
    if dimensions and processing_dimensions:
        source_slices = map_processing_slices_to_source(
            slices,
            dimensions["height"],
            processing_dimensions["height"],
        )
        resampled = dimensions != processing_dimensions
        processing_scale = {
            "x": round(processing_dimensions["width"] / dimensions["width"], 8),
            "y": round(processing_dimensions["height"] / dimensions["height"], 8),
        }
    else:
        source_slices = slices
        resampled = False
        processing_scale = {"x": 1.0, "y": 1.0}
    return {
        "schema_version": "1.0",
        "artifact_type": "derived_visualization_only",
        "derived_only": True,
        "eligible_for_ocr_or_ledger": False,
        "warning": "EDSR/CLAHE/denoising changes or synthesizes pixels. This PDF is not the original evidence and must not be used as OCR, transaction, or forensic source data.",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source": {
            "file_name": source_name,
            "sha256": source_sha256,
            "dimensions_px": dimensions,
        },
        "processing": {
            "dimensions_px": processing_dimensions,
            "pixel_budget": MAX_WORKING_PIXELS,
            "resampled_for_processing_budget": resampled,
            "scale_from_source": processing_scale,
        },
        "transform": {
            "preprocessing": ["LAB CLAHE clipLimit=3.0 tileGridSize=8x8", "bilateralFilter d=9 sigmaColor=75 sigmaSpace=75"],
            "segmentation": "Canny 50/150 horizontal quiet-zone heuristic with bounded-height fallback",
            "super_resolution": {"model": "EDSR", "scale": 4, "model_sha256": model_sha256},
        },
        "pages": [
            {"page": index + 1, "source_y": [start, end]}
            for index, (start, end) in enumerate(source_slices)
        ],
        "output_pdf_sha256": pdf_sha256,
    }


def load_image(path):
    try:
        with Image.open(path) as header:
            header_width, header_height = header.size
    except Exception as error:
        raise ValueError("ไฟล์ไม่ใช่ภาพที่รองรับหรืออ่านภาพไม่สำเร็จ") from error
    if header_width * header_height > MAX_SOURCE_PIXELS:
        raise ValueError("ภาพต้นฉบับเกินขีดจำกัดความปลอดภัย 40 ล้านพิกเซล")
    raw = np.fromfile(path, dtype=np.uint8)
    image = cv2.imdecode(raw, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("ไฟล์ไม่ใช่ภาพที่รองรับหรืออ่านภาพไม่สำเร็จ")
    height, width = image.shape[:2]
    if width * height > MAX_SOURCE_PIXELS:
        raise ValueError("ภาพต้นฉบับเกินขีดจำกัดความปลอดภัย 40 ล้านพิกเซล")
    working, scale = prepare_working_image(image)
    return working, {"width": width, "height": height}, scale


def enhance_and_bundle(input_path, output_path, source_name, model_path):
    source = Path(input_path)
    if source.stat().st_size > MAX_INPUT_BYTES:
        raise ValueError("ไฟล์ภาพมีขนาดเกิน 20 MB")
    model_sha256 = verify_model(model_path)
    image, source_dimensions, _ = load_image(str(source))
    height, width = image.shape[:2]
    processing_dimensions = {"width": width, "height": height}
    source_sha256 = sha256_file(source)

    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    lightness, channel_a, channel_b = cv2.split(lab)
    contrast = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(lightness)
    enhanced = cv2.cvtColor(cv2.merge((contrast, channel_a, channel_b)), cv2.COLOR_LAB2BGR)
    enhanced = cv2.bilateralFilter(enhanced, 9, 75, 75)
    edges = cv2.Canny(cv2.cvtColor(enhanced, cv2.COLOR_BGR2GRAY), 50, 150)
    row_counts = np.count_nonzero(edges, axis=1).tolist()
    slices = find_quiet_zone_slices(row_counts, width)

    superres_factory = getattr(getattr(cv2, "dnn_superres", None), "DnnSuperResImpl_create", None)
    if superres_factory is None:
        raise RuntimeError("OpenCV contrib dnn_superres ยังไม่พร้อมใช้งาน; ติดตั้ง scripts/requirements-derived-image.txt")
    superres = superres_factory()
    superres.readModel(str(model_path))
    superres.setModel("edsr", 4)

    with tempfile.TemporaryDirectory(prefix="derived-image-") as temp_dir:
        pdf_path = Path(temp_dir) / "derived.pdf"
        archive_dir = Path(temp_dir) / "bundle"
        archive_dir.mkdir()
        pdf = canvas.Canvas(str(pdf_path), pagesize=A4, pageCompression=1)
        page_width, page_height = A4
        margin = 34
        header_height = 34
        footer_height = 40
        usable_width = page_width - margin * 2
        usable_height = page_height - margin * 2 - header_height - footer_height

        for page_number, (start, end) in enumerate(slices, start=1):
            upscaled = upsample_tiled(superres, enhanced[start:end, :])
            rgb = cv2.cvtColor(upscaled, cv2.COLOR_BGR2RGB)
            pil_image = Image.fromarray(rgb)
            scale = min(usable_width / pil_image.width, usable_height / pil_image.height)
            draw_width = pil_image.width * scale
            draw_height = pil_image.height * scale
            draw_x = (page_width - draw_width) / 2
            draw_y = margin + footer_height + (usable_height - draw_height) / 2

            pdf.setTitle("DERIVED IMAGE - NOT ORIGINAL EVIDENCE")
            pdf.setSubject(f"Source SHA-256: {source_sha256}; EDSR x4 visualization")
            pdf.setFont("Helvetica-Bold", 9)
            pdf.setFillColorRGB(0.62, 0.08, 0.08)
            pdf.drawString(margin, page_height - margin - 12, "DERIVED IMAGE - NOT ORIGINAL EVIDENCE")
            pdf.setFillColorRGB(0.1, 0.1, 0.1)
            pdf.setFont("Helvetica", 7)
            pdf.drawString(margin, page_height - margin - 24, f"Source SHA-256: {source_sha256}")
            pdf.drawImage(ImageReader(pil_image), draw_x, draw_y, draw_width, draw_height, preserveAspectRatio=True, anchor="c")
            pdf.setFont("Helvetica", 7)
            pdf.setFillColorRGB(0.62, 0.08, 0.08)
            pdf.drawString(margin, margin + 24, "EDSR/CLAHE/denoising may synthesize or alter pixels. Not eligible for OCR, ledger, or forensic source use.")
            pdf.setFillColorRGB(0.1, 0.1, 0.1)
            source_rows = (
                map_processing_row_to_source(start, source_dimensions["height"], height),
                map_processing_row_to_source(end, source_dimensions["height"], height),
            )
            pdf.drawString(margin, margin + 12, f"Derived page {page_number}/{len(slices)} | source rows {source_rows[0]}-{source_rows[1]} | model SHA-256: {model_sha256}")
            pdf.showPage()
        pdf.save()

        pdf_sha256 = sha256_file(pdf_path)
        provenance = build_provenance(
            source_name,
            source_sha256,
            model_sha256,
            slices,
            source_dimensions,
            pdf_sha256,
            processing_dimensions,
        )
        (archive_dir / "derived.pdf").write_bytes(pdf_path.read_bytes())
        (archive_dir / "provenance.json").write_text(json.dumps(provenance, ensure_ascii=False, indent=2), encoding="utf-8")
        with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
            bundle.write(archive_dir / "derived.pdf", "derived.pdf")
            bundle.write(archive_dir / "provenance.json", "provenance.json")
            bundle.write(source, f"original/{safe_archive_source_name(source_name)}")

    return len(slices)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--source-name", required=True)
    parser.add_argument("--model", default=str(Path(__file__).resolve().parent / "models" / "EDSR_x4.pb"))
    args = parser.parse_args()
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    count = enhance_and_bundle(args.input, args.output, args.source_name, args.model)
    print(json.dumps({"ok": True, "page_count": count}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
