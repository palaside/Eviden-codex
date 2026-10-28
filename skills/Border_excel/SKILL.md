---
name: Border_excel
description: สกิลวิศวกรรมสร้างและจัดรูปแบบตาราง Excel ระดับความเร็วสูง (Lightning-Fast OpenPyXL Grid Engine) แปลง generate_excel.py เป็นเทมเพลตซักถามความต้องการตีเส้นตาราง แล้วประกอบกลับเป็นโค้ด Python สมบูรณ์
---

# Border_excel Skill

สกิลนี้สร้างขึ้นจาก **3 ความลับทางวิศวกรรมซอฟต์แวร์** (Headless Memory Construction, Grid Math Engine, Direct In-Memory Pipeline) เพื่อสร้างไฟล์ Excel ที่ตีเส้นตาราง จัดฟอนต์ และจัดหน้ากระดาษพิมพ์ได้อย่างสวยงามและรวดเร็วในระดับเสี้ยววินาที พร้อมระบบ **ถอดรหัสไฟล์ต้นแบบเป็นพิมพ์เขียว `_blueprint.json`** เพื่อใช้เป็นฐานข้อมูลและสเปคในการเขียนโค้ด

---

## 🧠 3 ความลับทางวิศวกรรม (Core Engineering Foundation)

1. **Headless Memory Construction**: ประกอบโครงสร้างตารางและ XML ลงบน RAM โดยตรงด้วย `openpyxl` ไม่เปิดหน้าต่างโปรแกรม ให้ความเร็วสูงกว่าคนทำมือ 1,000 เท่า
2. **Grid Math Engine**: คำนวณพิกัดแถวและคอลัมน์ $(R, C)$ ด้วยสูตรคณิตศาสตร์แบบเมทริกซ์ สั่งตีเส้นขอบ (Borders), ใส่สีพื้นหลัง (Fills), และจัดกึ่งกลาง (Alignment) พร้อมกันทั้งตารางในลูปเดียว
3. **Direct In-Memory Pipeline**: สตรีมข้อมูลจาก JSON/Data Array เข้าสู่เซลล์ตารางโดยตรง พร้อมระบบตัดหน้ากระดาษพิมพ์อัตโนมัติ (`page_breaks`)

---

## 🛠️ ความสามารถหลัก 2 รูปแบบ (Dual Operational Modes)

### 🔹 โหมดที่ 1: สกัดไฟล์ต้นแบบเป็นพิมพ์เขียว (`_blueprint.json`)
ใช้สคริปต์ `scripts/extract_blueprint.py` เพื่ออ่านไฟล์ Excel ต้นแบบ (`.xlsx`) แล้วถอดรหัสออกมาเป็นไฟล์ **`<filename>_blueprint.json`** ประกอบด้วย:
- **`defined_names`**: ตัวแปรและ Named Ranges ทั้งหมด พร้อมพิกัดปลายทาง
- **`computed_formulas`**: สูตรคำนวณ ความสัมพันธ์ข้ามชีต และการผูกตรรกะ
- **`input_fields`**: ช่องที่รอรับข้อมูลและชนิดข้อมูล (Data Type)
- **`grid_cells & styles`**: ความกว้างคอลัมน์ ความสูงแถว ฟอนต์ สีกรอบ เส้นตาราง และ Merged Cells
- **`page_setup`**: การจัดหน้า A4 (Portrait/Landscape)

```powershell
python <SKILL_DIR>/scripts/extract_blueprint.py <INPUT_EXCEL.xlsx> [OUTPUT_BLUEPRINT.json]
```

---

### 🔹 โหมดที่ 2: แปลงโค้ดเป็นเทมเพลตซักถาม (Interactive Questionnaire)
เมื่อเริ่มสร้างตารางใหม่จากศูนย์ สกิลจะแปลง `generate_excel.py` เป็นแบบฟอร์ม 5 ข้อ ซักถามสเปคที่แท้จริงของการตีเส้นตาราง แล้วประกอบกลับเป็นโค้ด Python ที่สมบูรณ์ 100%

---

## 📝 ขั้นตอนที่ 1: แปลงโค้ดเป็นเทมเพลตซักถาม (Interactive Questionnaire)

ห้ามเขียนโค้ดสุ่มสี่สุ่มห้าทันที แต่ให้นำเสนอ **เทมเพลตซักถาม 5 องค์ประกอบสำคัญ** เพื่อให้ผู้ใช้ระบุสเปคของตาราง:

### 📋 แบบฟอร์มกำหนดสเปคตาราง Excel (Excel Grid Questionnaire):

1. **โครงสร้างคอลัมน์ (Columns & Headers)**:
   - มีคอลัมน์อะไรบ้าง? (ระบุชื่อหัวตาราง และความกว้างแต่ละช่อง เช่น 10, 15, 20, 25)
2. **การจัดหน้ากระดาษและการตัดหน้า (Page Setup & Page Breaks)**:
   - กระดาษแนวตั้ง (Portrait) หรือ แนวนอน (Landscape)?
   - ตัดหน้า (Page Break) ทุกๆ กี่แถวข้อมูล? (เช่น 20 แถว, 25 แถว, หรือไม่ตัด)
3. **การตีเส้นตารางและสี (Borders & Palette)**:
   - สไตล์เส้นขอบ: เส้นบาง (`thin`), เส้นหนา (`medium`), หรือเส้นคู่ (`double`)?
   - สีกรอบและสีหัวตาราง: สีเทาทางการ (`D9D9D9`), สีน้ำเงินเข้ม (`1F4E78`), หรือแบบโปร่งใส?
4. **การจัดตำแหน่งข้อความ (Typography & Alignment)**:
   - ฟอนต์: `Sarabun`, `TH Sarabun New`, `Angsana New`, หรือ `Cordia New`?
   - การจัดแนว: กึ่งกลางทั้งหมด (Center) หรือ แยกชิดซ้าย/ขวาตามประเภทข้อมูล?
5. **องค์ประกอบส่วนหัวและส่วนท้าย (Header Logo & Footer Disclaimer)**:
   - มีโลโก้ที่มุมกระดาษหรือไม่? (ระบุพาทรูปภาพ)
   - มีข้อความหัวกระดาษ (Header Title) หรือเลขหน้า (`PAGE X / Y`) ไหม?
   - มีข้อความปฏิเสธความรับผิดชอบ (Footer Disclaimer) ท้ายตารางหรือไม่?

---

## ⚙️ ขั้นตอนที่ 2: แปลงกลับเป็นโค้ด Python มาตรฐาน (`generate_excel.py`)

เมื่อได้รับคำตอบจากผู้ใช้ ให้นำค่าที่ได้มาประกอบลงในแม่แบบโค้ด **OpenPyXL Grid Engine** ดังต่อไปนี้:

```python
import os
import json
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.drawing.image import Image as XLImage

def build_excel_grid(input_json_path, output_excel_path, logo_path=None):
    wb = Workbook()
    ws = wb.active
    ws.title = "Evidence_Report"

    # 1. Page Setup
    ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE # หรือ ORIENTATION_PORTRAIT
    ws.page_setup.paperSize = ws.PAPERSIZE_A4

    # 2. Border Styles
    thin_border = Border(
        left=Side(style='thin', color='000000'),
        right=Side(style='thin', color='000000'),
        top=Side(style='thin', color='000000'),
        bottom=Side(style='thin', color='000000')
    )
    header_fill = PatternFill(start_color="F2F2F2", end_color="F2F2F2", fill_type="solid")
    font_main = Font(name="Sarabun", size=10)
    font_bold = Font(name="Sarabun", size=10, bold=True)

    # 3. Grid Math Rendering Loop
    # (คำนวณพิกัดแถว/คอลัมน์ วาดหัวตาราง ข้อมูล และตัดหน้าอัตโนมัติ)
    # ...

    wb.save(output_excel_path)
```

---

## 🚀 ประโยชน์และการนำไปใช้
- ช่วยให้การสร้างสคริปต์ตีตาราง Excel ทุกโปรเจกต์ในอนาคตมีความแม่นยำ 100%
- ปรับเปลี่ยนสเปคตารางตามใจผู้ใช้ได้ทันทีโดยไม่ต้องเขียนโค้ดใหม่ตั้งแต่ต้น
