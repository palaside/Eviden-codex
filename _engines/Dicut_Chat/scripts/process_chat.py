import os
from typing import List

from PIL import Image, ImageDraw, ImageFont


class PDFAssembler:
    """A minimal stub for the PDFAssembler used in generate_cover_page.py.
    It creates simple placeholder images for summary pages and stores them in
    ``self.pdf_pages``. The real implementation creates complex tables; this
    stub only needs to provide the API used by the automation script.
    """

    def __init__(self, output_path: str):
        self.output_path = output_path
        # List of PIL.Image objects representing each generated page.
        self.pdf_pages: List[Image.Image] = []
        # Ensure the directory for the output exists.
        os.makedirs(os.path.dirname(output_path), exist_ok=True
        )

    def add_10col_landscape_summary_page(
        self,
        item_names: List[str],
        slip_data_list: List[dict],
        mode: str,
        page_num: str,
        corroborated: str,
    ) -> None:
        """Create a placeholder A4 landscape image.
        The real implementation draws a table of 10 columns. Here we draw a
        simple grid with the page label for visual verification.
        """
        # A4 landscape size at 150 DPI (~842x595 pixels).
        width, height = 842, 595
        img = Image.new("RGB", (width, height), "white")
        draw = ImageDraw.Draw(img)
        # Draw border.
        draw.rectangle([(0, 0), (width - 1, height - 1)], outline="black")
        # Write page identifier.
        text = f"{page_num}\n{corroborated}\nItems: {len(item_names)}"
        try:
            # Use a default font; on Windows Pillow will load a built‑in font.
            font = ImageFont.load_default()
        except Exception:
            font = None
        draw.multiline_text((10, 10), text, fill="black", font=font)
        # Append to collection.
        self.pdf_pages.append(img)

    # The production code may access ``pdf_pages`` directly, so no extra
    # methods are required for the current workflow.

    def save(self) -> None:
        """Optional helper to save the assembled PDF using Pillow.
        Not used by the current script but provided for completeness.
        """
        if not self.pdf_pages:
            return
        self.pdf_pages[0].save(
            self.output_path,
            "PDF",
            resolution=150.0,
            save_all=True,
            append_images=self.pdf_pages[1:],
        )
