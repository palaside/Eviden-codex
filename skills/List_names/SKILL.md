---
name: List_names
description: สกิลตรวจจับ จัดกลุ่ม และเรียงลำดับไฟล์หลักฐานภาพแชทตามคำนำหน้า (Prefix/Case Name) และตัวเลขอัตโนมัติ รองรับพฤติกรรม Windows Explorer Ctrl+A Rename พร้อมส่งออกชื่อ PDF ตรงเคส และจัดเก็บเข้าโฟลเดอร์ Case_.../Batch_...
---

# List_names Skill

สกิลนี้ถูกออกแบบมาเพื่อแก้ไขปัญหาการจัดกลุ่มภาพหลักฐานแชท โดยเฉพาะเมื่อผู้ใช้งานเลือกรูปทั้งหมดใน Windows Explorer (`Ctrl+A` แล้วกดเปลี่ยนชื่อ) ซึ่ง Windows จะตั้งชื่อในรูปแบบ `Prefix- (1).jpg`, `Prefix- (2).jpg` เป็นต้น

---

## 🏛️ คุณสมบัติหลัก (Core Features)

### 1. จัดกลุ่มตาม Prefix อัตโนมัติ (Auto-Grouping by Prefix)
- **แยกแยะชื่อเคส**: ระบบอ่านชื่อไฟล์และสกัดคำนำหน้า (Prefix) ออกมาเป็นชื่อกลุ่ม/ชื่อเคส เช่น:
  - `V1- (1).jpg`, `V1- (2).jpg` $\rightarrow$ จัดเข้ากลุ่มเคส **`V1`**
  - `Case_Somchai (1).png`, `Case_Somchai (2).png` $\rightarrow$ จัดเข้ากลุ่มเคส **`Case_Somchai`**
- **แยกหลายเคสที่ส่งเข้ามาพร้อมกัน**: หากมีไฟล์ `V1- (1).jpg` และ `V2- (1).jpg` หลุดเข้ามาในโฟลเดอร์พร้อมกัน สกิลจะแยกเป็น 2 ชุดอิสระทันที ไม่จับมั่วรวมกัน

### 2. เรียงลำดับตัวเลขธรรมชาติ (Natural Sorting Sequence)
- เรียงลำดับไฟล์ตามลำดับตัวเลขจริง ($1 \rightarrow 2 \rightarrow 3 \dots \rightarrow 10 \rightarrow 11$) ป้องกันปัญหาตัวเลขเรียงผิดแบบ Text Sort ($1, 10, 11, 2$)

### 3. ส่งออกชื่อไฟล์ผลงานตรงตามชื่อเคส (Named Output PDF)
- ส่งออกไฟล์ผลงาน PDF ใน `Folder_Out` ด้วยชื่อที่ตรงกับกลุ่มที่ตั้งไว้ เช่น:
  - กลุ่ม `V1` $\rightarrow$ **`Evidence_Chat_V1.pdf`**
  - กลุ่ม `Case_Somchai` $\rightarrow$ **`Evidence_Chat_Case_Somchai.pdf`**

### 4. จัดเก็บประวัติชัดเจน และรักษาประวัติ Batch (Case & Batch Archiving)
- จัดเก็บไฟล์ต้นฉบับหลังประมวลผลเสร็จไว้ที่:
  `processed/Case_{group_name}/Batch_{timestamp}/`
  เช่น: `processed/Case_V1/Batch_20260912_230622/V1- (1).jpg`
- ทำให้สืบค้นย้อนหลังได้ทั้ง **ตามชื่อเคส (`Case_V1`)** และ **ตามรอบเวลา (`Batch`)**

### 5. สกัดสารบัญสลิปอัตโนมัติร่วมกับ Search_Slip (Automated Slip Indexing)
- ทันทีที่สร้างไฟล์ PDF สำเร็จ ระบบจะเรียกสกิล `Search_Slip` โดยอัตโนมัติ เพื่อสแกนหาตำแหน่งหน้าที่แปะสลิปธนาคาร และส่งออกไฟล์สารบัญสลิปคู่กันออกมาเสมอ:
  - `Evidence_Chat_{group_name}_Slip_Index.xlsx` (10 คอลัมน์มาตรฐาน)
  - `Evidence_Chat_{group_name}_Slip_Index.json`

---

## 🚀 วิธีการใช้งาน (Usage)

### 1. ใช้งานผ่านคำสั่ง (CLI Mode)
```powershell
python _skills/List_names/scripts/list_names.py "<TARGET_DIRECTORY>"
```

### 2. ทำงานอัตโนมัติร่วมกับ Watcher & Search_Slip
- เชื่อมต่อกับ `gdrive_watcher.py` โดยตรง เมื่อผู้ใช้ลากไฟล์แชทมาวางใน `EVIDENCE_CHAT_IN` ระบบจะเรียก `List_names` เพื่อจัดกลุ่ม ส่งออก PDF แยกตามเคส และเรียก `Search_Slip` สกัดสารบัญสลิปให้อัตโนมัติในคำสั่งเดียว
