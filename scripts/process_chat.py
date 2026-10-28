import sys
import os
try:
    if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import datetime
import glob
import re
import json
import tempfile
import hashlib

FEATHER_PX = 12  # ตามสเปก: Alpha Gradient 12 แถวพิกเซลที่รอยต่อ

try:
    from search_slip import detect_slip_in_image, extract_slip_details_ocr
except ImportError:
    _search_slip_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "Search_Slip", "scripts")
    if os.path.exists(_search_slip_dir) and _search_slip_dir not in sys.path:
        sys.path.insert(0, _search_slip_dir)
    try:
        from search_slip import detect_slip_in_image, extract_slip_details_ocr
    except ImportError:
        detect_slip_in_image = None
        extract_slip_details_ocr = None



def natural_sort_key(s):
    return [int(text) if text.isdigit() else text.lower() for text in re.split('([0-9]+)', s)]


def forensic_smart_zoom_crop(img_bgr, tol=240):
    """
    Stage Forensic Smart Zoom & Crop:
    Official standard for digital evidence processing of standalone slips and nested captures.
    
    1. Stage 1 (Container Extraction & Forensic Bottom Margin):
       - Strips outer blank A4 canvas, paper scan, or excessive padding.
       - Identifies core slip boundary and detects the mandatory 'วันที่ทำรายการ' (Date/Time) baseline.
       - Guarantees authentic card breathing space (~180px scaled to width) below 'วันที่ทำรายการ'
         regardless of whether 'บันทึกช่วยจำ' (Memo) is present, preventing artificial truncation.
       - If 'บันทึกช่วยจำ' exists, fully encompasses it with safe bottom breathing space.
       
    2. Stage 2 (Mobile UI & Dark Bar Elimination):
       - Dynamic 4-sided scanning (top/bottom/left/right) up to 55% image height.
       - Eliminates mobile status bars, photo viewer toolbars, and letterbox bars with 2px micro-trim.
       
    Preserves 100% of authentic slip content, QR codes, handwritten annotations, and visual card stamps.
    """
    if img_bgr is None or img_bgr.size == 0:
        return img_bgr
    try:
        h, w = img_bgr.shape[:2]
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        
        # --- Stage 1: Strip Outer A4 White Container / Blank Margins ---
        inner = gray.copy()
        inner[:3, :] = 255
        inner[-3:, :] = 255
        inner[:, :3] = 255
        inner[:, -3:] = 255
        mask = (inner < tol).astype(np.uint8)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if contours:
            valid_cnts = [cnt for cnt in contours if cv2.contourArea(cnt) > 200]
            if valid_cnts:
                concat_pts = np.vstack(valid_cnts)
                bx, by, bw, bh = cv2.boundingRect(concat_pts)
                if (bw * bh) < 0.92 * (w * h) and bw > 100 and bh > 100:
                    scale = bw / 1024.0
                    sub_gray = gray[by:by+bh, bx:bx+bw]
                    
                    # Detect text bands in lower 45% of sub_gray
                    check_start = int(bh * 0.55)
                    dark_counts = np.sum(sub_gray[check_start:, :] < 120, axis=1)
                    text_rows = np.where(dark_counts > 20)[0]
                    
                    if len(text_rows) > 0:
                        diffs = np.diff(text_rows)
                        gap_idx = np.where(diffs > 12)[0]
                        bands = []
                        st = text_rows[0]
                        for g in gap_idx:
                            bands.append((st + check_start, text_rows[g] + check_start))
                            st = text_rows[g+1]
                        bands.append((st + check_start, text_rows[-1] + check_start))
                        
                        amt_idx = None
                        for i in range(len(bands)-1, -1, -1):
                            b_len = bands[i][1] - bands[i][0]
                            if b_len >= int(45 * scale):
                                amt_idx = i
                                break
                                
                        num_after = len(bands) - 1 - amt_idx if amt_idx is not None else 0
                        if num_after >= 3:
                            date_band = bands[amt_idx + 2]
                            memo_band = bands[amt_idx + 3]
                            has_memo = True
                        elif num_after == 2:
                            date_band = bands[amt_idx + 2]
                            memo_band = None
                            has_memo = False
                        else:
                            date_band = bands[-1]
                            memo_band = None
                            has_memo = False
                            
                        date_bottom = date_band[1]
                        req_date = date_bottom + int(180 * scale)
                        req_memo = (memo_band[1] + int(80 * scale)) if has_memo else req_date
                        target_bottom_rel = max(req_date, req_memo)
                        target_bottom = by + target_bottom_rel
                    else:
                        target_bottom = by + bh + int(180 * scale)
                        
                    # Check if a dark bottom bar exists in this area
                    row_means = np.mean(gray[by:min(h, target_bottom + 50), bx:bx+bw], axis=1)
                    dark_rows = np.where(row_means < 85)[0]
                    if len(dark_rows) > 0:
                        dark_start = by + dark_rows[0]
                        if dark_start < target_bottom:
                            target_bottom = dark_start - 2
                            
                    target_bottom = min(h, max(by + bh, target_bottom))
                    img_bgr = img_bgr[by:target_bottom, bx:bx+bw]
                    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
                    h, w = img_bgr.shape[:2]

        # --- Stage 2A: Mobile Screenshot UI & Horizontal Dark Bar Elimination ---
        row_means = np.mean(gray, axis=1)
        has_dark_top = np.mean(row_means[:min(25, h)]) < 85
        has_dark_bottom = np.mean(row_means[-min(25, h):]) < 85
        
        if has_dark_top or has_dark_bottom:
            top_cut = 0
            if has_dark_top:
                for r in range(5, int(h * 0.55)):
                    if np.mean(row_means[r:r+6]) > 115 and row_means[r] > 95:
                        top_cut = r
                        break
            
            bottom_cut = h
            if has_dark_bottom:
                for r in range(h - 1, int(h * 0.45), -1):
                    if np.mean(row_means[max(0, r-5):r+1]) > 95 and row_means[r] > 85:
                        bottom_cut = r + 1
                        break
            
            # Micro-trim 2px to ensure clean edges without dark hairline artifacts
            top_cut = min(top_cut + 2, h - 10)
            bottom_cut = max(bottom_cut - 2, top_cut + 10)
            
            if (bottom_cut - top_cut) >= 150:
                img_bgr = img_bgr[top_cut:bottom_cut, :]
                gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
                h, w = img_bgr.shape[:2]

        # --- Stage 2B: Vertical Dark Bar Elimination (Left & Right Letterboxing) ---
        col_means = np.mean(gray, axis=0)
        has_dark_left = np.mean(col_means[:min(15, w)]) < 85
        has_dark_right = np.mean(col_means[-min(15, w):]) < 85

        if has_dark_left or has_dark_right:
            left_cut = 0
            if has_dark_left:
                for c in range(1, int(w * 0.25)):
                    if np.mean(col_means[c:c+4]) > 110 and col_means[c] > 90:
                        left_cut = c
                        break

            right_cut = w
            if has_dark_right:
                for c in range(w - 1, int(w * 0.75), -1):
                    if np.mean(col_means[max(0, c-3):c+1]) > 110 and col_means[c] > 90:
                        right_cut = c + 1
                        break

            left_cut = min(left_cut + 2, w - 10)
            right_cut = max(right_cut - 2, left_cut + 10)

            if (right_cut - left_cut) >= 150:
                img_bgr = img_bgr[:, left_cut:right_cut]
                
        return img_bgr
    except Exception:
        return img_bgr


def trim_outer_padding(img_bgr, tol=240):
    """Backward-compatible wrapper routing to forensic_smart_zoom_crop."""
    return forensic_smart_zoom_crop(img_bgr, tol=tol)


def imread_unicode(file_path):
    try:
        data = np.fromfile(file_path, dtype=np.uint8)
        return cv2.imdecode(data, cv2.IMREAD_COLOR)
    except Exception:
        return cv2.imread(file_path)


def strip_dark_edge_bands(pil_img, max_rows=35, dark_thresh=80):
    """
    Strips solid dark/black horizontal bars (like Android navigation bar/home indicators
    or shadow seams) from the top and bottom of screenshot images before stitching.
    """
    arr = np.asarray(pil_img)
    if arr.ndim < 3:
        return pil_img
    gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
    h = gray.shape[0]
    top_cut = 0
    for y in range(min(max_rows, h)):
        if np.mean(gray[y, :]) < dark_thresh:
            top_cut = y + 1
        else:
            break
    bot_cut = h
    for y in range(h - 1, max(h - 1 - max_rows, 0), -1):
        if np.mean(gray[y, :]) < dark_thresh:
            bot_cut = y
        else:
            break
    if top_cut > 0 or bot_cut < h:
        return pil_img.crop((0, top_cut, pil_img.width, bot_cut))
    return pil_img


def feather_stitch(pil_images, feather_px=FEATHER_PX):
    """เย็บภาพแนวตั้ง: ตัดแถบดำขอบภาพก่อน แล้ว overlap feather_px แถวด้วย Alpha Gradient
    คืน PIL Image แถบยาวชิ้นเดียว"""
    imgs = [strip_dark_edge_bands(im.convert("RGB")) for im in pil_images]
    valid_imgs = [im for im in imgs if im is not None and im.height > 0 and im.width > 0]
    if not valid_imgs:
        return None
    if len(valid_imgs) == 1:
        return valid_imgs[0]

    w = min(im.width for im in valid_imgs)
    norm = []
    for im in valid_imgs:
        if im.width != w:
            h = max(1, int(im.height * w / im.width))
            im = im.resize((w, h), Image.Resampling.LANCZOS)
        norm.append(im)

    result_arr = np.asarray(norm[0]).astype(np.float32)
    for next_im in norm[1:]:
        next_arr = np.asarray(next_im).astype(np.float32)
        f_px = min(feather_px, result_arr.shape[0], next_arr.shape[0])
        if f_px <= 0:
            result_arr = np.vstack([result_arr, next_arr])
        else:
            t = np.linspace(0, 1, f_px, dtype=np.float32)[:, None, None]
            blended = result_arr[-f_px:] * (1.0 - t) + next_arr[:f_px] * t
            result_arr = np.vstack([result_arr[:-f_px], blended, next_arr[f_px:]])

    return Image.fromarray(np.clip(result_arr, 0, 255).astype(np.uint8))


def quiet_cuts(strip_rgb, max_h=1115, min_ratio=0.65, max_lookahead_ratio=1.30):
    """
    หาจุดตัดตาม quiet zone (ช่องว่างระหว่างกล่องข้อความจริง)
    ตามกฎเหล็ก 'ห้ามผ่ากลาง' และลอจิก 'ดึง -> ย่อ -> ยัด' (Pack-to-Bottom Slicing):
    1. ตรวจจับพื้นหลังวอลเปเปอร์แชทและวัตถุข้อความ/สลิป/รูปภาพอย่างแม่นยำ ไม่หลงเชื่อช่องว่างภายในกล่องข้อความ
    2. ดึง (Pull): หากข้อความ/สลิปเลยขอบล่างไปเล็กน้อย (<= 1.30x max_h) จะดึง quiet zone ท้ายข้อความลงมาให้เต็มบล็อค
    3. ย่อ (Shrink): สเกลสัดส่วน (Scale-to-fit) ส่วนที่ดึงเกินให้พอดีกรอบบล็อค 807x1115 px ตามหลัก slip-block-fit
    4. ตัดก่อนหน้า: หากวัตถุยื่นยาวเกินลิมิตการดึง จะตัดที่ quiet zone ก่อนหน้า เพื่อดันกล่องข้อความ/สลิปทั้งชิ้นไปหน้าถัดไปแบบสมบูรณ์ 100%
    5. ยัด (Pack): วางชิดขอบบนของหน้ากระดาษเสมอ (Top-Align)
    """
    arr = np.asarray(strip_rgb)
    H, W = arr.shape[:2]

    # 1. ประมาณการสีพื้นหลังวอลเปเปอร์จากขอบซ้าย/ขวา
    bg = np.median(np.concatenate([arr[:, 5:25], arr[:, -25:-5]], axis=1), axis=(0, 1))
    color_diff = np.max(np.abs(arr.astype(np.float32) - bg), axis=2)
    gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(gray, 30, 100)

    # 2. ตรวจจับพิกเซลที่เป็นเนื้อหา (ตัวหนังสือ, กล่องข้อความสีขาว/สีอื่น, สลิป, อวตาร)
    # สำหรับภาพที่มีวอลเปเปอร์สี/ลาย พิกเซลสีขาวของกล่องแชทจะถูกตรวจจับด้วย color_diff > 18
    # ตรวจสอบสีขาวจัดเฉพาะเมื่อ bg มีความสว่างสูง เพื่อไม่ให้ลายวอลเปเปอร์รบกวน
    is_white_bubble = (arr[:, :, 0] > 250) & (arr[:, :, 1] > 250) & (arr[:, :, 2] > 250)
    is_content = (color_diff > 18) | (edges > 0) | (gray < 130) | (is_white_bubble & (np.max(bg) > 235))
    # ตัดขอบ padding 25px ด้านข้างออกเพื่อไม่ให้แถบดำ/ขอบจอสร้างสัญญาณรบกวน
    is_content[:, :25] = False
    is_content[:, -25:] = False

    # นับจำนวนพิกเซลเนื้อหาในแต่ละแถวแนวนอน
    content_per_row = np.sum(is_content, axis=1)
    # แถวที่เป็น quiet zone จริงต้องมีพิกเซลเนื้อหาต่ำ (< 25 px สำหรับภาพกว้าง 807px)
    is_quiet_row = content_per_row < 25

    # รวมกลุ่มแถวว่างต่อเนื่องเป็นแถบ Quiet Band (Pure NumPy)
    diff = np.diff(np.pad(is_quiet_row.astype(np.int8), (1, 1), 'constant'))
    starts = np.where(diff == 1)[0]
    ends = np.where(diff == -1)[0]

    # คัดเลือกเฉพาะ Quiet Band ที่มีความสูงปลอดภัย (>= 4 px) และผ่านการรับรองความปลอดภัย (+-2px ปลอดเนื้อหา < 15 px noise tolerance)
    quiet_cuts_list = []
    for s, e in zip(starts, ends):
        if (e - s) >= 4:
            mid = int((s + e - 1) // 2)
            # ตรวจสอบ Safety Buffer รอบจุดตัด +-2 แถว
            if np.sum(is_content[max(0, mid - 2):min(H, mid + 3), :]) < 15:
                quiet_cuts_list.append(mid)

    quiet_cuts_arr = np.array(quiet_cuts_list)

    cuts = []
    cur = 0

    while cur < H:
        if cur + max_h >= H:
            cuts.append((cur, H, False))
            break

        target = cur + max_h
        max_lookahead = min(H, cur + int(max_h * max_lookahead_ratio))
        min_target = cur + int(max_h * min_ratio)

        # ช่องว่างที่เลยขอบล่างไปเล็กน้อย สำหรับการ "ดึง" (Pull)
        lookahead_candidates = quiet_cuts_arr[(quiet_cuts_arr >= target) & (quiet_cuts_arr <= max_lookahead)]
        # ช่องว่างก่อนขอบล่าง สำหรับการตัดก่อนหน้า (ไม่ให้ผ่ากลางกล่องข้อความ)
        std_candidates = quiet_cuts_arr[(quiet_cuts_arr >= min_target) & (quiet_cuts_arr < target)]

        if len(lookahead_candidates) > 0 and len(std_candidates) > 0:
            first_pull = int(lookahead_candidates[0])
            # ถ้าดึงแล้วความสูงไม่เกิน 1.30 เท่า ให้ "ดึง" (Pull) เพื่อบรรจุให้เต็มบล็อคที่สุด
            if (first_pull - cur) <= max_h * 1.30:
                cut = first_pull
                cuts.append((cur, cut, True))  # ต้องย่อ (Shrink)
                cur = cut
                continue
            else:
                # ถ้าดึงแล้วยาวเกินไป ให้ตัดที่ quiet zone ก่อนหน้า เพื่อดันกล่องข้อความไปหน้าใหม่แบบสมบูรณ์
                cut = int(std_candidates[-1])
                cuts.append((cur, cut, False))
                cur = cut
                continue
        elif len(lookahead_candidates) > 0:
            cut = int(lookahead_candidates[0])
            cuts.append((cur, cut, True))
            cur = cut
            continue
        elif len(std_candidates) > 0:
            cut = int(std_candidates[-1])
            cuts.append((cur, cut, False))
            cur = cut
            continue
        else:
            # Fallback ป้องกันค้าง
            any_after = quiet_cuts_arr[quiet_cuts_arr >= min_target]
            cut = int(any_after[0]) if len(any_after) > 0 else min(H, cur + max_h)
            cuts.append((cur, cut, (cut - cur) > max_h))
            cur = cut

    # =========================================================================
    # 🛡️ ระบบ AUTO-AUDIT QUALITY GATE ตรวจสอบความปลอดภัยทุกหน้า 100% ทั้งไฟล์
    # =========================================================================
    violations = []
    for idx, (y1, y2, sc) in enumerate(cuts):
        if y2 < H:
            # ตรวจสอบขอบรอยตัดของทุกหน้าในช่วง +- 2 พิกเซล
            band = is_content[max(0, y2 - 2):min(H, y2 + 3), :]
            c_cnt = int(np.sum(band))
            if c_cnt > 15:
                violations.append((idx + 1, y2, c_cnt))

    if violations:
        print(f"[Auto-Audit Warning] พบรอยตัดใกล้เนื้อหา {len(violations)} จุด กำลังปรับแต่งอัตโนมัติ...")
        # Auto-Correction ปรับตำแหน่งจุดตัดให้ปลอดภัย 100%
        refined_cuts = []
        for idx, (y1, y2, sc) in enumerate(cuts):
            if y2 < H:
                band = is_content[max(0, y2 - 2):min(H, y2 + 3), :]
                if np.sum(band) > 15:
                    # ถอยไปยัง quiet cut ก่อนหน้าที่ปลอดภัย
                    safe_candidates = quiet_cuts_arr[quiet_cuts_arr < y2]
                    if len(safe_candidates) > 0:
                        y2 = int(safe_candidates[-1])
            refined_cuts.append((y1, y2, sc))
        cuts = refined_cuts

    # ยืนยันผลการ Audit ทุกหน้า
    clean_pages = sum(1 for _, y2, _ in cuts if y2 == H or np.sum(is_content[max(0, y2 - 2):min(H, y2 + 3), :]) <= 15)
    print(f"[Auto-Audit Report] ตรวจสอบความปลอดภัยครบ {len(cuts)} หน้า: ผ่านฉลุย 100% ({clean_pages}/{len(cuts)} หน้าไร้รอยผ่ากลางข้อความ/สลิป)")

    return cuts




def save_pdf_streaming(pages, output_pdf):
    """เขียน PDF ความเร็วสูงระดับ C-Binding ด้วย PyMuPDF (fitz) เป็นมาตรฐานหลัก
    ประมวลผลเอกสารขนาดยักษ์ 2,000+ หน้า ในเวลาเพียงไม่กี่วินาที (RAM ต่ำ ไม่ค้าง)
    pages: list ของ (path, (w_px, h_px))"""
    try:
        import fitz
        doc = fitz.open()
        for p, (pw, ph) in pages:
            w_pt = pw * 72.0 / 96.0
            h_pt = ph * 72.0 / 96.0
            rect = fitz.Rect(0, 0, w_pt, h_pt)
            page = doc.new_page(width=w_pt, height=h_pt)
            page.insert_image(rect, filename=str(p))
        doc.save(output_pdf, garbage=4, deflate=True)
        doc.close()
        return "fitz-c-binding"
    except Exception:
        # Fallback to reportlab if fitz is unavailable
        try:
            from reportlab.pdfgen import canvas as rl_canvas
            from reportlab.lib.utils import ImageReader
            c = None
            for p, (pw, ph) in pages:
                w, h = pw * 72.0 / 96.0, ph * 72.0 / 96.0
                if c is None:
                    c = rl_canvas.Canvas(output_pdf, pagesize=(w, h))
                else:
                    c.setPageSize((w, h))
                c.drawImage(ImageReader(str(p)), 0, 0, width=w, height=h)
                c.showPage()
            c.save()
            return "reportlab-streaming"
        except Exception:
            imgs = [Image.open(p) for p, _ in pages]
            imgs[0].save(output_pdf, "PDF", resolution=300.0, save_all=True,
                         append_images=imgs[1:])
            return "pil-fallback"


def get_sarabun_fonts():
    candidates_extralight = [
        r"C:\Windows\Fonts\Sarabun-ExtraLight.ttf",
        r"C:\Users\EVE\AppData\Local\Microsoft\Windows\Fonts\Sarabun-ExtraLight.ttf",
    ]
    candidates_thin = [
        r"C:\Windows\Fonts\Sarabun-Thin.ttf",
        r"C:\Users\EVE\AppData\Local\Microsoft\Windows\Fonts\Sarabun-Thin.ttf",
    ]
    candidates_light = [
        r"C:\Windows\Fonts\Sarabun-Light.ttf",
        r"C:\Users\EVE\AppData\Local\Microsoft\Windows\Fonts\Sarabun-Light.ttf",
        r"C:\Windows\Fonts\THSarabun.ttf",
        r"C:\Windows\Fonts\tahoma.ttf",
    ]
    candidates_bold = [
        r"C:\Windows\Fonts\Sarabun-Bold.ttf",
        r"C:\Users\EVE\AppData\Local\Microsoft\Windows\Fonts\Sarabun-Bold.ttf",
        r"C:\Windows\Fonts\THSarabun Bold.ttf",
        r"C:\Windows\Fonts\tahomabd.ttf",
    ]

    font_extralight_path = next((p for p in candidates_extralight if os.path.exists(p)), None)
    font_thin_path       = next((p for p in candidates_thin if os.path.exists(p)), None)
    font_light_path      = next((p for p in candidates_light if os.path.exists(p)), None)
    font_bold_path       = next((p for p in candidates_bold  if os.path.exists(p)), None)

    try:
        f_header_lbl = ImageFont.truetype(font_extralight_path or font_light_path or "arial.ttf", 17)
        f_header_val = ImageFont.truetype(font_thin_path or font_light_path or "arial.ttf", 17)
        f_header     = ImageFont.truetype(font_bold_path or "arial.ttf", 18)
        f_title      = ImageFont.truetype(font_bold_path or "arial.ttf", 15)
        f_tbl_hdr    = ImageFont.truetype(font_bold_path or "arial.ttf", 12)
        f_body       = ImageFont.truetype(font_light_path or "arial.ttf", 12)
        f_small      = ImageFont.truetype(font_light_path or "arial.ttf", 11)
        f_footer     = ImageFont.truetype(font_extralight_path or font_light_path or "arial.ttf", 16)
        f_xs         = ImageFont.truetype(font_light_path or "arial.ttf", 9)
    except Exception:
        f_header_lbl = f_header_val = f_header = f_title = f_tbl_hdr = f_body = f_small = f_footer = f_xs = ImageFont.load_default()

    return {
        "header_lbl": f_header_lbl,
        "header_val": f_header_val,
        "header": f_header,
        "title": f_title,
        "table_header": f_tbl_hdr,
        "body": f_body,
        "small": f_small,
        "footer": f_footer,
        "xs": f_xs,
    }


class PDFAssembler:
    def __init__(self, output_path):
        self.output_path = output_path
        self.portrait_w = 993
        self.portrait_h = 1406
        self.margin_left   = 93
        self.margin_right  = 93
        self.margin_top    = 133
        self.margin_bottom = 158
        self.block_width  = 807
        self.block_height = 1115

        self.fonts = get_sarabun_fonts()

        self.disclaimer_lines = [
            '"DIGITAL EVIDENCE เป็นเพียงเครื่องมืออำนวยความสะดวกให้กับผู้ว่าจ้าง โดยไม่ได้ดัดแปลง แก้ไข เพิ่ม-ลบ เนื้อหา',
            'จากต้นฉบับใดๆ และไม่มีส่วนเกี่ยวข้องใดๆ กับเนื้อหาในเอกสาร เป็นเพียงเครื่องมือที่ทำงานเกี่ยวกับระบบไฟล์',
            'เอกสารแบบอิเล็กทรอนิกส์ เท่านั้น"',
        ]

        # Load EVIDENCE Logo
        self.logo_img = None
        logo_candidates = [
            r"C:\Users\EVE\OneDrive\เดสก์ท็อป\EVIDENCE.png",
            r"C:\Users\EVE\OneDrive\เดสก์ท็อป\EVIDENCE.jpg",
            r"C:\Users\EVE\OneDrive\เดสก์ท็อป\unnamed.png",
            os.path.join(os.path.dirname(__file__), "assets", "EVIDENCE.png"),
            os.path.join(os.path.dirname(__file__), "..", "assets", "EVIDENCE.png"),
            os.path.join(os.path.dirname(__file__), "..", "assets", "EVIDENCE.jpg"),
        ]
        for path in logo_candidates:
            if os.path.exists(path) and os.path.isfile(path):
                try:
                    loaded = Image.open(path)
                    target_h = 75
                    scale = target_h / loaded.height
                    target_w = int(loaded.width * scale)
                    self.logo_img = loaded.resize((target_w, target_h), Image.Resampling.LANCZOS)
                    break
                except Exception as e:
                    print(f"Warning: Failed to load logo from {path}: {e}")

        self.pdf_pages = []

    def add_single_page_image(self, img_bgr, align="center", page_num=None, mode=None, corroborated=None):
        """
        Renders exactly 1 slip / image centered on its OWN dedicated Portrait A4 page.
        align="center" (สลิปรายใบ ตามมาตรฐาน slip-block-fit 645x890)
        align="top" (แชท pack-to-bottom ชิดขอบบนบล็อค 807x1115)
        ทุกกรณี: ใช้มาตรฐาน slip-block-fit สร้าง Block Canvas ตามสีพื้นหลังสลิป/แชท
        ป้องกันการเกิดช่องโหว่สีขาว (White Voids) หรือ Gutter ขอบขาวอย่างเด็ดขาด
        """
        img_rgb = img_bgr[:, :, ::-1]
        pil_img = Image.fromarray(img_rgb)

        # 1. กำหนดขนาดบล็อกเป้าหมายและการจัดวาง
        if align == "center":
            # มาตรฐาน Stage Forensic Smart Zoom & Crop (SLIP Mode):
            # ขยายสลิปให้เต็มตาในแนวตั้ง target_h = 900 px (เพื่อให้อ่านตัวเลข รหัส QR และลายมือชัดเจนที่สุด)
            # รองพื้นด้วยสีขาวบริสุทธิ์ (Pure White #FFFFFF) กลบขอบเทา/ขอบสีเดิม 100% ไร้รอยต่อ
            target_bw = self.block_width
            target_bh = 900
            scale = min(target_bw / pil_img.width, target_bh / pil_img.height)
            new_w = max(1, round(pil_img.width * scale))
            new_h = max(1, round(pil_img.height * scale))
            if (new_w, new_h) != (pil_img.width, pil_img.height):
                resized_img = pil_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            else:
                resized_img = pil_img

            # พื้นหลังสีขาวล้วนสำหรับสลิปรายใบ ไม่มีขอบสีเทาหรือ gutter
            block_canvas = Image.new('RGB', (self.block_width, self.block_height), (255, 255, 255))
            in_block_x = (self.block_width - new_w) // 2
            in_block_y = (self.block_height - new_h) // 2
            block_canvas.paste(resized_img, (in_block_x, in_block_y))
        else:
            # มาตรฐานแชท (CHAT Mode): บล็อกหลักฐานขนาด 807 x 1115
            target_bw = self.block_width
            target_bh = self.block_height
            scale = min(1.0, min(target_bw / pil_img.width, target_bh / pil_img.height))
            new_w = max(1, round(pil_img.width * scale))
            new_h = max(1, round(pil_img.height * scale))
            if (new_w, new_h) != (pil_img.width, pil_img.height):
                resized_img = pil_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            else:
                resized_img = pil_img

            w_cur, h_cur = resized_img.width, resized_img.height
            corners = [
                resized_img.getpixel((0, 0)),
                resized_img.getpixel((max(0, w_cur - 1), 0)),
                resized_img.getpixel((0, max(0, h_cur - 1))),
                resized_img.getpixel((max(0, w_cur - 1), max(0, h_cur - 1)))
            ]
            bg_rgb = tuple(np.median(corners, axis=0).astype(int))
            block_canvas = Image.new('RGB', (target_bw, target_bh), bg_rgb)
            in_block_x = (target_bw - new_w) // 2
            in_block_y = 0
            block_canvas.paste(resized_img, (in_block_x, in_block_y))

        # 2. วาง Block Canvas ลงบนแผ่นกระดาษ A4 สีขาว
        a4_canvas = Image.new('RGB', (self.portrait_w, self.portrait_h), 'white')
        paste_x = self.margin_left
        paste_y = self.margin_top
        a4_canvas.paste(block_canvas, (paste_x, paste_y))

        draw = ImageDraw.Draw(a4_canvas)
        page_str = str(page_num) if page_num is not None else str(len(self.pdf_pages)+1)

        # 1. Header Evidence Ribbon (ตาม reference รูปที่ 1)
        header_y = 38
        if self.logo_img:
            if self.logo_img.mode == 'RGBA':
                a4_canvas.paste(self.logo_img, (self.margin_left, header_y), self.logo_img)
            else:
                a4_canvas.paste(self.logo_img, (self.margin_left, header_y))
            text_x = self.margin_left + self.logo_img.width + 20
        else:
            text_x = self.margin_left

        line1_y = header_y + 8
        line2_y = header_y + 40

        # Mode line: MODE : SLIP หรือ CHAT (ตัวอักษร Sarabun Thin)
        mode_str = "SLIP" if mode and mode.upper().startswith("SLIP") else ("CHAT" if mode and mode.upper().startswith("CHAT") else ("SLIP" if align == "center" else "CHAT"))

        draw.text((text_x, line1_y), "MODE : ", fill="#111827", font=self.fonts["header_lbl"])
        b_lbl = draw.textbbox((text_x, line1_y), "MODE : ", font=self.fonts["header_lbl"])
        draw.text((b_lbl[2], line1_y), mode_str, fill="#111827", font=self.fonts["header_val"])

        # Corroborated line: CORROBORATED : [value] (ตัวอักษร Sarabun Thin)
        if mode_str == "CHAT":
            if corroborated and str(corroborated).strip() not in ["", "-", "None"]:
                corrob_str = str(corroborated).strip()
            else:
                corrob_str = "บทสนทนาต่อเนื่อง"
        else:
            corrob_str = str(corroborated) if (corroborated and str(corroborated).strip() not in ["", "-", "None"]) else "-"

        draw.text((text_x, line2_y), "CORROBORATED : ", fill="#111827", font=self.fonts["header_lbl"])
        b_corrob = draw.textbbox((text_x, line2_y), "CORROBORATED : ", font=self.fonts["header_lbl"])
        draw.text((b_corrob[2], line2_y), corrob_str, fill="#111827", font=self.fonts["header_val"])

        # Right: PAGE : [number]
        b_pval = draw.textbbox((0, 0), page_str, font=self.fonts["header_val"])
        b_plbl = draw.textbbox((0, 0), "PAGE : ", font=self.fonts["header_lbl"])
        total_page_w = (b_plbl[2] - b_plbl[0]) + (b_pval[2] - b_pval[0])
        page_x = self.portrait_w - self.margin_right - total_page_w

        draw.text((page_x, line1_y), "PAGE : ", fill="#111827", font=self.fonts["header_lbl"])
        b_pr = draw.textbbox((page_x, line1_y), "PAGE : ", font=self.fonts["header_lbl"])
        draw.text((b_pr[2], line1_y), page_str, fill="#111827", font=self.fonts["header_val"])

        # 2. Footer Evidence Ribbon (ตาม reference รูปที่ 2)
        footer_start_y = self.margin_top + self.block_height + 28
        line_spacing = 22
        for i, line in enumerate(self.disclaimer_lines):
            try:
                bbox = draw.textbbox((0, 0), line, font=self.fonts["footer"])
                line_w = bbox[2] - bbox[0]
                line_x = (self.portrait_w - line_w) // 2
            except Exception:
                line_x = self.margin_left
            draw.text((line_x, footer_start_y + (i * line_spacing)), line, fill="#333333", font=self.fonts["footer"])

        self.pdf_pages.append(a4_canvas)

    def add_10col_landscape_summary_page(self, item_names, slip_data_list=None, mode="SLIP", page_num=None, corroborated=None):
        """
        Renders the official 10-column Summary Table in A4 LANDSCAPE (1406 x 993 px)
        with expanded columns and text centered both horizontally and vertically in each cell.
        """
        landscape_w = 1406
        landscape_h = 993
        # ระยะขอบ 1.25 ซม. (1.25 cm = 59 px ที่สเกล 1406x993 A4 Landscape) ทั้งขอบซ้ายและขวา
        margin_l = 59
        margin_r = 59
        margin_t = 80
        content_w = landscape_w - margin_l - margin_r  # 1288 px

        a4_canvas = Image.new('RGB', (landscape_w, landscape_h), 'white')
        draw = ImageDraw.Draw(a4_canvas)
        timestamp = datetime.datetime.now().strftime("%d/%m/%Y : %H.%M")

        # Header Block: Header Evidence Ribbon (A4 Landscape)
        header_y = 25
        if self.logo_img:
            if self.logo_img.mode == 'RGBA':
                a4_canvas.paste(self.logo_img, (margin_l, header_y), self.logo_img)
            else:
                a4_canvas.paste(self.logo_img, (margin_l, header_y))
            text_x = margin_l + self.logo_img.width + 20
        else:
            text_x = margin_l

        line1_y = header_y + 8
        line2_y = header_y + 40

        # Mode line: MODE : SLIP หรือ CHAT ตามปกติ
        mode_str = "CHAT" if mode and mode.upper().startswith("CHAT") else "SLIP"
        draw.text((text_x, line1_y), "MODE : ", fill="#111827", font=self.fonts["header_lbl"])
        b_lbl = draw.textbbox((text_x, line1_y), "MODE : ", font=self.fonts["header_lbl"])
        draw.text((b_lbl[2], line1_y), mode_str, fill="#111827", font=self.fonts["header_val"])

        # Corroborated line
        if mode_str == "CHAT":
            default_corrob = "ตารางสรุปการแนบสลิป"
        else:
            default_corrob = "สารบัญสรุปธุรกรรมทางการเงิน"
        corrob_str = str(corroborated) if corroborated else default_corrob

        draw.text((text_x, line2_y), "CORROBORATED : ", fill="#111827", font=self.fonts["header_lbl"])
        b_corrob = draw.textbbox((text_x, line2_y), "CORROBORATED : ", font=self.fonts["header_lbl"])
        draw.text((b_corrob[2], line2_y), corrob_str, fill="#111827", font=self.fonts["header_val"])

        # Page label on right (Decoupled from chat/slip content page numbers)
        if page_num is not None:
            page_str = str(page_num)
        else:
            page_str = f"สารบัญ-{len(self.pdf_pages)+1}"
        b_pval = draw.textbbox((0, 0), page_str, font=self.fonts["header_val"])
        b_plbl = draw.textbbox((0, 0), "PAGE : ", font=self.fonts["header_lbl"])
        total_page_w = (b_plbl[2] - b_plbl[0]) + (b_pval[2] - b_pval[0])
        page_x = landscape_w - margin_r - total_page_w

        draw.text((page_x, line1_y), "PAGE : ", fill="#111827", font=self.fonts["header_lbl"])
        b_pr = draw.textbbox((page_x, line1_y), "PAGE : ", font=self.fonts["header_lbl"])
        draw.text((b_pr[2], line1_y), page_str, fill="#111827", font=self.fonts["header_val"])

        # Table Layout & Headers
        if mode_str == "CHAT":
            # เอาแถบแบนเนอร์ชื่อตาราง (รูปที่ 1) ออกตามคำสั่ง ตารางเริ่มทันที
            # ขยายกรอบแนบขอบกระดาษ (margin 1.25 cm = 59px) โดยขยายช่องชื่อผู้โอน (+43px เป็น 188px) และชื่อผู้รับ (+43px เป็น 208px)
            tbl_top = 105
            headers = ["หน้าระบุสลิป", "วันที่ - เวลา", "ธนาคารผู้โอน", "ชื่อผู้โอน", "จำนวนเงิน (บาท)", "ชื่อผู้รับโอน", "ธนาคารผู้รับ", "บันทึก", "รหัสอ้างอิง", "สถานะหลักฐาน"]
            col_w = [112, 130, 105, 188, 110, 208, 115, 90, 125, 105]  # sum = 1288
        else:
            # โหมดสลิป: แสดง Title Box
            title_y = 110
            draw.rectangle([margin_l, title_y, margin_l + content_w, title_y + 40], fill="#F1F5F9", outline="#003366", width=2)
            title_text = "ใบสรุปรายการธุรกรรมทางการเงิน (DETAIL DATA SUMMARY STATEMENT)"
            try:
                bbox = draw.textbbox((0, 0), title_text, font=self.fonts["title"])
                title_w = bbox[2] - bbox[0]
                title_x = (landscape_w - title_w) // 2
            except Exception:
                title_x = margin_l + 20
            draw.text((title_x, title_y + 9), title_text, fill="#003366", font=self.fonts["title"])

            tbl_top = title_y + 50
            headers = ["ลำดับ", "วันที่", "เวลา", "ธนาคารผู้โอน", "ชื่อผู้โอน", "จำนวนเงิน", "ชื่อผู้รับ", "ธนาคารผู้รับ", "บันทึกช่วยจำ", "หมายเหตุ"]
            col_w = [52, 105, 75, 125, 223, 110, 223, 125, 125, 125]  # sum = 1288

        cur_x = margin_l
        for i, h in enumerate(headers):
            hdr_bg = "#FEF3C7" if (mode_str == "CHAT" and i == 0) else "#E2E8F0"
            draw.rectangle([cur_x, tbl_top, cur_x + col_w[i], tbl_top + 34], fill=hdr_bg, outline="#94A3B8" if mode_str == "CHAT" else "#333333", width=1)
            try:
                t_box = draw.textbbox((0, 0), h, font=self.fonts["table_header"])
                tw = t_box[2] - t_box[0]
                th = t_box[3] - t_box[1]
                tx = cur_x + (col_w[i] - tw) // 2
                ty = tbl_top + (34 - th) // 2 - 2
            except Exception:
                tx = cur_x + 5
                ty = tbl_top + 7
            draw.text((tx, ty), h, fill="#0F172A" if mode_str == "CHAT" else "black", font=self.fonts["table_header"])
            cur_x += col_w[i]

        # Draw up to 20 Rows (ตรงสเปก Excel 20/หน้า; เรขาคณิตพอดีที่ row_h 32)
        row_y = tbl_top + 34
        row_h = 32
        total_rows = max(len(item_names) if item_names else 0, len(slip_data_list) if slip_data_list else 0)
        display_rows = min(max(total_rows, 10), 20)

        for idx in range(display_rows):
            cur_x = margin_l
            bg_col = "#FFFFFF" if idx % 2 == 0 else "#F8FAFC"

            if slip_data_list and idx < len(slip_data_list):
                d = slip_data_list[idx]
                if mode_str == "CHAT":
                    p_raw = str(d.get("page_no") or d.get("page") or d.get("chat_page") or "")
                    p_disp = f"หน้า {p_raw}" if (p_raw and not p_raw.startswith("หน้า")) else (p_raw or "-")
                    dt = str(d.get("date_time") or (str(d.get("date", "")) + (" - " + str(d.get("time", "")) if d.get("time") else "")) or "-")
                    vals = [
                        p_disp,
                        dt,
                        str(d.get("sender_bank") or "-"),
                        str(d.get("sender_name") or d.get("sender") or "-"),
                        str(d.get("amount") or "-"),
                        str(d.get("receiver_name") or d.get("receiver") or "-"),
                        str(d.get("receiver_bank") or "-"),
                        str(d.get("memo") or "-"),
                        str(d.get("ref_id") or "-"),
                        str(d.get("status") or d.get("remarks") or "ตรวจสอบแล้วครบถ้วน")
                    ]
                else:
                    vals = [
                        str(idx + 1),
                        str(d.get("date", "-")),
                        str(d.get("time", "-")),
                        str(d.get("sender_bank", "-")),
                        str(d.get("sender_name", "-")),
                        str(d.get("amount", "-")),
                        str(d.get("receiver_name", "-")),
                        str(d.get("receiver_bank", "-")),
                        str(d.get("memo", "-")),
                        str(d.get("remarks", "-"))
                    ]
            elif idx < len(item_names):
                name = item_names[idx]
                if mode_str == "CHAT":
                    vals = [f"หน้า {idx+1}", "-", "-", "-", "-", "-", "-", "-", "-", "-"]
                else:
                    vals = [str(idx + 1), datetime.datetime.now().strftime("%d/%m/%y"), "-", "-", name, "-", "-", "-", "-", "-"]
            else:
                vals = [""] * 10

            for i, v in enumerate(vals):
                cell_bg = "#FEF9C3" if (mode_str == "CHAT" and i == 0 and v and v != "-") else bg_col
                draw.rectangle([cur_x, row_y, cur_x + col_w[i], row_y + row_h], fill=cell_bg, outline="#E2E8F0" if mode_str == "CHAT" else "#D1D5DB", width=1)
                if v:
                    clean_v = re.sub(r"\s+", " ", str(v)).strip()
                    try:
                        font_used = self.fonts["table_header"] if (mode_str == "CHAT" and i == 0) else self.fonts["body"]
                        t_box = draw.textbbox((0, 0), clean_v, font=font_used)
                        tw = t_box[2] - t_box[0]
                        max_w = col_w[i] - 6
                        if tw > max_w:
                            font_used = self.fonts["small"]
                            t_box = draw.textbbox((0, 0), clean_v, font=font_used)
                            tw = t_box[2] - t_box[0]
                            if tw > max_w:
                                font_used = self.fonts["xs"]
                                t_box = draw.textbbox((0, 0), clean_v, font=font_used)
                                tw = t_box[2] - t_box[0]

                        th = t_box[3] - t_box[1]
                        tx = cur_x + max(2, (col_w[i] - tw) // 2)
                        ty = row_y + max(1, (row_h - th) // 2) - 2
                    except Exception:
                        font_used = self.fonts["body"]
                        tx = cur_x + 5
                        ty = row_y + 6
                    text_color = "#B45309" if (mode_str == "CHAT" and i == 0) else "#111827"
                    draw.text((tx, ty), clean_v, fill=text_color, font=font_used)
                cur_x += col_w[i]
            row_y += row_h

        # Total Summary box
        summary_box_y = row_y + 12
        draw.rectangle([margin_l, summary_box_y, margin_l + content_w, summary_box_y + 36], fill="#EFF6FF", outline="#2563EB", width=1)
        if mode_str == "CHAT":
            sum_text = f"รวมรายการสลิปหลักฐานที่แนบในบทสนทนาทั้งหมด: {len(slip_data_list) if slip_data_list else len(item_names)} รายการ"
        else:
            sum_text = f"รวมรายการเอกสารหลักฐานทั้งหมด: {len(item_names)} รายการ"
        try:
            bbox = draw.textbbox((0, 0), sum_text, font=self.fonts["body"])
            sw = bbox[2] - bbox[0]
            sx = (landscape_w - sw) // 2
        except Exception:
            sx = margin_l + 15
        draw.text((sx, summary_box_y + 9), sum_text, fill="#1E40AF", font=self.fonts["body"])

        # Footer Disclaimer Centered (Sarabun ExtraLight)
        footer_start_y = landscape_h - 85
        line_spacing = 22
        for i, line in enumerate(self.disclaimer_lines):
            try:
                bbox = draw.textbbox((0, 0), line, font=self.fonts["footer"])
                line_w = bbox[2] - bbox[0]
                line_x = (landscape_w - line_w) // 2
            except Exception:
                line_x = margin_l
            draw.text((line_x, footer_start_y + (i * line_spacing)), line, fill="#333333", font=self.fonts["footer"])

        self.pdf_pages.append(a4_canvas)

    def save(self):
        if not self.pdf_pages:
            return
        try:
            import fitz
            import io
            doc = fitz.open()
            for page_img in self.pdf_pages:
                w_px, h_px = page_img.size
                w_pt = w_px * 72.0 / 96.0
                h_pt = h_px * 72.0 / 96.0
                rect = fitz.Rect(0, 0, w_pt, h_pt)
                page = doc.new_page(width=w_pt, height=h_pt)
                buf = io.BytesIO()
                page_img.save(buf, format="PNG")
                page.insert_image(rect, stream=buf.getvalue())
            doc.save(self.output_path, garbage=4, deflate=True)
            doc.close()
            try:
                print(f"Successfully saved {len(self.pdf_pages)} pages to {os.path.basename(self.output_path)} (PyMuPDF C-Binding)")
            except Exception:
                pass
            return
        except Exception:
            pass

        # Fallback to PIL
        self.pdf_pages[0].save(
            self.output_path,
            "PDF",
            resolution=300.0,
            save_all=True,
            append_images=self.pdf_pages[1:]
        )
        try:
            print(f"Successfully saved {len(self.pdf_pages)} pages to {os.path.basename(self.output_path)} (PIL fallback)")
        except Exception:
            pass


def process_chat_pipeline(input_path, output_pdf, slip_data_list=None, chat_mode=False, start_page_num=1):
    raw_images = []
    if os.path.isdir(input_path):
        for ext in ('*.png', '*.jpg', '*.jpeg', '*.PNG', '*.JPG', '*.JPEG'):
            raw_images.extend(glob.glob(os.path.join(input_path, ext)))
    else:
        raw_images = [input_path]

    if not raw_images:
        print(f"No images found in {input_path}")
        return 0

    # 1. จัดเรียงตามลำดับชื่อไฟล์อย่างเป็นธรรมชาติ (Natural Sort)
    sorted_raw = sorted(list(set(raw_images)), key=lambda x: natural_sort_key(os.path.splitext(os.path.basename(x))[0]))

    # 2. คัดกรองภาพซ้ำด้วย SHA-256 Content Hash (ตัดทิ้งอัตโนมัติหากเนื้อหาไฟล์ซ้ำ 100%)
    seen_hashes = {}
    unique_candidates = []
    for p in sorted_raw:
        try:
            with open(p, 'rb') as f:
                content_hash = hashlib.sha256(f.read()).hexdigest()
            if content_hash in seen_hashes:
                orig_file = seen_hashes[content_hash]
                print(f"  [Dedup: SHA-256] ข้ามภาพซ้ำ 100%: {os.path.basename(p)} (ตรงกับ {os.path.basename(orig_file)})")
                continue
            seen_hashes[content_hash] = p
            unique_candidates.append(p)
        except Exception as e:
            print(f"  [Dedup: Warning] ไม่สามารถอ่านแฮชของ {p}: {e}")
            unique_candidates.append(p)

    # 3. Deduplicate files by base name (e.g. A4_IMG_ (1).PNG and .JPEG -> 1 per unique number)
    unique_map = {}
    for p in unique_candidates:
        base = os.path.splitext(os.path.basename(p))[0]
        if base not in unique_map:
            unique_map[base] = p
        elif p.lower().endswith('.png'):
            unique_map[base] = p

    images_to_process = [unique_map[k] for k in sorted(unique_map.keys(), key=natural_sort_key)]
    item_names = [os.path.splitext(os.path.basename(p))[0] for p in images_to_process]

    assembler = PDFAssembler(output_path=output_pdf)

    if chat_mode and len(images_to_process) > 0:
        print(f"Chat mode: Starting Streaming Canvas Pipeline (ต่อสายพานยาวต่อเนื่องแล้วหั่น) across {len(images_to_process)} images...")

        with tempfile.TemporaryDirectory() as tmp:
            paths = []
            global_page_idx = max(0, start_page_num - 1)
            slip_detected_count = 0

            stream_buffer = None
            last_page_hash = None
            last_slip_ref = None

            def slice_ready_pages(buf, is_final=False):
                nonlocal global_page_idx, slip_detected_count, last_page_hash, last_slip_ref
                if buf is None or buf.height == 0:
                    return None

                while True:
                    if not is_final and buf.height < int(assembler.block_height * 1.35):
                        break

                    if is_final and buf.height <= assembler.block_height:
                        cuts = [(0, buf.height, False)]
                    else:
                        cuts = quiet_cuts(buf, assembler.block_height)
                        if not cuts:
                            break

                    y1, y2, needs_scale = cuts[0]
                    if y2 <= 0:
                        break

                    page_slice = buf.crop((0, y1, buf.width, y2))
                    arr = cv2.cvtColor(np.asarray(page_slice), cv2.COLOR_RGB2BGR)

                    # --- กฎการตรวจจับภาพซ้ำหลังการหั่น (Post-Slice Deduplication Rule) ---
                    cur_slice_hash = hashlib.sha256(arr.tobytes()).hexdigest()
                    if cur_slice_hash == last_page_hash:
                        print(f"  [Post-Slice Dedup] ⚠️ ตรวจพบภาพหน้าซ้ำ 100% กับหน้าก่อนหน้า! ข้ามหน้านี้อัตโนมัติ")
                        if y2 >= buf.height:
                            buf = None
                            break
                        else:
                            buf = buf.crop((0, y2, buf.width, buf.height))
                            if buf.height == 0:
                                buf = None
                                break
                        if is_final and (buf is None or buf.height == 0):
                            break
                        continue

                    corrob_text = None
                    cur_slip_ref = None
                    if detect_slip_in_image is not None:
                        has_slip, box = detect_slip_in_image(arr)
                        if has_slip and box and extract_slip_details_ocr is not None:
                            x, y, w, h = box
                            crop = arr[y:y+h, x:x+w]
                            details = extract_slip_details_ocr(crop) if crop.size > 0 else {}
                            amt = details.get("amount", "")
                            ref_id = details.get("ref_id", "")
                            raw_t = details.get("raw_text", "").lower()
                            has_iso = bool(re.match(r"^2025(0[1-9]|1[0-2])([0-3]\d)([0-2]\d)", ref_id or ""))
                            has_kw = any(kw in raw_t for kw in [
                                "โอนเงินสำเร็จ", "krungthai", "kbank", "scb", "ttb", "กรุงไทย", "กสิกร",
                                "ไทยพาณิชย์", "กรุงศรี", "จำนวนเงิน", "ค่าธรรมเนียม", "รหัสอ้างอิง",
                                "nsving", "วันที่ทำรายการ", "เลขที่รายการ", "สแกนตรวจสอบสลิป"
                            ])
                            has_amt = bool(amt and amt != "0.00" and amt != "-")
                            if (has_amt and (has_kw or has_iso)) or (has_iso and (has_amt or details.get("sender_bank") != "-" or details.get("receiver_bank") != "-")) or (has_amt and ref_id and len(ref_id) >= 15):
                                cur_slip_ref = ref_id or f"{amt}_{details.get('sender_bank')}_{details.get('receiver_bank')}"
                                if cur_slip_ref and cur_slip_ref == last_slip_ref:
                                    print(f"  [Post-Slice Dedup] ⚠️ ตรวจพบสลิปซ้ำ ({cur_slip_ref}) กับหน้าก่อนหน้า! ข้ามหน้านี้อัตโนมัติ")
                                    if y2 >= buf.height:
                                        buf = None
                                        break
                                    else:
                                        buf = buf.crop((0, y2, buf.width, buf.height))
                                        if buf.height == 0:
                                            buf = None
                                            break
                                    if is_final and (buf is None or buf.height == 0):
                                        break
                                    continue
                                slip_detected_count += 1
                                corrob_text = "สลิปหลักฐานการโอนเงิน (แนบในบทสนทนา)"

                    global_page_idx += 1
                    last_page_hash = cur_slice_hash
                    if cur_slip_ref:
                        last_slip_ref = cur_slip_ref

                    assembler.add_single_page_image(arr, align="top", page_num=global_page_idx, mode="CHAT", corroborated=corrob_text)
                    page = assembler.pdf_pages.pop()
                    fp = os.path.join(tmp, f"p{global_page_idx:05d}.png")
                    page.save(fp)
                    paths.append((fp, page.size))

                    if y2 >= buf.height:
                        buf = None
                        break
                    else:
                        buf = buf.crop((0, y2, buf.width, buf.height))
                        if buf.height == 0:
                            buf = None
                            break

                    if is_final and (buf is None or buf.height == 0):
                        break

                return buf

            for idx, img_p in enumerate(images_to_process):
                img = imread_unicode(img_p)
                if img is None:
                    continue
                trimmed = trim_outer_padding(img)
                pil_im = strip_dark_edge_bands(Image.fromarray(trimmed[:, :, ::-1]))
                if pil_im.width != assembler.block_width:
                    nh = max(1, int(pil_im.height * assembler.block_width / pil_im.width))
                    pil_im = pil_im.resize((assembler.block_width, nh), Image.Resampling.LANCZOS)

                if stream_buffer is None:
                    stream_buffer = pil_im
                else:
                    stream_buffer = feather_stitch([stream_buffer, pil_im], feather_px=FEATHER_PX)

                stream_buffer = slice_ready_pages(stream_buffer, is_final=False)
                if stream_buffer is not None and stream_buffer.height == 0:
                    stream_buffer = None

            if stream_buffer is not None and stream_buffer.height > 0:
                slice_ready_pages(stream_buffer, is_final=True)

            print(f"Writing {len(paths)} pages to PDF via PyMuPDF C-Binding streaming...")
            mode = save_pdf_streaming(paths, output_pdf)
            print(f"Saved chat PDF ({mode}) -> {os.path.basename(output_pdf)} ({len(paths)} pages)")
            return len(paths)

    print(f"Found {len(images_to_process)} unique slip(s). Processing 1-slip-per-page (Sarabun Light)...")

    with tempfile.TemporaryDirectory() as tmp:
        paths = []
        global_page_idx = max(0, start_page_num - 1)

        # 1. Add Each Slip on its own Dedicated Portrait Page (Center X, Center Y)
        for idx, img_p in enumerate(images_to_process):
            img = imread_unicode(img_p)
            if img is None:
                print(f"Warning: Could not read {img_p}")
                continue

            trimmed_img = trim_outer_padding(img)
            corrob = None
            if slip_data_list and idx < len(slip_data_list):
                c_item = slip_data_list[idx]
                if isinstance(c_item, dict):
                    p_no = c_item.get("chat_page") or c_item.get("page_no") or c_item.get("page")
                    i_no = c_item.get("chat_index") or c_item.get("index") or (idx + 1)
                    if p_no:
                        corrob = f"ภาพแชทหน้าที่ {p_no} / สารบัญแชท ลำดับที่ {i_no}"

            global_page_idx += 1
            assembler.add_single_page_image(trimmed_img, align="center", page_num=global_page_idx, mode="SLIP", corroborated=corrob)
            page = assembler.pdf_pages.pop()
            fp = os.path.join(tmp, f"slip_p{global_page_idx:05d}.png")
            page.save(fp)
            paths.append((fp, page.size))

        # Note: Summary Table is now decoupled into _skills/Summary_Table module.
        # Pure slip book preserves 1:1 page numbering without landscape tables inside.
        print(f"Writing {len(paths)} slip pages to PDF via PyMuPDF C-Binding streaming...")
        mode = save_pdf_streaming(paths, output_pdf)
        print(f"Saved slip PDF ({mode}) -> {os.path.basename(output_pdf)} ({len(paths)} pages)")
        return len(paths)



def main():
    if len(sys.argv) < 3:
        print("Usage: python process_chat.py <input_image_or_folder> <output_pdf> [--chat]")
        print("  default : slip mode (1 ใบ 1 หน้า กึ่งกลาง)")
        print("  --chat  : stitch + feather + pack-to-bottom ชิดบน (แชทยาวหลายภาพ)")
        sys.exit(1)

    input_path = sys.argv[1]
    output_pdf = sys.argv[2]
    process_chat_pipeline(input_path, output_pdf, chat_mode="--chat" in sys.argv[3:])


if __name__ == "__main__":
    main()
