"""Attach provider results to the existing evidence trace."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Mapping, Sequence

try:
    from ocr_provider_contract import aggregate_field_results
except ImportError:  # pragma: no cover - supports ``python -m scripts...``
    from scripts.ocr_provider_contract import aggregate_field_results


def attach_ocr_results(
    trace: Mapping[str, Any],
    results_by_field: Mapping[tuple[str, str], Sequence[Mapping[str, Any]]],
) -> dict[str, Any]:
    """Attach consensus results to existing crop/field records.

    This is a pure integration step: it does not call providers, alter source
    files, or turn a high-confidence candidate into an automatic confirmation.
    """

    updated = deepcopy(dict(trace))
    providers: list[str] = list(updated.get("ocr_providers", []))
    conflicts: list[dict[str, Any]] = []
    attached = 0

    for (crop_id, field_name), attempts in results_by_field.items():
        field_trace = None
        for crop in updated.get("verified_crops", []):
            if crop.get("id") != crop_id:
                continue
            for field in crop.get("fields", []):
                if field.get("field") == field_name:
                    field_trace = field
                    break
            break
        if field_trace is None:
            raise KeyError(f"No field trace for {crop_id}:{field_name}")

        consensus = aggregate_field_results(field_name, attempts)
        field_trace.update(consensus)
        attached += len(attempts)
        for attempt in attempts:
            provider = str(attempt.get("provider") or "")
            if provider and provider not in providers:
                providers.append(provider)
        if consensus["recognition_quality"] == "conflict":
            conflicts.append(
                {
                    "crop_id": crop_id,
                    "field": field_name,
                    "alternatives": consensus["alternatives"],
                    "review_status": "review_required",
                }
            )

    updated["ocr_providers"] = providers
    updated["ocr_attempts"] = attached
    updated["conflicts"] = conflicts
    updated["validation"] = {
        "field_results_attached": len(results_by_field),
        "conflict_count": len(conflicts),
        "review_required": True,
    }
    updated["review_status"] = "review_required"
    return updated
