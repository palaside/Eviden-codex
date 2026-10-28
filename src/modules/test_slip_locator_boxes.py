import unittest

from slip_locator import coalesce_overlapping_boxes


class SlipLocatorBoxTests(unittest.TestCase):
    def test_keeps_one_largest_box_for_overlapping_views_of_one_slip(self):
        boxes = [
            {"x1": 278, "y1": 199, "x2": 817, "y2": 858, "confidence": 0.0336},
            {"x1": 279, "y1": 238, "x2": 475, "y2": 851, "confidence": 0.0359},
            {"x1": 269, "y1": 342, "x2": 805, "y2": 921, "confidence": 0.0531},
        ]

        result = coalesce_overlapping_boxes(boxes, overlap_threshold=0.25)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["x1"], 269)
        self.assertEqual(result[0]["y1"], 342)


if __name__ == "__main__":
    unittest.main()
