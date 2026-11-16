# Gemini Field Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline execution. Single agent only; no delegation without new explicit authorization. Steps use checkboxes for tracking.

**Goal:** ผล OCR ที่มีหลักฐานผ่านถึง UI ได้ แม้ field หรือ page line อื่นผิด โดยคง review_required และไม่รวมยอดข้อมูลที่ไม่ผ่าน

**Architecture:** Transport รับผล JSON แยกจาก assessment ราย field. Mapper สร้าง canonical candidate เฉพาะค่าที่มีหลักฐาน ส่วนค่าที่ไม่ผ่านและ raw response อยู่ใน review trace. Adapter และปุ่ม Gemini ใช้ assessment เดียวกันโดยไม่วนกลับไปตรวจ whole-document แล้วทิ้งผลทั้งหมด

**Tech Stack:** Next.js 16.3.6, React 19, Node test runner, JavaScript ESM, TypeScript UI; ไม่เพิ่ม dependencies

## Global Constraints

- Spec: docs/superpowers/specs/2026-11-17-gemini-field-review-design.md
- ไม่แก้ Legal Signal dictionary, IndexedDB/LocalStorage schema, production 3450
- ไม่เดา/แก้ชื่อหรือเครื่องหมายปิดบัง ไม่สร้าง/clip พิกัดให้ดูผ่าน
- ไม่ลด review gate หรือรวมยอดอัตโนมัติ
- Preserve raw response และ source SHA-256; ไม่บันทึก key/request image ใน log
- การส่งภาพจริงต้องระบุไฟล์ ปลายทาง และจำนวนคำขอที่ได้รับอนุญาต; คำอนุญาตหนึ่งครั้งก่อนหน้านี้ใช้ไปแล้ว
- ใช้ checkout ปัจจุบัน ไม่ reset งานค้าง ไม่ stage ทั้ง repository
- อ่านคู่มือ Next ที่เกี่ยวข้องก่อนแก้ route/build; ทดสอบ data flow ก่อนอ้างผลสำเร็จ

## File Map

- Create src/utils/gemini-ocr-assessment.mjs: pure assessment/mapping, ไม่เรียก network/DOM/storage
- Create src/utils/gemini-ocr-assessment.test.mjs: isolation, bad coordinates, masks, conflicts, multiple slips
- Modify src/utils/gemini-ocr-contract.mjs: คง strict validator สำหรับ supported normalized document; reuse helpers แบบไม่เปลี่ยน provider อื่น
- Modify src/utils/gemini-ocr-api.server.mjs: transport -> assessment; ไม่ทิ้ง partial JSON ที่ parse ได้
- Modify src/utils/gemini-ocr-bridge-client.mjs: รับ assessment envelope; explicit Gemini compatibility bridge รักษาหลักฐาน
- Modify src/utils/gemini-ocr-adapter.mjs: map candidate และ cache lines จาก assessment
- Modify src/app/page.tsx: เฉพาะการส่งต่อ evidence/trace และ binding ข้อเสนอในพื้นที่ review เดิม
- Modify src/types ที่ประกาศ SlipOcrDiagnosticTrace เฉพาะเมื่อจำเป็น; ต้องค้น declaration ก่อนแก้ ไม่เพิ่ม persistence schema
- Test src/utils/gemini-ocr-adapter.test.mjs, gemini-ocr-bridge.test.mjs, gemini-client-key.test.mjs และ provider regression เดิม

## Task 1: Pure assessment และ data ownership

**Interface:** assessGeminiOcrDocument(rawDocument, {width,height,rawResponseText}) returns {format:'digital-evidence.gemini-review.v1',rawResponseText,sourceDimensions,pageLines,slips,issues,reviewStatus:'review_required'}.
slips แต่ละใบมี sourceIndex, candidate (canonical ที่ตรวจได้ หรือ null), proposals, fieldAssessments และ issues. fieldAssessment มี status supported/unverified/conflict/unavailable, sourcePath, bounds ที่ตรวจแล้วหรือ null และ reason codes. Unknown keys/invalid arrays ไม่ทำให้ mapper recurse แบบไร้ขอบเขต; ใช้เพดานเดิมเพื่อป้องกัน response ใหญ่

- [ ] สร้าง fixture ตัวแทนที่ระบุว่า synthetic จาก valid document เดิม; เพิ่ม pageLines[0].bounds.y=-1 และคง amount evidence ที่ถูกต้อง
- [ ] เขียน failing assertions ต่อไปนี้ก่อน implementation:

```js
const result = assessGeminiOcrDocument(raw, context);
assert.equal(result.slips[0].candidate.data.transaction.amount, 7200);
assert.ok(result.issues.some(issue => issue.path === '$.pageLines[0].bounds.y'));
assert.equal(result.reviewStatus, 'review_required');
assert.deepEqual(raw, originalBeforeAssessment);
```

- [ ] Run `node --test src/utils/gemini-ocr-assessment.test.mjs`; ต้อง fail ก่อนแก้
- [ ] Implement pure function: ตรวจ geometry/type แยกส่วน; metadata เป็นของแอปพร้อม decision trace; null เฉพาะ field ที่ไม่ได้รับรอง; raw/proposals ไม่ถูกแก้
- [ ] เพิ่ม assertions: พิกัด field ผิด -> canonical field null และ proposal ยังอยู่; masks ถูกลบ -> unverified; สลิปที่สองดีไม่หายเพราะใบแรกผิด; ไม่มีกรอบ -> candidate null ไม่แทนด้วยภาพทั้งใบ
- [ ] ตรวจ enum/number ข้อจำกัดเดิมและ supportedDate; confidence ของโมเดลไม่ใช้แทนหลักฐาน
- [ ] รัน test จนผ่าน และตรวจ diff ว่าไม่มีข้อมูลจริง hard-code

## Task 2: Server/Client assessment boundary

**Consumes:** assessGeminiOcrDocument จาก Task 1.
**Produces:** bridge response {ok:true,value:assessment} สำหรับ JSON ที่ประเมินได้ แม้มี partial issues; failure เดิมสำหรับ HTTP/parse/block/timeout

- [ ] เพิ่ม failing transport test: provider ส่ง JSON ที่มีหนึ่ง bad page line -> response ok พร้อม candidate/issue แทน GEMINI_SCHEMA_MISMATCH ทั้งชุด
- [ ] เพิ่ม failure tests: malformed JSON, quota 429, incomplete response ยังไม่เป็น success และไม่มี retry
- [ ] แก้ transport เรียก assessment หลัง JSON.parse; เก็บ raw response text ใน trace ไม่ console; คง error diagnostics ที่ไม่เผย secrets
- [ ] Client ตรวจ envelope/schema version/types ไม่เรียก strict whole-document กับ raw response; error transport ไม่กลืนเป็น partial success
- [ ] explicit bridge ส่ง assessment, sourceIndex, ocrTextBoxes และ candidate bounds ตรงเดิม; ไม่ทิ้งหลักฐานขณะสร้าง bbox_1000
- [ ] รัน `node --test src/utils/gemini-ocr-assessment.test.mjs src/utils/gemini-ocr-bridge.test.mjs src/utils/gemini-client-key.test.mjs src/utils/gemini-ocr-adapter.test.mjs`
- [ ] ทดสอบ response ไม่เผยคีย์ แม้ upstream error มีคีย์อยู่

## Task 3: Adapter, explicit button และ UI เดิม

**Consumes:** assessment envelope และ canonical candidate ของ Task 2.
**Produces:** LocalSlipCandidate[] และ diagnostic trace ที่ sourceIndex/occurrence ตรงกัน; UI แสดง supported/unverified แยกกัน

- [ ] ตรวจ callers ของ createGeminiOcrAdapter, fetchGeminiDetectionBridge, scanSelectedSlipWithAi, ledgerRecords, calculation gate, JSON trace exporter และ queue serializer แบบ targeted ก่อนแก้
- [ ] เพิ่ม failing adapter test ให้ valid amount survives invalid page line; trace มี rejected proposal และ sourceIndex; cropImage ไม่ถูกเรียกกับ invalid slip bounds
- [ ] แก้ adapter รับ candidates ที่ประเมินแล้ว, cache เฉพาะ valid positioned lines และเก็บ rejected lines ใน trace; ไม่ส่ง invalid geometry เข้า segmentation
- [ ] แก้ explicit button type/binding ให้ส่งต่อ ocrTextBoxes และ assessment จาก candidate เดียวกัน ไม่สร้าง evidence จาก visual_cues
- [ ] ใน UI เดิมแสดงค่ารอตรวจจาก proposals แยกข้อความ supported; raw_text ทั้งใบห้ามกลายเป็น field evidence และ template_region_only ห้ามเป็น region pass เอง
- [ ] ตรวจ calculation gate ด้วย candidate ที่มี proposal amount แต่ canonical amount null: ยอดต้องไม่เพิ่ม; supported amount ก็ห้าม auto-confirm
- [ ] ไม่แก้ IndexedDB schema; trace exporter ต้องรักษา rawResponseText/field issues ที่ผูกกับ source occurrence ถ้า serializer เดิมไม่รองรับ ให้ใช้ trace ที่อยู่ใน state เดิมและรายงาน reload limitation
- [ ] เพิ่ม regression สองสลิปยอด/ชื่อเหมือนกันแต่คนละ sourceIndex ไม่ถูก merge

## Task 4: Regression และ Staging

- [ ] Run `node --test src/utils/gemini-ocr-assessment.test.mjs src/utils/gemini-provider-schema.test.mjs src/utils/gemini-ocr-adapter.test.mjs src/utils/gemini-ocr-activation.test.mjs src/utils/gemini-ocr-bridge.test.mjs src/utils/gemini-client-key.test.mjs src/utils/ocr-output-mappers.test.mjs src/utils/ocr-provider-vault.test.mjs`
- [ ] รัน lint เฉพาะไฟล์ที่แก้ และ typecheck/build ตาม Next guide; แยก warning เดิมจาก failure ใหม่
- [ ] สร้าง build directory ใหม่ด้วย NEXT_DIST_DIR เฉพาะงานนี้; สำรอง generated references ก่อน build และคืนเฉพาะการเปลี่ยนอัตโนมัติของรอบนี้
- [ ] ตรวจ process command line และ listener 3461 ก่อน restart; ห้ามแตะ 3450; Start-Process แบบ Hidden; log แยกโฟลเดอร์
- [ ] ตรวจ HTTP 200, build ID และ missing-key API failure โดยไม่ใช้ภาพ/key จริงเพื่อ health probe
- [ ] เก็บ diff/test summary และ commit เฉพาะ source/tests/docs ที่เกี่ยวข้อง ไม่รวม key/ภาพ/log/raw OCR

## Task 5: Real E2E และหลักฐานปิดงาน

- [ ] ยืนยันสิทธิ์ส่ง chatv3 (59).jpg ไป Google Gemini ตามจำนวนที่ผู้ใช้อนุญาตใหม่ก่อนกด; ถ้ารับคำอนุญาตหนึ่งครั้ง ห้ามส่งซ้ำหรือกด workflow ที่สร้างหลาย request
- [ ] ใช้ Browser/Computer Use อ่านหน้าปัจจุบันก่อน action; ห้ามอ่าน/พิมพ์คีย์จริงลง tool output; ไม่ล้างคิวหรือ reload จนยืนยันว่าปลอดภัย/ได้รับอนุญาต
- [ ] ส่ง explicit Gemini request ครั้งเดียว ตรวจ HTTP/provider outcome -> assessment -> table/review UI -> download JSON trace
- [ ] ตรวจชื่อ/เครื่องหมายปิดบัง จำนวนเงิน ref วันที่เวลา ตามภาพจริง; ห้ามยกค่าจาก screenshot คาดหวังเป็น OCR result
- [ ] ค่าที่ supported ต้องอยู่ใน candidate เดียวกับ source SHA/occurrence; rejected coordinate ต้องยังมี issue; review_required ต้องอยู่และยอดยืนยันไม่เพิ่ม
- [ ] เก็บ screenshot ด้วยมุมมองที่ไม่เผย API Vault/password; ตรวจ rawResponseText และ mapping decisions ใน trace
- [ ] ตรวจ reload เฉพาะเมื่อได้รับอนุญาตหรือพิสูจน์ persistence ได้ก่อน; แยกข้อจำกัด proposal metadata จาก field ที่ persist ได้
- [ ] ถ้าคำขอหนึ่งครั้งไม่สำเร็จ ให้รายงาน exact blocker/issue ห้าม retry เกินอนุญาตหรืออ้าง E2E ผ่าน

## Self-review / Definition of Done

- Task 1 ครอบคลุม field isolation, masks, metadata และ no fabricated bounds
- Task 2 ครอบคลุม raw response, safe errors และ strict whole-document revalidation ที่เคยซ้ำ
- Task 3 ครอบคลุมสอง consumer และป้องกัน proposal ปนยอด; ต้องพิสูจน์ UI binding จริง
- Task 4 ครอบคลุม provider regression/build/runtime; ไม่มี dependency หรือ persistence migration
- Task 5 ครอบคลุม UI/JSON/raw OCR/review/reload และการส่งข้อมูลภายใต้คำอนุญาต
- แผนนี้ยังไม่ใช่หลักฐานการทำงานสำเร็จ; ช่องที่ยังไม่ทำต้องคงไม่ถูกติ๊ก

## Execution checkpoint — 2026-11-17

- [x] Task 1: failing assessment tests reproduced; pure field assessment implemented; metadata does not invalidate readable fields; invalid geometry is not clipped
- [x] Task 2: transport, bridge client and selected-provider validator accept the review envelope; both Gemini paths retain evidence
- [x] Task 3: adapter/UI retain raw proposals separately; valid data only reaches canonical fields; unreviewed stale values are not retained over fresh assessment; reviewed fields are preserved
- [x] Task 4: 77 regression tests passed, scoped lint passed, TypeScript/build passed, final Staging 3461 HTTP 200; production 3450 listener unchanged
- [x] Task 5: chatv3 (59).jpg sent once of maximum two authorized requests; UI proposals, table non-confirmation, JSON trace and reload persistence checked
- [ ] Live supported/cropped field evidence: NOT passed; provider slip bounds exceed source image, so no canonical candidate was certified for this request
- [ ] Live exact OCR accuracy: NOT certified; values remain unverified proposals, including the provider date representation
- [ ] Screenshot file in result directory: not recorded; screenshots were emitted inline in the Codex chat

Actual envelope uses `slips` for canonical candidates and `slipAssessments` for per-occurrence assessment, including occurrences whose candidate is null. `validateGeminiReviewOutput` recomputes assessment from rawResponseText at consumer boundaries rather than trusting transferred canonical fields. All issue details stay in trace; legacy warnings contain a bounded summary to avoid reintroducing whole-document failures when there are many rejected lines.

Evidence: For Test Results/gemini-field-review-20261117/{tests-final.log,lint-final.log,health-release.json,live-trace-1.json,live-trace-after-reload.json,live-report.json}.
