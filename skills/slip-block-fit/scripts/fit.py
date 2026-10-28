#!/usr/bin/env python3
"""Slip fit math mirror (stdlib only). Usage: python fit.py <W> <H>"""
import sys, math

TW, TH = 645, 890

def fit(w, h):
    if w <= 0 or h <= 0: raise ValueError("INVALID_DIMENSIONS")
    scale = min(1.0, min(TW / w, TH / h))
    nw, nh = round(w * scale), round(h * scale)
    return {"newW": nw, "newH": nh, "x": (TW - nw) // 2, "y": (TH - nh) // 2, "scale": scale}

if __name__ == "__main__":
    w, h = float(sys.argv[1]), float(sys.argv[2])
    print(fit(w, h))
