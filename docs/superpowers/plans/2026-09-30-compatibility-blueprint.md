# Compatibility Blueprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` only after the user explicitly approves implementation. Do not use subagents unless the user explicitly authorizes it. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ตรวจความเข้ากันได้ของทุกแผนก่อนลงมือเขียนโค้ด เพื่อหาว่า state, UI, OCR, report, export, password, SFX และ legal triage จะชนกันตรงไหน

**Architecture:** เอกสารนี้เป็นด่านตรวจกลางก่อน implementation โดยแปลงทุกแผนเป็น dependency matrix และ conflict matrix จากนั้นกำหนด guardrail ให้แต่ละ patch ต้องไม่ทำลายข้อมูลต้นทางหรือ output ปลายทาง แผนนี้ไม่ใช่การแก้โค้ด แต่เป็นตัวล็อกลำดับและขอบเขตของการแก้โค้ดในอนาคต

**Tech Stack:** Planning document only; target system context is Next.js, React, TypeScript, Tailwind CSS, OCR pipeline, PDF export, SFX packaging, CSV/PDF output

## Global Constraints

- ห้ามลงมือเขียนโค้ดจากเอกสารนี้
- ห้ามเปลี่ยน export format, password behavior, SFX behavior, OCR schema, หรือ report semantics โดยไม่ขออนุมัติ
- ใช้ข้อมูลจากแผนที่คุยกันและ Master Implementation Plan เป็นหลัก
- ถ้ายังไม่ได้ตรวจโค้ดจริง ให้ระบุว่า `Unknown`
- จุดที่เป็นเพียงสมมติฐานต้องเขียนว่า `Assumed`
- จุดที่เสี่ยงทำให้ระบบฟันธงทางกฎหมาย ต้องบังคับใช้คำว่า `ชี้เป้าเบื้องต้น`

---

## Compatibility Matrix

| แผน | ไฟล์/โมดูลที่กระทบ | ใช้ข้อมูลจากไหน | เสี่ยงชนกับอะไร | วิธีแก้ |
|---|---|---|---|---|
| Neutral Wording | Header, step labels, left/right panels, modals, report preview, export titles | UI copy constants, page state, report props | Legal triage อาจดึงคำแรงกลับมา เช่น `คดี`, `อาญา`, `ผู้ต้องหา`, `ฟันธง` | ทำ vocabulary map กลางก่อน แล้วให้ report/legal ใช้คำชุดเดียวกัน |
| OCR Slip-In-Chat Reliability | Upload intake, staging buffer, OCR/text extraction, image preprocessing, slip detection | ไฟล์ดิบ, image frames, OCR text, detected regions | Metrics/table/report ใช้ข้อมูลตกหล่น ถ้า OCR ยังไม่เจอสลิปในแชท | ทำ OCR reliability ก่อน metrics และทำ review queue สำหรับ confidence ต่ำ |
| Temporary Layer Processing | Image preprocessing, bubble segmentation, text extraction, slip-region extraction | raw chat image/PDF page | อาจเปลี่ยน input/output ของ OCR pipeline เดิม | ออกแบบเป็น additive layer: เก็บ raw image เดิมไว้ แล้วเพิ่ม structured layer แยกต่างหาก |
| Structured Evidence State | Evidence state, detected persons, transaction list, source mapping | OCR output, slip parser, user selection | Cards/table/report/export คำนวณคนละที่และยอดไม่ตรงกัน | สร้าง schema กลางก่อน แล้วให้ทุก output อ่านจาก schema เดียว |
| Detected Person List | Left panel detected names, POI checkbox, aggregation | normalized transactions/person aggregation | Card 2 อาจแสดงยอดเป้าหมายทั้งที่ checkbox ยังไม่ถูกติ๊ก | กำหนด `selected: false` เป็น default และ Card 2 รวมเฉพาะ selected เท่านั้น |
| Summary Cards 1-4 | Right panel metrics, executive summary, report preview | normalized metrics, selected POI, page mapping | Card state ไม่ sync กับ report; ปิด card แล้วรายงานยังกรอกค่า | เพิ่ม summary card state เป็น source of truth สำหรับ executive summary |
| Card 3 Relationship | Card 3 KPI, linkage modal, A4 page mapping | source mapping, chat-slip correlation | ซ้ำกับปุ่ม `ตรวจสอบความเชื่อมโยง` | Card 3 แสดง KPI สั้น; Linkage modal แสดงรายละเอียดเต็ม |
| Linkage Modal | Relationship detail modal, mapping table | transaction source refs, A4 pages, chat page refs | ถ้าใช้ logic คนละชุดกับ Card 3 จะได้ค่าไม่ตรง | ใช้ utility mapping เดียวกัน แต่ render คนละระดับ detail |
| Final 12-Column Table | Evidence table modal, report table, CSV/PDF table | normalized transactions sorted by transfer date/time | แผน 13 คอลัมน์เดิมชนกับ requirement ล่าสุด | Supersede 13-column plan ด้วย 12-column final schema |
| Removed Account Columns | Table builder, CSV exporter, PDF report | sender/receiver account fields may still exist internally | Export เก่าอาจยังปล่อยเลขบัญชีไปใน CSV/PDF | เก็บเลขบัญชีไว้ภายในถ้าจำเป็น แต่ exclude จาก customer-facing table |
| Removed Fee Column | Table/export/report | transaction fee field | ระบบคำนวณเก่าหรือ CSV เดิมอาจยังมี fee | ไม่แสดง fee ในตารางหลัก; เก็บเฉพาะ internal/appendix ถ้าต้องใช้ |
| Removed Duplicate Status | Table/export/report | reference-id dedup logic | ลูกค้าเห็นคำว่าไฟล์ซ้ำแล้วรู้สึกไม่เป็นมืออาชีพ | Dedup ใช้ภายในเพื่อคำนวณยอดสุทธิ แต่ไม่แสดงใน customer-facing ledger |
| Document Tools 1-4 | Cover, hash ledger, executive summary, legal context | case metadata, file metadata, card metrics, legal triage | เนื้อหาเอกสารแต่ละปุ่มปนกัน | กำหนด source และ purpose แยกต่อ tool |
| Header Rules | A4 page header, mode label, corroborated text | processing mode, correlation status, page index | Header overclaim เช่น `corroborated` ทั้งที่ confidence ต่ำ | ใช้สถานะกลาง: `พบเบื้องต้น`, `ต้องตรวจทาน`, `สัมพันธ์กับหลักฐาน` |
| PDF Password | PDF export module, password field, PDF generation backend | user-entered password, export job | `window.print()` หรือ preview ไม่ได้เข้ารหัสจริง แต่ UI อาจบอกว่าล็อกแล้ว | แยก Preview PDF ออกจาก Real Encrypted Export อย่างชัดเจน |
| SFX Packaging | SFX export, WinRAR script/config, package metadata | generated files, password field, logo/text/disclaimer | password ของ PDF กับ password ของ SFX อาจสับสน | แยก mode: PDF password, SFX password, both layers |
| SFX Branding | SFX config/comment/icon/text | logo asset, product name, disclaimer text | ลูกค้าเปิด SFX แล้วไม่เห็น logo/text ตามที่ตั้งใจ | ตรวจ SFX config จริง และทดสอบแตกไฟล์จริงก่อน claim |
| Legal Triage | Legal modal/report, issue spotting, confidence scoring | extracted text, transaction evidence, source quotes | ระบบอาจกลายเป็นฟันธงทางกฎหมาย | ใช้คำว่า `บริบทเข้าข่ายเบื้องต้น`, `ควรให้ผู้เชี่ยวชาญตรวจต่อ` |
| Legal Knowledge Base | Law rule database, triggers, confidence model | law references, evidence text, transaction facts | keyword แบบคิดเองอาจไม่ตรงองค์ประกอบกฎหมาย | ทุก rule ต้องมีองค์ประกอบ, trigger, negative trigger, source quote |
| JEV-Inspired Readiness | readiness scoring, checklist, Card 3, export warning | normalized evidence, OCR confidence, legal triage confidence | ดึง JEV ทั้งก้อน/ติด license/เพิ่ม bloat | ตรวจ license ก่อน และ cherry-pick เฉพาะ decision concept เป็น native utility |
| Skill Workflow | PLAN_* skills, writing-plans, executing-plans, debugging, verification | project plan state, task stage | สั่งรันข้ามเฟส ทำให้แก้ปลายทางก่อนต้นทาง | ทุก patch ต้องระบุ skill ที่ใช้และ phase ที่อยู่ |

## Critical Conflict Notes

### 1. OCR ก่อน Metrics เสมอ

ถ้า OCR ยังตกหล่น โดยเฉพาะสลิปในภาพแชทที่มีพื้นหลังลายเยอะ การแก้ Card 1, Card 2, ตาราง, report หรือ legal triage จะทำให้ผลลัพธ์ดูดีแต่ผิดจากหลักฐานจริง

**Decision:** Phase OCR reliability ต้องมาก่อน metrics/table/report

### 2. 13 Columns ถูกแทนที่ด้วย 12 Columns

แผน 13 คอลัมน์เดิมไม่ใช่ requirement ล่าสุดแล้ว เพราะผู้ใช้ตัดสินใจเอาเลขบัญชี, ค่าธรรมเนียม และ duplicate status ออกจากตารางหลัก

**Decision:** ใช้ตาราง 12 คอลัมน์เป็น customer-facing canonical table

### 3. Dedup ต้องทำ แต่ไม่ควรโชว์เป็นภาษาลูกค้า

ระบบยังต้อง dedup ด้วย reference id เพื่อไม่ให้ยอดซ้ำ แต่ไม่ควรแสดงคำว่าไฟล์ซ้ำในตารางหลัก เพราะกระทบความรู้สึกและความเป็นมืออาชีพ

**Decision:** Dedup เป็น internal audit/reconciliation logic

### 4. PDF Password ไม่เท่ากับ SFX Password

ช่องรหัสอาจถูกเข้าใจว่าใช้ทั้งเปิด PDF และแตก SFX แต่ทางเทคนิคเป็นคนละชั้น ถ้า UI สื่อผิดจะเกิด false confidence

**Decision:** แยก label, state, export flow และ verification ของ PDF password กับ SFX password

### 5. Card 3 กับ Linkage Modal ต้องไม่ซ้ำ

Card 3 เหมาะเป็นสถานะสั้น เช่นจับคู่แล้วกี่รายการ/อยู่หน้าไหน ส่วน Linkage modal เหมาะเป็นหน้ารายละเอียด mapping

**Decision:** ใช้ source utility เดียวกัน แต่แสดงผลคนละระดับ

### 6. Legal Triage ต้องไม่เปลี่ยน tone ทั้งระบบ

ถ้ากฎหมายเข้ามาใน header/table/card มากเกินไป ระบบจะกลับไปดูเหมือนฟันธงว่าเป็นคดี ทั้งที่เจตนาคือชี้เป้า

**Decision:** จำกัด legal text ไว้ใน Legal Context หรือ Preliminary Triage เท่านั้น

### 7. JEV ต้องเป็น Decision Layer ไม่ใช่ Extraction Layer

JEV-inspired readiness เหมาะใช้ตัดสินใจว่าแฟ้มหลักฐานครบ/พร้อมแค่ไหน ไม่ควรเข้ามาแทน OCR extraction

**Decision:** JEV ใช้หลัง normalized evidence state พร้อมแล้ว

## Dependency Order

```text
Phase 0 Compatibility Blueprint
  -> Phase 1 Neutral Wording
  -> Phase 2 OCR Reliability
  -> Phase 3 Structured Evidence State
  -> Phase 4 Cards / Metrics
  -> Phase 5 12-Column Table
  -> Phase 6 Document Tools
  -> Phase 7 Header Rules
  -> Phase 8 Export / PDF / SFX
  -> Phase 9 Legal Triage
  -> Phase 10 JEV Readiness
  -> Phase 12 End-to-End QA
```

## Required Guardrails Before Implementation

- [ ] ก่อนแก้ OCR: ต้องรู้ input/output ปัจจุบันของ OCR pipeline
- [ ] ก่อนแก้ cards: ต้องมี schema กลางของ metrics
- [ ] ก่อนแก้ table/export: ต้อง lock ตาราง 12 คอลัมน์เป็น canonical schema
- [ ] ก่อนแก้ PDF password: ต้องแยก preview/export จริง
- [ ] ก่อนแก้ SFX: ต้องรู้ว่าใช้ WinRAR script/config จริงหรือ mock
- [ ] ก่อนแก้ legal triage: ต้อง lock neutral legal vocabulary
- [ ] ก่อนใช้ JEV: ต้องตรวจ license/source
- [ ] ก่อน claim ว่า export ใช้ได้: ต้องเปิดไฟล์ export จริง

## Compatibility Tasks

### Task 1: Current-System Inventory

**Files:**
- Read only: exact files to be identified in Phase 0
- Create/Modify: none
- Test: none

**Interfaces:**
- Consumes: current source tree, Master Implementation Plan
- Produces: current-system map with exact files/functions for each subsystem

- [ ] ระบุไฟล์จริงของ upload/staging
- [ ] ระบุไฟล์จริงของ OCR/slip extraction
- [ ] ระบุไฟล์จริงของ detected person list
- [ ] ระบุไฟล์จริงของ cards/metrics
- [ ] ระบุไฟล์จริงของ evidence table
- [ ] ระบุไฟล์จริงของ document tools/report preview
- [ ] ระบุไฟล์จริงของ PDF/export/SFX/password
- [ ] ระบุไฟล์จริงของ legal triage ถ้ามี

### Task 2: Data Contract Map

**Files:**
- Create later: `docs/superpowers/plans/<date>-data-contract-map.md`
- Modify: none in this blueprint step

**Interfaces:**
- Consumes: Task 1 inventory
- Produces: table of state objects, owners, readers, writers

- [ ] ระบุ state ที่เป็น source of truth
- [ ] ระบุ field ที่ cards ใช้
- [ ] ระบุ field ที่ table ใช้
- [ ] ระบุ field ที่ report ใช้
- [ ] ระบุ field ที่ export ใช้
- [ ] ระบุ field ที่ legal triage ใช้
- [ ] ทำเครื่องหมาย field ที่ยังไม่แน่ใจเป็น `Unknown`

### Task 3: Output Contract Map

**Files:**
- Create later: `docs/superpowers/plans/<date>-output-contract-map.md`
- Modify: none in this blueprint step

**Interfaces:**
- Consumes: final 12-column table requirement, report/export requirements
- Produces: mapping of every customer-facing output to data source

- [ ] ระบุ output หน้าเว็บ
- [ ] ระบุ output modal
- [ ] ระบุ output report preview
- [ ] ระบุ output PDF
- [ ] ระบุ output CSV/Excel ถ้ายังมี
- [ ] ระบุ output SFX package
- [ ] ระบุ output readme/disclaimer

### Task 4: Conflict Resolution Register

**Files:**
- Create later: `docs/superpowers/plans/<date>-conflict-resolution-register.md`
- Modify: none in this blueprint step

**Interfaces:**
- Consumes: compatibility matrix
- Produces: final decisions for conflicts

- [ ] บันทึกว่า 12-column table supersedes 13-column table
- [ ] บันทึกว่า PDF password and SFX password are separate
- [ ] บันทึกว่า Card 3 is KPI and Linkage modal is detail
- [ ] บันทึกว่า legal triage is preliminary issue spotting
- [ ] บันทึกว่า OCR reliability precedes metrics/report/legal
- [ ] บันทึกว่า JEV-inspired readiness comes after normalized evidence

### Task 5: Go / No-Go Checklist Per Patch

**Files:**
- Create later: `docs/superpowers/plans/<date>-patch-gate-checklist.md`
- Modify: none in this blueprint step

**Interfaces:**
- Consumes: conflict register and dependency order
- Produces: checklist every implementation patch must pass before coding

- [ ] Patch ระบุ phase ชัดเจน
- [ ] Patch ระบุ files in scope ชัดเจน
- [ ] Patch ระบุ files out of scope ชัดเจน
- [ ] Patch ระบุ data contracts ที่แตะ
- [ ] Patch ระบุ output contracts ที่แตะ
- [ ] Patch ระบุ risk gates ที่ต้องขออนุมัติ
- [ ] Patch ระบุ verification tier ที่จะทดสอบ

## Final Recommendation

เฟสนี้ควรถูกใช้เป็นด่านบังคับก่อน implementation ทุกครั้ง ถ้าแผนเริ่มเยอะหรือมี output หลายแบบ ให้ทำ Compatibility Blueprint ก่อนเสมอ เพราะมันช่วยหยุดปัญหาแบบแก้ UI แล้วไปชน report, แก้ export แล้ว password ไม่จริง, หรือเพิ่ม legal แล้ว tone ระบบกลายเป็นฟันธง

## Self-Review

- Spec coverage: ครอบคลุมคำถามเรื่อง state shared, table vs export, PDF password vs SFX password, Card 3 vs Linkage modal, legal tone, OCR input/output
- Placeholder scan: ไม่มี `TBD`, `TODO`, หรือ instruction ที่ให้เดาเอง
- Type consistency: เอกสารนี้ยังไม่กำหนด TypeScript type จริง เพราะยังไม่ได้ตรวจโค้ด และตั้งใจเป็น compatibility planning document
- Unknown: ยังไม่ได้อ่านโค้ดจริง จึงยังไม่ยืนยันชื่อไฟล์/ฟังก์ชันจริง
- Untested: ยังไม่ได้ run build, test, browser, PDF export, หรือ SFX จริง
