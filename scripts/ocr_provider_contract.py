"""Provider-neutral OCR result contract and field-level consensus rules.

This module does not call an OCR provider. It only validates and combines
provider attempts after they have returned field candidates.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Mapping, Sequence


def _has_bbox(value: Any) -> bool:
    if not isinstance(value, Mapping):
        return False
    try:
        return all(int(value[key]) >= 0 for key in ("x", "y", "width", "height")) and int(value["width"]) > 0 and int(value["height"]) > 0
    except (KeyError, TypeError, ValueError):
        return False


def _candidate(attempt: Mapping[str, Any]) -> dict[str, Any]:
    value = attempt.get("value")
    confidence = attempt.get("confidence")
    complete = (
        value is not None
        and str(value).strip() != ""
        and isinstance(confidence, (int, float))
        and 0.0 <= float(confidence) <= 1.0
        and _has_bbox(attempt.get("bbox"))
        and bool(str(attempt.get("crop_sha256") or "").strip())
    )
    return {
        "provider": attempt.get("provider"),
        "value": None if value is None else str(value).strip(),
        "raw_ocr": attempt.get("raw_ocr"),
        "confidence": None if confidence is None else float(confidence),
        "bbox": attempt.get("bbox"),
        "crop_sha256": attempt.get("crop_sha256"),
        "evidence_complete": complete,
    }


def aggregate_field_results(
    field: str,
    attempts: Sequence[Mapping[str, Any]],
    *,
    min_confidence: float = 0.75,
) -> dict[str, Any]:
    """Aggregate attempts for one field without auto-confirming the result.

    Exact distinct values remain a conflict. A value can be a ``pass`` for
    recognition quality only when its evidence is complete and confidence is
    above the threshold; ``review_status`` remains ``review_required``.
    """

    candidates = [_candidate(attempt) for attempt in attempts]
    usable = [candidate for candidate in candidates if candidate["value"] is not None]
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for candidate in usable:
        grouped[candidate["value"]].append(candidate)

    if not usable:
        return {
            "field": field,
            "value": None,
            "raw_ocr": None,
            "confidence": None,
            "provider": None,
            "bbox": None,
            "crop_sha256": None,
            "evidence_complete": False,
            "alternatives": [],
            "attempts": candidates,
            "recognition_quality": "review_required",
            "review_status": "review_required",
        }

    def rank(candidate: Mapping[str, Any]) -> tuple[int, float, str]:
        return (
            int(bool(candidate["evidence_complete"])),
            float(candidate["confidence"] or 0.0),
            str(candidate["provider"] or ""),
        )

    selected = max(usable, key=rank)
    distinct_values = list(grouped)
    conflict = len(distinct_values) > 1
    alternatives = [
        {
            "value": value,
            "best_confidence": max(float(item["confidence"] or 0.0) for item in group),
            "providers": [item["provider"] for item in group],
            "evidence": group,
        }
        for value, group in grouped.items()
    ]
    alternatives.sort(key=lambda item: (-item["best_confidence"], item["value"]))
    recognition_quality = "conflict" if conflict else (
        "pass"
        if selected["evidence_complete"] and float(selected["confidence"] or 0.0) >= min_confidence
        else "review_required"
    )
    return {
        "field": field,
        "value": selected["value"],
        "raw_ocr": selected["raw_ocr"],
        "confidence": selected["confidence"],
        "provider": selected["provider"],
        "bbox": selected["bbox"],
        "crop_sha256": selected["crop_sha256"],
        "evidence_complete": selected["evidence_complete"],
        "alternatives": alternatives,
        "attempts": candidates,
        "recognition_quality": recognition_quality,
        "review_status": "review_required",
    }
