"""Evidence-preserving enhancement and verified-crop trace pipeline.

This module deliberately stops before OCR/provider work.  Crop boxes are supplied
by a caller who has verified them; the pipeline never infers or invents boxes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path
from typing import Any, Mapping, Sequence

import cv2
import numpy as np

try:
    from forensic_image_enhancement import enhance_forensic
except ImportError:  # pragma: no cover - supports ``python -m scripts...``
    from scripts.forensic_image_enhancement import enhance_forensic


TRACE_SCHEMA = "digital-evidence.enhancement-verified-crop-trace.v1"


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path: Path) -> str:
    return _sha256_bytes(path.read_bytes())


def _safe_name(value: str) -> str:
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("._")
    return name or "field"


def _box(box: Mapping[str, Any], *, label: str) -> tuple[int, int, int, int]:
    try:
        x = int(box["x"])
        y = int(box["y"])
        width = int(box["width"])
        height = int(box["height"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError(f"{label} must contain integer x, y, width, height") from exc
    if width <= 0 or height <= 0 or x < 0 or y < 0:
        raise ValueError(f"{label} has an invalid non-positive or negative box")
    return x, y, width, height


def _validate_box(box: tuple[int, int, int, int], width: int, height: int, *, label: str) -> None:
    x, y, box_width, box_height = box
    if x + box_width > width or y + box_height > height:
        raise ValueError(
            f"{label} is outside image bounds: box={box}, image={width}x{height}"
        )


def _write_image(path: Path, image: np.ndarray) -> dict[str, Any]:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(path), image):
        raise OSError(f"Could not write derived artifact: {path}")
    data = path.read_bytes()
    height, width = image.shape[:2]
    return {
        "path": str(path),
        "sha256": _sha256_bytes(data),
        "dimensions": {"width": int(width), "height": int(height)},
        "derived_only": True,
    }


def _artifact_record(
    *,
    artifact_id: str,
    kind: str,
    variant: str,
    source_sha256: str,
    written: Mapping[str, Any],
) -> dict[str, Any]:
    return {
        "artifact_id": artifact_id,
        "kind": kind,
        "variant": variant,
        "source_sha256": source_sha256,
        **dict(written),
    }


def _crop_variants(
    image: np.ndarray,
    destination: Path,
    *,
    source_sha256: str,
    prefix: str,
) -> list[dict[str, Any]]:
    variants, _metadata = enhance_forensic(image)
    records: list[dict[str, Any]] = []
    for variant, variant_image in variants.items():
        filename = f"{_safe_name(variant)}.png"
        written = _write_image(destination / filename, variant_image)
        records.append(
            _artifact_record(
                artifact_id=f"{prefix}-{_safe_name(variant)}",
                kind="crop_variant",
                variant=variant,
                source_sha256=source_sha256,
                written=written,
            )
        )
    return records


def run_pipeline(
    source_path: str | Path,
    output_dir: str | Path,
    verified_crops: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Create derived variants and an auditable field-level trace.

    ``verified_crops`` is intentionally explicit input. Each crop has:
    ``{"id", "bbox": {x,y,width,height}, "fields": [{"name", "bbox": ...}]}``.
    Field boxes are relative to their verified slip crop.
    """

    source = Path(source_path).resolve()
    output = Path(output_dir).resolve()
    if not source.is_file():
        raise FileNotFoundError(f"Source image does not exist: {source}")

    source_bytes = source.read_bytes()
    source_sha256 = _sha256_bytes(source_bytes)
    image = cv2.imdecode(np.frombuffer(source_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Could not decode source image: {source}")
    source_height, source_width = image.shape[:2]

    output.mkdir(parents=True, exist_ok=True)
    clone_path = output / "clone" / source.name
    clone_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, clone_path)
    clone_record = {
        "status": "derived_verified",
        "mode": "byte_identical_source_copy",
        "path": str(clone_path),
        "sha256": _sha256_file(clone_path),
        "byte_identical": clone_path.read_bytes() == source_bytes,
        "source_sha256": source_sha256,
        "dimensions": {"width": source_width, "height": source_height},
        "derived_only": True,
    }
    full_dir = output / "full-image-variants"
    full_records: list[dict[str, Any]] = []
    variants, _metadata = enhance_forensic(image)
    for variant, variant_image in variants.items():
        written = _write_image(full_dir / f"{_safe_name(variant)}.png", variant_image)
        full_records.append(
            _artifact_record(
                artifact_id=f"full-{_safe_name(variant)}",
                kind="full_image_variant",
                variant=variant,
                source_sha256=source_sha256,
                written=written,
            )
        )

    crop_records: list[dict[str, Any]] = []
    for crop_index, crop_spec in enumerate(verified_crops, start=1):
        crop_id = str(crop_spec.get("id") or f"slip-{crop_index:03d}")
        crop_box = _box(crop_spec.get("bbox", {}), label=f"crop {crop_id}")
        _validate_box(crop_box, source_width, source_height, label=f"crop {crop_id}")
        x, y, width, height = crop_box
        crop_image = image[y : y + height, x : x + width].copy()
        crop_dir = output / "verified-crops" / _safe_name(crop_id)
        original_written = _write_image(crop_dir / "original.png", crop_image)
        crop_sha256 = str(original_written["sha256"])

        field_records: list[dict[str, Any]] = []
        fields_spec = crop_spec.get("fields", [])
        if isinstance(fields_spec, Mapping):
            fields_iterable = [
                {"name": field_name, "bbox": field_box}
                for field_name, field_box in fields_spec.items()
            ]
        else:
            fields_iterable = fields_spec
        for field_index, field_spec in enumerate(fields_iterable, start=1):
            field_name = str(field_spec.get("name") or f"field_{field_index:02d}")
            field_box = _box(field_spec.get("bbox", {}), label=f"field {field_name}")
            _validate_box(field_box, width, height, label=f"field {field_name} in {crop_id}")
            fx, fy, field_width, field_height = field_box
            field_image = crop_image[fy : fy + field_height, fx : fx + field_width].copy()
            field_written = _write_image(
                crop_dir / "fields" / f"{_safe_name(field_name)}.png", field_image
            )
            field_records.append(
                {
                    "field": field_name,
                    "crop_relative_bbox": {
                        "x": fx,
                        "y": fy,
                        "width": field_width,
                        "height": field_height,
                    },
                    "source_bbox": {
                        "x": x + fx,
                        "y": y + fy,
                        "width": field_width,
                        "height": field_height,
                    },
                    "crop_path": field_written["path"],
                    "crop_sha256": field_written["sha256"],
                    "raw_ocr": None,
                    "confidence": None,
                    "provider": None,
                    "recognition_quality": "review_required",
                    "review_status": "review_required",
                }
            )

        crop_records.append(
            {
                "id": crop_id,
                "verification_status": "verified_by_input",
                "source_bbox": {"x": x, "y": y, "width": width, "height": height},
                "original_crop_path": original_written["path"],
                "original_crop_sha256": crop_sha256,
                "crop_sha256": crop_sha256,
                "variants": _crop_variants(
                    crop_image,
                    crop_dir / "variants",
                    source_sha256=crop_sha256,
                    prefix=_safe_name(crop_id),
                ),
                "fields": field_records,
                "review_status": "review_required",
            }
        )

    coordinate_regions: list[dict[str, Any]] = []
    for crop in crop_records:
        coordinate_regions.append(
            {
                "kind": "verified_crop",
                "id": crop["id"],
                "source_bbox": crop["source_bbox"],
            }
        )
        for field in crop["fields"]:
            coordinate_regions.append(
                {
                    "kind": "field_crop",
                    "id": f"{crop['id']}:{field['field']}",
                    "source_bbox": field["source_bbox"],
                    "crop_relative_bbox": field["crop_relative_bbox"],
                }
            )

    trace = {
        "schema": TRACE_SCHEMA,
        "source": {
            "path": str(source),
            "file_name": source.name,
            "sha256": source_sha256,
            "dimensions": {"width": source_width, "height": source_height},
            "is_original": True,
        },
        "clone": clone_record,
        "coordinate_map": {
            "coordinate_system": "pixel",
            "origin": "top_left",
            "source_dimensions": {"width": source_width, "height": source_height},
            "regions": coordinate_regions,
        },
        "derived_artifacts": full_records,
        "verified_crops": crop_records,
        "ocr_providers": [],
        "pipeline": [
            "preserve_original_and_create_clone_manifest",
            "read_original",
            "enhance_full_image_variants",
            "verified_crop_from_explicit_bbox",
            "enhance_crop_variants",
            "field_crop_from_explicit_relative_bbox",
        ],
        "review_status": "review_required",
        "notes": [
            "No detector or OCR provider was invoked.",
            "Crop boxes are caller-supplied verified inputs, not model predictions.",
            "raw_ocr and confidence remain null until a provider is explicitly attached.",
        ],
    }
    # Keep the short key used by existing trace consumers while retaining the
    # explicit ``verified_crops`` name for new consumers.
    trace["crops"] = trace["verified_crops"]
    trace_path = output / "trace.json"
    trace["trace_path"] = str(trace_path)
    trace_path.write_text(json.dumps(trace, ensure_ascii=False, indent=2), encoding="utf-8")
    return trace


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument(
        "--crops-json",
        required=True,
        type=Path,
        help="JSON file containing the verified_crops array",
    )
    args = parser.parse_args()
    crops = json.loads(args.crops_json.read_text(encoding="utf-8"))
    trace = run_pipeline(args.image, args.output_dir, crops)
    print(json.dumps({
        "trace_path": trace["trace_path"],
        "source_sha256": trace["source"]["sha256"],
        "full_variants": len(trace["derived_artifacts"]),
        "verified_crops": len(trace["verified_crops"]),
        "field_traces": sum(len(c["fields"]) for c in trace["verified_crops"]),
        "review_status": trace["review_status"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
