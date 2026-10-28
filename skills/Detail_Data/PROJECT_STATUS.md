# 📌 PROJECT STATUS: EVIDENCE Automation Ecosystem
> **วัตถุประสงค์ของเอกสารนี้**: สำหรับนำไปวางใน Google Gemini Notebook / NotebookLM หรือแชท AI เพื่อใช้เป็นฐานความรู้ (Context Base) ในการสอบถาม ปรึกษา และพัฒนาต่อยอดระบบ Automation อื่นๆ ในอนาคต

---

## 🏢 1. ข้อมูลภาพรวมโครงการ (Executive Summary)

**ชื่อโครงการ**: EVIDENCE Legal-Grade Evidence & Automation Ecosystem  
**สถาปัตยกรรมหลัก**: Event-Driven Hot Folder Pipeline (Drop & Go Architecture) ร่วมกับ Silent Background Daemon  
**เป้าหมายหลัก**: 
1. เปลี่ยนกระบวนการจัดทำหลักฐานทางการเงินและแชทให้เป็น **Zero-Manual (โยนไฟล์ปุ๊บ ผลลัพธ์ออกปั๊บ)**
2. ผลลัพธ์เอกสารทุกชุดต้องได้มาตรฐานชั้นศาลและข้อกฎหมาย (Legal-Grade):
   - ไม่มีการดัดแปลงข้อความ (No OCR/Re-rendering สำหรับแชทและสลิป)
   - สลิปจัดวาง 1 สลิปต่อ 1 หน้ากระดาษ A4 แนวตั้ง จัดกึ่งกลางแกน X และ Y พอดีเป๊ะ พร้อมตัดขอบขาว (Auto-Trim)
   - ใบสรุป 10 คอลัมน์ตอนท้าย เป็น **A4 แนวนอน (Landscape 1406 × 993 px)** ใช้ฟอนต์ **`Sarabun Light`** จัดกึ่งกลางทุกเซลล์
   - ประทับโลโก้ EVIDENCE และข้อความ Disclaimer 3 บรรทัดจัดกึ่งกลางท้ายกระดาษทุกหน้า

---

## 🏗️ 2. สถาปัตยกรรมระบบที่เป็นกลาง (Neutral Automation Blueprint)

ระบบนี้ถูกออกแบบให้เป็น **Generic & Modular Pattern** ซึ่งสามารถนำโครงสร้างนี้ไปสวมทับ (Plug & Play) กับโปรเจกต์ Automation อื่นๆ ได้ทันที:

```
┌─────────────────┐       ┌──────────────────────────────┐       ┌──────────────────┐
│  INBOUND BOX    │ ───►  │     DISPATCHER & ENGINE      │ ───►  │   OUTBOUND BOX   │
│  (โฟลเดอร์รับไฟล์) │       │  (ตรวจชนิดไฟล์ + ดึง AI/สคริปต์)  │       │  (รับผลลัพธ์สำเร็จ) │
└─────────────────┘       └──────────────┬───────────────┘       └──────────────────┘
                                         │
                                         ▼
                               ┌──────────────────┐
                               │  PROCESSED / LOG │
                               │  (ย้ายไฟล์เก่ากันวนลูป)│
                               └──────────────────┘
```

### รายละเอียด 4 เสาหลัก:
1. **Inbound / Hot Folder**: จุดที่ผู้ใช้หรือระบบภายนอกหย่อนไฟล์ดิบลงมา (รองรับ Local Desktop, Shared Network, Google Drive)
2. **Dispatcher (Auto-Type Detector)**: ตรวจจับนามสกุลและโครงสร้างข้อมูลอัตโนมัติ (เช่น `.json`, `.jpg`, `.png`, `.zip`, โฟลเดอร์รูปภาพ)
3. **Processing Engines**:
   - `Detail_Data Engine` (`generate_excel.py`): แปลง JSON เป็น Excel A4 แนวนอน 20 แถว/หน้า
   - `Dicut_Chat Engine` (`process_chat.py`): Smart Image Slicing (ดึง-ย่อ-ยัด), Feather Blend ลบรอยต่อ, Single Slip Center, Landscape Sarabun Light Summary
4. **Silent Watcher Daemon (`gdrive_watcher.py` & `.vbs`)**: ทำงานเบื้องหลัง 100% ผ่าน `wscript.exe` + `pythonw.exe` ไร้หน้าต่างดำรบกวน ฝังตัวใน Windows Startup

---

## 📊 3. สถานะการพัฒนาปัจจุบัน (Current Development Status)

| โมดูล / ฟีเจอร์ | รายละเอียดความสามารถ | สถานะ |
|---|---|---|
| **Excel Generator (Detail_Data)** | สกัด 10 คอลัมน์ลง Excel A4 แนวนอน, Page Break ทุก 20 แถว, ตรา EVIDENCE, Disclaimer 3 บรรทัด | ✅ เสร็จสมบูรณ์ 100% |
| **PDF Slip Center (Dicut_Chat)** | Auto-Trim ขอบขาว, สลิปละ 1 หน้า A4 แนวตั้ง วางกึ่งกลางแกน X และ Y | ✅ เสร็จสมบูรณ์ 100% |
| **Landscape Summary Sheet** | แผ่นสรุปหน้าสุดท้ายเป็น A4 แนวนอน (1406×993 px), ฟอนต์ Sarabun Light, ตารางกว้าง 1,202 px, ข้อความกึ่งกลางทุกช่อง | ✅ เสร็จสมบูรณ์ 100% |
| **Chat Long Slicing Engine** | ต่อภาพเนียน (Feather Blend 12 rows), สไลซ์อัจฉริยะไม่ตัดโดนตัวหนังสือ | ✅ เสร็จสมบูรณ์ 100% |
| **Master Dual Silent Watcher** | เฝ้าดู Google Drive (`1zIo9YAXDsuxHXCWnFDdBS9hv7r1JvLct`) + Desktop Inbound อัตโนมัติ | ✅ เสร็จสมบูรณ์ 100% |
| **Windows Startup Integration** | ฝังใน Startup รันเงียบๆ ผ่าน VBScript + Log ลง `watcher.log` ปลอดภัยจากปัญหา Encoding | ✅ เสร็จสมบูรณ์ 100% |

---

## 📐 4. สเปคเชิงเทคนิคที่สำคัญ (Technical Specifications)

* **ความละเอียด Canvas**: 
  - Portrait (หน้าเนื้อหา/สลิป): `993 × 1406 px` (ขอบเขตเนื้อหา: `807 × 1115 px`, Margins ซ้าย-ขวา `93 px`, บน-ล่าง `133/158 px`)
  - Landscape (ใบสรุปตอนท้าย): `1406 × 993 px` (ขอบเขตตาราง: `1202 × 793 px`, Margins ซ้าย-ขวา `102 px`, บน-ล่าง `80/100 px`)
* **ฟอนต์มาตรฐาน**: `Sarabun Light` (เนื้อหาตาราง) / `Sarabun Bold` (หัวตาราง) ที่พาท `C:\Windows\Fonts\Sarabun-*.ttf`
* **โครงสร้าง 10 คอลัมน์**: `ลำดับ`, `วันที่`, `เวลา`, `ธนาคารผู้โอน`, `ชื่อผู้โอน`, `จำนวนเงิน`, `ชื่อผู้รับ`, `ธนาคารผู้รับ`, `บันทึกช่วยจำ`, `หมายเหตุ`
* **ข้อกำหนดภาษา Windows Thai**: ใช้ `cv2.imdecode(np.fromfile(...))` สำหรับอ่านไฟล์พาทภาษาไทย และดักจับ Logging ลงไฟล์แทนคอนโซลเพื่อกัน `charmap/cp1252 UnicodeEncodeError`

---

## 🚀 5. แนวทางการนำไปพัฒนาต่อยอด (Future Expansion Roadmap)

ผู้ใช้ต้องการนำแม่แบบ **Hot Folder / Drop-and-Go Pipeline** นี้ไปประยุกต์ใช้กับโจทย์ Automation อื่นๆ:

1. **Automation สไตล์ Webhook / API Trigger**: 
   - เชื่อมต่อการแจ้งเตือน Real-time เมื่อมีเอกสารเข้า เช่น ยิงแจ้งเตือนผ่าน LINE Notify / Telegram Bot
2. **Automation สไตล์ Scheduled / Cron Batching**:
   - รวบรวมสรุปยอดธุรกรรมและรายงานบัญชีประจำสัปดาห์/ประจำเดือนอัตโนมัติ
3. **Automation สไตล์ Multi-Agent AI Workflow**:
   - นำ Gemini API เข้ามาทำหน้าที่สกัดข้อมูลจากภาพสลิป/ใบเสร็จดิบแบบ End-to-End โดยไม่ต้องพึ่งพาการก็อปปี้ JSON
4. **Automation สไตล์ Headless RPA**:
   - ล็อกอินดาวน์โหลด Statement จากเว็บธนาคารแล้วส่งเข้า Inbound อัตโนมัติ

---

## 💬 6. ตัวอย่างคำถามสำหรับถามต่อใน Gemini Notebook (Prompt Starters)

เมื่ออัปโหลดไฟล์นี้เข้า Gemini Notebook แล้ว คุณสามารถเริ่มพิมพ์คำถามต่อได้ทันที เช่น:
- *"จากสถาปัตยกรรม Hot Folder ในเอกสารนี้ หากผมต้องการเพิ่มระบบแจ้งเตือนผ่าน LINE ทันทีที่ไฟล์เสร็จ ควรต่อเติมโค้ดตรงไหน?"*
- *"ช่วยเขียนโค้ดต่อยอด Engine ตัวใหม่ สำหรับรับไฟล์ใบกำกับภาษี PDF แล้วสกัดเป็น Excel ตามโครงสร้างในเอกสารนี้หน่อย"*
- *"ถ้าต้องการย้ายระบบ Watcher นี้ไปรันบน Cloud หรือ Docker ต้องปรับเปลี่ยนโครงสร้างอย่างไรบ้าง?"*
