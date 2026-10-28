import assert from "node:assert/strict";
import test from "node:test";
import { encodeEvidenceQueueFiles, EXTRACTION_VERSION, restoreEvidenceQueueSnapshot, serializeEvidenceQueueSnapshot } from "../evidence-queue-persistence.ts";
import { summarizeDetectedSlipRecipients } from "../slip-recipient-summary.ts";

test("restores processed slip candidates, source files, crops, and page provenance after refresh", async () => {
  const sourceFile = new File([new Uint8Array([1, 2, 3])], "chat.png", { type: "image/png", lastModified: 123 });
  const queue = [{
    id: "chat-1",
    file: sourceFile,
    previewUrl: "blob:old-session-url",
    category: "CHAT",
    status: "done",
    chatSlices: ["data:image/png;base64,cGFnZQ=="],
    embeddedSlips: [{
      id: "candidate-1",
      extractionVersion: EXTRACTION_VERSION,
      sourceItemId: "chat-1",
      sourceFileName: "chat.png",
      data: { receiver: { name: "น.ส. ตัวอย่าง" }, transaction: { amount: 2000 } },
      sourceBounds: { x: 10, y: 20, width: 30, height: 40 },
      cropDataUrl: "data:image/png;base64,Y3JvcA==",
      chatPageNumber: 7,
      chatPageCount: 9,
      dossierPageNumber: 11,
      isDuplicate: false,
      isConfirmed: false,
      needsReview: true,
    }],
  }];
  const manifest = [{ no: 1, file_name: "chat.png", sha256: "abc" }];

  const snapshot = serializeEvidenceQueueSnapshot(queue, manifest);
  const restored = await restoreEvidenceQueueSnapshot(snapshot, (blob) => `blob:new-${blob.size}`);

  assert.equal(restored.stagedQueue[0].file.name, "chat.png");
  assert.equal(restored.stagedQueue[0].file.lastModified, 123);
  assert.equal(await restored.stagedQueue[0].file.text(), "\u0001\u0002\u0003");
  assert.equal(restored.stagedQueue[0].previewUrl, "blob:new-3");
  assert.deepEqual(restored.stagedQueue[0].embeddedSlips, queue[0].embeddedSlips);
  assert.deepEqual(restored.manifestList, manifest);
});

test("round-trips reviewed OCR corrections without storing Blob objects", async () => {
  const sourceFile = new File([new Uint8Array([9, 8, 7])], "slip.png", { type: "image/png", lastModified: 456 });
  const snapshot = serializeEvidenceQueueSnapshot([{
    id: "reviewed-slip",
    file: sourceFile,
    previewUrl: "blob:temporary",
    category: "SLIP",
    status: "done",
    embeddedSlips: [{
      id: "candidate",
      extractionVersion: EXTRACTION_VERSION,
      isConfirmed: false,
      data: { receiver: { name: "ชื่อที่ผู้ใช้แก้" }, transaction: { amount: 3000 } },
      reviewed_fields: ["receiver_name"],
    }],
  }], []);

  const encoded = await encodeEvidenceQueueFiles(snapshot);
  assert.equal(encoded.stagedQueue[0].file, undefined);
  assert.equal(encoded.stagedQueue[0].fileBytes instanceof ArrayBuffer, true);
  const restored = await restoreEvidenceQueueSnapshot(encoded, () => "blob:restored");

  assert.equal(restored.stagedQueue[0].file.name, "slip.png");
  assert.equal(restored.stagedQueue[0].file.type, "image/png");
  assert.equal(restored.stagedQueue[0].file.lastModified, 456);
  assert.equal(await restored.stagedQueue[0].file.text(), "\u0009\u0008\u0007");
  assert.equal(restored.stagedQueue[0].embeddedSlips[0].data.receiver.name, "ชื่อที่ผู้ใช้แก้");
  assert.deepEqual(restored.stagedQueue[0].embeddedSlips[0].reviewed_fields, ["receiver_name"]);
  assert.equal(restored.stagedQueue[0].embeddedSlips[0].isConfirmed, false);
});

test("invalidates stale unconfirmed OCR candidates while preserving source files and manifest", async () => {
  const sourceFile = new File([new Uint8Array([4, 5, 6])], "chatv3 (73).jpg", { type: "image/jpeg" });
  const queue = [{
    id: "chat-stale",
    file: sourceFile,
    previewUrl: "blob:old",
    category: "CHAT",
    status: "done",
    data: { transaction: { amount: 7200 } },
    embeddedSlips: [{ id: "false-positive", isConfirmed: false, data: { transaction: { amount: 7200 } } }],
  }];
  const manifest = [{ no: 1, file_name: sourceFile.name, sha256: "source-hash" }];
  const legacySnapshot = serializeEvidenceQueueSnapshot(queue, manifest);
  delete legacySnapshot.extractionVersion;

  const restored = await restoreEvidenceQueueSnapshot(legacySnapshot, () => "blob:restored");

  assert.equal(restored.stalePendingCount, 1);
  assert.equal(restored.stagedQueue[0].status, "staged");
  assert.equal(restored.stagedQueue[0].file.name, sourceFile.name);
  assert.equal(restored.stagedQueue[0].embeddedSlips, undefined);
  assert.equal(restored.stagedQueue[0].data, undefined);
  assert.deepEqual(restored.manifestList, manifest);
});

test("preserves confirmed records while invalidating stale unconfirmed records", async () => {
  const sourceFile = new File(["image"], "chat.png", { type: "image/png" });
  const snapshot = serializeEvidenceQueueSnapshot([{
    id: "chat-mixed",
    file: sourceFile,
    previewUrl: "blob:old",
    category: "CHAT",
    status: "done",
    embeddedSlips: [
      { id: "confirmed", isConfirmed: true, data: { transaction: { amount: 1000 } } },
      { id: "pending", isConfirmed: false, data: { transaction: { amount: 2000 } } },
    ],
  }], []);
  delete snapshot.extractionVersion;

  const restored = await restoreEvidenceQueueSnapshot(snapshot, () => "blob:restored");

  assert.equal(restored.stalePendingCount, 1);
  assert.deepEqual(restored.stagedQueue[0].embeddedSlips.map((item) => item.id), ["confirmed"]);
  assert.equal(restored.stagedQueue[0].status, "done");
});

test("does not trust a refreshed snapshot version to certify stale OCR records", async () => {
  const source = new File(["image"], "chat.png", { type: "image/png" });
  const snapshot = serializeEvidenceQueueSnapshot([{
    id: "chat-stale-after-hmr",
    file: source,
    previewUrl: "blob:old",
    category: "CHAT",
    status: "done",
    extractionVersion: EXTRACTION_VERSION - 1,
    data: { transaction: { amount: 7200 } },
    embeddedSlips: [{
      id: "stale-candidate",
      extractionVersion: EXTRACTION_VERSION - 1,
      isConfirmed: false,
      data: { transaction: { amount: 7200 } },
    }],
  }], []);
  snapshot.extractionVersion = EXTRACTION_VERSION;

  const restored = await restoreEvidenceQueueSnapshot(snapshot, () => "blob:restored");

  assert.equal(restored.stalePendingCount, 1);
  assert.equal(restored.stagedQueue[0].status, "staged");
  assert.equal(restored.stagedQueue[0].embeddedSlips, undefined);
  assert.equal(restored.stagedQueue[0].data, undefined);
  assert.equal(restored.stagedQueue[0].file.name, "chat.png");
});

test("preserves exact recipient evidence and never groups records by matching amounts", async () => {
  const source = new File(["image"], "slips.png", { type: "image/png" });
  const queue = ["2000", "100", "50", "50"].map((amount, index) => ({
    id: `candidate-${index}`,
    extractionVersion: EXTRACTION_VERSION,
    file: source,
    previewUrl: "blob:temporary",
    category: "CHAT",
    status: "done",
    embeddedSlips: [{
      id: `candidate-${index}`,
      extractionVersion: EXTRACTION_VERSION,
      data: { receiver: { name: index < 2 ? "น.ส. คนเดิม" : `บุคคล ${index}` }, transaction: { amount: Number(amount) } },
      cropDataUrl: `data:image/png;base64,${index}`,
      chatPageNumber: index + 1,
      dossierPageNumber: index + 4,
    }],
  }));

  const restored = await restoreEvidenceQueueSnapshot(serializeEvidenceQueueSnapshot(queue, []), () => "blob:restored");
  assert.deepEqual(restored.stagedQueue.map((item) => item.embeddedSlips[0].data.receiver.name), [
    "น.ส. คนเดิม", "น.ส. คนเดิม", "บุคคล 2", "บุคคล 3",
  ]);
  assert.equal(restored.stagedQueue.flatMap((item) => item.embeddedSlips).length, 4);
  const summary = summarizeDetectedSlipRecipients(restored.stagedQueue.flatMap((item) => item.embeddedSlips.map((slip) => ({
    ...slip,
    source: item.file.name,
    chatPage: String(slip.chatPageNumber),
    crop: slip.cropDataUrl,
    data: slip.data,
  }))));
  assert.deepEqual(summary.groups.map(({ name, totalAmount }) => [name, totalAmount]), [
    ["คนเดิม", 2100], ["บุคคล 2", 50], ["บุคคล 3", 50],
  ]);
});

test("retains a current candidate in a stale queue item but drops stale derived OCR layers", async () => {
  const source = new File(["image"], "chat.png", { type: "image/png" });
  const snapshot = serializeEvidenceQueueSnapshot([{
    id: "chat-mixed-version",
    file: source,
    previewUrl: "blob:old",
    category: "CHAT",
    status: "done",
    extractionVersion: EXTRACTION_VERSION - 1,
    chatEvidenceLayers: [{ pageNumber: 1, layer1: [], layer2: [], warnings: [] }],
    embeddedSlips: [{
      id: "current-candidate",
      extractionVersion: EXTRACTION_VERSION,
      isConfirmed: false,
      data: { transaction: { amount: 3000 } },
    }],
  }], []);

  const restored = await restoreEvidenceQueueSnapshot(snapshot, () => "blob:restored");

  assert.equal(restored.stalePendingCount, 0);
  assert.equal(restored.stagedQueue[0].embeddedSlips[0].id, "current-candidate");
  assert.equal(restored.stagedQueue[0].chatEvidenceLayers, undefined);
});

test("re-stages stale unconfirmed standalone slip results while preserving confirmed data", async () => {
  const source = new File(["image"], "slip.png", { type: "image/png" });
  const snapshot = serializeEvidenceQueueSnapshot([{
    id: "slip-old",
    file: source,
    previewUrl: "blob:old",
    category: "SLIP",
    status: "done",
    extractionVersion: EXTRACTION_VERSION - 1,
    data: { transaction: { amount: 7200 } },
    isConfirmed: false,
  }], []);

  const restored = await restoreEvidenceQueueSnapshot(snapshot, () => "blob:restored");

  assert.equal(restored.stalePendingCount, 1);
  assert.equal(restored.stagedQueue[0].status, "staged");
  assert.equal(restored.stagedQueue[0].data, undefined);
  assert.equal(restored.stagedQueue[0].file.name, "slip.png");
});

test("preserves a user-confirmed standalone slip even when its extraction version is old", async () => {
  const source = new File(["image"], "confirmed-slip.png", { type: "image/png" });
  const snapshot = serializeEvidenceQueueSnapshot([{
    id: "confirmed-slip-old",
    file: source,
    previewUrl: "blob:old",
    category: "SLIP",
    status: "done",
    extractionVersion: EXTRACTION_VERSION - 1,
    data: { transaction: { amount: 3000 } },
    isConfirmed: true,
  }], []);

  const restored = await restoreEvidenceQueueSnapshot(snapshot, () => "blob:restored");

  assert.equal(restored.stalePendingCount, 0);
  assert.equal(restored.stagedQueue[0].data.transaction.amount, 3000);
  assert.equal(restored.stagedQueue[0].isConfirmed, true);
});

test("re-stages version 5 OCR candidates so provenance labels are regenerated", async () => {
  const source = new File(["image"], "chatv3 (77).jpg", { type: "image/jpeg" });
  const snapshot = serializeEvidenceQueueSnapshot([{
    id: "chat-v5-with-unlabeled-ocr",
    file: source,
    previewUrl: "blob:old",
    category: "CHAT",
    status: "done",
    extractionVersion: 5,
    embeddedSlips: [{
      id: "candidate-v5",
      extractionVersion: 5,
      isConfirmed: false,
      data: { transaction: { amount: 3000 } },
      ocrTextBoxes: [{ text: "จำนวนเงิน 3,000 บาท", confidence: 0.9, bounds: { x: 1, y: 2, width: 3, height: 4 } }],
    }],
  }], []);

  const restored = await restoreEvidenceQueueSnapshot(snapshot, () => "blob:restored");

  assert.ok(EXTRACTION_VERSION > 5, "the active extraction version must be newer than the legacy candidate version");
  assert.equal(restored.stalePendingCount, 1);
  assert.equal(restored.stagedQueue[0].status, "staged");
  assert.equal(restored.stagedQueue[0].embeddedSlips, undefined);
  assert.equal(restored.stagedQueue[0].file.name, "chatv3 (77).jpg");
});
