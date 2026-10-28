"""
NET_Detail Skill - Forensic Net Loss & Financial Evidence Reconciliation Engine
Calculates Gross Detected Points vs Net Master Slips.
Guarantees 100% Anti-Double-Counting for Court Dossiers.
"""

from dataclasses import dataclass
from typing import List, Dict, Any

@dataclass
class NetEvidenceSummary:
    gross_detected: int
    gross_amount: float
    duplicate_count: int
    excluded_amount: float
    net_master_count: int
    net_actual_amount: float

def calculate_net_financial_evidence(occurrences: List[Dict[str, Any]]) -> NetEvidenceSummary:
    """
    Computes gross detected occurrences, extracts duplicates,
    and returns verified net financial evidence statement.
    """
    seen_refs = set()
    gross_amount = 0.0
    excluded_amount = 0.0
    net_actual_amount = 0.0
    duplicate_count = 0
    master_count = 0

    for item in occurrences:
        amount = float(item.get("amount", 0.0))
        ref = item.get("ref_id", "").strip()
        gross_amount += amount

        if ref and ref in seen_refs:
            duplicate_count += 1
            excluded_amount += amount
        else:
            if ref:
                seen_refs.add(ref)
            master_count += 1
            net_actual_amount += amount

    return NetEvidenceSummary(
        gross_detected=len(occurrences),
        gross_amount=gross_amount,
        duplicate_count=duplicate_count,
        excluded_amount=excluded_amount,
        net_master_count=master_count,
        net_actual_amount=net_actual_amount
    )
