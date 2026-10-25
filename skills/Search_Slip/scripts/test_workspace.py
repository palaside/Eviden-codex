"""Owned temporary workspace for the Search_Slip Python test suite."""

from contextlib import contextmanager
from pathlib import Path
import shutil
import tempfile
from typing import Iterator


SCRIPTS_DIRECTORY = Path(__file__).resolve().parent
TEST_WORKSPACE_ROOT = SCRIPTS_DIRECTORY / ".test-workspace"


def _assert_owned_workspace() -> None:
    if TEST_WORKSPACE_ROOT.parent != SCRIPTS_DIRECTORY or TEST_WORKSPACE_ROOT.name != ".test-workspace":
        raise RuntimeError("Refusing to remove a test workspace outside Search_Slip/scripts")


def cleanup_test_workspace() -> None:
    """Remove only the test-owned workspace, including stale interrupted runs."""
    _assert_owned_workspace()
    if TEST_WORKSPACE_ROOT.exists():
        shutil.rmtree(TEST_WORKSPACE_ROOT)


def prepare_test_workspace() -> Path:
    """Start a run from an empty, test-owned workspace."""
    cleanup_test_workspace()
    TEST_WORKSPACE_ROOT.mkdir(parents=True, exist_ok=False)
    return TEST_WORKSPACE_ROOT


def activate_test_workspace() -> str | None:
    """Route ``tempfile`` calls in one test module to the owned workspace."""
    previous_tempdir = tempfile.tempdir
    tempfile.tempdir = str(prepare_test_workspace())
    return previous_tempdir


def deactivate_test_workspace(previous_tempdir: str | None) -> None:
    """Restore Python's prior temp directory and remove this module's output."""
    tempfile.tempdir = previous_tempdir
    cleanup_test_workspace()


@contextmanager
def test_temp_directory() -> Iterator[Path]:
    """Create one automatically removed directory below the owned workspace."""
    _assert_owned_workspace()
    TEST_WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=TEST_WORKSPACE_ROOT) as directory:
        yield Path(directory)
