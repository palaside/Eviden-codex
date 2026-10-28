# Project Status: Digital Evi - Codex

Snapshot date: 2026-10-26  
Repository root: `D:\Project\Digital Evi - Codex`  
Active branch: `main`  
Latest saved commit: `1331c3c`

## Executive Status

ระบบมีเส้นทางหลักสำหรับรับหลักฐาน, ประมวลผล OCR/QR, แสดง candidate และสแกน legal signal แบบ review-only แล้ว แต่ยังไม่ควรเรียกว่าเครื่องมือกฎหมายที่ตัดสินผลได้เอง การพิสูจน์หลายธนาคาร/หลายรูปแบบไฟล์/หลายพันหน้า และความเสถียรของ FourCorners quota ยังเป็นงานต่อเนื่อง

## Observable Completed

- [x] Root ถูกกำหนดเป็น source of truth ใน `SOURCE_OF_TRUTH.md`
- [x] มี Next.js app และ scripts dev/build/start/lint ใน `package.json`
- [x] หน้าเว็บหลักอยู่ใน `src/app/page.tsx`
- [x] มี deterministic legal signal matcher ใน `src/utils/legal-signal-matcher.mjs`
- [x] นำ `RAW/thai_law_master_reference.json` เข้าเป็น `src/data/raw_thai_law_master_reference.json`
- [x] มี adapter รองรับ RAW schema เดิมและ schema ที่มี `paragraphs.exact_signals`
- [x] RAW hits เก็บ `sourceKind`, `sourceVersion`, `sourceStatus`, `sourceUrl` และยังเป็น review-only
- [x] matcher อ้างอิง `src/data/legal_signal_dictionary.json` และเก็บ provision/locator/source kind
- [x] ผล signal ถูกทำเครื่องหมาย `human_review_required` และ `legalDecision: false`
- [x] UI แสดง OCR text, หน้า, bounding box, confidence และปุ่มเปิดหลักฐานต้นฉบับ
- [x] UI แยกปุ่มค้นคว้ากฎหมายออกจากการพบ signal
- [x] FourCorners ถูกเรียกผ่าน server-only route `src/app/api/legal/tlex/route.ts`
- [x] route ไม่เปิดเผย API key ให้ browser และคืน citation/answer พร้อม review-only metadata เมื่อสำเร็จ
- [x] route จัดการ transient retry, timeout, quota และ error response เบื้องต้น
- [x] `allowedDevOrigins` รองรับ `localhost`/`127.0.0.1`
- [x] `tsconfig.json` จำกัด include หลักไว้ที่ `src`
- [x] มี matcher tests ใน `src/utils/__tests__/legal-signal-matcher.test.mjs`
- [x] commit ล่าสุดถูก push ไป `origin/main` ที่ `1331c3c`

## Verified Test Evidence

- [x] `npx tsc --noEmit` ผ่านในรอบล่าสุด
- [x] Targeted ESLint ผ่าน โดยยังมี warnings 8 รายการ
- [x] Node tests ของ matcher และ evidence diagnostic รวม 5 tests ผ่าน
- [x] Browser E2E ที่ `http://127.0.0.1:3450/` ด้วย `V1- (117).jpg`: 7 หน้า, OCR 30 objects/250 texts และพบ signal `กู้เงิน` ที่หน้า 2 พร้อม bbox/confidence
- [x] Browser UI เปิดกลับไปหน้าแชทต้นฉบับของ signal ได้
- [x] FourCorners เคยตอบกลับพร้อม citation ในรอบที่ quota ยังเหลือ
- [x] รอบถัดไปของ FourCorners ถูก upstream ปฏิเสธเพราะครบโควตาฟรี จึงเป็น external limitation
- [x] ทดสอบข้อความ RAW จริง `การันตีผลกำไร` และ `สลิปปลอม` แล้วได้ hit พร้อม provenance

## Pending / Unverified

- [ ] ทดสอบ dataset ขนาดใหญ่แบบ reproducible: chat-only, slip-only และ hybrid
- [ ] ยืนยันชื่อ/ธนาคาร/เวลา/ยอดเงินทุกธนาคารด้วย ground truth ที่ตรวจโดยมนุษย์
- [ ] ยืนยัน duplicate detection ทุกเส้นทาง รวม QR และ OCR candidate เดียวกัน
- [ ] ยืนยัน export PDF/SFX/XLSX หลัง legal signal integration
- [ ] กำหนด retention/audit policy สำหรับ request และ citation ของ FourCorners
- [ ] ทำ regression suite สำหรับ API/UI state หลัง reload และหลัง user review/edit
- [ ] ยืนยัน production deployment, authentication, access control และ secret management
- [ ] จัดลำดับ ESLint warnings หากต้องการ release gate ที่เข้มขึ้น
- [ ] ตรวจ license/usage limits ของ external legal service ก่อนใช้งานจริงเชิงพาณิชย์
- [ ] ทำ browser E2E upload/processing ใหม่หลังนำ RAW เข้าระบบ และตรวจ signal ใน modal จากหลักฐานจริง

## Safety Constraints

- ผลไม่พบ signal ไม่ได้แปลว่าไม่มีความผิดหรือไม่มีข้อเท็จจริงสำคัญ
- ผลพบ signal ไม่ได้แปลว่ามีความผิด
- OCR/QR ที่ไม่ชัดต้องเป็น `รอตรวจทาน` และเปิดกลับไปดูภาพต้นฉบับได้
- ห้ามให้ภาพ derived/enhanced แทนที่หลักฐานต้นฉบับ
- citation จาก FourCorners เป็นแหล่งค้นคว้าประกอบ ไม่ใช่คำวินิจฉัยแทนทนาย

## Suspicious / Orphaned Areas

พบใน root แต่ยังไม่ยืนยันว่าเป็น runtime หลัก จึงไม่ถูกลบ:

- `digital-evidence/`: checkout/legacy tree ตาม `SOURCE_OF_TRUTH.md`
- `.next/`, `.next-dev/`, `node_modules/`, `__pycache__/`, `.pytest_cache/`: generated/runtime artifacts
- `For Test/`, `For Test Results/`, `artifacts/`, `scratch/`, `_imports/`, `_workspaces/`: test/import/output areas
- `skills/`, `.agents/`: local instruction and skill material
- `models/`, `static/`, `RAW/`: assets/models requiring separate ownership verification

## Next Recommended Work

1. Add labeled E2E fixtures and expected fields for critical OCR/QR cases.
2. Persist per-image trace and review decision separately from OCR conflict.
3. Add API/UI tests for exact signal-to-source-page linkage.
4. Define controlled legal research quota/error contract and citation audit record.
