# 📜 บันทึกประวัติการสนทนาและการพัฒนาระบบ EVIDENCE (ฉบับสมบูรณ์ ล่าสุด)
> **ช่วงเวลาบันทึก**: เริ่มต้นโครงการ จนถึง 06 กันยายน 2026 (19:05 น.)  
> **เป้าหมาย**: บันทึกทุกคำขอ ฟีดแบค การแก้ปัญหาทางเทคนิค และการออกแบบสถาปัตยกรรมระบบทั้งหมด

---

## 📑 สรุป Timeline การสนทนาและขั้นตอนการพัฒนาแบบเรียงลำดับ (Full Transcript & Milestones)

### 🔹 ลำดับที่ 1: กำเนิดสกิล Detail_Data (สกัดสลิปสู่ Excel A4 แนวนอน)
* **สิ่งที่ผู้ใช้ขอ**: ต้องการแปลงข้อมูลสลิปที่สกัดจาก AI ให้เป็นตาราง Excel (.xlsx) ที่จัดหน้าพร้อมพิมพ์ A4 แนวนอน (Page Break ทุก 20 บรรทัด)
* **การดำเนินการ**:
  * วางโครงสร้าง [`config/schema.json`](file:///C:/Users/EVE/.gemini/config/skills/Detail_Data/config/schema.json) กำหนด 10 คอลัมน์มาตรฐาน (ลำดับ, วันที่, เวลา, ธนาคารผู้โอน, ชื่อผู้โอน, จำนวนเงิน, ชื่อผู้รับ, ธนาคารผู้รับ, บันทึกช่วยจำ, หมายเหตุ)
  * เขียนสคริปต์ [`generate_excel.py`](file:///C:/Users/EVE/.gemini/config/skills/Detail_Data/scripts/generate_excel.py) จัดบล็อคละ 20 แถว พร้อมหัวกระดาษ `EVIDENCE`, โลโก้ และข้อความ Disclaimer 3 บรรทัดจัดกึ่งกลางท้ายกระดาษ
  * สร้าง [`GEMINI_GEM_MASTER_PROMPT.md`](file:///C:/Users/EVE/.gemini/config/skills/Detail_Data/GEMINI_GEM_MASTER_PROMPT.md) สำหรับทำ Gemini Gem อ่านสลิปและส่งออกเป็น JSON

---

### 🔹 ลำดับที่ 2: ระบบ Background Silent Watcher & Google Drive (Drop & Go)
* **สิ่งที่ผู้ใช้ขอ**: "ผมโยนไปพักนึงละ ดูโฟลเดอร์เอ้า ไม่เห็นมีไรเลย" อยากได้ระบบอัตโนมัติที่โยนไฟล์ปุ๊บ ทำงานเบื้องหลังเงียบๆ แล้วผลลัพธ์ออกทันที
* **การวิเคราะห์และแก้ไขปัญหา (Root Cause & Fix)**:
  * **ปัญหา Encoding ภาษาไทยบน Windows**: คำว่า `เดสก์ท็อป` ทำให้คำสั่ง `print()` เกิด `UnicodeEncodeError: charmap/cp1252` จึงสร้างฟังก์ชัน `log()` เขียนลง `watcher.log` แทนคอนโซล
  * **ปัญหา `pythonw.exe` ไม่มี stdout**: ปรับโค้ดให้รองรับ GUI Subsystem ปราศจาก Crash
  * **ปัญหา OpenCV อ่านพาทไทยไม่ออก**: ใช้ `cv2.imdecode(np.fromfile(...))` แทน `cv2.imread()`
  * **ติดตั้งเข้า Windows Startup**: สร้าง [`start_evidence_watcher.vbs`](file:///C:/Users/EVE/.gemini/config/skills/Detail_Data/scripts/start_evidence_watcher.vbs) รันแบบไร้หน้าต่างดำ และสร้าง Shortcut ใน `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\`

---

### 🔹 ลำดับที่ 3: ปรับแต่งสลิปเดี่ยวและใบสรุปแนวนอน (Legal-Grade Evidence)
* **สิ่งที่ผู้ใช้ขอและฟีดแบค**:
  1. *สลิปต้องอยู่กึ่งกลางกล่องทั้งแกน X และ Y*
  2. *รูปสลิปทับซ้อนกัน ให้ปรับเป็นสลิปละ 1 หน้าเดี่ยวๆ*
  3. *หน้าสุดท้ายให้เป็นใบสรุป 10 คอลัมน์*
  4. *ฟอนต์ใบสรุปต้องเป็น `Sarabun Light`*
  5. *ปรับเป็นแนวนอนแค่แผ่นสรุปแผ่นเดียว*
  6. *ช่องตารางขยายออกกว้างขึ้น และตัวอักษรอยู่กึ่งกลางช่องทุกช่อง*
* **การดำเนินการแก้ไข**:
  * เพิ่มฟังก์ชัน `trim_outer_padding()` ลบขอบขาวรอบสลิปอัตโนมัติ
  * ปรับฟังก์ชัน `add_single_page_image()` จัดสลิปเดี่ยวลงบน A4 แนวตั้ง (Portrait 993 × 1406 px) วางกึ่งกลางบล็อคเนื้อหา (Center X & Y) พอดีเป๊ะ
  * เพิ่มฟังก์ชัน `add_10col_landscape_summary_page()` สลับหน้าสุดท้ายเป็น **A4 แนวนอน (1406 × 993 px)** ตารางกว้าง 1,202 px ใช้ฟอนต์ **`Sarabun-Light.ttf`** ข้อความและตัวเลขจัดวาง **กึ่งกลางเซลล์ (Center-Aligned)** ทั้งแนวนอนและแนวตั้ง

---

### 🔹 ลำดับที่ 4: ถอดรหัสสถาปัตยกรรม Automation และแนวคิดสากล
* **คำถามของผู้ใช้**: "ระบบสไตล์โยนไปอีกแปปออกมา มีชื่อเรียกทางเทคนิคไหม? นำไปปรับใช้กับงานอื่นได้อย่างไร และมี Automation แบบอื่นอีกไหม?"
* **คำตอบและการจัดหมวดหมู่**:
  1. **Hot Folder Pattern / Drop-and-Go Pipeline** (แบบที่ใช้อยู่)
  2. **Webhook / API Event-Driven Automation** (ยิงสัญญาณ Real-time เช่น LINE Bot)
  3. **Scheduled / Cron Job** (ทำงานตามรอบเวลา เช่น รายงานเที่ยงคืน)
  4. **Multi-Agent AI Workflow** (AI แบ่งงาน คิด-ทำ-ตรวจทานตัวเอง)
  5. **Headless RPA & Web Scraping** (หุ่นยนต์คลิกเว็บแทนมนุษย์)
  6. **Clipboard Listener Hook** (ดึงข้อความจากการ Copy ไปประมวลผลทันที)

---

### 🔹 ลำดับที่ 5: จัดทำแพ็กเกจส่งต่อ Gemini Notebook (Knowledge & Context Export)
* **สิ่งที่ผู้ใช้ขอ**: บันทึกข้อมูลทั้งหมดเป็น JSON, README, และเอกสารสถานะโครงการ (PROJECT_STATUS) พร้อม Custom Persona เพื่อนำไปวางใน Google Gemini Notebook / NotebookLM
* **เอกสารที่ส่งมอบ**:
  1. [`PROJECT_STATUS.md`](file:///C:/Users/EVE/OneDrive/เดสก์ท็อป/EVIDENCE_NOTEBOOK_EXPORT/PROJECT_STATUS.md) — สถานะระบบ ภาพรวม สเปค และโร้ดแมป
  2. [`automation_architect_framework.json`](file:///C:/Users/EVE/OneDrive/เดสก์ท็อป/EVIDENCE_NOTEBOOK_EXPORT/automation_architect_framework.json) — นิยามบทบาท พิมพ์เขียว 5 รูปแบบ และ Checklist
  3. [`conversation_history.json`](file:///C:/Users/EVE/OneDrive/เดสก์ท็อป/EVIDENCE_NOTEBOOK_EXPORT/conversation_history.json) — ประวัติและสเปคเชิงลึกแบบ Structured Data
  4. Master Zip Archive: [`EVIDENCE_ALL_IN_ONE.zip`](file:///C:/Users/EVE/OneDrive/เดสก์ท็อป/EVIDENCE_ALL_IN_ONE.zip) รวมทุกไฟล์ในระบบ

---

### 🔹 ลำดับที่ 6: การย้ายพาท In/Out และการเปิดเผยกลไกการทำงาน (The Magic Revealed)
* **คำถามของผู้ใช้**: 
  1. *โฟลเดอร์ อิน เอ้า ผมย้ายพาทได้ไหม?*
     - **คำตอบ**: ย้ายได้ 100% โดยแก้ไขที่ไฟล์ [`config/gdrive_config.json`](file:///C:/Users/EVE/.gemini/config/skills/Detail_Data/config/gdrive_config.json) ได้ทันที
  2. *ทำได้ไง มีโค้ดอะไรที่เอาไฟล์ไปวางแล้วระบบรันเอง เวทมนตร์มาก?*
     - **คำตอบ**: อธิบายกลไก 5 ชิ้นส่วน (Infinite Polling Loop `time.sleep(5)` -> File Stability Size Check -> `pythonw.exe` + VBScript Windowless -> Windows Startup Hook -> Auto-Archive to `processed/`)

---

## 🏛️ สรุปโครงสร้างไฟล์ทั้งหมดในระบบ (Complete Component Map)

```
EVIDENCE System
├── Desktop Hot Folders (C:\Users\EVE\OneDrive\เดสก์ท็อป\)
│   ├── EVIDENCE_IN/                      # กล่องรับสลิป JSON
│   ├── EVIDENCE_CHAT_IN/                 # กล่องรับภาพแชท/สลิปรูปภาพ
│   ├── Folder_Out/                       # กล่องรับผลลัพธ์ Excel (.xlsx) และ PDF (.pdf)
│   ├── EVIDENCE_NOTEBOOK_EXPORT/         # เอกสารสำหรับ Gemini Notebook
│   └── EVIDENCE_ALL_IN_ONE.zip           # ไฟล์ซิปรวมทุกอย่างในโครงการ
│
├── Detail_Data Skill (C:\Users\EVE\.gemini\config\skills\Detail_Data\)
│   ├── config/
│   │   ├── schema.json                   # กำหนดโครงสร้าง 10 คอลัมน์
│   │   └── gdrive_config.json            # กำหนด Path In/Out และ Google Drive
│   ├── scripts/
│   │   ├── generate_excel.py             # เอนจินวาด Excel A4 แนวนอน 20 แถว/หน้า
│   │   ├── gdrive_watcher.py             # เอนจิน Master Dual Silent Watcher
│   │   └── start_evidence_watcher.vbs    # ตัวรันเบื้องหลังไร้หน้าต่างดำ
│   ├── GEMINI_GEM_MASTER_PROMPT.md       # พรอมต์สำหรับ Gem อ่านสลิป
│   ├── SKILL.md                          # เอกสารข้อกำหนด Detail_Data
│   ├── README.md                         # คู่มือและสเปคตารางระบบ
│   ├── PROJECT_STATUS.md                 # เอกสารสถานะโครงการ
│   ├── CONVERSATION_HISTORY.md           # บันทึกประวัติการสนทนา
│   ├── conversation_history.json         # ประวัติการสนทนา JSON
│   └── automation_architect_framework.json # พิมพ์เขียวสถาปัตยกรรม Automation JSON
│
└── Dicut_Chat Skill (C:\Users\EVE\.gemini\config\skills\Dicut_Chat\)
    ├── assets/
    │   └── EVIDENCE.png                  # ตราสัญลักษณ์ EVIDENCE
    ├── scripts/
    │   └── process_chat.py               # Smart Slicing, Slip Center & Sarabun Light Summary
    ├── SKILL.md                          # ข้อกำหนด Dicut_Chat
    └── README.md                         # คู่มือและสเปคบล็อคหน้ากระดาษ
```
