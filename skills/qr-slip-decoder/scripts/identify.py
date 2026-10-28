#!/usr/bin/env python3
"""QR Slip Payload -> Bank (mirror of TS/Java 7-row table, stdlib only)."""
import sys, urllib.parse

MAP = [
    ("BBL", ["bangkokbank.com"]),
    ("KKP", ["kkpfg.com", "kiatnakin.co.th"]),
    ("KBANK", ["kasikornbank.com"]),
    ("SCB", ["scb.co.th"]),
]

def identify(payload):
    if not payload or not payload.strip():
        return ("UNKNOWN", "QR_UNREADABLE")
    s = payload.strip()
    try:
        u = urllib.parse.urlparse(s)
        if u.scheme not in ("http", "https") or not u.hostname:
            return ("UNKNOWN", "INVALID_PAYLOAD")
        host = u.hostname.lower()
    except Exception:
        return ("UNKNOWN", "INVALID_PAYLOAD")
    for bank, hosts in MAP:
        for h in hosts:
            if host == h or host.endswith("." + h):
                return (bank, "DOMAIN_MATCH:" + host)
    return ("UNKNOWN", "UNMAPPED_DOMAIN")

if __name__ == "__main__":
    p = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()
    bank, reason = identify(p)
    print(f"{bank} ({reason})")
