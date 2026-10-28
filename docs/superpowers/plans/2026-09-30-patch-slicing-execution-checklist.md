# Patch Slicing Execution Checklist

> **For agentic workers:** This checklist prepares execution only. Do not implement code from this document until the user explicitly approves a single patch. Use `executing-plans` only after selecting one patch and confirming its scope.

**Goal:** หั่น Master Implementation Plan เป็นแพตช์เล็ก ๆ ที่ตรวจได้ แยกความเสี่ยงได้ และรู้ชัดว่าถ้าพัง พังจากแพตช์ไหน

**Architecture:** ใช้แนวทาง one-patch-one-risk โดยแต่ละ patch ต้องมี source of truth, files in scope, files out of scope, stop conditions, verification tiers และ rollback note ชัดเจน ห้ามรวม OCR, UI, report, export, SFX และ legal triage ในแพตช์เดียว

**Tech Stack:** Planning checklist only; target implementation context is Next.js, React, TypeScript, Tailwind CSS, OCR/text extraction, PDF export, SFX packaging

## Global Constraints

- ห้ามสั่งว่า `ทำทั้งหมดตามแผนเลย`
- ให้เริ่มทีละ patch เท่านั้น
- ก่อนแก้ทุก patch ต้องสรุป:
  - root cause หรือเหตุผลเชิงระบบ
  - files in scope
  - files out of scope
  - data contract ที่แตะ
  - output contract ที่แตะ
  - verification tier ที่จะทดสอบ
- ห้ามแตะ OCR, API, PDF export, SFX, legal triage, หรือ schema กลาง ถ้า patch นั้นไม่ได้ระบุไว้ตรง ๆ
- ถ้า patch แตะ export format, password, SFX, data semantics หรือ legal wording ต้องขออนุมัติก่อน

---

## Patch Slicing Rule

แพตช์ที่ดีต้องตอบได้ 5 ข้อก่อนเริ่ม:

1. แก้เรื่องเดียวคืออะไร
2. แตะไฟล์/โมดูลไหนบ้าง
3. ห้ามแตะอะไรบ้าง
4. จะรู้ได้อย่างไรว่าสำเร็จ
5. ถ้าพัง จะรู้ได้อย่างไรว่าพังจากแพตช์นี้

## Forbidden Execution Prompt

ห้ามใช้คำสั่งลักษณะนี้:

```text
ทำทั้งหมดตามแผนเลย
```

เพราะมันรวมหลายความเสี่ยงในรอบเดียว เช่น OCR, table, report, password, SFX, legal wording และทำให้ไล่ root cause ยาก

## Recommended Execution Prompt Template

ใช้คำสั่งลักษณะนี้แทน:

```text
เริ่มจาก Patch N เท่านั้น: [ชื่อแพตช์]
Scope: [สิ่งที่อนุญาตให้แก้]
Out of scope: [สิ่งที่ห้ามแตะ]
ก่อนแก้ ให้สรุป root cause / เหตุผลเชิงระบบ, ไฟล์ที่จะกระทบ, และ verification plan ก่อน
ห้ามลงมือถ้าเจอว่าต้องแตะ dependency/auth/security/db/export format/password/SFX โดยไม่ได้ขออนุมัติ
```

---

## Patch 1: Neutral Wording Only

**Purpose:** ปรับถ้อยคำ UI และเอกสาร preview ให้เป็นกลาง

**Allowed Scope:**

- UI labels
- Header wording
- Step labels
- Panel titles
- Modal titles
- Report preview wording
- Default reference wording

**Out Of Scope:**

- OCR
- API
- calculation
- evidence schema
- PDF export
- PDF password
- SFX packaging
- legal triage rule logic

**Root Cause To State Before Editing:**

คำเดิมบางจุดใช้ถ้อยคำแรงเกินสถานะจริง เช่น `คดี`, `สำนวนศาล`, `คดีอาญา` ทำให้ระบบดูเหมือนตัดสินสถานะทางกฎหมายแล้ว ทั้งที่เจตนาคือจัดระเบียบหลักฐานเบื้องต้น

**Expected Output:**

- หน้าเว็บและ preview ใช้คำกลาง เช่น `เรื่องตรวจสอบ`, `แฟ้มหลักฐาน`, `เอกสารประกอบ`, `บุคคลที่ตรวจพบ`
- Legal text ถ้ามีต้องอยู่ในบริบทเบื้องต้นเท่านั้น

**Verification:**

- Tier 1: lint/typecheck if code touched
- Tier 2: text mapping check
- Tier 3: UI/report preview integration check
- Tier 4: manual browser check if UI touched

## Patch 2: Customer Transaction Data Model Only

**Purpose:** สร้างหรือปรับ data model กลางสำหรับตารางลูกค้าและ summary

**Allowed Scope:**

- Type definitions
- Pure mapping utilities
- Unit tests for mapping

**Out Of Scope:**

- UI table rendering
- OCR rewrite
- PDF export
- SFX
- legal triage
- password

**Root Cause To State Before Editing:**

ถ้า cards, table, report และ export อ่านข้อมูลคนละชุด ยอดและสถานะจะไม่ตรงกัน ต้องมี source of truth ก่อนทำ UI

**Expected Output:**

- Model รองรับ transaction fields:
  - transfer date/time
  - sender
  - sender bank
  - amount with satang
  - receiver
  - receiver bank
  - memo
  - bank reference
  - A4 evidence page reference
  - relationship
  - note

**Verification:**

- Tier 1: typecheck
- Tier 2: unit tests for mapping and sorting
- Tier 3: Not tested unless connected
- Tier 4: Not tested

## Patch 3: Table UI Only

**Purpose:** แสดงตาราง 12 คอลัมน์จาก model กลาง

**Allowed Scope:**

- Evidence table modal UI
- Table column labels/order
- Display formatting

**Out Of Scope:**

- OCR
- model semantics
- PDF export
- CSV export
- SFX
- legal triage

**Root Cause To State Before Editing:**

ตารางเดิม 13 คอลัมน์ไม่ตรง requirement ล่าสุด และมีข้อมูลที่ลูกค้าไม่ควรเห็นในตารางหลัก เช่น เลขบัญชี ค่าธรรมเนียม และสถานะไฟล์ซ้ำ

**Expected Output:**

- ตารางแสดง 12 คอลัมน์ตามลำดับที่ตกลง
- ไม่แสดงเลขบัญชี ค่าธรรมเนียม หรือสถานะไฟล์ซ้ำในตารางหลัก

**Verification:**

- Tier 1: lint/typecheck
- Tier 2: render data formatting check
- Tier 3: modal integration check
- Tier 4: browser manual check

## Patch 4: OCR / Slip-In-Chat Reliability Only

**Purpose:** เพิ่มความน่าเชื่อถือของการตรวจสลิปที่อยู่ในภาพแชท

**Allowed Scope:**

- OCR preprocessing pipeline
- Slip candidate detection
- Confidence/review status
- Regression fixtures from known missed files

**Out Of Scope:**

- Table redesign
- PDF export
- SFX
- legal triage
- UI wording

**Root Cause To State Before Editing:**

ถ้าไฟล์แชทมีสลิปแต่ OCR ตรวจไม่พบ ข้อมูลยอดเงินจะตกหล่น และทุก output หลังจากนั้นจะผิดแม้ UI จะสวย

**Expected Output:**

- ตรวจพบ slip candidate ได้ดีขึ้น
- ถ้า confidence ต่ำ ต้องส่งเข้า review ไม่ยืนยันอัตโนมัติ

**Verification:**

- Tier 1: typecheck/lint
- Tier 2: unit/regression test with missed slip cases
- Tier 3: pipeline integration test
- Tier 4: manual upload flow with known files

## Patch 5: Summary Cards Only

**Purpose:** ปรับ Card 1-4 ให้แสดงค่าจาก calculation กลางและเปิด/ปิดการลง report ได้

**Allowed Scope:**

- Card state
- Card display
- Summary metric binding
- Report inclusion toggle state

**Out Of Scope:**

- OCR
- table columns
- PDF password
- SFX
- legal triage

**Root Cause To State Before Editing:**

ถ้า card แสดงค่าจาก logic คนละชุดกับ report/export จะเกิดยอดไม่ตรงกัน และถ้าปิด card แล้ว report ยังกรอกค่า จะทำให้ผู้ใช้ควบคุม output ไม่ได้จริง

**Expected Output:**

- Card 1: total
- Card 2: selected POI only
- Card 3: relationship KPI only
- Card 4: reconciliation/readiness status

**Verification:**

- Tier 1: lint/typecheck
- Tier 2: card state unit tests
- Tier 3: card-to-report integration
- Tier 4: browser click test

## Patch 6: PDF Real Export Only

**Purpose:** แยก preview ออกจาก real PDF export

**Allowed Scope:**

- Real PDF export path
- Export button behavior
- Export output validation

**Out Of Scope:**

- PDF password encryption
- SFX
- OCR
- legal triage
- table schema changes

**Root Cause To State Before Editing:**

Preview หรือ `window.print()` ไม่เท่ากับ real export ถ้า UI บอกว่าส่งออกแล้วแต่ไม่มีไฟล์ PDF จริง จะเกิด false confidence

**Expected Output:**

- มีไฟล์ PDF export จริง
- Preview ยังคงเป็น preview ไม่ claim ว่า encrypted

**Verification:**

- Tier 1: build/typecheck
- Tier 2: export function test if possible
- Tier 3: UI-to-export integration
- Tier 4: open exported PDF manually

## Patch 7: PDF Password Encryption Only

**Purpose:** ทำให้ PDF export ที่ตั้งรหัสไว้เปิดแล้วต้องใส่ password จริง

**Allowed Scope:**

- PDF encryption path
- Password field binding for PDF only
- Error/status message for PDF encryption

**Out Of Scope:**

- SFX password
- SFX package
- OCR
- table schema
- legal triage

**Root Cause To State Before Editing:**

ช่องรหัสใน UI อาจทำให้ผู้ใช้เข้าใจว่าไฟล์ล็อกแล้ว แต่ถ้า export จริงไม่ได้เข้ารหัส PDF ลูกค้าจะเปิดได้โดยไม่ถามรหัส

**Expected Output:**

- PDF ที่ export แล้วถาม password ตอนเปิด
- รหัสถูกเปิดได้
- รหัสผิดเปิดไม่ได้

**Verification:**

- Tier 1: build/typecheck
- Tier 2: export/encryption function check
- Tier 3: UI-to-export integration
- Tier 4: open PDF in actual viewer and confirm password dialog

## Patch 8: SFX Real Packaging Only

**Purpose:** ทำ SFX package ที่บรรจุไฟล์ส่งมอบจริง พร้อม branding/disclaimer ตาม reference

**Allowed Scope:**

- SFX build script/config
- Package file list
- SFX branding text/logo
- SFX extraction behavior

**Out Of Scope:**

- PDF content generation
- PDF encryption logic
- OCR
- table schema
- legal triage

**Root Cause To State Before Editing:**

SFX เป็นขั้นส่งมอบปลายทาง ถ้าทำก่อน PDF/table/report พร้อม จะได้แพ็กเกจที่เปิดได้แต่ข้อมูลข้างในยังไม่นิ่ง

**Expected Output:**

- ลูกค้าเปิด SFX แล้วเห็น logo/name/disclaimer
- แตกไฟล์ได้จริง
- ถ้าตั้ง SFX password ต้องถาม password ตอนแตกไฟล์

**Verification:**

- Tier 1: script/static check
- Tier 2: package manifest check
- Tier 3: export-to-package integration
- Tier 4: open SFX and extract manually

## Patch 9: End-To-End Export Validation Only

**Purpose:** ตรวจสายพานส่งออกจริงหลัง PDF/SFX พร้อม

**Allowed Scope:**

- Test/checklist scripts
- Manual validation steps
- Documentation of observed results

**Out Of Scope:**

- New features
- UI redesign
- OCR changes
- legal rule changes

**Root Cause To State Before Editing:**

Build ผ่านหรือ export function ผ่านไม่พอ ต้องตรวจว่าไฟล์ที่ลูกค้าได้รับเปิดได้จริงและตรงกับที่ UI สื่อไว้

**Expected Output:**

- รายงานผลว่า exported PDF เปิดได้อย่างไร
- SFX แตกไฟล์ได้อย่างไร
- password ทำงานจริงในชั้นไหน
- ไฟล์ใน package ครบหรือไม่

**Verification:**

- Tier 1: static/build if scripts touched
- Tier 2: validation script result
- Tier 3: package structure check
- Tier 4: manual open/extract/open-PDF flow

## Execution Gate Before Any Patch

ก่อนเริ่ม patch ใด ๆ ให้ตอบแบบนี้ก่อน:

```text
Patch ที่จะทำ: [ชื่อ]
Root cause / เหตุผลเชิงระบบ: [ย่อหน้าเดียว]
Files in scope: [รายการ]
Files out of scope: [รายการ]
Risk gates: [มี/ไม่มี dependency, auth, security, db, export format, password, SFX]
Verification plan:
- Tier 1:
- Tier 2:
- Tier 3:
- Tier 4:
จะหยุดทันทีถ้า: [stop conditions]
```

## Recommended First Execution Command

ถ้าจะเริ่มทำจริง ให้ใช้คำสั่งประมาณนี้:

```text
เริ่ม Patch 1: Neutral Wording Only
ห้ามแตะ OCR, API, calculation, evidence schema, PDF export, PDF password, SFX, legal triage
ก่อนแก้ให้สรุป root cause, files in scope, files out of scope, risk gates และ verification plan ก่อน
ถ้าต้องแก้ export format หรือ data semantics ให้หยุดถามก่อน
```

## Self-Review

- Spec coverage: ครอบคลุมการหั่น patch เล็ก, ห้ามทำทั้งหมด, scope/out-of-scope, root cause ก่อนแก้, verification, และตัวอย่าง patch ตามที่ผู้ใช้ให้
- Conflict alignment: สอดคล้องกับ Master Plan, Compatibility Blueprint, และ Implementation Sequence
- Placeholder scan: ไม่มี placeholder ที่ต้องเดาเอง
- Unknown: ยังไม่ได้ตรวจโค้ดจริง จึงยังไม่มีรายชื่อไฟล์ in scope จริง
- Untested: ยังไม่ได้ run build/test/browser/export/SFX
