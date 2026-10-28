import assert from "node:assert/strict";
import test from "node:test";
import { identifyBankFromPayload } from "../qr-bank-domain.mjs";

test("identifies a supported Thai bank only from the parsed HTTP(S) hostname", () => {
  assert.deepEqual(identifyBankFromPayload("https://verify.scb.co.th/slip/202606150001"), {
    code: "014",
    name: "ธนาคารไทยพาณิชย์ (SCB)",
    confidence: 0.99,
    status: "BANK_DOMAIN_MATCH",
  });
  assert.deepEqual(identifyBankFromPayload("https://kasikornbank.com/slip/202606150001"), {
    code: "004",
    name: "ธนาคารกสิกรไทย (KBANK)",
    confidence: 0.99,
    status: "BANK_DOMAIN_MATCH",
  });
});

test("identifies every bank domain configured by the app", () => {
  const cases = [
    ["https://kasikornbank.com/slip/1", "004"],
    ["https://scb.co.th/slip/1", "014"],
    ["https://bangkokbank.com/slip/1", "002"],
    ["https://krungthai.com/slip/1", "006"],
    ["https://kiatnakin.co.th/slip/1", "069"],
    ["https://krungsri.com/slip/1", "025"],
    ["https://ttbbank.com/slip/1", "011"],
    ["https://gsb.or.th/slip/1", "030"],
  ];

  for (const [payload, expectedCode] of cases) {
    const result = identifyBankFromPayload(payload);
    assert.equal(result.code, expectedCode, payload);
    assert.equal(result.status, "BANK_DOMAIN_MATCH", payload);
    assert.equal(result.confidence, 0.99, payload);
  }
});

test("matches the qr-slip-decoder skill decision table for its supported domains", () => {
  const cases = [
    ["https://verify.bangkokbank.com/eslip?id=1", "002"],
    ["https://verify.kkpfg.com/check/abc", "069"],
    ["https://eslip.kiatnakin.co.th/v/xyz", "069"],
    ["https://verify.kasikornbank.com/slip/123", "004"],
    ["https://verify.scb.co.th/slip/999", "014"],
  ];

  for (const [payload, expectedCode] of cases) {
    const result = identifyBankFromPayload(payload);
    assert.equal(result.code, expectedCode, payload);
    assert.equal(result.status, "BANK_DOMAIN_MATCH", payload);
  }
});

test("does not identify a bank from a domain-like substring in an opaque payload", () => {
  assert.deepEqual(identifyBankFromPayload("opaque-payload|kasikornbank.com|ref=12345678"), {
    code: "000",
    name: "ธนาคารไม่ระบุ",
    confidence: 0,
    status: "INVALID_PAYLOAD",
  });
});

test("does not infer a verification bank from a non-URL EMVCo transfer payload", () => {
  const result = identifyBankFromPayload("00020101021229370016A00000067701011101130066812345678");

  assert.equal(result.code, "000");
  assert.equal(result.confidence, 0);
  assert.equal(result.status, "INVALID_PAYLOAD");
});

test("rejects non-HTTP schemes, deceptive suffixes, and bank names in query parameters", () => {
  for (const payload of [
    "ftp://kasikornbank.com/slip/12345678",
    "https://kasikornbank.com.attacker.invalid/slip/12345678",
    "https://unknown.invalid/verify?redirect=kasikornbank.com",
  ]) {
    const result = identifyBankFromPayload(payload);
    assert.equal(result.code, "000", payload);
    assert.equal(result.confidence, 0, payload);
    assert.equal(result.status, payload.startsWith("ftp:") ? "INVALID_PAYLOAD" : "UNMAPPED_DOMAIN", payload);
  }
});

test("keeps unknown-bank confidence at zero and exposes the reason", () => {
  assert.deepEqual(identifyBankFromPayload("https://unknown.invalid/slip/12345678"), {
    code: "000",
    name: "ธนาคารไม่ระบุ",
    confidence: 0,
    status: "UNMAPPED_DOMAIN",
  });
  assert.deepEqual(identifyBankFromPayload(""), {
    code: "000",
    name: "ธนาคารไม่ระบุ",
    confidence: 0,
    status: "QR_UNREADABLE",
  });
});
