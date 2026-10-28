import assert from "node:assert/strict";
import test from "node:test";
import { discoverChatEntityOccurrences, getChatEntityDiscoveryDiagnostics } from "../chat-entity-discovery.mjs";
import { segmentOcrTextLines } from "../two-layer-segmentation.mjs";

function token(text, groupId, x, y, overrides = {}) {
  return {
    text,
    groupId,
    unit: "line",
    confidence: 0.91,
    bounds: { x, y, width: 240, height: 24 },
    sourceReferences: [{ sourceItemId: "chat-1", fileName: "chat.png", sha256: "abc", bounds: { x, y, width: 240, height: 24 } }],
    ...overrides,
  };
}

test("extracts only cue-backed full Thai person names as review-only occurrences", () => {
  const result = discoverChatEntityOccurrences([{
    sourceItemId: "chat-1", fileName: "chat.png", pageNumber: 7,
    layer2: [token("นาย สมชาย ใจดี", "message-1", 10, 20)],
  }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].cleanName, "สมชาย ใจดี");
  assert.equal(result[0].entityType, "PERSON");
  assert.equal(result[0].needsReview, true);
  assert.deepEqual(result[0].occurrences.map(({ sourceItemId, pageNumber, groupId }) => [sourceItemId, pageNumber, groupId]), [["chat-1", 7, "message-1"]]);
  assert.deepEqual(result[0].occurrences[0].bounds, { x: 10, y: 20, width: 240, height: 24 });
});

test("merges prefix variants as one exact full-name entity and preserves each page occurrence", () => {
  const result = discoverChatEntityOccurrences([
    { sourceItemId: "chat-a", fileName: "a.png", pageNumber: 1, layer2: [token("น.ส. สมใจ ใจดี", "g1", 1, 2)] },
    { sourceItemId: "chat-b", fileName: "b.png", pageNumber: 3, layer2: [token("นางสาว สมใจ ใจดี", "g2", 3, 4, { sourceReferences: [{ sourceItemId: "chat-b", fileName: "b.png", sha256: "def", bounds: { x: 3, y: 4, width: 240, height: 24 } }] })] },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].occurrences.length, 2);
  assert.deepEqual(result[0].occurrences.map(({ pageNumber }) => pageNumber), [1, 3]);
});

test("recognizes an explicit name label and a juristic entity without confirming either", () => {
  const result = discoverChatEntityOccurrences([{
    sourceItemId: "chat-1", fileName: "chat.png", pageNumber: 2,
    layer2: [token("ชื่อคู่สนทนา: จิณห์นิภา ประสาทเขตการ", "name-label", 10, 20), token("บริษัท ตัวอย่าง จำกัด", "company", 10, 60)],
  }]);
  assert.deepEqual(result.map(({ cleanName, entityType }) => [cleanName, entityType]), [
    ["จิณห์นิภา ประสาทเขตการ", "PERSON"],
    ["ตัวอย่าง จำกัด", "ORGANIZATION"],
  ]);
  assert.ok(result.every(({ needsReview }) => needsReview));
});

test("reconstructs explicit Thai name labels from Tesseract glyphs using source word boundaries", () => {
  const words = ["ชื่อคู่สนทนา:", "สมชาย", "ใจดี"];
  const layer2 = words.flatMap((word, wordIndex) => Array.from(word).map((character, charIndex) => token(
    character,
    "name-label",
    (wordIndex * 200) + (charIndex * 12),
    20,
    { unit: "glyph", wordIndex, bounds: { x: (wordIndex * 200) + (charIndex * 12), y: 20, width: 10, height: 24 } },
  )));
  const result = discoverChatEntityOccurrences([{
    sourceItemId: "chat-1", fileName: "chat.png", pageNumber: 1, layer2,
  }]);

  assert.equal(result.length, 1);
  assert.equal(result[0].rawName, "สมชาย ใจดี");
  assert.equal(result[0].needsReview, true);
  assert.equal(result[0].occurrences[0].evidenceText, "ชื่อคู่สนทนา: สมชาย ใจดี");
});

test("uses the original Tesseract line text when Thai name spaces are not word-box boundaries", () => {
  const layer = segmentOcrTextLines([{
    text: "ชื่อคู่สนทนา: สมชาย ใจดี",
    confidence: 0.94,
    index: 8,
    bounds: { x: 20, y: 30, width: 300, height: 28 },
    words: [{
      text: "ชื่อคู่สนทนา: สมชาย ใจดี",
      confidence: 0.94,
      bounds: { x: 20, y: 30, width: 300, height: 28 },
      symbols: Array.from("ชื่อคู่สนทนา: สมชาย ใจดี", (text, index) => ({
        text, confidence: 0.94, bounds: { x: 20 + index * 12, y: 30, width: 11, height: 28 },
      })),
    }],
  }], { width: 400, height: 100 });
  const result = discoverChatEntityOccurrences([{
    sourceItemId: "chat-1", fileName: "chat.png", pageNumber: 1, layer1: layer.layer1, layer2: layer.layer2,
  }]);

  assert.equal(result.length, 1);
  assert.equal(result[0].cleanName, "สมชาย ใจดี");
  assert.equal(result[0].occurrences[0].evidenceText, "ชื่อคู่สนทนา: สมชาย ใจดี");
});

test("discovers a full Latin-script name only when it has an explicit honorific cue", () => {
  const result = discoverChatEntityOccurrences([{
    sourceItemId: "chat-1", fileName: "chat.png", pageNumber: 4,
    layer2: [token("Ms. Jinnipa Prasatkhetkan", "latin-name", 10, 20)],
  }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].cleanName, "Jinnipa Prasatkhetkan");
  assert.equal(result[0].entityType, "PERSON");
  assert.equal(result[0].needsReview, true);
});

test("does not discover unlabelled conversational phrases or names inside embedded-slip bounds", () => {
  const result = discoverChatEntityOccurrences([{
    sourceItemId: "chat-1", fileName: "chat.png", pageNumber: 1,
    layer2: [
      token("นายช่วยกันเดี๋ยวก็เสร็จ", "ordinary-chat", 5, 5),
      token("นาย สมชาย ใจดี", "slip-text", 20, 200),
    ],
    excludedRegions: [{ sourceItemId: "chat-1", bounds: { x: 10, y: 190, width: 300, height: 80 } }],
  }]);
  assert.deepEqual(result, []);
});

test("does not merge partial or OCR-near names into a full-name entity", () => {
  const result = discoverChatEntityOccurrences([
    { sourceItemId: "chat-a", fileName: "a.png", pageNumber: 1, layer2: [token("นาย สมใจ ใจดี", "g1", 1, 2)] },
    { sourceItemId: "chat-b", fileName: "b.png", pageNumber: 2, layer2: [token("น.ส. สมใจ ใจดีเพิ่ม", "g2", 3, 4)] },
  ]);
  assert.equal(result.length, 2);
});

test("finds an exact unprefixed full-name mention from a slip identity as review-only evidence", () => {
  const result = discoverChatEntityOccurrences([{
    sourceItemId: "chat-1", fileName: "chat.png", pageNumber: 8,
    layer2: [token("พรุ่งนี้คุยกับ สมชาย ใจดี เรื่องเอกสาร", "message-1", 10, 20)],
  }], [{ cleanName: "นาย สมชาย ใจดี" }]);

  assert.equal(result.length, 1);
  assert.equal(result[0].cleanName, "สมชาย ใจดี");
  assert.equal(result[0].needsReview, true);
  assert.equal(result[0].occurrences[0].pageNumber, 8);
  assert.deepEqual(result[0].occurrences[0].bounds, { x: 10, y: 20, width: 240, height: 24 });
});

test("does not match partial or embedded known names and excludes embedded-slip OCR", () => {
  const result = discoverChatEntityOccurrences([{
    sourceItemId: "chat-1", fileName: "chat.png", pageNumber: 1,
    layer2: [
      token("สมชาย ใจดีเพิ่ม", "partial", 1, 2),
      token("ข้อความ นาย สมชาย ใจดี", "embedded-slip", 20, 200),
    ],
    excludedRegions: [{ sourceItemId: "chat-1", bounds: { x: 10, y: 190, width: 300, height: 80 } }],
  }], [{ cleanName: "สมชาย ใจดี" }]);

  assert.deepEqual(result, []);
});

test("distinguishes missing Layer 2 OCR from OCR groups without a supported name", () => {
  const noChatPages = getChatEntityDiscoveryDiagnostics([]);
  const noOcr = getChatEntityDiscoveryDiagnostics([{
    sourceItemId: "chat-1", pageNumber: 1, layer2: [],
  }]);
  const unmatchedOcr = getChatEntityDiscoveryDiagnostics([{
    sourceItemId: "chat-1", pageNumber: 1,
    layer2: [token("คุยกันพรุ่งนี้", "message", 10, 20)],
  }]);

  assert.deepEqual(noChatPages, {
    chatPageCount: 0,
    layer2UnitCount: 0,
    textGroupCount: 0,
    excludedSlipGroupCount: 0,
    groupsWithNameCandidate: 0,
    groupsWithoutNameCandidate: 0,
  });
  assert.deepEqual(noOcr, {
    chatPageCount: 1,
    layer2UnitCount: 0,
    textGroupCount: 0,
    excludedSlipGroupCount: 0,
    groupsWithNameCandidate: 0,
    groupsWithoutNameCandidate: 0,
  });
  assert.deepEqual(unmatchedOcr, {
    chatPageCount: 1,
    layer2UnitCount: 1,
    textGroupCount: 1,
    excludedSlipGroupCount: 0,
    groupsWithNameCandidate: 0,
    groupsWithoutNameCandidate: 1,
  });
});

test("counts name candidates and groups excluded as embedded-slip OCR", () => {
  const result = getChatEntityDiscoveryDiagnostics([{
    sourceItemId: "chat-1", pageNumber: 1,
    layer2: [
      token("นาย สมชาย ใจดี", "name", 10, 20),
      token("นาง สมใจ ใจดี", "slip", 10, 200),
    ],
    excludedRegions: [{ sourceItemId: "chat-1", bounds: { x: 0, y: 180, width: 400, height: 100 } }],
  }]);

  assert.deepEqual(result, {
    chatPageCount: 1,
    layer2UnitCount: 2,
    textGroupCount: 1,
    excludedSlipGroupCount: 1,
    groupsWithNameCandidate: 1,
    groupsWithoutNameCandidate: 0,
  });
});

test("does not count regions without a matching source item id as embedded-slip exclusions", () => {
  const result = getChatEntityDiscoveryDiagnostics([{
    sourceItemId: "chat-1", pageNumber: 1,
    layer2: [token("นาย สมชาย ใจดี", "name", 10, 200)],
    excludedRegions: [{ bounds: { x: 0, y: 180, width: 400, height: 100 } }],
  }]);

  assert.equal(result.excludedSlipGroupCount, 0);
  assert.equal(result.groupsWithNameCandidate, 1);
});
