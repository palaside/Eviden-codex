# Implementation Sequence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` only after the user explicitly approves implementation. Do not use subagents unless the user explicitly authorizes it. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** จัดลำดับทำก่อนหลังของทุกแผนให้เป็น patch order ที่ปลอดภัย โดยทำ source of truth ก่อน UI, report, export และ packaging

**Architecture:** แผนนี้ใช้หลัก dependency-first development: เริ่มจากคำและนิยามกลาง ต่อด้วย data model, extraction/calculation, UI display, report/export, packaging แล้วจบด้วย verification แต่ละเฟสต้องมี output ที่ตรวจได้เอง และห้ามข้ามไปทำสิ่งที่เห็นบนจอก่อนถ้าข้อมูลต้นทางยังไม่นิ่ง

**Tech Stack:** Planning document only; target implementation context is Next.js, React, TypeScript, Tailwind CSS, OCR/text extraction, PDF export, SFX packaging

## Global Constraints

- ห้ามลงมือเขียนโค้ดจากเอกสารนี้
- ห้ามเริ่มจาก UI ที่อยากเห็นก่อน ถ้า source of truth ยังไม่พร้อม
- ห้ามทำ export/SFX ก่อน report/table/schema นิ่ง
- ห้ามทำ legal triage ก่อน OCR/text extraction น่าเชื่อถือพอ
- ห้ามอ้างว่า password/export/SFX ใช้งานได้จนกว่าจะทดสอบ real user flow
- ทุก patch ต้องมีขอบเขตเล็ก ตรวจได้ และ rollback ได้

---

## Core Principle

ลำดับที่ถูกต้องไม่ใช่ลำดับที่ “เห็นผลบนหน้าจอไวที่สุด” แต่เป็นลำดับที่ “ข้อมูลต้นทางนิ่งก่อน แล้วค่อยแสดงผล”

```text
คำ/นิยามกลาง
  -> Data Model
  -> Core Extraction / Calculation
  -> UI Display
  -> Report / Export
  -> Packaging
  -> Verification
```

ถ้าทำกลับกัน เช่น ทำ SFX ก่อน OCR ยังไม่นิ่ง ผลลัพธ์คือแพ็กเกจดูสวย แต่ข้อมูลข้างในอาจผิดหรือตกหล่น

## Recommended Patch Order

| ลำดับ | Patch | ทำไมต้องมาก่อน | ทำแล้วปลดล็อกอะไร | ห้ามทำพร้อมกับ |
|---:|---|---|---|---|
| 1 | Neutral Vocabulary Patch | กระทบทุกจุดของ UI/report/legal | ทำให้ภาษาในระบบเป็นกลางก่อนขยายเอกสาร | Legal triage เต็มชุด |
| 2 | Evidence Data Model Patch | เป็น source of truth ให้ทุก output | Cards, table, report, export ใช้ข้อมูลชุดเดียวกัน | UI card redesign แบบเต็ม |
| 3 | OCR / Slip-In-Chat Reliability Patch | ข้อมูลต้นทางต้องครบก่อนสรุป | Metrics, detected persons, legal text, table | Export/SFX |
| 4 | Core Calculation Patch | ต้องคำนวณยอด/POI/dedup/page mapping ให้ถูกก่อนโชว์ | Cards และ reports | Packaging |
| 5 | Summary Cards Patch | เป็น UI สรุปจากข้อมูลที่นิ่งแล้ว | Executive summary filtering | Legal triage เต็มชุด |
| 6 | Final 12-Column Table Patch | ใช้ schema และ calculation ที่พร้อมแล้ว | Modal, report table, CSV/PDF table | SFX |
| 7 | Legal Triage Patch | ใช้ OCR text และ transactions ที่น่าเชื่อถือขึ้น | Legal context report/modal | OCR rewrite |
| 8 | PDF Export + Password Patch | ต้องรอ report/table/document content นิ่ง | Real encrypted PDF flow | SFX password รวม |
| 9 | SFX Packaging Patch | เป็นขั้นส่งมอบหลัง export พร้อม | Customer delivery package | OCR/table schema changes |
| 10 | JEV Readiness Patch | ใช้ข้อมูลที่ normalized แล้วเพื่อประเมิน readiness | Checklist, warning, confidence | OCR extraction core |
| 11 | End-To-End QA Patch | ตรวจทั้งระบบหลังทุกส่วนต่อกัน | Release/customer delivery | Feature additions |

## Patch 1: Neutral Vocabulary Patch

**Purpose:** ปรับภาษาให้เป็นกลางก่อน เพราะถ้อยคำไปโผล่ในทุกเอกสารและทุก output

**Preconditions:**

- [ ] มีรายการคำแรงที่ต้องแทนที่ เช่น `คดี`, `สำนวนศาล`, `ผู้ต้องหา`, `คดีอาญา`
- [ ] มี vocabulary map ที่ตกลงแล้ว เช่น `เรื่องตรวจสอบ`, `แฟ้มหลักฐาน`, `เอกสารประกอบ`, `บุคคลที่ตรวจพบ`

**Allowed Scope:**

- [ ] UI labels
- [ ] Report preview labels
- [ ] Modal titles
- [ ] Default reference wording

**Blocked Scope:**

- [ ] ห้ามแก้ OCR logic
- [ ] ห้ามแก้ calculation
- [ ] ห้ามแก้ export/password/SFX

**Exit Criteria:**

- [ ] ไม่มีคำแรงใน header/panel/card/modal/report preview จุดสำคัญ
- [ ] Legal wording ยังถูกจำกัดไว้เฉพาะบริบทเบื้องต้น

## Patch 2: Evidence Data Model Patch

**Purpose:** สร้าง source of truth กลางก่อนให้ cards, table, report, export ใช้ข้อมูลเดียวกัน

**Preconditions:**

- [ ] ผ่าน Patch 1 แล้ว หรืออย่างน้อย vocabulary กลางถูกล็อก
- [ ] รู้ current state ที่ upload/OCR/cards/table ใช้อยู่

**Canonical Objects:**

- [ ] `EvidencePackage`: ชุดงาน/แฟ้มหลักฐานหนึ่งชุด
- [ ] `EvidenceItem`: ไฟล์หรือหน้าหลักฐานหนึ่งรายการ
- [ ] `TransactionSummary`: ธุรกรรมที่สกัดได้หนึ่งรายการ
- [ ] `DetectedPersonSummary`: บุคคลที่ตรวจพบและยอดรวม
- [ ] `SourceReference`: จุดอ้างอิงว่าเจอข้อมูลจากไฟล์/หน้า/A4 ไหน

**Required Fields For `TransactionSummary`:**

- [ ] transfer date/time
- [ ] sender name
- [ ] sender bank
- [ ] amount with satang
- [ ] receiver name
- [ ] receiver bank
- [ ] memo/note
- [ ] bank reference id
- [ ] evidence page reference
- [ ] relationship status
- [ ] confidence
- [ ] review status

**Blocked Scope:**

- [ ] ยังไม่ redesign cards
- [ ] ยังไม่ redesign table
- [ ] ยังไม่ export ใหม่

**Exit Criteria:**

- [ ] ระบุได้ว่าทุก UI/output จะอ่าน field ไหนจาก object ไหน
- [ ] field ที่ยังไม่รู้ต้องถูก mark เป็น `Unknown` ไม่เดา

## Patch 3: OCR / Slip-In-Chat Reliability Patch

**Purpose:** ลดการตกหล่นของสลิป โดยเฉพาะสลิปที่แปะอยู่ในภาพแชทหรือพื้นหลังลายเยอะ

**Preconditions:**

- [ ] มี data model กลางรองรับ output จาก OCR
- [ ] มีชุดไฟล์ตัวอย่างที่เคยตกหล่นเพื่อใช้ regression

**Work Order:**

- [ ] ตรวจ input/output OCR เดิม
- [ ] ระบุจุดที่สลิปในแชทหลุดจาก pipeline
- [ ] เพิ่ม layer processing แบบไม่ทำลาย raw image
- [ ] แยก bubble/message layer
- [ ] แยก text/emoji/content layer
- [ ] แยก slip candidate layer
- [ ] ใส่ confidence และ review queue

**Blocked Scope:**

- [ ] ห้ามเปลี่ยน table/report ก่อน OCR output นิ่ง
- [ ] ห้าม claim ว่าตรวจครบถ้ายังไม่ได้เทียบ manual expected list

**Exit Criteria:**

- [ ] ไฟล์ที่เคยตกหล่นถูกนำมาทดสอบซ้ำ
- [ ] รายการที่ confidence ต่ำถูกส่งเข้า review ไม่ถูกแปลงเป็น confirmed data

## Patch 4: Core Calculation Patch

**Purpose:** ทำ calculation กลางให้ถูกก่อนนำไปโชว์บน cards/table/report

**Preconditions:**

- [ ] OCR output ถูก normalize เข้า data model กลางแล้ว

**Calculation Units:**

- [ ] total amount from deduped transactions
- [ ] selected POI amount from checked persons only
- [ ] detected person aggregation
- [ ] reference-id dedup
- [ ] A4 page/source mapping
- [ ] relationship status summary

**Blocked Scope:**

- [ ] ยังไม่แก้ UI ให้สวย
- [ ] ยังไม่ export

**Exit Criteria:**

- [ ] Unit tests ผ่านสำหรับ aggregation, selected POI, dedup, source mapping
- [ ] Card/table/report มี single calculation source

## Patch 5: Summary Cards Patch

**Purpose:** ให้ Card 1-4 แสดง summary จาก calculation กลาง และควบคุมว่า metric ไหนเข้า report

**Preconditions:**

- [ ] Core calculation พร้อม
- [ ] Card 3 กับ Linkage modal แยกหน้าที่แล้ว

**Card Rules:**

- [ ] Card 1: ยอดรวมจากธุรกรรมที่ตรวจพบและ dedup แล้ว
- [ ] Card 2: ยอดเฉพาะ POI ที่ checkbox ถูกเลือกเท่านั้น
- [ ] Card 3: KPI ความสัมพันธ์/การจับคู่แบบสั้น
- [ ] Card 4: สถานะ reconciliation/พร้อมตรวจทาน ไม่โชว์ duplicate แบบเสียความรู้สึก

**Exit Criteria:**

- [ ] ปิด card แล้ว report ไม่กรอก metric นั้น
- [ ] เปิด card แล้ว report แสดง metric จาก source เดียวกัน

## Patch 6: Final 12-Column Table Patch

**Purpose:** ปรับตาราง customer-facing ให้ตรงกับ requirement ล่าสุด

**Preconditions:**

- [ ] Data model และ calculation พร้อม
- [ ] final columns ถูกล็อกแล้ว

**Canonical Columns:**

1. ลำดับ (อ้างอิงจากวันที่และเวลาที่โอน)
2. วัน/เวลา
3. ผู้โอน
4. ธนาคารผู้โอน
5. จำนวนเงิน (พร้อมสตางค์)
6. ผู้รับโอน
7. ธนาคารผู้รับโอน
8. บันทึกความจำ
9. รหัสอ้างอิง (ในสลิปธนาคาร)
10. ไฟล์หลักฐาน (แสดงลำดับหน้าบนหน้า A4)
11. ความสัมพันธ์
12. หมายเหตุ

**Removed From Customer Table:**

- [ ] เลขบัญชีผู้โอน
- [ ] เลขบัญชีผู้รับ
- [ ] ค่าธรรมเนียม
- [ ] สถานะไฟล์ซ้ำ

**Exit Criteria:**

- [ ] ตารางใน UI/report/export ใช้ column order เดียวกัน
- [ ] แถวเรียงตามวันเวลาโอน ไม่ใช่ลำดับ upload

## Patch 7: Legal Triage Patch

**Purpose:** ชี้เป้าบริบทกฎหมายเบื้องต้นจากข้อความและธุรกรรมที่สกัดได้ โดยไม่ฟันธง

**Preconditions:**

- [ ] OCR text และ transaction data เชื่อถือได้ขึ้น
- [ ] Neutral vocabulary ถูกใช้แล้ว

**Rules:**

- [ ] แยกแพ่ง/อาญา/สารบัญชี้เป้า
- [ ] ทุกประเด็นต้องมี source quote
- [ ] ทุกประเด็นต้องมี confidence
- [ ] ทุกประเด็นต้องใช้คำว่าเบื้องต้นหรือควรตรวจต่อ

**Exit Criteria:**

- [ ] ไม่มีถ้อยคำกล่าวหาหรือวินิจฉัย
- [ ] กฎหมายทุกข้อแสดงเป็น issue spotting ไม่ใช่คำตอบสุดท้าย

## Patch 8: PDF Export + Password Patch

**Purpose:** แยก preview ออกจาก real encrypted PDF export

**Preconditions:**

- [ ] Report content นิ่ง
- [ ] Table content นิ่ง
- [ ] Password behavior ได้รับอนุมัติ

**Rules:**

- [ ] Preview ไม่ต้อง claim ว่าเข้ารหัส
- [ ] Real export ต้องสร้าง PDF ที่เปิดแล้วถาม password จริง
- [ ] UI ต้องบอกชัดว่า password นี้ใช้กับ PDF หรือ SFX

**Exit Criteria:**

- [ ] เปิด PDF export จริงแล้วเห็น password dialog
- [ ] ใส่รหัสถูกจึงเปิดได้
- [ ] รหัสผิดเปิดไม่ได้

## Patch 9: SFX Packaging Patch

**Purpose:** ทำ package ส่งมอบลูกค้าที่มี logo/text/disclaimer และแตกไฟล์ได้จริง

**Preconditions:**

- [ ] PDF export พร้อม
- [ ] ไฟล์ที่จะบรรจุใน package ถูกกำหนดแล้ว
- [ ] SFX password behavior ได้รับอนุมัติ

**Rules:**

- [ ] SFX branding ต้องแสดง logo/name/disclaimer ตาม requirement
- [ ] ถ้าเปิด SFX password ต้องถามตอนแตก archive
- [ ] ต้องไม่สับสนกับ PDF password

**Exit Criteria:**

- [ ] ลูกค้าเปิด SFX แล้วเห็นหน้าตาม reference
- [ ] แตกไฟล์ได้
- [ ] เปิด PDF ใน package ได้ตาม password policy

## Patch 10: JEV Readiness Patch

**Purpose:** เพิ่ม readiness/decision scoring หลังข้อมูลหลักนิ่งแล้ว

**Preconditions:**

- [ ] Data model พร้อม
- [ ] OCR confidence พร้อม
- [ ] Legal triage confidence พร้อม
- [ ] ตรวจ license/source ของ JEV แล้ว

**Rules:**

- [ ] ห้ามดึง JEV ทั้งก้อน
- [ ] ใช้เฉพาะ logic/แนวคิด decision ที่จำเป็น
- [ ] เขียนเป็น native utility ของโปรเจกต์เอง

**Exit Criteria:**

- [ ] คะแนน readiness มี reason อธิบายได้
- [ ] ใช้ช่วย checklist/card/report warning ได้

## Patch 11: End-To-End QA Patch

**Purpose:** ตรวจทุกสายพานจากไฟล์ดิบถึงแพ็กเกจลูกค้า

**Preconditions:**

- [ ] ทุก patch หลักเสร็จและผ่านระดับทดสอบของตัวเอง

**Test Pack:**

- [ ] แชทล้วน
- [ ] สลิปล้วน
- [ ] แชทมีสลิปแปะ
- [ ] แชทพื้นหลังลายเยอะ
- [ ] reference ซ้ำ
- [ ] วันเวลาไม่เรียง
- [ ] หลายชื่อ
- [ ] ชื่อเดียวหลายยอด
- [ ] confidence ต่ำ

**Exit Criteria:**

- [ ] Tier 1 static checked
- [ ] Tier 2 logic/API checked
- [ ] Tier 3 integration checked
- [ ] Tier 4 real user flow checked
- [ ] Export PDF/SFX เปิดจริง
- [ ] Final report แยก Done, Checked, Untested, Risks

## Stop Rules

- ถ้า OCR ยังตกหล่นมาก หยุดก่อนทำ table/report/export
- ถ้า schema กลางยังไม่ชัด หยุดก่อนทำ cards
- ถ้า legal wording ยังแรง หยุดก่อนทำ legal triage
- ถ้า PDF password ยังไม่ใช่ encrypted export จริง หยุดก่อนทำ SFX
- ถ้า SFX ยังไม่ได้เปิดจริง ห้ามบอกว่าส่งมอบพร้อม

## Self-Review

- Spec coverage: ครอบคลุมลำดับคำ/นิยาม, data model, extraction/calculation, UI display, report/export, packaging, verification
- Conflict alignment: สอดคล้องกับ Master Implementation Plan และ Compatibility Blueprint
- Placeholder scan: ไม่มี placeholder ที่ให้เดาเอง
- Unknown: ยังไม่ได้ตรวจโค้ดจริง จึงยังไม่ระบุชื่อไฟล์/ฟังก์ชันจริง
- Untested: ยังไม่ได้ run test, build, browser, export, หรือ SFX
