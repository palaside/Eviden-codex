---
name: Delete_BG-Skill
description: ทักษะสำหรับลบลวดลายพื้นหลังแชท (CLAHE) และทำ AI Super-Resolution ขยายภาพให้คมชัดก่อนจัดลง A4
---

# Delete_BG-Skill

ทักษะนี้ถูกออกแบบมาเพื่อจัดการกับ **ภาพแชทที่มีลวดลายพื้นหลังรบกวนสายตา** หรือ **ภาพที่เบลอความละเอียดต่ำ** โดยเฉพาะ การทำงานจะถูกแบ่งออกเป็น 2 ขั้นตอนหลักเพื่อผลลัพธ์ที่คมชัดที่สุด:

## กระบวนการทำงาน (Workflow)

### 1. ลบลวดลายและดึงความต่างสี (Pre-processing)
ระบบจะใช้ OpenCV ทำ **CLAHE (Contrast Limited Adaptive Histogram Equalization)** เพื่อปรับคอนทราสต์ของรูปภาพให้โดดเด่นขึ้นมา และทำ Background Masking กรองลวดลายจางๆ บนพื้นหลังให้กลายเป็นสีเรียบ เพื่อให้กระบวนการหั่นภาพ (Slicer) ทำงานได้แม่นยำ ไม่สับสนกับลวดลาย

### 2. AI Super-Resolution & Slicing
หลังจากระบบหั่นภาพบริเวณช่องว่าง (Quiet Zones) เสร็จเรียบร้อย ชิ้นส่วนภาพแต่ละชิ้นจะถูกส่งเข้าโมเดล AI Super-Resolution ของ OpenCV (`cv2.dnn_superres` โมเดล EDSR) เพื่อซ่อมแซมและขยายพิกเซล (Upscale) ให้คมกริบก่อนนำไปแปะลงบนหน้ากระดาษ A4

## วิธีการใช้งาน (How to Use)
ให้เรียกใช้งานสคริปต์ Python ในโฟลเดอร์ `scripts` โดยตรง:
```powershell
python <SKILL_DIR>/scripts/enhance_and_slice.py <IMAGE_PATH> <OUTPUT_PDF_PATH>
```

## ข้อกำหนดระบบ (Dependencies)
รันคำสั่งนี้หากยังไม่มีไลบรารี:
```powershell
pip install opencv-contrib-python Pillow numpy requests
```
*(หมายเหตุ: สคริปต์จะทำการดาวน์โหลดไฟล์โมเดล AI EDSR_x4.pb ขนาด ~38MB อัตโนมัติในการรันครั้งแรก)*
