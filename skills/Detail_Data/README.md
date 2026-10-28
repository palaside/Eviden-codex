# EVIDENCE System — Detail_Data & Automation Pipeline

คู่มือการทำงาน บันทึกหลักฐาน ข้อกำหนดเชิงเทคนิค และระบบประมวลผลข้อมูลสลิปการโอนเงินอัตโนมัติ (Automated Legal-Grade Financial Evidence Pipeline)

---

## 📌 1. ภาพรวมระบบ (System Architecture)

ระบบถูกออกแบบเพื่อรองรับการเปลี่ยนภาพสลิปธุรกรรมทางการเงินให้เป็นเอกสารหลักฐานชั้นศาลและข้อกฎหมาย (Legal-Grade Evidence) ในรูปแบบ:
1. **ไฟล์ Excel (.xlsx)**: จัดหน้าพร้อมพิมพ์ A4 แนวนอน (Landscape) แบ่งหน้าละ 20 แถวข้อมูล พร้อมหัวตาราง โลโก้ และข้อความ Disclaimer จัดกึ่งกลาง
2. **ไฟล์ PDF หลักฐาน (Legal-Grade Evidence PDF)**: 
   - หน้าสลิป: แสดงสลิปละ 1 หน้า (Portrait A4) ตัดขอบขาวส่วนเกิน (Auto-Trim) และวางตรงกึ่งกลางแกน X และ Y พอดีเป๊ะ
   - ใบสรุปตอนท้าย: แผ่นสรุป 10 คอลัมน์ **A4 แนวนอน (Landscape 1406 × 993 px)** ใช้ฟอนต์ **`Sarabun Light`** จัดข้อความและตัวเลขให้อยู่ **กึ่งกลางช่องทุกช่อง**

```
[ผู้ใช้ส่งรูปสลิป / โฟลเดอร์รูปภาพ] 
       ↓
[Gemini Gem: EVIDENCE Slip Bridge] (สกัดข้อมูล 10 คอลัมน์ ไม่แก้/ไม่แต่งข้อมูล)
       ↓
[ส่งออกไฟล์ .json + รูปภาพ] ──► [บันทึกลง Google Drive / Desktop Inbound]
                                   ↓
[Background Master Watcher: gdrive_watcher.py] (ตรวจจับไฟล์อัตโนมัติ)
                                   ↓
[Detail_Data & Dicut_Chat Engines] 
       ├─► [generate_excel.py] ──► ไฟล์ .xlsx (A4 Landscape, 20 แถว/หน้า)
       └─► [process_chat.py]   ──► ไฟล์ .pdf (สลิปละ 1 หน้า + ใบสรุปแนวนอน Sarabun Light)
                                   ↓
[ส่งมอบไฟล์ทั้งหมดอัตโนมัติ] ──► [ส่งมอบกลับไปที่ Folder_Out]
```

---

## 🔗 2. บันทึกข้อมูลการเชื่อมต่อ Google Drive
- **ชื่อโฟลเดอร์หลัก**: `EVIDENCE`
- **ลิ้งค์ Google Drive**: [https://drive.google.com/drive/folders/1zIo9YAXDsuxHXCWnFDdBS9hv7r1JvLct?usp=sharing](https://drive.google.com/drive/folders/1zIo9YAXDsuxHXCWnFDdBS9hv7r1JvLct?usp=sharing)
- **Folder ID**: `1zIo9YAXDsuxHXCWnFDdBS9hv7r1JvLct`
- **Inbound Desktop**: `C:\Users\EVE\OneDrive\เดสก์ท็อป\EVIDENCE_IN` และ `EVIDENCE_CHAT_IN`
- **โฟลเดอร์ผลลัพธ์ปลายทาง**: `C:\Users\EVE\OneDrive\เดสก์ท็อป\Folder_Out`

---

## 📐 3. ข้อกำหนดโครงสร้างตารางและขนาดหน้ากระดาษ (Layout Specifications)

### 3.1 การจัดหน้ากระดาษ Excel (Excel Page Setup)
- **กระดาษ**: A4 แนวนอน (Landscape)
- **ระยะขอบ (Margins)**:
  - ด้านบน (Top): 157 px (1.635 นิ้ว)
  - ด้านล่าง (Bottom): 179 px (1.865 นิ้ว)
  - ด้านซ้าย/ขวา (Left/Right): 102 px (1.0625 นิ้ว)
- **การตัดหน้า (Page Break)**: แบ่งหน้าอัตโนมัติทุกๆ **20 แถวข้อมูล** (หน้าละ 1 Header + 20 ข้อมูล + 1 Footer)
- **ความสูงแถวข้อมูล**: 23.2 pt (30.95 px)

### 3.2 การจัดหน้ากระดาษ PDF พยานหลักฐาน (PDF Evidence Setup)
- **หน้าสลิป (Portrait)**:
  - ขนาดหน้า: 993 × 1406 px (A4 แนวตั้ง)
  - ระบบ Auto-Trim: ตัดขอบขาวว่างเปล่าออกอัตโนมัติ
  - การจัดวาง: สลิปละ 1 หน้า วางกึ่งกลางบล็อคเนื้อหา (Center X & Y)
- **หน้าใบสรุปตอนท้าย (Landscape Summary Sheet)**:
  - ขนาดหน้า: 1406 × 993 px (A4 แนวนอน)
  - ฟอนต์: **`Sarabun Light`** (หัวตาราง Sarabun Bold)
  - ความกว้างตาราง: 1,202 px ขยายเต็มพื้นที่
  - การจัดแนว: จัดข้อความและตัวเลขทุกเซลล์อยู่ **กึ่งกลางช่อง (Center-Aligned)** ทั้งแนวนอนและแนวตั้ง

### 3.3 โครงสร้าง 10 คอลัมน์มาตรฐาน (`schema.json`)
| ลำดับคอลัมน์ | ชื่อหัวตาราง | รหัสคีย์ใน JSON | ความกว้าง (Width) |
|---|---|---|---|
| A | ลำดับ | `index` (คำนวณอัตโนมัติ) | 9.5 |
| B | วันที่ | `date` | 14.3 |
| C | เวลา | `time` | 12.0 |
| D | ธนาคารผู้โอน | `sender_bank` | 18.0 |
| E | ชื่อผู้โอน | `sender_name` | 24.0 |
| F | จำนวนเงิน | `amount` | 14.3 |
| G | ชื่อผู้รับ | `receiver_name` | 24.0 |
| H | ธนาคารผู้รับ | `receiver_bank` | 18.0 |
| I | บันทึกช่วยจำ | `memo` | 18.0 |
| J | หมายเหตุ | `remarks` | 18.0 |

### 3.4 ส่วนหัวกระดาษ (Header Block)
- **โลโก้**: แสดงโลโก้ `EVIDENCE` (ขนาด 100×100 px) ที่ตำแหน่งมุมซ้ายบน (ช่อง A1:B3)
  - พาทโลโก้: `C:\Users\EVE\OneDrive\เดสก์ท็อป\EVIDENCE.png` หรือ `EVIDENCE.jpg`
- **หัวเรื่อง**: ข้อความ `EVIDENCE` (ตัวหนา)
- **หมายเลขหน้า**: `PAGE: X` และมุมขวา `X / Total Pages`
- **วันเวลาที่ออกเอกสาร**: Timestamp `DD/MM/YYYY : HH.MM`

### 3.5 ส่วนท้ายกระดาษ (Footer Disclaimer Block)
ข้อความสงวนสิทธิ์ทางกฎหมาย 3 บรรทัด จัดกึ่งกลางหน้ากระดาษ:
```text
"DIGITAL EVIDENCE เป็นเพียงการเครื่องมืออำนวยความสะดวกให้กับผู้ว่าจ้าง โดยไม่ได้ดัดแปลง แก้ไข เพิ่ม-ลบ เนื้อหา
จากต้นฉบับใดๆ และไม่มีส่วนเกี่ยวข้องใดๆกับเนื้อหาในเอกสาร เป็นเพียงเครื่องมือที่ทำงานเกี่ยวกับระบบไฟล์
เอกสารแบบอิเล็กทรอนิกส์ เท่านั้น"
```

---

## 🤖 4. Gemini Gem: สื่อกลางรับ-ส่งข้อมูล (AI Data Bridge)

### 4.1 การตั้งค่า Gem ใน Google Gemini
- **ชื่อ Gem**: `EVIDENCE Slip Bridge`
- **คำสั่งระบบ (Instructions)**: คัดลอกเนื้อหาจากไฟล์ [`GEMINI_GEM_MASTER_PROMPT.md`](file:///C:/Users/EVE/.gemini/config/skills/Detail_Data/GEMINI_GEM_MASTER_PROMPT.md)
- **เครื่องมือเริ่มต้น**: `ไม่มีเครื่องมือเริ่มต้น` (เพื่อให้ Gem โฟกัสการอ่านสลิปและสกัดข้อมูล)
- **ความรู้ (Knowledge)**: อัปโหลดไฟล์ [`schema.json`](file:///C:/Users/EVE/.gemini/config/skills/Detail_Data/config/schema.json)

### 4.2 ตัวอย่าง JSON Output ที่ Gem ส่งออก
```json
[
  {
    "date": "06/09/69",
    "time": "14:35",
    "sender_bank": "KBank",
    "sender_name": "นาย ทดสอบ ระบบ",
    "amount": "1,500.00",
    "receiver_name": "นางสาว ใจดี ดีเสมอ",
    "receiver_bank": "SCB",
    "memo": "ค่าสินค้า",
    "remarks": "202609061435001"
  }
]
```

---

## ⚙️ 5. ระบบสคริปต์เฝ้าดูเบื้องหลัง (Master Dual Silent Watcher)

### 5.1 รายละเอียดการทำงานของ `gdrive_watcher.py` (ระบบคู่ขนาน 2-in-1)
ระบบเฝ้าดูโฟลเดอร์ Inbound ทั้งหมดอัตโนมัติ:
1. **ช่องทางสลิปโอนเงิน (Slip Engine)**:
   - โฟลเดอร์: `EVIDENCE_IN` (Desktop) หรือ `SLIP_IN` (Google Drive)
   - ข้อมูลนำเข้า: ไฟล์ `.json`
   - การประมวลผล: ดึงรัน `generate_excel.py`
   - ผลลัพธ์: ไฟล์ `.xlsx` (A4 Landscape, 20 แถว/หน้า) ส่งเข้า `Folder_Out`

2. **ช่องทางภาพแชทยาว (Chat Engine)**:
   - โฟลเดอร์: `EVIDENCE_CHAT_IN` (Desktop) หรือ `CHAT_IN` (Google Drive)
   - ข้อมูลนำเข้า: โฟลเดอร์รูปภาพ, ไฟล์ `.zip`, หรือภาพแคปเดี่ยวหลายภาพ
   - การประมวลผล: ดึงรัน `process_chat.py` (Smart Slicing ดึง-ย่อ-ยัด + Feather Blend)
   - ผลลัพธ์: ไฟล์ `.pdf` (A4 Legal, หัวเรื่อง/โลโก้ EVIDENCE, 3-line Disclaimer) ส่งเข้า `Folder_Out`

3. **ระบบรักษาความปลอดภัยและการจัดเก็บ**:
   - เมื่อประมวลผลเสร็จสิ้น ไฟล์ต้นทางจะถูกย้ายไปเก็บในโฟลเดอร์ `processed/` พร้อมประทับ Timestamp ทันที

### 5.2 การทำงานอัตโนมัติเมื่อเปิดเครื่อง (Windows Startup Integration)
- ติดตั้ง Shortcut ไว้ที่:
  `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\EVIDENCE_Watcher.lnk`
- ใช้ตัวเรียก `start_evidence_watcher.vbs` ร่วมกับ `pythonw.exe` ทำให้สคริปต์ **แอบทำงานเบื้องหลัง 100% โดยไม่มีหน้าต่างคอนโซลรบกวน**

---

## 🧪 6. บันทึกผลการทดสอบระบบ (Verification & Audit Log)

| วันที่/เวลา | รายการทดสอบ | ข้อมูลนำเข้า | ผลลัพธ์ที่ได้รับ | สถานะ |
|---|---|---|---|---|
| 06/09/2026 15:51 | ทดสอบฟังก์ชัน `generate_excel.py` | `test_data.json` | สร้าง `test_output.xlsx` จัดหน้า A4 แนวนอน พร้อมแบ่งหน้าละ 20 แถวสำเร็จ | ✅ ผ่าน |
| 06/09/2026 16:08 | ทดสอบ Background Logger | `pythonw.exe` logging | บันทึกการทำงานลง `watcher.log` โดยไม่มี Error | ✅ ผ่าน |
| 06/09/2026 16:10 | ทดสอบ Inbound Pipeline (Slip JSON) | โยน `test_transfer.json` ลง `EVIDENCE_IN` | ตรวจพบอัตโนมัติ -> แปลงเป็น `test_transfer_20260906_161042.xlsx` ใน `Folder_Out` -> ย้าย JSON เข้า `processed/` | ✅ ผ่าน 100% |
| 06/09/2026 16:19 | ทดสอบ Inbound Pipeline (Chat Images) | โยนโฟลเดอร์ `Case_Test_Chat` ลง `EVIDENCE_CHAT_IN` | ตรวจพบอัตโนมัติ -> ตัดภาพและต่อเนียน -> แปลงเป็น `Case_Test_Chat_20260906_161901.pdf` (14 หน้า) ใน `Folder_Out` | ✅ ผ่าน 100% |

---

## 📁 7. โครงสร้างไฟล์ทั้งหมดในระบบ

```
Detail_Data/
├── SKILL.md                          # เอกสารข้อกำหนดระบบสำหรับ AI Agent
├── README.md                         # เอกสารคู่มือ บันทึกหลักฐาน และข้อกำหนดทั้งหมด
├── GEMINI_GEM_MASTER_PROMPT.md       # มาสเตอร์พรอมต์สำหรับ Gemini Gem
├── watcher.log                       # บันทึกประวัติการทำงานของ Background Watcher
├── test_data.json                    # ข้อมูลสลิปทดสอบมาตรฐาน
├── config/
│   ├── schema.json                   # กำหนดหัวตาราง 10 คอลัมน์ และความกว้าง
│   └── gdrive_config.json            # กำหนด URL, Folder ID, และโฟลเดอร์ In/Out
└── scripts/
    ├── generate_excel.py             # เอนจินวาดตาราง Excel A4 Landscape + แบ่งหน้าละ 20 แถว
    ├── gdrive_watcher.py             # สคริปต์เฝ้าดูและประมวลผลไฟล์อัตโนมัติ
    └── start_evidence_watcher.vbs    # สคริปต์รัน Watcher แบบไร้หน้าต่าง (Silent Background)
```
