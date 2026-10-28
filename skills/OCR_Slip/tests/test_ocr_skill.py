import importlib.util
import tempfile
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "ocr_slip.py"
SPEC = importlib.util.spec_from_file_location("ocr_slip_skill_test", SCRIPT)
OCR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(OCR)


def test_selects_available_thai_script_language_when_tha_is_missing():
    assert OCR.select_ocr_language(["eng", "osd", "script/Thai"]) == "script/Thai+eng"


def test_prefers_standard_thai_language_when_installed():
    assert OCR.select_ocr_language(["eng", "tha"]) == "tha+eng"


def test_parses_nested_tesseract_language_names_from_windows_output():
    output = '''List of available languages in "C:\\Tesseract\\tessdata/" (3):
eng
osd
script\\Thai'''

    assert OCR.parse_tesseract_languages(output) == ["eng", "osd", "script/Thai"]


def test_prefers_tessdata_directory_with_thai_model_over_legacy_english_only():
    with tempfile.TemporaryDirectory(dir=Path(__file__).parents[1]) as temp_dir:
        root = Path(temp_dir)
        legacy = root / "legacy"
        current = root / "current"
        (legacy / "script").mkdir(parents=True)
        (current / "script").mkdir(parents=True)
        (legacy / "eng.traineddata").touch()
        (current / "eng.traineddata").touch()
        (current / "script" / "Thai.traineddata").touch()

        assert OCR.resolve_tessdata_directory([legacy, current]) == current


def test_spaced_thai_glyphs_are_normalized_before_extracting_party_names():
    text = """จ า ก
ส ิ น ธ ร ั ญ ช ั ย s * * *
ไ ป ยั ง
น . ส . ว ิ ณ ท น ิ ก า ป ร ะ ส า ท เ ข ต ร ก า ร"""

    sender, receiver = OCR.extract_names_from_slip_text(text)

    assert "ไม่ระบุชื่อ" not in sender
    assert "ไม่ระบุชื่อ" not in receiver
    assert "สินธรัญชัย" in sender
    assert "วิณทนิกา" in receiver
    assert not receiver.startswith("น . ส .")


def test_recovers_party_lines_adjacent_to_ordered_masked_accounts_when_labels_are_noisy():
    text = """= ๕ 7” ส ิ น ธ ร ั ญ ช ั ย s * * *
กรุงไทย
XXX-X-XX526-6
ไป ย ั ง
wb ๓
น . ส . ว ิ ณ ห ์ น ิ ภา ป ร ะ ส า ท เ ข ต ร ก า ร
ทีเอ็มบีธนชาต
XXX-X-XX996-5"""

    sender, receiver = OCR.extract_names_from_slip_text(
        text,
        accs=["XXX-X-XX526-6", "XXX-X-XX996-5"],
    )

    assert "สินธรัญชัย" in sender
    assert "วิณห์นิภา" in receiver


def test_strips_explicit_military_rank_after_bounded_ocr_prefix_noise_without_rewriting_name():
    for rank_line in ["๕ 7” สิบตรี ณัฐชัย ร ***", "(ยสบดตรี ณัฐชัยร ***"]:
        text = f"จาก\n{rank_line}\nกรุงไทย\nXXX-X-XX526-6"

        sender, _ = OCR.extract_names_from_slip_text(text, accs=["XXX-X-XX526-6"])

        assert sender == "ณัฐชัยร *** (XXX-X-XX526-6)"


def test_strips_honorific_from_receiver_candidate_but_preserves_ocr_spelling():
    text = """ไปยัง
น.ส. จินห์นิกา ประสาทเขตรการ
XXX-X-XX996-5"""

    _, receiver = OCR.extract_names_from_slip_text(text, accs=["XXX-X-XX526-6", "XXX-X-XX996-5"])

    assert receiver == "จินห์นิกาประสาทเขตรการ (XXX-X-XX996-5)"


def test_keeps_noisy_rank_candidate_when_stripping_would_leave_only_latin_noise():
    text = """from
นายสมชาย ใจดี
กรุงไทย
XXX-X-XX452-9
ไปยัง
สิบตรี ngs
ธนาคารกรุงไทย
XXX-X-XX526-6"""

    _, receiver = OCR.extract_names_from_slip_text(
        text,
        accs=["XXX-X-XX452-9", "XXX-X-XX526-6"],
    )

    assert receiver == "สิบตรี ngs (XXX-X-XX526-6)"


def test_rejects_invalid_ocr_month_instead_of_emitting_a_date():
    assert OCR.format_slip_date("09", "00", "2568") is None


def test_rejects_impossible_calendar_day():
    assert OCR.format_slip_date("31", "04", "2568") is None


def test_accepts_valid_buddhist_calendar_date():
    assert OCR.format_slip_date("09", "06", "2568") == "09/06/2568"
