---
name: Problem_solving
description: สกิลแก้ปัญหาเชิงวิศวกรรมขั้นสูงแบบถอนรากถอนโคน (Root Cause Corrective Action - RCCA & Benchmark Hunting) รวมพลัง 6 เสาหลัก: ตีกรอบปัญหา (Analytical Containment), แกะรอยสายพานข้อมูล (Systematic Tracing), ขุดรากเหง้าสาเหตุ (5-Whys RCA), ควานหารีโปต้นแบบบน GitHub (Benchmark Hunting), ผ่าตัดโค้ดแกนหลักถาวร (Permanent Corrective Action - PCA), และสถาปนากลไกป้องกันการเกิดซ้ำ 100% ตลอดกาล (Poka-Yoke Zero-Recurrence)
---

# 🧠 SKILL: Problem_solving (Root Cause Corrective Action — RCCA Protocol)

> **ภารกิจหลักสูงสุด (The Absolute Eradication Mandate):**  
> เปลี่ยนปัญหาที่มองไม่ออก หรือทางตันทางเทคนิค ให้กลายเป็นการแก้ปัญหาที่ **"หายขาดโดยสิ้นเชิง 100% (Zero-Recurrence)"** โดยไม่เดาสุ่ม ไม่ปะผุปลายเหตุ ไม่ใส่ Workaround หลอกตา ควานหาวิธีแก้ที่ดีที่สุดจากระดับสากลบน GitHub แล้วสกัดเฉพาะโค้ดแกนหลัก 100% พร้อมติดตั้งกลไก Poka-Yoke เพื่อให้เป็นไปไม่ได้ที่จะเกิดปัญหาเดิมซ้ำอีกตลอดกาล

---

## 🏛️ 6 เสาหลักของระเบียบวิธี RCCA (The 6-Pillar RCCA Framework)

```
[ปัญหา / อาการผิดปกติ / ข้อผิดพลาด]
       │
       ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 1. Problem Containment & Boundary (ตีกรอบปัญหา + กั้นพื้นที่)          │
│ - สกัด Expected vs Actual ชัดเจนใน 1 ประโยคเชิงวิศวกรรม                 │
│ - ควบคุม Blast Radius ป้องกันผลกระทบข้างเคียงต่อระบบส่วนอื่น              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 2. Systematic Data-Flow Tracing (ไล่สายพานข้อมูล 4 Checkpoints)        │
│ - Input Intake ──► Transformation ──► State Mutation ──► Render/Output │
│ - ชี้พิกัดไฟล์ ฟังก์ชัน และตัวแปรที่ข้อมูลเริ่มเบี่ยงเบนอย่างแม่นยำ      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 3. Root Cause Analysis (RCA 5-Whys + Ishikawa Protocol)                │
│ - แยกแยะ "อาการปลายเหตุ (Direct Symptom)" ออกจาก "รากเหง้า (Root Cause)"│
│ - ขุดลึก 5 ชั้นจนพบความล้มเหลวเชิงตรรกะ สถาปัตยกรรม หรือเรขาคณิต        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 4. Global Benchmark & GitHub Hunting (ควานหาต้นแบบสากล)                │
│ - สกัดโจทย์เป็น Computer Science Standard Problem                       │
│ - สแกนหา Repositories และ RFCs ชั้นนำที่มีการพิสูจน์แล้ว               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 5. Permanent Corrective Action - PCA (ผ่าตัดแก้ถาวร ไร้ขยะ)            │
│ - สกัด Pure Function 10–50 บรรทัด ตัด Library บวมและโค้ดขยะทิ้ง 100%   │
│ - ปรับปรุงตรรกะที่ต้นสายพาน (Root Source) ห้ามใส่ delay/margin แก้ขัด   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 6. Poka-Yoke & Zero-Recurrence (กลไกล็อกป้องกันเกิดซ้ำตลอดกาล)         │
│ - สร้าง Type Assertion, Boundary Lock หรือ Invariant Guard             │
│ - บันทึกบทเรียนลง mistakes.md & behavior.json เพื่อความจำถาวร          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 ขั้นตอนปฏิบัติการ RCCA แบบเข้มข้น 6 สเต็ป (Operational Workflow)

### สเต็ปที่ 1: Problem Containment (ตีกรอบและจำแนกปัญหา)
เมื่อได้รับรายงานบั๊กหรืออาการผิดปกติ ห้ามเริ่มแก้โค้ดทันที ให้จัดทำตารางวิเคราะห์:
1. **Expected Behavior (สิ่งที่ต้องได้)**: ระบบควรทำงานอย่างไร ค่าต้องเป็นเท่าใด
2. **Actual Behavior (สิ่งที่เกิดขึ้นจริง)**: ข้อผิดพลาดคืออะไร แสดง Error ข้อความ หรือค่าเพี้ยนอย่างไร
3. **Problem Taxonomy (จำแนกหมวดหมู่)**:
   - `RACE_CONDITION`: ข้อมูลมาไม่พร้อมกัน / ยอดเงินหายเพราะแย่งกันอัปเดต
   - `GEOMETRY_OVERFLOW`: สระจม / ตัวหนังสือขี่กัน / Layout บานตกขอบจอ
   - `DATA_MUTATION`: State เดิมถูกเขียนทับ / อาเรย์หายเหลือ 1/1
   - `ENCODING_CORRUPTION`: ตัวอักษรไทยเพี้ยนเป็นภาษาต่างดาวบน Windows/CLI
   - `DEPENDENCY_CONFLICT`: ไลบรารีตีกัน / โค้ดช้าเพราะผ่านหลายชั้นเกินไป

---

### สเต็ปที่ 2: Systematic Troubleshooting (ไล่สายพานข้อมูล 4 จุดตรวจ)
แกะรอยตามท่อส่งข้อมูล 4 จุดตรวจ (Checkpoints):
* **Checkpoint A (Input Intake)**: ข้อมูลที่ส่งเข้ามา (รูปภาพ, ฟอร์ม, อาร์เรย์) ถูกต้อง ครบถ้วนหรือไม่?
* **Checkpoint B (Transformation)**: ฟังก์ชันคำนวณ/สกัด (Regex, OCR, Slicing) คืนค่าตรงสเปกไหม?
* **Checkpoint C (State Management)**: ตัวแปร State (Store, Reducer, useState) รับค่าและเก็บรักษาความคงสภาพหรือไม่?
* **Checkpoint D (Render / Output)**: หน้าจอ Canvas, DOM, หรือไฟล์ PDF วาดค่าออกมาผิดพลาดที่บรรทัดใด?

---

### สเต็ปที่ 3: Root Cause Analysis (RCA 5-Whys Protocol)
ไล่ล่าหาสาเหตุที่แท้จริงด้วยคำถาม "ทำไม" 5 ชั้น เพื่อแยก **อาการปลายเหตุ** ออกจาก **รากเหง้าเชิงระบบ**:
* *ตัวอย่าง*:
  1. ทำไมหน้าสำนวนคดีถึงแสดง `PAGE : 1 / 1` ทั้งที่อัปโหลดสลิป 3 ใบ? → เพราะใน `processedPages` มีแค่ object เดียว
  2. ทำไมถึงมีแค่ object เดียว? → เพราะในลูปประมวลผลไปเรียก `evidenceStore.processedPages = [pageObj]`
  3. ทำไมถึงไปเขียนทับแทนที่จะต่อท้าย? → เพราะโค้ดเดิมเขียนเพื่อรองรับภาพเดี่ยว ไม่ได้ทำ Multi-Page Compiler
  4. ทำไมไม่เกิดตอนทดสอบแรกเริ่ม? → เพราะตอนแรกทดสอบด้วยภาพตัวอย่างใบเดียว
  5. **Root Cause**: ขาดฟังก์ชัน Ingestion Aggregator ที่รวบรวม Array หน้ากระดาษสะสมข้ามไฟล์
  6. **Permanent Fix**: สร้าง `compileEvidenceDossier()` รวมทุกสลิปเป็น `PAGE : 1 / N` ต่อเนื่อง หายขาด 100%

---

### สเต็ปที่ 4: Global Benchmark & GitHub Hunting (ควานหาต้นแบบสากล)
1. แปลงโจทย์ปัญหาเป็นภาษาอังกฤษระดับมาตรฐาน Computer Science เช่น:
   - สลิปไม่มี QR และภาพเบลอ → `low-quality receipt ocr regex parser best practice`
   - แชทส่งสลับไปมาไม่พร้อมกัน → `staged ingestion buffer race condition queue`
   - หน้าจอหดสั้นกองข้างล่าง → `css flexbox full viewport height sticky footer layout`
2. ค้นหาคลังโค้ดบน GitHub, RFCs, หรือ W3C Standards
3. สรุป **Ref.** ประกอบด้วย:
   - **Repository / Standard**: ชื่อรีโปหรือสเปกมาตรฐาน
   - **Core Concept**: อัลกอริทึมที่เขาใช้แก้ปัญหา (เช่น Pure Reducer, Virtual Scroll, Lookahead Buffer)

---

### สเต็ปที่ 5: Permanent Corrective Action - PCA (ผ่าตัดแก้ถาวร ไร้ขยะ)
1. **กฎ Zero-Bloat**: ห้ามสั่ง `npm install` หรือ `pip install` ทั้งแพ็กเกจของเขาเข้ามาในโปรเจกต์
2. สกัดเฉพาะโค้ดแกนหลัก (Pure Function) ความยาว 10–50 บรรทัด
3. ตัดโค้ดส่วนเกินทิ้ง 100% ปรับให้เข้ากับโครงสร้างเดิมของโปรเจกต์
4. **ห้าม Workaround เด็ดขาด**: ห้ามใส่ `setTimeout` หลอกตา, ห้ามขยับ margin มือ, ห้ามกดซ่อน Error ด้วย try-catch เปล่า

---

### สเต็ปที่ 6: Poka-Yoke & Zero-Recurrence (กลไกล็อกป้องกันเกิดซ้ำตลอดกาล)
1. **Poka-Yoke (Mistake-Proofing Guard)**: ติดตั้งตัวล็อกระดับโค้ด เช่น
   - ใส่ Array Check: `Array.isArray(pages) && pages.length > 0`
   - ล็อก Type & Bounds: ป้องกันค่าติดลบหรือ `undefined`
   - Pure ASCII Wrapper: ล็อกสคริปต์ `.ps1`/`.bat` ให้เป็น ASCII 100% ป้องกัน Encoding พังบนทุก Windows
2. **Immortal Knowledge Binding**: บันทึกข้อผิดพลาดและวิธีแก้ลงใน `state/mistakes.md` และ `state/behavior.json` ทันที เพื่อให้ Agent ทุกตัวในอนาคตมีภูมิคุ้มกันถาวร

---

## 💊 ใบสั่งยามาตรฐาน 6 รูปแบบสำหรับ Agent (The 6 Agent Playbooks)

| ประเภทปัญหา | อาการที่พบบ่อย | ใบสั่งยามาตรฐาน (Prescribed Recipe) ที่สั่ง Agent ทำทันที |
| :--- | :--- | :--- |
| **Rx 1: State Desync** | ข้อมูลบน Header, การ์ด, หรือตัวเลขคำนวณไม่ตรงกัน | **สั่ง Agent:** สร้าง Single Source of Truth (SSOT Object) ตัวเดียว แล้วให้ทุก UI Component ผูกผ่าน Event Dispatcher กลาง ห้ามตั้งตัวแปร Local ซ้ำซ้อน |
| **Rx 2: Layout Overflow** | จอเลื่อนตกเฟรม, Stepper ขยายกินที่, สระจม | **สั่ง Agent:** ปรับ CSS Shell เป็น `display: flex; flex-direction: column; height: 100vh;` แล้วใส่ `flex: 1; min-height: 0;` ให้ Main Area จบปัญหากองข้างล่างทันที |
| **Rx 3: Encoding Corruption** | ภาษาไทยเป็นภาษาต่างดาวบน Windows CMD/PowerShell | **สั่ง Agent:** ห้ามฝังภาษาไทยลงในไฟล์ `.bat` หรือ `.ps1` โดยตรง ให้ทำสคริปต์เป็น Pure ASCII 100% แล้วดึงภาษาไทยจาก UTF-8 JSON หรือใช้ Python `sys.stdout.reconfigure(encoding='utf-8')` |
| **Rx 4: Multi-Page Dropping** | อัปโหลดหลายไฟล์แต่แสดงผลแค่หน้า 1/1 | **สั่ง Agent:** ตรวจ Loop Ingestion ทันที อย่าใช้การแทนที่ Array `state = [item]` ให้เปลี่ยนเป็น Aggregate Ingestion `compileEvidenceDossier()` รันหน้า 1..N |
| **Rx 5: Loop Churn Breaker** | Agent ลองแก้สุ่มๆ ไปเรื่อยๆ ไฟล์เดิมซ้ำ 3-4 รอบ | **สั่ง Agent:** สั่งหยุดแก้ทันที! ถอยกลับมาอ่าน Error Log ตัวแรกสุด แล้วทำ 5-Whys ชี้พิกัดบรรทัดเดียว ห้ามแก้หว่าน |
| **Rx 6: Dependency Trap** | ปัญหาแก้ง่ายแต่ Agent จะสั่งลง Library ใหญ่โต | **สั่ง Agent:** บังคับใช้ฟังก์ชัน Pure JavaScript/Python พื้นฐาน (Native Standard Library) ไม่เกิน 20-30 บรรทัด ห้ามเพิ่มแพ็กเกจใหม่ |

---

## 🛠️ โครงสร้างรายงานการแก้ปัญหาแบบ RCCA (RCCA Output Format)

เมื่อสกิลนี้ทำงาน จะส่งมอบรายงานการแก้ไขที่การันตีการหายขาดเสมอ:

```markdown
# 🏛️ ROOT CAUSE CORRECTIVE ACTION (RCCA) REPORT

## 1. Problem Definition & Boundary
- **Expected vs Actual**: [สิ่งที่ควรได้ vs สิ่งที่เกิดขึ้นจริง]
- **Point of Failure**: `[path/to/file:line_number]`
- **Taxonomy**: [RACE_CONDITION | GEOMETRY_OVERFLOW | DATA_MUTATION | ENCODING | DEPENDENCY]

## 2. Root Cause Analysis (RCA 5-Whys)
1. ทำไม... ? ──► [เหตุผลชั้นที่ 1]
2. ทำไม... ? ──► [เหตุผลชั้นที่ 2]
3. ทำไม... ? ──► [เหตุผลชั้นที่ 3]
- **Root Cause ที่แท้จริง**: [ระบุความล้มเหลวระดับตรรกะ/สถาปัตยกรรม]
- **จุดบอดของการปะผุแบบเดิม**: [ทำไมการแก้ปลายเหตุถึงไม่หายขาด]

## 3. Global Benchmark Reference
- **Repo / Standard ต้นแบบ**: [ชื่อ Repo / RFC / อัลกอริทึมสากล]
- **Core Engineering Pattern**: [เทคนิคที่สกัดมาใช้]

## 4. Permanent Corrective Action (PCA)
- **Target File**: `[path/to/file]`
- **Surgical Code Patch**:
  ```[language]
  // โค้ดแกนหลักเฉพาะจุด 10-30 บรรทัด ปราศจากขยะและ Workaround
  ```

## 5. Poka-Yoke & Zero-Recurrence Assurance
- **กลไกล็อกป้องกันเกิดซ้ำ**: [Type check / Boundary assert / Schema lock]
- **ผลการพิสูจน์ (Proof of Eradication)**: [หลักฐานการทดสอบว่าหายขาด 100%]
- **Immortal State Log**: [บันทึกลง state/mistakes.md เรียบร้อยแล้ว]
```

---

## 🚫 ข้อห้ามเด็ดขาด (Anti-Patterns)
1. ห้ามแนะนำวิธีแก้แบบ "ลองเปลี่ยนดูครับ" หรือสุ่มตัวเลขโดยไม่อธิบาย Root Cause
2. ห้ามใช้ Workaround เช่น `setTimeout` หรือซ่อน error ด้วย `try-catch` เปล่า
3. ห้ามสั่งติดตั้ง Library ขนาดใหญ่เพื่อแก้ปัญหาตรรกะเพียง 20 บรรทัด
4. ห้ามแก้โค้ดลามไปยังคอมโพเนนต์อื่นที่ไม่เกี่ยวข้อง
5. ห้ามประกาศว่า "แก้เสร็จแล้ว" หากยังไม่ได้ติดตั้งกลไก Poka-Yoke ป้องกันการเกิดซ้ำ
