# Gemini OCR Adapter — Step 2

## ขอบเขต

เพิ่ม implementation และ mocked unit tests เท่านั้น ค่าเริ่มต้นยังเป็น local Tesseract ไม่แก้ UI, Legal Signal, IndexedDB, export หรือ service และไม่ส่งภาพไป provider ในงานนี้

## โครงสร้าง

- `src/utils/gemini-ocr-api.server.mjs`: server transport รับ Blob, ตรวจชนิด/ขนาดภาพ, ส่ง inlineData base64 ไป Google โดยเก็บ API key ใน header ฝั่ง server เท่านั้น มี timeout และไม่มี automatic retry
- `src/utils/gemini-ocr-contract.mjs`: exact-transcription system prompt, responseSchema และตรวจ JSON/พิกัด/หลักฐานข้อความของ field
- `src/utils/gemini-ocr-adapter.mjs`: แปลง response เป็น LocalSlipCandidate[] พร้อม crop, OCR boxes, diagnostic trace และ cached layers สำหรับผู้เรียกเดิม
- `src/utils/ocr-adapter.ts`: เปิด factory ให้ผู้เรียก inject transport ได้; ช่อง Gemini ที่ไม่มี transport ยังปฏิเสธการทำงาน

ชื่อ slot คือ `gemini-3.1-pro`; API model ID คือ `gemini-3.1-pro-preview` ตามเอกสาร Google ที่ตรวจในรอบนี้

## ตัวอย่างการเรียกฝั่ง server

```js
import {createGeminiImageTransport} from './src/utils/gemini-ocr-api.server.mjs';

// ตัวอย่างเท่านั้น: key ต้องอยู่ฝั่ง server ห้ามส่งเข้า browser
const transcribe = createGeminiImageTransport({apiKey: process.env.GEMINI_API_KEY});
const result = await transcribe(imageBlob, {width: 1000, height: 1500, consent: true});
if (!result.ok) {
  console.error(result.error.code, result.error.status);
}
```

ฝั่ง browser สร้าง `createGeminiOcrAdapter({transcribeImage: serverBridge, consent: true})` โดย bridge คืน union `{ok:true,value}` หรือ `{ok:false,error}` จาก server transport ห้าม import server transport เข้า client bundle งานนี้ยังไม่เพิ่ม API route หรือเปลี่ยนเส้นทางหลัก เพราะผู้ใช้กำหนดให้แก้เฉพาะ adapter

## สัญญาข้อมูล

Schema จาก provider มี envelope `slips` และ `pageLines` เพื่อบรรทุกพิกัด จากนั้น adapter คืน array ตามสัญญาเดิม:

- `candidate.data.bank`
- `candidate.data.transaction.amount`, `date`, `time`, `reference_no`
- `candidate.data.sender`, `receiver`
- `candidate.bounds`, `cropDataUrl`, `ocrTextBoxes`, `ocrDiagnosticTrace`

ไม่มีการเปลี่ยนเป็น flat field `datetime` หรือ `ref` ซึ่งไม่ใช่สัญญาปัจจุบัน ตรวจด้วย schema เดิมแต่คืนข้อมูลต้นทาง ไม่ใช้ผล parse ที่ trim ชื่อ และไม่แก้ชื่อให้ดูถูกต้อง ค่าไม่ชัดต้องเป็น null; raw text คงไว้ การแปลงวัน/จำนวนเงินเป็นค่ามาตรฐานต้องมีข้อความในกรอบรองรับ

ระดับ transport คืน error object ที่มี code/message/status/retryable/reviewStatus ส่วน adapter reject ด้วย GeminiOcrError เพื่อรักษาลายเซ็น Promise เดิม ไม่เปลี่ยน failure เป็น array ว่าง ทุก candidate เพิ่มคำเตือน review_required ไม่สร้างสถานะ human_reviewed

## การตรวจ

```powershell
node --test src/utils/gemini-ocr-adapter.test.mjs src/utils/ocr-adapter-core.test.mjs
npx tsc --noEmit --incremental false
```

ผลรอบนี้: 21 tests ผ่าน, TypeScript ผ่าน และ targeted ESLint ไม่มี error/warning หลักฐานใน `For Test Results/gemini-adapter-step2-20261116/`

ทดสอบด้วย mock fetch และ synthetic Blob ไม่ใช่ภาพที่ decode จริง ไม่ใช่ Gemini live/E2E ไม่ใช่หลักฐานความแม่นยำ OCR Prompt และ responseSchema ไม่รับรองว่าข้อความที่โมเดลอ่านตรงภาพ ต้องทดสอบภาพจริงหลังเชื่อม server bridge ในงานถัดไป
