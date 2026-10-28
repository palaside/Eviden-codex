# Systematic Debugging Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `systematic-debugging` before proposing or applying any fix for bugs, test failures, or unexpected behavior. Do not modify production code until root cause is identified and recorded.

**Goal:** กำหนดขั้นตอนบังคับก่อนแก้ bug หรือพฤติกรรมผิด เพื่อป้องกันการแก้มั่ว แก้ปลายเหตุ หรือซ่อนปัญหาที่แท้จริง

**Architecture:** เอกสารนี้เป็น debugging gate ที่ต้องใช้ก่อน patch แก้ bug ทุกครั้ง โดย trace ข้อมูลจาก `Input -> State -> Transformation -> Output -> User-visible Result` แล้วระบุ root cause ก่อนเขียน test และก่อนแก้โค้ดจริง

**Tech Stack:** Planning/debugging checklist only; target implementation context is Next.js, React state, TypeScript utilities, OCR pipeline, PDF export, SFX packaging, browser UI

## Global Constraints

- ห้ามแก้โค้ดก่อนระบุ root cause
- ห้ามเดา fix จากอาการบน UI อย่างเดียว
- ห้ามแก้หลายจุดพร้อมกัน
- ห้ามใช้คำว่า `น่าจะแก้ได้` แทนหลักฐาน
- ถ้ายัง reproduce ไม่ได้ ต้องบอกว่า `ยัง reproduce ไม่ได้`
- ถ้ายังไม่รู้ root cause ต้องบอกว่า `Unknown`
- ถ้าแก้ผิดทางเกิน 3 ครั้ง ต้องหยุดและตั้งคำถามเชิง architecture

---

## When To Use This Gate

ใช้ทันทีเมื่อเจออาการเหล่านี้:

- [ ] OCR ตรวจไม่พบสลิปที่แปะในแชท
- [ ] OCR อ่านยอดเงินผิดหรือตกหล่น
- [ ] Card 1 หรือ Card 2 คิดยอดผิด
- [ ] ตารางยอดไม่ตรงกับสลิป
- [ ] ตารางเรียงวันเวลาผิด
- [ ] A4 page mapping ผิดหน้า
- [ ] PDF export แล้วไม่มีไฟล์จริง
- [ ] กรอก password แล้ว PDF ไม่ล็อกจริง
- [ ] SFX บอกว่าสร้างแล้วแต่ไม่มีไฟล์จริง
- [ ] SFX เปิดแล้วไม่เห็น logo/text/disclaimer ตาม reference
- [ ] แชทโดนตัดภาพผิดหน้า
- [ ] Legal triage ใช้คำฟันธงหรือจัดมาตราผิด confidence

## Four-Phase Debugging Flow

### Phase 1: Root Cause Investigation

**ต้องทำก่อนเสนอ fix**

- [ ] ระบุอาการที่เห็นแบบเป็นกลาง
- [ ] ระบุ expected behavior
- [ ] ระบุ actual behavior
- [ ] reproduce ด้วยขั้นตอนที่ชัดเจน
- [ ] อ่าน error/log/output ที่เกี่ยวข้อง
- [ ] ตรวจ recent changes เฉพาะไฟล์/โมดูลที่เกี่ยวข้อง
- [ ] trace data flow:

```text
Input -> State -> Transformation -> Output -> User-visible Result
```

- [ ] ระบุ boundary ที่ข้อมูลเริ่มผิด
- [ ] ถ้ายังไม่รู้ ให้เพิ่ม diagnostic แบบ scoped เฉพาะ boundary นั้น

### Phase 2: Pattern Analysis

- [ ] หา working example ในระบบเดียวกัน
- [ ] เทียบ broken path กับ working path
- [ ] ระบุความต่างทีละข้อ
- [ ] ตรวจว่ามี shared utility หรือ state คนละชุดหรือไม่
- [ ] ตรวจว่า UI แสดงจาก state เดียวกับ export/report หรือไม่

### Phase 3: Hypothesis And Minimal Test

- [ ] เขียน hypothesis เดียว เช่น `รหัสอยู่ใน React state แต่ export ใช้ window.print จึงไม่มี encryption`
- [ ] ออกแบบวิธีพิสูจน์ hypothesis ด้วยการตรวจจุดเดียว
- [ ] ห้ามเปลี่ยนหลายตัวแปรพร้อมกัน
- [ ] ถ้า hypothesis ผิด ให้กลับ Phase 1 ไม่เพิ่ม fix ซ้อน

### Phase 4: Fix After Root Cause

- [ ] เขียน failing test หรือ reproduction script ก่อนแก้ ถ้าเป็น logic
- [ ] แก้เฉพาะ root cause
- [ ] run test หรือ manual flow ที่พิสูจน์อาการเดิม
- [ ] ตรวจว่าไม่กระทบ output ใกล้เคียง
- [ ] รายงาน Done, Checked, Untested, Risks

---

## Bug-Specific Trace Templates

### Case A: PDF Password ไม่ล็อกจริง

**Symptom:** ผู้ใช้กรอกรหัสใน UI แล้ว export PDF แต่ลูกค้าเปิดไฟล์แล้วไม่เจอ prompt ใส่รหัส

**Trace Required:**

```text
Input:
  Password field value
State:
  React state / form state that stores password
Transformation:
  Export handler receives password or not
Export Function:
  Real PDF generator or window.print / browser preview
PDF Generation:
  Encryption API called or not
Output File:
  Exported PDF has encryption metadata or not
User-visible Result:
  PDF viewer asks for password or opens directly
```

**Likely Root Cause Examples To Prove Or Disprove:**

- [ ] Password exists only in UI state
- [ ] Export handler never receives password
- [ ] Export uses `window.print()` instead of real PDF encryption
- [ ] PDF library generates unencrypted PDF
- [ ] Password applies to SFX archive, not PDF

**Allowed Fix Only After Root Cause:**

- แยก Preview ออกจาก Real Encrypted Export
- แยก PDF password state ออกจาก SFX password state

### Case B: OCR ตรวจไม่พบสลิปในภาพแชท

**Symptom:** ภาพแชทมีสลิปแปะอยู่ แต่ระบบไม่สร้าง transaction/detected person จากสลิปนั้น

**Trace Required:**

```text
Input:
  Uploaded chat image/PDF page
Preprocess:
  Image conversion, scaling, crop, contrast, background cleanup
Detection:
  Bubble detection / slip candidate detection
OCR:
  Text extraction result
Parsing:
  Amount/date/ref/person extraction
State:
  EvidenceItem / TransactionSummary created or missing
UI:
  Left detected person list and right summary cards
```

**Likely Root Cause Examples To Prove Or Disprove:**

- [ ] Preprocess ลบส่วนสลิปออก
- [ ] Slip candidate detector มองเป็น chat bubble ธรรมดา
- [ ] OCR อ่าน text ได้แต่ parser ไม่รู้ว่าเป็นสลิป
- [ ] Parser ต้องการ reference id แต่สลิปบางใบไม่มี/อ่านไม่ได้
- [ ] State ถูกสร้างแต่ UI filter ตัดออก

**Allowed Fix Only After Root Cause:**

- เพิ่ม slip candidate layer
- เพิ่ม confidence/review queue
- เพิ่ม parser fallback ที่ไม่ confirm อัตโนมัติเมื่อหลักฐานไม่ครบ

### Case C: ตารางยอดไม่ตรง

**Symptom:** ยอดในตารางไม่ตรงกับยอดรวมบน cards หรือไม่ตรงกับสลิปจริง

**Trace Required:**

```text
Input:
  Raw transactions from OCR/slip parser
Normalization:
  TransactionSummary records
Dedup:
  Reference-id duplicate handling
Aggregation:
  Total / POI / person summary
Table Builder:
  Customer-facing rows
UI:
  Table display and card display
```

**Likely Root Cause Examples To Prove Or Disprove:**

- [ ] Table ใช้ raw transactions แต่ cards ใช้ deduped transactions
- [ ] Reference-id dedup ถูกใช้ใน card แต่ไม่ใช้ใน table
- [ ] Amount ถูก format เป็น string ก่อนรวมยอด
- [ ] Date sorting ทำให้ผู้ใช้คิดว่ายอดหายเพราะลำดับไม่ตรง
- [ ] POI checkbox ถูก default selected โดยไม่ตั้งใจ

**Allowed Fix Only After Root Cause:**

- รวม calculation source ให้เป็น utility เดียว
- เพิ่ม test สำหรับ dedup/aggregation/sort

### Case D: Card 1 / Card 2 คิดยอดผิด

**Symptom:** Card 1 total หรือ Card 2 target total ไม่ตรงกับ expectation

**Trace Required:**

```text
Input:
  Detected transactions and detected persons
State:
  selected POI checkboxes
Calculation:
  total amount / selected POI amount
Render:
  Card 1 and Card 2 display
Report:
  Executive summary values
```

**Likely Root Cause Examples To Prove Or Disprove:**

- [ ] Card 1 รวม raw slips แทน deduped transactions
- [ ] Card 2 รวมทุกคนแทน selected POI only
- [ ] Checkbox default selected โดยไม่ตั้งใจ
- [ ] Report ใช้ calculation คนละชุดกับ card

**Allowed Fix Only After Root Cause:**

- ทำ card metrics utility กลาง
- test ว่า Card 2 = 0 เมื่อไม่มี POI selected

### Case E: SFX บอกว่าสร้างแล้วแต่ไม่มีไฟล์จริง

**Symptom:** UI แสดงว่าสร้าง SFX สำเร็จ แต่ไม่มีไฟล์จริง หรือไฟล์เปิดไม่ได้

**Trace Required:**

```text
Input:
  Export package request
State:
  Selected files, password, branding config
Package Builder:
  SFX script/config invoked or not
File System:
  Output path exists or not
Output:
  SFX file size and manifest
User-visible Result:
  Customer opens/extracts package
```

**Likely Root Cause Examples To Prove Or Disprove:**

- [ ] UI แสดง success จาก mock/alert
- [ ] Backend command ไม่ถูกเรียก
- [ ] WinRAR path/config missing
- [ ] Output path ผิด
- [ ] Package created but missing required files

**Allowed Fix Only After Root Cause:**

- แยก build status จริงจาก UI status
- ตรวจ output file existence/size/manifest ก่อน success

### Case F: แชทโดนตัดภาพผิดหน้า

**Symptom:** ภาพแชทถูกตัดลง A4 ผิดหน้า หรือ header/page mapping ไม่สัมพันธ์กับภาพ

**Trace Required:**

```text
Input:
  Chat image dimensions / PDF page dimensions
Layout:
  A4 canvas size, scaling, slicing rules
Mapping:
  Source image segment -> A4 page index
Render:
  A4 preview page
Header:
  MODE / CORROBORATED / PAGE label
Navigation:
  Previous/next page controls
```

**Likely Root Cause Examples To Prove Or Disprove:**

- [ ] Slice height calculation ผิด
- [ ] Header/footer margin ไม่ถูกหักออกจาก usable area
- [ ] Page index เริ่มที่ 0 แต่ render เป็น 1
- [ ] Mapping ใช้ upload index แทน A4 page index

**Allowed Fix Only After Root Cause:**

- รวม page mapping utility
- test source segment to A4 page index

## Required Debug Report Format

ทุกครั้งที่ใช้ debugging gate ต้องรายงานแบบนี้ก่อนเสนอ fix:

```text
Symptom:
Expected:
Actual:
Reproduction:
Trace:
- Input:
- State:
- Transformation:
- Output:
- User-visible result:
Evidence:
Root Cause:
Hypothesis tested:
Fix proposal:
Verification plan:
- Tier 1:
- Tier 2:
- Tier 3:
- Tier 4:
Blocked / Unknown:
```

## Stop Conditions

- [ ] Reproduce ไม่ได้
- [ ] ยังไม่รู้ว่าข้อมูลเริ่มผิดที่ boundary ไหน
- [ ] ต้องแตะ export/password/SFX โดยยังไม่ได้อนุมัติ
- [ ] ต้องเพิ่ม dependency
- [ ] ต้องเปลี่ยน schema หรือ public output contract
- [ ] ลอง fix ไปแล้ว 3 ครั้งแล้วยังไม่จบ
- [ ] Root cause ชี้ว่า architecture เดิมผิด ต้องกลับมาคุยก่อน

## Relationship To Other Plans

- ใช้ก่อน `Patch Slicing Execution Checklist` เมื่อ patch นั้นเป็น bug fix
- ใช้คู่กับ `TDD Risk Gate` หลังเจอ root cause แล้วต้องเขียน failing test
- ใช้ก่อนแก้ OCR, PDF password, table totals, cards, SFX, A4 mapping, legal scoring
- ไม่แทนที่ verification; หลัง fix ยังต้องใช้ Tier 1-4 เหมือนเดิม

## Example Command

```text
ใช้ systematic-debugging ตรวจปัญหา PDF password
อาการ: กรอกรหัสแล้ว export PDF แต่สงสัยว่า PDF ยังไม่ล็อกจริง
ให้ trace Input -> State -> Export Function -> PDF Generation -> Output File -> User-visible Result
ห้ามแก้โค้ดจนกว่าจะระบุ root cause
ถ้าพบว่า export ใช้ window.print หรือ preview path ให้รายงานเป็น root cause ก่อนเสนอ fix
```

## Self-Review

- Spec coverage: ครอบคลุมอาการที่ผู้ใช้ระบุ ได้แก่ OCR ไม่พบสลิป, PDF password ไม่ล็อก, ตารางยอดไม่ตรง, Card 1/2 ผิด, SFX ไม่มีไฟล์จริง, แชทตัดผิดหน้า
- RCA discipline: บังคับ trace input/state/transformation/output ก่อน fix
- Conflict alignment: สอดคล้องกับ TDD Risk Gate และ Patch Slicing Checklist
- Placeholder scan: ไม่มี placeholder ที่ต้องเดาเอง
- Unknown: ยังไม่ได้ตรวจโค้ดจริงหรือ reproduce bug จริง
- Untested: ยังไม่ได้ run app, test, browser, PDF, SFX หรือ OCR fixture
