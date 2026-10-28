"""Run SlipLocator against real chat fixtures and save crops plus JSON trace."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.modules.slip_locator import SlipLocator


def read_image(path: Path) -> np.ndarray:
    data = np.fromfile(str(path), dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_COLOR) if data.size else None
    if image is None:
        raise ValueError(f"Cannot read image: {path}")
    return image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("images", nargs="+", type=Path)
    parser.add_argument("--confidence", type=float, default=0.65)
    parser.add_argument("--device", default="cpu", help="Inference device, for example cpu or 0")
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    locator = SlipLocator(str(args.model), device=args.device)
    report = {
        "model": str(args.model),
        "device": args.device,
        "confidence_threshold": args.confidence,
        "cases": [],
    }

    for image_path in args.images:
        image = read_image(image_path)
        detections = locator.extract_slips(image, conf_thresh=args.confidence)
        case = {
            "image": str(image_path),
            "image_size": {"width": image.shape[1], "height": image.shape[0]},
            "detection_count": len(detections),
            "detections": [],
        }
        for detection in detections:
            crop_path = args.output_dir / f"{image_path.stem}-slip-{detection['index']}.png"
            cv2.imencode(".png", detection["crop"])[1].tofile(str(crop_path))
            case["detections"].append(
                {
                    "index": detection["index"],
                    "bbox": detection["bbox"],
                    "confidence": detection["confidence"],
                    "crop_path": str(crop_path),
                }
            )
        report["cases"].append(case)

    result_path = args.output_dir / "report.json"
    result_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
