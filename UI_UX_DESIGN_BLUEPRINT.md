# Digital Evidence — Multi-Page UI/UX Design Blueprint

วันที่จัดทำ: 16 พฤศจิกายน 2026 · ขอบเขต: Information Architecture, Layout, Navigation, Components, Tokens และ Interaction States เท่านั้น

## วิธีอ่านและขอบเขตความครบถ้วน

- **Observed / O:** พบโครงสร้างในซอร์ส UI ปัจจุบัน ไม่ใช่ผลรับรองว่าทุกสถานะรันผ่านจริง
- **Specification / S:** ข้อกำหนดดีไซน์สำหรับนำไปทำหน้าจอให้สม่ำเสมอ ยังไม่ใช่สิ่งที่ยืนยันว่าติดตั้งในแอปแล้ว
- เว็บหลักปัจจุบันมี route `/` เป็น workspace เดียว มี 4 center views, panels, dialogs และ full-screen preview เอกสารนี้แยกทั้งหมดเป็น **22 logical pages** เพื่อส่งต่องานออกแบบ ไม่อ้างว่ามี URL 22 หน้า
- หน้า 02, 06, 16, 18, 20–22 เป็น panel/subview/สถานะเฉพาะงานที่เข้าจากหน้าแม่ ไม่ใช่เมนูหลักเพิ่มเติมที่สร้างขึ้นเอง
- Empty/loading/error/disabled ที่ระบุเป็นสัญญาการแสดงผลสำหรับงานดีไซน์ บางสถานะพบในโค้ดแล้ว บางส่วนเป็นข้อกำหนด S ต้องตรวจ implementation แยก
- ไม่เพิ่ม Login, Admin, Account Settings, Chatbot หรือหน้าโมเดลเทรนนิง เพราะไม่พบว่าเป็นหน้าผู้ใช้ใน workspace ที่สำรวจ
- ไม่ใส่ API, database, algorithm หรือโค้ดหลังบ้าน และไม่เปลี่ยนกฎธุรกิจของแอป
- เอกสารเป็น source-based blueprint ไม่ใช่การวัด screenshot ทุก viewport หรือคำรับรองความเหมือนทุกพิกเซล 100%

# ส่วนที่ 1: Site Tree & Navigation Architecture

```text
Digital Evidence — / [single workspace]
├── P01 Global Workspace Shell
│   ├── Brand / CHAT–SLIP / PDPA / เวลา / พิมพ์
│   ├── Workflow: Upload → Process & Match → Document & Audit → Export
│   ├── เลขเรื่อง / Online / Batch status
│   └── Footer runtime / current view
├── ฝั่งซ้าย: รับข้อมูลและเลือกหลักฐาน
│   ├── P02 Intake & Staging
│   │   ├── Drop zone / multi-file / queue / duplicate-file notice
│   │   ├── P03 Processing Progress & Recovery [inline state]
│   │   └── Trace download / named-group export
│   ├── P12 Detected Names & Organizations [modal]
│   │   ├── รายชื่อจากสลิป / ชื่อ clean / บัญชี / ยอด
│   │   └── ชื่อหรือหน่วยงานจากแชท / occurrence / เพิ่มเป้าหมาย
│   └── P13 Recipient & Target Review [panel]
│       ├── รายการเข้าเกณฑ์ / checklist 9 ข้อ / OCR alternatives
│       └── เลือกบุคคล / เพิ่มชื่อ / ส่งออกเฉพาะบุคคล
├── ฝั่งกลาง: Document View Switcher
│   ├── P04 Chat Evidence Canvas [EVIDENCE_A4 / CHAT]
│   │   ├── เปลี่ยนหน้า / source selector
│   │   ├── P06 Evidence Layers & Searchable Overlay [disclosure]
│   │   └── P21 A/B Artifact Selection [subview]
│   ├── P05 Slip Evidence Canvas [EVIDENCE_A4 / SLIP]
│   │   ├── P10 Forensic Slip Review [modal]
│   │   └── P22 External OCR Comparison [consent disclosure]
│   ├── P07 Cover Sheet [COVER_PAGE]
│   ├── P08 Hash Manifest [HASH_MANIFEST]
│   └── P09 Executive Summary [EXECUTIVE_SUMMARY]
├── ฝั่งขวา: สรุปและเครื่องมือ
│   ├── KPI 4 ใบ / Extraction Status
│   ├── P11 Evidence Ledger — 13 Columns [modal]
│   │   ├── แก้ field / เปิดต้นทาง / metadata JSON
│   │   └── P14 Duplicate Reference Review [nested section]
│   ├── P15 Chat–Slip Linkage [modal]
│   ├── P16 Legal Evidence & Reference [modal]
│   │   ├── สัญญาณจาก OCR / เปิดต้นฉบับ
│   │   ├── ข้อกฎหมายอ้างอิงทั่วไป / ค้นหา / ตัวกรอง
│   │   └── P17 Legal Research & Citations [inline subview]
│   ├── P18 Master Dossier Preview [full screen]
│   │   └── Column chooser [popover] / print preview / close
│   └── P19 Export & Packaging [panel]
│       ├── รหัสผ่านร่วม / PDF / ภาพอนุพันธ์ / สารบัญแยก
│       ├── P20 SFX Package [modal]
│       └── ผลค้นหาสลิปใน PDF [inline result cards / C19.4]
└── เลือกหลักฐาน/ปิดหน้าต่าง → กลับ workspace พร้อมบริบทเดิม
```

รายการผลค้นหาสลิปใน PDF เป็น **C19.4 ใน P19** ไม่ใช่หน้าใหม่ Page IDs P01–P22 ด้านล่างใช้สำหรับระบุหน้าที่ออกแบบและคอมโพเนนต์ที่ใช้ร่วมกัน

## กฎการนำทางข้ามหน้า (S)

1. เปลี่ยน center view แล้วยังคงคิวและรายการที่เลือก ไม่ตีความว่าเริ่มงานใหม่
2. เปิด modal โดยคงบริบทต้นทาง; ปิดแล้วคืน focus ไปปุ่มที่เรียก
3. เมื่อ “ดูหน้า/เปิดต้นฉบับ” ต้องเลือกไฟล์และหน้าที่เกี่ยวข้อง พร้อมแสดงตำแหน่งหลักฐาน
4. การยืนยันรายการใช้ปุ่มข้อความชัด ไม่ใช้เพียง checkbox เลือกเป้าหมายหรือปิด modal แทนการยืนยัน
5. Browser Back/deep link ยังไม่ได้รับรองในระบบเดิม ถ้าทำ navigation ใหม่ต้องมีข้อตกลง URL แยก ไม่สมมติว่ามีแล้ว
6. Stepper เป็นตัวสื่อขั้นตอน ไม่ควรออกแบบให้ทุกขั้นกดข้ามได้จนกว่าจะตรวจพฤติกรรมจริง

# ส่วนที่ 2: Page-by-Page UI Blueprint

## Design Tokens & Shared States

### A. สีและพื้นผิวที่พบในโค้ด (O)

| Token alias ในเอกสาร | ค่า/ความหมาย |
|---|---|
| BG | `#070a0f` deep background; slate `#0b0f17` |
| SURFACE | `rgba(15,23,42,.65)` glass |
| MODAL | `rgba(15,23,42,.85)` strong glass |
| NESTED | `rgba(255,255,255,.03)` |
| BORDER | 1px white 12%; highlight white 22% |
| CYAN | `#38bdf8` — navigation, actions, source links |
| GREEN | `#34d399` — eligible/success; ไม่ใช้แทน human confirmed ทุกกรณี |
| AMBER | `#f59e0b` — pending, conflict, warning |
| RED | `#f87171` — error/destructive |
| TEXT | `#f8fafc`; muted `#94a3b8`; dim `#64748b` |
| PAPER | white A4; slate-900 document text; slate borders |
| BLUR | panel 20px; modal 32px; saturation 180% |
| SHADOW | dark elevation + inset hairline; cyan/green glow alpha .25 |

### B. ขนาดและตัวอักษร

- O: Sarabun เป็น font-family หลัก; ยอด/Ref/hash ใช้ monospace; document แสดงภาษาไทยและตัวเลขชัดเจน
- O: shell header สูง clamp 72–92px; footer 32px; gap/padding workspace clamp 8–16px
- O: desktop grid `clamp(340px,22vw,440px) / minmax(480px,1fr) / clamp(340px,22vw,440px)`
- O: body/page ปิด outer scroll; panel เป็นบริเวณเลื่อน; A4 ใช้อัตราส่วนใกล้ 1:1.414
- O: glass input/button radius 8px; modal radius 16px; card ใช้หลายระดับประมาณ 8–16px ไม่ใช่ระบบเหลี่ยม 0–4px ทั้งหมด
- O: มี token section title 15–17px, label 13.5px, body 14px แต่หลายจุดใน workspace ยังใช้ 9–11px
- S: ใช้ `R4` 4px สำหรับตาราง/กรอบย่อย, `R8` 8px สำหรับ field/action, `R12` 12px card, `R16` 16px modal, `PILL` badge
- S: spacing scale `4/8/12/16/24/32px`; title 20–24px, section 16–18px, body 14–16px, metadata ≥12px; การยกระดับจากขนาดเดิมยังไม่ใช่ implementation แล้ว
- S: เป้ากดหลัก ≥44×44px; compact desktop row 36–40px ได้เมื่อมีบริบทการใช้งานเมาส์ชัด แต่ไม่ให้ไอคอนเล็กเป็นทางเข้าหลักเพียงทางเดียว

### C. State contract ใช้ร่วมทุกหน้า (S)

| State | ภาพและปฏิสัมพันธ์ |
|---|---|
| Default | BORDER; text readable; ปุ่มมีคำกริยา |
| Hover | surface สว่างขึ้น + border highlight; ไม่ใช้ hover เป็นวิธีเห็นข้อมูลเพียงอย่างเดียว |
| Focus-visible | outline 2px CYAN พร้อม offset; focus ไม่ถูก footer/header บัง |
| Active/Selected | accent border + label/icon state; ไม่ใช้สีอย่างเดียว |
| Disabled | ลด opacity พร้อมเหตุผล; ไม่เปลี่ยนไปเป็นผลสำเร็จ |
| Loading | spinner/progress + ชื่องาน; กันปุ่มเรียกซ้ำ; ไม่ใช้ยอดเดิมเป็นผลรอบใหม่ |
| Empty | บอกสิ่งที่ยังไม่มี + action ที่ไปต่อได้; ไม่ใส่ตัวอย่างเป็นหลักฐานจริง |
| Error | RED inline พร้อมคำอธิบาย; คง input; เสนอ retry เมื่อเหมาะสม |
| Review required | AMBER + ข้อความ “รอตรวจ”; เปิดภาพหรือหลักฐานได้ |
| Conflict | AMBER + alternatives หลายค่าและที่มา; ไม่มี default ที่ดูเหมือนผู้ใช้เลือกแล้ว |
| Human reviewed | GREEN + คำว่า “ผู้ใช้ตรวจแล้ว”; แยกจาก “OCR อ่านได้/เข้าเกณฑ์” |
| Privacy masked | ชื่อ/บัญชีปกปิด + badge; บอกข้อจำกัดการส่งออก |

### D. Responsive, keyboard และ print specification (S)

- ≥1440px: 3-column workspace; center ได้พื้นที่อ่านมากที่สุด
- 1024–1439px: ลด side panel, ย้ายเครื่องมือบางส่วนเป็น drawer ห้ามย่อข้อความจนอ่านไม่ได้
- <1024px: สลับ Intake / Evidence / Review เป็น views; modal ตารางเป็น full screen; ข้อเสนอนี้ยังไม่ยืนยันว่าระบบเดิมรองรับแล้ว
- ตารางกว้างเลื่อนแนวนอนใน table container มี scroll cue; ไม่ทำให้ทั้งหน้าเลื่อนแนวนอน
- Modal มี accessible title, focus containment, ปุ่มปิด, Escape เมื่อไม่ทิ้งข้อมูล, คืน focus หลังปิด; ไม่อ้างว่าระบบเดิมมีครบ
- ลด animation เมื่อผู้ใช้ตั้ง reduced motion; transition 120–180ms สำหรับ control; ไม่ใส่ glow วิ่งบนภาพหลักฐาน
- Print: PAPER พื้นขาว, ไม่พิมพ์ controls/blur/backdrop; มีเลขหน้าและ disclaimer; ห้ามตัดหัวตารางขาดจากแถวแรก

> ตาราง inventory ทุกหน้าด้านล่างระบุครบ Type, Props/Elements, Interactive States และ Tokens เพื่อใช้เป็น component specification ตัว interactive state พื้นฐานให้ใช้ contract C เพิ่มเติมจาก state เฉพาะที่ระบุ

## PAGE 01 — Global Workspace Shell

1. **Objective:** รู้ว่ากำลังทำคดี/ไฟล์ใด อยู่ขั้นไหน และเปิดงานย่อยได้โดยไม่เสียบริบท
2. **Macro layout:** O Flex column เต็ม viewport; header/stepper/main/footer; main CSS Grid 3 คอลัมน์; Compact
3. **Sub-menu:** CHAT/SLIP, PDPA toggle, Print; stepper 4 ขั้น; เลขเรื่อง; Online และ Batch indicators; center-view tabs
4. **Component inventory:**

| Component | Type | Props & Elements | Interactive States | Design Tokens |
|---|---|---|---|---|
| 🧩 C01.1 Identity header | Header/Flex | ตรา ชื่อแอป revision tagline | Default; logo ไม่ทำเป็นลิงก์ถ้าไม่มีปลายทาง | SURFACE, TEXT, BLUR |
| 🧩 C01.2 Mode & privacy | Segmented buttons/Switch | CHAT, SLIP; PDPA ON/OFF; accessible labels | Active mode; masked/unmasked; focus | CYAN, GREEN, R8 |
| 🧩 C01.3 Context strip | Input/Status badges | เลขเรื่อง เวลา Online batch state | Editing, online/offline, running/stale | MONO, AMBER, PILL |
| 🧩 C01.4 Workflow stepper | Stepper | 4 ขั้น ชื่อขั้น เครื่องหมายสำเร็จ | Current/completed/pending; ไม่แสดง clickable เกินจริง | CYAN/GREEN/muted, BORDER |
| 🧩 C01.5 Workspace frame | Grid/Panels | Intake, Canvas, Review | Empty, processing, restored queue | BG, SURFACE, 8–16px gap |
| 🧩 C01.6 Print/footer | Button/Status bar | พิมพ์ runtime current view | Hover/pressed; print state | R8, MONO, BORDER |

## PAGE 02 — Intake & Staging Buffer

1. **Objective:** รับภาพหลายไฟล์ ตรวจรายการก่อนเริ่ม และเลือกไฟล์ที่ต้องดู
2. **Macro layout:** O Flex vertical ใน left panel; drop zone → notices → queue → counters; Compact, scroll ภายใน
3. **Sub-menu:** เลือกไฟล์, ล้างคิว, เริ่มประมวลผล, ดาวน์โหลด JSON Trace; ส่งออกกลุ่มชื่อไฟล์/Slip Index
4. **Component inventory:**

| Component | Type | Props & Elements | Interactive States | Design Tokens |
|---|---|---|---|---|
| 🧩 C02.1 Upload zone | Drop zone/File picker | คำแนะนำ PNG/JPG/WEBP multi-file; ไม่แสดง PDF เป็นชนิดรับหลัก | Empty/drag-over/invalid/processing | dashed CYAN, NESTED, R12 |
| 🧩 C02.2 Queue control | Toolbar | จำนวนไฟล์ ปุ่มล้าง ปุ่มเริ่ม | Ready/disabled/busy; ล้างใช้ข้อความยืนยันเป็น S | GREEN primary, RED destructive, R8 |
| 🧩 C02.3 File item | Selectable card | thumbnail ชื่อ ประเภท สถานะ Remove; Gemini/SlipVision เมื่อมี | Selected/queued/processing/done/failed; actions แยกชัด | BORDER/CYAN, R8, badge |
| 🧩 C02.4 Duplicate-file notice | Alert/List | กลุ่มไฟล์ hash ตรง; ลำดับในคิว | None/groups found; ไม่ซ่อน occurrence | AMBER, MONO, R8 |
| 🧩 C02.5 Named groups | Group list/Actions | prefix, จำนวน, เตือนหลายกลุ่ม; PDF/Slip Index action | Empty/ready/exporting/error | CYAN, AMBER, compact |
| 🧩 C02.6 Trace & counts | Download button/Counter | จำนวนภาพ จำนวนหน้าแชท สลิปพบ/ยืนยัน | Trace unavailable/ready; zero ≠ failure | MONO, BORDER, GREEN |
| 🧩 C02.7 Restore/error notice | Alert | คืนคิวสำเร็จ/ข้อมูลกู้คืนไม่ได้/ไฟล์ผิดชนิด | Informative/error/recoverable | AMBER/RED, multiline |

## PAGE 03 — Processing Progress & Recovery

1. **Objective:** เห็นว่างานใดกำลังทำ ไม่เข้าใจผิดว่าค้าง และแยกผลเก่าจากรอบปัจจุบัน
2. **Macro layout:** O แทนพื้นที่ drop zone และสถานะ file item; S phase list เป็น Flex column ไม่เปิดหน้าใหม่
3. **Sub-menu:** ไม่มีเมนูใหม่; progress label/current file; retry จากข้อผิดพลาดเมื่อมี action รองรับ ไม่เพิ่ม Cancel/Pause ที่ยังไม่มี
4. **Component inventory:**

| Component | Type | Props & Elements | Interactive States | Design Tokens |
|---|---|---|---|---|
| 🧩 C03.1 Phase progress | Progress bar/Status | phase, current/total, ชื่อไฟล์ | Determinate/indeterminate/complete; QR จบต้องไม่ค้างแทน OCR | CYAN→GREEN, MONO |
| 🧩 C03.2 File processing badge | Inline status | กำลังวิเคราะห์/รอ/สำเร็จ/ล้มเหลว | Current vs previous result; busy | PILL, CYAN/RED |
| 🧩 C03.3 Error recovery | Alert/Action | เหตุที่อ่านไม่ได้ ขั้นที่ผิด ผลที่เก็บได้ | Error, retryable/non-retryable; ไม่รีเซ็ตคิวเอง | RED/AMBER, R8 |
| 🧩 C03.4 Batch status | Status badge/Disclosure | running/completed/stale และข้อมูลเมื่อมี | Stale ≠ running; ไม่มีค่าปัจจุบันแสดง Unknown | MONO, muted/AMBER |

## PAGE 04 — Chat Evidence A4 Canvas

1. **Objective:** อ่านภาพแชทพร้อมบริบทและกลับไปยัง occurrence ที่ต้องตรวจ
2. **Macro layout:** O center Flex column; toolbar บน; PAPER A4 ตรงกลาง; pager; fit-to-screen; ภาพไม่ยืดผิดสัดส่วน
3. **Sub-menu:** แคนวาส A4, source selector, เปิด A/B, ก่อนหน้า/ถัดไป, ชั้นหลักฐาน; ไป P05/P06/P21
4. **Component inventory:**

| Component | Type | Props & Elements | Interactive States | Design Tokens |
|---|---|---|---|---|
| 🧩 C04.1 A4 frame | Document canvas | ตรา MODE, PAGE, วันที่ ภาพแชท footer | No selection/loading/loaded/image error | PAPER, ratio 1:1.414, document shadow |
| 🧩 C04.2 Pager | Button group/Label | หน้าแชท n/N ก่อนหน้า/ถัดไป | Boundary disabled/current page; focus | CYAN, MONO, R8 |
| 🧩 C04.3 Source identity | Metadata strip | ชนิดภาพ source SHA; original/review-only label | Masked/long hash wrap; copy เป็น S ไม่สมมติว่ามีปุ่ม | MONO, BORDER |
| 🧩 C04.4 Source jump | Evidence anchor | ไฟล์ หน้า จุดที่เลือกจากตาราง | Selected/highlight/invalid mapping | CYAN outline; ไม่วาดทับไฟล์ดิบ |
| 🧩 C04.5 View tabs | Tab bar | A4 / Cover / Hash / Summary | Active/hover/focus; retained selection | R8, CYAN, SURFACE |

## PAGE 05 — Standalone Slip Canvas

1. **Objective:** ดูสลิปเดี่ยวที่เลือกให้ชัดและเข้าสู่หน้าตรวจรายละเอียด
2. **Macro layout:** O ใช้ center frame ร่วม P04; ภาพ fit ภายใน A4; S reviewer ควรเข้าถึงขนาดอ่านจริงได้โดยไม่อ้างว่ามี zoom slider แล้ว
3. **Sub-menu:** เปิดหน้า Review สลิป, source selector, A/B, evidence layers, export selected derived; P10/P21/P22
4. **Component inventory:**

| Component | Type | Props & Elements | Interactive States | Design Tokens |
|---|---|---|---|---|
| 🧩 C05.1 Slip image | Image/Document | สลิปต้นฉบับหรือ review variant พร้อมชื่อชนิด | Loading/loaded/unreadable; source badge ต้องอยู่ | PAPER, contain, BORDER |
| 🧩 C05.2 Review launcher | Primary button | เปิดหน้า Review สลิป | Enabled เมื่อมีข้อมูล; disabled พร้อมเหตุ | CYAN, R8, 44px S |
| 🧩 C05.3 Candidate context | Badge/Metadata | occurrence หน้า source confidence เมื่อมี | Candidate/confirmed/conflict | AMBER/GREEN/MONO |
| 🧩 C05.4 OCR alternative entry | Disclosure | ไป external OCR comparison | Collapsed/expanded/unsupported format | AMBER, R8 |

## PAGE 06 — Evidence Layers & Searchable Overlay

1. **Objective:** แยกภาพที่มองเห็นออกจากข้อความ/พิกัดที่ระบบอ่านได้ และตรวจย้อนกลับได้
2. **Macro layout:** O disclosure ใน Canvas; object/text mode buttons + image overlay + scrollable trace; Dense แต่ไม่บังตัวอักษร
3. **Sub-menu:** Layer 1 objects / Layer 2 text; trace accordion; enhancement artifacts; OCR text
4. **Component inventory:**

| Component | Type | Props & Elements | Interactive States | Design Tokens |
|---|---|---|---|---|
| 🧩 C06.1 Layer controls | Disclosure/Segmented buttons | จำนวนวัตถุ/ข้อความ toggle layer | Collapsed/expanded/active/empty | CYAN, R8 |
| 🧩 C06.2 Region overlay | SVG/Overlay | bbox, label, selected region; ไม่แทนภาพดิบ | Default/selected; S hover tooltip ไม่เป็นทางเดียว | CYAN/AMBER 1–2px stroke |
| 🧩 C06.3 Searchable text | Text layer/List | OCR source text, bounds, confidence | Empty/found/uncertain; ห้ามสมมติว่ามี search input จาก sr-only text | TEXT, MONO metadata |
| 🧩 C06.4 OCR diagnostics | Accordion/Preformatted text | attempts, raw lines, region information | Expanded/overflow/long text | NESTED, R4, MONO |
| 🧩 C06.5 Artifact list | Metadata cards/Images | variant dimensions hash stages ที่มี | Present/missing/selected | fuchsia accent เดิม; R4 |

## PAGE 07 — Court Cover Sheet

1. **Objective:** สื่อสารตัวตนแฟ้ม เลขเรื่อง และสารบัญองค์ประกอบเอกสาร
2. **Macro layout:** O PAPER A4, vertical document; title block → case context → table/list → footer; Spacious กว่า workspace
3. **Sub-menu:** center tabs; print/export จาก shell; หน้านี้เป็น document view ไม่ใช่ฟอร์มกรอกทุก field โดยตรง
4. **Component inventory:**

| Component | Type | Props & Elements | Interactive States | Design Tokens |
|---|---|---|---|---|
| 🧩 C07.1 Cover masthead | Document header | โลโก้ ชื่อแฟ้ม คำอธิบาย | Preview/print; missing logo fallback S | PAPER, title 20–24px |
| 🧩 C07.2 Case identity | Definition list | เลขเรื่อง ชื่อผู้เกี่ยวข้อง/ข้อมูลเจ้าหน้าที่เมื่อมี | Present/empty placeholders/masked | TEXT dark, label/body hierarchy |
| 🧩 C07.3 Contents summary | Table/List | แชท สลิป สรุป เป้าหมาย คู่หลักฐาน แฮช แพ็กเกจตามรายการเปิดใช้ | Enabled sections/omitted sections; no fake pages | BORDER slate, R4 |
| 🧩 C07.4 Document footer | Disclaimer/Page footer | ข้อความบทบาทเครื่องมือ วันเวลา/เลขหน้าเมื่อมี | Preview/print | muted dark; small readable S |

## PAGE 08 — Hash Manifest

1. **Objective:** อ่านรายการไฟล์และค่าลายนิ้วมือโดยไม่สับสนกับการยืนยันความจริงของเนื้อหา
2. **Macro layout:** O PAPER A4 header + 5-column table + footer; Compact table; hash แสดงครบและ wrap
3. **Sub-menu:** center tabs; print/รวมเล่มจาก shell
4. **Component inventory:**

| Component | Type | Props & Elements | Interactive States | Design Tokens |
|---|---|---|---|---|
| 🧩 C08.1 Manifest title | Document header | บัญชีคุมแฮช เลขเรื่อง/บริบท | Preview/print | PAPER, bold |
| 🧩 C08.2 Hash table | Data table | ลำดับ ชื่อไฟล์ หมวด ขนาด bytes SHA-256 64 ตัว | Empty/rows/long filename/hash wrap | MONO hash; slate BORDER |
| 🧩 C08.3 Source type marker | Badge/Cell | CHAT/SLIP/REPORT/LEDGER | Type label; no hover-only meaning | muted fills, R4 |
| 🧩 C08.4 Explanatory footer | Text | ความหมาย hash/ขอบเขตเอกสาร | Static | PAPER, body text |

## PAGE 09 — Executive Summary

1. **Objective:** เห็นยอดจากรายการยืนยัน จำนวนสลิป และประเด็นตรวจต่อในเอกสารเดียว
2. **Macro layout:** O PAPER A4; header → 3 KPI Grid → 2-column recipient detail → summary/disclaimer
3. **Sub-menu:** center tabs; print; เปลี่ยนข้อมูลผ่าน review/target ไม่ใช่แก้เลข KPI ในหน้านี้
4. **Component inventory:**

| Component | Type | Props & Elements | Interactive States | Design Tokens |
|---|---|---|---|---|
| 🧩 C09.1 Summary header | Document header | ชื่อเอกสาร เลขเรื่อง ตรา | Preview/print | PAPER, slate text |
| 🧩 C09.2 Three metrics | KPI cards/Grid | Net total, slip count, linkage count; explanation under value | Data/no confirmed data; candidate ≠ confirmed labels S | pastel GREEN/CYAN/purple, R4 |
| 🧩 C09.3 Recipient summary | Definition list | บุคคล ยอดเกี่ยวข้อง Ref signal วันเวลา | Selected/no target/masked | 2-col, MONO amount |
| 🧩 C09.4 Narrative scope | Text panel | สรุปบทบาทแฟ้มและการตรวจซ้ำ | Static/no invented facts | slate BORDER, R4 |
| 🧩 C09.5 Print footer | Disclaimer | ขอบเขตเครื่องมือ | Print/preview | muted document text |

## PAGE 10 — Forensic Slip Review Modal

1. **Objective:** ตรวจรายละเอียดสลิปที่เลือกกับความมั่นใจและภาพหลักฐานก่อนออกจากหน้าตรวจ
2. **Macro layout:** O max-width 2xl, max-height 85vh; fixed header/footer; scroll body; field cards Grid 2 คอลัมน์
3. **Sub-menu:** ปิด, ยืนยันข้อมูลในรายการตรวจ/ไปหน้าปกตามพฤติกรรมเดิม; ต้องแยก label จากปุ่มยืนยันธุรกรรมใน P11 (S)
4. **Component inventory:**

| Component | Type | Props & Elements | Interactive States | Design Tokens |
|---|---|---|---|---|
| 🧩 C10.1 Review dialog | Modal | title Close context | Open/close/focus; S focus return | MODAL, R16, BLUR |
| 🧩 C10.2 Hash card | Metadata card | SHA-256 และข้อความอธิบาย | Ready/missing; S หลีกเลี่ยง VERIFIED ที่ชวนคิดว่าโอนจริง | MONO, CYAN |
| 🧩 C10.3 Warnings | Alert stack | ข้อสังเกตจากการอ่าน | None/pending/conflict/error | AMBER, R8 |
| 🧩 C10.4 Field cards | Grid/Read-only cards | ธนาคาร ยอด วันเวลา Ref ผู้โอน/ผู้รับ บัญชี confidence | Present/missing/masked; uncertainty explicit | NESTED, MONO values, GREEN accent receiver |
| 🧩 C10.5 Memo card | Optional text card | บันทึกช่วยจำ | Hidden if absent; ไม่ทำให้ดูผิดเงื่อนไข | R8, body text |
| 🧩 C10.6 Footer actions | Button group | Close / continue review-to-cover | Default/hover/active; semantics ชัด | CYAN primary, neutral secondary |

## PAGE 11 — Evidence Ledger: 13 Columns

1. **Objective:** ตรวจและแก้ทุก transaction field พร้อมหลักฐานต้นทางและสถานะมนุษย์ตรวจ
2. **Macro layout:** O modal เกือบเต็ม viewport, max-height 88vh; sticky-like fixed header/footer + horizontal table scroller; Dense
3. **Sub-menu:** row source link/JSON, bank dropdown, editable fields, ยืนยัน/ยกเลิก; duplicate review; Markdown/NET JSON/Slip JSON/XLSX/Print; เล่มภาพ/สารบัญแยก
4. **Component inventory:**

| Component | Type | Props & Elements | Interactive States | Design Tokens |
|---|---|---|---|---|
| 🧩 C11.1 Ledger header | Modal header | title 13 columns, เลขเรื่อง บุคคล สัญญาณซ้ำ Close | Open/empty; long context wrap | MODAL, CYAN BORDER |
| 🧩 C11.2 Evidence table | Data table | ลำดับ, หน้าแชท, หน้าแฟ้ม, ภาพ/พิกัด, วันเวลา, ธนาคาร, Ref, ผู้โอน, บัญชีต้นทาง, ผู้รับ, บัญชีปลายทาง, ยอด, สถานะ | Hover row/selected/reviewed/duplicate; scroll X visible | BORDER, zebra NESTED, R4 |
| 🧩 C11.3 Field editor | Text/Number inputs/Select | bank options; Ref/name/account/amount; labels per row | Editing/dirty S/invalid/missing; don't overwrite raw OCR display | R4/R8, focus CYAN, MONO refs |
| 🧩 C11.4 Field provenance | Inline status/Disclosure | confidence ข้อเสนอธนาคาร OCR alternatives/source | Suggested/conflict/masked; click source | AMBER/CYAN, ≥12px S |
| 🧩 C11.5 Review action | Explicit text button | ยืนยันรายการ / ยกเลิกยืนยัน | Pending/human reviewed/blocked when rules require | GREEN vs AMBER; label mandatory |
| 🧩 C11.6 Ledger totals | Summary row | Gross confirmed, duplicate signals, net review context | No confirmed total/confirmed totals; ไม่ใส่ 0 แทนอ่านไม่ออก | MONO, GREEN, BORDER |
| 🧩 C11.7 Export footer | Toolbar/Button groups | Markdown, NET Review JSON, slip index JSON, XLSX, Print, Close; separate image/index exports | Ready/exporting/disabled; page-map unavailable explanation | CYAN/GREEN/AMBER, R8 |

## PAGE 12 — Detected Names & Organizations

1. **Objective:** เลือกบุคคลที่ต้องติดตามจากหลักฐาน โดยไม่ตีความชื่อที่พบเป็นผู้กระทำผิด
2. **Macro layout:** O modal 4xl/88vh; header → counters → 6-col names table → chat entity cards; scroll body
3. **Sub-menu:** เพิ่มเป็นเป้าหมาย/อยู่ในรายการแล้ว; เปิด occurrence; Close
4. **Component inventory:**

| Component | Type | Props & Elements | Interactive States | Design Tokens |
|---|---|---|---|---|
| 🧩 C12.1 Counts | Stat badges | จำนวนชื่อจากสลิป/เป้าหมาย | Empty/nonzero; labels neutral | CYAN/GREEN, PILL |
| 🧩 C12.2 Names table | Data table | ลำดับ raw name clean name ธนาคาร/บัญชี ยอด Action | Empty/rows/masked/already selected | BORDER, zebra, MONO amounts |
| 🧩 C12.3 Add target | Button/State chip | เพิ่มบุคคลเข้ารายการเป้าหมาย | Available/already added/disabled | CYAN, GREEN chip |
| 🧩 C12.4 Chat entities | Cards/Occurrence links | บุคคล/องค์กร raw text หน้า confidence | Pending/ambiguous/open source | AMBER, R8 |
| 🧩 C12.5 Name-policy footer | Text/Close | อธิบายการจับชื่อโดยไม่รวมคำนำหน้า; Close | Static/keyboard close | muted, MONO metadata |

## PAGE 13 — Recipient & Target Review Panel

1. **Objective:** แยกยอดที่พบ เข้าเกณฑ์ และผู้ใช้ยืนยัน พร้อมจัดรายการบุคคลที่เลือก
2. **Macro layout:** O left panel Flex; recipient groups → occurrence cards → selected targets → manual add; compact scroll
3. **Sub-menu:** checkbox เลือกบุคคล; ดูหน้า; checklist; OCR evidence; XLS/PDF เฉพาะคน; เพิ่มชื่อ/นำออก
4. **Component inventory:**

| Component | Type | Props & Elements | Interactive States | Design Tokens |
|---|---|---|---|---|
| 🧩 C13.1 Recipient group | Card/Checkbox | name, found/eligible/excluded/duplicate counts, eligible sum | Selected/unselected/masked/no eligible | GREEN amount, AMBER pending, R8 |
| 🧩 C13.2 Occurrence card | Evidence card | จำนวนเงิน ไฟล์ หน้า พิกัด ดูหน้า | Eligible/unknown/duplicate; preserve amount independently | NESTED, CYAN source |
| 🧩 C13.3 Nine-item checklist | Accordion/List | 8 mandatory + memo optional, 100 score, bonus | Found/unknown/absent; memo ไม่พบไม่เป็น error | GREEN/AMBER, text labels |
| 🧩 C13.4 OCR alternatives | Disclosure/Chips/Pre | ชื่อหลาย variant raw OCR origin | Conflict/no alternatives/expanded | AMBER, monospace raw, R4 |
| 🧩 C13.5 Target item | Card/Actions | name role sum selection; XLS/PDF/Remove | Added/selected/exporting/masked | GREEN/CYAN/RED, R8 |
| 🧩 C13.6 Manual add | Text input/Button | ชื่อเพิ่มเองและ + เพิ่ม | Empty/typing/invalid/added; label visible S | R8, CYAN focus |

## PAGE 14 — Duplicate Reference Review

1. **Objective:** เปรียบเทียบ occurrence ที่ Ref ตรงและบันทึกการตัดสินของผู้ตรวจ
2. **Macro layout:** O section ซ้อนใน P11; group cards + member selector + actions; ไม่เปิด browser route ใหม่
3. **Sub-menu:** เลือก master, ยืนยันรายการอื่นเป็นสำเนา, ยืนยันคนละธุรกรรม, ล้างข้อสรุป; เปิดคู่หลักฐาน
4. **Component inventory:**

| Component | Type | Props & Elements | Interactive States | Design Tokens |
|---|---|---|---|---|
| 🧩 C14.1 Duplicate group | Grouped card | Ref, จำนวนสมาชิก, บริบทเวลา/ยอดเมื่อมี | Unresolved/resolved/conflicting | AMBER outline, MONO |
| 🧩 C14.2 Master selector | Select/Option list | ไฟล์/หน้า/occurrence เป็นตัวเลือก | Selected/available/invalid | R8, CYAN focus |
| 🧩 C14.3 Resolution actions | Button group | สำเนา/คนละธุรกรรม/ล้างข้อสรุป | Pending/confirmed resolution; disabled reason | GREEN/neutral/AMBER |
| 🧩 C14.4 Compare links | Source anchors | เปิดภาพที่ Ref ตรง สัญญาณภาพคล้าย | Found/unevaluated/unavailable | CYAN underline; explicit “สัญญาณ” |

## PAGE 15 — Chat–Slip Linkage Review

1. **Objective:** ตรวจข้อเสนอจับคู่ข้อความกับสลิปโดยเห็นหลักฐานทั้งสองฝั่ง
2. **Macro layout:** O modal 4xl/88vh; 3 KPI Grid → export notice → candidate list; S pair cards 2-col desktop/stack small screen
3. **Sub-menu:** เปิดแชท/สลิป, ส่งออกชุดคู่หลักฐานรอตรวจ, ปิด; action อื่นให้ใช้เฉพาะที่มีจริง
4. **Component inventory:**

| Component | Type | Props & Elements | Interactive States | Design Tokens |
|---|---|---|---|---|
| 🧩 C15.1 Linkage metrics | 3 KPI cards | OCR proposals, chat pages with embedded slips, Ref signals | Zero/nonzero; candidate wording | GREEN/CYAN/AMBER, R8 |
| 🧩 C15.2 Pair evidence | Comparison card | ข้อความแชทและสลิป หน้า ยอด Ref confidence/reason เมื่อมี | Proposed/conflict/missing side | SURFACE, source CYAN |
| 🧩 C15.3 Source navigation | Link buttons | กลับแชท/ดูสลิปในบริบท | Available/unmapped | underline CYAN, R8 |
| 🧩 C15.4 Review packet | Action banner | คำอธิบาย “ยังไม่ยืนยันความสัมพันธ์”, จำนวนคู่, export | Empty/ready/building/error | AMBER warning, CYAN action |

## PAGE 16 — Legal Evidence & References

1. **Objective:** อ่านข้อความที่ตรวจพบแยกจากคำอธิบายกฎหมาย พร้อมกลับไปดูหลักฐาน
2. **Macro layout:** O modal 5xl/90vh; sticky header/footer; top OCR hits → reference panels 2-col → 4-col mapping table → disclaimer; scroll body
3. **Sub-menu:** เปิดหลักฐาน/ค้นคว้า FourCorners; ค้นคำ; ทั้งหมด/แพ่ง/อาญา; พิมพ์บันทึก A4; Close
4. **Component inventory:**

| Component | Type | Props & Elements | Interactive States | Design Tokens |
|---|---|---|---|---|
| 🧩 C16.1 Legal header | Modal header/Badge | ชื่อหน้า Human review scope | Open/close; badge ไม่อ้าง legal verdict | indigo BORDER, MODAL R16 |
| 🧩 C16.2 OCR signal card | Evidence card | ข้อความ OCR คำจับพบ ไฟล์ หน้า confidence rule source/version/status | Empty/hits/unknown source; links | AMBER, CYAN anchors |
| 🧩 C16.3 Reference panels | Cards/Grid | หมวดอาญา/แพ่ง ชื่อประเด็น บทอ้างอิง “ไม่ใช่ข้อความจากหลักฐาน” | Read-only/collapsed S; no fake quotes | RED tint criminal/CYAN civil; R12 |
| 🧩 C16.4 Search/filter | Search input/Segmented tabs | ค้นคำ/หน้า/มาตรา; All/Civil/Criminal counts | Typing/active/no results/clear S | R8, indigo active |
| 🧩 C16.5 Mapping table | 4-col Data table | หน้า, ข้อความที่ตรวจพบ, ประเภทกฎหมาย, ประเด็นกฎหมาย | Filtered/empty/source jump; labels separate quoted OCR from summary | BORDER, R8, category badge |
| 🧩 C16.6 Scope warning | Alert | ข้อมูลประกอบ ไม่ตัดสิน ต้องตรวจบริบท/ฉบับกฎหมาย | Always visible near results | AMBER, multiline |
| 🧩 C16.7 Print/close footer | Button group | พิมพ์บันทึกข้อกฎหมาย A4 / Close | Print-ready/empty/close | indigo primary, neutral |

## PAGE 17 — Legal Research & Citations

1. **Objective:** อ่านผลค้นคว้าแยกจาก OCR และตรวจแหล่งอ้างอิงได้
2. **Macro layout:** O inline result panel ภายใน signal card P16; ไม่สร้างห้องแชท AI ใหม่
3. **Sub-menu:** ค้นคว้าประเด็น, เปิด citation, เปิดต้นฉบับ; retry ต้องสอดคล้องข้อความข้อจำกัดบริการ
4. **Component inventory:**

| Component | Type | Props & Elements | Interactive States | Design Tokens |
|---|---|---|---|---|
| 🧩 C17.1 Research trigger | Button/Disclosure | ชื่อบริการ สิ่งที่จะส่งเป็นข้อความ/คำถาม | Ready/busy/disabled; privacy notice | CYAN/indigo, R8 |
| 🧩 C17.2 Research answer | Read-only text panel | provider name คำตอบ ที่มาผลค้นคว้า | Loading/success/empty/error | indigo surface, multiline |
| 🧩 C17.3 Citation list | Link list | label/title/source URL | Hover/focus/new tab/unavailable | CYAN underline, wrap URLs |
| 🧩 C17.4 Provider failure | Alert | quota/timeout/ไม่สำเร็จ; สถานะหลักฐานไม่เปลี่ยน | Retryable/non-retryable | AMBER/RED; no success badge |

## PAGE 18 — Master Dossier Full-Screen Preview

1. **Objective:** ดูแฟ้มทุกหน้าในลำดับก่อนพิมพ์ ไม่สับสน preview กับไฟล์ส่งออกที่มีรหัส
2. **Macro layout:** O full-screen overlay z50; top bar 64px; centered A4 stack max-width ~850px; scroll vertical gap 40px
3. **Sub-menu:** พิมพ์ Preview, Close, SLIP mode control ที่พบใน preview; column chooser บนตาราง; ข้อความรหัสสำหรับไฟล์ดาวน์โหลด
4. **Component inventory:**

| Component | Type | Props & Elements | Interactive States | Design Tokens |
|---|---|---|---|---|
| 🧩 C18.1 Preview toolbar | Sticky header/Flex | logo ชื่อแฟ้ม total pages Print Close password badge | Preview open/print; ไม่อ้าง encrypted preview | SURFACE, MONO, R8 |
| 🧩 C18.2 Page stack | Document list | cover, summary, ledger, hash, evidence ตามชุดจริง | Loading/complete/empty; page breaks | PAPER, shadow, A4 |
| 🧩 C18.3 Column chooser | Popover/Checkbox list | 13 ชื่อคอลัมน์ toggle Close | Open/checked/unchecked; keyboard S | MODAL, BORDER, R8 |
| 🧩 C18.4 Document navigation | Scroll landmarks | section title/page identity | Current scroll/print; ไม่เพิ่ม sidebar thumbnails เป็น observed | PAPER, document labels |
| 🧩 C18.5 Print behavior | Print-only view | ซ่อน controls รักษาหัวตาราง/เลขหน้า | Preview vs print media | no blur/shadow in print S |

## PAGE 19 — Export & Packaging Panel

1. **Objective:** เลือกชนิดผลส่งออก เห็นขอบเขตไฟล์และสถานะ และไม่เข้าใจว่าภาพอนุพันธ์คือต้นฉบับ
2. **Macro layout:** O right Flex panel; document tools → password card → derived/PDF/SFX → feedback/PDF search results; Compact
3. **Sub-menu:** Cover/Hash/Summary/Legal/Master; รหัสร่วม; PDF ภาพอนุพันธ์, PDF, SFX; รายการสารบัญแยกอยู่ P11
4. **Component inventory:**

| Component | Type | Props & Elements | Interactive States | Design Tokens |
|---|---|---|---|---|
| 🧩 C19.1 Document tools | Vertical button list | cover/hash/summary/legal/master | Active destination/hover/focus | CYAN/indigo, R8 |
| 🧩 C19.2 Shared password | Password input/Badge | รหัสเดียว PDF/SFX; เว้นว่างได้; PASSWORD SET/NO PASSWORD | Empty/filled/focus; hide value | NESTED, AMBER badge, R8 |
| 🧩 C19.3 Export actions | Button stack | selected file derived PDF, PDF, SFX | No selected file/ready/exporting/disabled | AMBER derived, GREEN→CYAN PDF, blue SFX |
| 🧩 C19.4 PDF search results | Status/Result cards | message, count, PDF pages, amount/date/bank/Ref, names, memo, review badge, repeated Ref, raw OCR disclosure | Idle/scanning/complete none/complete results/error | CYAN/GREEN/RED; AMBER review |
| 🧩 C19.5 Download feedback | Inline live status | สิ่งที่สร้างสำเร็จ/ผิดพลาด | Working/success/error; distinguish download requested vs saved | GREEN/RED, readable multiline |

## PAGE 20 — SFX Package Modal

1. **Objective:** ตรวจเนื้อหาแพ็กเกจและรหัสที่ใช้ก่อนกดสร้างดาวน์โหลด
2. **Macro layout:** O modal xl, header/body/footer Flex; กล่องอธิบาย → password state → file list → actions
3. **Sub-menu:** สร้างและดาวน์โหลด SFX จริง; Close; password ใช้ค่าร่วมกับ P19 ไม่เพิ่มช่องที่ยังไม่มี
4. **Component inventory:**

| Component | Type | Props & Elements | Interactive States | Design Tokens |
|---|---|---|---|---|
| 🧩 C20.1 Package dialog | Modal header | แพ็กเกจ SFX (.exe), builder label, Close | Open/closed/focus | blue BORDER, MODAL, R16 |
| 🧩 C20.2 Protection summary | Info card | ตั้งรหัส/เว้นว่าง; ขอบเขต PDF และแพ็กเกจ | Protected intent/no password; ไม่แสดงรหัสจริง | AMBER/CYAN, R8 |
| 🧩 C20.3 Package contents | File list | Report PDF, manifest, original uploads ตามคำอธิบาย | Present/empty; long filename wrap S | MONO, BORDER |
| 🧩 C20.4 Build actions | Primary/Secondary buttons | สร้างดาวน์โหลด / Close | Ready/building/disabled/error/success | blue primary, neutral secondary |

## PAGE 21 — A/B Artifact Selection & Preview

1. **Objective:** เทียบภาพที่ใช้ดูและภาพที่ใช้ประมวลผลโดยยังรู้ว่าต้นฉบับคืออะไร
2. **Macro layout:** O toolbar บน Canvas; select + import button + source metadata; ภาพแทนที่ใน center viewport ไม่ใช่ภาพดิบถูกเขียนทับ
3. **Sub-menu:** ภาพรีวิวเดิม/ต้นฉบับ/variants ที่มี; เปิดผลวิจัย A/B (JSON); Canvas controls เดิม
4. **Component inventory:**

| Component | Type | Props & Elements | Interactive States | Design Tokens |
|---|---|---|---|---|
| 🧩 C21.1 Artifact selector | Select | source/variant labels | Default/selected/unavailable; no invented variants | R8, CYAN focus |
| 🧩 C21.2 Research import | File picker/Button | เลือก JSON A/B ชื่อไฟล์/สถานะ | Idle/importing/invalid/ready | CYAN, error RED |
| 🧩 C21.3 Provenance strip | Metadata | original/derived/review-only, dimensions/hash เมื่อมี | Long data/wrap/selected | MONO, BORDER |
| 🧩 C21.4 Variant image | Image panel | ภาพ variant ภายใน frame เดียว | Loading/display/error; original available | PAPER/neutral; ห้ามแต่งสี UI ลง evidence |

## PAGE 22 — Optional External OCR Comparison

1. **Objective:** ขอความยินยอมก่อนส่งภาพออก และเปรียบเทียบผลโดยไม่แอบแทนข้อมูลเดิม
2. **Macro layout:** O disclosure ใต้ข้อมูล review ที่รองรับภาพ; คำอธิบาย → consent → CTA → result Grid 2 columns
3. **Sub-menu:** OpenTyphoon disclosure, consent checkbox, ส่งภาพไปอ่าน, ผลเทียบ; Gemini/SlipVision entry อยู่ file card P02 ไม่ใช่ CTA เดียวกัน
4. **Component inventory:**

| Component | Type | Props & Elements | Interactive States | Design Tokens |
|---|---|---|---|---|
| 🧩 C22.1 Provider disclosure | Details/Info text | provider ชัดเจน ข้อมูลภาพที่จะออกนอกเครื่อง | Collapsed/expanded/unsupported hidden ตามชนิดไฟล์ | AMBER, BORDER |
| 🧩 C22.2 Explicit consent | Checkbox/Label | ยินยอมส่งภาพสลิปนี้ไป provider ที่ระบุ | Unchecked/checked; focus | AMBER/CYAN, 44px target S |
| 🧩 C22.3 OCR request action | Button/Loading label | ส่งภาพไปอ่าน OCR ภายนอก | Disabled ก่อน consent/busy/error | AMBER outline, R8 |
| 🧩 C22.4 Comparison result | Read-only field grid | ค่าจาก provider, confidence/warnings เมื่อมี; “ไม่เขียนทับข้อมูลเดิม” | Empty/success/conflict/error | NESTED, TEXT, source label |
| 🧩 C22.5 Local-only alternative | Helper text/Back | ใช้ local review ต่อได้ | Provider unavailable/declined | muted TEXT; no forced upsell |

## ความสัมพันธ์ของ states ที่ห้ามสื่อผิด

| สถานการณ์ | ข้อความ/รูปแบบ UI ที่ควรใช้ (S) | ห้ามใช้ |
|---|---|---|
| อ่านยอดได้แต่ป้ายสถานะอ่านไม่ครบ | “อ่านยอดได้ … · รอตรวจองค์ประกอบ: …” | “โอน 0 บาท” หรือ “ไม่ใช่สลิป” |
| สลิปเข้าเกณฑ์ 100 | “เข้าเกณฑ์คำนวณ · รอผู้ใช้ตรวจข้อมูล” | “ยืนยันธุรกรรมจริงแล้ว” |
| ชื่อจาก OCR มีหลายค่า | แสดง alternatives + source + review status | เลือกชื่อที่รู้จักโดยไม่มีหลักฐาน |
| หน้า 1 เต็ม หน้า 3 ขาด | แยก occurrence และผลแต่ละใบ | รวมคำ/คะแนนข้ามหน้า |
| Ref ตรง | “สัญญาณ Ref ตรงกัน” + review tools | “ซ้ำแน่นอน” จากสัญญาณเพียงอย่างเดียว |
| Memo ไม่มี | “ข้อมูลเสริม — ไม่บังคับ” | error สีแดง/ตัดสิทธิ์เพราะไม่มี memo |
| กฎหมายจับคำได้ | “ประเด็นควรตรวจ” และเปิด OCR source | ประโยคแต่งใหม่ที่แสดงเป็นคำพูดในแชท |
| Provider ใช้ไม่ได้ | error ของบริการ + ใช้ local review ต่อ | ลบผลเดิม/ยืนยันแทน/แจ้งสำเร็จ |
| มี hash | “ลายนิ้วมือไฟล์” | “เนื้อหาเป็นความจริง” |
| ตั้งรหัสส่งออก | “ตั้งรหัสสำหรับไฟล์ดาวน์โหลด” | “Preview ถูกเข้ารหัสแล้ว” |

# ส่วนที่ 3: Global UI Component Matrix

Page IDs อ้างตาม inventory ข้างต้น; เมื่อนำไปสร้าง design library ให้ใช้ component families นี้เพื่อเลี่ยงสไตล์ซ้ำซ้อน ไม่ถือว่าแอปเดิมถูก refactor ตามตารางแล้ว

| Shared component family | Instances ตัวอย่าง | Pages ที่ใช้ซ้ำ | Variants / ข้อกำหนด reuse |
|---|---|---|---|
| Global shell | Header/stepper/footer | P01–P09, P13, P19, P21 | Desktop; contextual panels; modal ไม่ซ้ำ header ทั้งชุด |
| Glass panel/card | Queue, group, result | P02–P06, P10–P17, P19–P22 | Surface/nested/warning; R8/R12 |
| Modal frame | Header/body/footer/close | P10–P12, P15–P16, P20 | xl/2xl/4xl/5xl/full-width; shared focus contract |
| Full-screen frame | Dossier preview | P18 | Sticky toolbar + scroll pages |
| Primary/secondary action | Process, review, export | P01–P05, P10–P22 | cyan/green/amber/neutral/destructive; shared busy state |
| Icon action | Remove/Close/source | P02, P10–P22 | accessible label, focus, ≥44px target S |
| Mode/tab controls | CHAT/SLIP, views, layer/filter | P01, P04–P06, P16, P18 | Selected label/border; controlled semantics |
| Status badge | Candidate/privacy/provider | P01–P03, P05, P10–P22 | pending/eligible/human reviewed/error; ห้ามสีแทนความหมาย |
| Alert/banner | Restore, warnings, consent | P02–P03, P10–P11, P14–P17, P19–P22 | info/warning/error; text + action |
| File picker/drop zone | Evidence / A/B import | P02, P21 | multi-image vs JSON; labels แยกชนิด |
| Image/evidence frame | Chat/slip/variant | P04–P06, P10, P14–P15, P18, P21 | Original/derived label always retained |
| Source link | Open original/page/occurrence | P04–P06, P11–P17, P19 | file + page context; unavailable mapping state |
| Document A4 | Cover/hash/summary/evidence | P04–P09, P18 | PAPER; print styles; page identity |
| KPI card | Shell metrics/summary/linkage | P01, P09, P15, P19 | 2×2 workspace vs 3-col document; value scope label |
| Data table | Hash, ledger, names, mapping | P08, P11–P12, P16, P18 | 5/13/6/4 cols; horizontal scroller where necessary |
| Editable field | case/ledger/manual target | P01, P11, P13 | text/number/select; stable labels; error association |
| Password field | Shared export password | P19, P20 summary | masked input; never echo secret in text |
| Checkbox | Target/consent/columns | P12–P13, P18, P22 | action meanings distinct; no confirmation side-effect |
| Accordion/disclosure | Checklist/OCR/trace/provider | P06, P11, P13, P19, P22 | collapsed/expanded, count, keyboard |
| Raw text block | OCR source/diagnostics | P06, P11, P13, P19 | selectable, wrap, max-height; preserve original wording |
| Metadata strip | SHA/dimensions/page | P02, P04–P08, P10–P11, P21 | monospace; full value accessible |
| Field result | Local vs alternative | P10–P11, P13, P22 | source/confidence/alternatives/review status |
| Comparison card | Duplicate/linkage | P14–P15 | two sources with page anchors; stack small screens S |
| Search/filter | Legal mapping | P16 | All/Civil/Criminal; no results state |
| Citation link | Provider references | P17 | title + URL, new tab indication S |
| Progress/status | Current run/export/research | P03, P17, P19–P22 | determinate/indeterminate; aria-live S |
| Export action group | File-type choices | P02, P11, P13, P15–P16, P18–P20 | format-specific scope; busy/disabled reasons |
| Empty state | No files/results/confirmed data | P02–P22 ตามบริบท | tell next action; zero amount ≠ unknown |
| Privacy presentation | Names/accounts/exports | P01, P04–P05, P09–P13, P16, P18–P22 | masking needs consistent source labels; no claim of full security compliance |

## Coverage & Design QA Checklist

- [ ] ทุก P01–P22 มี objective/layout/navigation/inventory พร้อม type, props, states, tokens
- [ ] 4 center views ครบ: A4, cover, hash, executive summary
- [ ] Modal ครบ: slip review, ledger, linkage, SFX, legal, detected names, full-screen dossier
- [ ] Nested views ครบ: duplicate review, column chooser, A/B selection, OCR layers, external consent, PDF-search results
- [ ] ไม่สับสนว่า eligible กับ human reviewed คือสถานะเดียวกัน
- [ ] ไม่ปะปน OCR quotes กับคำอธิบายกฎหมาย/ผลค้นคว้า
- [ ] Empty, error, loading, focus และ disabled มีคำอธิบายที่ออกแบบไว้
- [ ] ตาราง 13 คอลัมน์ยังอ่านได้ ไม่แก้ปัญหาความกว้างด้วยการย่อ font เหลือ 9px
- [ ] ควบคุม keyboard/modal focus/reduced-motion และตรวจ contrast จริงก่อนอ้าง accessibility
- [ ] Print preview แยกจาก encrypted download และ derived image แยกจาก original
- [ ] ตรวจหน้าจอจริงตาม viewport เป้าหมายก่อนรับรอง pixel-level completeness

Checklist นี้เป็นเกณฑ์ส่งมอบงานออกแบบ ไม่ใช่รายงานว่าทดสอบทุกข้อแล้ว

## Source References / Inspection Scope

- `src/app/page.tsx` — navigation, center views, side panels, dialogs และ actions
- `src/app/globals.css` — glass/color/radius/typography tokens ที่ตรวจพบ
- `src/styles/layout-framework.css` — shell/grid/spacing/fit-to-screen
- `src/components/CourtCoverSheet.tsx` — cover document
- `src/components/HashManifestTable.tsx` — hash table
- `src/components/ExecutiveSummarySheet.tsx` — executive document
- `src/components/MasterDossierFullBook.tsx` — full-screen preview
- `src/components/LedgerColumnToggle.tsx` — column selector
- `src/components/TyphoonOcrReview.tsx` — consent/comparison UI
- `src/components/ModeSelectorPanel.tsx` — preview mode control
- `APP_FEATURES.md` — feature inventory สำหรับประกอบการอ่าน ไม่ใช้แทน UI implementation

การตรวจรอบนี้เป็นการอ่านซอร์สที่เกี่ยวข้อง ไม่ได้แก้แอป ไม่ได้สร้าง route ใหม่ ไม่ได้ deploy และไม่ได้รัน browser interaction ครบทุก modal
