import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const appRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "../../../../..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier.startsWith("@/")) {
      let targetPath = resolvePath(appRoot, "src", specifier.slice(2));
      if (!existsSync(targetPath)) {
        const extension = [".ts", ".mjs"].find((suffix) => existsSync(`${targetPath}${suffix}`));
        if (extension) targetPath += extension;
      }
      const target = pathToFileURL(targetPath).href;
      return nextResolve(target, context);
    }
    return nextResolve(specifier, context);
  },
});

const { POST } = await import("./route.ts");

const validSlip = {
  document_type: "bank_transfer_slip",
  bank: { name: "Example Bank", confidence: 0.9 },
  transaction: {
    date: "2026-10-10",
    time: "12:30:00",
    amount: 1250,
    currency: "THB",
    fee: 0,
    reference_no: "REF-20261010",
    transaction_id: null,
    note: null,
  },
  sender: { name: "Sender Example", bank: "Example Bank", account_no: "xxx1234" },
  receiver: { name: "Receiver Example", bank: "Example Bank", account_no: "xxx5678" },
  confidence: {
    date: 0.9,
    time: 0.9,
    amount: 0.9,
    reference_no: 0.9,
    sender_name: 0.9,
    receiver_name: 0.9,
    sender_account: 0.9,
    receiver_account: 0.9,
  },
  raw_text: ["1250.00 THB"],
  warnings: [],
};

function makeRequest({ consentHeader = "confirmed", consentField = "confirmed", mimeType = "image/png" } = {}) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array([137, 80, 78, 71])], "evidence.png", { type: mimeType }));
  if (consentField) form.set("externalOcrConsent", consentField);
  return new Request("http://localhost/api/slips/typhoon", {
    method: "POST",
    headers: consentHeader ? { "x-evidence-upload-consent": consentHeader } : {},
    body: form,
  });
}

test("rejects unconsented and unsupported uploads before making a remote request", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.TYPHOON_API_KEY;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("unexpected remote request"); };
  process.env.TYPHOON_API_KEY = "test-key";
  try {
    const noConsent = await POST(makeRequest({ consentHeader: "", consentField: "" }));
    assert.equal(noConsent.status, 400);
    const unsupported = await POST(makeRequest({ mimeType: "application/pdf" }));
    assert.equal(unsupported.status, 400);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.TYPHOON_API_KEY;
    else process.env.TYPHOON_API_KEY = originalKey;
  }
});

test("sends a consented image once and validates the provider response", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.TYPHOON_API_KEY;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validSlip) } }] }));
  };
  process.env.TYPHOON_API_KEY = "test-key";
  try {
    const response = await POST(makeRequest());
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.match(body.sha256, /^[a-f0-9]{64}$/);
    assert.equal(body.data.transaction.amount, 1250);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.opentyphoon.ai/v1/chat/completions");
    assert.equal(requests[0].options.headers.Authorization, "Bearer test-key");
    assert.equal(JSON.parse(requests[0].options.body).model, "typhoon-ocr");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.TYPHOON_API_KEY;
    else process.env.TYPHOON_API_KEY = originalKey;
  }
});

test("rejects provider output that does not match the slip schema", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.TYPHOON_API_KEY;
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }));
  process.env.TYPHOON_API_KEY = "test-key";
  try {
    const response = await POST(makeRequest());
    assert.equal(response.status, 422);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.TYPHOON_API_KEY;
    else process.env.TYPHOON_API_KEY = originalKey;
  }
});

test("fails closed without an API key and does not attempt a remote request", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.TYPHOON_API_KEY;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("unexpected remote request"); };
  delete process.env.TYPHOON_API_KEY;
  try {
    const response = await POST(makeRequest());
    assert.equal(response.status, 500);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.TYPHOON_API_KEY;
    else process.env.TYPHOON_API_KEY = originalKey;
  }
});

test("does not expose provider error bodies or attempt an OCR fallback", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.TYPHOON_API_KEY;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("sensitive provider detail", { status: 503 });
  };
  process.env.TYPHOON_API_KEY = "test-key";
  try {
    const response = await POST(makeRequest());
    const body = await response.text();
    assert.equal(response.status, 502);
    assert.equal(calls, 1);
    assert.match(body, /No fallback was attempted/);
    assert.doesNotMatch(body, /sensitive provider detail/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.TYPHOON_API_KEY;
    else process.env.TYPHOON_API_KEY = originalKey;
  }
});

test("maps provider timeout to gateway timeout", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.TYPHOON_API_KEY;
  globalThis.fetch = async () => { throw Object.assign(new Error("timed out"), { name: "TimeoutError" }); };
  process.env.TYPHOON_API_KEY = "test-key";
  try {
    const response = await POST(makeRequest());
    assert.equal(response.status, 504);
    assert.match((await response.text()), /หมดเวลารอ/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.TYPHOON_API_KEY;
    else process.env.TYPHOON_API_KEY = originalKey;
  }
});

test("rejects malformed provider JSON without returning the raw OCR output", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.TYPHOON_API_KEY;
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: "not-json with private data" } }] }));
  process.env.TYPHOON_API_KEY = "test-key";
  try {
    const response = await POST(makeRequest());
    const body = await response.text();
    assert.equal(response.status, 422);
    assert.doesNotMatch(body, /private data/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.TYPHOON_API_KEY;
    else process.env.TYPHOON_API_KEY = originalKey;
  }
});
