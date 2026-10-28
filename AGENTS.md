# AGENTS — โปรเจกต์ของฉัน

Target: Codex
Response language: Thai

## Behavior
- Read only task-relevant context. Do not scan the whole repository by default. Make minimal, scoped changes.
- Choose only task-relevant skills and tools; a URL alone does not trigger a security audit.
- Filter oversized tool outputs; keep original evidence retrievable. Summarize old context without losing requirements, decisions, or unresolved issues.
- Separate done, checked, assumed, blocked, and untested. Never claim verification without evidence.
- Ask before changes to dependencies, auth, security, database, deploy, or destructive operations unless explicitly authorized for this task.
- Verify at relevant levels: static, logic/API, integration, and real user flow. State which levels were not tested.
- คำว่า “เทส” หมายถึงพิสูจน์ผลการใช้งานจริงตามเป้าหมายผู้ใช้ โดยรันเส้นทางที่เกี่ยวข้องตั้งแต่ input ผ่านการประมวลผลจนถึงผลลัพธ์ที่ผู้ใช้เห็นหรือนำไปใช้ได้ ไม่ใช่เพียง helper/unit test, typecheck หรือ build ผ่าน
- เมื่อมีข้อมูลจริงหรือชุดข้อมูลตัวแทนที่สมจริงและสภาพแวดล้อมพร้อม ให้ทดสอบกับข้อมูลนั้นและตรวจผลลัพธ์ปลายทางในแอป/API/ไฟล์ส่งออกตามงาน หากพบปัญหา ให้ไล่แก้ที่ต้นเหตุแล้วรันทวน flow และ regression ที่เกี่ยวข้องในงานรอบเดียว ไม่หยุดแค่บรรยายขั้นตอนหรือผลทดสอบย่อย
- หากไม่มีข้อมูลหรือสิทธิ์ที่จำเป็น ให้ค้นหา fixture/ชุดข้อมูลที่เกี่ยวข้องก่อน ระบุให้ชัดว่าทดสอบได้เพียง simulation หรือยังทดสอบจริงไม่ได้ พร้อมบอก blocker และสิ่งที่ต้องใช้เพื่อไปต่อ ห้ามเรียกผล simulation/helper test ว่าผ่านการใช้งานจริง
- รายงานว่า “ผ่าน” ได้เมื่อมีหลักฐานว่าผลลัพธ์ตรงตามเป้าหมายผู้ใช้ ระบุ input และเส้นทางที่ทดสอบให้ตรวจสอบได้ และแยกผลจริงออกจาก unit/helper/synthetic tests
- ทุกคำสั่งให้ทำงานแบบ End-to-End Workflow เป็นค่าเริ่มต้น: รับภารกิจจากจุดเริ่มต้นของผู้ใช้ ไล่และดำเนินการผ่านทุกชั้นที่เกี่ยวข้อง จนถึงผลลัพธ์สุดท้ายที่ผู้ใช้ต้องการและตรวจเห็นได้ในระบบเดียวกัน ห้ามหยุดรายงานกลางทางเพียงเพราะเขียนโค้ด รัน helper/unit test หรือ build ผ่าน
- ก่อนเริ่ม ให้สรุปเป้าหมายปลายทางและเกณฑ์สำเร็จจากคำสั่งเดิม แล้วทำขั้นตอนที่จำเป็นต่อเนื่องในงานรอบเดียว รวมการตรวจข้อมูลต้นทาง การแก้สาเหตุ การทดสอบ regression และการยืนยันผลใน UI/API/ไฟล์ส่งออกตามภารกิจ โดยไม่ซอยเป็นคำถามหรือขออนุมัติซ้ำเมื่อขอบเขตชัดและได้รับอนุญาตแล้ว
- ถามหรือหยุดเฉพาะเมื่อจำเป็นจริง: ข้อมูลที่ขาดทำให้ตัดสินผลลัพธ์ไม่ได้, คำสั่งกำกวมจนเลือกผลปลายทางแทนผู้ใช้, ต้องผ่าน approval gate ตามข้อกำหนด, หรือมี blocker ภายนอกที่เอเจนต์แก้เองไม่ได้ ระหว่างนั้นให้ทำงานส่วนอื่นที่ไม่ถูกบล็อกต่อ และรายงานสิ่งที่ต้องการจากผู้ใช้แบบเจาะจงครั้งเดียว
- “End-to-End ผ่าน” หมายถึงเริ่มจาก input/การกระทำจริงหรือ fixture ที่แทนงานจริงได้ แล้วตรวจยืนยันผลลัพธ์สุดท้ายที่ผู้ใช้ใช้หรือตรวจได้ พร้อมตรวจว่าไม่มี regression ที่เกี่ยวข้อง หากทำได้เพียง simulation หรือทดสอบบางชั้น ต้องเรียกสถานะตามจริง ห้ามเหมารวมว่า workflow ทั้งหมดผ่าน
- รายงานปิดงานครั้งเดียวโดยตอบตรงว่าเป้าหมายผ่านหรือไม่ ผ่านส่วนใดจากหลักฐานอะไร และส่วนใดยังติด/ไม่ได้ทดสอบ หลีกเลี่ยงการขอให้ผู้ใช้ประกอบขั้นตอนที่เอเจนต์ทำต่อเองได้
- Preprocess large tool outputs with task-relevant filtering/projection; keep full evidence retrievable outside context. Prefer code for deterministic validation. Keep compact task state while retaining requirements, unresolved issues and source references. Allow targeted detail lookups. Suggested per-task budgets: model steps 8, tool calls 12, output characters 6000, retries 2; extend for correctness/safety rather than prematurely claiming completion. These are guidance unless runtime enforces them. Measure real token usage and task success before claiming savings.

## Digital Evidence: Outcome-Driven Engineering
- เริ่มจากแปลงคำขอเป็นผลลัพธ์ปลายทางที่ผู้ใช้สังเกตหรือตรวจได้ พร้อม acceptance criteria ก่อนเลือกจุดแก้ เช่น “ตารางแสดงชื่อผู้โอนจาก OCR ของหลักฐานรายการเดียวกัน” ไม่ถือว่าการมีโค้ด ปุ่ม หรือ candidate เป็นผลสำเร็จในตัวเอง
- ไล่เส้นทางข้อมูลที่เกี่ยวข้องตามจริง: ไฟล์หลักฐาน → preprocessing/ภาพปรับปรุง → OCR/QR/detection → candidate และ state → การจับคู่/ledger → UI/A4 → PDF หรือ export ตามขอบเขตงาน ระบุจุดที่ข้อมูลผิดหรือหายก่อนแก้ และอย่าฟันธงโมดูลโดยไม่มีหลักฐาน
- ทุกการเปลี่ยนโค้ดต้องผูกกับ acceptance criterion ที่ยังไม่ผ่านโดยตรง เลือก patch ที่เล็กและแคบที่สุด หลีกเลี่ยง refactor หรือ abstraction ที่ไม่ทำให้ผลลัพธ์เป้าหมายเกิดขึ้น
- ข้อมูล OCR/QR ที่ไม่ชัดหรือจับคู่ไม่ได้ต้องคงสถานะรอตรวจทาน ห้ามเดา เติมข้อมูล หรือเปลี่ยนเป็นยืนยันแล้วเอง การแก้ไขจากผู้ใช้ต้องรักษาความเชื่อมโยงกับหลักฐานต้นทางและ occurrence ที่ถูกต้อง
- รักษาต้นฉบับหลักฐาน, SHA-256, provenance, พิกัด/หน้า และการแยกข้อมูล derived ออกจากต้นฉบับตามแบบของระบบ ห้ามให้ภาพที่ปรับปรุงแล้วแทนที่หลักฐานดิบหรือถูกอ้างเป็นต้นฉบับ
- นิยาม “เทส” จากผลที่ผู้ใช้ต้องการ: ตรวจ input จริงหรือ fixture ที่เป็นตัวแทน → ผลประมวลผล → state/API → UI หรือไฟล์ส่งออกที่ผู้ใช้ใช้จริงตามขอบเขต Unit test, typecheck และ build เป็นหลักฐานคนละระดับ และไม่ทดแทนการตรวจผลปลายทาง
- เมื่อการทดสอบพบว่า acceptance criterion ยังไม่ผ่าน ให้ตามรอย data flow หาเหตุ แก้ แล้วรันทดสอบ flow และ regression ที่เกี่ยวข้องซ้ำในรอบงานเดียว หากข้อมูลจริงหรือสภาพแวดล้อมไม่พร้อม ให้ระบุ blocker และระดับที่ทดสอบได้ ห้ามรายงานว่าผ่านการใช้งานจริง
- ปิดงานโดยรายงานเป้าหมาย, การเปลี่ยนแปลง, input/flow ที่ตรวจและผลจริง, acceptance criteria ที่ผ่าน, และสิ่งที่ยังไม่ผ่าน/ยังไม่ได้ทดสอบ แยกข้อเท็จจริง ข้ออนุมาน และสิ่งที่ยังไม่ทราบ และใช้คำว่า “ผ่าน/เสร็จ/ใช้งานได้” เฉพาะเมื่อมีหลักฐานตรงรองรับ

## Task procedure
1. Identify task, scope, risk, and minimum required context.
2. Read only relevant project files and load selected skills/tools when needed.
3. Do the task within approved scope; request more context when necessary for correctness.
4. Verify what was actually done; report results, evidence, gaps, and next step briefly.

## Token discipline
- Reduce redundant context and raw logs, not essential evidence.
- Cache stable prompt prefixes when available; do not confuse cached input with removed tokens.
- Track input, output, cached input, calls, cost and task success when usage data is available.
- Never sacrifice correctness or safety to save tokens.

## User requirements
ประหยัดโทเคนและ ซื่อสัตย์

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
