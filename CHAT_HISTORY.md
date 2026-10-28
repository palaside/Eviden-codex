# Chat History Snapshot: Digital Evi - Codex

> This is a handoff snapshot of the available conversation context, not a complete archival export of every historical message. It preserves active decisions and the latest implementation state visible to the agent.

---

<div align="left">

**AI Agent**

กำหนด `D:\Project\Digital Evi - Codex` เป็น source of truth และแยก `digital-evidence/` เป็น legacy/alternate checkout เพื่อไม่ให้เว็บรันคนละโค้ดกับที่พัฒนา

</div>

<div align="right">

**User**

ต้องการเครื่องมือช่วยทนายคัดกรองหลักฐานจำนวนมาก ชี้ไปยังหน้าที่อาจมีข้อความหรือสัญญาณสำคัญ เช่น ขอยืมเงินหรือชวนลงทุน แต่ไม่ให้ระบบตัดสินว่าใครผิด และทุกผลต้องอยู่ในสถานะให้มนุษย์ตรวจ

</div>

<div align="left">

**AI Agent**

สรุปขอบเขตเป็น `source evidence -> OCR/QR trace -> deterministic legal signal -> human review` และกำหนด legal signal เป็น review lead เท่านั้น

</div>

<div align="right">

**User**

ขอให้ล็อก source of truth และเชื่อม legal signal scan กับผล OCR/UI ก่อน จากนั้นค่อยต่อ FourCorners MCP เป็นชั้นค้นคว้ากฎหมาย

</div>

<div align="left">

**AI Agent**

เพิ่ม `src/utils/legal-signal-matcher.mjs` เพื่อจับข้อความจาก dictionary แบบ deterministic และส่ง page, file, bbox, confidence, provision และสถานะ `human_review_required` ไปยัง UI โดยตั้ง `legalDecision: false`

</div>

<div align="left">

**AI Agent**

เพิ่ม `src/app/api/legal/tlex/route.ts` เป็น server-only adapter ไปยัง `https://app.fourcorners.law/api/mcp` ใช้ `FourCorner` จาก server environment และคืน answer/citations พร้อม retry/timeout/quota handling

</div>

<div align="right">

**User**

ผลไม่พบสัญญาณห้ามตีความว่าไม่มีความผิด ผลพบสัญญาณห้ามตีความว่ามีความผิด และต้องเปิดกลับไปดูภาพต้นฉบับได้

</div>

<div align="left">

**AI Agent**

UI แสดง OCR text, หน้า, bbox, confidence, dictionary version และปุ่มเปิดหลักฐานต้นฉบับ แยกปุ่มค้นกฎหมายออกจากการพบ signal พร้อมข้อความกำกับว่าต้องตรวจทานโดยมนุษย์

</div>

<div align="left">

**AI Agent**

ตรวจ static/integration ระดับที่ทำได้: `npx tsc --noEmit` ผ่าน, targeted ESLint ผ่านโดยมี warnings เดิม และ Node tests ของ matcher/evidence diagnostic ผ่านรวม 5 tests

</div>

<div align="left">

**AI Agent**

ทดสอบ browser flow ที่ `http://127.0.0.1:3450/` ด้วย `V1- (117).jpg`: 7 หน้า, OCR 30 objects/250 texts และพบ signal `กู้เงิน` ที่หน้า 2 พร้อม bbox/confidence จากนั้นเปิดกลับไปยังหลักฐานต้นฉบับได้

</div>

<div align="left">

**AI Agent**

FourCorners เคยตอบกลับพร้อม citation ในรอบที่ quota ยังเหลือ แต่รอบล่าสุด UI แสดงว่าใช้ครบ 3 คำถามฟรีแล้ว จึงต้องถือเป็น external quota limitation และไม่ควรอ้างว่าบริการพร้อมตลอดเวลา

</div>

<div align="right">

**User**

ขอ `commit/push`

</div>

<div align="left">

**AI Agent**

สร้าง commit `1331c3c` ชื่อ `feat: connect OCR legal signals to review flow` และ push ไป `origin/main` สำเร็จ โดย stage เฉพาะไฟล์งาน 8 ไฟล์ ไฟล์ untracked อื่นไม่ได้ถูกนำเข้า

</div>

---

## Durable Decisions

- Active root: `D:\Project\Digital Evi - Codex`
- Active branch: `main`
- Latest pushed commit: `1331c3c`
- Legal result semantics: review-only, no autonomous legal conclusion
- Unclear extraction: remain pending human review
- External legal research: optional, citation-bearing, quota/error-aware
