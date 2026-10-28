---
name: Summary_Table
description: โมดูลอิสระสำหรับสร้างใบปะหน้า สารบัญสรุปธุรกรรมทางการเงิน 10 คอลัมน์ (A4 Landscape) และรายงาน Excel (Decoupled Financial Statement & Index Engine) โดยแยกไฟล์จากเล่มเนื้อหาหลัก 100% เพื่อให้หน้าแรกของเล่มเนื้อหาตรงกับเลขหน้าพิมพ์จริง (Page 1 = Physical Page 1) เสมอ
---

# 📊 SKILL: Summary_Table (โมดูลตารางสรุปและสารบัญการเงินอิสระ)

## 📌 วัตถุประสงค์และกฎเหล็ก (Architecture & Core Rule)
1. **Decoupled Dossier Standard (แยกเล่ม 100% ห้ามรวม):**
   - **ห้าม** นำหน้าปกหรือสารบัญตารางสรุป 10 คอลัมน์ ไปผสานรวม (Merge) เข้ากับเล่มเนื้อหาพยานหลักฐาน (Chat / Slips) เด็ดขาด
   - **เหตุผล:** หากนำหน้าสารบัญ 4-5 หน้าไปรวมไว้หน้าเล่ม จะทำให้หน้าแรกของบทสนทนาเลื่อนไปเป็นหน้า 6 (Physical Page 6) เมื่อสั่งพิมพ์ผ่านเครื่องพิมพ์ เลขหน้าจะไม่ตรงกับความเป็นจริง และเมื่อค้นหาตามสารบัญ (เช่น หน้าระบุสลิป: 102) จะกลายเป็นหน้าที่ 107
2. **ระบบ 2 เล่มคู่ขนาน (Two-Dossier Architecture):**
   - **เล่มที่ 1: เล่มเนื้อหาพยานหลักฐาน (Evidence Content PDF):** รันหน้า 1 ถึง N (Page 1 = Physical Page 1) เพียวๆ 100%
   - **เล่มที่ 2: เล่มหน้าปกและสารบัญตารางสรุป (Financial Summary & Index PDF):** สร้างแยกเฉพาะผ่านโมดูลนี้ รันเลขหน้า "สารบัญ-1", "สารบัญ-2"... เพื่อใช้อ้างอิงและเปิดคู่กับเล่มที่ 1 ได้อย่างแม่นยำ

---

## 🛠️ โครงสร้างคอลัมน์มาตรฐาน 10 คอลัมน์ (Sarabun Light A4 Landscape)
ระยะขอบกระดาษ 1.25 ซม. (59 px ที่ขนาด 1406 × 993 px) ขยายช่องชื่อผู้โอนและชื่อผู้รับ:
1. `หน้าระบุสลิป` (112 px) - อ้างอิงตรงกับ Physical Page ของเล่มที่ 1
2. `วันที่ - เวลา` (130 px)
3. `ธนาคารผู้โอน` (105 px)
4. `ชื่อผู้โอน` (188 px)
5. `จำนวนเงิน (บาท)` (110 px)
6. `ชื่อผู้รับโอน` (208 px)
7. `ธนาคารผู้รับ` (115 px)
8. `บันทึก` (90 px)
9. `รหัสอ้างอิง` (125 px)
10. `สถานะหลักฐาน` (105 px)

---

## 🚀 คำสั่งใช้งาน (CLI Usage)
```bash
# สร้างชุดหน้าปกและสารบัญ PDF แยกเดี่ยว (5 หน้า) + Excel
python _skills/Summary_Table/scripts/summary_table.py --json "Folder_Out/Evidence_Chat_Master_Combined_Vol1_to_3_Slip_Index.json" --out-pdf "Folder_Out/Evidence_Chat_Master_Front_Cover_and_Index.pdf" --out-excel "Folder_Out/Evidence_Chat_Master_Combined_Vol1_to_3_Slip_Index.xlsx"
```
