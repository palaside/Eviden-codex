import os
import sys
import re
import shutil
import datetime
from pathlib import Path


def natural_sort_key(s):
    """Sort strings containing numbers in human order (1, 2, 10 instead of 1, 10, 2)"""
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r"(\d+)", str(s))]


def extract_group_and_index(filename):
    """
    Extracts group name (prefix) and sequential index from filenames.
    Optimized for Windows Explorer multi-select rename pattern (Ctrl+A -> F2):
      'V1- (1).jpg' -> group: 'V1', index: 1
      'CaseA (2).png' -> group: 'CaseA', index: 2
      'Evidence_01.jpg' -> group: 'Evidence', index: 1
      'Chat-5.jpeg' -> group: 'Chat', index: 5
    """
    stem = Path(filename).stem.strip()

    # Pattern 1: Windows Ctrl+A rename: "Name (1)", "Name- (1)", "Name_ (2)"
    m1 = re.match(r"^(.*?)[-_\s]*\((\d+)\)$", stem)
    if m1:
        group = m1.group(1).rstrip("-_ ").strip()
        index = int(m1.group(2))
        return (group if group else "Default", index)

    # Pattern 2: Suffix with delimiter and digits: "Name_01", "Name-1", "Name 2"
    m2 = re.match(r"^(.*?)[-_\s]+(\d+)$", stem)
    if m2:
        group = m2.group(1).rstrip("-_ ").strip()
        index = int(m2.group(2))
        return (group if group else "Default", index)

    # Pattern 3: Trailing digits without delimiter: "Name01"
    m3 = re.match(r"^(.*?)(\d+)$", stem)
    if m3 and m3.group(1):
        group = m3.group(1).rstrip("-_ ").strip()
        index = int(m3.group(2))
        return (group if group else "Default", index)

    # Fallback: No clear index, group is the whole stem
    return (stem, 0)


def group_files_by_prefix(file_paths_or_dir):
    """
    Scans files and groups them by their detected prefix.
    Returns: dict { group_name: [sorted_file_paths] }
    """
    if isinstance(file_paths_or_dir, (str, Path)) and os.path.isdir(file_paths_or_dir):
        files = [
            os.path.join(file_paths_or_dir, f)
            for f in os.listdir(file_paths_or_dir)
            if f.lower().endswith((".png", ".jpg", ".jpeg", ".bmp", ".webp"))
            and os.path.isfile(os.path.join(file_paths_or_dir, f))
        ]
    elif isinstance(file_paths_or_dir, list):
        files = [str(f) for f in file_paths_or_dir if isinstance(f, (str, Path))]
    else:
        files = []

    groups = {}
    for f in files:
        fname = os.path.basename(f)
        group_name, idx = extract_group_and_index(fname)
        if group_name not in groups:
            groups[group_name] = []
        groups[group_name].append((idx, f))

    # Sort files inside each group by extracted index then natural name
    sorted_groups = {}
    for gname, items in groups.items():
        items.sort(key=lambda x: (x[0], natural_sort_key(x[1])))
        sorted_groups[gname] = [x[1] for x in items]

    return sorted_groups


def organize_and_dispatch_groups(chat_in_dir, output_dir, process_chat_pipeline_func=None, log_func=print):
    """
    High-level handler:
    1. Scans loose images in chat_in_dir
    2. Groups them using List_names logic (by prefix/case)
    3. For each group:
       - Creates output PDF named: 'Evidence_Chat_{group_name}.pdf'
       - Archives original files to: 'processed/Case_{group_name}/Batch_{timestamp}/'
    """
    grouped = group_files_by_prefix(chat_in_dir)
    if not grouped:
        return []

    results = []
    timestamp_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    processed_root = os.path.join(chat_in_dir, "processed")
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(processed_root, exist_ok=True)

    for group_name, file_paths in grouped.items():
        try:
            log_func(f"[List_names] Found Group '{group_name}' with {len(file_paths)} image(s)")
        except Exception:
            pass

        # Create temporary working directory for this group
        temp_group_dir = os.path.join(chat_in_dir, f"_temp_{group_name}_{timestamp_str}")
        os.makedirs(temp_group_dir, exist_ok=True)

        # Move files to temp folder for processing
        moved_files = []
        for src in file_paths:
            fname = os.path.basename(src)
            dst = os.path.join(temp_group_dir, fname)
            shutil.move(src, dst)
            moved_files.append(dst)

        # Generate Evidence PDF named after the group
        pdf_name = f"Evidence_Chat_{group_name}.pdf"
        output_pdf = os.path.join(output_dir, pdf_name)

        if process_chat_pipeline_func:
            try:
                pages = process_chat_pipeline_func(temp_group_dir, output_pdf, chat_mode=True)
                log_func(f"[List_names] Created {pdf_name} ({pages} pages)")
                
                # Automatically trigger Search_Slip skill to extract and index slips
                try:
                    search_slip_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "Search_Slip", "scripts")
                    if os.path.exists(search_slip_dir) and search_slip_dir not in sys.path:
                        sys.path.insert(0, search_slip_dir)
                    from search_slip import search_slips_in_pdf
                    if os.path.exists(output_pdf) and os.path.getsize(output_pdf) > 0:
                        log_func(f"[Search_Slip] Auto-extracting slip pages in {pdf_name}...")
                        slip_items = search_slips_in_pdf(output_pdf, output_excel=True, output_json=True, log_func=log_func)
                        log_func(f"[Search_Slip] Completed: Indexed {len(slip_items)} distinct slip transaction(s)")
                except Exception as slip_err:
                    log_func(f"[Search_Slip] Note: Auto-indexing skipped: {slip_err}")

            except Exception as e:
                log_func(f"[List_names] Error generating PDF for {group_name}: {e}")
                pages = 0
        else:
            pages = 0

        # Archive files: processed/Case_{group_name}/Batch_{timestamp}/
        case_dir = os.path.join(processed_root, f"Case_{group_name}")
        batch_archive_dir = os.path.join(case_dir, f"Batch_{timestamp_str}")
        os.makedirs(batch_archive_dir, exist_ok=True)

        for src in moved_files:
            fname = os.path.basename(src)
            dst = os.path.join(batch_archive_dir, fname)
            shutil.move(src, dst)

        shutil.rmtree(temp_group_dir, ignore_errors=True)
        try:
            log_func(f"[List_names] Archived {len(moved_files)} files to {batch_archive_dir}")
        except Exception:
            pass

        results.append({
            "group": group_name,
            "pdf_path": output_pdf,
            "archive_path": batch_archive_dir,
            "file_count": len(moved_files)
        })

    return results


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python list_names.py <directory_to_group_or_test>")
        sys.exit(1)
    target = sys.argv[1]
    res = group_files_by_prefix(target)
    for g, files in res.items():
        print(f"\nGroup: {g} ({len(files)} files)")
        for f in files:
            print(f"  - {os.path.basename(f)}")
