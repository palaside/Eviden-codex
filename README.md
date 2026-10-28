# Digital Evi - Codex

## Purpose

เว็บแอปสำหรับช่วยคัดกรองหลักฐานดิจิทัล โดยรักษาต้นฉบับและ provenance แล้วเชื่อมผล OCR/QR กับ candidate, review state และสัญญาณข้อความที่อาจเกี่ยวข้องทางกฎหมาย สัญญาณเหล่านี้เป็นเพียง leads สำหรับมนุษย์ตรวจทาน ไม่ใช่การตัดสินว่าบุคคลใดผิดหรือไม่ผิด

## Source Of Truth

ให้รันและพัฒนาจาก repository root นี้เท่านั้น:

`D:\Project\Digital Evi - Codex`

โฟลเดอร์ `digital-evidence/` เป็น checkout เดิม/ทางเลือก และไม่ใช่ runtime หลัก เว้นแต่ task จะระบุเป็นอย่างอื่น ดูรายละเอียดใน [SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md)

## Stack

- Next.js `16.3.6`, React `19.2.8`, TypeScript `5.x`
- Client-side evidence workspace ใน `src/app/page.tsx`
- OCR/QR utilities และ evidence pipeline ใน `src/utils/`
- API routes ใน `src/app/api/`
- RAW legal reference snapshot ใน `src/data/raw_thai_law_master_reference.json`
- FourCorners T-LEX ผ่าน server route `/api/legal/tlex`
- Scripts: `npm run dev`, `npm run build`, `npm run start`, `npm run lint`

## Main Flow

```text
source image/PDF -> upload/staging -> OCR/QR/candidate processing
-> page, bbox, confidence, hash and provenance
-> deterministic legal signal -> human review
-> optional FourCorners legal research with citations
```

## Resume Development

1. เปิด PowerShell ที่ `D:\Project\Digital Evi - Codex`
2. ตรวจ `SOURCE_OF_TRUTH.md` และ `PROJECT_STATUS.md`
3. รัน `npm install` เฉพาะเมื่อ dependency ไม่พร้อม
4. รัน `npm run dev -- --port 3450`
5. ตรวจ flow จริงผ่าน `http://127.0.0.1:3450/`
6. อ่าน `PROJECT_FLOW.md` สำหรับ data flow และข้อจำกัดด้าน human review

## Verification Snapshot

- `npx tsc --noEmit`: ผ่านในรอบล่าสุด
- Targeted ESLint: ผ่านโดยมี warnings เดิม 8 รายการ
- Matcher/evidence diagnostic tests: ผ่านรวม 5 tests
- Browser flow: พบ OCR legal signal จากหลักฐานจริงและเปิดกลับไปหน้าหลักฐานได้
- FourCorners: เคยตอบพร้อม citation แต่รอบล่าสุดติด quota ภายนอก จึงไม่ควรเหมารวมว่าพร้อมตลอดเวลา
- RAW legal reference: ถูกนำเข้ามาเป็นอีก source ของ review-only matcher พร้อม provenance/version

สถานะเต็มอยู่ใน [PROJECT_STATUS.md](PROJECT_STATUS.md)
