"""Local Tesseract adapter for verified field crops.

The adapter only reads an already-created crop. It does not detect regions,
modify the source, or confirm a field for a human reviewer.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any, Mapping

import cv2
import pytesseract
from pytesseract import Output


class LocalTesseractProvider:
    name = "local-tesseract"

    def __init__(
        self,
        *,
        tesseract_cmd: str | None = None,
        language: str = "tha+eng",
        config: str = "--oem 3 --psm 6",
    ) -> None:
        self.language = language
        self.config = config
        if tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

    @staticmethod
    def _sha256(path: Path) -> str:
        return hashlib.sha256(path.read_bytes()).hexdigest()

    @staticmethod
    def _base(field: str, crop_sha256: str | None, diagnostic: str) -> dict[str, Any]:
        return {
            "provider": LocalTesseractProvider.name,
            "field": field,
            "value": None,
            "raw_ocr": None,
            "confidence": 0.0,
            "bbox": None,
            "crop_sha256": crop_sha256,
            "diagnostic": diagnostic,
            "recognition_quality": "review_required",
            "review_status": "review_required",
        }

    def read_field(
        self,
        crop_path: str | Path,
        *,
        field: str,
        source_bbox: Mapping[str, int],
        crop_sha256: str,
    ) -> dict[str, Any]:
        crop = Path(crop_path).resolve()
        actual_sha = self._sha256(crop) if crop.is_file() else None
        if actual_sha != crop_sha256:
            result = self._base(field, actual_sha, "crop_sha256_mismatch")
            result["expected_crop_sha256"] = crop_sha256
            return result

        image = cv2.imread(str(crop), cv2.IMREAD_COLOR)
        if image is None:
            return self._base(field, actual_sha, "crop_decode_failed")

        return self._read_image(
            image,
            field=field,
            source_bbox=source_bbox,
            crop_sha256=actual_sha,
        )

    def read_field_variants(
        self,
        crop_path: str | Path,
        *,
        field: str,
        source_bbox: Mapping[str, int],
        crop_sha256: str,
    ) -> list[dict[str, Any]]:
        """Read a field through deterministic local variants.

        The source crop hash remains the evidence anchor. Each attempt also
        records a hash for the derived image actually sent to Tesseract.
        """
        crop = Path(crop_path).resolve()
        actual_sha = self._sha256(crop) if crop.is_file() else None
        if actual_sha != crop_sha256:
            result = self._base(field, actual_sha, "crop_sha256_mismatch")
            result["expected_crop_sha256"] = crop_sha256
            return [result]

        image = cv2.imread(str(crop), cv2.IMREAD_COLOR)
        if image is None:
            return [self._base(field, actual_sha, "crop_decode_failed")]

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        upscaled = cv2.resize(gray, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
        thresholded = cv2.adaptiveThreshold(
            upscaled, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY, 31, 11,
        )
        variants = [("raw", image, 1.0), ("grayscale_upscale", upscaled, 2.0), ("adaptive_threshold", thresholded, 2.0)]
        results: list[dict[str, Any]] = []
        for name, variant_image, scale in variants:
            variant_bytes = cv2.imencode(".png", variant_image)[1].tobytes()
            variant_sha = hashlib.sha256(variant_bytes).hexdigest()
            result = self._read_image(
                variant_image,
                field=field,
                source_bbox=source_bbox,
                crop_sha256=actual_sha,
                coordinate_scale=scale,
            )
            result["variant"] = name
            result["variant_sha256"] = variant_sha
            result["source_crop_sha256"] = actual_sha
            results.append(result)
        return results

    def _read_image(
        self,
        image: Any,
        *,
        field: str,
        source_bbox: Mapping[str, int],
        crop_sha256: str,
        coordinate_scale: float = 1.0,
    ) -> dict[str, Any]:

        try:
            data = pytesseract.image_to_data(
                image,
                lang=self.language,
                config=self.config,
                output_type=Output.DICT,
            )
        except Exception as exc:  # provider failure stays reviewable
            result = self._base(field, actual_sha, "tesseract_error")
            result["error"] = str(exc)
            return result

        tokens: list[tuple[str, float, int, int, int, int]] = []
        for index, text in enumerate(data.get("text", [])):
            value = str(text or "").strip()
            if not value:
                continue
            try:
                confidence = float(data.get("conf", ["-1"])[index]) / 100.0
                left = int(data.get("left", [0])[index])
                top = int(data.get("top", [0])[index])
                width = int(data.get("width", [0])[index])
                height = int(data.get("height", [0])[index])
            except (IndexError, TypeError, ValueError):
                continue
            if confidence >= 0 and width > 0 and height > 0:
                tokens.append((value, confidence, left, top, width, height))

        if not tokens:
            return self._base(field, actual_sha, "no_text")

        raw_ocr = " ".join(token[0] for token in tokens).strip()
        confidence = sum(token[1] for token in tokens) / len(tokens)
        left = min(token[2] for token in tokens)
        top = min(token[3] for token in tokens)
        right = max(token[2] + token[4] for token in tokens)
        bottom = max(token[3] + token[5] for token in tokens)
        bbox = {
            "x": int(source_bbox["x"]) + round(left / coordinate_scale),
            "y": int(source_bbox["y"]) + round(top / coordinate_scale),
            "width": round((right - left) / coordinate_scale),
            "height": round((bottom - top) / coordinate_scale),
        }
        return {
            "provider": self.name,
            "field": field,
            "value": raw_ocr,
            "raw_ocr": raw_ocr,
            "confidence": confidence,
            "bbox": bbox,
            "crop_sha256": crop_sha256,
            "diagnostic": "ok",
            "recognition_quality": "pass" if confidence >= 0.75 else "review_required",
            "review_status": "review_required",
        }
