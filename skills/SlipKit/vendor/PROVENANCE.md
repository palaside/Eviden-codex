# SlipKit — ที่มาของไฟล์ vendor (เก็บเป็นของเรา วันที่รวม)
- vendor/slip_preprocess.py — จาก หลักฐานดิจิทัล DIGITAL EVIDENCE 2 (auto_crop + denoise + CLAHE + Otsu)
- vendor/slip_parser_qr.py — จากโฟลเดอร์เดียวกัน (211 บรรทัด, QR-first + fuzzy bank + clean_name)
- vendor/bank_slip_reader/{slip_parser,models,bank_detector}.py — จาก หลักฐานดิจิทัล DIGITAL EVIDENCE (783 บรรทัด rule_based)
- vendor/pii_dedup.py — PORT จาก pii_regex.js + duplicate_detector.js (JS) + ต่อยอด text_fingerprint จับ dup_ ข้าม encoding
- samples/uploads (32) — จากโฟลเดอร์ 2/uploads (JPEG ไม่มีนามสกุล)
- กฎ: ห้ามแก้ vendor ตรงๆ (wrap/extend ข้างนอก), อัปเดตไฟล์นี้ทุกครั้งที่ sync
