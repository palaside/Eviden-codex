import unittest
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from list_names import extract_group_and_index, group_files_by_prefix


class TestListNames(unittest.TestCase):
    def test_windows_ctrl_a_pattern(self):
        self.assertEqual(extract_group_and_index("V1- (1).jpg"), ("V1", 1))
        self.assertEqual(extract_group_and_index("V1- (10).jpg"), ("V1", 10))
        self.assertEqual(extract_group_and_index("CaseA (2).png"), ("CaseA", 2))
        self.assertEqual(extract_group_and_index("Chat Evidence (5).jpeg"), ("Chat Evidence", 5))

    def test_delimiter_suffix_pattern(self):
        self.assertEqual(extract_group_and_index("Evidence_01.jpg"), ("Evidence", 1))
        self.assertEqual(extract_group_and_index("Case-B-2.png"), ("Case-B", 2))

    def test_grouping_multiple_cases(self):
        sample_files = [
            r"C:\test\V1- (10).jpg",
            r"C:\test\V2- (1).jpg",
            r"C:\test\V1- (1).jpg",
            r"C:\test\V1- (2).jpg",
            r"C:\test\V2- (2).jpg",
        ]
        groups = group_files_by_prefix(sample_files)
        self.assertIn("V1", groups)
        self.assertIn("V2", groups)
        
        # Test sorted order within V1: 1 -> 2 -> 10
        v1_names = [os.path.basename(f) for f in groups["V1"]]
        self.assertEqual(v1_names, ["V1- (1).jpg", "V1- (2).jpg", "V1- (10).jpg"])

        # Test sorted order within V2: 1 -> 2
        v2_names = [os.path.basename(f) for f in groups["V2"]]
        self.assertEqual(v2_names, ["V2- (1).jpg", "V2- (2).jpg"])


if __name__ == "__main__":
    unittest.main()
