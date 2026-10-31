# Chat Slip Enhancement Dual-Stream Research Design

## Status

Design approved in conversation on 2026-10-30. Implementation has not started.

## Goal

สร้างเครื่องมือวิจัยสำหรับภาพแชทคุณภาพต่ำ โดยพิสูจน์แยกกันว่า:

1. ภาพดิบทั้งใบมีข้อมูลเพียงพอให้ตรวจพบสลิปหรือไม่
2. การตรวจจับกรอบและการ crop ทำให้ข้อมูลสลิปดีขึ้นหรือทำให้ข้อมูลหาย
3. ภาพอนุพันธ์ช่วยการอ่านรายละเอียดได้จริงหรือเพียงทำให้ภาพดูคมขึ้น

กรณีตั้งต้นคือ `For Test/แชทที่ 3/chatv3 (15).jpg` ซึ่งมีสลิป ttb สองจุด ยอดที่อ่านได้จากภาพคือ `800.00` และ `200.00` การตรวจพบครบสองจุดถือว่าผ่านเฉพาะขั้น Detection ไม่ใช่การผ่านขั้น Extraction หรือการยืนยันธุรกรรม

## Scope

อยู่ใน scope:

- รับภาพดิบและคำนวณ source SHA-256
- สร้างภาพอนุพันธ์หลาย variant โดยไม่แก้ต้นฉบับ
- แยกการประมวลผลเป็น Stream A และ Stream B
- ตรวจจับกรอบสลิปและเก็บพิกัด/confidence
- สร้าง crop artifact ของแต่ละสลิป
- เก็บ provenance และ hash ของทุก artifact
- แสดงต้นฉบับ/derived/stream/variant บน Canvas
- สร้าง report ที่แยก detection, enhancement และ extraction
- คงผลทั้งหมดเป็น review-only

อยู่นอก scope ของเฟสแรก:

- การยืนยันว่าธุรกรรมจริงหรือปลอม
- การเติมชื่อ ยอด เวลา หรือ Ref ID ที่อ่านไม่ชัด
- การเลือกผลที่ดีที่สุดโดยอัตโนมัติเมื่อ variants ขัดแย้งกัน
- การถือว่า OCR/Gemini confidence เป็น ground truth
- การประกาศว่า extraction ผ่านก่อนมี extraction benchmark แยกต่างหาก

## Ground truth และเกณฑ์ผ่าน

สำหรับ `chatv3 (15).jpg`:

- expected slip count: `2`
- slip 1: ttb, amount `800.00`
- slip 2: ttb, amount `200.00`
- ชื่อ/วันเวลา/Ref ID ใช้เฉพาะค่าที่มนุษย์อ่านจากภาพได้จริง และ field ที่ไม่ชัดต้องเป็น unknown/review-required

Detection gate:

```text
detected_count === 2 -> detection_pass = true
detected_count !== 2 -> detection_pass = false
detected_count > 2 -> ต้องบันทึก false-positive review เพิ่ม
```

เกณฑ์นี้ตัดสินเฉพาะจำนวนจุดตรวจพบตามที่ผู้ใช้กำหนด ส่วน bbox geometry, confidence และ crop integrity จะเก็บเป็นหลักฐานวินิจฉัย ไม่ใช้เปลี่ยนความหมายของ detection gate โดยไม่ผ่านการยืนยันใหม่

## Dual-stream data flow

```text
raw full image
├─ Stream A: full-image variants
│  └─ detect slips per variant
│
└─ Stream B: detect on raw image
   └─ crop each detected slip
      └─ create crop variants per slip
```

### Stage 0 — Source lock

- ตรวจชนิดไฟล์และขนาด
- อ่าน dimensions
- คำนวณ SHA-256
- บันทึก source manifest
- ห้ามเขียนทับ source

### Stage 1 — Stream A

สร้าง variants จากภาพทั้งใบ:

- original reference
- upscale 2x
- upscale 4x
- brightness/gamma
- CLAHE
- denoise
- sharpen
- grayscale
- adaptive threshold

แต่ละ variant ต้องมี artifact hash, dimensions, engine และ parameters

### Stage 2 — Detection per Stream A variant

บันทึกจำนวนกรอบ, bbox, confidence, ขนาดกรอบ และ detection status ของแต่ละ variant แยกกัน ไม่รวมผลต่าง variants เป็นผลเดียวโดยอัตโนมัติ

### Stage 3 — Stream B crop

เริ่มจาก raw full image, ตรวจกรอบสลิป และสร้าง `slip-01/crop-original` กับ `slip-02/crop-original` ตามกรอบที่พบ หากตรวจพบไม่ครบสองจุดให้รายงานตามจริงและห้ามเดากรอบเพิ่ม

### Stage 4 — Crop variants

สำหรับแต่ละ crop สร้าง:

- crop-original
- crop-upscale-2x
- crop-upscale-4x
- crop-clahe
- crop-denoise
- crop-sharpen
- crop-grayscale

ห้ามรวม crop ของสลิปคนละใบ และห้ามใช้ crop ใบหนึ่งแทนอีกใบหนึ่ง

## Artifact and provenance schema

ตัวอย่าง metadata:

ค่าที่เป็นเลขศูนย์ด้านล่างเป็นเพียงตัวอย่างรูปแบบ schema ไม่ใช่ค่า evidence จริง

```json
{
  "source_file": "chatv3 (15).jpg",
  "source_sha256": "0000000000000000000000000000000000000000000000000000000000000000",
  "artifact_file": "stream-b/slip-01/upscale-2x.png",
  "artifact_sha256": "1111111111111111111111111111111111111111111111111111111111111111",
  "stream": "B",
  "artifact_type": "slip_crop_variant",
  "parent_artifact": "stream-b/slip-01/crop-original.png",
  "bbox": {"x": 0, "y": 0, "width": 0, "height": 0},
  "transform": {
    "engine": "upscayl-or-opencv",
    "scale": 2,
    "operations": ["upscale", "clahe", "sharpen"]
  },
  "review_only": true
}
```

รายงานหลักต้องแยกอย่างน้อย:

```json
{
  "source": {},
  "stream_a": {},
  "stream_b": {},
  "detection_result": {},
  "enhancement_result": {},
  "extraction_result": {"status": "not_started"},
  "review_only": true
}
```

## Canvas/UI behavior

Canvas ต้องสลับดูได้ระหว่าง:

- source original
- Stream A full-image variant
- detected bbox overlay
- Stream B slip crop original
- Stream B crop variant ของ slip 1 และ slip 2

ต้องแสดง label แหล่งภาพ เช่น:

```text
ต้นฉบับ
Derived · Stream A · Upscale 2x
Derived · Stream B · Slip 01 · CLAHE
```

ห้ามใช้ภาพอนุพันธ์แทนภาพหลักฐานต้นฉบับ และห้ามเปลี่ยนผลเป็น confirmed

## Failure handling

- enhancement engine ไม่พร้อม: `enhancement_status = unavailable` และเก็บ source ต่อ
- bbox ว่าง/เกินขอบ/อ่าน crop ไม่ได้: `crop_status = failed` พร้อม reason
- variants ขัดแย้งกัน: `conflict_status = review_required`
- provider quota เต็ม: `provider_status = quota_exceeded`, ไม่สรุป extraction ผ่าน
- ไฟล์ artifact เสียหรือ hash ไม่ตรง: ไม่ส่งต่อไป extraction และรายงาน artifact failure

## Verification plan

เฟสแรกตรวจตามลำดับ:

1. source lock และ source hash
2. สร้าง Stream A manifest และ artifacts
3. detection ต่อ variant
4. สร้าง Stream B crop 2 จุดตามที่ตรวจพบ
5. ตรวจ crop integrity และ provenance
6. แสดง source/derived บน Canvas
7. รายงาน `detection_pass` แยกจาก `extraction_status`

Extraction benchmark จะเป็นเฟสถัดไป และต้องรายงาน field-level comparison กับ ground truth โดยแยก Gemini, local OCR และ QR decoder ออกจากกัน

## Acceptance criteria

- ต้นฉบับยังอยู่และ source hash ไม่เปลี่ยน
- ทุก derived artifact มี hash และย้อนกลับไป source ได้
- Stream A และ Stream B แยกผลและแยก provenance
- `chatv3 (15).jpg` ตรวจพบสลิป 2 จุดหรือรายงานจำนวนจริงโดยไม่เดา
- crop แต่ละใบมี artifact และ bbox ของตัวเอง
- Canvas ระบุ source/stream/variant ชัดเจน
- report แยก detection, enhancement และ extraction
- extraction ที่ยังไม่รันแสดง `not_started`
- ข้อมูลไม่ชัดคงเป็น `review_required`
- ไม่มีการยืนยันธุรกรรมจาก enhancement หรือ detection เพียงอย่างเดียว
