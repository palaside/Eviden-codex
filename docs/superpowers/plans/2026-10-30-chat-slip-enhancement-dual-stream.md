# Chat Slip Enhancement Dual-Stream Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม research pipeline ที่สร้างและเปรียบเทียบ Stream A ภาพเต็มใบกับ Stream B crop สลิป โดยรักษาต้นฉบับ, hash, provenance และแสดงผลบน Canvas แบบ review-only

**Architecture:** ใช้ utility ฝั่ง client ที่มีอยู่สำหรับ enhancement pixels และ adapter Upscayl ฝั่ง serverเมื่อ binary พร้อม สร้าง manifest/artifact records เป็นสัญญากลาง จากนั้นให้ page state ถือ source/derived แยกกันและให้ E2E ตรวจ detection ของ `chatv3 (15).jpg` ว่าพบสลิป 2 จุดโดยไม่รวมผล extraction เป็นเกณฑ์เดียวกัน

**Tech Stack:** Next.js 16.3.6, React 19, TypeScript, existing `enhance-for-ocr.mjs`, existing `upscayl-enhancement.mjs`, existing local slip detection, Node test runner, Playwright E2E

## Global Constraints

- ห้ามเขียนทับ source หรือให้ derived image แทน source
- ทุก artifact ต้องเก็บ source SHA-256 และ derived SHA-256
- Stream A และ Stream B ต้องมีผลและ provenance แยกกัน
- `chatv3 (15).jpg` expected slip count คือ 2; `detected_count === 2` จึงผ่านเฉพาะ Detection
- ผล detection/enhancement/extraction เป็น `review_only` และห้ามยืนยันธุรกรรมอัตโนมัติ
- ห้ามเพิ่ม dependency ในแผนนี้
- ถ้า Upscayl binary ไม่พร้อม ให้รายงาน `unavailable` และให้ flow หลักทำงานต่อ
- Extraction benchmark เป็นเฟสถัดไป ไม่ใช้เป็นเงื่อนไข Detection ผ่าน
- ห้ามลบหรือเขียนทับข้อมูลใน `For Test Results`; สร้าง report directory ใหม่ต่อ run

---

### Task 1: Dual-stream artifact manifest contract

**Files:**
- Create: `src/utils/dual-stream-enhancement.mjs`
- Create: `src/utils/dual-stream-enhancement.test.mjs`
- Modify: `src/types/slip-ocr-trace.ts` only if existing trace types need the new optional artifact fields

**Interfaces:**
- `createResearchRunManifest({ sourceFileName, sourceSha256, sourceDimensions, expectedSlipCount = 2 }) -> ResearchRunManifest`
- `createArtifactRecord({ sourceFileName, sourceSha256, artifactPath, artifactSha256, stream, artifactType, parentArtifact, bbox, dimensions, transform, reviewOnly = true }) -> ArtifactRecord`
- `evaluateDetectionGate({ expectedSlipCount, detectedCount }) -> { pass: boolean, expectedSlipCount: number, detectedCount: number, status: "pass" | "fail" }`
- `buildVariantPlan() -> { streamA: VariantSpec[], streamB: VariantSpec[] }`

**Data types:**

```js
// ResearchRunManifest
{
  source: { fileName, sha256, dimensions },
  expectedSlipCount: 2,
  streamA: { artifacts: [], detections: [] },
  streamB: { detections: [], slips: [] },
  detectionResult: { expectedSlipCount: 2, detectedCount: 0, pass: false, status: "fail" },
  enhancementResult: { status: "not_started" },
  extractionResult: { status: "not_started" },
  reviewOnly: true
}
```

- [ ] **Step 1: Write failing tests** for the exact expected variant list, artifact provenance, source/derived separation, detection count gate, and review-only default.
- [ ] **Step 2: Run the focused test**

Run: `node --test src/utils/dual-stream-enhancement.test.mjs`

Expected: FAIL because the contract module is not present.

- [ ] **Step 3: Implement the pure contract utilities** without filesystem or UI side effects.
- [ ] **Step 4: Run the focused test and the existing trace tests**

Run: `node --test src/utils/dual-stream-enhancement.test.mjs src/utils/slip-ocr-trace.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit the contract only**

```text
git add src/utils/dual-stream-enhancement.mjs src/utils/dual-stream-enhancement.test.mjs src/types/slip-ocr-trace.ts
git commit -m "feat: add dual-stream enhancement manifest contract"
```

### Task 2: Stream A full-image artifact generation

**Files:**
- Create: `src/utils/dual-stream-full-image.mjs`
- Create: `src/utils/dual-stream-full-image.test.mjs`
- Reuse: `src/utils/enhance-for-ocr.mjs`
- Reuse: `src/utils/evidence-image-artifacts.mjs`
- Reuse: `src/utils/upscayl-enhancement.mjs` for optional server-derived artifacts

**Interfaces:**
- `createFullImageVariants({ source, sourceSha256, width, height, pixelBuffer, artifactWriter }) -> Promise<{ artifacts: ArtifactRecord[], status: "success" | "partial" }>`
- `createFullImageVariants` must create the deterministic variants `original-reference`, `upscale-2x`, `upscale-4x`, `brightness-gamma`, `clahe`, `denoise`, `sharpen`, `grayscale`, and `adaptive-threshold`.
- `artifactWriter({ bytes, artifactName, metadata }) -> Promise<ArtifactRecord>` is injected so tests can use an in-memory writer and production can use the existing artifact storage boundary.

- [ ] **Step 1: Write failing tests** that assert all nine variant names, preserved source hash, non-empty derived bytes, distinct metadata, and no source mutation.
- [ ] **Step 2: Run the focused test**

Run: `node --test src/utils/dual-stream-full-image.test.mjs`

Expected: FAIL because the generator is not present.

- [ ] **Step 3: Implement the generator** by routing pixel transforms through the existing `enhanceOcrPixels` stages and keeping `original-reference` byte-for-byte separate from derived variants. Do not call OCR, QR, Gemini, or mutate the input buffer.
- [ ] **Step 4: Run focused tests and existing enhancement tests**

Run: `node --test src/utils/dual-stream-full-image.test.mjs src/utils/__tests__/enhance-for-ocr.test.mjs src/utils/upscayl-enhancement.test.mjs`

Expected: all tests PASS; Upscayl tests may report `unavailable` only for runtime binary checks.

- [ ] **Step 5: Commit Stream A**

```text
git add src/utils/dual-stream-full-image.mjs src/utils/dual-stream-full-image.test.mjs
git commit -m "feat: generate full-image enhancement variants"
```

### Task 3: Stream B detection and crop artifact generation

**Files:**
- Create: `src/utils/dual-stream-slip-crops.mjs`
- Create: `src/utils/dual-stream-slip-crops.test.mjs`
- Reuse: existing local slip detection function in `src/app/page.tsx` through a small adapter boundary; do not copy its implementation into the new utility
- Reuse: `src/utils/dual-stream-enhancement.mjs`

**Interfaces:**
- `normalizeDetections({ detections, imageWidth, imageHeight }) -> DetectionRecord[]`
- `createSlipCropArtifacts({ source, sourceSha256, detections, artifactWriter }) -> Promise<{ slips: SlipArtifactRecord[], status: "success" | "partial" | "failed" }>`
- Each `SlipArtifactRecord` must contain `index`, original-image `bbox`, `cropOriginal`, `cropVariants`, and `reviewOnly: true`.
- `evaluateDetectionGate({ expectedSlipCount: 2, detectedCount })` from Task 1 is the only count gate.

- [ ] **Step 1: Write failing tests** for two valid detections, out-of-bounds clipping, empty crop rejection, stable top-to-bottom ordering, and one/three detection gate outcomes.
- [ ] **Step 2: Run the focused test**

Run: `node --test src/utils/dual-stream-slip-crops.test.mjs`

Expected: FAIL because the crop utility is not present.

- [ ] **Step 3: Implement crop normalization and artifact creation**. Preserve coordinates in source-image space, clip only for safe array access, reject zero-area crops, and create per-slip variants without merging slips.
- [ ] **Step 4: Run focused tests and detection regression tests**

Run: `node --test src/utils/dual-stream-slip-crops.test.mjs src/utils/__tests__/evidence-detection-pipeline.test.mjs src/utils/qr-anchored-ocr-crop.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit Stream B**

```text
git add src/utils/dual-stream-slip-crops.mjs src/utils/dual-stream-slip-crops.test.mjs
git commit -m "feat: create provenance-safe slip crop artifacts"
```

### Task 4: Connect the dual-stream research run to the application state and Canvas

**Files:**
- Modify: `src/app/page.tsx` in the staged queue type, processing pipeline, selected canvas source, and review labels
- Modify: `src/utils/review-preview-source.mjs` only if it needs to resolve stream/variant selections
- Create: `src/utils/research-run-ui-state.test.mjs` for pure selection/label behavior

**Interfaces:**
- Queue items gain optional `researchRun?: ResearchRunManifest` and `selectedReviewArtifactId?: string`.
- Canvas source resolver must return `{ url, sourceKind, stream, variant, reviewOnly }` and must never replace `previewUrl` for the original.
- Existing `reviewPreviewUrl` remains compatible as the fallback selected derived URL.

- [ ] **Step 1: Write failing tests** for original selection, Stream A selection, Stream B slip-01 selection, label generation, and fallback when no derived artifact exists.
- [ ] **Step 2: Run the focused test**

Run: `node --test src/utils/research-run-ui-state.test.mjs src/utils/review-preview-source.test.mjs`

Expected: FAIL for the new selection behavior.

- [ ] **Step 3: Add state wiring** after source lock and detection. Store manifest/artifacts on the queue item, keep `processingFile` derived-only, and preserve the original `file`/`previewUrl`.
- [ ] **Step 4: Add Canvas controls and labels** for source, Stream A variants, detected overlay, Stream B slip crops and variants. The UI must show `review-only` and the source SHA for the selected artifact.
- [ ] **Step 5: Run typecheck and focused UI-state tests**

Run: `node --test src/utils/research-run-ui-state.test.mjs src/utils/review-preview-source.test.mjs`
Run: `npx tsc --noEmit --pretty false`

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit UI integration**

```text
git add src/app/page.tsx src/utils/review-preview-source.mjs src/utils/research-run-ui-state.test.mjs
git commit -m "feat: expose dual-stream artifacts on evidence canvas"
```

### Task 4A: Server bridge for automatic dual-stream generation

**Files:**
- Create: `src/app/api/research/dual-stream/route.ts`
- Create: `src/app/api/research/dual-stream/route.test.mjs`
- Modify: `src/utils/dual-stream-slip-crops.mjs` only if a server-safe adapter boundary is required
- Modify: `src/app/page.tsx` only at the existing upload/process integration point

**Interfaces:**
- `POST /api/research/dual-stream` accepts multipart `file` and returns `{ success, manifest, artifacts, reviewOnly }`.
- The route must calculate source SHA-256 on the server, create Stream A/Stream B artifacts via the approved writers, and return renderable embedded or same-origin artifact URLs.
- The client integration must call this route after source lock/detection, attach the returned manifest to the same queue item, retain original `file`/`previewUrl`, and keep `processingFile` derived-only.

**Constraints:**
- Do not import `node:crypto` or other server-only modules into the Client Component except through the API boundary.
- Enforce image type and upload-size limits already used by the app; do not add dependencies.
- Do not call OCR, QR, Gemini, or confirmation logic in this bridge task.
- On generator failure, return a review-safe structured error and preserve the source; never fabricate a manifest or detection pass.

- [ ] Write route contract tests for missing file, invalid type/size, source hash, successful manifest/artifact response, review-only response, and generator failure.
- [ ] Run `node --test src/app/api/research/dual-stream/route.test.mjs`; it must fail before implementation.
- [ ] Implement the Node runtime route using the existing Task 1–3 contracts and bounded temporary storage; clean only temporary copies after the response is prepared.
- [ ] Connect the existing upload/process handler to the route and attach the returned manifest without replacing the original preview.
- [ ] Run `node --test src/app/api/research/dual-stream/route.test.mjs src/utils/research-run-ui-state.test.mjs src/utils/review-preview-source.test.mjs` and `npx tsc --noEmit --pretty false`.
- [ ] Commit only the bridge/integration files once the task reviewer approves.

### Task 5: End-to-end detection proof for `chatv3 (15).jpg`

**Files:**
- Create: `scripts/e2e-dual-stream-detection.mjs`
- Create: `scripts/e2e-dual-stream-detection.test.mjs` only if a pure report assertion helper is extracted
- Output only: `For Test Results/dual-stream-detection-20261030/report.json` and screenshots/artifacts outside Git-tracked source

**Interfaces:**
- Runner accepts `--app-url` and `--fixture`.
- Default fixture: `For Test/แชทที่ 3/chatv3 (15).jpg`.
- Report must contain `expectedSlipCount`, `detectedSlipCount`, `detectionPass`, `streamA`, `streamB`, `sourceSha256`, artifact counts, `ui`, `errors`, and `reviewOnly`.

- [ ] **Step 1: Write the runner assertions** before implementation: upload fixture through the real UI, process through the app, verify source hash/artifact labels, verify two detections, and verify extraction remains `not_started` or review-only.
- [ ] **Step 2: Start an isolated source dev server and run the new runner**

Run in one PowerShell session: `npm run dev -- --port 38773`

Run in a second PowerShell session:

`node scripts/e2e-dual-stream-detection.mjs --app-url http://127.0.0.1:38773 --fixture "For Test/แชทที่ 3/chatv3 (15).jpg"`

Expected before integration: FAIL with a report identifying the missing UI/manifest signal, not a fabricated pass.

- [ ] **Step 3: Wire the runner to the real upload/process/canvas flow** using the existing Playwright patterns in `scripts/e2e-batch-local.mjs` and capture screenshot evidence after the Canvas shows Stream A/B artifacts.
- [ ] **Step 4: Run the real E2E again on port 38773**

Run: `node scripts/e2e-dual-stream-detection.mjs --app-url http://127.0.0.1:38773 --fixture "For Test/แชทที่ 3/chatv3 (15).jpg"`

Expected: `detectionPass: true`, `expectedSlipCount: 2`, `detectedSlipCount: 2`, source hash present, source/derived labels visible, no page/console errors, and extraction not reported as confirmed.

- [ ] **Step 5: Run regression checks**

Run: `node --test src/utils/dual-stream-enhancement.test.mjs src/utils/dual-stream-full-image.test.mjs src/utils/dual-stream-slip-crops.test.mjs src/utils/research-run-ui-state.test.mjs src/utils/review-preview-source.test.mjs`
Run: `npx tsc --noEmit --pretty false`
Run: `git diff --check`

- [ ] **Step 6: Commit the E2E runner and report schema**

```text
git add scripts/e2e-dual-stream-detection.mjs
git commit -m "test: prove dual-stream slip detection end to end"
```

### Task 6: Final audit and handoff

**Files:**
- Modify: `scripts/enterprise-acceptance-audit.mjs` only to add a separate `dual_stream_detection_passed` field; do not change existing provider or extraction gates
- Create: `docs/superpowers/reports/2026-10-30-dual-stream-detection-report.md`

- [ ] **Step 1: Run the final audit** against the generated JSON report and confirm it distinguishes `detection_passed`, `enhancement_completed`, and `extraction_status`.
- [ ] **Step 2: Check source preservation** by hashing the fixture before and after the run and comparing the values.
- [ ] **Step 3: Review report for forbidden claims**: no `confirmed`, no “no error guaranteed”, and no extraction pass when extraction was not benchmarked.
- [ ] **Step 4: Record exact commands, app URL, fixture, report path, counts, errors and untested areas** in the handoff report.
- [ ] **Step 5: Run final status check**

Run: `git status --short; git diff --check`

Expected: only intended source/docs changes remain; generated evidence is excluded from Git.

- [ ] **Step 6: Commit the audit documentation**

```text
git add scripts/enterprise-acceptance-audit.mjs docs/superpowers/reports/2026-10-30-dual-stream-detection-report.md
git commit -m "docs: record dual-stream detection acceptance evidence"
```
