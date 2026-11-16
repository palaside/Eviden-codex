# Gemini field review — ผลตรวจ implementation

วันที่ 2026-11-17; branch codex/task-1-contract

## สิ่งที่แก้และตรวจแล้ว

แยก HTTP/JSON transport failure ออกจาก field assessment ผลที่ parse ได้ถูกเก็บเป็น rawResponseText และตรวจแต่ละ occurrence/field/line ไม่ทิ้งทั้งชุดเพราะ page line ผิด
Canonical data มีเฉพาะ field ที่ผ่าน strict semantic/positioned-text checks เดิม; proposals ที่ไม่ผ่านคงไว้ใน trace/UI และไม่ใช้คำนวณ
metadata ของแอปไม่พึ่ง provider enum; masks/abbreviations ไม่ autocorrect; invalid bounds ไม่ถูก clip/แทนด้วยกรอบทั้งภาพ
ปุ่ม Gemini เดิมส่งต่อ ocrTextBoxes และ trace แล้ว; adapter หลักใช้ assessment เดียวกันผ่าน selected-provider boundary
UI ใช้พื้นที่ review เดิม และแสดงราย field กลับจาก persisted trace หลัง reload โดยไม่เปลี่ยน IndexedDB schema หรือ Legal Signal

## หลักฐาน

- Failing tests ก่อน implementation: missing assessment module; ต่อมาพบ warnings overflow ใน regression และแก้โดยเก็บ issues ครบใน trace
- Tests สุดท้าย 77 ผ่าน, 0 ล้มเหลว
- Scoped lint ไม่มี error/warning; TypeScript และ production build ผ่าน
- Staging 3461 final build ID: dGcNn4S_Dsfkn91L1h7wp; HTTP 200
- Production 3450 listener ไม่เปลี่ยนก่อน/หลัง restart
- ภาพจริง chatv3 (59).jpg ผ่าน explicit Gemini button หนึ่งคำขอ จากสิทธิ์สูงสุดสองคำขอ ไม่ retry
- ผล UI แสดงข้อเสนอชื่อ/ธนาคาร/บัญชี/ยอดเงิน/เวลา/Ref/Memo; amount proposal 13,500
- หลัง reload rawResponseText และ issues ใน JSON trace ตรงกับก่อน reload; ข้อเสนอยังแสดงได้; Console ที่เครื่องมืออ่านได้ไม่มี error
- ตารางไม่เพิ่มรายการยืนยันหรือรวมยอดข้อเสนอที่ไม่มีกรอบผ่าน

## สิ่งที่ไม่ผ่านหรือยังไม่รับรอง

ภาพจริงกว้าง 828 สูง 3522; provider ส่ง slip bounds x=355, y=113, width=612, height=196 ทำให้ x+width=967 เกินขอบภาพ
จึงไม่มี canonical candidate ที่ผ่านจากคำขอนี้ และทุก field เป็น unverified proposal; region quality fail, exact recognition ไม่ได้รับรอง, review_required คงอยู่
ยังไม่ได้พิสูจน์ live field crop/coordinate correctness; valid supported-field flow พิสูจน์ด้วย deterministic synthetic integration เท่านั้น
ไม่ได้สั่ง workflow ประมวลผลหลักทั้งชุดกับ Google เพิ่ม เพราะอาจสร้างหลาย provider requests; เส้นทาง adapter หลักทดสอบผ่าน client/bridge/transport แบบจำลอง provider
ไม่ได้ยืนยันค่าทางการเงินหรือข้อมูลชื่อแทนผู้ใช้; ไม่มี auto confirmation
ภาพหน้าจอเก็บในแชทเป็น inline evidence ยังไม่มี local screenshot artifact
ยังไม่ push/merge; ไม่แก้ Windows production service configuration

รายงานและ raw trace ที่มีข้อมูลจริงอยู่เฉพาะ For Test Results/gemini-field-review-20261117 ไม่รวมใน source commit
