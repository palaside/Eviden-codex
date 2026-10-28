# P3 — รวมร่าง sender/receiver

มี `extract_candidates` (คืนชื่อสะอาดเป็นลิสต์) กับ parser เก่าที่คืน `sender_name/receiver_name`
ว่าง 0/50 ให้เขียน `assign_parties(candidates, full_text)` แยกผู้โอน/ผู้รับด้วยฮิวริสติก:

- ชื่อที่อยู่หลังคำว่า จาก/ผู้โอน/โอนจาก = sender
- ชื่อที่อยู่หลังคำว่า ถึง/ผู้รับ/โอนไปยัง = receiver
- ไม่มีคำบอกใบ้: ตัวแรก = sender ตัวถัดไป = receiver
- แยกไม่ออก: คืน needs_review=True แทนการเดา

+ unit test 3 เคส แล้วบอกความแม่นที่คาด vs เงื่อนไขที่ต้องให้คนรีวิว
