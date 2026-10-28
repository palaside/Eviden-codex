# P4 — เทสชุด B2 (32 ใบ)

มีรูปสลิป 32 ใบในโฟลเดอร์ + pipeline สำเร็จ (preprocess auto_crop+CLAHE → EasyOCR th+en CPU →
regex parse → trim_name + is_plausible) ให้เขียนสคริปต์ batch:

- รัน 32 ใบ (CPU ล้วน เผื่อเวลใบละ ~1 นาที) เก็บ JSON ต่อใบ
- สรุป accuracy รายฟิลด์: amount / bank_name / transaction_date / transaction_id /
  sender_name / receiver_name (นับจากฟิลด์ไม่ว่าง + สุ่มตรวจตา 5 ใบ)
- ออกรายงาน markdown สั้นๆ: ตาราง accuracy + ใบที่ตก + สาเหตุที่เดา

ไม่ต้องเทรนโมเดล ไม่ติดตั้งอะไรเพิ่มนอกจาก easyocr + opencv
