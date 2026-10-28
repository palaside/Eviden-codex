# Border_excel: Lightning-Fast OpenPyXL Grid Engine & Interactive Questionnaire

คู่มือและข้อกำหนดของสกิล **Border_excel** สำหรับสร้าง ปรับแต่ง และแปลงโค้ดสร้างตาราง Excel ความเร็วสูง (In-Memory Grid Generation)

---

## 🌟 จุดเด่นของสกิล (Key Capabilities)

1. **แปลงโค้ดเป็นเทมเพลตซักถาม (Code-to-Questionnaire Transform)**:
   - เมื่อมีการเรียกใช้สกิล สคริปต์จะไม่เดาใจ แต่จะแปลงโค้ดเดิมให้กลายเป็นแบบฟอร์ม 5 ข้อ ซักถามสเปคที่แท้จริงของการตีเส้นตาราง
2. **3 ความลับทางวิศวกรรม (The 3 Engineering Secrets)**:
   - **Headless In-Memory**: เรนเดอร์บน RAM ตรงๆ ไม่เปิด UI ทำงานเสร็จใน 0.1 วินาที
   - **Grid Math**: คำนวณพิกัด $(R, C)$ วาดเส้นขอบ จัดกึ่งกลาง และลงสีพร้อมกันรวดเดียว
   - **Direct Pipeline**: รองรับข้อมูล JSON ขนาดใหญ่พร้อมคำสั่งตัดหน้ากระดาษ (`ws.page_breaks`)
3. **ประกอบกลับเป็นโค้ด Python อัตโนมัติ (Questionnaire-to-Code Synthesis)**:
   - เมื่อผู้ใช้ตอบสเปคที่ต้องการ โค้ดจะถูกแปลงกลับเป็นสคริปต์ `generate_excel.py` ที่ทำงานได้ทันที 100%

---

## 📂 โครงสร้างสกิล

```
Border_excel/
├── SKILL.md      # ข้อกำหนดและขั้นตอนการทำงานของสกิล
└── README.md     # คู่มือและคำอธิบายรายละเอียด
```
