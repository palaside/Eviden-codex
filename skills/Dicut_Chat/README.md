# Dicut_Chat: Legal-Grade Smart Evidence Engine (LINE Chat & Slips)

เครื่องมืออัตโนมัติสำหรับจัดการ ตัดแบ่ง ขยาย และประกอบรูปภาพแคปหน้าจอแชท (LINE Long Capture) และสลิปธุรกรรมทางการเงิน จัดลงบนหน้ากระดาษ A4 ในรูปแบบ **Legal-Grade Evidence** เพื่อใช้เป็นหลักฐานชั้นศาลและข้อกฎหมาย โดยยังคงความสมบูรณ์และรายละเอียดของภาพต้นฉบับ 100% พร้อม **ใบสรุปแนวนอน 10 คอลัมน์ฟอนต์ Sarabun Light**

---

## ✨ คุณสมบัติเด่น (Key Features)

1. **No OCR / No Re-rendering (ภาพแท้ 100%)**
   - ไม่มีการแปลงภาพเป็นข้อความแล้วพิมพ์ใหม่ เพื่อตัดความเสี่ยงเรื่องข้อความเพี้ยนหรือข้อกล่าวหาเรื่องการตกแต่งแก้ไขพยานหลักฐาน

2. **1-Slip-Per-Page & Auto-Trim Padding (สลิปละ 1 หน้าเดี่ยว วางกึ่งกลางสมบูรณ์)**
   - ตัดขอบขาวส่วนเกินรอบภาพสลิปอัตโนมัติ
   - วางสลิปตรงกึ่งกลางหน้ากระดาษ A4 ทั้งแกน X (แนวนอน) และแกน Y (แนวตั้ง)
   - หน้าละ 1 สลิปเดี่ยวๆ ไม่มีการต่อภาพซ้อนกัน

3. **ใบสรุปแนวนอน 10 คอลัมน์ (Landscape Summary Sheet - Sarabun Light)**
   - หน้าสุดท้ายของ PDF สลับเป็น **A4 แนวนอน (Landscape 1406 × 993 px)** อัตโนมัติ
   - ใช้ฟอนต์ **`Sarabun Light`** มาตรฐานราชการ สวยงาม คมชัด
   - ขยายช่องตารางกว้างเต็มหน้า (1,202 px) และจัดตัวอักษรให้อยู่ **กึ่งกลางช่อง (Center-Aligned ทั้งแนวนอนและแนวตั้ง)**

4. **Feather Blend Seam Removal (ลบรอยต่อแชทยาว)**
   - ผสานรอยต่อระหว่างภาพแคปแชทด้วยเทคนิค Gradient Alpha Blending (12 rows) หมดปัญหาเส้นดำขอบไฟล์ JPEG

5. **A4 Legal Format & EVIDENCE Branding**
   - ส่วนหัว (Header): กำกับหัวเรื่อง `EVIDENCE`, เลขหน้า, วันเวลา และ **โลโก้ EVIDENCE** ที่มุมขวาบน
   - ท้ายกระดาษ (Footer): ข้อความ Disclaimer 3 บรรทัดจัดกึ่งกลางหน้ากระดาษอย่างเป็นทางการ

6. **Full Automation (Zero-Command Watcher)**
   - มีระบบ Background Watcher ทำงานคู่ขนานร่วมกับ Google Drive และ Desktop Inbound (`EVIDENCE_CHAT_IN` / `EVIDENCE_IN`) โยนไฟล์เข้าไปปุ๊บ แปลงเป็น PDF ส่งเข้า `Folder_Out` อัตโนมัติทันที

---

## 📐 ข้อกำหนดพื้นที่หน้ากระดาษ (Layout Specifications)

| ส่วนประกอบ | หน้าสลิป/แชท (Portrait) | ใบสรุปตอนท้าย (Landscape) |
|---|---|---|
| **Canvas Size** | 993 × 1406 px | 1406 × 993 px |
| **Content Block** | 807 × 1115 px | 1202 × 793 px |
| **Margins Left / Right** | 93 px / 93 px | 102 px / 102 px |
| **Margins Top / Bottom** | 133 px / 158 px | 80 px / 100 px |

---

## 🚀 วิธีการใช้งาน (Usage)

### 🔹 วิธีที่ 1: ระบบอัตโนมัติ (Zero-Manual / Drop & Go) — แนะนำ
- เพียงโยนไฟล์รูปภาพแชท/สลิป เข้าไปที่:
  - Desktop: `C:\Users\EVE\OneDrive\เดสก์ท็อป\EVIDENCE_CHAT_IN` หรือ `EVIDENCE_IN`
  - Google Drive: โฟลเดอร์ `CHAT_IN` / `EVIDENCE`
- ระบบ Background Watcher จะประมวลผลให้เองและส่งไฟล์ PDF ไปที่ **`Folder_Out`** ทันที

### 🔹 วิธีที่ 2: รันผ่านคำสั่ง Terminal (Manual Mode)
```powershell
python <SKILL_DIR>/scripts/process_chat.py "<INPUT_FOLDER_OR_IMAGE>" "<OUTPUT_PDF_PATH>"
```

---

## 📂 โครงสร้างไดเรกทอรี (Directory Structure)

```
Dicut_Chat/
├── SKILL.md                 # เอกสารข้อกำหนดและคำแนะนำสำหรับ AI Agent
├── README.md                # เอกสารคู่มือการใช้งานและรายละเอียดระบบ
├── assets/
│   └── EVIDENCE.png         # โลโก้ EVIDENCE สำหรับประทับหัวกระดาษ
└── scripts/
    └── process_chat.py      # สคริปต์หลักสำหรับประมวลผล Smart Slicing, Slips & Summary PDF
```
