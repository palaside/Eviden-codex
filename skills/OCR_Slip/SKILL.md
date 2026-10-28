---
name: OCR_Slip
description: "สกัดข้อมูลสลิปโอนเงินธนาคารไทย (KTB, TTB, SCB, KBank ฯลฯ) สู่สคีมาตารางหลักฐาน 10 คอลัมน์มาตรฐาน ด้วย Morphological Background Subtraction, CLAHE, Multi-Pass OCR และถอดรหัส EMVCo QR Code 100%"
---

# Skill: OCR_Slip
**Role & Identity:** EVIDENCE AI Bridge — Bank Transfer Slip Extraction Specialist  
**Target Standard:** 10-Column Standard Evidence Schema (A4 Legal Landscape Ready)  
**Engine Script:** `_skills/OCR_Slip/scripts/ocr_slip.py` (Mirrored to `_engines/OCR_Slip/scripts/ocr_slip.py`)

---

## 1. ขีดความสามารถหลัก (Core Capabilities)
1. **Morphological Background Subtraction:** ตัดลายน้ำรูปคลื่น, ลายนกวายุภักษ์ (KTB), ริบบิ้นสีและแถบไล่เฉด (TTB) ออกจากข้อความด้วยเทคนิค Dilation Background Division (`gray / bg * 255`)
2. **CLAHE Contrast Normalization:** ปรับแต่งคอนทราสต์เฉพาะที่สำหรับตัวอักษรไทยที่มีสระบน/ล่างและตัวเลข
3. **EMVCo Thai QR Code Decoding (Tier 1 Primary):** ถอดรหัสเพย์โหลดมาตรฐาน PromptPay Mini-QR / BScanC จากภาพสลิปโดยตรง ดึงค่า Transaction Reference ID (Tag 02 หรือ Nested Tag 00 -> 02) อย่างแม่นยำ 100%
4. **Thai Month & Timestamp Normalization (Tier 2):** แปลงตัวย่อเดือนไทยและถอดรหัส Timestamp ที่ฝังใน Ref ID (เช่น TTB `YYYYMMDDHHMM...`)
5. **OpenTyphoon Thai Sovereign Engine (Tier 3 Preferred):** ระบบคู่หู 2 จังหวะ: Stage 1 ใช้ `typhoon-ocr-v1.5` สกัดข้อความไทย สระบน-ล่าง วรรณยุกต์ และบันทึกช่วยจำ -> Stage 2 ใช้ `typhoon-v2.5-30b-a3b-instruct` เป็นผู้พิพากษาพยานหลักฐาน (Forensic Judge) ตรวจสอบความถูกต้องและจัดรูปเป็น JSON 10 คอลัมน์มาตรฐาน พร้อมแคชถาวร SHA-256
6. **Gemini Multimodal Emergency Fallback (Tier 3 Secondary):** กู้ภัยสลิปสำรองข้ามคลาวด์
7. **Forensic Audit & Correction CLI:** เครื่องมือ `tools/typhoon_audit_slip.py` สำหรับสแกนตรวจทานและแก้ไขสลิปที่มีข้อผิดพลาดรายใบ
8. **10-Column Legal Spreadsheet Export:** ส่งออกตารางเอ็กเซลพร้อมจัดรูปแบบฟอนต์ Cordia New, ความกว้างคอลัมน์ และเส้นขอบรองรับการพิมพ์ A4 แนวนอน

---

## 2. ตารางคอลัมน์มาตรฐาน 10 รายการ (10-Column Schema)

| คอลัมน์ | ชื่อฟิลด์ | หัวตารางภาษาไทย | ความกว้าง | คำอธิบาย |
|:---:|:---|:---|:---:|:---|
| A | `seq` | ลำดับ | 8.0 | ลำดับที่ของรายการ |
| B | `group` | กลุ่มธนาคาร | 14.0 | ธนาคารต้นทาง (KTB, TTB, etc.) |
| C | `filename` | ชื่อไฟล์สลิป | 30.0 | ชื่อไฟล์ภาพต้นฉบับ |
| D | `date` | วันที่ | 16.0 | วันที่ทำรายการ (DD/MM/YYYY) |
| E | `time` | เวลา | 12.0 | เวลาทำรายการ (HH:MM) |
| F | `sender_bank` | ธนาคารผู้โอน | 18.0 | ธนาคารต้นทาง |
| G | `sender_name` | ชื่อผู้โอน | 26.0 | ชื่อผู้โอนพร้อมเลขบัญชีตัดทอน |
| H | `amount` | จำนวนเงิน (บาท) | 18.0 | ยอดเงินโอนพร้อมทศนิยม 2 ตำแหน่ง |
| I | `receiver_name` | ชื่อผู้รับโอน | 28.0 | ชื่อบัญชีปลายทาง |
| J | `receiver_bank` | ธนาคารผู้รับ | 18.0 | ธนาคารปลายทาง |
| K | `remarks` | รหัสอ้างอิงธุรกรรม / หมายเหตุ | 28.0 | Transaction Ref ID หรือข้อความตรวจสอบ |

---

## 3. ตัวอย่างการเรียกใช้งานผ่าน Python

```python
from _skills.OCR_Slip.scripts.ocr_slip import extract_slip_data, export_evidence_excel

# สกัดสลิปเดี่ยว
record = extract_slip_data("path/to/slip.jpg", default_bank="กรุงไทย")
print(record["amount"], record["date"], record["remarks"])

# ส่งออกเป็น Excel 10 คอลัมน์
export_evidence_excel([record], "Folder_Out/Slip_Summary.xlsx")
```
