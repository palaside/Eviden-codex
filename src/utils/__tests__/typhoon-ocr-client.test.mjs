import test from "node:test";
import assert from "node:assert/strict";
import { requestTyphoonOcr } from "../typhoon-ocr-client.mjs";

test("requires explicit user consent before making any remote OCR request", async () => {
  let calls = 0;
  await assert.rejects(
    requestTyphoonOcr(new Blob(["evidence"]), { consent: false, fetchImpl: async () => { calls += 1; } }),
    /consent/i,
  );
  assert.equal(calls, 0);
});

test("sends one consent-marked request and returns review data without remote fallback", async () => {
  const calls = [];
  const result = await requestTyphoonOcr(new Blob(["evidence"]), {
    consent: true,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ success: true, data: { raw_text: ["อ่านได้"] } }), { status: 200 });
    },
  });

  assert.equal(result.data.raw_text[0], "อ่านได้");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/slips/typhoon");
  assert.equal(calls[0].options.headers["x-evidence-upload-consent"], "confirmed");
  assert.equal(calls[0].options.body.get("externalOcrConsent"), "confirmed");
});
