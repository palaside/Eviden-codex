# Forensic 13-Columns Financial Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the court-standard "ตารางสรุปเส้นทางการเงิน ๑๓ คอลัมน์ (Forensic Financial Ledger)" across the application UI modal, court printable dossier, and Excel-compatible UTF-8 BOM CSV export for criminal fraud, online scams, and economic crime court filings.

**Architecture:** 
1. Define TypeScript interface `ForensicLedgerRow` representing the exact 13 court-standard columns.
2. Build utility functions to generate the 13-column ledger dataset directly from `stagedQueue`, automatically mapping SHA-256, cleaned recipient names (`stripThaiTitlePrefix`), transaction fees, duplicate cross-references, and court A4 page references.
3. Upgrade the Ledger Modal in `digital-evidence/src/app/page.tsx` and Page 3 of `MasterDossierFullBook.tsx` from the legacy 10 columns to the comprehensive 13 columns.
4. Implement one-click "📥 ส่งออก CSV (13 คอลัมน์)" with UTF-8 BOM (`\uFEFF`) ensuring Thai typography displays flawlessly in Microsoft Excel.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Blob/CSV API, Vitest.

## Global Constraints

- Response language: Thai.
- Follow disciplines from `debugging-skill`, `change-impact-analysis`, and `scoped-bug-fix`.
- Token discipline: Clean, modular edits; avoid breaking existing components or left panel staging flow.
- The 13 columns must precisely follow court forensic evidence standards:
  1. ลำดับ (No.)
  2. วัน-เวลาทำรายการ (Date-Time)
  3. ผู้โอน (ต้นทาง) (Sender)
  4. เลขที่บัญชีต้นทาง (From Account)
  5. ผู้รับโอน (ปลายทาง) (Receiver / POI - 100% Cleaned)
  6. เลขที่บัญชีปลายทาง (To Account)
  7. ธนาคาร/สถาบันการเงิน (Bank)
  8. จำนวนเงินโอนสุทธิ (บาท) (Amount)
  9. ค่าธรรมเนียม (บาท) (Fee)
  10. รหัสอ้างอิงธุรกรรม (Txn Ref / ID)
  11. แฮชพยานหลักฐาน (SHA-256)
  12. ผลตรวจสลิปซ้ำ (Duplicate Status)
  13. หน้าสำนวน/สถานะสัมพันธ์ (Court Page Ref)

---

### Task 1: Type Definitions & 13-Column Ledger Data Builder

**Files:**
- Create: `digital-evidence/src/types/forensic-ledger.ts`
- Create: `digital-evidence/src/utils/forensic-ledger-builder.ts`
- Test: `digital-evidence/src/utils/__tests__/forensic-ledger-builder.test.ts`

**Interfaces:**
- Consumes: `StagedEvidenceItem[]`, `isTargetMatch`, `stripThaiTitlePrefix`
- Produces: `ForensicLedgerRow[]`, `buildForensicLedgerRows(items, totalPages)`

- [ ] **Step 1: Write test for 13-column row generation**

```typescript
// digital-evidence/src/utils/__tests__/forensic-ledger-builder.test.ts
import { describe, it, expect } from "vitest";
import { buildForensicLedgerRows } from "../forensic-ledger-builder";
import type { StagedEvidenceItem } from "@/types/slip";

describe("Forensic 13-Columns Ledger Builder", () => {
  it("builds exact 13 columns with cleaned receiver name, fee, sha256, and duplicate status", () => {
    const mockItems: Partial<StagedEvidenceItem>[] = [
      {
        id: "item-1",
        category: "SLIP",
        isDuplicate: false,
        meta: {
          file_name: "slip1.jpg",
          sha256: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
          size_bytes: 1024,
          mime_type: "image/jpeg",
          extracted_at: "2026-09-28T00:00:00Z",
        },
        data: {
          document_type: "bank_transfer_slip",
          bank: { name: "ธนาคารกสิกรไทย", confidence: 0.99 },
          transaction: {
            date: "2026-01-23",
            time: "14:39",
            amount: 2000,
            fee: 0,
            reference_no: "REF123456",
            transaction_id: "REF123456",
            currency: "THB",
            note: null,
          },
          sender: { name: "นายสมชาย ใจดี", account_no: "123-4-56789-0", bank: "ธนาคารกสิกรไทย" },
          receiver: { name: "น.ส. จิณห์นิภา ประสาทเขตการ", account_no: "628-0-51764-0", bank: "ธนาคารกรุงศรีอยุธยา" },
          confidence: { date: 1, time: 1, amount: 1, reference_no: 1, sender_name: 1, receiver_name: 1, sender_account: 1, receiver_account: 1 },
          raw_text: [],
          warnings: [],
        },
      },
    ];

    const rows = buildForensicLedgerRows(mockItems as StagedEvidenceItem[]);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.no).toBe(1);
    expect(row.dateTime).toBe("2026-01-23 14:39");
    expect(row.senderName).toBe("นายสมชาย ใจดี");
    expect(row.senderAccount).toBe("123-4-56789-0");
    expect(row.receiverNameClean).toBe("จิณห์นิภา ประสาทเขตการ");
    expect(row.receiverAccount).toBe("628-0-51764-0");
    expect(row.bankName).toBe("ธนาคารกรุงศรีอยุธยา");
    expect(row.amount).toBe(2000);
    expect(row.fee).toBe(0);
    expect(row.referenceNo).toBe("REF123456");
    expect(row.sha256).toBe("abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");
    expect(row.duplicateStatus).toBe("✓ ไม่ซ้ำ (Unique)");
    expect(row.courtPageRef).toContain("หน้า");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/forensic-ledger-builder.test.ts`
Expected: FAIL ("cannot find module '../forensic-ledger-builder'")

- [ ] **Step 3: Implement `types/forensic-ledger.ts` & `utils/forensic-ledger-builder.ts`**

```typescript
// digital-evidence/src/types/forensic-ledger.ts
export interface ForensicLedgerRow {
  no: number;                       // ๑. ลำดับ (No.)
  dateTime: string;                 // ๒. วัน-เวลาทำรายการ (Date-Time)
  senderName: string;               // ๓. ผู้โอน (ต้นทาง) (Sender)
  senderAccount: string;            // ๔. เลขที่บัญชีต้นทาง (From Account)
  receiverNameClean: string;        // ๕. ผู้รับโอน (ปลายทาง) (Receiver / POI - 100% Cleaned)
  receiverAccount: string;          // ๖. เลขที่บัญชีปลายทาง (To Account)
  bankName: string;                 // ๗. ธนาคาร/สถาบันการเงิน (Bank)
  amount: number;                   // ๘. จำนวนเงินโอนสุทธิ (บาท) (Amount)
  fee: number;                      // ๙. ค่าธรรมเนียม (บาท) (Fee)
  referenceNo: string;              // ๑๐. รหัสอ้างอิงธุรกรรม (Txn Ref / ID)
  sha256: string;                   // ๑๑. แฮชพยานหลักฐาน (SHA-256)
  duplicateStatus: string;          // ๑๒. ผลตรวจสลิปซ้ำ (Duplicate Status)
  isDuplicate: boolean;
  courtPageRef: string;             // ๑๓. หน้าสำนวน/สถานะสัมพันธ์ (Court Page Ref)
}
```

```typescript
// digital-evidence/src/utils/forensic-ledger-builder.ts
import type { StagedEvidenceItem } from "@/types/slip";
import type { ForensicLedgerRow } from "@/types/forensic-ledger";
import { stripThaiTitlePrefix } from "@/utils/target-matcher";

export function buildForensicLedgerRows(
  stagedQueue: StagedEvidenceItem[],
  pdpaEnabled = false
): ForensicLedgerRow[] {
  const slipItems = stagedQueue.filter(
    (i) => (i.category === "SLIP" || (i.data?.transaction.amount && i.data.transaction.amount > 0)) && i.data
  );

  const seenRefs = new Map<string, number>();

  return slipItems.map((item, idx) => {
    const d = item.data!;
    const refNo = d.transaction.reference_no?.trim() || "-";
    const sha = item.meta?.sha256 || "-";

    // Detect duplicate reference number
    let duplicateStatus = "✓ ไม่ซ้ำ (Unique)";
    const isDup = !!item.isDuplicate;

    if (refNo !== "-" && seenRefs.has(refNo)) {
      duplicateStatus = `ซ้ำกับลำดับที่ ${seenRefs.get(refNo)}`;
    } else if (isDup) {
      duplicateStatus = "สลิปซ้ำ (ตัดยอด)";
    } else if (refNo !== "-") {
      seenRefs.set(refNo, idx + 1);
    }

    const rawReceiver = d.receiver.name?.trim() || "-";
    const cleanReceiver = rawReceiver !== "-" ? stripThaiTitlePrefix(rawReceiver) : "-";

    const senderName = d.sender.name?.trim() || "-";
    const senderAccount = d.sender.account_no?.trim() || "-";
    const receiverAccount = d.receiver.account_no?.trim() || "-";
    const bank = d.receiver.bank?.trim() || d.bank.name?.trim() || "พร้อมเพย์ / ธนาคาร";

    const dateStr = d.transaction.date || "";
    const timeStr = d.transaction.time || "";
    const dateTime = [dateStr, timeStr].filter(Boolean).join(" ") || "-";

    // Court Page Ref: A4 page sequence in court file
    const courtPageRef = `หน้า ${idx + 1} (สอดคล้อง 1:1)`;

    return {
      no: idx + 1,
      dateTime,
      senderName,
      senderAccount,
      receiverNameClean: cleanReceiver,
      receiverAccount,
      bankName: bank,
      amount: d.transaction.amount || 0,
      fee: d.transaction.fee || 0,
      referenceNo: refNo,
      sha256: sha,
      duplicateStatus,
      isDuplicate: isDup,
      courtPageRef,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/forensic-ledger-builder.test.ts`
Expected: PASS

---

### Task 2: CSV Exporter with UTF-8 BOM for Microsoft Excel

**Files:**
- Create: `digital-evidence/src/utils/csv-exporter.ts`
- Test: `digital-evidence/src/utils/__tests__/csv-exporter.test.ts`

**Interfaces:**
- Consumes: `ForensicLedgerRow[]`, `caseNumber`
- Produces: `exportLedgerToCsv(rows, caseNumber)` downloading `.csv` with `\uFEFF` prefix.

- [ ] **Step 1: Write test for CSV formatting and UTF-8 BOM encoding**

```typescript
// digital-evidence/src/utils/__tests__/csv-exporter.test.ts
import { describe, it, expect } from "vitest";
import { generate13ColumnsCsvString } from "../csv-exporter";
import type { ForensicLedgerRow } from "@/types/forensic-ledger";

describe("Forensic 13 Columns CSV Export", () => {
  it("generates CSV string with UTF-8 BOM and exact 13 headers", () => {
    const mockRows: ForensicLedgerRow[] = [
      {
        no: 1,
        dateTime: "2026-01-23 14:39",
        senderName: "นายสมชาย ใจดี",
        senderAccount: "123-4-56789-0",
        receiverNameClean: "จิณห์นิภา ประสาทเขตการ",
        receiverAccount: "628-0-51764-0",
        bankName: "กรุงศรี",
        amount: 2000,
        fee: 0,
        referenceNo: "REF123",
        sha256: "SHA256HASH",
        duplicateStatus: "✓ ไม่ซ้ำ (Unique)",
        isDuplicate: false,
        courtPageRef: "หน้า 1 (สอดคล้อง 1:1)",
      },
    ];

    const csvContent = generate13ColumnsCsvString(mockRows);
    expect(csvContent.startsWith("\uFEFF")).toBe(true);
    expect(csvContent).toContain("ลำดับ,วัน-เวลาทำรายการ,ผู้โอน (ต้นทาง),เลขที่บัญชีต้นทาง,ผู้รับโอน (ปลายทาง),เลขที่บัญชีปลายทาง,ธนาคาร/สถาบันการเงิน,จำนวนเงินโอนสุทธิ (บาท),ค่าธรรมเนียม (บาท),รหัสอ้างอิงธุรกรรม,แฮชพยานหลักฐาน (SHA-256),ผลตรวจสลิปซ้ำ,หน้าสำนวน/สถานะสัมพันธ์");
    expect(csvContent).toContain('"จิณห์นิภา ประสาทเขตการ"');
    expect(csvContent).toContain("2000.00");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/csv-exporter.test.ts`
Expected: FAIL ("cannot find module '../csv-exporter'")

- [ ] **Step 3: Implement `utils/csv-exporter.ts`**

```typescript
// digital-evidence/src/utils/csv-exporter.ts
import type { ForensicLedgerRow } from "@/types/forensic-ledger";

export function generate13ColumnsCsvString(rows: ForensicLedgerRow[]): string {
  const headers = [
    "ลำดับ",
    "วัน-เวลาทำรายการ",
    "ผู้โอน (ต้นทาง)",
    "เลขที่บัญชีต้นทาง",
    "ผู้รับโอน (ปลายทาง)",
    "เลขที่บัญชีปลายทาง",
    "ธนาคาร/สถาบันการเงิน",
    "จำนวนเงินโอนสุทธิ (บาท)",
    "ค่าธรรมเนียม (บาท)",
    "รหัสอ้างอิงธุรกรรม",
    "แฮชพยานหลักฐาน (SHA-256)",
    "ผลตรวจสลิปซ้ำ",
    "หน้าสำนวน/สถานะสัมพันธ์",
  ];

  const escapeCsv = (val: string | number) => {
    const str = String(val ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return `"${str}"`;
  };

  const csvRows = rows.map((r) => [
    r.no,
    escapeCsv(r.dateTime),
    escapeCsv(r.senderName),
    escapeCsv(`\t${r.senderAccount}`), // tab prefix preserves leading zero in Excel
    escapeCsv(r.receiverNameClean),
    escapeCsv(`\t${r.receiverAccount}`),
    escapeCsv(r.bankName),
    r.amount.toFixed(2),
    r.fee.toFixed(2),
    escapeCsv(r.referenceNo),
    escapeCsv(r.sha256),
    escapeCsv(r.duplicateStatus),
    escapeCsv(r.courtPageRef),
  ].join(","));

  return `\uFEFF${headers.join(",")}\n${csvRows.join("\n")}`;
}

export function download13ColumnsCsv(rows: ForensicLedgerRow[], caseNumber = "Case-Evidence"): void {
  const csvString = generate13ColumnsCsvString(rows);
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Forensic_Financial_Ledger_13_Columns_${caseNumber.replace(/\s+/g, "_")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/csv-exporter.test.ts`
Expected: PASS

---

### Task 3: Upgrade UI Ledger Modal to 13 Columns & Add CSV Export Button

**Files:**
- Modify: `digital-evidence/src/app/page.tsx:2400-2545`
- Test: Component visual & modal render test

**Interfaces:**
- Consumes: `buildForensicLedgerRows`, `download13ColumnsCsv`
- Produces: 13-column interactive table with column headers ๑ through ๑๓, Net Loss reconciliation footer, and "📥 ส่งออก CSV (13 คอลัมน์)" button.

- [ ] **Step 1: Update Modal Header and Table in `page.tsx`**

Replace legacy 10 columns table in `page.tsx` with:
```tsx
{/* Title */}
<h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
  <span>📊</span> ตารางสรุปเส้นทางการเงิน ๑๓ คอลัมน์ (Forensic Financial Ledger)
</h2>
<p className="text-xs text-slate-400 mt-0.5">
  บัญชีพยานหลักฐานทางการเงินมาตรฐานศาล เพื่อการพิจารณาคดีความผิดเกี่ยวกับอาชญากรรมทางเทคโนโลยีและเศรษฐกิจ
</p>

{/* 13-Column Table Header */}
<tr className="bg-sky-950/80 text-sky-300 font-bold border-b border-sky-500/40 text-[10px] whitespace-nowrap">
  <th className="p-2 text-center w-8">๑. ลำดับ</th>
  <th className="p-2">๒. วัน-เวลาทำรายการ</th>
  <th className="p-2">๓. ผู้โอน (ต้นทาง)</th>
  <th className="p-2">๔. เลขที่บัญชีต้นทาง</th>
  <th className="p-2 text-emerald-300">๕. ผู้รับโอน (ปลายทาง/POI)</th>
  <th className="p-2">๖. เลขที่บัญชีปลายทาง</th>
  <th className="p-2">๗. ธนาคาร</th>
  <th className="p-2 text-right">๘. ยอดเงินโอนสุทธิ (บาท)</th>
  <th className="p-2 text-right">๙. ค่าธรรมเนียม</th>
  <th className="p-2">๑๐. รหัสอ้างอิงธุรกรรม</th>
  <th className="p-2">๑๑. SHA-256 ลายนิ้วมือไฟล์</th>
  <th className="p-2 text-center">๑๒. ผลตรวจสลิปซ้ำ</th>
  <th className="p-2 text-center">๑๓. หน้าสำนวน/สัมพันธ์</th>
</tr>

{/* Table Body Mapping 13 Columns */}
{ledgerRows.map((r) => (
  <tr key={r.no} className={`hover:bg-white/5 transition-colors ${r.isDuplicate ? "bg-amber-500/10 text-amber-200" : "text-slate-200"}`}>
    <td className="p-2 text-center font-mono">{r.no}</td>
    <td className="p-2 font-mono whitespace-nowrap">{r.dateTime}</td>
    <td className="p-2">{pdpaEnabled ? maskPersonName(r.senderName, true) : r.senderName}</td>
    <td className="p-2 font-mono text-[10px]">{pdpaEnabled ? maskAccountNumber(r.senderAccount) : r.senderAccount}</td>
    <td className="p-2 font-semibold text-emerald-400">{pdpaEnabled ? maskPersonName(r.receiverNameClean, true) : r.receiverNameClean}</td>
    <td className="p-2 font-mono text-[10px]">{pdpaEnabled ? maskAccountNumber(r.receiverAccount) : r.receiverAccount}</td>
    <td className="p-2 text-sky-400">{r.bankName}</td>
    <td className="p-2 text-right font-mono font-bold text-emerald-400">฿ {r.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
    <td className="p-2 text-right font-mono text-slate-400">฿ {r.fee.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
    <td className="p-2 font-mono text-[9px] break-all">{r.referenceNo}</td>
    <td className="p-2 font-mono text-[8px] text-slate-400 max-w-[100px] truncate" title={r.sha256}>{r.sha256.slice(0, 12)}...</td>
    <td className="p-2 text-center">
      <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
        r.isDuplicate ? "bg-amber-500/20 text-amber-300 border border-amber-400/40" : "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40"
      }`}>
        {r.duplicateStatus}
      </span>
    </td>
    <td className="p-2 text-center font-mono text-[10px] text-sky-300">{r.courtPageRef}</td>
  </tr>
))}
```

- [ ] **Step 2: Add "📥 ส่งออก CSV (13 คอลัมน์)" Button to Modal Footer**

```tsx
<div className="flex gap-2.5">
  <button
    type="button"
    onClick={() => download13ColumnsCsv(ledgerRows, caseNumber)}
    className="btn-proportional-compact rounded-lg bg-emerald-600/30 border border-emerald-400/40 text-emerald-200 hover:bg-emerald-600/50 text-xs px-3 py-1.5 font-bold flex items-center gap-1.5"
  >
    📥 ส่งออก CSV (13 คอลัมน์)
  </button>
  <button
    type="button"
    onClick={() => window.print()}
    className="btn-proportional-compact rounded-lg bg-sky-600/30 border border-sky-400/40 text-sky-200 hover:bg-sky-600/50 text-xs px-3 py-1.5 font-bold"
  >
    🖨️ พิมพ์ตาราง ๑๓ คอลัมน์
  </button>
</div>
```

---

### Task 4: Upgrade Page 3 of Master Court Dossier (`MasterDossierFullBook.tsx`)

**Files:**
- Modify: `digital-evidence/src/components/MasterDossierFullBook.tsx:208-285`
- Test: Visual print preview check

**Interfaces:**
- Consumes: `ForensicLedgerRow[]`, `caseNumber`
- Produces: Professional A4 landscape printable court ledger matching 13 columns.

- [ ] **Step 1: Update Table in `MasterDossierFullBook.tsx`**

Update title:
`ตารางบัญชีนิติวิทยาศาสตร์และเส้นทางธุรกรรม ๑๓ คอลัมน์ (Forensic Financial Ledger)`
And update table columns from 7 to 13 court forensic columns.

---

### Task 5: End-to-End Verification & Browser Validation

**Files:**
- Test: Run `npm run build` in `d:\Project\Digital Evi\digital-evidence`
- Test: Open `http://localhost:3453/`, click "ตารางสรุปหลักฐาน (10 คน)" button
- Verify:
  1. Modal opens with title: "ตารางสรุปเส้นทางการเงิน ๑๓ คอลัมน์ (Forensic Financial Ledger)"
  2. All 13 columns render correctly with proper formatting.
  3. Clicking "📥 ส่งออก CSV (13 คอลัมน์)" downloads the `.csv` file.
  4. Open the downloaded CSV in Excel/text editor, verify UTF-8 BOM (`\uFEFF`) and Thai characters are perfectly legible.
  5. Court A4 Full Book Page 3 reflects the 13-column standard.

---
