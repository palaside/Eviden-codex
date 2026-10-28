import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

from detect_classifier import EvidenceType, classify_evidence_image, detect_surrounding_chat_bubbles, resolve_qr_classification


class DetectClassifierPathTests(unittest.TestCase):
    def test_loads_an_image_from_a_unicode_directory_and_filename(self):
        pixels = np.full((120, 100, 3), 230, dtype=np.uint8)
        encoded_ok, encoded = cv2.imencode(".png", pixels)
        self.assertTrue(encoded_ok)

        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp_dir:
            image_path = Path(temp_dir) / "แชทที่ 3" / "ภาพทดสอบ.png"
            image_path.parent.mkdir()
            image_path.write_bytes(encoded.tobytes())

            result = classify_evidence_image(str(image_path))

        self.assertEqual(result.type, EvidenceType.TYPE_CHAT)
        self.assertEqual(result.target_pipeline, "Dicut_Chat")


class SurroundingChatBubbleTests(unittest.TestCase):
    def _canvas(self):
        return np.full((100, 100, 3), 210, dtype=np.uint8)

    def test_finds_repeated_outer_message_bubbles(self):
        pixels = self._canvas()
        for x, y, width, height in [(12, 5, 36, 8), (56, 12, 34, 8), (14, 84, 34, 8)]:
            pixels[y:y + height, x:x + width] = 250
        self.assertTrue(detect_surrounding_chat_bubbles(pixels))

    def test_ignores_central_qr_artwork_and_gallery_bars(self):
        central = self._canvas()
        for x in range(10, 90):
            central[35:65, x] = 255 if x % 2 else 20
        self.assertFalse(detect_surrounding_chat_bubbles(central))

        bars = self._canvas()
        bars[5:17, 12:48] = 250
        bars[84:96, 12:48] = 250
        self.assertFalse(detect_surrounding_chat_bubbles(bars))


class QrClassificationTests(unittest.TestCase):
    def test_qr_without_chat_structure_is_a_solo_slip(self):
        self.assertEqual(resolve_qr_classification(1.41, False, 0), EvidenceType.TYPE_SLIP_SOLO)

    def test_qr_with_outer_bubbles_is_chat_with_slip(self):
        self.assertEqual(resolve_qr_classification(1.34, True, 0), EvidenceType.TYPE_CHAT_WITH_SLIP)

    def test_tall_qr_capture_stays_on_chat_pipeline(self):
        self.assertEqual(resolve_qr_classification(5.2, False, 0), EvidenceType.TYPE_CHAT_WITH_SLIP)


if __name__ == "__main__":
    unittest.main()
