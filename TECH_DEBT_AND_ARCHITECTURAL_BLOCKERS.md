# Technical Debt & Architectural Blockers — Digital Evidence

วันที่จัดทำ: 16 พฤศจิกายน 2026

## 1. วัตถุประสงค์และขอบเขต

บันทึกปัญหาการใช้งาน หนี้ทางเทคนิค ข้อจำกัดเชิงโครงสร้าง และช่องว่างการพิสูจน์ที่สะสมระหว่างพัฒนา Digital Evidence เพื่อใช้จัดลำดับงานและกำหนดเกณฑ์ปิดประเด็นจากหลักฐานจริง

เอกสารนี้มาจากประวัติงาน การอ่านซอร์สที่เกี่ยวข้อง และรายงานที่มีอยู่ ไม่ใช่ผลทดสอบระบบทั้งหมดใหม่ ณ วันที่จัดทำ และไม่ใช่คำสั่งให้รื้อสถาปัตยกรรมหรือเพิ่ม dependency โดยอัตโนมัติ

**ข้อสรุป:** แอปมีความสามารถเฉพาะจุดและมี flow ที่พิสูจน์ได้แล้ว แต่ความสามารถในการอ่านหลักฐาน การตัดสินสถานะ การรวมยอด และการส่งออก ยังไม่ได้รับการพิสูจน์ว่าสอดคล้องกันครบทุกเส้นทางและทุกชุดข้อมูล

## 2. นิยามสถานะ

| สถานะ | ความหมาย |
|---|---|
| Open — observed limitation | พบข้อจำกัดในโค้ดหรือหลักฐานผลผิดที่ยังปิดขอบเขตไม่ได้ |
| Open — architectural debt | โครงสร้างทำให้แก้และตรวจผลยาก ไม่ได้หมายความว่าทุกเส้นทางเสีย |
| Unverified | ยังไม่มีหลักฐานเพียงพอ ห้ามเหมารวมว่าเสียหรือผ่าน |
| Risk requiring reproduction | พบเส้นทางที่อาจไม่สอดคล้องกัน ต้องสร้างกรณีทดสอบก่อนฟันธงว่าเป็นบั๊ก |
| Resolved in bounded scope | มีหลักฐานว่าแก้ได้ใน input/flow ที่ระบุ ไม่ครอบคลุมกรณีอื่นโดยอัตโนมัติ |

ลำดับ P1/P2/P3 ในเอกสารเป็น **ข้อเสนอจัดลำดับงาน** ไม่ใช่ severity ที่ได้จากการประเมินผลกระทบการใช้งาน production จริง

- **P1:** กระทบความถูกต้องของข้อมูลหรือความหมายที่ผู้ใช้เห็น ควรปิดก่อนขยายขอบเขตการรับรอง
- **P2:** กระทบความสอดคล้อง ความทนทาน และความสามารถบำรุงรักษา
- **P3:** งานปรับปรุงที่ทำหลังมี flow หลักและเกณฑ์ทดสอบมั่นคง

## 3. สรุปรายการค้าง

| ID | ประเด็น | สถานะ | ลำดับเสนอ |
|---|---|---|---|
| TD-01 | OCR ยังไม่ exact ทุก field/ทุกภาพ | Observed limitation + Unverified coverage | P1 |
| TD-02 | ตรวจองค์ประกอบสลิปยังพึ่งการอ่านคำตรงมาก | Architectural debt | P1 |
| TD-03 | Quality gate วัดได้แคบกว่าชื่อสถานะที่สื่อ | Observed limitation | P1 |
| TD-04 | การตรวจและครอปสลิปในภาพแชทยาวยังไม่ครอบคลุม | Observed limitation + Unverified coverage | P1 |
| TD-05 | ยังเลือกภาพปรับปรุงจากคุณภาพการอ่านไม่ได้ครอบคลุม | Observed limitation | P1 |
| TD-06 | Benchmark/ground truth/coverage ข้ามธนาคารยังไม่ครบ | Unverified | P1 |
| TD-07 | State และยอดหลายเส้นทางยังต้องพิสูจน์ความสอดคล้อง | Risk requiring reproduction | P1 |
| TD-08 | กฎ Ref ซ้ำกับการเลือก master โดยผู้ตรวจต้องทดสอบร่วมกัน | Risk requiring reproduction | P1 |
| TD-09 | หน้า workspace และ OCR orchestration รับผิดชอบมากเกินไป | Architectural debt | P2 |
| TD-10 | Persistence/backup/migration/การใช้งานทีมยังไม่รับรอง | Unverified | P2 |
| TD-11 | Batch รวมผลและแสดงงานล่าสุดยังมีช่องว่าง | Observed limitation + Unverified completion | P2 |
| TD-12 | Build/runtime/source-of-truth และเอกสารสถานะยังติดตามยาก | Architectural debt | P2 |
| TD-13 | Export ทุกชนิดยังไม่มีหลักฐาน E2E ครบ | Unverified | P1 |
| TD-14 | Provider ภายนอกขึ้นกับ quota/billing/availability | External limitation + Unverified readiness | P2 |
| TD-15 | ข้อมูลกฎหมายและการตีความบริบทยังมีข้อจำกัด | Observed limitation + Unverified currency | P1 |

## 4. รายละเอียดปัญหาและเกณฑ์ปิด

### TD-01 — OCR ยังไม่ exact ทุก field

**สิ่งที่พบ:** แก้การอ่านได้หลายเคส แต่ยังมี noise ในชื่อและค่าทางเลือก รายงาน E2E ล่าสุดที่ใช้อ้างในบทสนทนาระบุ `allFieldsExact: false` แม้ flow ของเคสนั้นผ่าน

**ผลกระทบ:** ผู้ใช้ยังต้องเปิดภาพเทียบชื่อ วันที่ เวลา และ field ที่ขัดแย้ง ไม่สามารถรับรองค่าทุกตัวอักษรจาก confidence เพียงอย่างเดียว

**แหล่งหลักฐาน:** [รายงาน status-chroma E2E](For%20Test%20Results/status-chroma-e2e-20261106/report.json), [local-slip-ocr.ts](src/utils/local-slip-ocr.ts), [slip-ocr-analysis.ts](src/utils/slip-ocr-analysis.ts)

**เกณฑ์ปิด:** ชุดข้อมูลที่กำหนดขอบเขตชัดมี ground truth ราย field ที่ตรวจโดยมนุษย์ มีผลเปรียบเทียบค่าที่อ่านจริงและ conflict พร้อมตรวจ UI/JSON ของ input เดียวกัน ข้อผิดพลาดต้องไม่ถูก normalize กลบจนดูเหมือนอ่านถูก

### TD-02 — การตรวจองค์ประกอบพึ่ง OCR มากเกินไป

**สิ่งที่พบ:** Gate ใช้ข้อความ OCR จับองค์ประกอบ เช่น สถานะโอนสำเร็จ จาก ไปยัง และจำนวนเงิน เมื่อ OCR อ่านผิดจึงได้ `unknown` แม้องค์ประกอบอยู่ในภาพ

**ปัญหาเชิงโครงสร้าง:** ยังไม่ได้แยกอย่างสมบูรณ์ระหว่าง:

1. บริเวณนั้นเป็นภาพสลิปหรือไม่
2. มีองค์ประกอบที่ต้องตรวจอยู่ในภาพหรือไม่
3. อ่านข้อความในองค์ประกอบนั้นได้ตรงหรือไม่

**ผลกระทบ:** ภาพที่มนุษย์เห็นว่าครบอาจถูกปิดสิทธิ์เพราะตัวอ่านผิด กฎคำบังคับชุดเดียวอาจไม่ครอบคลุมธนาคารที่ใช้คำหรือ layout ต่างกัน

**แหล่งหลักฐาน:** [slip-calculation-gate.mjs](src/utils/slip-calculation-gate.mjs), [policy](src/schemas/slip-components.policy.json)

**เกณฑ์ปิด:** มีหลักฐานและสถานะแยกการมีอยู่ของ region กับผล recognition; ภาพเต็ม/ภาพขาด/คำอ่านผิดให้ผลต่างกันอย่างอธิบายได้ ข้อมูลจากคนละ occurrence ต้องไม่ถูกรวมเพื่อทำให้ครบ ห้ามลดเงื่อนไขหรือเติมคำเพื่อทำคะแนนให้ผ่าน

### TD-03 — Quality gate ยังเป็นการวัดเบื้องต้น

**สิ่งที่พบใน implementation:**

- `visual_quality` ส่วนหนึ่งพิจารณาขนาดกรอบขั้นต่ำ ยังไม่พิสูจน์ความคมชัด/ความพร่าของตัวอักษรจริง
- `region_quality` ตรวจกรอบและการอยู่ภายในภาพ แต่ยังไม่พิสูจน์ว่าครอบ field ถูกตำแหน่ง
- `recognition_quality` ใช้ค่าที่อ่านได้ confidence และ alternatives ซึ่งยังอ่านผิดได้แม้ confidence สูง

**ผลกระทบ:** คำว่า `pass` อาจสื่อความมั่นใจมากกว่าสิ่งที่ตรวจจริง

**แหล่งหลักฐาน:** [field-quality-gate.mjs](src/utils/field-quality-gate.mjs)

**เกณฑ์ปิด:** กำหนดความหมายและหลักฐานของแต่ละ quality ให้ตรงกัน ทดสอบภาพเบลอ กรอบคลาด ข้อความขาด และ OCR มั่นใจสูงแต่ผิด ห้ามถือว่ากรอบอยู่ในภาพเป็นการรับรองตำแหน่งตัวอักษร และห้ามแปลง `pass` เป็น human confirmed

### TD-04 — ภาพแชทยาวและ slip crop ยังไม่ครอบคลุม

**ประวัติ:** โมเดล detector เดิมเคยให้ผลไม่ผ่านและถูกนำออกจากเส้นทางบังคับ ยังไม่มีหลักฐานรองรับให้เปิดกลับเป็น detector production

**สิ่งที่ค้าง:** ภาพแชทยาวหลาย layout, สลิปเล็กหลายใบ, ภาพขาดบางส่วน, ภาพไม่มีสลิป และภาพมีข้อความยอดเงินแต่ไม่มีสลิป ยังต้องวัด coverage และพิกัดจริง

**ผลกระทบ:** อาจพบไม่ครบ ครอปกว้างจนติดข้อความแชท หรือพลาดส่วนของสลิป การแก้ด้วย QR anchor ไม่ได้พิสูจน์ทุกกรณีที่ QR อ่านไม่ได้

**แหล่งอ้างอิง:** [local-qr-extractor.ts](src/utils/local-qr-extractor.ts), [local-slip-ocr.ts](src/utils/local-slip-ocr.ts), [SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md)

**เกณฑ์ปิด:** มีชุดภาพจริงพร้อมกรอบที่มนุษย์ตรวจ วัดจำนวนพบ/พลาด/กรอบผิด/กรอบซ้ำ รวม negative cases และตรวจ UI/source mapping ห้ามอ้างว่า detector ผ่านจาก OCR สลิปเดี่ยวเพียงอย่างเดียว

### TD-05 — Enhancement ไม่ได้ช่วย recognition ทุกกรณี

**สิ่งที่พบ:** ภาพดูคมขึ้นอาจอ่านแย่ลง เคสป้ายเขียวพบว่า grayscale อ่านผิด ขณะที่ chroma variant อ่านตรง

**ผลกระทบ:** ไม่ควรเลือกภาพประมวลผลจากความรู้สึกว่าคมกว่า หรือแทนที่ original ด้วย variant เดียวทั้งระบบ

**แหล่งหลักฐาน:** [enhance-for-ocr.mjs](src/utils/enhance-for-ocr.mjs), [OCR integration](src/utils/local-slip-ocr.ts), [ผลเปรียบเทียบรอบเดิม](For%20Test%20Results/optional-memo-v3-20261106/), [ภาพ mask ที่อ่านได้](For%20Test%20Results/status-chroma-e2e-20261106/status-chroma.png)

**เกณฑ์ปิด:** เทียบ crop ตำแหน่งเดียวกันระหว่าง original และ variants โดยใช้ ground truth เลือกผลราย field จากหลักฐาน และมี regression กับตัวอักษรสี/เทา/พื้นหลังต่างกัน พร้อม hash และพิกัดของ variant

### TD-06 — Benchmark และ ground truth ยังไม่ครบ

**สิ่งที่ยังไม่ทราบ:** ความแม่นยำราย field ของชุดตัวแทนทุกธนาคาร/ทุกระดับคุณภาพ และผลประมวลผลครบทั้งชุด representative ที่ตรวจความครบถ้วนแล้ว

**ผลกระทบ:** จำนวน tests ผ่านหรือจำนวนภาพประมวลผลสำเร็จไม่ใช่อัตรา OCR exact และการมี candidate ไม่ใช่การตรวจพบสลิปครบ

**เกณฑ์ปิด:** ระบุ inventory ชุดทดสอบ, source hashes, กลุ่มธนาคาร/คุณภาพ, ground truth ที่ตรวจโดยมนุษย์ และ expected outcomes แยก detection/recognition/review มีรายงานทุกภาพ ตรวจ missing/duplicate/trace coverage และผลรวม reproducible

**ข้อจำกัดการอ้าง:** 102 tests ที่บันทึกไว้เป็น regression ระดับโค้ด ไม่ใช่ E2E 102 ภาพ ผู้ใช้เคยลดเป้า representative เหลือ 100 ภาพ ห้ามกลับไปรัน 500 อัตโนมัติเพียงเพราะสคริปต์ใช้ชื่อนั้น

### TD-07 — State และยอดต้องทดสอบให้สอดคล้องกัน

**สิ่งที่พบ:** มีสถานะแยก OCR อ่านได้ องค์ประกอบครบ eligible, conflict, user edit, human review และ duplicate resolution แล้ว แต่ยังไม่พบหลักฐานครบทุกชุดการเปลี่ยนสถานะและทุก output

**ความเสี่ยงที่ต้อง reproduce:**

- แก้ชื่อแล้ว raw OCR/conflict ยังอยู่ครบหรือไม่
- ยกเลิกยืนยันแล้วทุกยอดและทุกเอกสารอัปเดตตามกันหรือไม่
- ประมวลผลใหม่แล้วผลรอบใหม่กับ human review รอบเก่าสัมพันธ์กันถูกหรือไม่
- เปลี่ยนข้อสรุปซ้ำแล้ว Gross/NET, UI และ export ตรงกันหรือไม่

**แหล่งอ้างอิง:** [page.tsx](src/app/page.tsx), [confirmed-ledger.ts](src/utils/confirmed-ledger.ts), [slip-recipient-summary.ts](src/utils/slip-recipient-summary.ts)

**เกณฑ์ปิด:** มี transition matrix และ E2E ทำ action จริง → ตรวจ state → UI → reload → export จากรายการเดียวกัน พร้อมเก็บ trace การแก้ไข ไม่ใช้การตรวจว่าแสดงปุ่มยืนยันได้แทนหลักฐานความถูกต้อง

### TD-08 — Ref dedup กับการเลือก master ต้องทดสอบร่วมกัน

**สิ่งที่พบ:** Gate ผลรวมมีการเลือก Ref ที่พบก่อนในรายการเข้าเกณฑ์ ขณะที่ UI มีการเลือก master/ยืนยันสำเนา/ยืนยันคนละธุรกรรมแยกต่างหาก

**สถานะ:** เป็นจุดเสี่ยง ไม่ใช่ข้อสรุปว่าเกิดบั๊กในทุกกรณี

**ผลกระทบที่เป็นไปได้:** ผู้ใช้อาจเลือก master หรือแก้ข้อสรุปแล้วตัวเลขบางเส้นทางยังยึดลำดับรายการเดิม

**แหล่งอ้างอิง:** [evaluateSlipBatch](src/utils/slip-calculation-gate.mjs), [workspace duplicate review](src/app/page.tsx)

**เกณฑ์ปิด:** ทดสอบสลับลำดับ input เปลี่ยน master มี Ref ตรงแต่ field ขัดแย้ง ยกเลิกข้อสรุป และ reload/export ตรวจผลรวมทุกทางว่าตรงกับความหมายที่ผู้ใช้ยืนยัน

### TD-09 — Workspace และ OCR orchestration มีภาระรวมสูง

**สิ่งที่พบ:** ณ วันที่ตรวจ `src/app/page.tsx` มีมากกว่า 6,500 บรรทัดที่ไม่ว่าง รวมคิว ประมวลผล candidate, review, เป้าหมาย ยอด กฎหมาย Modal และส่งออก ส่วน local OCR มีงานอ่านซ้ำ/fallback หลายเส้นทางในโมดูลใหญ่

**ผลกระทบ:** แก้หนึ่ง field แล้วต้องไล่หลายบริบท จุดเลือกผลและการส่งต่อค่าตรวจยาก เพิ่มโอกาส patch ซ้ำและ regression

**แหล่งอ้างอิง:** [page.tsx](src/app/page.tsx), [local-slip-ocr.ts](src/utils/local-slip-ocr.ts)

**เกณฑ์ปิด:** แยกขอบเขตความรับผิดชอบตาม data flow และสถานะที่มีเจ้าของชัด โดยมี regression ป้องกันผลปลายทางเดิม การลดจำนวนบรรทัดเพียงอย่างเดียวไม่ถือว่าปิด และห้าม refactor ใหญ่โดยไม่มี acceptance criterion ที่สัมพันธ์กับปัญหาจริง

### TD-10 — Persistence ระยะยาวและการใช้งานทีมยังไม่รับรอง

**สิ่งที่ทำแล้ว:** มี IndexedDB persistence และมีเคส reload ที่ผ่าน ไม่ควรกล่าวว่าสถานะหายเสมอ

**สิ่งที่ยังไม่รับรอง:** storage quota, browser profile เสียหาย, ย้ายเครื่อง, migration เวอร์ชัน, สำรอง/คืนค่าคดีครบชุด, สิทธิ์หลายผู้ใช้ และ audit การแก้ไขสำหรับงานทีม

**แหล่งอ้างอิง:** [evidence-queue-persistence.ts](src/utils/evidence-queue-persistence.ts)

**เกณฑ์ปิด:** ทดสอบ failure/recovery และ migration ด้วยข้อมูลจริง มีขอบเขต retention/backup ชัด และพิสูจน์ว่ารายการ ภาพ hash และ review decisions คืนมาสัมพันธ์กัน การเพิ่มระบบผู้ใช้หรือเปลี่ยน schema ต้องขออนุมัติตามขอบเขตงาน

### TD-11 — Batch completion และสถานะงานล่าสุดยังมีช่องว่าง

**สิ่งที่พบ:** มี runner และ checkpoint แต่ผลรวมชุดเป้าหมายที่ครบทุกภาพยังต้องอ้างรายงานจริง ไม่อนุมานจากชื่อโฟลเดอร์หรือ checkpoint ที่มีอยู่

**ข้อจำกัดโครงสร้างที่ตรวจได้:** route แสดง batch status อ้าง path ของ checkpoint รอบ 5 พฤศจิกายนแบบเจาะจง จึงไม่ใช่ตัวชี้งานล่าสุดทั่วไป

**แหล่งอ้างอิง:** [batch status route](src/app/api/operations/batch500-status/route.ts), [batch500-contract.mjs](scripts/batch500-contract.mjs)

**เกณฑ์ปิด:** สถานะต้องผูกกับ run ที่ผู้ใช้กำลังติดตาม พร้อม run/build/input identity, heartbeat และ completed/failed/stale ที่แยกได้ ตรวจ inventory และ resume ว่าไม่ประมวลผลภาพสำเร็จซ้ำหรือทำภาพตกหล่น

### TD-12 — Build/source-of-truth/เอกสารสถานะยังติดตามยาก

**สิ่งที่พบ:** มี build หลายชุดและ alternate checkout เดิม `digital-evidence/` แม้ประกาศ root หลักแล้ว ประวัติมีการสับสนเรื่อง promote/runtime และคำสั่ง service หลายรอบ

**เอกสารที่ล้าหลัง:** [PROJECT_STATUS.md](PROJECT_STATUS.md) ยังเป็น snapshot 26 ตุลาคม 2026 ขณะที่มีหลักฐานแก้และ E2E เดือนพฤศจิกายนแล้ว

**สิ่งที่ไม่ควรกล่าวเกินหลักฐาน:** Service เคย start/restart/promote สำเร็จและ HTTP 200 ไม่ใช่ว่ายังใช้ไม่ได้ทั้งหมด แต่ HTTP 200 ไม่รับรองว่า OCR หรือ export ผ่าน

**สิ่งที่ยังไม่รับรอง:** ความทนทานหลัง reboot, recovery และการทำงานระยะยาวของ build ปัจจุบัน

**แหล่งอ้างอิง:** [SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md), [PROJECT_STATUS.md](PROJECT_STATUS.md), รายงาน E2E ที่ระบุ build ID

**เกณฑ์ปิด:** ระบุ build ที่กำลังใช้งานเทียบ source version ได้ มี smoke E2E หลัง promote/reboot และอัปเดตสถานะจากหลักฐานล่าสุด มี lifecycle ของ staging/rollback/cleanup ที่ไม่แตะหลักฐานหรือ build ที่ใช้งาน

### TD-13 — Export integrity ยังไม่พิสูจน์ครบ

**สิ่งที่พบ:** มี PDF, XLSX, Markdown, JSON, เล่มภาพแยก/สารบัญ, review packet และ SFX แต่ยังไม่มีหลักฐานรอบเดียวที่ตรวจความสอดคล้องครบทุกชนิดและทุก review state

**ผลกระทบ:** อาจมีความต่างระหว่างตัวเลขใน UI กับไฟล์ เลขหน้าไม่ตรง ข้อมูลรอตรวจถูกแสดงคล้ายยืนยัน หรือการปกปิด/รหัสผ่านไม่เป็นไปตามที่ผู้ใช้เข้าใจ

**แหล่งอ้างอิง:** [export routes](src/app/api/export), [MasterDossierFullBook.tsx](src/components/MasterDossierFullBook.tsx), [APP_FEATURES.md](APP_FEATURES.md)

**เกณฑ์ปิด:** ใช้คดีเดียวกันที่มี eligible/ineligible/conflict/reviewed/duplicate แล้วตรวจเนื้อหาไฟล์จริงทุก output ที่ประกาศรองรับ รวมเลขหน้า hash ยอด สถานะ ชื่อ บัญชี การปกปิด และเปิดไฟล์ที่ตั้งรหัสได้ตามเงื่อนไข ไม่ใช้เพียง HTTP success หรือไฟล์ไม่ว่างเป็นข้อพิสูจน์

### TD-14 — Provider ภายนอกยังเป็น dependency ที่ควบคุมไม่ได้ทั้งหมด

**ประวัติ:** Gemini เคยถูกจำกัดจาก quota/billing; FourCorners เคยตอบพร้อม citation แล้วติด quota ในรอบถัดไป

**สถานะปัจจุบัน:** รอบจัดทำเอกสารนี้ไม่ได้ทดสอบ key/billing/availability ใหม่ จึงไม่สรุปว่าบริการยังเสียหรือพร้อมแล้ว

**ผลกระทบ:** การมี route หรือปุ่มไม่ได้พิสูจน์ provider E2E ต้องไม่บังคับ provider ที่ไม่พร้อมให้ local flow ใช้งานไม่ได้

**แหล่งอ้างอิง:** [T-LEX route](src/app/api/legal/tlex/route.ts), [slip extraction route](src/app/api/slips/extract/route.ts), [Typhoon review UI](src/components/TyphoonOcrReview.tsx)

**เกณฑ์ปิด:** กำหนด capability/readiness และค่าใช้จ่ายชัด พิสูจน์สำเร็จและกรณี quota/error พร้อม local fallback รักษาผลเดิมและ human review ไม่เปลี่ยน key/ส่งข้อมูลไป provider ใหม่โดยไม่มีสิทธิ์ที่เหมาะสม

### TD-15 — ข้อมูลกฎหมายและบริบทยังไม่รับรองครบ

**สิ่งที่พบ:** ฐานกฎบางส่วนเป็น `draft_unverified` / `current_unverified` ยังไม่มีหลักฐานว่าตรวจตัวบทรายมาตราเทียบประกาศและฉบับแก้ไขครบ การมี URL แหล่งทางการไม่เท่ากับตรวจเนื้อหาแล้ว

**ข้อจำกัดตัวจับสัญญาณ:** จับวลี/regex ไม่ใช่การตีความบริบทครบถ้วน คำปฏิเสธ ข้อความอ้างบุคคลอื่น และข้อความก่อน–หลังอาจทำให้ความหมายเปลี่ยน

**ความเสี่ยงการแสดงผล:** ต้องแยกข้อความ OCR จริง คำสรุป ข้อกฎหมาย และคำตอบค้นคว้าตลอด UI/เอกสาร ห้ามนำข้อความสรุปไปแสดงเหมือนคู่สนทนาพิมพ์จริง

**แหล่งอ้างอิง:** [legal dictionary](src/data/legal_signal_dictionary.json), [RAW snapshot](src/data/raw_thai_law_master_reference.json), [matcher](src/utils/legal-signal-matcher.mjs), [RAW adapter](src/utils/raw-legal-signal-adapter.mjs)

**เกณฑ์ปิด:** มี record การตรวจรายมาตราและ version/source ที่ตรวจได้ ชุดทดสอบบริบทเชิงบวก/ปฏิเสธ/อ้างคำพูด และหลักฐานว่า UI/export คงข้อความต้นทางแยกจากข้ออธิบาย ผลยังเป็น review lead ไม่ใช่ legal decision

## 5. สิ่งที่แก้ได้แล้วในขอบเขตที่พิสูจน์

ห้ามนำรายการต่อไปนี้ไปสรุปว่าเสียทั้งหมดเหมือนก่อนแก้:

| เรื่อง | หลักฐาน/ขอบเขต |
|---|---|
| Local OCR/QR ไม่บังคับ Gemini | มีเส้นทาง local และผล E2E ของเคสที่อ้างด้านล่าง |
| Memo ไม่บังคับ | policy v3 แยกโบนัส 10.1 ไม่ใช้ตัดสิทธิ์เมื่อไม่มี memo |
| ป้ายสถานะสีเขียว | เคสเดิมอ่าน `โอนเงินสําเร็จ` ได้หลังเพิ่ม chroma variant; confidence 94 |
| ยอด eligible ของ `chatv3 (64).jpg` | หน้า 1 ได้ 100/100 และยอด 10,000 บาท; หน้า 3 ไม่รวมยอด |
| Persistence หลัง reload | คะแนนและยอดของเคสนี้ยังอยู่หลัง reload |
| Trace ของการอ่าน | มีภาพ mask พิกัด confidence และตรวจ hash ตรง |
| Human review | เคสนี้คง `review_required`, ไม่ยืนยันรายการอัตโนมัติ |
| Build/service | เคย promote/restart สำเร็จและเปิดเว็บทดสอบจริงได้ ไม่รับรอง runtime ปัจจุบันโดยไม่มี recheck |

หลักฐานหลักวันที่ 6 พฤศจิกายน 2026:

- [report.json](For%20Test%20Results/status-chroma-e2e-20261106/report.json)
- [ภาพหลัง reload](For%20Test%20Results/status-chroma-e2e-20261106/ui-after-reload.png)
- [trace.json](For%20Test%20Results/status-chroma-e2e-20261106/trace.json) — ไฟล์ใหญ่และมีข้อมูลอ่อนไหว อ่านเฉพาะ fields ที่จำเป็น

ผลผ่านของเคสนี้ไม่ใช่ผลรับรอง exact ทุก field ทุกภาพ ทุกธนาคาร หรือทั้งระบบ enterprise

## 6. ลำดับงานที่เสนอ

1. **ล็อกผลปลายทางและชุดทดสอบ:** ระบุ scope, fixtures, ground truth และ expected UI/JSON/export ให้แน่นอนก่อนเพิ่มเครื่องมือ
2. **ปิดการสื่อความมั่นใจเกินหลักฐาน:** แยก detection/presence/recognition และทำ quality gate ให้ตรงความหมาย
3. **พิสูจน์ state และยอด:** edit/confirm/unconfirm/dedup/reprocess/reload/export ต้องได้ผลตรงกัน
4. **ปิด coverage ของภาพจริง:** ภาพสลิปเดี่ยว ภาพแชทยาว ธนาคาร/คุณภาพต่างกัน และ negative cases ตาม inventory ที่ตกลง
5. **ทำ runtime และรายงานให้ตามงานล่าสุด:** run/build identity, heartbeat, resume, smoke หลัง promote/reboot และเอกสารสถานะ
6. **ลด coupling ตามปัญหาที่พิสูจน์:** แยกโมดูลทีละขอบเขตโดยมี regression ไม่ refactor ใหญ่เพื่อความสวยของโค้ดอย่างเดียว
7. **ขยายการรับรองเมื่อมีหลักฐาน:** export ทุกชนิด, backup/migration, งานทีม และกฎหมายฉบับปัจจุบันตามขอบเขตที่อนุมัติ

ลำดับนี้ไม่ใช่การขอให้ผู้ใช้สั่งทีละขั้น เอเจนต์ควรทำส่วนที่ได้รับอนุญาตต่อเนื่องจนถึงผลปลายทาง หยุดเฉพาะเมื่อขาดข้อมูล/สิทธิ์หรือมี blocker ภายนอกจริง

## 7. Definition of Done สำหรับปิด debt/blocker

- มี input และ acceptance criteria ชัด ไม่ใช้คำว่า “ทุกภาพ” โดยไม่มีขอบเขต
- มีหลักฐานสาเหตุหรือ reproduction ก่อน patch
- มี regression ที่จับความผิดเดิม และผลทดสอบหลังแก้
- ตรวจเส้นทางจริงจาก input ถึงผลที่ผู้ใช้เห็น/นำไปใช้ ไม่หยุดที่ build หรือ helper test
- ข้อมูลใน UI/state/JSON/export ที่เกี่ยวข้องสอดคล้องกัน
- เปิดต้นฉบับ/พิกัด/hash/provenance ได้ตามขอบเขต ไม่ให้ derived แทน original
- ไม่เปลี่ยน unknown/conflict เป็น confirmed เอง
- บันทึก build/run identity, screenshot และ trace โดยไม่เผยข้อมูลอ่อนไหว
- ถ้ายังทดสอบไม่ได้ ต้องคงสถานะ Unverified พร้อม blocker ไม่ปิดรายการเพื่อให้รายงานดูสำเร็จ
- อัปเดตเอกสารสถานะให้ไม่ขัดกับหลักฐานใหม่

## 8. เอกสารประกอบ

- [APP_FEATURES.md](APP_FEATURES.md) — ความสามารถที่พบและข้อจำกัด
- [UI_UX_DESIGN_BLUEPRINT.md](UI_UX_DESIGN_BLUEPRINT.md) — หน้าจอ/components และ state semantics
- [SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md) — workspace/runtime หลัก
- [PROJECT_FLOW.md](PROJECT_FLOW.md) — data flow เดิม ต้องอ่านร่วมกับหลักฐานใหม่
- [PROJECT_STATUS.md](PROJECT_STATUS.md) — snapshot เก่า ไม่ใช้เป็นสถานะล่าสุดเพียงแหล่งเดียว

**งานรอบนี้เป็นการเพิ่มเอกสารเท่านั้น ไม่ได้แก้โค้ด ปิด debt รัน E2E ใหม่ เปลี่ยน dependency หรือ deploy ระบบ**
