import tempfile
import unittest
from pathlib import Path

from test_workspace import (
    TEST_WORKSPACE_ROOT,
    activate_test_workspace,
    cleanup_test_workspace,
    deactivate_test_workspace,
    prepare_test_workspace,
    test_temp_directory,
)


class TestManagedTestWorkspace(unittest.TestCase):
    def tearDown(self):
        cleanup_test_workspace()

    def test_setup_removes_stale_files_and_teardown_removes_all_test_output(self):
        workspace = prepare_test_workspace()
        stale_file = workspace / "stale-from-interrupted-run.txt"
        stale_file.write_text("stale", encoding="utf-8")

        refreshed_workspace = prepare_test_workspace()
        self.assertEqual(refreshed_workspace, TEST_WORKSPACE_ROOT)
        self.assertFalse(stale_file.exists())

        with test_temp_directory() as run_directory:
            output_file = run_directory / "generated-output.json"
            output_file.write_text("{}", encoding="utf-8")
            self.assertTrue(output_file.is_file())

        cleanup_test_workspace()
        self.assertFalse(TEST_WORKSPACE_ROOT.exists())

    def test_activation_redirects_default_tempdir_and_deactivation_removes_it(self):
        previous_tempdir = activate_test_workspace()
        try:
            with tempfile.TemporaryDirectory() as run_directory:
                self.assertEqual(TEST_WORKSPACE_ROOT, Path(run_directory).parent)
        finally:
            deactivate_test_workspace(previous_tempdir)

        self.assertFalse(TEST_WORKSPACE_ROOT.exists())


if __name__ == "__main__":
    unittest.main()
