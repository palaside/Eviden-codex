import assert from "node:assert/strict";
import test from "node:test";
import { extractReferenceNo } from "../qr-reference.ts";

test("does not mistake an opaque EMV QR payload for a transaction reference", () => {
  assert.equal(extractReferenceNo("00390006000001010301102182025081619035645085102TH9104A406"), null);
});

test("extracts only an explicitly labeled reference from a non-URL payload", () => {
  assert.equal(extractReferenceNo("bank-slip|ref=Ad376c9bab2034e41"), "Ad376c9bab2034e41");
});

test("extracts a reference from a recognized URL query parameter", () => {
  assert.equal(extractReferenceNo("https://bank.example/slip?ref=REF-2025-001"), "REF-2025-001");
});

test("extracts the transaction reference from nested EMVCo tag 00 tag 02", () => {
  const reference = "Afe1cd222498c42a5";
  const nested = `0006000001${"0103006"}02${String(reference.length).padStart(2, "0")}${reference}`;
  const payload = `00${String(nested.length).padStart(2, "0")}${nested}5102TH9104A406`;

  assert.equal(extractReferenceNo(payload), reference);
});

test("does not treat a top-level EMVCo tag 02 timestamp as a reference", () => {
  const timestamp = "20250816190356450";
  const payload = `02${String(timestamp.length).padStart(2, "0")}${timestamp}5303840`;

  assert.equal(extractReferenceNo(payload), null);
});

test("rejects malformed EMVCo lengths instead of returning a partial reference", () => {
  const reference = "Afe1cd222498c42a5";
  const nested = `0006000001${"0103006"}02${String(reference.length).padStart(2, "0")}${reference}`;
  const payload = `00${String(nested.length).padStart(2, "0")}${nested}5102TH9104A406`;

  assert.equal(extractReferenceNo(payload.slice(0, -1)), null);
});
