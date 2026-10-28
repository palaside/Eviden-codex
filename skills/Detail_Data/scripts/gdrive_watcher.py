"""
EVIDENCE Master Watcher: Google Drive & Local Automation Engine
--------------------------------------------------------------
Dual-engine automated background service:
1. Slip Engine: Monitors JSON slip files -> Converts to Legal-Grade A4 Landscape Excel (.xlsx) -> Folder_Out
2. Chat Engine: Monitors chat images / subfolders / zips -> Slices & blends to A4 Legal PDF (.pdf) -> Folder_Out
"""

import sys
import os
import time
import json
import shutil
import zipfile
import datetime
from pathlib import Path

# Redirect stdout/stderr if None (pythonw on Windows)
log_file_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "watcher.log")
log_fp = open(log_file_path, "a", encoding="utf-8", buffering=1)

def log(msg):
    timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    formatted = f"[{timestamp}] {msg}"
    if sys.stdout is not None:
        try:
            print(formatted)
        except Exception:
            pass
    try:
        log_fp.write(formatted + "\n")
        log_fp.flush()
    except Exception:
        pass

# Import Detail_Data Engine
sys.path.insert(0, os.path.dirname(__file__))
from generate_excel import generate_excel
try:
    from generate_summary_pdf import generate_summary_pdf
except ImportError:
    generate_summary_pdf = None

# Import Dicut_Chat Engine
dicut_chat_scripts = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "Dicut_Chat", "scripts")
if os.path.exists(dicut_chat_scripts):
    sys.path.insert(0, dicut_chat_scripts)
try:
    from process_chat import process_chat_pipeline
except Exception as e:
    log(f"Warning: Could not import process_chat: {e}")
    process_chat_pipeline = None

# Import List_names Engine
list_names_scripts = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "List_names", "scripts")
if os.path.exists(list_names_scripts):
    sys.path.insert(0, list_names_scripts)
try:
    from list_names import organize_and_dispatch_groups
except Exception as e:
    log(f"Warning: Could not import list_names: {e}")
    organize_and_dispatch_groups = None


def load_config():
    config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config", "gdrive_config.json")
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def get_watch_targets(config):
    """
    Returns list of dicts:
    {
       'type': 'slip' or 'chat',
       'in_dir': path,
       'out_dir': path,
       'label': str
    }
    """
    targets = []
    
    # 1. Desktop Slip & Chat Inboxes
    d_slip_in = config.get("local_paths", {}).get("desktop_slip_inbox", r"C:\Users\EVE\OneDrive\เดสก์ท็อป\EVIDENCE_IN")
    d_chat_in = config.get("local_paths", {}).get("desktop_chat_inbox", r"C:\Users\EVE\OneDrive\เดสก์ท็อป\EVIDENCE_CHAT_IN")
    d_out = config.get("local_paths", {}).get("desktop_outbox", r"C:\Users\EVE\OneDrive\เดสก์ท็อป\Folder_Out")
    
    os.makedirs(d_slip_in, exist_ok=True)
    os.makedirs(d_chat_in, exist_ok=True)
    os.makedirs(d_out, exist_ok=True)

    targets.append({"type": "slip", "in_dir": d_slip_in, "out_dir": d_out, "label": "Desktop Slip Inbox"})
    targets.append({"type": "chat", "in_dir": d_chat_in, "out_dir": d_out, "label": "Desktop Chat Inbox"})

    # 2. Google Drive paths
    gdrive_candidates = config.get("local_paths", {}).get("gdrive_local_candidates", [])
    for g_path in gdrive_candidates:
        if os.path.exists(g_path):
            g_out = os.path.join(g_path, "Folder_Out")
            g_chat = os.path.join(g_path, "CHAT_IN")
            g_slip = os.path.join(g_path, "SLIP_IN")
            
            os.makedirs(g_out, exist_ok=True)
            os.makedirs(g_chat, exist_ok=True)
            os.makedirs(g_slip, exist_ok=True)

            targets.append({"type": "slip", "in_dir": g_slip, "out_dir": g_out, "label": f"Google Drive Slip ({g_slip})"})
            targets.append({"type": "slip", "in_dir": g_path, "out_dir": g_out, "label": f"Google Drive Root Slip ({g_path})"})
            targets.append({"type": "chat", "in_dir": g_chat, "out_dir": g_out, "label": f"Google Drive Chat ({g_chat})"})

    return targets


def is_file_settled(file_path, wait_seconds=1.0):
    try:
        size1 = os.path.getsize(file_path)
        time.sleep(wait_seconds)
        size2 = os.path.getsize(file_path)
        return size1 == size2 and size1 > 0
    except Exception:
        return False


def process_slip_json(json_file_path, output_dir):
    try:
        log(f"📥 [Slip] Processing JSON: {os.path.basename(json_file_path)}")
        if not is_file_settled(json_file_path):
            return None

        base_name = os.path.splitext(os.path.basename(json_file_path))[0]
        timestamp_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        output_excel_name = f"{base_name}_{timestamp_str}.xlsx"
        output_excel_path = os.path.join(output_dir, output_excel_name)

        generate_excel(json_file_path, output_excel_path)
        log(f"✅ [Slip] Created Excel: {output_excel_path}")

        # Generate 10-Column Landscape Summary PDF (Owned by Detail_Data)
        if generate_summary_pdf:
            output_pdf_name = f"{base_name}_{timestamp_str}_Summary.pdf"
            output_pdf_path = os.path.join(output_dir, output_pdf_name)
            generate_summary_pdf(json_file_path, output_pdf_path)
            log(f"✅ [Slip] Created Summary PDF: {output_pdf_path}")

        # Move to processed
        input_dir = os.path.dirname(json_file_path)
        processed_dir = os.path.join(input_dir, "processed")
        os.makedirs(processed_dir, exist_ok=True)
        dest_json_path = os.path.join(processed_dir, f"{base_name}_{timestamp_str}.json")
        shutil.move(json_file_path, dest_json_path)
        return output_excel_path
    except Exception as e:
        log(f"❌ [Slip] Error processing {json_file_path}: {e}")
        return None


def process_chat_item(in_dir, item, output_dir):
    if process_chat_pipeline is None:
        log("❌ [Chat] process_chat_pipeline is not available.")
        return None

    item_path = os.path.join(in_dir, item)
    timestamp_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    processed_dir = os.path.join(in_dir, "processed")
    os.makedirs(processed_dir, exist_ok=True)

    # Case 1: Subdirectory with images
    if os.path.isdir(item_path) and item.lower() != "processed":
        try:
            images = [f for f in os.listdir(item_path) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
            if not images:
                return None
            
            # Check if files have settled
            for img in images[:3]:
                if not is_file_settled(os.path.join(item_path, img), 0.5):
                    return None

            log(f"📥 [Chat] Processing Folder: {item} ({len(images)} images)")
            output_pdf_name = f"{item}_{timestamp_str}.pdf"
            output_pdf_path = os.path.join(output_dir, output_pdf_name)

            pages = process_chat_pipeline(item_path, output_pdf_path)
            
            # Move folder to processed
            dest_folder = os.path.join(processed_dir, f"{item}_{timestamp_str}")
            shutil.move(item_path, dest_folder)

            log(f"✅ [Chat] Created PDF ({pages} pages): {output_pdf_path}")
            return output_pdf_path
        except Exception as e:
            log(f"❌ [Chat] Error processing folder {item_path}: {e}")
            return None

    # Case 2: Zip file with images
    elif os.path.isfile(item_path) and item.lower().endswith(".zip"):
        try:
            if not is_file_settled(item_path):
                return None

            log(f"📥 [Chat] Processing ZIP: {item}")
            base_name = os.path.splitext(item)[0]
            temp_extract = os.path.join(in_dir, f"_temp_{base_name}_{timestamp_str}")
            os.makedirs(temp_extract, exist_ok=True)

            with zipfile.ZipFile(item_path, 'r') as zip_ref:
                zip_ref.extractall(temp_extract)

            output_pdf_name = f"{base_name}_{timestamp_str}.pdf"
            output_pdf_path = os.path.join(output_dir, output_pdf_name)

            pages = process_chat_pipeline(temp_extract, output_pdf_path)

            shutil.rmtree(temp_extract, ignore_errors=True)
            dest_zip = os.path.join(processed_dir, f"{base_name}_{timestamp_str}.zip")
            shutil.move(item_path, dest_zip)

            log(f"✅ [Chat] Created PDF from ZIP ({pages} pages): {output_pdf_path}")
            return output_pdf_path
        except Exception as e:
            log(f"❌ [Chat] Error processing ZIP {item_path}: {e}")
            return None

    return None


def process_loose_chat_images(chat_in_dir, output_dir):
    """
    If multiple image files are dropped directly into the chat inbound folder.
    """
    if process_chat_pipeline is None or not os.path.exists(chat_in_dir):
        return

    images = [f for f in os.listdir(chat_in_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    if not images:
        return

    # Check if all images have settled
    for img in images[:5]:
        if not is_file_settled(os.path.join(chat_in_dir, img), 0.5):
            return

    log(f"📥 [Chat] Found {len(images)} loose images in {chat_in_dir}. Organizing with List_names...")

    # Use List_names skill to group by prefix and maintain batch archive
    if organize_and_dispatch_groups:
        organize_and_dispatch_groups(
            chat_in_dir,
            output_dir,
            process_chat_pipeline_func=process_chat_pipeline,
            log_func=log
        )
        return

    # Fallback if List_names is unavailable
    timestamp_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    temp_batch_dir = os.path.join(chat_in_dir, f"_batch_{timestamp_str}")
    os.makedirs(temp_batch_dir, exist_ok=True)
    for img in images:
        src = os.path.join(chat_in_dir, img)
        dst = os.path.join(temp_batch_dir, img)
        shutil.move(src, dst)

    output_pdf_name = f"Evidence_Chat_{timestamp_str}.pdf"
    output_pdf_path = os.path.join(output_dir, output_pdf_name)

    pages = process_chat_pipeline(temp_batch_dir, output_pdf_path)

    # Move batch folder to processed
    processed_dir = os.path.join(chat_in_dir, "processed")
    os.makedirs(processed_dir, exist_ok=True)
    dest_batch = os.path.join(processed_dir, f"Batch_{timestamp_str}")
    shutil.move(temp_batch_dir, dest_batch)

    log(f"✅ [Chat] Created PDF from loose images ({pages} pages): {output_pdf_path}")


def start_watcher():
    config = load_config()
    poll_interval = config.get("poll_interval_seconds", 5)
    
    log("=" * 75)
    log("🚀 EVIDENCE Master Smart Watcher (Auto-Type Detection) Started")
    log(f"🔗 Google Drive Folder: {config.get('google_drive', {}).get('folder_url')}")
    log(f"⏱️  Polling Interval: {poll_interval}s")
    log("=" * 75)

    targets = get_watch_targets(config)
    for t in targets:
        log(f"  👁️  Monitoring [{t['label']}]:")
        log(f"      In:  {t['in_dir']}")
        log(f"      Out: {t['out_dir']}")
    log("=" * 75)
    log("Waiting for incoming files (Auto-detects JSON Slips & Images/Zips)... (Running in background)\n")

    try:
        while True:
            for t in targets:
                in_dir = t["in_dir"]
                out_dir = t["out_dir"]

                if not os.path.exists(in_dir):
                    continue

                # 1. Process JSON Slips
                for item in os.listdir(in_dir):
                    if item.lower().endswith(".json"):
                        item_path = os.path.join(in_dir, item)
                        if os.path.isfile(item_path):
                            process_slip_json(item_path, out_dir)

                # 2. Process Chat Subfolders and ZIPs
                for item in os.listdir(in_dir):
                    if item.lower() == "processed" or item.startswith("_"):
                        continue
                    process_chat_item(in_dir, item, out_dir)
                
                # 3. Process Loose Images
                process_loose_chat_images(in_dir, out_dir)

            time.sleep(poll_interval)
    except KeyboardInterrupt:
        log("\n🛑 Master Watcher stopped by user.")


if __name__ == "__main__":
    start_watcher()
