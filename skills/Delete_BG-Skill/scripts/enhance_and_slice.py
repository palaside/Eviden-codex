import sys
import os
import cv2
import numpy as np
from PIL import Image
import urllib.request

class EnhancerAndSlicer:
    def __init__(self, max_height_ratio=1.414):
        self.max_height_ratio = max_height_ratio
        self.model_path = os.path.join(os.path.dirname(__file__), "EDSR_x4.pb")
        self.sr = cv2.dnn_superres.DnnSuperResImpl_create()
        self._init_super_res()

    def _init_super_res(self):
        # Download EDSR_x4 model if not exists
        if not os.path.exists(self.model_path):
            print("Downloading AI Super-Resolution model (EDSR_x4.pb)...")
            url = "https://github.com/Saafke/EDSR_Tensorflow/raw/master/models/EDSR_x4.pb"
            urllib.request.urlretrieve(url, self.model_path)
            print("Download complete.")
        
        print("Loading AI Model...")
        self.sr.readModel(self.model_path)
        self.sr.setModel("edsr", 4)
        print("Model loaded.")

    def preprocess_image(self, image_path: str):
        """
        Apply CLAHE and Background Masking
        """
        print("Pre-processing: Enhancing contrast and cleaning background...")
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Could not load image at {image_path}")
            
        # Convert to LAB color space for CLAHE on L-channel (Lightness)
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        
        # Apply CLAHE
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
        cl = clahe.apply(l)
        
        # Merge back
        limg = cv2.merge((cl,a,b))
        enhanced_img = cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)
        
        # Background Smoothing (Bilateral Filter to keep edges sharp but blur background patterns)
        smooth_img = cv2.bilateralFilter(enhanced_img, 9, 75, 75)
        return smooth_img

    def find_quiet_zones(self, img):
        print("Scanning for quiet zones (horizontal gaps)...")
        height, width, _ = img.shape
        max_slice_height = int(width * self.max_height_ratio)
        
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 50, 150)
        row_sums = np.sum(edges, axis=1)
        quiet_rows = np.where(row_sums == 0)[0]
        
        slices = []
        current_y = 0
        
        while current_y < height:
            target_y = current_y + max_slice_height
            if target_y >= height:
                slices.append((current_y, height))
                break
                
            valid_quiet_rows = quiet_rows[(quiet_rows > current_y) & (quiet_rows <= target_y)]
            if len(valid_quiet_rows) > 0:
                cut_y = valid_quiet_rows[-1]
            else:
                # Lookahead: Find the first quiet zone beyond target_y
                next_quiet_rows = quiet_rows[quiet_rows > target_y]
                if len(next_quiet_rows) > 0:
                    cut_y = next_quiet_rows[0]
                else:
                    cut_y = target_y # Absolute fallback
                
            slices.append((current_y, cut_y))
            current_y = cut_y
            
        return slices

    def process_and_assemble(self, image_path, output_path):
        img = self.preprocess_image(image_path)
        slices = self.find_quiet_zones(img)
        
        print(f"Found {len(slices)} slices. Starting AI Upscaling & PDF Assembly...")
        
        a4_width = 2480
        a4_height = 3508
        margin = 150
        pdf_pages = []
        
        for i, (y_start, y_end) in enumerate(slices):
            print(f"  Upscaling slice {i+1}/{len(slices)}...")
            # Crop slice
            slice_img = img[y_start:y_end, :]
            
            # AI Super-Resolution (Upscale 4x)
            # Note: EDSR is slow on CPU. 
            upscaled_slice = self.sr.upsample(slice_img)
            
            # Convert to PIL
            img_rgb = upscaled_slice[:, :, ::-1]
            pil_img = Image.fromarray(img_rgb)
            
            # Scale to A4 width
            usable_width = a4_width - (margin * 2)
            usable_height = a4_height - (margin * 2)
            scale_factor = usable_width / pil_img.width
            
            new_width = int(pil_img.width * scale_factor)
            new_height = int(pil_img.height * scale_factor)
            
            # Dynamic Scale-to-Fit: If height exceeds A4 limit, shrink proportionally
            if new_height > usable_height:
                height_scale = usable_height / new_height
                new_width = int(new_width * height_scale)
                new_height = int(new_height * height_scale)
            
            resized_img = pil_img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            a4_canvas = Image.new('RGB', (a4_width, a4_height), 'white')
            
            # Center the image horizontally and vertically
            paste_x = margin + (usable_width - new_width) // 2
            paste_y = margin + (usable_height - new_height) // 2
            a4_canvas.paste(resized_img, (paste_x, paste_y))
            pdf_pages.append(a4_canvas)
            
        if pdf_pages:
            first_page = pdf_pages[0]
            first_page.save(
                output_path, 
                "PDF", 
                resolution=300.0, 
                save_all=True, 
                append_images=pdf_pages[1:]
            )
            print(f"Successfully saved {len(pdf_pages)} pages to {output_path}")

def main():
    if len(sys.argv) < 3:
        print("Usage: python enhance_and_slice.py <input_image> <output_pdf>")
        sys.exit(1)
        
    input_image = sys.argv[1]
    output_pdf = sys.argv[2]
    
    pipeline = EnhancerAndSlicer()
    pipeline.process_and_assemble(input_image, output_pdf)

if __name__ == "__main__":
    main()
