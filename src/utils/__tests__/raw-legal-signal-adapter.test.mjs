import test from "node:test";
import assert from "node:assert/strict";
import { buildRawLegalRules } from "../raw-legal-signal-adapter.mjs";

test("maps RAW triggers into review-only rules with source provenance", () => {
  const rules = buildRawLegalRules({
    system_metadata: { version: "1.1.0", last_updated: "2026-09-27" },
    statutory_provisions: [{
      id: "TH_PENAL_341",
      law_code: "ประมวลกฎหมายอาญา",
      section: "มาตรา 341",
      title: "ฉ้อโกง",
      triggers: { keywords: ["การันตีผลกำไร"], regex: "การันตี.*กำไร" },
    }],
  });

  assert.equal(rules.length, 2);
  assert.equal(rules[0].phrase, "การันตีผลกำไร");
  assert.equal(rules[0].sourceKind, "raw_thai_law_master_reference");
  assert.equal(rules[0].sourceStatus, "current_unverified");
  assert.equal(rules[0].reviewStatus, "human_review_required");
  assert.equal(rules[0].legalDecision, false);
  assert.equal(rules[1].matchType, "regex");
});

test("maps newer RAW exact signals and preserves unresolved status", () => {
  const rules = buildRawLegalRules({
    system_metadata: { version: "1.1.0", last_updated: "2026-09-27" },
    statutory_provisions: [{
      provision_id: "TH_CCC_406",
      law_code: "ประมวลกฎหมายแพ่งและพาณิชย์",
      source: "https://example.test/law.pdf",
      coverage_status: "source_text_compared",
      paragraphs: [{ exact_signals: ["ลาภมิควรได้"], locator: "วรรคหนึ่ง" }],
    }],
  });

  assert.equal(rules[0].phrase, "ลาภมิควรได้");
  assert.equal(rules[0].sourceUrl, "https://example.test/law.pdf");
  assert.equal(rules[0].sourceStatus, "source_text_compared");
  assert.equal(rules[0].locator, "วรรคหนึ่ง");
});
