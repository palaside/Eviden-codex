# Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` for implementation. Do not use subagents unless the user explicitly authorizes it. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** รวมแผนทั้งหมดที่คุยกันให้เป็นแผนแม่บทเดียว สำหรับค่อย ๆ ปรับระบบ Digital Evidence ให้เสถียร เป็นกลาง ตรวจสอบได้ และพร้อมส่งมอบลูกค้า โดยยังไม่ลงมือเขียนโค้ดในเอกสารนี้

**Architecture:** แผนนี้จัดงานเป็นสายพานจากฐานข้อมูลนำเข้าและ OCR ก่อน แล้วค่อยต่อด้วย metrics, ตาราง, เอกสาร, export/SFX, legal triage และ UX wording เพื่อเลี่ยงการแก้ปลายทางก่อนฐานข้อมูลต้นทางนิ่ง ทุกเฟสต้องจบด้วย verification gate ก่อนขยับไปเฟสถัดไป

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, OCR/Text Extraction Skills, local file processing, PDF/export pipeline, CSV/PDF/SFX packaging

## Global Constraints

- ภาษา UI และรายงานต้องเป็นกลาง: ใช้ `เรื่องตรวจสอบ`, `แฟ้มหลักฐาน`, `เอกสารประกอบ`, `บุคคลที่ตรวจพบ`, `บริบทเข้าข่ายเบื้องต้น`
- ห้ามฟันธงทางกฎหมาย: ระบบทำได้เพียง `ชี้เป้า`, `จัดกลุ่ม`, `แนะนำประเด็นตรวจสอบ`, ไม่ใช่คำวินิจฉัย
- ห้ามลงมือแก้โค้ดจากแผนนี้ทันที ต้องแตกเป็น patch ย่อยและอนุมัติ scope ก่อน
- ห้ามเพิ่ม dependency, เปลี่ยน export format, แตะ security/password, database, deployment หรือ destructive action โดยไม่ขออนุมัติ
- ทุก patch ต้องรายงาน Tier 1-4: Static, Logic/API, Integration, Real User Flow
- ถ้าไม่ทดสอบ tier ใด ต้องเขียนว่า `Not tested / ยังไม่ได้ทดสอบ`
- ถ้าข้อมูล OCR ไม่ครบ ต้องแสดงสถานะ `ต้องตรวจทาน` ไม่แปลงเป็นข้อมูลยืนยัน

---

## Phase 0: Baseline, Scope Lock, And Compatibility Blueprint

**เป้าหมาย:** ทำให้ทุกแผนที่คุยกันไม่ชนกันก่อนลงมือแก้ระบบ

**ต้องทำก่อนทุกเฟสอื่น**

- [ ] ระบุ entrypoint จริงของโปรเจกต์ เช่น `page.tsx`, components เอกสาร, utils OCR/export ที่เกี่ยวข้อง
- [ ] ทำ inventory เฉพาะไฟล์ที่เกี่ยวข้องกับ upload, OCR, detected persons, summary cards, evidence table, report preview, export, SFX
- [ ] ทำ Compatibility Blueprint แยกเป็น 5 กลุ่ม:
  - OCR/Input Pipeline
  - Evidence State/Metrics
  - Report/Table/Document Output
  - Export/SFX/Password
  - Legal/UX Wording
- [ ] ระบุจุดที่แผนชนกัน:
  - ตารางเดิม 13 คอลัมน์ ถูกเปลี่ยนเป็นตารางใหม่ 12 คอลัมน์ตามที่ผู้ใช้ฟันธงแล้ว
  - Card 3 กับปุ่มตรวจสอบความเชื่อมโยงมีเนื้อหาทับกัน ต้องแยกความหมายก่อนแก้ UI
  - legal triage ต้องใช้คำว่า `เข้าข่ายเบื้องต้น` ไม่ใช่ `ความผิด`
  - OCR slip extraction ต้องแก้ก่อน metrics/report เพราะข้อมูลต้นทางยังตกหล่น
- [ ] กำหนด patch order กลาง:
  1. Baseline และคำศัพท์กลาง
  2. OCR reliability
  3. Slip/person extraction schema
  4. Metrics cards
  5. Evidence table ใหม่
  6. Document/report preview
  7. Export/PDF/SFX/password
  8. Legal triage
  9. JEV decision/readiness
  10. Final QA

**ผลลัพธ์:** เอกสาร map ว่าแผนไหนทำก่อนหลัง และแผนไหนห้ามทำพร้อมกัน

**Verification Gate:** ยังไม่ต้อง build แต่ต้องตรวจว่าไม่มี requirement สำคัญหลุดจากแผน

---

## Phase 1: Neutral Wording And Domain Language Patch

**เหตุผลที่ต้องทำต้นทาง:** คำว่า `คดี`, `สำนวนศาล`, `ผู้ต้องหา`, `คดีอาญา` ทำให้ระบบดูเหมือนฟันธงก่อนกระบวนการจริง ต้องแก้ฐานภาษาก่อนสร้างรายงานเพิ่ม

**Dependencies:** Phase 0

**Scope:** UI labels, report preview wording, modal names, default case/reference number only

- [ ] เปลี่ยน default reference จาก `คดีอาญาที่ 012/2569` เป็น `เรื่องตรวจสอบที่ 012/2569`
- [ ] เปลี่ยน `รายชื่อที่ตรวจพบในคดี` เป็นคำกลาง เช่น `รายชื่อที่ตรวจพบจากหลักฐาน`
- [ ] เปลี่ยน `สำนวนศาล` เป็น `แฟ้มหลักฐาน` หรือ `เอกสารประกอบ`
- [ ] เปลี่ยนชื่อรายงานให้เป็นกลาง เช่น `รายงานสรุปแฟ้มพยานหลักฐานดิจิทัลเบื้องต้น`
- [ ] เก็บคำกฎหมายไว้เฉพาะส่วน `บริบททางกฎหมายเบื้องต้น`
- [ ] ใส่ disclaimer ว่าเป็น `การจัดกลุ่ม/ชี้เป้าเบื้องต้น ไม่ใช่คำวินิจฉัย`
- [ ] ตรวจคำแรงในจุดสำคัญ:
  - Header
  - Step bar
  - Left panel
  - Right cards
  - Modals
  - Print preview
  - Export file titles

**ผลลัพธ์:** ระบบพูดด้วยภาษากลาง เหมาะกับงานจัดระเบียบหลักฐานก่อนเป็นคดีจริง

**Verification Gate:** UI text check + report preview check

---

## Phase 2: OCR And Evidence Intake Reliability

**เหตุผลที่ต้องทำก่อน metrics:** ถ้าแชทมีสลิปแต่ OCR ตรวจไม่เจอ ทุก card, table, report, legal triage จะผิดตามทั้งหมด

**Dependencies:** Phase 0, Phase 1 wording baseline

**Scope:** Pipeline รับไฟล์, OCR, image preprocessing, slip-in-chat detection, evidence confidence

- [ ] ตรวจ data flow จริง:
  - Upload file
  - Staging buffer
  - OCR/text extraction
  - Slip detection
  - Person/amount/ref extraction
  - Evidence state
  - UI render
- [ ] ระบุ root cause ของกรณี `ไฟล์แชทมีสลิปแปะอยู่ แต่ตรวจไม่พบ`
- [ ] สำรวจสกิล OCR/text extraction ที่มีอยู่ในโฟลเดอร์ skills เฉพาะตัวที่เกี่ยวข้อง
- [ ] ออกแบบ fallback OCR 3 ชั้น:
  - ชั้นที่ 1: OCR ปกติจากภาพดิบ
  - ชั้นที่ 2: preprocess ภาพ เช่น contrast, denoise, crop candidate
  - ชั้นที่ 3: manual review queue เมื่อ confidence ต่ำ
- [ ] ออกแบบ temporary layer processing สำหรับภาพแชทพื้นหลังซับซ้อน:
  - Layer 1: bubble/message region detection
  - Layer 2: text/emoji/content extraction from bubble
  - Layer 3: slip-like region detection inside chat page
  - Layer 4: structured raw evidence payload
- [ ] แยก output เป็น 2 สาย:
  - สายภาพ: ใช้ตัดภาพแชทลง A4 blocks
  - สายข้อมูล: ใช้คำนวณ, ชี้เป้า, legal context, table, report
- [ ] เพิ่มสถานะ confidence:
  - `high`: นำเข้าตารางได้
  - `medium`: นำเข้าได้แต่ต้องติดธงตรวจทาน
  - `low`: เข้าคิวให้ผู้ใช้ตรวจเอง
- [ ] สร้าง audit reason ว่าทำไมสลิปหนึ่งใบถูกตรวจพบหรือไม่พบ

**ผลลัพธ์:** ลดโอกาสยอดเงินตกหล่น โดยเฉพาะสลิปที่อยู่ในภาพแชทหรือพื้นหลังซับซ้อน

**Verification Gate:** ใช้ชุดไฟล์ที่เคยตกหล่นเป็น regression set และเทียบกับ manual expected list

---

## Phase 3: Structured Evidence State And Detected Person Schema

**เหตุผล:** UI ซ้าย, cards ขวา, ตาราง, export, report ต้องดึงจาก schema เดียว ไม่ต่างคนต่างคำนวณ

**Dependencies:** Phase 2

**Scope:** normalized evidence model, person list, transaction list, source/page mapping

- [ ] กำหนด object กลางสำหรับรายการธุรกรรม:
  - transaction date/time
  - sender name
  - sender bank
  - receiver name
  - receiver bank
  - amount with satang
  - memo/note
  - bank reference id
  - source file/page/A4 page
  - relation status
  - confidence
  - review status
- [ ] กำหนด object กลางสำหรับบุคคลที่ตรวจพบ:
  - cleaned name
  - total amount
  - transaction count
  - selected as POI default false
  - source references
- [ ] กำหนด rule ลบซ้ำจาก reference id:
  - reference id ซ้ำถือเป็น transaction เดียว
  - ถ้าไม่มี reference id ให้ใช้ fallback fingerprint แต่ต้องติดธง `ต้องตรวจทาน`
- [ ] บังคับ left column checkbox default เป็น unchecked
- [ ] ถ้าพบชื่อเดียวหลายครั้ง ให้รวมยอดและรวมรายการอ้างอิง ไม่แสดงชื่อซ้ำแบบรก

**ผลลัพธ์:** มี state กลางที่ทุกโมดูลใช้ร่วมกัน ลด bug จากการคำนวณคนละชุด

**Verification Gate:** Unit tests สำหรับ aggregation, dedup, selected POI, page mapping

---

## Phase 4: Interactive Summary Cards And Metrics Engine

**Dependencies:** Phase 3

**Scope:** การ์ด 4 ใบใน right panel และผลต่อ executive/report summary

### Card 1: ยอดรวม

- [ ] แสดงยอดรวมจากบุคคล/ธุรกรรมทั้งหมดที่ตรวจพบ
- [ ] รวมเฉพาะ transaction ที่ผ่าน dedup แล้ว
- [ ] แสดงจำนวนสลิป/ธุรกรรมที่เกี่ยวข้อง
- [ ] ถ้าปิด card ต้องไม่นำค่าไปกรอกใน executive summary

### Card 2: ยอดเป้าหมาย

- [ ] รวมเฉพาะบุคคลที่ผู้ใช้ติ๊ก checkbox เป็น POI
- [ ] ค่าเริ่มต้นต้องเป็น 0 เพราะ checkbox default unchecked
- [ ] ถ้าไม่มี POI ให้แสดงว่า `ยังไม่เลือก`
- [ ] ถ้าปิด card ต้องไม่นำข้อมูล POI ไปกรอกในรายงาน

### Card 3: ความสัมพันธ์/หน้าสัมพันธ์

- [ ] แสดงจำนวนหรือสถานะการจับคู่ระหว่างแชท, สลิป, และหน้า A4
- [ ] ห้ามซ้ำกับปุ่ม `ตรวจสอบความเชื่อมโยง`
- [ ] Card 3 ควรเป็น KPI สั้น เช่น `จับคู่แล้ว 8/10` หรือ `พบในหน้า 3, 7`
- [ ] ปุ่มตรวจสอบความเชื่อมโยงควรเปิดรายละเอียด mapping แบบเต็ม

### Card 4: หมายเหตุ/สถานะสุทธิ

- [ ] ไม่ควรโชว์คำว่าไฟล์ซ้ำให้ลูกค้าเห็นในตารางหลัก
- [ ] Card 4 ใช้บอกสถานะ reconciliation แบบมืออาชีพ เช่น `ยอดสุทธิพร้อมตรวจทาน`
- [ ] รายละเอียดไฟล์ซ้ำควรอยู่ใน internal audit หรือ technical appendix เท่านั้น

**ผลลัพธ์:** การ์ดเป็นตัวควบคุมว่าจะเอา metric ไหนเข้า report และทำให้ผู้ใช้เข้าใจสถานะได้เร็ว

**Verification Gate:** คลิกเปิด/ปิด card แล้วดูผลใน report preview ว่าค่าไม่ถูกกรอกเมื่อปิด

---

## Phase 5: Evidence Table Redesign From 13 Columns To Final 12 Columns

**เหตุผล:** ผู้ใช้ฟันธงแล้วว่าตารางควรตัดเลขบัญชี, ค่าธรรมเนียม, duplicate status ออกจากตารางหลัก เพื่อให้ดูเป็นมืออาชีพและตรงประเด็น

**Dependencies:** Phase 3

**Final Columns:**

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

**Changes From Earlier 13-Column Plan:**

- [ ] เอาเลขบัญชีต้นทางออก
- [ ] เอาเลขบัญชีปลายทางออก
- [ ] เอาค่าธรรมเนียมออก
- [ ] เอาสถานะตรวจไฟล์ซ้ำออกจากตารางหลัก
- [ ] ย้าย duplicate/dedup detail ไปไว้ใน audit appendix หรือ internal technical note
- [ ] เรียงลำดับแถวด้วยวันและเวลาที่โอน ไม่ใช่ลำดับ upload

**Output Targets:**

- [ ] Modal table ในหน้าเว็บ
- [ ] ตารางใน report/print preview
- [ ] CSV/Excel-compatible export ถ้ายังต้องใช้
- [ ] Master PDF/SFX package

**ผลลัพธ์:** ตารางอ่านง่ายขึ้น เหมาะกับลูกค้าและเอกสารประกอบ ไม่เปิดรายละเอียดทางเทคนิคที่อาจทำให้รู้สึกไม่ดี

**Verification Gate:** ตรวจตารางจาก dataset ที่มีหลาย slip, วันเวลาไม่เรียง, reference ซ้ำ, และข้อมูลบางช่องหาย

---

## Phase 6: Court Tools / Document Tools Content Architecture

**Dependencies:** Phase 1, Phase 3, Phase 4, Phase 5

**Scope:** เครื่องมือ 4 ข้อแรก ยกเว้นข้อ 5 ตามที่ผู้ใช้เคยขออธิบายไว้

### Tool 1: Cover Page

- [ ] แสดงชื่อแฟ้มหลักฐาน/เรื่องตรวจสอบ
- [ ] แสดง reference number กลาง
- [ ] แสดงวันเวลาจัดทำ
- [ ] แสดงคำอธิบายว่าเป็นเอกสารประกอบเบื้องต้น
- [ ] ดึงข้อมูลจาก case/reference state และ metadata

### Tool 2: Chain Of Custody / Hash Control

- [ ] แสดงรายการไฟล์ที่นำเข้า
- [ ] แสดง SHA-256 หรือ hash ที่ใช้ตรวจความครบถ้วน
- [ ] แสดงเวลานำเข้าและสถานะไฟล์
- [ ] ดึงข้อมูลจาก file metadata/staged queue
- [ ] ไม่ควรเอาไปปะปนกับตารางหลักลูกค้า

### Tool 3: Executive Summary / Dashboard

- [ ] แสดง metric ตาม card ที่เปิดใช้งานเท่านั้น
- [ ] ถ้า card ปิด ต้องเว้นหรือไม่กรอกค่า ไม่ใช่ใส่ 0 ปลอม
- [ ] ดึงข้อมูลจาก normalized metrics state

### Tool 4: Legal Context / Preliminary Triage

- [ ] แสดงบริบทกฎหมายแบบ `ชี้เป้าเบื้องต้น`
- [ ] แยกแพ่ง/อาญา/อื่น ๆ ชัดเจน
- [ ] ทุกข้อมี confidence และ source quote
- [ ] ห้ามใช้ถ้อยคำฟันธง

**ผลลัพธ์:** เครื่องมือเอกสารแต่ละตัวมีหน้าที่ไม่ซ้ำกัน และรู้ว่าดึงข้อมูลจาก state ส่วนไหน

**Verification Gate:** เปิดแต่ละ modal/document แล้วตรวจว่าเนื้อหาไม่ปนกันและไม่ใช้คำแรง

---

## Phase 7: Header And Corroborated Text Rules

**Dependencies:** Phase 1, Phase 2, Phase 3

**Scope:** หัวกระดาษมีเฉพาะ `MODE`, `CORROBORATED`, `PAGE` และ `Timestamp` โดยใช้ข้อความสถานะด้านล่างเท่านั้น

- [ ] `MODE` บอกประเภทหลักฐานที่กำลังประมวลผล:
  - `CHAT`: ภาพแชท
  - `SLIP`: สลิปเดี่ยว
  - `HYBRID`: แชทพร้อมสลิป
- [ ] `CORROBORATED` เลือกข้อความตามหลักฐานของหน้านั้น:
  - สนทนาธรรมดา ไม่มีเรื่องเงิน: `บทสนทนาประกอบแฟ้มตรวจสอบ`
  - มีข้อความเกี่ยวกับเงิน แต่ยังจับคู่กับสลิปไม่ได้จริง: `พบข้อความเกี่ยวกับธุรกรรมทางการเงิน`
  - จับคู่กับสลิปได้จริง: `พบธุรกรรมทางการเงิน`
- [ ] `PAGE` บอกตำแหน่งหรือลำดับหน้าในแฟ้ม โดยอ้างจากลำดับหน้าที่เรนเดอร์
- [ ] `Timestamp` บอกเวลาที่ระบบสร้าง preview

**ผลลัพธ์:** คำบนหัวเอกสารสะท้อนสถานะจริง ไม่เกินหลักฐาน

**Verification Gate:** ตรวจข้อความทั้งสามกรณีของ `CORROBORATED`, โหมด `CHAT`/`SLIP`/`HYBRID`, ลำดับ `PAGE` และเวลา `Timestamp` จาก preview จริง โดยกรณีจับคู่ไม่ได้ต้องไม่แสดง `พบธุรกรรมทางการเงิน`

---

## Phase 8: Export, PDF Password, And SFX Packaging

**Dependencies:** Phase 5, Phase 6

**Risk Gate:** เฟสนี้แตะ export format, password, packaging และ user-visible delivery ต้องขออนุมัติก่อนลงมือ

- [ ] ตรวจระบบ export PDF ปัจจุบัน:
  - PDF ถูกสร้างจากอะไร
  - password ถูกใส่จริงหรือแค่เก็บค่าใน UI
  - ลูกค้าเปิด PDF แล้วขึ้น dialog ใส่รหัสจริงหรือไม่
- [ ] ตรวจระบบ SFX ปัจจุบัน:
  - ใช้ WinRAR SFX หรือกลไกใด
  - logo/ชื่อโปรแกรม/ข้อความ disclaimer เข้าไปใน SFX comment/config จริงหรือไม่
  - หลังแตกไฟล์ มีไฟล์อะไรบ้าง
  - ถ้าใส่ password ต้องถามตอนแตกไฟล์หรือถามตอนเปิด PDF
- [ ] แยกความหมาย password:
  - Password สำหรับเปิด PDF
  - Password สำหรับแตก SFX archive
  - Password สำหรับทั้งสองชั้น
- [ ] ออกแบบ delivery package:
  - PDF รายงานหลัก
  - CSV/Excel ถ้ามี
  - hash manifest
  - readme/disclaimer
  - optional technical appendix
- [ ] ทดสอบบนเครื่องจริง:
  - ดาวน์โหลด/เปิด SFX
  - แตกไฟล์
  - เปิด PDF
  - ใส่รหัส
  - ตรวจ logo/text/disclaimer

**ผลลัพธ์:** ผู้ใช้มั่นใจว่า export ส่งให้ลูกค้าแล้วเปิดได้ตามภาพอ้างอิง และมีรหัสตามที่ตั้งใจ

**Verification Gate:** Real User Flow บนไฟล์ export จริงเท่านั้น

---

## Phase 9: Legal Triage Knowledge Base For Money-Related Issues

**Dependencies:** Phase 2, Phase 3, Phase 6

**Risk Gate:** ต้องยืนยันว่าเป็น `legal triage / issue spotting` ไม่ใช่คำแนะนำทางกฎหมายหรือคำวินิจฉัย

- [ ] สร้างรายการกฎหมาย/มาตราที่เกี่ยวกับเงิน ๆ ทอง ๆ เป็น knowledge base:
  - ประมวลกฎหมายอาญา มาตรา 341
  - มาตรา 343
  - ประมวลกฎหมายแพ่งและพาณิชย์ มาตรา 420
  - มาตรา 406
  - มาตรา 438
  - มาตรา 653
  - อายุความ เช่น 193/14 หรือข้อเกี่ยวข้องตามบริบท
  - พ.ร.บ.คอมพิวเตอร์ฯ มาตรา 14(1)
  - พ.ร.ก./กฎหมายที่เกี่ยวกับบัญชีม้า ตามที่ตรวจพบและยืนยันแหล่งที่มา
- [ ] ทุกมาตราต้องมี:
  - องค์ประกอบแบบย่อย
  - keyword/phrase trigger
  - negative trigger หรือข้อควรระวัง
  - confidence scoring
  - source quote จาก evidence
  - disclaimer
- [ ] แยกผลลัพธ์ 3 กลุ่ม:
  - แพ่ง
  - อาญา
  - สารบัญชี้เป้า/ประเด็นให้ทนายตรวจต่อ
- [ ] ระดับความแม่นต้องรายงานเป็น confidence ไม่ใช่เปอร์เซ็นต์หลอก:
  - High: มีข้อความ+ยอดเงิน+สลิป/ref สอดคล้อง
  - Medium: มีข้อความและยอดเงิน แต่หลักฐานปลายทางไม่ครบ
  - Low: มีคำเสี่ยงแต่ไม่มีหลักฐานธุรกรรมรองรับ

**ผลลัพธ์:** ระบบช่วยจัดประเด็นให้ทนายและลูกความ โดยไม่ฟันธงแทนผู้เชี่ยวชาญ

**Verification Gate:** ต้องเทียบกับชุดตัวอย่างและให้มนุษย์ตรวจ legal mapping ก่อนใช้จริง

---

## Phase 10: JEV-Inspired Decision Readiness Logic

**Dependencies:** Phase 2, Phase 3, Phase 9

**Risk Gate:** ต้องตรวจ license/source ของ JEV ก่อนใช้แนวคิด ห้ามดึง repo/library ทั้งก้อน

- [ ] ตรวจ license และส่วนที่เกี่ยวกับ decision/rules/scoring ของ JEV
- [ ] สรุปเฉพาะ algorithm หรือ decision concept ที่ควรนำมา
- [ ] เขียนเป็น native utility ของโปรเจกต์เอง เช่น evidence readiness scoring
- [ ] ใช้กับ:
  - Card 3 relationship readiness
  - checklist ว่าหลักฐานครบหรือยัง
  - legal triage confidence
  - export readiness warning
- [ ] ห้าม copy โค้ดโดยไม่ตรวจ license

**ผลลัพธ์:** ระบบไม่ได้แค่สกัดข้อมูล แต่ช่วยบอกความพร้อมของแฟ้มหลักฐาน

**Verification Gate:** Unit test scoring rule + explainable reason output

---

## Phase 11: Skill-Based Development Workflow

**Dependencies:** Phase 0

**Scope:** วิธีเรียกใช้สกิลตอนทำงานจริง ไม่ใช่ฟีเจอร์ในเว็บ

- [ ] ก่อนเริ่มโปรเจกต์ใหม่ ใช้ `PLAN_UNIVERSAL_SKILL`
- [ ] เมื่อต้องเปลี่ยนไอเดียในหัวให้เป็นแผน ใช้ `PLAN_EVIDENCE_SKILL`
- [ ] เมื่อมีหลายแผนและต้องจัดลำดับ ใช้ `PLAN_USE_SKILL`
- [ ] เมื่อต้องเขียน implementation plan ราย feature ใช้ `writing-plans`
- [ ] เมื่อต้องลงมือจากแผน ใช้ `executing-plans`
- [ ] เมื่อมี bug หรือผลลัพธ์ผิด ใช้ `systematic-debugging`
- [ ] เมื่อ logic สำคัญต้องไม่พลาด ใช้ `test-driven-development`
- [ ] ก่อนสรุปว่าเสร็จ ใช้ `verification-before-completion`
- [ ] ก่อนส่งต่อ/บันทึกสถานะ ใช้ `save`

**ผลลัพธ์:** ทุกงานมีจังหวะคิดก่อนทำ ลดการสั่งแก้แบบกระโดดจนปลายทางพัง

**Verification Gate:** ทุก patch report ต้องบอกว่าใช้ skill ไหน และเพราะอะไร

---

## Phase 12: End-To-End QA And Customer Delivery

**Dependencies:** ทุกเฟสก่อนหน้า

- [ ] สร้าง test pack:
  - แชทล้วน
  - สลิปล้วน
  - แชทมีสลิปแปะ
  - แชทพื้นหลังลายเยอะ
  - สลิปซ้ำ reference เดียวกัน
  - วันเวลาไม่เรียง
  - OCR confidence ต่ำ
  - มีหลายชื่อ
  - มีชื่อเดียวซ้ำหลายรายการ
- [ ] ตรวจ 4-tier:
  - Tier 1: lint/type/build/static
  - Tier 2: unit/business logic
  - Tier 3: component/module integration
  - Tier 4: real browser/export/SFX/PDF flow
- [ ] ตรวจ output ลูกค้าจะได้รับ:
  - PDF หลักพร้อมรหัสถ้าตั้งไว้
  - ตารางหลัก 12 คอลัมน์
  - hash manifest
  - SFX package พร้อม logo/text/disclaimer ถ้าเปิดใช้
  - readme หรือคำอธิบายการเปิดไฟล์
  - optional appendix สำหรับ technical audit
- [ ] ตรวจถ้อยคำสุดท้าย:
  - ไม่มีคำฟันธง
  - ไม่มีคำว่าเป็นคดีแล้วโดยไม่จำเป็น
  - ทุกข้อทางกฎหมายเป็นชี้เป้าเบื้องต้น

**ผลลัพธ์:** ส่งงานให้ลูกค้าเป็นแพ็กเกจที่เปิดได้ อ่านรู้เรื่อง มีรหัสตามต้องการ และมีหลักฐานตรวจสอบย้อนกลับ

**Verification Gate:** ห้ามสรุปว่าเสร็จถ้าไม่ได้เปิดไฟล์ export จริง

---

## Recommended Execution Order

1. Phase 0: Baseline + Compatibility Blueprint
2. Phase 1: Neutral wording
3. Phase 2: OCR reliability
4. Phase 3: Structured state/schema
5. Phase 4: Summary cards
6. Phase 5: Final 12-column table
7. Phase 6: Document tools
8. Phase 7: Header/corroborated rules
9. Phase 8: Export/PDF/SFX/password
10. Phase 9: Legal triage knowledge base
11. Phase 10: JEV-inspired readiness
12. Phase 11: Skill workflow hardening
13. Phase 12: End-to-end QA and customer delivery

## Plans That Must Not Be Implemented Together In One Patch

- OCR reliability and legal triage: OCR must stabilize first
- Table column redesign and export/SFX: table schema must settle before export
- Neutral wording and legal knowledge base: wording baseline must be clear before legal text expands
- Card logic and document tool output: card state must be reliable before report consumption
- JEV readiness and OCR extraction: readiness scoring must consume stable extraction data

## Highest-Risk Bottlenecks

- Slip-in-chat OCR misses high-value slips
- Duplicate reference handling hides or double-counts money
- PDF password and SFX password are confused as one feature
- Legal text appears to accuse or decide liability
- Table/export/report use different schemas
- Header wording overstates corroboration
- UI shows metric as present while source data confidence is low

## First Patch To Execute Later

**Patch 1 should be Phase 0 only.**

Do not start with UI cards, table, legal triage, or export. The first safe patch is a read-only compatibility audit that identifies exact files, current data flow, current labels, current export behavior, and current OCR failure points. After that, choose the smallest next patch based on evidence.

## Self-Review

- Spec coverage: ครอบคลุมแผน cards, OCR slip-in-chat, layered preprocessing, JEV decision logic, neutral wording, document tools, header wording, legal triage, table redesign, export/PDF/SFX/password, skill workflow, final QA
- Conflict handling: แผน 13 คอลัมน์เดิมถูก supersede ด้วยตาราง 12 คอลัมน์ล่าสุด
- Unknowns: ยังไม่ได้ตรวจโค้ดจริง จึงยังไม่ยืนยันชื่อไฟล์/ฟังก์ชัน/สถานะ export/OCR ปัจจุบัน
- Untested: เอกสารนี้เป็นแผน ยังไม่ได้ run build, test, browser flow, export, หรือ SFX จริง
