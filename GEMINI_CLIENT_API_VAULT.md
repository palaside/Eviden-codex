# Gemini Client API Vault

## การใช้งานปัจจุบัน

ช่องรหัสผ่านขนาดเล็กชื่อ `🔑 Gemini` อยู่บนแถบเมนู Workspace ข้างเลขเรื่อง กรอกคีย์แล้วบันทึกเฉพาะ localStorage ของ origin ปัจจุบันทันที ไม่ใช้ระบบบันทึกคิว/IndexedDB หรือ server environment

- Storage key: `digital_evi_gemini_api_key`
- อ่านค่ากลับเมื่อเปิดหน้าใหม่; ลบข้อความในช่องเพื่อลบคีย์
- localStorage เป็นการเก็บในเบราว์เซอร์ ไม่ใช่ encrypted vault
- Browser อ่านคีย์ใหม่ทุก request และส่งเฉพาะ header `x-api-key` ของ `/api/ocr/gemini`
- Server ส่งต่อเป็น `x-goog-api-key` ไป Google ไม่บันทึกคีย์ในไฟล์/ฐานข้อมูล/log/JSON trace หรือ response
- ไม่ fallback ไป GEMINI_API_KEY/GOOGLE_API_KEY ใน environment อีกแล้ว
- ไม่มีคีย์: client หยุดก่อนส่งภาพ; server ปฏิเสธด้วย HTTP 401 และข้อความ `โปรดกรอก API Key ก่อนสกัดรายละเอียด`

เมื่อใช้พอร์ตหรือ browser profile ต่างกัน localStorage จะเป็นคนละชุด ต้องกรอกคีย์ในหน้า origin ที่ใช้งานจริง

## Exact transcription

System prompt ระบุห้ามเดา ห้ามแก้ชื่อ ห้ามลบดอกจัน และห้ามลบ/ขยายตัวย่อโดยตรง Schema/validation เดิมยังคงใช้และผลไม่ถูกยืนยันอัตโนมัติ Prompt ไม่ใช่หลักประกันความแม่นยำ ต้องตรวจผลจากภาพจริงต่อไป

## ผลตรวจรอบนี้

- 36 tests ผ่าน: mock storage → request header → server transport → Google request ที่จำลองเครือข่าย, missing key, errors/timeouts, preservation ของ masked names และ adapter regression
- TypeScript ผ่าน และ targeted ESLint ผ่าน
- ไม่แก้ Legal Signal Dictionary, export, IndexedDB หรือระบบ session persistence เดิม
- ไม่แก้/อ่านคีย์จริงในรอบนี้ ไม่ส่งภาพไป provider ไม่มี Build/Restart/Promote
- ยังไม่ทดสอบช่องกรอกคีย์ผ่าน browser จริงหรือ OCR/UI E2E หลัง build ข้อมูล log ใน `For Test Results/gemini-client-vault-20261116/`

เอกสารนี้เป็นพฤติกรรมล่าสุดเรื่องคีย์ แทนคำอธิบายการอ่าน server environment ใน Step 3/4
