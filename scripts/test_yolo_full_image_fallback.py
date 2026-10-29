import unittest

import numpy as np

from yolo_slip_api import build_full_image_fallback_detection


class FullImageFallbackTests(unittest.TestCase):
    def test_creates_review_only_full_frame_detection_when_qr_is_decoded(self):
        image = np.zeros((3507, 2480, 3), dtype=np.uint8)

        detection = build_full_image_fallback_detection(image, "qr-payload")

        self.assertIsNotNone(detection)
        self.assertEqual(detection["bbox"], {"x1": 0, "y1": 0, "x2": 2480, "y2": 3507})
        self.assertEqual(detection["confidence"], 0.0)
        self.assertIn("QR", detection["fallback_reason"])

    def test_does_not_create_fallback_without_qr_evidence(self):
        image = np.zeros((3507, 2480, 3), dtype=np.uint8)

        self.assertIsNone(build_full_image_fallback_detection(image, None))


if __name__ == "__main__":
    unittest.main()
