# Strict OCR Controls

เพิ่ม CRITICAL OCR CONSTRAINTS ใน shared prompt: NO AUTOCORRECT, PRESERVE RAW DATA, NO HALLUCINATION และ JSON only ทั้ง Gemini และ Typhoon รับข้อห้ามนี้ผ่าน system instruction/message

Gemini คง responseSchema และ default temperature ตาม Gemini 3 guidance ของ Google ไม่ตั้ง 0 เพราะค่าต่ำอาจทำให้วนซ้ำ/ประสิทธิภาพลดลง Typhoon คง temperature 0; ไม่ส่ง response_format ที่เอกสาร OCR endpoint ยังไม่ได้ยืนยันว่ารองรับ ส่วน native iApp/Hugging Face image endpoints ไม่ถูกส่ง prompt/temperature ที่ไม่อยู่ในสัญญา

เพิ่ม validation ป้องกันการตัด น.ส./ส.ต. หรือ masking tokens ออกจากชื่อ/บัญชี เมื่อ OCR evidence line ระบุรองรับ field นั้นเพียง field เดียว ถ้า field ขัดกับข้อความหลักฐานจะ reject และคง review_required การตรวจนี้ป้องกันความขัดแย้งภายในผลตอบกลับ ไม่ใช่พิสูจน์ว่าตัว raw OCR ตรงกับภาพ

ชุดทดสอบเฉพาะส่วน 61 รายการผ่าน Production Build ผ่าน และขึ้น Staging 3461 แล้ว Build ID L5377rxpnx1luJ9vyXcQ- ไม่แตะพอร์ต 3450 ไม่มีการใช้คีย์จริงหรือส่งภาพไป provider ในรอบนี้

หลักฐาน: For Test Results/strict-ocr-controls-20261116/

อ้างอิง:
- https://ai.google.dev/gemini-api/docs/gemini-3
- https://docs.opentyphoon.ai/en/api-reference/
- https://iapp.co.th/en/docs/ocr/document-markdown

Prompt/schema/temperature ไม่รับประกัน deterministic OCR หรือ exact 100% ผลยังต้องผ่าน validation และ human review
