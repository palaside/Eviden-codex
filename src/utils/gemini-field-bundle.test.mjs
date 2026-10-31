import test from "node:test";
import assert from "node:assert/strict";
import { buildGeminiFieldBundlePayload } from "./gemini-field-bundle.mjs";

test("builds one Gemini request containing every field crop for one slip", () => {
  const payload = buildGeminiFieldBundlePayload({
    slipId: "slip-001",
    fields: [
      { field: "sender_name", cropDataUrl: "data:image/png;base64,a" },
      { field: "receiver_name", cropDataUrl: "data:image/png;base64,b" },
      { field: "amount", cropDataUrl: "data:image/png;base64,c" },
    ],
  });

  assert.equal(payload.contents.length, 1);
  assert.equal(payload.contents[0].parts.filter((part) => part.inline_data).length, 3);
  assert.equal(payload.contents[0].parts.filter((part) => part.text).length, 4);
  assert.match(payload.contents[0].parts[0].text, /sender_name/);
  assert.match(payload.contents[0].parts[0].text, /receiver_name/);
  assert.match(payload.contents[0].parts[0].text, /amount/);
  assert.equal(payload.generationConfig.response_mime_type, "application/json");
});

test("rejects an empty field bundle instead of sending an ambiguous request", () => {
  assert.throws(() => buildGeminiFieldBundlePayload({ slipId: "slip-001", fields: [] }), /field crop/i);
});
