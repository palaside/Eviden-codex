"use client";

import { useState } from "react";
import type { SlipExtraction } from "@/schemas/slip.schema";
import { runTyphoonOCR } from "@/utils/typhoon-ocr";

interface Props {
  file: File;
  current: SlipExtraction;
}

export default function TyphoonOcrReview({ file, current }: Props) {
  const [consented, setConsented] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SlipExtraction | null>(null);

  if (!/^image\/(png|jpeg)$/.test(file.type)) return null;

  const runOcr = async () => {
    if (!consented || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await runTyphoonOCR(file, { consent: true });
      setResult(response.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เรียก Typhoon OCR ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <details className="mt-2 border-t border-white/10 pt-2 text-left">
      <summary className="cursor-pointer text-[10px] text-amber-200">
        OCR ทางเลือกผ่าน OpenTyphoon (ส่งภาพออกนอกเครื่อง)
      </summary>
      <p className="mt-1 text-[10px] text-amber-100">
        จะส่งภาพสลิปนี้ ซึ่งอาจมีชื่อ เลขบัญชี และยอดเงิน ไปยัง OpenTyphoon เพื่อถอดข้อความอีกครั้ง ผลลัพธ์จะแสดงเทียบเท่านั้นและไม่เขียนทับข้อมูลเดิม
      </p>
      <label className="mt-1 flex items-start gap-1.5 text-[10px] text-slate-200">
        <input
          type="checkbox"
          checked={consented}
          onChange={(event) => setConsented(event.target.checked)}
        />
        ยินยอมส่งภาพสลิปนี้ไปยัง OpenTyphoon
      </label>
      <button
        type="button"
        disabled={!consented || loading}
        onClick={runOcr}
        className="mt-1 rounded border border-amber-300/40 px-2 py-1 text-[10px] text-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? "กำลังอ่าน..." : "ส่งภาพไปอ่าน OCR ภายนอก"}
      </button>
      {error && <p role="alert" className="mt-1 text-[10px] text-rose-300">{error}</p>}
      {result && (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-200" aria-live="polite">
          <span className="font-semibold text-amber-200">ช่องข้อมูล</span><span className="font-semibold text-amber-200">เดิม → Typhoon</span>
          <span>วันที่/เวลา</span><span>{[current.transaction.date, current.transaction.time].filter(Boolean).join(" ") || "อ่านไม่ได้"} → {[result.transaction.date, result.transaction.time].filter(Boolean).join(" ") || "อ่านไม่ได้"}</span>
          <span>ผู้โอน</span><span>{current.sender.name || "อ่านไม่ได้"} → {result.sender.name || "อ่านไม่ได้"}</span>
          <span>บัญชีต้นทาง</span><span>{current.sender.account_no || "อ่านไม่ได้"} → {result.sender.account_no || "อ่านไม่ได้"}</span>
          <span>ผู้รับ</span><span>{current.receiver.name || "อ่านไม่ได้"} → {result.receiver.name || "อ่านไม่ได้"}</span>
          <span>บัญชีปลายทาง</span><span>{current.receiver.account_no || "อ่านไม่ได้"} → {result.receiver.account_no || "อ่านไม่ได้"}</span>
          <span>ธนาคาร / Ref</span><span>{[current.bank.name, current.transaction.reference_no].filter(Boolean).join(" · ") || "อ่านไม่ได้"} → {[result.bank.name, result.transaction.reference_no].filter(Boolean).join(" · ") || "อ่านไม่ได้"}</span>
          <span>ยอดเงิน</span><span>{current.transaction.amount ?? "อ่านไม่ได้"} → {result.transaction.amount ?? "อ่านไม่ได้"}</span>
          <span className="col-span-2 text-slate-400">ข้อมูลเดิมยังไม่ถูกเปลี่ยน · ตรวจภาพต้นฉบับก่อนกรอกหรือยืนยัน</span>
        </div>
      )}
    </details>
  );
}
