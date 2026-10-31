# Upscayl Evidence Enhancement Implementation Plan

> **For agentic workers:** Implement this plan inline in the current source-of-truth checkout. Keep the workflow end-to-end and do not replace review-only data with confirmed data.

**Goal:** เพิ่ม adapter สำหรับ Upscayl/`upscayl-ncnn` ที่สร้างภาพอนุพันธ์อย่างปลอดภัยและส่งต่อให้ OCR/QR retry พร้อม provenance ครบถ้วน

**Architecture:** Server-side adapter เรียก executable แบบ bounded subprocess และคืน metadata/hash; browser pipeline ใช้ผลเป็น retry candidate เท่านั้น. ถ้า binary ไม่พร้อม flow หลักต้องทำงานต่อด้วยสถานะ `unavailable`.

**Tech Stack:** Next.js/TypeScript, Node `child_process`, SHA-256, existing OCR/QR retry flow, Node test runner.

## Global Constraints

- ห้ามเขียนทับ source หรือให้ derived image แทน source
- ไม่เพิ่ม dependency ในรอบนี้
- ไม่ติดตั้ง Upscayl binary จนกว่าจะมีคำสั่งติดตั้งแยก
- ผล OCR/QR จาก enhancement เป็น review-only
- จำกัด scale, dimensions, timeout และ output directory

---

### Task 1: Upscayl adapter และ provenance contract

**Files:**
- Create: `src/utils/upscayl-enhancement.mjs`
- Create: `src/utils/upscayl-enhancement.test.mjs`
- Modify: `.gitignore`

**Interfaces:**
- `resolveUpscaylExecutable(env = process.env): string | null`
- `buildUpscaylCommand({ executable, inputPath, outputPath, scale, model }): string[]`
- `createUpscaledDerivedImage({ sourcePath, outputPath, sourceSha256, scale, model, env, execFile }): Promise<EnhancementResult>`
- `EnhancementResult` ต้องมี `status`, `sourceSha256`, `derivedSha256`, `engine`, `model`, `scale`, `sourceDimensions`, `derivedDimensions`, `outputPath`, `error`

- [ ] เขียน failing tests สำหรับ path จาก `UPSCAYL_NCNN_PATH`, command ที่ไม่มี shell interpolation, ปฏิเสธ scale นอก 2/4, source hash ไม่เปลี่ยน และ binary unavailable
- [ ] รัน `node --test src/utils/upscayl-enhancement.test.mjs` และยืนยันว่า fail เพราะ module ยังไม่มี
- [ ] เขียน adapter แบบใช้ `execFile` เท่านั้น, สร้าง output ใน directory ที่ caller ระบุ, คำนวณ SHA-256 ก่อน/หลัง และคืน `unavailable` เมื่อหา executable ไม่พบ
- [ ] รัน test เดิมจนผ่าน และยืนยันว่าไม่มีการเขียนทับ source

### Task 2: จุดเชื่อมกับ pipeline/UI แบบ review-only

**Files:**
- Create: `src/app/api/derived-image/upscayl/route.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/types/slip-ocr-trace.ts`
- Test: `src/app/api/derived-image/upscayl/route.test.mjs`

**Interfaces:**
- `POST /api/derived-image/upscayl` รับ multipart `file`, `scale`, `model` และคืน `{ success, status, metadata, reviewOnly }`
- metadata ต้องมี source/derived hash, dimensions, engine/model, scale และ provenance

- [ ] เขียน failing route contract test สำหรับ missing binary, success metadata และ `reviewOnly: true`
- [ ] รัน test ให้ fail ก่อนแก้ route
- [ ] เพิ่ม route ที่เขียน source เป็น temporary input แบบ read-only semantics, เรียก adapter และล้างเฉพาะ temporary copy เมื่อจบ
- [ ] เพิ่ม provenance label ใน candidate trace/UI ว่า `Upscayl derived OCR/QR retry`; ห้ามเพิ่มยอดยืนยันหรือแก้ `isConfirmed`
- [ ] รัน route contract test และ existing review-only tests ให้ผ่าน

### Task 3: End-to-end verification และ evidence report

**Files:**
- Create: `scripts/e2e-upscayl-enhancement.mjs`
- Modify: `scripts/enterprise-acceptance-audit.mjs`

- [ ] เพิ่ม E2E ที่ส่ง fixture จริง 1 chat และ 1 slip ไป route, ตรวจ source hash, response metadata, review-only และ UI/API state
- [ ] รันใน service `http://127.0.0.1:3450/`; ถ้า executable ไม่พร้อม ให้ report `blocked_external_binary` แทนการปลอมผล pass
- [ ] รัน regression: OCR policy, local matrix, export E2E และ acceptance audit
- [ ] บันทึกผลลง `For Test Results/enterprise-upscayl-e2e-3450/report.json` โดยไม่ commit ภาพ/ข้อมูลหลักฐาน
- [ ] ตรวจว่า audit แยก `upscayl_runtime_passed` ออกจาก `core_e2e_passed` และไม่รายงาน enterprise-ready จนกว่าจะมี binary/runtime evidence จริง

### Task 4: Commit

- [ ] ตรวจ `git diff --check`, test output และ `git status`
- [ ] commit เฉพาะ source/config ที่เกี่ยวข้อง ไม่รวม `.env`, cache, build และ evidence data

