"use client";

import React from "react";
import type { CourtCoverSheetData, HashManifestEntry } from "@/types/cover-sheet";
import type { ForensicEvidenceState } from "@/constants/forensic-ssot";
import type { SlipExtraction } from "@/schemas/slip.schema";
import type { EmbeddedSlipRecord } from "@/types/embedded-slip";
import CourtCoverSheet from "@/components/CourtCoverSheet";
import ExecutiveSummarySheet from "@/components/ExecutiveSummarySheet";
import HashManifestTable from "@/components/HashManifestTable";
import { HeaderA4 } from "@/components/HeaderA4";
import { ModeSelectorPanel } from "@/components/ModeSelectorPanel";
import { LedgerColumnToggle, ledgerColumns } from "@/components/LedgerColumnToggle";
import { LEGAL_DISCLAIMER_LINES } from "@/constants/forensic-ssot";
import { resolveHeaderCorroborated } from "@/utils/forensic-header-machine";

export interface StagedItemForBook {
  id: string;
  file: File;
  previewUrl: string;
  category: "PENDING" | "SLIP" | "CHAT";
  isConfirmed?: boolean;
  detectType?: string;
  sourceBounds?: { x: number; y: number; width: number; height: number };
  data?: SlipExtraction;
  chatSlices?: string[];
  embeddedSlips?: EmbeddedSlipRecord[];
}

interface Props {
  coverData: CourtCoverSheetData;
  evidenceState: ForensicEvidenceState;
  extractedSlip: SlipExtraction | null;
  previewImage: string | null;
  stagedItems?: StagedItemForBook[];
  manifestEntries: HashManifestEntry[];
  caseNumber: string;
  suspectName?: string;
  investigatorName?: string;
  investigatorPosition?: string;
  exportPassword?: string;
  onClose?: () => void;
  onJumpToSection?: (section: string) => void;
}

export default function MasterDossierFullBook({
  coverData,
  evidenceState,
  extractedSlip,
  previewImage,
  stagedItems = [],
  manifestEntries,
  caseNumber,
  suspectName,
  investigatorName = "พ.ต.ท. สมศักดิ์ นิติการ",
  investigatorPosition = "สารวัตรสอบสวน (กลุ่มงานพิสูจน์หลักฐานดิจิทัล)",
  exportPassword = "",
  onClose,
}: Props) {
  // ...props

  const dossierPageForItem = (itemIndex: number) => 4 + stagedItems.slice(0, itemIndex).reduce(
    (count, earlier) => count + (earlier.category === "CHAT" ? earlier.chatSlices?.length || 1 : 1), 0,
  );
  const ledgerRows: Array<Record<string, string | number>> = stagedItems.flatMap((item, itemIndex) => item.category === "CHAT"
    ? (item.embeddedSlips || []).map((record) => ({
        seq: 0,
        chatPage: `${record.chatPageNumber}/${record.chatPageCount}`,
        dossierPage: record.dossierPageNumber,
        source: `${record.sourceFileName} · ${record.sourceBounds.x},${record.sourceBounds.y}`,
        dateTime: [record.data.transaction.date, record.data.transaction.time].filter(Boolean).join(" ") || "ต้องตรวจ",
        bank: [record.data.sender.bank, record.data.receiver.bank].filter(Boolean).join(" → ") || record.data.bank.name || "ต้องตรวจ",
        senderAccount: record.data.sender.account_no || "-",
        senderName: record.data.sender.name || "ต้องตรวจ",
        amount: record.data.transaction.amount == null ? "ต้องตรวจ" : record.data.transaction.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 }),
        receiverAccount: record.data.receiver.account_no || "-",
        receiverName: record.data.receiver.name || "ต้องตรวจ",
        reference: record.data.transaction.reference_no || "ต้องตรวจ",
        status: record.isConfirmed ? "ผู้ใช้ยืนยัน" : "รอตรวจและยืนยัน",
      }))
    : item.data ? [{
        seq: 0,
        chatPage: "-",
        dossierPage: dossierPageForItem(itemIndex),
        source: item.sourceBounds
          ? `${item.file.name} · ${item.sourceBounds.x},${item.sourceBounds.y}`
          : item.file.name,
        dateTime: [item.data.transaction.date, item.data.transaction.time].filter(Boolean).join(" ") || "ต้องตรวจ",
        bank: [item.data.sender.bank, item.data.receiver.bank].filter(Boolean).join(" → ") || item.data.bank.name || "ต้องตรวจ",
        senderAccount: item.data.sender.account_no || "-",
        senderName: item.data.sender.name || "ต้องตรวจ",
        amount: item.data.transaction.amount == null ? "ต้องตรวจ" : item.data.transaction.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 }),
        receiverAccount: item.data.receiver.account_no || "-",
        receiverName: item.data.receiver.name || "ต้องตรวจ",
        reference: item.data.transaction.reference_no || "ต้องตรวจ",
        status: item.isConfirmed ? "ผู้ใช้ยืนยัน" : "รอตรวจและยืนยัน",
      }] : []);
  if (!stagedItems.length && extractedSlip) {
    ledgerRows.push({
      seq: 1, chatPage: "-", dossierPage: "-", source: "หลักฐานที่เลือก",
      dateTime: [extractedSlip.transaction.date, extractedSlip.transaction.time].filter(Boolean).join(" ") || "ต้องตรวจ",
      bank: [extractedSlip.sender.bank, extractedSlip.receiver.bank].filter(Boolean).join(" → ") || extractedSlip.bank.name || "ต้องตรวจ",
      reference: extractedSlip.transaction.reference_no || "ต้องตรวจ",
      senderName: extractedSlip.sender.name || "ต้องตรวจ", senderAccount: extractedSlip.sender.account_no || "ต้องตรวจ",
      receiverName: extractedSlip.receiver.name || "ต้องตรวจ", receiverAccount: extractedSlip.receiver.account_no || "ต้องตรวจ",
      amount: extractedSlip.transaction.amount == null ? "ต้องตรวจ" : extractedSlip.transaction.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 }),
      status: "รอตรวจและยืนยัน",
    });
  }
  const [visibleCols, setVisibleCols] = React.useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = {};
    ledgerColumns.forEach(col => { defaults[col.key] = true; });
    return defaults;
  });

  const handlePrint = () => {
    window.print();
  };

  const nowFormatted = new Date().toLocaleDateString("en-GB") + " : " + new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  const evidenceCorroboration = resolveHeaderCorroborated({
    type: "SLIP",
    itemIndex: 1,
    targetName: suspectName || evidenceState.poiName,
    amount: extractedSlip?.transaction?.amount || evidenceState.totalNetLoss,
    isDuplicate: false,
    chatHasSlip: evidenceState.slipCount > 0,
    slipPageRef: 1,
  });

  // Dynamic Evidence Pages Compilation (Flattens multi-page chat slices & slips)
  const compiledEvidencePages: Array<{
    pageId: string;
    category: "SLIP" | "CHAT" | "SOURCE";
    imageUrl: string;
    sliceLabel?: string;
    corroborationText: string;
  }> = [];

  if (stagedItems && stagedItems.length > 0) {
    stagedItems.forEach((item, itemIdx) => {
      if (item.category === "CHAT" && item.chatSlices && item.chatSlices.length > 0) {
        item.chatSlices.forEach((sliceUrl, sliceIdx) => {
          const corroText = resolveHeaderCorroborated({
            type: "CHAT",
            itemIndex: itemIdx + 1,
            targetName: suspectName || evidenceState.poiName,
            amount: item.data?.transaction.amount || evidenceState.totalNetLoss,
            isDuplicate: false,
            chatHasSlip: item.category === "CHAT" && (item.embeddedSlips?.length || 0) > 0,
            slipPageRef: 1,
          });
          compiledEvidencePages.push({
            pageId: `${item.id}-slice-${sliceIdx}`,
            category: "CHAT",
            imageUrl: sliceUrl,
            sliceLabel: `หน้าแชท ${sliceIdx + 1} / ${item.chatSlices!.length}`,
            corroborationText: corroText,
          });
        });
      } else {
        const pageCategory: "SLIP" | "CHAT" | "SOURCE" = item.category === "PENDING" ? "SOURCE" : item.category;
        const corroText = pageCategory === "SOURCE"
          ? "ไฟล์ต้นฉบับที่รอจำแนกและประมวลผล — ยังไม่มีการวิเคราะห์เนื้อหา"
          : resolveHeaderCorroborated({
              type: pageCategory,
              itemIndex: itemIdx + 1,
              targetName: suspectName || evidenceState.poiName,
              amount: item.data?.transaction.amount || evidenceState.totalNetLoss,
              isDuplicate: false,
              chatHasSlip: item.category === "CHAT" && (item.embeddedSlips?.length || 0) > 0,
              slipPageRef: 1,
            });
        compiledEvidencePages.push({
          pageId: item.id,
          category: pageCategory,
          imageUrl: item.previewUrl,
          corroborationText: corroText,
        });
      }
    });
  } else if (previewImage) {
    compiledEvidencePages.push({
      pageId: "single-preview",
      category: "SLIP",
      imageUrl: previewImage,
      corroborationText: evidenceCorroboration,
    });
  }

  // Pass 1: Total Pages Calculation
  // 3 Front Matter Pages (Cover, Executive Summary, 13-Column Ledger) + N Evidence Pages + 1 Hash Manifest Page
  const totalPages = 3 + (compiledEvidencePages.length > 0 ? compiledEvidencePages.length : 1) + 1;

  return (
    <div className="fixed inset-0 z-50 bg-[#070a0f]/95 backdrop-blur-xl flex flex-col overflow-hidden select-text text-slate-100">
      {/* Control Top Bar */}
      <div className="h-16 px-6 glass-header border-b border-white/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <img
            src="/LOGO.png"
            alt="Dossier Logo"
            className="h-9 w-auto object-contain select-none"
          />
          <div>
            <h2 className="font-bold text-sm text-slate-100">
              DIGITAL EVIDENCE — แฟ้มพยานหลักฐาน ({totalPages} หน้า)
            </h2>
            <p className="text-[11px] text-slate-400 font-mono">
              เอกสารประกอบการตรวจสอบเบื้องต้น · {totalPages} หน้า
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {exportPassword?.trim() ? (
            <span className="text-[11px] font-mono text-amber-300 bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-400/40 flex items-center gap-1.5 font-semibold">
              PASSWORD SET FOR DOWNLOADED EXPORT
            </span>
          ) : (
            <span className="text-[11px] font-mono text-slate-400 bg-white/5 px-2.5 py-1 rounded-lg border border-white/10 flex items-center gap-1.5">
              NO PASSWORD SET (Preview ยังไม่เข้ารหัสจริง)
            </span>
          )}
          <button
            onClick={handlePrint}
            className="btn-proportional-primary glass-button glass-button-cyan text-xs"
          >
            🖨️ พิมพ์ Preview (ไม่ใช้รหัสส่งออก)
          </button>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center font-bold text-sm"
          >
            ✕
          </button>
        </div>
        {/* Insert Mode Selector Panel */}
        <ModeSelectorPanel />
      </div>

      {/* Dossier Pages Scroll Container (Zero Blank Screen) */}
      <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center gap-10 print:p-0 print:gap-0">
        {/* ===================================================================
            ลำดับที่ 1 (แผ่นแรก): หน้าปกแฟ้มหลักฐาน (PAGE : 1 / totalPages)
            =================================================================== */}
        <HeaderA4 />
        <div
          id="section-cover"
          className="w-full max-w-[850px] aspect-[1/1.414] shadow-2xl relative break-after-page print:shadow-none print:w-full print:h-screen"
        >
          <CourtCoverSheet data={coverData} />
        </div>

        {/* ===================================================================
            ลำดับที่ 2: ใบสรุปข้อมูลตรวจสอบ (PAGE : 2 / totalPages)
            =================================================================== */}
        <div
          id="section-executive"
          className="w-full max-w-[850px] aspect-[1/1.414] shadow-2xl relative break-after-page print:shadow-none print:w-full print:h-screen"
        >
          <ExecutiveSummarySheet
            evidence={evidenceState}
            caseNumber={caseNumber}
            suspectName={suspectName}
          />
        </div>

        {/* ===================================================================
            ลำดับที่ 3: ตารางสรุปรายการสลิป 13 คอลัมน์ แนวนอน (PAGE : 3 / totalPages)
            =================================================================== */}
        <div
          id="section-ledger"
          className="w-full max-w-[1200px] aspect-[1.414/1] bg-white text-slate-900 rounded-lg p-6 shadow-2xl relative flex flex-col justify-between break-after-page print:shadow-none print:w-full print:h-screen"
          style={{ fontFamily: "'Sarabun', sans-serif" }}
        >
          <div>
            <div className="border-b-2 border-slate-900 pb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-3xl">📊</span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    <LedgerColumnToggle visible={visibleCols} setVisible={setVisibleCols} persist={true} />
            ตารางบัญชีนิติวิทยาศาสตร์และเส้นทางธุรกรรม ๑๓ คอลัมน์ (Financial Ledger)
                    ตารางบัญชีนิติวิทยาศาสตร์และเส้นทางธุรกรรม ๑๓ คอลัมน์ (Financial Ledger)
                  </h3>
                  <p className="text-[10px] text-slate-600">
                    เอกสารประกอบการตรวจสอบเบื้องต้น ไม่ใช่คำวินิจฉัยทางกฎหมาย
                  </p>
                </div>
              </div>
              <div className="text-right text-xs">
                <div className="font-mono font-bold text-slate-900">PAGE : 3 / {totalPages}</div>
                <div className="text-[10px] text-slate-600 font-mono">เรื่องตรวจสอบ: {caseNumber}</div>
              </div>
            </div>

            {/* Table */}
            <div className="mt-4 border border-slate-300 rounded overflow-hidden">
                <table className="w-full text-left border-collapse text-[10px]">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-800">
                      {ledgerColumns.filter(col => visibleCols[col.key]).map(col => (
                        <th key={col.key} className="p-1.5 text-center">{col.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerRows.length > 0 ? (
                      ledgerRows.map((row, idx) => (
                        <tr key={idx} className="border-b border-slate-200">
                          {ledgerColumns.filter(col => visibleCols[col.key]).map(col => (
                            <td key={col.key} className="p-1.5 text-center font-mono">{col.key === "seq" ? idx + 1 : row[col.key] ?? "-"}</td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={ledgerColumns.filter(col => visibleCols[col.key]).length} className="p-6 text-center text-slate-400">
                          ไม่พบรายการสลิปในแฟ้มหลักฐาน (Pure Zero State)
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded flex justify-between items-center text-xs font-semibold">
              <span>ยอดรวมหลังตรวจรายการซ้ำ (Net Reconciled Total):</span>
              <span className="font-mono text-base font-bold text-emerald-700">
                ฿ {evidenceState.totalNetLoss.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="text-[8px] text-slate-500 text-center leading-relaxed pt-2 border-t border-slate-200 shrink-0">
            {LEGAL_DISCLAIMER_LINES.join(" ")}
          </div>
        </div>

        {/* ===================================================================
            ลำดับที่ 4 ถึง 3+N: พยานหลักฐานแผ่นสลิป / แชททุกหน้า A4
            =================================================================== */}
        {compiledEvidencePages.map((evPage, idx) => {
          const pageNum = 4 + idx;
          return (
            <div
              key={evPage.pageId}
              id={`section-evidence-${idx}`}
              className="w-full max-w-[850px] aspect-[1/1.414] bg-white text-slate-900 rounded-lg p-8 shadow-2xl relative flex flex-col justify-between break-after-page print:shadow-none print:w-full print:h-screen"
              style={{ fontFamily: "'Sarabun', sans-serif" }}
            >
              <div>
                {/* Standard Evidence Ribbon Header */}
                <div className="bg-[#F8FAFC] border border-[#CBD5E1] rounded p-3 mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src="/LOGO.png"
                      alt="Emblem"
                      className="h-12 w-auto object-contain select-none"
                    />
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5 text-xs text-[#111827]">
                        <span className="font-extralight">MODE : </span>
                        <span className="font-thin font-bold">{evPage.category}</span>
                        {evPage.sliceLabel && (
                          <span className="ml-2 font-mono text-[10px] text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded border border-sky-300 font-semibold">
                            {evPage.sliceLabel}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-[#111827]">
                        <span className="font-extralight">CORROBORATED : </span>
                        <span className="font-thin text-[11px] text-[#111827] max-w-[480px] truncate">
                          {evPage.corroborationText}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-0.5 text-xs text-[#111827]">
                    <div className="flex items-center gap-1">
                      <span className="font-extralight">PAGE : </span>
                      <span className="font-thin font-bold font-mono">{pageNum} / {totalPages}</span>
                    </div>
                    <span className="font-thin text-[10px] text-slate-500 font-mono">
                      {nowFormatted}
                    </span>
                  </div>
                </div>

                {/* Evidence Image Display */}
                <div className="my-4 h-[580px] flex items-center justify-center border border-dashed border-slate-300 rounded bg-slate-50 p-2">
                  <img
                    src={evPage.imageUrl}
                    alt={`Evidence ${evPage.category}`}
                    className="max-h-full max-w-full object-contain rounded shadow"
                  />
                </div>
              </div>

              <div className="text-[8px] text-slate-500 text-center leading-relaxed pt-2 border-t border-slate-200 shrink-0">
                {LEGAL_DISCLAIMER_LINES.join(" ")}
              </div>
            </div>
          );
        })}

        {/* ===================================================================
            ลำดับที่ปิดท้าย (PAGE : totalPages / totalPages): บัญชีคุมค่าแฮช + บล็อกลงลายมือชื่อ
            =================================================================== */}
        <div
          id="section-manifest"
          className="w-full max-w-[850px] aspect-[1/1.414] shadow-2xl relative break-after-page print:shadow-none print:w-full print:h-screen"
        >
          <HashManifestTable
            entries={manifestEntries}
            caseNumber={caseNumber}
            investigatorName={investigatorName}
            investigatorPosition={investigatorPosition}
            pageNumber={`${totalPages} / ${totalPages}`}
          />
        </div>
      </div>

  );
}
