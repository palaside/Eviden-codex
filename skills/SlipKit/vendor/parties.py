# -*- coding: utf-8 -*-
"""P3 จากอีกทาง (ดิบเพื่อเทส)."""
import unittest
from typing import List, Dict, Any

SENDER_CUES = ["จาก", "ผู้โอน", "โอนจาก", "sender", "from"]
RECEIVER_CUES = ["ถึง", "ผู้รับ", "โอนไปยัง", "ไปยัง", "receiver", "to"]


def assign_parties(candidates: List[str], full_text: str) -> Dict[str, Any]:
    result = {"sender_name": "-", "receiver_name": "-", "needs_review": False}
    if not candidates:
        result["needs_review"] = True
        return result
    if len(candidates) == 1:
        result["sender_name"] = candidates[0]
        result["needs_review"] = True
        return result
    lower_text = full_text.lower()
    candidate_positions = []
    for cand in candidates:
        pos = lower_text.find(cand.lower())
        candidate_positions.append((pos, cand))
    candidate_positions.sort(key=lambda x: x[0])
    ordered_cands = [cand for pos, cand in candidate_positions if pos != -1]
    if len(ordered_cands) < 2:
        ordered_cands = candidates
    assigned_sender = None
    assigned_receiver = None
    for cand in ordered_cands:
        idx = lower_text.find(cand.lower())
        if idx != -1:
            context_window = lower_text[max(0, idx - 30):idx]
            if any(cue in context_window for cue in SENDER_CUES) and not assigned_sender:
                assigned_sender = cand
            elif any(cue in context_window for cue in RECEIVER_CUES) and not assigned_receiver:
                assigned_receiver = cand
    if assigned_sender and assigned_receiver and assigned_sender != assigned_receiver:
        result["sender_name"] = assigned_sender
        result["receiver_name"] = assigned_receiver
    elif len(ordered_cands) >= 2:
        result["sender_name"] = ordered_cands[0]
        result["receiver_name"] = ordered_cands[1]
        if not (assigned_sender or assigned_receiver):
            result["needs_review"] = True
    else:
        result["needs_review"] = True
    return result


