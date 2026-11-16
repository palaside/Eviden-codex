# Gemini OCR: แยกผลดิบออกจากผลตรวจราย field

วันที่: 2026-11-17
สถานะ: ผู้ใช้อนุมัติแนวทางแล้ว รอรีวิวเอกสารก่อนทำ implementation plan

## เป้าหมาย

เมื่อ Gemini คืนข้อความหรือข้อมูลสลิปที่อ่านได้ ต้องแสดงข้อเสนอในหน้าตรวจเดิมได้ แม้บรรทัดอื่นมีพิกัดผิด โดยไม่เปลี่ยนข้อมูลที่ไม่มีหลักฐานให้เป็นค่าที่เชื่อถือได้ และไม่ยืนยันหรือรวมยอดอัตโนมัติ

## หลักฐานต้นเหตุ

- Google เคยปฏิเสธ responseSchema ที่มี constraints ซับซ้อนด้วย INVALID_ARGUMENT
- หลังลด schema พบ local validation ปฏิเสธ document_type และต่อมาปฏิเสธ $.pageLines[0].bounds.y
- validateGeminiOcrDocument ตรวจทั้งเอกสารและ throw เมื่อจุดใดจุดหนึ่งผิด
- transport, bridge client และ adapter ใช้ validator นี้ ทำให้ผลที่อ่านได้ไม่ถึง candidate
- หน้า Staging 3461 ยังแสดง GEMINI_SCHEMA_MISMATCH; ไม่ถือว่า HTTP 200 บางคำขอพิสูจน์ความถูกต้องของ OCR
- ไม่ทราบทุกสาเหตุที่แสดง path $ เพราะยังไม่มี raw response ที่บันทึกไว้ ห้ามสร้าง fixture แล้วอ้างเป็นผลจริง

## ทางเลือกและการตัดสินใจ

1. เลือกแยก provider response, application mapping และ field assessment ออกจากกัน ใช้จุดเชื่อมเดิมและคง review gate
2. ไม่เลือกแก้ prompt ต่อทีละข้อ เพราะข้อผิดพลาดส่วนเดียวจะยังล้มทั้งเอกสาร
3. ไม่เลือก bypass validation เพราะจะทำให้พิกัดและค่าที่ไม่มีหลักฐานถูกใช้อย่างผิดวัตถุประสงค์

## ขอบเขต

- เปลี่ยนเฉพาะเส้นทาง Gemini transport -> mapper/assessment -> bridge client -> adapter/explicit Gemini button -> candidate/trace -> UI เดิม
- รองรับทั้งปุ่ม Gemini รายไฟล์และ adapter ที่ถูกเลือกใน workflow; ห้ามแก้เพียงเส้นทางเดียว
- ไม่เปลี่ยนรูปแบบหน้าตา, Legal Signal dictionary, IndexedDB/LocalStorage schema หรือข้อมูลที่บันทึกเดิม
- ไม่เพิ่ม dependency, ไม่เปิด detector ใหม่, ไม่เปลี่ยน production 3450
- original image และ SHA-256 คงเดิม ภาพ crop/derived ต้องแยกจากต้นฉบับ
- ไม่เปิดใช้งาน headroom runtime หรือบีบอัดหลักฐานดิบจากการใช้สกิล

## ขอบเขตความรับผิดชอบ

### 1. Transport

ส่ง Blob เป็น Base64 ล้วน รับ HTTP/JSON โดยแยก transport failure ออกจาก field assessment
HTTP error, invalid JSON, blocked/incomplete response ยังเป็น failure ที่ชัดเจน ไม่สร้าง candidate สำเร็จปลอม ไม่ retry อัตโนมัติ
รักษา model response ที่เป็นข้อความ JSON ก่อน mapping ภายใน trace ที่ดาวน์โหลดได้ในเครื่อง ห้ามใส่ key, request headers หรือภาพ Base64 ลง trace/log
ไม่เขียน raw response ที่มีข้อมูลส่วนบุคคลลง console โดยปริยาย

### 2. Mapper ของแอป

แปลงค่าตาม schema ที่รองรับอย่างเจาะจง ไม่เดาชื่อ field จาก arbitrary object
document_type, currency convention และ review status เป็น metadata ของแอป ต้องไม่ถูกเสนอว่าเป็นข้อความที่เห็นในภาพ
เก็บค่าที่โมเดลส่งต่างจาก metadata ไว้ใน trace ก่อนสร้าง candidate ที่ยังไม่ยืนยัน
เติม null/empty array เฉพาะช่องว่างเชิงโครงสร้างที่อนุญาต พร้อม issue; ห้ามเติมชื่อ ยอดเงิน วันที่ เวลา หรือพิกัด
ข้อความชื่อและเครื่องหมายปิดบังต้องเก็บตรงตามผลดิบ ไม่ autocorrect/trim จนสูญเสียหลักฐาน
หลายสลิปต้องแยก occurrence; ห้ามรวม field ข้ามใบหรือจับ candidate ด้วยชื่อ/ยอดเงินเพียงอย่างเดียว

### 3. Assessment รายส่วน

ประเมินแต่ละ page line, slip boundary และ field แยกกัน พร้อม path, reason และแหล่งอ้างอิง
ค่าที่มีชนิดข้อมูลถูกต้อง พิกัดอยู่ในภาพ/สลิป และข้อความรองรับตามกฎเดิมจึงเป็น supported proposal
ค่าที่อ่านได้แต่พิกัด/ข้อความรองรับไม่ผ่านเป็น unverified proposal ต้องแสดงเพื่อมนุษย์ตรวจ และห้ามใช้ในช่อง trusted calculation
ค่าหายหรือชนิดผิดเป็น unavailable; หลายค่าที่ขัดกันเป็น conflict ไม่เลือกผู้ชนะด้วย confidence อย่างเดียว
ห้าม clip/สร้างพิกัดปลอม ห้ามใช้ภาพทั้งใบเป็น field crop หรืออ้างว่าเป็น detected slip
กรอบสลิปผิดต้องคงผลดิบไว้ระดับภาพ รอตรวจกรอบก่อนเชื่อมเข้าธุรกรรม
page line ที่ผิดจะไม่ทำให้ field อื่นที่ผ่านเสียไป และ field ที่ผิดในสลิปหนึ่งไม่ล้มสลิปอื่น
กฎ confidence 0..1, masks/abbreviations, date support และการไม่ใช้ fee เป็น amount ยังทำงาน

### 4. Candidate, trace และ UI

คง SlipExtraction/LocalSlipCandidate เป็นขอบเขต compatibility สำหรับผู้ใช้ข้อมูลเดิม
ค่าที่ไม่ผ่านห้ามถูกใส่ในช่องที่ consumer เดิมเข้าใจว่าใช้คำนวณได้ ให้เก็บใน proposal/diagnostic และแสดงผ่านพื้นที่ review เดิม
ก่อน implementation ต้องตรวจ consumer ของ ledger/export จริง เพื่อกำหนดการส่ง proposal โดยไม่เปิดเส้นทางรวมยอดที่ไม่ผ่านกฎ
ใช้ review status เดิม ไม่เพิ่ม automatic confirmation; การยืนยันของมนุษย์คงเส้นทางและ occurrence เดิม
trace ต้องมี provider response, mapping decisions, per-field issues, source SHA-256, dimensions และ source page/occurrence ที่มีจริง
พิกัดที่ไม่มีให้ระบุ null/unknown ไม่แต่งค่า confidence หรือ crop hash
hash ของ crop เกิดจาก bytes ของ crop จริงเท่านั้น
error banner ใช้กับ failure ระดับ request ส่วน partial extraction แสดงผลและ issues ไม่ใช้ข้อความว่าทั้งคำขอล้มเหลว
ถ้าต้องแก้ JSX ให้จำกัดการผูกค่าหรือสถานะกับส่วน review ที่มีอยู่ ห้าม redesign
ไม่เปลี่ยน persistence contract; ตรวจ reload ของข้อมูลที่ระบบเดิมรองรับ หาก proposal metadata ไม่ถูก persist ต้องระบุข้อจำกัดตามจริง ไม่ทำ migration โดยพลการ

## การทดสอบและเกณฑ์รับงาน

ต้องสร้าง failing regression ก่อนแก้ แล้วรันทวนดังนี้:

1. pageLines หนึ่งบรรทัด y ติดลบ แต่ amount/name ของสลิปมีหลักฐานถูกต้อง: ค่าที่ผ่านถึง candidate และ UI ส่วนบรรทัดผิดมี issue
2. document_type จากโมเดลไม่ตรง: เก็บต้นฉบับและ decision; ไม่ใช้ metadata จุดเดียวทิ้งผลอื่น และไม่ถือเป็นธุรกรรมยืนยัน
3. field ไม่มีพิกัด: เก็บข้อเสนอรอตรวจ ห้าม trusted calculation หรือ crop ปลอม
4. ชื่อถูกลบ น.ส./s***: กฎเดิมปฏิเสธความน่าเชื่อถือ เก็บ raw และ reason ไม่แก้ชื่อให้เอง
5. หลายสลิป: ใบผิดไม่ล้มใบที่ถูก ไม่จับคู่/รวมข้อมูลข้าม occurrence
6. invalid JSON, truncated response, 429, timeout: failure ตามจริง ไม่ retry ไม่ freeze และไม่ยืนยัน
7. ปุ่ม Gemini และ adapter หลักใช้ผล assessment เดียวกัน ไม่ validate ซ้ำด้วย strict whole-document contract จนทิ้ง partial result
8. regression ของ local/Typhoon/OpenThai เท่าที่เกี่ยวข้องต้องไม่เสีย; ห้ามเปลี่ยนพฤติกรรม provider อื่นโดยอ้อม
9. ทดสอบ browser ด้วย chatv3 (59).jpg เมื่อได้รับอนุญาตเฉพาะไฟล์/จำนวนคำขอใหม่ ตรวจ UI, ตาราง, JSON trace, masks, amount, reference, review status และ reload ตามขอบเขตที่อนุญาต
10. จำนวนเงิน 13,500 จากภาพที่ผู้ใช้แนบเป็นค่าคาดหวังสำหรับตรวจ ไม่ใช่ ground truth ที่ผ่านการรับรองทุก field ห้าม hard-code ชื่อ/ยอดหรือใช้ expected value เป็น OCR output

## การเปิดใช้งานและหลักฐานปิดงาน

Build โฟลเดอร์ Staging ใหม่ ตรวจ process ก่อน restart เฉพาะ 3461 บันทึก build ID และ HTTP health
บันทึก report แยก unit/integration, live provider และ browser E2E ห้ามอ้าง simulation เป็น live accuracy
เก็บ screenshot ที่ไม่เผย key/password และ JSON trace ใน For Test Results ของรอบนั้น
ผลสุดท้ายต้องรายงาน field ที่แสดงได้, supported/unverified/conflict, review_required และสิ่งที่ยังทดสอบไม่ได้
ไม่รายงานว่า workflow ผ่านหากตรวจได้เพียง build หรือ JSON helper

## Self-review

ตรวจแล้ว: ไม่มี placeholder implementation, แยก supported ออกจาก unverified, ไม่อนุญาตพิกัดปลอม, ไม่ bypass review gate, ระบุสองเส้นทาง Gemini และไม่แก้ persistence schema
จุดที่ต้องพิสูจน์ในขั้น implementation คือ consumer ที่คำนวณยอดและความสามารถแสดง proposal ผ่านพื้นที่ review เดิม ไม่ถือว่าสำเร็จจากเอกสารนี้
