"""YOLO-based slip localization for long chat screenshots."""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np
from ultralytics import YOLO


def coalesce_overlapping_boxes(
    boxes: list[dict[str, Any]],
    overlap_threshold: float = 0.25,
) -> list[dict[str, Any]]:
    """Keep one representative box when YOLO returns overlapping views of one slip.

    The overlap ratio is measured against the smaller box, so a partial box
    nested inside a larger slip box is treated as the same visual object.
    The highest-confidence box is retained because it is the detector's best
    validated view; area is only the tie-breaker so a larger weak box cannot
    hide a stronger OCR crop.
    """
    def area(box: dict[str, Any]) -> int:
        return max(0, int(box["x2"]) - int(box["x1"])) * max(0, int(box["y2"]) - int(box["y1"]))

    def overlap_ratio(left: dict[str, Any], right: dict[str, Any]) -> float:
        x1 = max(int(left["x1"]), int(right["x1"]))
        y1 = max(int(left["y1"]), int(right["y1"]))
        x2 = min(int(left["x2"]), int(right["x2"]))
        y2 = min(int(left["y2"]), int(right["y2"]))
        intersection = max(0, x2 - x1) * max(0, y2 - y1)
        smaller = min(area(left), area(right))
        return intersection / smaller if smaller else 0.0

    kept: list[dict[str, Any]] = []
    for candidate in sorted(boxes, key=lambda box: (float(box.get("confidence", 0.0)), area(box)), reverse=True):
        if not any(overlap_ratio(candidate, existing) >= overlap_threshold for existing in kept):
            kept.append(candidate)
    return kept


class SlipLocator:
    """Detect and crop bank-transfer slips from a chat image."""

    def __init__(self, model_path: str = "models/slip_yolov8n.pt", device: str = "cpu"):
        self.model = YOLO(model_path)
        self.device = device

    def extract_slips(
        self,
        chat_image: np.ndarray,
        conf_thresh: float = 0.65,
    ) -> list[dict[str, Any]]:
        results = self.model.predict(
            source=chat_image,
            device=self.device,
            conf=conf_thresh,
            verbose=False,
        )
        if not results or len(results) == 0:
            return []

        boxes = results[0].boxes
        raw_boxes = [
            {
                "x1": int(box.xyxy[0][0].item()),
                "y1": int(box.xyxy[0][1].item()),
                "x2": int(box.xyxy[0][2].item()),
                "y2": int(box.xyxy[0][3].item()),
                "confidence": float(box.conf[0].item()),
            }
            for box in boxes
        ]
        boxes = coalesce_overlapping_boxes(raw_boxes)
        order = np.argsort([box["y1"] for box in boxes])
        height, width = chat_image.shape[:2]
        detected_slips: list[dict[str, Any]] = []

        for index in order:
            box = boxes[int(index)]
            x1, y1, x2, y2 = box["x1"], box["y1"], box["x2"], box["y2"]
            confidence = box["confidence"]
            # Keep OCR/QR tied to the YOLO object while allowing a small
            # evidence margin for QR modules that sit just outside a tight
            # detector box. The source bounds remain the unpadded YOLO box.
            padding = 32
            px1, py1 = max(0, x1 - padding), max(0, y1 - padding)
            px2, py2 = min(width, x2 + padding), min(height, y2 + padding)
            detected_slips.append(
                {
                    "index": len(detected_slips) + 1,
                    "crop": chat_image[py1:py2, px1:px2].copy(),
                    "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                    "confidence": confidence,
                }
            )
        return detected_slips
