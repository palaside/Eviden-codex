import assert from "node:assert/strict";
import test from "node:test";
import { CHAT_SEMANTIC_TAXONOMY, classifyChatRegion, classifyChatTextGroup, detectChatChromeTrim } from "../chat-semantic-heuristics.mjs";

test("labels OCR-contained contours as heuristic text-bubble candidates with rationale", () => {
  const result = classifyChatRegion({ bounds: { x: 30, y: 40, width: 180, height: 60 }, contourArea: 6000, perimeter: 500 }, [
    { text: "โอนแล้ว", bounds: { x: 45, y: 55, width: 75, height: 20 } },
  ], { width: 400, height: 600 });
  assert.equal(result.semanticClass, "text_bubble_candidate");
  assert.equal(result.method, "heuristic");
  assert.match(result.rationale, /OCR/u);
});

test("labels a visual region near file attachment OCR as a file-card candidate", () => {
  const result = classifyChatRegion({ bounds: { x: 40, y: 100, width: 240, height: 90 }, contourArea: 8000, perimeter: 650 }, [
    { text: "รายงาน.pdf 2.4 MB", bounds: { x: 55, y: 115, width: 160, height: 25 } },
  ], { width: 400, height: 600 });
  assert.equal(result.semanticClass, "file_card_candidate");
  assert.equal(result.method, "heuristic");
});

test("exposes all 23 semantic heuristic classes and never presents a class as confirmed", () => {
  assert.equal(CHAT_SEMANTIC_TAXONOMY.length, 23);
  const result = classifyChatTextGroup([
    { index: 3, text: "โอนเงินแล้ว", bounds: { x: 240, y: 80, width: 100, height: 30 } },
  ], { width: 400, height: 600 });
  assert.equal(result.semanticClass, "outgoing_text_bubble_candidate");
  assert.equal(result.method, "heuristic");
  assert.equal(result.needsReview, true);
  assert.ok(CHAT_SEMANTIC_TAXONOMY.includes(result.semanticClass));
  assert.match(result.rationale, /ไม่ได้ตรวจขอบ/u);
});

test("only trims chat chrome when OCR provides explicit UI cues and preserves first/last edges", () => {
  const lines = [
    { text: "AIS 22:19 WiFi 55%", bounds: { x: 10, y: 4, width: 220, height: 18 } },
    { text: "Nuttachai", bounds: { x: 100, y: 35, width: 120, height: 25 } },
    { text: "พิมพ์ข้อความ", bounds: { x: 80, y: 560, width: 140, height: 22 } },
  ];
  const trim = detectChatChromeTrim(lines, { width: 400, height: 600 }, { isFirst: false, isLast: false });
  assert.equal(trim.top, 70);
  assert.equal(trim.bottom, 530);
  assert.equal(trim.topMethod, "ocr_ui_cue");
  assert.equal(trim.bottomMethod, "ocr_ui_cue");
  const firstLast = detectChatChromeTrim(lines, { width: 400, height: 600 }, { isFirst: true, isLast: true });
  assert.equal(firstLast.top, 0);
  assert.equal(firstLast.bottom, 600);
});

test("leaves the full image untouched when UI chrome evidence is absent", () => {
  const trim = detectChatChromeTrim([{ text: "โอนเงินแล้ว", bounds: { x: 30, y: 20, width: 100, height: 20 } }], { width: 300, height: 500 }, { isFirst: false, isLast: false });
  assert.equal(trim.top, 0);
  assert.equal(trim.bottom, 500);
  assert.ok(trim.warnings.length);
});

test("does not mistake ordinary chat mentioning send/message text for the composer", () => {
  const trim = detectChatChromeTrim([
    { text: "AIS 22:19 WiFi 55%", bounds: { x: 10, y: 0, width: 220, height: 18 } },
    { text: "ส่งข้อความถึงเขาแล้ว", bounds: { x: 30, y: 570, width: 180, height: 20 } },
  ], { width: 400, height: 600 }, { isFirst: false, isLast: false });
  assert.equal(trim.bottom, 600);
  assert.equal(trim.bottomMethod, "preserved");
});
