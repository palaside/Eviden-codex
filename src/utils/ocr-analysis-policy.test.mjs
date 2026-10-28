import assert from "node:assert/strict";
import test from "node:test";
import { filterTextOnlySlipRegionsForJob, shouldBuildChatEvidenceLayers } from "./ocr-analysis-policy.mjs";

test("builds semantic heuristic layers only for chat jobs", () => {
  assert.equal(shouldBuildChatEvidenceLayers("CHAT"), true);
  assert.equal(shouldBuildChatEvidenceLayers("SLIP"), false);
});

test("does not promote a text-only chat transaction into a slip candidate", () => {
  const region = { bounds: { x0: 20, y0: 30, x1: 220, y1: 180 } };
  assert.deepEqual(filterTextOnlySlipRegionsForJob([region], {
    jobKind: "CHAT",
    visualCandidates: [],
    qrCandidates: [],
  }), []);
});

test("keeps a chat OCR slip candidate when it overlaps a visual image candidate", () => {
  const region = {
    bounds: { x0: 20, y0: 30, x1: 220, y1: 180 },
    amount: 3000,
    amountConfidence: 0.94,
    bankName: "ธนาคารกรุงไทย",
    bankConfidence: 0.95,
    referenceNo: "A82bde77a7ade414c",
    referenceConfidence: 0.8,
    date: "2025-06-20",
    dateConfidence: 0.84,
    time: "14:15",
    timeConfidence: 0.89,
    rawText: "โอนเงินสำเร็จ รหัสอ้างอิง A82bde77a7ade414c ธนาคารกรุงไทย จำนวนเงิน 3,000.00 บาท วันที่ทำรายการ 20 มิ.ย. 2568 - 14:15",
  };
  assert.deepEqual(filterTextOnlySlipRegionsForJob([region], {
    jobKind: "CHAT",
    visualCandidates: [{
      objectTypeCandidate: "image_or_sticker_candidate",
      bounds: { x: 15, y: 25, width: 210, height: 160 },
    }],
    qrCandidates: [],
  }), [region]);
});

test("does not use text bubble segmentation as proof of an embedded slip", () => {
  const region = { bounds: { x0: 20, y0: 30, x1: 220, y1: 180 } };
  assert.deepEqual(filterTextOnlySlipRegionsForJob([region], {
    jobKind: "CHAT",
    visualCandidates: [{
      objectTypeCandidate: "text_bubble_candidate",
      bounds: { x: 15, y: 25, width: 210, height: 160 },
    }],
    qrCandidates: [],
  }), []);
});

test("rejects structured OCR when the only visual object is a chat bubble", () => {
  const region = {
    bounds: { x0: 20, y0: 30, x1: 420, y1: 480 },
    amount: 7200,
    amountConfidence: 0.95,
    bankName: "ธนาคารทหารไทยธนชาต",
    bankConfidence: 0.91,
    referenceNo: "202506171502627774",
    referenceConfidence: 0.94,
    date: "2025-06-17",
    dateConfidence: 0.9,
    time: "15:51",
    timeConfidence: 0.9,
    rawText: "โอนเงินสำเร็จ วันที่ 17 มิ.ย. 68 15:51 ธนาคารทหารไทยธนชาต จำนวนเงิน 7,200.00 รหัสอ้างอิง 202506171502627774",
  };

  assert.deepEqual(filterTextOnlySlipRegionsForJob([region], {
    jobKind: "CHAT",
    visualCandidates: [{
      objectTypeCandidate: "text_bubble_candidate",
      bounds: { x: 15, y: 25, width: 410, height: 460 },
    }],
    qrCandidates: [],
  }), []);
});

test("does not promote complete OCR fields without visual or QR evidence", () => {
  const region = {
    bounds: { x0: 205, y0: 424, x1: 600, y1: 815 },
    amount: 5000,
    amountConfidence: 0.91,
    bankName: "ธนาคารกรุงไทย",
    bankConfidence: 0.88,
    referenceNo: "Afelcd222498c42a5",
    referenceConfidence: 0.82,
    date: "2025-06-09",
    dateConfidence: 0.9,
    time: "14:45",
    timeConfidence: 0.9,
    rawText: "โอนเงินสำเร็จ ธนาคารกรุงไทย จำนวนเงิน 5,000.00 บาท รหัสอ้างอิง Afelcd222498c42a5 วันที่ 09 บิ.ย. 2568 14:45",
  };

  assert.deepEqual(filterTextOnlySlipRegionsForJob([region], {
    jobKind: "CHAT",
    visualCandidates: [],
    qrCandidates: [],
  }), []);
});

test("does not retain a mislabeled chat bubble from amount and bank OCR alone", () => {
  const region = {
    bounds: { x0: 20, y0: 30, x1: 220, y1: 180 },
    amount: 7200,
    amountConfidence: 0.95,
    bankName: "ธนาคารทหารไทยธนชาต",
    bankConfidence: 0.91,
  };
  assert.deepEqual(filterTextOnlySlipRegionsForJob([region], {
    jobKind: "CHAT",
    visualCandidates: [{
      objectTypeCandidate: "text_bubble_candidate",
      bounds: { x: 15, y: 25, width: 210, height: 160 },
    }],
    qrCandidates: [],
  }), []);
});

test("does not promote a chat bubble even when OCR also finds an account-like token", () => {
  const region = {
    bounds: { x0: 401, y0: 150, x1: 783, y1: 583 },
    amount: 7200,
    amountConfidence: 0.95,
    bankName: null,
    bankConfidence: 0,
    referenceNo: "202506171502627774",
    referenceConfidence: 0.94,
    receiverAccount: "XXX-X-XX996-5",
    rawText: "โอนเงินสำเร็จ 7200.00 รหัสอ้างอิง 202506171502627774 XXX-X-XX996-5",
  };
  assert.deepEqual(filterTextOnlySlipRegionsForJob([region], {
    jobKind: "CHAT",
    visualCandidates: [{
      objectTypeCandidate: "text_bubble_candidate",
      confidence: 0.62,
      bounds: { x: 416, y: 126, width: 352, height: 462 },
    }],
    qrCandidates: [],
  }), []);
});

test("keeps strong partial OCR for manual review when it overlaps an image object", () => {
  const region = {
    bounds: { x0: 401, y0: 170, x1: 783, y1: 561 },
    amount: 7200,
    amountConfidence: 0.73,
    bankName: null,
    bankConfidence: 0,
    referenceNo: "202506171502627774",
    referenceConfidence: 0.83,
    date: null,
    dateConfidence: 0,
    time: null,
    timeConfidence: 0,
    rawText: "โอนเงินสําเร็จ 7200.00 รหัสอ้างอิง: 202506171502627774",
  };

  assert.deepEqual(filterTextOnlySlipRegionsForJob([region], {
    jobKind: "CHAT",
    visualCandidates: [{
      objectTypeCandidate: "image_candidate",
      confidence: 0.9,
      bounds: { x: 416, y: 126, width: 352, height: 462 },
    }],
    qrCandidates: [],
  }), [region]);
});

test("rejects a low-confidence color contour that looks like a chat bubble", () => {
  const region = {
    bounds: { x0: 401, y0: 150, x1: 783, y1: 583 },
    amount: 7200,
    amountConfidence: 0.95,
    bankName: null,
    bankConfidence: 0,
    referenceNo: "202506171502627774",
    referenceConfidence: 0.94,
    date: null,
    dateConfidence: 0,
    time: null,
    timeConfidence: 0,
    rawText: "โอนเงินสำเร็จ 7200.00 รหัสอ้างอิง 202506171502627774",
  };
  assert.deepEqual(filterTextOnlySlipRegionsForJob([region], {
    jobKind: "CHAT",
    visualCandidates: [{
      objectTypeCandidate: "image_or_sticker_candidate",
      confidence: 0.48,
      bounds: { x: 416, y: 126, width: 352, height: 462 },
    }],
    qrCandidates: [],
  }), []);
});

test("does not promote transaction-like OCR inside a chat bubble without visual slip evidence", () => {
  const region = {
    bounds: { x0: 205, y0: 424, x1: 600, y1: 815 },
    amount: 5000,
    amountConfidence: 0.91,
    bankName: "ธนาคารกรุงไทย",
    bankConfidence: 0.88,
    referenceNo: "Afelcd222498c42a5",
    referenceConfidence: 0.82,
    date: null,
    time: null,
    rawText: "ธนาคารกรุงไทย\nจำนวนเงิน 5,000.00 บาท\nรหัสอ้างอิง Afelcd222498c42a5",
  };

  assert.deepEqual(filterTextOnlySlipRegionsForJob([region], {
    jobKind: "CHAT",
    visualCandidates: [{
      objectTypeCandidate: "text_bubble_candidate",
      bounds: { x: 206, y: 406, width: 396, height: 420 },
    }],
    qrCandidates: [],
  }), []);
});

test("does not treat a structured OCR transcript as a slip when it is only a chat bubble", () => {
  const region = {
    bounds: { x0: 193, y0: 440, x1: 638, y1: 895 },
    amount: 5000,
    amountConfidence: 0.89,
    bankName: "ธนาคารกรุงไทย",
    bankConfidence: 0.99,
    referenceNo: "Afelcd222498c42a5",
    referenceConfidence: 0.84,
    date: "2025-06-09",
    dateConfidence: 0.89,
    time: "14:45",
    timeConfidence: 0.89,
    rawText: "โอนเงินสําเร็จ\nรหัสอ้างอฮิง Afelcd222498c42a5\nธนาคารกรุงไทย\nจำนวนเงิน 5,000.00 บาท ค่าธรรมเนียม 0.00 บาท วันที่ทำรายการ 09 บิ.ย. 2568 - 14:45",
  };

  assert.deepEqual(filterTextOnlySlipRegionsForJob([region], {
    jobKind: "CHAT",
    visualCandidates: [{ objectTypeCandidate: "text_bubble_candidate", bounds: { x: 193, y: 440, width: 445, height: 455 } }],
  }), []);
});

test("does not promote low-confidence transaction OCR from a text bubble", () => {
  const region = {
    bounds: { x0: 193, y0: 440, x1: 638, y1: 895 },
    amount: 5000,
    amountConfidence: 0.48,
    bankName: "ธนาคารกรุงไทย",
    bankConfidence: 0.99,
    referenceNo: "Afelcd222498c42a5",
    referenceConfidence: 0.84,
    date: "2025-06-09",
    dateConfidence: 0.89,
    time: "14:45",
    timeConfidence: 0.89,
    rawText: "รหัสอ้างอฮิง Afelcd222498c42a5 กรุงไทย จำนวนเงิน 5,000.00 บาท วันที่ทำรายการ 09 บิ.ย. 2568 - 14:45",
  };

  assert.deepEqual(filterTextOnlySlipRegionsForJob([region], {
    jobKind: "CHAT",
    visualCandidates: [{ objectTypeCandidate: "text_bubble_candidate", bounds: { x: 193, y: 440, width: 445, height: 455 } }],
  }), []);
});

test("does not infer an embedded slip from amount and long reference without bank or date-time context", () => {
  const region = {
    bounds: { x0: 205, y0: 424, x1: 600, y1: 815 },
    amount: 5000,
    amountConfidence: 0.91,
    bankName: null,
    bankConfidence: 0,
    referenceNo: "Afelcd222498c42a5",
    referenceConfidence: 0.82,
    date: null,
    time: null,
    rawText: "จำนวนเงิน 5,000.00 บาท\nรหัสอ้างอิง Afelcd222498c42a5",
  };

  assert.deepEqual(filterTextOnlySlipRegionsForJob([region], {
    jobKind: "CHAT",
    visualCandidates: [{
      objectTypeCandidate: "text_bubble_candidate",
      bounds: { x: 206, y: 406, width: 396, height: 420 },
    }],
    qrCandidates: [],
  }), []);
});

test("does not retain a partial slip candidate without a long transaction reference", () => {
  const region = {
    bounds: { x0: 401, y0: 170, x1: 783, y1: 561 }, amount: 7200, amountConfidence: 0.73,
    referenceNo: "12345", referenceConfidence: 0.83,
    rawText: "โอนเงินสําเร็จ 7200.00 รหัสอ้างอิง 12345",
  };
  assert.deepEqual(filterTextOnlySlipRegionsForJob([region], {
    jobKind: "CHAT",
    visualCandidates: [{ objectTypeCandidate: "text_bubble_candidate", bounds: { x: 416, y: 126, width: 352, height: 462 } }],
    qrCandidates: [],
  }), []);
});

test("keeps a strongly corroborated no-QR slip only when it overlaps a visual image object", () => {
  const region = {
    bounds: { x0: 193, y0: 440, x1: 638, y1: 895 },
    amount: 5000,
    amountConfidence: 0.89,
    bankName: "ธนาคารกรุงไทย",
    bankConfidence: 0.99,
    referenceNo: "Afelcd222498c42a5",
    referenceConfidence: 0.84,
    date: "2025-06-09",
    dateConfidence: 0.89,
    time: "14:45",
    timeConfidence: 0.89,
    rawText: "โอนเงินสําเร็จ รหัสอ้างอิง Afelcd222498c42a5 ธนาคารกรุงไทย จำนวนเงิน 5,000.00 บาท วันที่ทำรายการ 09 มิ.ย. 2568 - 14:45",
  };

  assert.deepEqual(filterTextOnlySlipRegionsForJob([region], {
    jobKind: "CHAT",
    visualCandidates: [{ objectTypeCandidate: "image_candidate", bounds: { x: 190, y: 438, width: 450, height: 460 } }],
  }), [region]);
});

test("retains text-only slip candidates for SLIP files and regions anchored to a QR", () => {
  const region = { bounds: { x0: 20, y0: 30, x1: 220, y1: 180 } };
  assert.deepEqual(filterTextOnlySlipRegionsForJob([region], { jobKind: "SLIP" }), [region]);
  assert.deepEqual(filterTextOnlySlipRegionsForJob([region], {
    jobKind: "CHAT",
    visualCandidates: [],
    qrCandidates: [{ bounds: { x: 100, y: 80, width: 30, height: 30 } }],
  }), [region]);
});
