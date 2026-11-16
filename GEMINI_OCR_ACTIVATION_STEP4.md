# Step 4 — Real transport wiring

## สิ่งที่ตรวจพบ

Server Bridge เดิมใช้ createGeminiImageTransport ใน production อยู่แล้ว ไม่มี mock response ใน route จริง การ inject transport/fetch จำลองอยู่เฉพาะ tests จึงไม่เปลี่ยน transport ให้ซ้ำซ้อน

## การเปลี่ยนแปลง

- Client มี AbortController จำกัดเวลารอ bridge 100 วินาที ไม่ retry
- ตรวจ success JSON ก่อนส่งต่อให้ adapter หรือปุ่ม Gemini
- เพิ่ม subscription ข้อผิดพลาดเข้า setErrorMsg เดิมในหน้าเว็บ ไม่เปลี่ยน JSX/layout และไม่สร้าง toast component ใหม่
- ปุ่ม Gemini เดิมเรียก fetchGeminiDetectionBridge → fetchFromGeminiBridge → /api/ocr/gemini แทน /api/slips/extract; ไม่เรียก field_bundle รุ่นเก่าซ้ำในเส้นทางนี้
- Compatibility envelope รักษาข้อมูลสลิป/Memo และคำนวณ SHA-256 จากไฟล์ที่ส่งจริง พร้อมแปลงพิกัดกลับเป็น bbox_1000 ให้โค้ดแสดงผลเดิม
- ระบบประมวลผลหลักใช้ Gemini Adapter ที่เชื่อมไว้ใน Step 3 อยู่แล้ว ไม่มี automatic Tesseract fallback
- ไม่แก้ Legal Signal Dictionary, IndexedDB, LocalStorage หรือรูปแบบ export

## ผลตรวจ

30 tests ผ่าน รวมการทดสอบ default server handler ผ่าน transport จริงโดยจำลองเฉพาะ HTTP boundary เพื่อพิสูจน์ URL, Base64 และ key header; TypeScript ผ่าน; targeted ESLint ผ่าน

โหลด environment ด้วยตัว loader ของ Next พบ GEMINI_API_KEY แต่ค่าไม่ตรงรูปแบบ AIza ที่ตรวจในรอบนี้ ไม่พิมพ์ค่าคีย์ ไม่แก้ไฟล์ environment และไม่ได้ติดต่อ Google เพื่อรับรองคีย์ จึงยังไม่ทราบว่าคีย์ปัจจุบันเรียก API ได้จริงหรือไม่

ไม่มี live provider call, ไม่มีการส่งภาพจริง, ไม่มี Build/Restart/Promote ตามขอบเขตงานนี้ ผลจำลองไม่ใช่ OCR/UI E2E สลิปจริง และไม่ใช่การรับรองความแม่นยำ

## ก่อนทดสอบภาพจริง

ต้องใช้คีย์ Gemini API ที่ใช้งานได้ฝั่ง server และ build ที่รวมการเปลี่ยนแปลงนี้ ผลแต่ละ field ยังคงเป็นข้อเสนอรอมนุษย์ตรวจ ไม่ถือว่า exact เพราะ schema ผ่านเพียงอย่างเดียว
