# Gemini Client–Server Bridge — Step 3

## เส้นทางที่เชื่อม

ระบบอัปโหลด/ประมวลผลเดิม → compatibility exports ใน ocr-adapter.ts → Gemini adapter → fetchFromGeminiBridge → POST /api/ocr/gemini → server transport → Gemini → candidate รูปแบบเดิม

เปลี่ยนเฉพาะการเลือก adapter ไม่แก้ page.tsx, Legal Signal, IndexedDB หรือ export และยังมี localOcrAdapter ให้เรียกใช้โดยตรง แต่ compatibility exports ของหน้าเว็บใช้ Gemini แล้ว ไม่มี automatic fallback ไป local

## ไฟล์

- src/utils/gemini-ocr-bridge-client.mjs: fetchFromGeminiBridge(imageBlob, context?) ส่ง multipart image/width/height ถ้าไม่ส่งขนาดจะอ่านขนาดด้วย createImageBitmap
- src/utils/gemini-ocr-bridge.server.mjs: handler ตรวจ multipart และเรียก transport ใช้ GEMINI_API_KEY หรือ GOOGLE_API_KEY ฝั่ง server เท่านั้น ไม่บันทึกภาพหรือ raw OCR ลง log
- src/app/api/ocr/gemini/route.js: Next.js Node route
- src/utils/ocr-adapter.ts: เชื่อม transport เข้ากับจุดเรียกเดิมทั้ง extraction, preflight และ cache
- src/utils/gemini-ocr-bridge.test.mjs: ทดสอบ client → multipart handler → mock transport → client และข้อผิดพลาด

## การทดสอบรอบนี้

25 tests ผ่าน รวม adapter regression, client/server bridge จำลอง, quota 429, malformed upload, cross-origin และ network failure; TypeScript ผ่าน; targeted ESLint ผ่าน

ไม่มีการเรียก Gemini จริง ไม่ส่งภาพจริง และไม่ restart/promote production ดังนั้นเว็บที่รัน build เก่ายังไม่ใช้โค้ดนี้ การพิสูจน์ OCR/UI E2E ด้วยภาพจริงต้องรัน build ที่มี route ใหม่นี้และมี API key ที่ใช้งานได้ ไม่มีการรับรองผลอ่านภาพจาก mock tests

```powershell
node --test src/utils/gemini-ocr-bridge.test.mjs src/utils/gemini-ocr-adapter.test.mjs src/utils/ocr-adapter-core.test.mjs
```

เมื่อใช้ build ใหม่นี้ การกดประมวลผลและ preflight ที่เส้นทางเดิมเรียกจะส่งภาพไป Gemini จึงมีการใช้ quota/cost จริง Log มีเพียงสถานะการส่ง/รับและ HTTP status ไม่แสดงข้อมูลหลักฐานหรือ key
