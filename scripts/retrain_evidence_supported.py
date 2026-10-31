import hashlib
import json
import shutil
import sys
from pathlib import Path

from ultralytics import YOLO


def main(output_dir: str) -> None:
    root = Path.cwd()
    out = Path(output_dir)
    report_path = root / "digital-evidence/test-results/documented-slip-yolo-50-verified/report.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    source_map = {path.name: path for path in (root / "For Test").rglob("*.jpg")}
    rows = [item for item in report["images"] if item.get("candidates") and Path(item["source"]).name != "chatv3 (15).jpg"][:11]

    for split in ("train", "val"):
        (out / "dataset/images" / split).mkdir(parents=True, exist_ok=True)
        (out / "dataset/labels" / split).mkdir(parents=True, exist_ok=True)

    manifest = []
    for index, record in enumerate(rows):
        source = source_map.get(Path(record["source"]).name)
        if source is None:
            continue
        split = "val" if index % 5 == 0 else "train"
        destination = out / "dataset/images" / split / source.name
        shutil.copy2(source, destination)
        width = record["dimensions"]["width"]
        height = record["dimensions"]["height"]
        labels = []
        for candidate in record["candidates"]:
            x, y, box_width, box_height = candidate["crop_box"]
            labels.append(f"0 {(x + box_width / 2) / width:.6f} {(y + box_height / 2) / height:.6f} {box_width / width:.6f} {box_height / height:.6f}")
        (out / "dataset/labels" / split / f"{source.stem}.txt").write_text("\n".join(labels) + "\n", encoding="ascii")
        manifest.append({
            "name": source.name,
            "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "split": split,
            "label_source": "evidence_supported_existing_candidate",
            "boxes_pixel": [candidate["crop_box"] for candidate in record["candidates"]],
        })

    for name in ("chatv3 (25).jpg", "chatv3 (28).jpg", "chatv3 (70).jpg"):
        source = source_map[name]
        split = "val" if name == "chatv3 (25).jpg" else "train"
        shutil.copy2(source, out / "dataset/images" / split / source.name)
        (out / "dataset/labels" / split / f"{source.stem}.txt").write_text("", encoding="ascii")
        manifest.append({"name": name, "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "split": split, "label_source": "visually_reviewed_chat_only", "boxes_pixel": []})

    dataset_dir = out / "dataset"
    (dataset_dir / "dataset.yaml").write_text(
        f"path: {dataset_dir.resolve().as_posix()}\ntrain: images/train\nval: images/val\nnames:\n  0: slip\n",
        encoding="utf-8",
    )
    (dataset_dir / "manifest.json").write_text(json.dumps({
        "schema": "digital-evidence.retrain-evidence-supported.v1",
        "label_status": "not_hand_drawn_ground_truth",
        "held_out": "chatv3 (15).jpg",
        "images": manifest,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    model = YOLO(str(root / "models/slip-yolov8n.pt"))
    model.train(data=str(dataset_dir / "dataset.yaml"), epochs=20, imgsz=416, batch=2, workers=0, device=0, project=str(out / "training"), name="slip", plots=False, amp=False, verbose=False)
    print(json.dumps({"output": str(out), "train_images": sum(item["split"] == "train" for item in manifest), "val_images": sum(item["split"] == "val" for item in manifest), "weights": str(out / "training/slip/weights/best.pt")}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1])
