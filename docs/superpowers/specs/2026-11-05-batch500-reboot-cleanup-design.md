# Batch 500, Runtime Reboot, and Cleanup Manifest Design

วันที่: 2026-11-05  
สถานะ: Design approved for review  
ขอบเขต: Digital Evidence local/review runtime

## เป้าหมาย

พิสูจน์ว่า build ล่าสุดของ Digital Evidence สามารถประมวลผลชุด benchmark 500 ภาพแบบ resumable ได้ครบ โดยไม่แก้ไขต้นฉบับ ไม่เขียนทับผลเดิมโดยไม่มีหลักฐาน และยังคงสถานะ `review_required` เมื่อข้อมูลไม่ชัดเจน จากนั้นพิสูจน์ว่า Windows Service กลับมาทำงานได้หลัง reboot และจัดทำรายการไฟล์ cache/scratch ที่เสนอให้ลบ โดยยังไม่ลบไฟล์ใดในเฟสนี้

## ไม่อยู่ในขอบเขต

- ไม่ลบ `For Test Results` หรือหลักฐานทดสอบใด ๆ
- ไม่ลบไฟล์ต้นฉบับ ภาพ fixture โมเดล trained data source code หรือ `.env`
- ไม่เปลี่ยนกฎ OCR/QR และไม่เพิ่ม provider ภายนอก
- ไม่ถือว่า OCR exact ทุก field เป็นเกณฑ์ผ่านของ batch นี้
- ไม่ถือผล legal signal เป็นคำวินิจฉัย

## ลำดับการทำงาน

### 1. ตรวจ build และ service

บันทึกข้อมูลก่อนเริ่ม:

- service name, status, start type และ binary path
- `BUILD_ID` ของ `build-output-enterprise`
- `BUILD_ID` ของ build source ที่จะใช้
- HTTP health ของ `http://127.0.0.1:3450/`
- git commit ที่เป็น source of truth

ถ้า service ไม่ได้ใช้ build ที่กำหนด จะหยุดก่อนประมวลผลและไม่ตีความผลจาก runtime คนละชุดเป็น benchmark เดียวกัน

### 2. Batch 500 แบบแบ่งช่วงและมี checkpoint

สร้าง run directory ใหม่ที่ไม่เขียนทับรายงานเดิม แบ่งงานเป็นช่วงที่มี offset/limit ชัดเจน แต่ละช่วงต้องมี:

- run metadata และ build ID
- input inventory พร้อม source SHA-256
- checkpoint ที่ระบุ completed, failed, skipped และ remaining
- per-image JSON trace
- progress report ที่เขียนแบบ atomic

การ resume อนุญาตเฉพาะเมื่อ source inventory, build ID, processing version และ fixture set ตรงกับ checkpoint เดิม หากไม่ตรงให้สร้าง run ใหม่

เมื่อพบ error ที่เป็น runtime ให้เก็บ error และทำต่อเฉพาะรายการที่ปลอดภัย หากเกิด quota/provider error ให้หยุดตาม policy และไม่ retry ส่งภาพซ้ำโดยอัตโนมัติ

### 3. รวมรายงาน

สร้าง manifest รวมจากทุกช่วง โดยใช้ source SHA-256 เป็น identity หลัก ไม่ใช้หมายเลขลำดับไฟล์เพียงอย่างเดียว รายงานรวมต้องแยกอย่างน้อย:

- `completed`
- `review_required`
- `failed`
- `skipped_duplicate`
- `not_run`

ทุกสถานะต้องชี้กลับไปยัง source file, trace path และ processing run ID ได้

### 4. ตรวจภาพตกหล่น ซ้ำ และ trace หาย

ตัวตรวจรวมต้องตรวจว่า:

- inventory มี 500 source records ตามขอบเขต benchmark
- ทุก source SHA มีผลลัพธ์ที่ถูกต้องหนึ่งชุด หรือมีสถานะ `failed/not_run` ที่อธิบายได้
- ไม่มี source เดียวถูกนับเป็น completed ซ้ำโดยไม่ระบุ duplicate relationship
- ทุก candidate มี source SHA-256
- ทุก field evidence ที่รายงานว่ามีค่ามี crop hash, coordinates, raw OCR และ confidence
- ผลอ่านไม่ชัดยังเป็น `review_required`
- ไม่มี trace file เปล่าหรือ JSON parse ไม่ได้

ถ้าตรวจไม่ครบ ให้ batch status เป็น `incomplete` ไม่ใช่ `passed`

### 5. ทดสอบ service หลัง reboot

หลัง checkpoint และ reports ถูกเขียนเสร็จ:

1. ตรวจว่า service ตั้งเป็น Automatic
2. reboot เครื่องตามสิทธิ์และสภาพแวดล้อมที่ได้รับอนุญาต
3. รอ service กลับสู่ `RUNNING`
4. ตรวจ BUILD_ID และ HTTP 200
5. ตรวจว่า service ไม่เปิด runtime คนละ build

ถ้า reboot ไม่สามารถทำได้ใน session นี้ ให้บันทึกเป็น `not_run` พร้อม blocker ห้ามใช้ health ก่อน reboot แทนหลักฐานหลัง reboot

### 6. Health และ E2E สั้น ๆ

บน service หลัง reboot ให้รันสลิปจริงหนึ่งใบผ่าน browser:

```text
upload
→ process
→ ตรวจ candidate/UI
→ ดาวน์โหลด JSON trace
→ ตรวจ source SHA, OCR attempts, field evidence และ review_required
→ ตรวจว่าไม่มี external provider call ที่ไม่ได้รับอนุญาต
```

ผล E2E ต้องเก็บ screenshot, JSON trace, report และ console/page error count

### 7. Cleanup manifest โดยยังไม่ลบ

สำรวจเฉพาะ cache/scratch ที่อยู่นอกหลักฐานที่ต้องรักษา สร้าง manifest โดยมี:

- absolute path
- ประเภทไฟล์
- ขนาด
- last modified
- เหตุผลที่จัดเป็น cache/scratch
- ผลตรวจว่าไม่มี source-code/import/build/runtime reference
- recoverability
- ข้อเสนอ `candidate_for_cleanup` หรือ `retain`

ไฟล์จะไม่ถูกลบในเฟสนี้ แม้จะอยู่ในกลุ่ม `candidate_for_cleanup` จนกว่าจะมี approval แยกต่างหาก

## Acceptance criteria

- build/service identity ถูกบันทึกและตรงกันก่อน batch
- batch inventory ครบ 500 รายการตามขอบเขต
- checkpoint resume ได้โดยไม่ทำให้ผลซ้ำหรือ source หาย
- aggregate report ตรวจสอบย้อนกลับได้ทุกภาพ
- missing/duplicate/invalid trace ถูกตรวจพบและรายงาน
- service health หลัง reboot มีหลักฐานจริง หรือระบุ `not_run` พร้อมเหตุผล
- E2E หลัง reboot ตรวจผลใน UI และ JSON trace
- ต้นฉบับไม่ถูกแก้ไข และ source SHA ไม่เปลี่ยน
- cleanup manifest เสร็จ แต่ไม่มีการลบไฟล์
- ผลที่ไม่ชัดเจนยังเป็น `review_required`

## Failure and safety policy

- ห้ามใช้ผลจาก build/runtime ต่างกันมารวมเป็น benchmark เดียว
- ห้าม overwrite report เดิม
- ห้าม retry ภาพซ้ำเมื่อเจอ provider quota error โดยอัตโนมัติ
- ห้ามเปลี่ยน `review_required` เป็น confirmed เพื่อให้ตัวเลขผ่าน
- ถ้าข้อมูลหรือสิทธิ์ไม่พอ ให้รายงาน `blocked`/`not_run` ตามจุดจริง
- ทุกผลสรุปต้องแยกข้อเท็จจริง, inference และสิ่งที่ยังไม่ได้ทดสอบ

