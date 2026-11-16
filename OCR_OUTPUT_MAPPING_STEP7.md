# Step 7 — OCR Output Mapping และ Memo Integration

## ผลที่เพิ่ม

- Typhoon: รองรับ choices/message.content ที่เป็น Markdown, natural_text, structured slip JSON และ flat bank/amount/datetime/ref/sender/receiver รวมทั้ง normalized envelope เดิม
- OpenThai: รองรับ raw string, iApp text array, Markdown/pages/blocks, components และ Hugging Face generated_text
- mapTyphoonCandidates/mapOpenThaiCandidates คืน candidate arrays โครงสร้างเดิม โดย cropDataUrl จะเติมจาก canvas ฝั่ง browser
- โครงสร้าง field ยังคงเป็น data.bank, data.transaction.amount/date/time/reference_no, data.sender/receiver ไม่มีการเปลี่ยน UI contract เป็น flat fields
- แยกจำนวนเงินจากค่าธรรมเนียม ไม่ใช้ fee 0 แทน amount วันที่สองหลักไม่เดาปี ถ้าค่าชนกันให้ null พร้อม conflict warning
- ชื่อ/ตัวย่อ/ดอกจันเก็บตามข้อความ provider ไม่ผ่าน name-normalizer รุ่นเก่าสำหรับ heuristic candidates

## ความหมายของพิกัดและ review

Raw Text ไม่มีพิกัด จึงไม่มีการสร้างตำแหน่ง field ขึ้นเอง Candidate ที่มาจาก raw single-slip ใช้ bounds ของภาพ input ทั้งใบเป็นขอบเขต crop เท่านั้น ไม่อ้างว่าเป็นกรอบสลิปที่ตรวจพบ Trace objectBounds ว่าง, visualCropEvidence/acceptedByCandidatePolicy เป็น false และ confidence ของ heuristic fields เป็น 0

ถ้า iApp ส่ง block bbox พร้อมขนาดหน้า จะ map กลับพิกัด input ตามสัดส่วนจริงและเก็บเป็น uncertain OCR boxes ไม่ยืนยันว่าเป็นกรอบ field ที่ถูกต้อง

ทุก candidate คง review_required และ _fallback_meta.needs_human_review ไม่ยืนยันเอง ข้อความที่ไม่ใช่สลิปไม่สร้าง candidate, CHAT input/หลายสลิปหรือหลายหน้าไม่เปิด automatic long-chat detection

## Memo

OpenThai native output ทั้งหมดเก็บใน transaction.note และ raw_text โดยไม่ตัดข้อความ ขยาย schema note จาก 1,000 เป็น 50,000 ตามผู้ใช้อนุมัติ หากเกินให้ OCR_MEMO_TOO_LONG แทนการ truncate

แก้เฉพาะ merge path เพื่อให้ QR ไม่ทำ Memo ของ OpenThai หาย และไม่ให้ QR bank unknown ทับ bank proposal ที่มีในข้อความ provider โดยยังคง confidence 0/รอตรวจ ข้อมูลเดิมและ IndexedDB schema/version ไม่เปลี่ยน

Memo UI มี max-height, overflow-y:auto, whitespace preservation และตัดบรรทัดไม่ล้นกรอบ แสดงเป็นข้อความปกติ ไม่ render Markdown/HTML เป็น executable markup

## Legal Signal

เพิ่ม wrapper evaluateLegalSignals และสายป้อน Memo เข้าตัว matchLegalSignalsInText เดิม ไม่แก้ matcher/Dictionary ข้อความยังเป็น review lead ไม่ใช่ข้อสรุปกฎหมาย และ hit จาก Memo ที่ไม่มีพิกัดแสดงว่าไม่ทราบพิกัด ไม่ใส่ตัวเลขสมมติ

Cache จำกัด 16 ข้อความ และใช้ WeakMap ตาม data object เพื่อไม่สแกน Memo เดิมซ้ำเมื่อ state อื่นเปลี่ยน การทดสอบ 5 ข้อความ ข้อความละ 50,000 ตัวอักษรพบคำจาก Dictionary ที่ท้ายข้อความครบ ใช้ประมาณ 34–37 ms ครั้งแรก และ 0.009–0.021 ms เมื่อ cache ในเครื่องทดสอบ ไม่ใช่ benchmark 500 ภาพหรือหลาย Memo พร้อมกัน

## หลักฐานการทดสอบ

- Mapper-specific 13 tests ผ่าน รวม raw formats, masked names, amount/fee conflicts, coordinates, 1,500/50,000-character Memo, legacy serializer round-trip, native JSON และ Legal Signal
- ชุดกว้าง 95 tests: 94 ผ่าน, 1 ไม่ผ่านใน evidence-queue-persistence.test.mjs ชื่อ `preserves exact recipient evidence and never groups records by matching amounts`: คาดยอด 2100/50/50 จาก incomplete records แต่ calculation gate ให้ 0/0/0 รันแยกโดยไม่โหลด Mapper ก็ล้มเหลวเหมือนกัน ไม่ได้เปลี่ยนการคำนวณหรือ persistence เพื่อให้ assertion นี้ผ่าน
- TypeScript, targeted ESLint และ Production preview build ผ่าน
- Browser จริง: ใช้ For Test/Done/A4_IMG_ (1).PNG และจำลองเฉพาะ provider native text เพื่อพิสูจน์ wiring ไม่ใช่ความแม่นยำ OCR ของ provider
- Raw Memo 6,998 ตัวอักษรอยู่ครบใน UI/JSON, เลื่อนได้, ไม่หายหลัง reload, มี Memo Legal Signal, masked sender คงเดิม, needsReview=true/isConfirmed=false, ไม่มี page error
- ไม่ใช้ key จริง ไม่ส่งภาพไป provider, เปิด preview 3462 ชั่วคราวแล้วปิด ไม่ restart/promote 3461 หรือ 3450
- หลักฐานอยู่ For Test Results/output-mappers-step7-20261116/

## สิ่งที่ยังไม่ใช่ผลผ่าน

ยังไม่มี live-provider OCR E2E ของ Typhoon/OpenThai และยังไม่รับรอง exact ทุก field การทดสอบ browser ใช้ native provider response จำลองเท่านั้น ความถูกต้องของ API credentials/endpoint/model และคุณภาพ OCR จริงต้องพิสูจน์แยกบน provider จริง
