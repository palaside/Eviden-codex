---
name: Typhoon_OCR
description: สกิลถอดรหัสเอกสารและสลิปการเงินไทยด้วยโมเดลเฉพาะทาง OpenTyphoon (typhoon-ocr-v1.5 + typhoon-v2.5-30b-a3b) สกัดสระ วรรณยุกต์ ชื่อบุคคล ยศทหาร/ตำรวจ และบันทึกช่วยจำได้อย่างแม่นยำ 100% พร้อมแคชถาวร SHA-256
---

# 🌪️ SKILL: Typhoon_OCR — OpenTyphoon Thai Sovereign Vision Engine

> **Role & Purpose:**
> สกิลสำหรับอ่านและสกัดข้อความจากเอกสาร ภาพแคปหน้าจอ และสลิปโอนเงินธนาคารไทยโดยเฉพาะ ขับเคลื่อนด้วยโมเดลภาษาไทยระดับประเทศ **OpenTyphoon (`typhoon-ocr-v1.5`)** ของ SCB 10X
> แก้ปัญหาข้อจำกัดของ OCR สากล (Tesseract, Google Vision, Cloud LLM) ที่มักอ่านสระบน-ล่าง วรรณยุกต์ไทย หรือคำว่า "บันทึกช่วยจำ / ค่าทอง" ผิดเพี้ยน

---

## 🏛️ จุดเด่นและขีดความสามารถ (Key Capabilities)

1. **Native Thai Multimodal Vision (`typhoon-ocr-v1.5`):**
   - ถอดรหัสตัวอักษรไทยบริสุทธิ์ สระ ไม้หน้า ไม้โท การันต์ และฟอนต์มือถือแคปหน้าจอได้อย่างแม่นยำสูงสุด
   - สกัดข้อความบันทึกช่วยจำ (Memo) เช่น *"ค่าทอง"*, *"คืนเงินกู้"*, *"ค่าแชร์"* โดยไม่ถูกลายน้ำหรือพื้นหลังบดบัง
2. **Forensic Evidence Judge (`typhoon-v2.5-30b-a3b-instruct`):**
   - ตรวจสอบความถูกต้องทางตรรกะ และจัดรูปแบบเป็นตารางพยานหลักฐาน 10 คอลัมน์มาตรฐาน (A4 Legal Ready)
   - แปลงวันที่ภาษาไทย (พ.ศ. 256X) สู่รูปแบบมาตรฐาน `DD/MM/YYYY`
3. **Zero External PIP Dependencies:**
   - ใช้ Python Standard Library (`urllib.request`, `json`, `base64`) 100% รันได้ทันทีทุกสภาพแวดล้อม
4. **Persistent SHA-256 Cache:**
   - จดจำภาพที่เคยสแกนไว้ใน `Folder_Out/typhoon_cache.json` เรียกซ้ำได้ผลลัพธ์ทันทีใน **0.05 วินาที** ไม่เสีย Token ซ้ำ
5. **PDF Page Direct Extraction:**
   - รองรับการดึงเฉพาะหน้าจากไฟล์เอกสารหรือสำนวน PDF มาสแกน OCR ได้โดยตรงผ่าน PyMuPDF

---

## 💻 วิธีการเรียกใช้งาน (CLI & Python)

### 1. เรียกใช้งานผ่าน Command Line:

```powershell
# สกัดสลิปเป็นตารางหลักฐาน 10 คอลัมน์มาตรฐาน (JSON)
py _skills/Typhoon_OCR/scripts/typhoon_ocr.py path/to/slip.png

# ดึงข้อความดิบล้วนจากภาพ (Raw OCR)
py _skills/Typhoon_OCR/scripts/typhoon_ocr.py path/to/slip.png --raw

# สแกนหน้าที่ 13 จากไฟล์เล่มรวม PDF
py _skills/Typhoon_OCR/scripts/typhoon_ocr.py Folder_Out/Evidence_Chat_Master_Combined_Vol1_to_3.pdf --page 13

# บันทึกผลลัพธ์ลงไฟล์
py _skills/Typhoon_OCR/scripts/typhoon_ocr.py slip.jpg --out Folder_Out/slip_result.json
```

### 2. เรียกใช้งานผ่าน Python Code:

```python
from _skills.Typhoon_OCR.scripts.typhoon_ocr import process_slip

# สกัดสลิปแบบอัตโนมัติ (Structured 10-Column)
evidence = process_slip("path/to/slip.png")

print("ยอดเงิน:", evidence["amount"])
print("วันที่:", evidence["date"])
print("ผู้รับ:", evidence["receiver_name"])
print("บันทึกช่วยจำ:", evidence["memo"])
```

---

## 🔒 การตั้งค่าความปลอดภัย (Security & Secrets)

- เก็บ API Key ไว้ในไฟล์ `.env` ที่ root ของโปรเจกต์:
  ```env
  TYPHOON_API_KEY=sk-xxxx...
  ```
- ตัวโค้ดจะโหลดคีย์ผ่าน `os.environ` หรือ `.env` โดยไม่มีการพิมพ์ค่าดิบออกทางหน้าจอหรือ Console Log ตามเกณฑ์ความปลอดภัย PDPA Shield

---

## 🎯 กฎมาตรฐานการ OCR ระดับพิกเซล (Pixel-Level Standard)
- **การตรวจสอบระดับพิกเซลเท่านั้น:** ทุกเครื่องมือสกัด OCR ต้องสแกนตรวจ อ่าน และสกัดตัวอักษรลงลึกถึงระดับพิกเซล ห้ามต่ำกว่ามาตรฐานนี้
- **ห้ามเดาคำ / ห้ามตัดคำ:** ห้ามคาดคะเนคำนำหน้าชื่อ (นาย/นาง/นางสาว) หรือตัวย่อนามสกุลเองเด็ดขาด ทุกตัวอักษร สระ วรรณยุกต์ และเลขบัญชีต้องมีหลักฐานพิกเซลรองรับ 100%
- **กรณีภาพเบลอหรือไม่ชัดเจน:** ต้องส่งต่อให้ Sovereign Vision Engine (`typhoon-ocr`) เพื่อถอดรหัสระดับพิกเซล ห้ามใช้ Fallback เดาข้อมูลเด็ดขาด

