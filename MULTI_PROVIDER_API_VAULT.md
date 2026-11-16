# Multi-provider Client API Vault

> อัปเดต Step 7: เพิ่ม native-output mappers และขยาย Memo แล้ว ดู `OCR_OUTPUT_MAPPING_STEP7.md` สำหรับพฤติกรรมล่าสุด ส่วนข้อความเรื่อง mapping ยังไม่รองรับด้านล่างเป็นสถานะก่อน Step 7

## พฤติกรรมล่าสุด

Dropdown มี 4 ตัวเลือกตามที่ผู้ใช้กำหนด ปุ่ม `🔑 จัดการ API Key` เปิด native dialog ที่ใช้ Dark Glass พร้อม 4 ส่วน:

| โมเดล | การตั้งค่า | Storage prefix |
|---|---|---|
| Gemini 3.1 Pro (Google) | API key | gemini_key |
| Typhoon 2 OCR (SCB 10X) | API key, Model ID, Endpoint URL | typhoon_ |
| OpenThai 2.0 (Text Layer) | API key, Provider, Model ID, Endpoint URL | openthai_text_ |
| OpenThai 2.0 (Markdown) | API key, Provider, Model ID, Endpoint URL | openthai_markdown_ |

Provider ของ OpenThai เลือก Hugging Face หรือ iApp Technology ได้ Text/Markdown เก็บคีย์อิสระ รองรับคีย์เดิม hf_key เป็น fallback เฉพาะเมื่อยังไม่เคยบันทึกค่าใหม่ Gemini รองรับ digital_evi_gemini_api_key เดิมและย้ายเป็น gemini_key เมื่อบันทึก

แก้ค่าภายใน Modal ยังไม่เขียน storage จนกดบันทึก บันทึกสำเร็จแล้วปิด dialog และล้างสำเนาคีย์ใน state; ยกเลิกหรือ Escape ไม่บันทึก เมื่อเปิดใหม่จะอ่าน localStorage อีกครั้ง ไม่ส่งค่าเข้าระบบบันทึกคิว/IndexedDB

คีย์เก็บใน localStorage ของ origin ปัจจุบันเท่านั้น ไม่ใช่ encrypted vault ไม่เก็บฝั่ง server ไม่พิมพ์คีย์ใน log หรือ trace

## เส้นทาง Bridge

- Gemini: /api/ocr/gemini → Google header x-goog-api-key
- Typhoon: /api/ocr/typhoon → endpoint ที่ตั้งไว้, Bearer token, OpenAI-compatible image request และ Model ID ที่ตั้งไว้
- OpenThai Text: /api/ocr/openthai-text
- OpenThai Markdown: /api/ocr/openthai-markdown
- OpenThai/iApp: multipart file และ header apikey
- OpenThai/Hugging Face: binary image และ Bearer token ไป inference endpoint ที่ตั้งไว้ Endpoint ระบุ deployment/model อยู่แล้ว จึงไม่เอา Model ID ไปเดา URL ใหม่

Client ส่งเฉพาะคีย์ของโมเดลนั้นใน x-api-key และส่ง provider/endpoint/model เป็น metadata ใน multipart ไม่มี fallback ไป provider อื่น ไม่มี retry อัตโนมัติ Dropdown ถูกล็อกขณะประมวลผล ส่วนปุ่ม Gemini ที่ระบุชื่อชัดเจนยังเรียก Gemini โดยตรง

Server รับเฉพาะ HTTPS ของบริการที่เลือก: api.opentyphoon.ai, api.iapp.co.th, router.huggingface.co หรือ *.endpoints.huggingface.cloud ไม่ตาม redirect ไม่รับ credentials/query/fragment ใน URL และไม่ส่งคีย์ข้ามบริการ URL custom domain อื่นยังไม่รองรับ

## ข้อจำกัดที่ต้องแยกจากผล UI

ระบบแอปต้องการ normalized response `{slips, pageLines}` ซึ่งมี field และพิกัดตรวจย้อนกลับได้ Bridge ยังไม่แปลง native text/layout/Markdown ของ iApp/Hugging Face เป็น field สลิป หาก response ไม่ตรงสัญญา จะคืน OCR_OUTPUT_MAPPING_REQUIRED (422) และ review_required แทนการสร้าง field/พิกัดขึ้นเอง

ดังนั้นระบบตั้งค่าและ request routing ทดสอบแล้ว แต่ยังไม่ถือว่า OCR ของทั้ง 4 โมเดลผ่านภาพจริง การทำ native-response mapper และการทดสอบกับ endpoint/คีย์จริงเป็นงานต่างหาก ห้ามสรุปว่าอ่านสลิปได้ครบทุก provider

## หลักฐานรอบนี้

- 47 mocked unit/integration tests ผ่าน รวมการแยกคีย์/endpoint, storage rollback, URL guard, request format ของ iApp/HF/Typhoon และ Gemini regression
- TypeScript และ targeted ESLint ผ่าน
- Production preview build ผ่าน
- Browser จริงด้วย Chrome ใน context แยกและคีย์จำลอง: 4 options/4 sections, บันทึกแล้วปิด, เปิดใหม่/reload แล้วยังคงค่า, ยกเลิกไม่บันทึก, Escape ปิด, ไม่มี page error
- ไม่ส่งภาพไป provider และไม่ใช้คีย์จริง
- เปิด preview ชั่วคราวที่ 3462 แล้วปิด ไม่ restart/promote Staging 3461 หรือ Production 3450
- หลักฐาน: For Test Results/multi-provider-vault-20261116/

## แหล่งอ้างอิง API

- https://docs.opentyphoon.ai/en/ocr/ — endpoint ปัจจุบันที่เอกสารระบุคือ typhoon-ocr (ชื่อใน Dropdown ใช้ตามคำขอผู้ใช้ และ Model ID ปรับได้)
- https://iapp.co.th/en/docs/ocr/document — multipart และ header apikey, native text/layout
- https://iapp.co.th/en/docs/ocr/document-markdown — native markdown/pages/blocks
- https://huggingface.co/iapp/OpenThai2.0-OCR-Text
- https://huggingface.co/iapp/OpenThai2.0-OCR-Markdown

Model cards ของ OpenThai ทั้งสองระบุว่าไม่มี Inference Provider ที่ deploy อยู่ ณ การตรวจครั้งนี้ hf_ token อย่างเดียวจึงไม่ได้สร้าง endpoint ให้อัตโนมัติ
