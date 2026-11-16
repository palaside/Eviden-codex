# OCR Adapter — Step 1

วันที่: 16 พฤศจิกายน 2026

## ขอบเขตที่ทำ

เพิ่มขอบเขต adapter ระหว่าง workspace กับเอนจิน OCR โดยยังคง Tesseract เดิมเป็น default และไม่แก้ implementation ของเอนจิน UI markup, Legal Signal, Export, session persistence หรือ IndexedDB schema

```text
Workspace → OCR Adapter → Tesseract เดิม
                          ↓
                 candidate / raw OCR / trace / cached layers
                          ↓
                 UI / Legal Signal / persistence เดิม
```

## Interface และไฟล์

- [ocr-adapter.ts](src/utils/ocr-adapter.ts): `OcrAdapter` และ binding ของ Tesseract; หน้า workspace เปลี่ยนเฉพาะ import
- [ocr-adapter-core.mjs](src/utils/ocr-adapter-core.mjs): pass-through factory และ pending provider skeleton
- [ocr-adapter-core.test.mjs](src/utils/ocr-adapter-core.test.mjs): ตรวจ arguments, callback, Promise/result identity, cache, errors และ inactive providers

| Method | Contract ที่รักษา |
|---|---|
| `extractSlipCandidates` | ใช้ argument/result type เดิมของ `extractSlipCandidatesWithLocalOcr`; ไม่ map หรือ normalize ผล |
| `readChatPreflight` | ส่ง file และ worker slot เดิมไปอ่านก่อนประมวลผล |
| `getCachedChatEvidenceLayers` | synchronous read จาก cache เดิม ใช้ canvas identity เดิม |

Compatibility exports รักษาชื่อที่หน้า workspace ใช้อยู่ จึงไม่ต้องแก้ call sites, callbacks หรือ output/persistence shape

## ช่องเสียบสำหรับขั้นต่อไป

`pendingOcrAdapters` มี slot `gemini-3.1-pro` และ `openthai-2.0` ตามชื่อที่ผู้ใช้ขอ ชื่อเหล่านี้เป็น integration labels ยังไม่ใช่การตรวจยืนยันชื่อโมเดล/endpoint/provider จริง และไม่ตีความ OpenThai ว่าเป็น OpenTyphoon โดยอัตโนมัติ

Skeleton แจ้ง error code `OCR_ADAPTER_NOT_CONFIGURED` เมื่อถูกเรียก ไม่อ่านภาพ ไม่เรียกเครือข่าย ไม่คืน empty success และไม่ถูกเลือกแทน Tesseract โดยอัตโนมัติ

ก่อนเชื่อม provider จริง ต้องยืนยันโมเดล/endpoint, capability, สิทธิ์ส่งภาพ, response mapping, raw OCR, พิกัด confidence trace และกลไก cache ให้ครบตาม interface โดยไม่เปลี่ยน schema ที่บันทึกอยู่เอง

## หลักฐานรอบนี้

- [รายงานตรวจ](For%20Test%20Results/ocr-adapter-step1-20261116/report.json)
- [UI หลัง reload](For%20Test%20Results/ocr-adapter-step1-20261116/ui-after-reload.png)
- [Legal Signal UI](For%20Test%20Results/ocr-adapter-step1-20261116/legal-signal-ui.png)
- Trace ก่อน/หลัง reload และ baseline อยู่ในโฟลเดอร์เดียวกัน มีข้อมูลอ่อนไหว ควรอ่านเฉพาะ fields ที่ต้องใช้

ทดสอบผ่าน browser จริงบน staging `http://127.0.0.1:3461/` แยก origin จาก 3450 ไม่ promote/restart service และไม่แตะคิว production

การผ่าน flow นี้ไม่ใช่การรับรอง OCR exact ทุก field หรือความถูกต้องของการตีความกฎหมายทุกกรณี ดูข้อจำกัดใน report โดยเฉพาะความต่างของชื่อผู้โอนหน้า 3 เมื่อเทียบ trace ย้อนหลัง
