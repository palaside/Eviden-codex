import assert from "node:assert/strict";
import test from "node:test";
import { extractEmvcoAmount } from "../emvco-parser.ts";

test("reads the amount from EMVCo tag 54 using its declared length", () => {
  assert.equal(extractEmvcoAmount("00020101021254072000.005802TH"), 2000);
});

test("does not treat digits in other tags as the transfer amount", () => {
  assert.equal(extractEmvcoAmount("0002010102125204200053037645802TH"), null);
});

test("returns null for truncated or invalid amount fields", () => {
  assert.equal(extractEmvcoAmount("00020154072000."), null);
  assert.equal(extractEmvcoAmount("0002015404ABCD"), null);
});
