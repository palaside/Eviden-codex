# Upscayl Evidence Enhancement Module

## Goal

เพิ่มเส้นทางสร้างภาพอนุพันธ์จากภาพแชทและสลิปด้วย Upscayl/`upscayl-ncnn` เพื่อเป็น OCR/QR retry โดยไม่แก้ไขต้นฉบับ ไม่เปลี่ยนผลเป็นข้อมูลยืนยัน และเชื่อม provenance กลับถึง candidate/UI ได้

## Scope

- รับเฉพาะภาพที่ผ่านการตรวจชนิดหรือครอปเป้าหมายแล้ว
- สร้าง output ในพื้นที่ derived ชั่วคราว/แยกจากหลักฐานดิบ
- เก็บ source SHA-256, derived SHA-256, engine, model, scale, dimensions และคำสั่งที่ใช้
- ส่งภาพอนุพันธ์กลับให้ OCR/QR ตาม flow เดิมในฐานะ retry candidate
- ถ้า binary ไม่พร้อม ให้ตอบสถานะ `unavailable` อย่างชัดเจนและใช้เส้นทางเดิมต่อได้

## Data flow

`source image -> hash -> target crop -> Upscayl adapter -> derived image/hash -> OCR/QR retry -> review-only candidate -> UI trace`

สำหรับแชทจะครอปกรอบสลิปก่อน upscale; สำหรับสลิปเดี่ยวจะใช้กรอบสลิปเต็มใบหรือ crop ที่ระบบตรวจพบแล้ว ไม่ upscale ภาพแชททั้งยาวโดยไม่จำเป็น

## Safety rules

- ห้ามเขียนทับ source
- ห้ามลบ source หรือข้อมูล derived เดิมโดยอัตโนมัติ
- Upscayl ไม่เป็นตัวตัดสินว่าสลิปจริง/ปลอม และไม่ยืนยันชื่อ/ยอด/เวลา
- OCR ที่ไม่ชัดต้องคง `review-only`
- จำกัด scale, dimensions, timeout และ output directory เพื่อป้องกัน resource exhaustion

## Integration boundary

สร้าง adapter ฝั่ง server/CLI ที่รับ executable path จาก environment (`UPSCAYL_NCNN_PATH`) และคืนผลลัพธ์แบบ typed metadata ไม่ผูก UI เข้ากับรายละเอียด command line โดยตรง ส่วนการเรียก OCR/QR ใช้ภาพอนุพันธ์เป็นอีก attempt ที่ trace ได้

## Acceptance criteria

1. source hash ไม่เปลี่ยนหลังรัน
2. เมื่อ binary พร้อม ระบบสร้าง derived image และ provenance ครบ
3. เมื่อ binary ไม่พร้อม ระบบไม่ล้มทั้ง workflow และแสดงสถานะ review-safe
4. OCR/QR retry ใช้ derived image เดียวกับที่บันทึก hash
5. UI แสดงว่าเป็นผลจาก enhancement และยังรอตรวจ
6. มี unit/contract test และ E2E fixture ที่ยืนยัน output/provenance

## Known limitation

เครื่องปัจจุบันยังไม่พบ executable Upscayl/`upscayl-ncnn` จาก PATH จึงต้องติดตั้งหรือกำหนด path ก่อนจึงจะพิสูจน์ runtime enhancement จริงได้ การมี adapter/test ไม่ถือเป็นหลักฐานว่า engine รันแล้ว
