---
name: Detail_Data
description: สกิลสำหรับนำข้อมูลสกัดจากสลิปธนาคาร (JSON) มาจัดเรียงลงไฟล์ Excel หน้าตา A4 แนวนอน (Page Break ทุก 20 บรรทัด) และส่งต่อเข้าสู่ระบบสร้างหลักฐาน PDF พยานหลักฐาน พร้อมระบบ Background Silent Watcher เฝ้าดู Google Drive และ Desktop
---

# Detail_Data Skill

สกิลนี้ใช้สำหรับแปลงข้อมูลสลิปที่สกัดมาได้ ให้อยู่ในรูปของ:
1. **ไฟล์ Excel (.xlsx)** ที่จัดรูปแบบหน้ากระดาษ A4 แนวนอน (Page Break ทุก 20 บรรทัด) พร้อมหัวเรื่องและโลโก้ **EVIDENCE** รวมทั้งข้อความปฏิเสธความรับผิดชอบ (Disclaimer) 3 บรรทัดจัดกึ่งกลางท้ายกระดาษ
2. **ไฟล์ PDF พยานหลักฐาน (Legal-Grade Evidence PDF)** ที่แสดงสลิปหน้าละ 1 ใบจัดกึ่งกลางพอดีเป๊ะ (แกน X และ Y) พร้อม **ใบสรุป 10 คอลัมน์ A4 แนวนอน (Landscape)** ที่ใช้ฟอนต์ **Sarabun Light** จัดกึ่งกลางทุกช่อง

---

## 🔗 การเชื่อมต่อ Google Drive & Local Folders
- **Google Drive Folder**: [Google Drive EVIDENCE](https://drive.google.com/drive/folders/1zIo9YAXDsuxHXCWnFDdBS9hv7r1JvLct?usp=sharing)
- **Folder ID**: `1zIo9YAXDsuxHXCWnFDdBS9hv7r1JvLct`
- **Inbound Desktop**: `C:\Users\EVE\OneDrive\เดสก์ท็อป\EVIDENCE_IN` และ `EVIDENCE_CHAT_IN`
- **Output Folder**: `C:\Users\EVE\OneDrive\เดสก์ท็อป\Folder_Out`

---

## 📂 โครงสร้างไดเรกทอรี
- `config/schema.json`: กำหนดหัวคอลัมน์และขนาดความกว้างของตาราง 10 คอลัมน์
- `config/gdrive_config.json`: กำหนดค่าการเชื่อมต่อ Google Drive และโฟลเดอร์เฝ้าดู
- `scripts/generate_excel.py`: สคริปต์วาดตาราง Excel และจัดหน้า A4 แนวนอน พร้อมแบ่งหน้าละ 20 บรรทัด
- `scripts/generate_summary_pdf.py`: สคริปต์สร้างใบสรุป 10 คอลัมน์ A4 แนวนอน (Landscape 1406 × 993 px) ฟอนต์ Sarabun Light จัดกึ่งกลางสมบูรณ์
- `scripts/gdrive_watcher.py`: สคริปต์ Master Watcher เฝ้าดูไฟล์ JSON และรูปภาพ เพื่อสร้าง Excel และ PDF ส่งเข้า `Folder_Out` อัตโนมัติ
- `scripts/start_evidence_watcher.vbs`: ตัวรันเบื้องหลังแบบไร้หน้าต่างดำ (Silent Background)
- `GEMINI_GEM_MASTER_PROMPT.md`: มาสเตอร์พรอมต์สำหรับสร้าง Gemini Gem สื่อกลางรับ-ส่งข้อมูลสลิป

---

## 🚀 วิธีการใช้งาน

### 1. รันแปลงไฟล์เดี่ยว (Manual Mode)
- **สร้างไฟล์ Excel 10 คอลัมน์ (หน้าละ 20 แถว)**:
```powershell
python <SKILL_DIR>/scripts/generate_excel.py <INPUT_JSON_PATH> <OUTPUT_EXCEL_PATH> [LOGO_PATH]
```
- **สร้างใบสรุป PDF แนวนอน 10 คอลัมน์ (Sarabun Light)**:
```powershell
python <SKILL_DIR>/scripts/generate_summary_pdf.py <INPUT_JSON_PATH> <OUTPUT_PDF_PATH>
```

### 2. รันสคริปต์เฝ้าดูเบื้องหลัง (Background Watcher Mode)
```powershell
python <SKILL_DIR>/scripts/gdrive_watcher.py
```
*เมื่อมีไฟล์ `.json` สลิปเงินเข้ามา ระบบจะสร้างทั้ง `.xlsx` และ `_Summary.pdf` ส่งไปที่ `Folder_Out` ทันที*

---

## 📦 ข้อกำหนดระบบ (Dependencies)
```powershell
pip install openpyxl Pillow requests opencv-python reportlab numpy
```

