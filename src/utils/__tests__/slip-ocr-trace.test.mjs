import test from "node:test";
import assert from "node:assert/strict";
import { buildOcrAttemptTrace, explainSlipOcrRegionRejection } from "../slip-ocr-trace.mjs";

test("maps enlarged retry OCR line boxes into source-image coordinates", () => {
  const attempt = buildOcrAttemptTrace({
    id: "recipient-retry-1",
    scope: "recipient_retry",
    trigger: "recipient_missing",
    sourceBounds: { x: 100, y: 50, width: 300, height: 200 },
    inputWidth: 600,
    inputHeight: 400,
    scale: 2,
    meanConfidence: 81,
    lines: [{ text: "นางสาว ตัวอย่าง", confidence: 92, bbox: { x0: 20, y0: 30, x1: 80, y1: 50 } }],
  });

  assert.equal(attempt.id, "recipient-retry-1");
  assert.deepEqual(attempt.lines[0], {
    id: "recipient-retry-1-line-0",
    text: "นางสาว ตัวอย่าง",
    confidence: 92,
    bounds: { x: 110, y: 65, width: 30, height: 10 },
  });
});

test("explains why an unanchored standalone amount was not promoted to an OCR region", () => {
  const reasons = explainSlipOcrRegionRejection({
    qrCount: 0,
    regionCount: 0,
    lines: [
      { text: "โอนเงินสําเร็จ" },
      { text: "8,000.00" },
      { text: "น.ส. จิณห์นิภา ประุ" },
      { text: "นางสาว วันวิศา ประสาทเขตรการ" },
      { text: "GSB" },
    ],
  });

  assert.match(reasons[0], /ไม่มีบรรทัดป้าย Ref ID/u);
});
