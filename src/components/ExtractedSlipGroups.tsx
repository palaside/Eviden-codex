import { useMemo } from "react";
import type { SlipExtraction } from "@/schemas/slip.schema";
import type { GeminiReviewReport, SlipOcrDiagnosticTrace } from "@/types/slip-ocr-trace";
import { maskPersonName } from "@/utils/privacy-mask";

type SourceLink = { id?: string; sourceItemId: string; chatPage: string };
type RecordRow = SourceLink & { id: string; data: SlipExtraction; sha256: string; source: string; ocrDiagnosticTrace?: SlipOcrDiagnosticTrace };
type Source = { id: string; file: File; meta?: {sha256?: string} | null; ocrDiagnosticTrace?: SlipOcrDiagnosticTrace };
type Fields = GeminiReviewReport["slipAssessments"][number]["fieldAssessments"];

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function reading(key: string, source: SourceLink, filename: string, fields?: Fields, data?: SlipExtraction) {
  const text = (field: string, local: string | null | undefined) =>
    data?.reviewed_fields?.some(name => name === field) ? textValue(local) : textValue(fields?.[field]?.value) ?? textValue(local);
  const modelAmount = fields?.amount?.value;
  const amount = typeof modelAmount === "number" && Number.isFinite(modelAmount) && !data?.reviewed_fields?.includes("amount")
    ? modelAmount : data?.transaction.amount;
  return {key, source, filename, receiver:text("receiver_name",data?.receiver.name),
    sender:text("sender_name",data?.sender?.name),
    bank:text("sender_bank",data?.sender?.bank) ?? text("bank",data?.bank.name),
    receiverBank:text("receiver_bank",data?.receiver.bank),
    memo:text("note",data?.transaction.note),
    amount:typeof amount === "number" ? amount.toLocaleString("th-TH",{minimumFractionDigits:2,maximumFractionDigits:2}) + " บาท" : null,
    datetime:[text("date",data?.transaction.date),text("time",data?.transaction.time)].filter(Boolean).join(" · "),
    ref:text("reference_no",data?.transaction.reference_no)};
}

function groupReadings(records: RecordRow[], sources: Source[]) {
  const rows: ReturnType<typeof reading>[] = [];
  const used = new Set<string>();
  for (const source of sources) {
    const report = source.ocrDiagnosticTrace?.geminiReview;
    if (!report) continue;
    const local = records.filter(row => row.sourceItemId === source.id && row.sha256 && row.sha256 === source.meta?.sha256);
    for (const slip of report.slipAssessments) {
      const fields = slip.fieldAssessments;
      const ref = textValue(fields.reference_no?.value);
      const uniqueRef = ref && report.slipAssessments.filter(s => s.fieldAssessments.reference_no?.value === ref).length === 1;
      const matching = local.filter(row => !used.has(row.id) && row.ocrDiagnosticTrace?.geminiSourceIndex === slip.sourceIndex
        && row.ocrDiagnosticTrace?.geminiReview?.rawResponseText === report.rawResponseText);
      const candidates = matching.length ? matching : local.filter(row => uniqueRef && row.data.transaction.reference_no === ref);
      const row = candidates.length === 1 && !used.has(candidates[0].id) ? candidates[0] : undefined;
      if (row) used.add(row.id);
      rows.push(reading(`${source.id}:ocr:${slip.sourceIndex}`,row ?? {sourceItemId:source.id,chatPage:""},source.file.name,fields,row?.data));
    }
  }
  for (const row of records) {
    if (!used.has(row.id)) rows.push(reading(row.id,row,row.source,undefined,row.data));
  }
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.receiver ? "name:"+row.receiver.normalize("NFC").trim().replace(/\s+/gu," ") : "unknown:"+row.key;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key,[row]);
  }
  return Array.from(groups.values());
}

export default function ExtractedSlipGroups({records,sources,privateNames,openSource}:{
  records:RecordRow[];sources:Source[];privateNames:boolean;openSource:(source:SourceLink)=>void;
}) {
  const groups = useMemo(() => groupReadings(records,sources),[records,sources]);
  const frame = "rounded-lg border border-emerald-300/35 bg-emerald-950/25 px-3 py-2.5";
  return <section aria-label="ผลสกัดสลิปตามผู้รับ" className="space-y-2">
    <h3 className="text-xs font-semibold text-emerald-200">ผลสกัดสลิปตามผู้รับ</h3>
    {!groups.length && <p className="text-xs text-slate-400">ยังไม่มีผลสกัดสลิป</p>}
    <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
      {groups.map(group => {
        const first = group[0];
        const name = first.receiver ? maskPersonName(first.receiver,privateNames) : "ไม่พบชื่อผู้รับ";
        const entries = group.map((row,index) => <div key={row.key} className="mt-2 border-t border-emerald-200/15 pt-2">
          {group.length > 1 && <p className="mb-1 text-xs text-emerald-200">รายการที่ {index+1}</p>}
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
            {[
              ["วัน-เวลา", row.datetime],
              ["ชื่อผู้โอน", row.sender && maskPersonName(row.sender,privateNames)],
              ["ธนาคาร", row.bank],
              ["จำนวนเงิน", row.amount],
              ["ธนาคารผู้รับโอน", row.receiverBank],
              ["ชื่อผู้รับ", row.receiver && maskPersonName(row.receiver,privateNames)],
              ["เลขที่อ้างอิง", row.ref],
              ["บันทึกช่วยจำ (Memo)", row.memo && (privateNames ? "ปกปิด" : row.memo)],
            ].map(([label,value]) =>
              <div key={label} className="contents"><dt className="text-slate-400">{label}</dt>
                <dd className={label==="จำนวนเงิน"?"break-words font-semibold tabular-nums text-emerald-200":"whitespace-pre-wrap break-words text-slate-100"}>{value || "ไม่พบข้อมูล"}</dd></div>)}
          </dl>
          <button type="button" onClick={()=>openSource(row.source)} className="mt-2 max-w-full break-all text-left text-[10px] text-sky-300 underline">ดูภาพต้นฉบับ · {row.filename}</button>
        </div>);
        return group.length===1 ? <article key={first.key} className={frame}><h4 className="break-words text-sm font-semibold text-emerald-100">{name}</h4>{entries}</article>
          : <details key={first.key} className={frame}><summary className="cursor-pointer break-words text-sm font-semibold text-emerald-100">{name} · {group.length} รายการ</summary>{entries}</details>;
      })}
    </div>
  </section>;
}
