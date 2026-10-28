import test from "node:test";
import assert from "node:assert/strict";
import { validateTyphoonUpload } from "../typhoon-ocr-contract.mjs";

test("requires explicit consent, supported image MIME type, and bounded upload size", () => {
  assert.equal(validateTyphoonUpload({ consentHeader: "confirmed", consentField: "confirmed", mimeType: "image/png", size: 100 }), null);
  assert.match(validateTyphoonUpload({ consentHeader: "", consentField: "confirmed", mimeType: "image/png", size: 100 }), /consent/i);
  assert.match(validateTyphoonUpload({ consentHeader: "confirmed", consentField: "confirmed", mimeType: "application/pdf", size: 100 }), /PNG or JPEG/i);
  assert.match(validateTyphoonUpload({ consentHeader: "confirmed", consentField: "confirmed", mimeType: "image/jpeg", size: 20 * 1024 * 1024 + 1 }), /20 MB/i);
});
