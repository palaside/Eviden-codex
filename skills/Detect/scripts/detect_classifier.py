"""
Detect Skill - Forensic Image Intake & Classification Gateway
Analyzes image pixels and structure to classify into:
1. TYPE_CHAT -> Routes to Dicut_Chat
2. TYPE_SLIP_SOLO -> Routes to OCR_Slip
3. TYPE_CHAT_WITH_SLIP -> Routes to Search_Slip & Consistent
"""

import os
from enum import Enum, auto
from dataclasses import dataclass
from typing import Tuple, Optional, Dict, Any

try:
    import cv2
    import numpy as np
except ImportError:
    cv2 = None
    np = None

class EvidenceType(Enum):
    TYPE_CHAT = auto()
    TYPE_SLIP_SOLO = auto()
    TYPE_CHAT_WITH_SLIP = auto()

@dataclass
class ClassificationResult:
    image_path: str
    type: EvidenceType
    confidence: float
    target_pipeline: str
    details: Dict[str, Any]

def resolve_qr_classification(aspect_ratio: float, surrounding_bubbles: bool, bubble_transitions: int) -> EvidenceType:
    if surrounding_bubbles or aspect_ratio > 4 or (aspect_ratio > 2.5 and bubble_transitions > 4):
        return EvidenceType.TYPE_CHAT_WITH_SLIP
    return EvidenceType.TYPE_SLIP_SOLO

def has_green_transfer_badge(img_bgr) -> Tuple[bool, Optional[Tuple[int, int, int, int]]]:
    """Detects presence of bank transfer success badge via HSV color segmentation."""
    if cv2 is None or img_bgr is None:
        return False, None

    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    lower_green = np.array([35, 120, 100])
    upper_green = np.array([85, 255, 255])
    mask = cv2.inRange(hsv, lower_green, upper_green)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if 150 < area < 10000:
            x, y, w, h = cv2.boundingRect(cnt)
            aspect = float(w) / max(1, h)
            if 0.7 <= aspect <= 1.3:
                return True, (x, y, w, h)
    return False, None

def detect_qr_code(img_bgr) -> bool:
    """Checks for presence of standard QR codes in the image."""
    if cv2 is None or img_bgr is None:
        return False
    try:
        detector = cv2.QRCodeDetector()
        val, points, _ = detector.detectAndDecode(img_bgr)
        return bool(points is not None and len(points) > 0)
    except Exception:
        return False

def read_image(image_path: str):
    """Decode image bytes without relying on OpenCV's Windows Unicode-path handling."""
    try:
        encoded = np.fromfile(image_path, dtype=np.uint8)
    except (OSError, ValueError):
        return None
    if encoded.size == 0:
        return None
    return cv2.imdecode(encoded, cv2.IMREAD_COLOR)

def detect_surrounding_chat_bubbles(img_bgr) -> bool:
    """Look for repeated bubble-shaped contrast runs outside the central slip region."""
    if cv2 is None or img_bgr is None:
        return False
    height, width = img_bgr.shape[:2]
    if width < 40 or height < 40:
        return False
    if width > 400:
        resized_height = max(1, round(height * 400 / width))
        img_bgr = cv2.resize(img_bgr, (400, resized_height), interpolation=cv2.INTER_AREA)
        height, width = img_bgr.shape[:2]

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    row_step = max(1, height // 220)
    edge_width = max(2, int(width * 0.035))
    min_run = max(8, int(width * 0.09))
    max_run = int(width * 0.78)
    max_track_gap = max(row_step * 2, int(height * 0.018))
    tracks = []

    for y in range(0, height, row_step):
        if height * 0.22 < y < height * 0.78:
            continue
        edge_samples = np.concatenate((gray[y, :edge_width], gray[y, width - edge_width:]))
        background = float(np.median(edge_samples))
        runs = []
        run_start = -1
        last_contrast = -1
        for x in range(edge_width, width - edge_width):
            if abs(float(gray[y, x]) - background) >= 14:
                if run_start < 0:
                    run_start = x
                last_contrast = x
            elif run_start >= 0 and x - last_contrast > 2:
                runs.append((run_start, last_contrast + 1))
                run_start = -1
        if run_start >= 0:
            runs.append((run_start, last_contrast + 1))

        for start, end in runs:
            run_width = end - start
            if run_width < min_run or run_width > max_run:
                continue
            side = "left" if start / width < 0.42 else "right" if end / width > 0.58 else None
            if side is None:
                continue
            track = next((candidate for candidate in tracks
                if candidate["side"] == side
                and y - candidate["last_y"] <= max_track_gap
                and abs(candidate["x"] - start) <= width * 0.055
                and abs(candidate["width"] - run_width) <= width * 0.12), None)
            if track is None:
                tracks.append({"side": side, "x": start, "width": run_width, "last_y": y, "rows": 1})
            else:
                track["rows"] += 1
                track["last_y"] = y
                track["x"] = (track["x"] + start) / 2
                track["width"] = (track["width"] + run_width) / 2

    return sum(track["rows"] >= 3 for track in tracks) >= 3

def detect_bubble_transitions(img_bgr) -> int:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    height, width = gray.shape[:2]
    row = gray[min(height - 1, int(height * 0.5))]
    step = max(1, width // 200)
    transitions = 0
    previous_bright = row[0] > 128
    for x in range(step, width, step):
        bright = row[x] > 128
        if bright != previous_bright:
            transitions += 1
            previous_bright = bright
    return transitions

def classify_evidence_image(image_path: str) -> ClassificationResult:
    """
    Classifies an input evidence image based on pixel features,
    color profiles, and layout structure.
    """
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")

    if cv2 is None:
        # Fallback if OpenCV not loaded
        return ClassificationResult(
            image_path=image_path,
            type=EvidenceType.TYPE_CHAT,
            confidence=0.5,
            target_pipeline="Dicut_Chat",
            details={"fallback": True, "reason": "OpenCV not available"}
        )

    img = read_image(image_path)
    if img is None:
        raise ValueError(f"Could not load image: {image_path}")

    h, w = img.shape[:2]
    aspect_ratio = float(h) / max(1, w)

    has_badge, badge_box = has_green_transfer_badge(img)
    has_qr = detect_qr_code(img)
    surrounding_bubbles = has_qr and detect_surrounding_chat_bubbles(img)
    bubble_transitions = detect_bubble_transitions(img)

    # A QR is slip evidence, but only outer message structure proves a chat-with-slip.
    if has_qr:
        detected_type = resolve_qr_classification(aspect_ratio, surrounding_bubbles, bubble_transitions)
        if detected_type == EvidenceType.TYPE_CHAT_WITH_SLIP:
            return ClassificationResult(
                image_path=image_path,
                type=EvidenceType.TYPE_CHAT_WITH_SLIP,
                confidence=0.90,
                target_pipeline="Search_Slip & Consistent",
                details={"aspect_ratio": aspect_ratio, "has_badge": has_badge, "has_qr": True, "surrounding_bubbles": surrounding_bubbles, "bubble_transitions": bubble_transitions}
            )
        return ClassificationResult(
            image_path=image_path,
            type=EvidenceType.TYPE_SLIP_SOLO,
            confidence=0.95,
            target_pipeline="OCR_Slip",
            details={"aspect_ratio": aspect_ratio, "has_badge": has_badge, "has_qr": True, "surrounding_bubbles": False}
        )

    # Standalone green badge is supportive only when its position/layout also fits a solo slip.
    if has_badge and (1.2 <= aspect_ratio <= 2.5):
        if badge_box:
            bx, by, bw, bh = badge_box
            # If badge is located near top center and badge width is proportionally large (> 4% of img width)
            is_badge_prominent = (bw / float(w)) > 0.04
            is_centered = abs((bx + bw/2.0) - (w / 2.0)) < (w * 0.35)
            
            if is_badge_prominent and is_centered and by < (h * 0.35):
                return ClassificationResult(
                    image_path=image_path,
                    type=EvidenceType.TYPE_SLIP_SOLO,
                    confidence=0.95,
                    target_pipeline="OCR_Slip",
                    details={"aspect_ratio": aspect_ratio, "has_badge": True, "has_qr": has_qr, "prominent": True}
                )

    if has_badge:
        return ClassificationResult(
            image_path=image_path,
            type=EvidenceType.TYPE_CHAT_WITH_SLIP,
            confidence=0.90,
            target_pipeline="Search_Slip & Consistent",
            details={"aspect_ratio": aspect_ratio, "has_badge": has_badge, "has_qr": has_qr, "embedded": True}
        )

    # 3. Pure Chat
    return ClassificationResult(
        image_path=image_path,
        type=EvidenceType.TYPE_CHAT,
        confidence=0.92,
        target_pipeline="Dicut_Chat",
        details={"aspect_ratio": aspect_ratio, "has_badge": False, "has_qr": False}
    )
