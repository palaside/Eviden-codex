"use client";
import { useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import { identifyBank } from "../lib/classifier";

export default function Page() {
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  // ธุรกิจจริง: สแกนทั้งภาพ (ห้าม crop ตายตัว) -> ถอด payload -> ระบุธนาคาร
  async function handleFile(f: File) {
    setBusy(true);
    try {
      const url = URL.createObjectURL(f);
      const reader = new BrowserQRCodeReader();
      const img = new Image();
      img.src = url;
      await img.decode();
      const r = await reader.decodeFromImageElement(img);
      const out = identifyBank(r.getText());
      setResult(`${out.bank} (${out.reason})`);
      URL.revokeObjectURL(url);
    } catch {
      setResult("UNKNOWN (QR_UNREADABLE)");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 560 }}>
      <h1>QR Slip Decoder</h1>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <button disabled={busy} onClick={() => setResult("")}>
        {busy ? "Scanning..." : "Clear"}
      </button>
      <p>Result: {result || "-"}</p>
    </main>
  );
}
