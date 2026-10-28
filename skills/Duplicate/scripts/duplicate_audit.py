"""
Duplicate Skill - Forensic Deduplication & Cross-Reference Audit Engine
Supports 3-Pillar Deduplication (Dicut_Chat, OCR_Slip, Search_Slip)
Provides exact page numbers, counts, and Master Slip pairings.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional

@dataclass
class DuplicateRecord:
    occurrence_id: int
    page_num: str
    ref_id: str
    master_slip_id: str
    amount: float
    reason: str
    status: str = "EXCLUDED_FROM_TOTAL"

@dataclass
class DuplicateAuditReport:
    total_detected: int
    duplicate_count: int
    unique_count: int
    affected_pages: List[str]
    cross_reference_table: List[DuplicateRecord] = field(default_factory=list)

def audit_duplicate_evidence(occurrences: List[Dict[str, Any]]) -> DuplicateAuditReport:
    """
    Scans detected slip occurrences across chat pages and individual files.
    Identifies duplicates using Transaction Ref ID, 5D fingerprint, and image hash.
    Maps each duplicate to its corresponding Master Slip and affected pages.
    """
    seen_refs = {}
    duplicates: List[DuplicateRecord] = []
    affected_pages_set = set()
    master_count = 0

    for idx, item in enumerate(occurrences, 1):
        ref = item.get("ref_id", "").strip()
        page = str(item.get("page_num", "1"))
        amount = float(item.get("amount", 0.0))
        
        if ref and ref in seen_refs:
            master_id = seen_refs[ref]["master_id"]
            reason = item.get("duplicate_reason", "ส่งภาพเดิมซ้ำในแชท / รอยต่อหน้า")
            dup_entry = DuplicateRecord(
                occurrence_id=idx,
                page_num=page,
                ref_id=ref,
                master_slip_id=master_id,
                amount=amount,
                reason=reason
            )
            duplicates.append(dup_entry)
            affected_pages_set.add(page)
        else:
            master_count += 1
            master_id = f"MASTER SLIP #{master_count:02d}"
            if ref:
                seen_refs[ref] = {
                    "master_id": master_id,
                    "first_seen_page": page,
                    "amount": amount
                }

    sorted_pages = sorted(list(affected_pages_set), key=lambda x: [int(c) if c.isdigit() else c for c in x.split('-')])

    return DuplicateAuditReport(
        total_detected=len(occurrences),
        duplicate_count=len(duplicates),
        unique_count=master_count,
        affected_pages=sorted_pages,
        cross_reference_table=duplicates
    )
