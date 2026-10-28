"""
Excel Blueprint Extractor (Reverse Engineering Engine)
------------------------------------------------------
Extracts:
1. Defined Names (Named ranges, constants, variables)
2. Formulas & Business Logic (Input fields vs Computed fields)
3. Grid Layout, Cell Styles, Borders, Dimensions & Merged Cells
4. Data Validations & Page Setup

Outputs: <filename>_blueprint.json
"""

import os
import sys
import json
from openpyxl import load_workbook
from openpyxl.utils import get_column_letter

def extract_blueprint(excel_path, output_json_path=None):
    if not os.path.exists(excel_path):
        raise FileNotFoundError(f"Excel file not found: {excel_path}")
        
    if output_json_path is None:
        base_name = os.path.splitext(excel_path)[0]
        output_json_path = f"{base_name}_blueprint.json"

    wb_formula = load_workbook(excel_path, data_only=False)
    wb_values = load_workbook(excel_path, data_only=True)

    blueprint = {
        "source_file": os.path.basename(excel_path),
        "version": "1.0.0",
        "defined_names": {},
        "sheets": {}
    }

    # 1. Extract Defined Names (Name Manager)
    for name, def_obj in wb_formula.defined_names.items():
        dests = []
        try:
            for sheet, coord in def_obj.destinations:
                dests.append(f"{sheet}!{coord}")
        except Exception:
            dests.append(str(def_obj.value))

        blueprint["defined_names"][name] = {
            "name": name,
            "raw_value": str(def_obj.value),
            "destinations": dests
        }

    # 2. Extract Sheets
    for sheet_name in wb_formula.sheetnames:
        ws_f = wb_formula[sheet_name]
        ws_v = wb_values[sheet_name]

        sheet_data = {
            "sheet_name": sheet_name,
            "page_setup": {
                "orientation": ws_f.page_setup.orientation or "portrait",
                "paperSize": ws_f.page_setup.paperSize or 9  # 9 = A4
            },
            "column_widths": {},
            "row_heights": {},
            "merged_ranges": [str(r) for r in ws_f.merged_cells.ranges],
            "input_fields": [],
            "computed_formulas": [],
            "grid_cells": {}
        }

        # Column widths
        for col_letter, col_dim in ws_f.column_dimensions.items():
            if col_dim.width is not None:
                sheet_data["column_widths"][col_letter] = round(float(col_dim.width), 2)

        # Row heights
        for row_idx, row_dim in ws_f.row_dimensions.items():
            if row_dim.height is not None:
                sheet_data["row_heights"][str(row_idx)] = round(float(row_dim.height), 2)

        # Cells & Logic
        for row in ws_f.iter_rows():
            for cell_f in row:
                coord = cell_f.coordinate
                val_f = cell_f.value
                val_v = ws_v[coord].value

                # Skip completely blank unformatted cells
                has_border = bool(cell_f.border and (cell_f.border.left.style or cell_f.border.top.style or cell_f.border.bottom.style or cell_f.border.right.style))
                has_fill = bool(cell_f.fill and cell_f.fill.fill_type)
                
                if val_f is None and not has_border and not has_fill:
                    continue

                cell_info = {
                    "coordinate": coord,
                    "row": cell_f.row,
                    "column": cell_f.column,
                    "value": val_f,
                    "calculated_value": val_v,
                    "number_format": cell_f.number_format,
                    "is_formula": False
                }

                # Style specs
                if cell_f.has_style:
                    cell_info["style"] = {
                        "font": {
                            "name": cell_f.font.name,
                            "size": cell_f.font.size,
                            "bold": cell_f.font.bold,
                            "color": cell_f.font.color.rgb if cell_f.font.color and hasattr(cell_f.font.color, 'rgb') else None
                        },
                        "alignment": {
                            "horizontal": cell_f.alignment.horizontal,
                            "vertical": cell_f.alignment.vertical,
                            "wrap_text": cell_f.alignment.wrap_text
                        },
                        "border": {
                            "left": cell_f.border.left.style if cell_f.border else None,
                            "right": cell_f.border.right.style if cell_f.border else None,
                            "top": cell_f.border.top.style if cell_f.border else None,
                            "bottom": cell_f.border.bottom.style if cell_f.border else None
                        }
                    }

                # Formulas vs Input
                if isinstance(val_f, str) and val_f.startswith('='):
                    cell_info["is_formula"] = True
                    cell_info["formula"] = val_f
                    sheet_data["computed_formulas"].append({
                        "cell": coord,
                        "formula": val_f,
                        "result": val_v
                    })
                elif val_f is not None:
                    sheet_data["input_fields"].append({
                        "cell": coord,
                        "label_or_default": val_f,
                        "data_type": type(val_f).__name__
                    })

                sheet_data["grid_cells"][coord] = cell_info

        blueprint["sheets"][sheet_name] = sheet_data

    with open(output_json_path, "w", encoding="utf-8") as f:
        json.dump(blueprint, f, ensure_ascii=False, indent=2)

    return output_json_path


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python extract_blueprint.py <input.xlsx> [output_blueprint.json]")
        sys.exit(1)
    
    excel_input = sys.argv[1]
    json_out = sys.argv[2] if len(sys.argv) > 2 else None
    out_file = extract_blueprint(excel_input, json_out)
    print(f"SUCCESS: Blueprint saved to {out_file}")
