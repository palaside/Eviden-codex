# Interactive Summary Cards & Evidence Metrics (Chat Mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the 4 KPI Summary Cards in the Right Panel into interactive toggle buttons with visual green/gray state indicators, link their active states directly to the Executive Summary document (excluding inactive metrics), and refine the metrics engine for Chat Mode (Total Slips Sum = Sum of All Detected Names, Target POI Sum from active checkboxes only, Correlated Chat A4 Page Mapping, and Net Duplicate Deduplication).

**Architecture:** 
1. Introduce `summaryCardsActive` state in `page.tsx` managing boolean toggle status (`card1_total`, `card2_poi`, `card3_corroborated`, `card4_dedup`).
2. Style the 4 cards as tactile, interactive toggle buttons: Green glow/border for Active (`true`), Muted slate-gray with reduced opacity for Inactive (`false`).
3. Update `ExecutiveSummarySheet.tsx` and `MasterDossierFullBook.tsx` to receive active card states and conditionally omit / suppress unselected metrics from court executive summaries.
4. Refactor Chat Mode metrics aggregation: Guarantee Card 1 matches the grand total of all detected persons in the left column, Card 2 filters strictly by checked POIs, Card 3 tracks precise A4 page placement of embedded chat slips, and Card 4 quantifies deduplicated transactions.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, HTML5 Canvas, Vitest / Playwright.

## Global Constraints

- Response language: Thai.
- Follow disciplines from `debugging-skill`, `change-impact-analysis`, and `scoped-bug-fix`.
- Token discipline: Keep edits clean, modular, and non-destructive to existing layouts.
- Left column detected POI checkboxes MUST remain unchecked (`selected: false`) by default.
- Default state for the 4 summary toggle cards is **Active (`true`)** with vibrant green status indicators. Clicking any card toggles it to **Inactive (`false`)** with muted gray status.
- When an executive summary is printed or viewed, metrics belonging to inactive cards MUST NOT be filled into the document.

---

### Task 1: Type Definitions & Interactive Summary Cards State Engine

**Files:**
- Create: `digital-evidence/src/types/summary-cards.ts`
- Modify: `digital-evidence/src/app/page.tsx:980-1010`
- Test: `digital-evidence/src/types/__tests__/summary-cards.test.ts`

**Interfaces:**
- Consumes: `ForensicEvidenceState` from `@/constants/forensic-ssot`
- Produces: `SummaryCardToggleState`, `SummaryCardKey`

- [ ] **Step 1: Write test for summary cards toggle state logic**

```typescript
// digital-evidence/src/types/__tests__/summary-cards.test.ts
import { describe, it, expect } from "vitest";
import { defaultSummaryCardsState, toggleCardState } from "../summary-cards";

describe("Summary Cards State Management", () => {
  it("initializes all 4 cards as active (true) by default", () => {
    expect(defaultSummaryCardsState).toEqual({
      card1_total: true,
      card2_poi: true,
      card3_corroborated: true,
      card4_dedup: true,
    });
  });

  it("toggles card state from active to inactive and vice versa", () => {
    const toggled = toggleCardState(defaultSummaryCardsState, "card1_total");
    expect(toggled.card1_total).toBe(false);
    expect(toggled.card2_poi).toBe(true);

    const reToggled = toggleCardState(toggled, "card1_total");
    expect(reToggled.card1_total).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/types/__tests__/summary-cards.test.ts`
Expected: FAIL ("cannot find module '../summary-cards'")

- [ ] **Step 3: Create summary cards state type definitions and toggle helper**

```typescript
// digital-evidence/src/types/summary-cards.ts
export type SummaryCardKey = "card1_total" | "card2_poi" | "card3_corroborated" | "card4_dedup";

export interface SummaryCardToggleState {
  card1_total: boolean;
  card2_poi: boolean;
  card3_corroborated: boolean;
  card4_dedup: boolean;
}

export const defaultSummaryCardsState: SummaryCardToggleState = {
  card1_total: true,
  card2_poi: true,
  card3_corroborated: true,
  card4_dedup: true,
};

export function toggleCardState(
  state: SummaryCardToggleState,
  key: SummaryCardKey
): SummaryCardToggleState {
  return {
    ...state,
    [key]: !state[key],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/types/__tests__/summary-cards.test.ts`
Expected: PASS

- [ ] **Step 5: Integrate state into `digital-evidence/src/app/page.tsx`**

```typescript
// In digital-evidence/src/app/page.tsx
import { defaultSummaryCardsState, toggleCardState, type SummaryCardToggleState, type SummaryCardKey } from "@/types/summary-cards";

// Inside Home component:
const [summaryCards, setSummaryCards] = useState<SummaryCardToggleState>(defaultSummaryCardsState);

const handleToggleSummaryCard = (key: SummaryCardKey) => {
  setSummaryCards((prev) => toggleCardState(prev, key));
};
```

---

### Task 2: Refactor Right Panel Cards into Interactive Toggle Buttons with Green/Gray Visual States

**Files:**
- Modify: `digital-evidence/src/app/page.tsx:1970-2050`
- Test: Manual visual inspection & component click test

**Interfaces:**
- Consumes: `summaryCards`, `handleToggleSummaryCard`
- Produces: Interactive `<button>` UI elements with dynamic styling for Active (`bg-emerald-400`, emerald borders) vs Inactive (`bg-slate-500`, slate borders, opacity-50)

- [ ] **Step 1: Write unit test for card toggle rendering**

```typescript
// digital-evidence/src/components/__tests__/SummaryCardsUI.test.tsx
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

describe("Summary Cards Toggle UI", () => {
  it("renders active card with green status indicator and fires toggle on click", () => {
    const handleToggle = vi.fn();
    // Verify toggle callback triggers upon clicking Card 1
  });
});
```

- [ ] **Step 2: Update the 4 Cards in `page.tsx` from static `<div>` to interactive `<button>`**

Transform the JSX in `page.tsx`:
```tsx
{/* Card 1: 1. ยอดรวม */}
<button
  type="button"
  onClick={() => handleToggleSummaryCard("card1_total")}
  className={`glass-card p-3 rounded-xl flex flex-col justify-between text-left transition-all cursor-pointer ${
    summaryCards.card1_total
      ? "border-emerald-500/50 bg-emerald-950/20 shadow-[0_0_12px_rgba(52,211,153,0.15)]"
      : "border-white/5 bg-black/30 opacity-50 grayscale hover:opacity-75"
  }`}
  title={summaryCards.card1_total ? "คลิกเพื่อปิด (ไม่นำลงสรุปผู้บริหาร)" : "คลิกเพื่อเปิด (นำลงสรุปผู้บริหาร)"}
>
  <div className="flex items-center justify-between">
    <span className="text-[11px] font-bold text-slate-300">1. ยอดรวม</span>
    <span className={`w-2.5 h-2.5 rounded-full transition-all ${
      summaryCards.card1_total
        ? "bg-emerald-400 shadow-[0_0_8px_#34d399]"
        : "bg-slate-500"
    }`} />
  </div>
  <div className={`font-mono text-base font-bold mt-1 truncate ${
    summaryCards.card1_total ? "text-emerald-400" : "text-slate-400 line-through"
  }`}>
    {chatMetrics.rawTotalDisplay}
  </div>
  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
    <span>สลิปในแชท: {chatMetrics.slipInChatCount} ใบ</span>
    <span className={`text-[9px] font-mono px-1 py-0.5 rounded border ${
      summaryCards.card1_total
        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
        : "text-slate-500 bg-slate-800/40 border-slate-700"
    }`}>
      {summaryCards.card1_total ? "เปิด" : "ปิด"}
    </span>
  </div>
</button>

{/* Card 2: 2. ยอดเป้าหมาย */}
<button
  type="button"
  onClick={() => handleToggleSummaryCard("card2_poi")}
  className={`glass-card p-3 rounded-xl flex flex-col justify-between text-left transition-all cursor-pointer ${
    summaryCards.card2_poi
      ? "border-sky-500/50 bg-sky-950/20 shadow-[0_0_12px_rgba(56,189,248,0.15)]"
      : "border-white/5 bg-black/30 opacity-50 grayscale hover:opacity-75"
  }`}
  title={summaryCards.card2_poi ? "คลิกเพื่อปิด (ไม่นำลงสรุปผู้บริหาร)" : "คลิกเพื่อเปิด (นำลงสรุปผู้บริหาร)"}
>
  <div className="flex items-center justify-between">
    <span className="text-[11px] font-bold text-slate-300">2. ยอดเป้าหมาย</span>
    <span className={`w-2.5 h-2.5 rounded-full transition-all ${
      summaryCards.card2_poi
        ? "bg-emerald-400 shadow-[0_0_8px_#34d399]"
        : "bg-slate-500"
    }`} />
  </div>
  <div className={`font-mono text-base font-bold mt-1 truncate ${
    summaryCards.card2_poi ? "text-sky-400" : "text-slate-400 line-through"
  }`}>
    ฿ {selectedPoiMetrics.totalAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
  </div>
  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
    <span className="truncate max-w-[95px]">
      {selectedTargetItems.length > 0
        ? selectedTargetItems.map((t) => t.cleanName).join(", ")
        : "ยังไม่เลือก (฿0.00)"}
    </span>
    <span className={`text-[9px] font-mono px-1 py-0.5 rounded border ${
      summaryCards.card2_poi
        ? "text-sky-400 bg-sky-500/10 border-sky-500/30"
        : "text-slate-500 bg-slate-800/40 border-slate-700"
    }`}>
      {summaryCards.card2_poi ? `POI (${selectedTargetItems.length})` : "ปิด"}
    </span>
  </div>
</button>

{/* Card 3: 3. หน้าสัมพันธ์ */}
<button
  type="button"
  onClick={() => handleToggleSummaryCard("card3_corroborated")}
  className={`glass-card p-3 rounded-xl flex flex-col justify-between text-left transition-all cursor-pointer ${
    summaryCards.card3_corroborated
      ? "border-teal-500/50 bg-teal-950/20 shadow-[0_0_12px_rgba(45,212,191,0.15)]"
      : "border-white/5 bg-black/30 opacity-50 grayscale hover:opacity-75"
  }`}
  title={summaryCards.card3_corroborated ? "คลิกเพื่อปิด (ไม่นำลงสรุปผู้บริหาร)" : "คลิกเพื่อเปิด (นำลงสรุปผู้บริหาร)"}
>
  <div className="flex items-center justify-between">
    <span className="text-[11px] font-bold text-slate-300">3. หน้าสัมพันธ์</span>
    <span className={`w-2.5 h-2.5 rounded-full transition-all ${
      summaryCards.card3_corroborated
        ? "bg-emerald-400 shadow-[0_0_8px_#34d399]"
        : "bg-slate-500"
    }`} />
  </div>
  <div className={`font-mono text-base font-bold mt-1 ${
    summaryCards.card3_corroborated ? "text-teal-300" : "text-slate-400 line-through"
  }`}>
    {chatA4Mapping.pageLabelsDisplay || "หน้า 1"}
  </div>
  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
    <span>ตำแหน่งบล็อกสลิป</span>
    <span className={`text-[9px] font-mono px-1 py-0.5 rounded border ${
      summaryCards.card3_corroborated
        ? "text-teal-400 bg-teal-500/10 border-teal-500/30"
        : "text-slate-500 bg-slate-800/40 border-slate-700"
    }`}>
      {summaryCards.card3_corroborated ? "PAGE" : "ปิด"}
    </span>
  </div>
</button>

{/* Card 4: 4. สลิปซ้ำ (NET) */}
<button
  type="button"
  onClick={() => handleToggleSummaryCard("card4_dedup")}
  className={`glass-card p-3 rounded-xl flex flex-col justify-between text-left transition-all cursor-pointer ${
    summaryCards.card4_dedup
      ? "border-amber-500/50 bg-amber-950/20 shadow-[0_0_12px_rgba(251,191,36,0.15)]"
      : "border-white/5 bg-black/30 opacity-50 grayscale hover:opacity-75"
  }`}
  title={summaryCards.card4_dedup ? "คลิกเพื่อปิด (ไม่นำลงสรุปผู้บริหาร)" : "คลิกเพื่อเปิด (นำลงสรุปผู้บริหาร)"}
>
  <div className="flex items-center justify-between">
    <span className="text-[11px] font-bold text-slate-300">4. สลิปซ้ำ (NET)</span>
    <span className={`w-2.5 h-2.5 rounded-full transition-all ${
      summaryCards.card4_dedup
        ? "bg-emerald-400 shadow-[0_0_8px_#34d399]"
        : "bg-slate-500"
    }`} />
  </div>
  <div className={`font-mono text-base font-bold mt-1 ${
    summaryCards.card4_dedup ? "text-amber-400" : "text-slate-400 line-through"
  }`}>
    {evidenceState.duplicateCount} จุด
  </div>
  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
    <span>ตัดยอดสุทธิ</span>
    <span className={`text-[9px] font-mono px-1 py-0.5 rounded border ${
      summaryCards.card4_dedup
        ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
        : "text-slate-500 bg-slate-800/40 border-slate-700"
    }`}>
      {summaryCards.card4_dedup ? "DEDUP" : "ปิด"}
    </span>
  </div>
</button>
```

- [ ] **Step 3: Verify toggle interactions in local development server**

---

### Task 3: Metrics Engine Refinement for Chat Mode (Total = Sum of All Detected, Target = Checked Only, Page Mapping, Net Duplicate)

**Files:**
- Modify: `digital-evidence/src/app/page.tsx:1000-1160`
- Test: `digital-evidence/src/utils/__tests__/chat-metrics.test.ts`

**Interfaces:**
- Consumes: `stagedQueue`, `detectedNamesList`, `selectedTargetItems`
- Produces:
  - `chatMetrics.rawTotalAmount` & `chatMetrics.rawTotalDisplay`
  - `selectedPoiMetrics.totalAmount` & `selectedPoiMetrics.count`
  - `chatA4Mapping.pageLabelsDisplay` (e.g., "หน้า 1, 2")
  - `dedupMetrics.duplicateCount`

- [ ] **Step 1: Write test for Chat Metrics calculation**

```typescript
// digital-evidence/src/utils/__tests__/chat-metrics.test.ts
import { describe, it, expect } from "vitest";

describe("Chat Mode Metrics Calculation", () => {
  it("Card 1 matches exact sum of all detected names in left column", () => {
    const detectedNames = [
      { cleanName: "จิณห์นิภา ประสาทเขตการ", totalAmount: 2000, txCount: 1 },
      { cleanName: "สมชาย รักสงบ", totalAmount: 1500, txCount: 1 },
    ];
    const total = detectedNames.reduce((acc, cur) => acc + cur.totalAmount, 0);
    expect(total).toBe(3500);
  });

  it("Card 2 sums ONLY actively checked target persons, 0 if none checked", () => {
    const targetList = [
      { cleanName: "จิณห์นิภา ประสาทเขตการ", totalAmount: 2000, selected: false },
    ];
    const checkedTotal = targetList
      .filter((t) => t.selected)
      .reduce((acc, cur) => acc + cur.totalAmount, 0);
    expect(checkedTotal).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify behavior**

Run: `npx vitest run src/utils/__tests__/chat-metrics.test.ts`
Expected: PASS

- [ ] **Step 3: Implement exact calculation bindings in `page.tsx`**

1. **Card 1 (ยอดรวม):**
   ```typescript
   const chatTotalMetrics = useMemo(() => {
     // Grand sum across all detected persons in the left column
     const sumFromDetected = detectedNamesList.reduce((acc, p) => acc + (p.totalAmount || 0), 0);
     const countFromDetected = detectedNamesList.reduce((acc, p) => acc + (p.txCount || 0), 0);
     
     // Fallback to staged slip items if detectedNamesList has not yet synced
     let slipInChatCount = countFromDetected;
     if (slipInChatCount === 0) {
       slipInChatCount = stagedQueue.filter(
         (i) => i.category === "SLIP" || (i.data?.transaction.amount && i.data.transaction.amount > 0)
       ).length;
     }

     return {
       rawTotalAmount: sumFromDetected,
       rawTotalDisplay: `฿ ${sumFromDetected.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`,
       slipInChatCount: Math.max(slipInChatCount, detectedNamesList.length),
     };
   }, [detectedNamesList, stagedQueue]);
   ```

2. **Card 2 (ยอดเป้าหมาย):**
   ```typescript
   const selectedPoiMetrics = useMemo(() => {
     // Strictly matches checked POIs only. Returns 0 if none are checked.
     if (selectedTargetItems.length === 0) {
       return { totalAmount: 0, count: 0 };
     }
     const totalAmount = selectedTargetItems.reduce((acc, t) => acc + (t.totalAmount || 0), 0);
     const count = selectedTargetItems.reduce((acc, t) => acc + (t.txCount || 0), 0);
     return { totalAmount, count };
   }, [selectedTargetItems]);
   ```

3. **Card 3 (หน้าสัมพันธ์):**
   ```typescript
   const chatA4Mapping = useMemo(() => {
     // Find the A4 page number where the slip image was placed after Quiet Zone slicing
     // E.g., if page 1 contains the slip, return "หน้า 1"
     const slipPages: number[] = [];
     stagedQueue.forEach((item, itemIdx) => {
       if (item.category === "SLIP" || (item.data?.transaction.amount && item.data.transaction.amount > 0)) {
         slipPages.push(itemIdx + 1);
       }
     });
     const uniquePages = Array.from(new Set(slipPages));
     return {
       pages: uniquePages,
       pageLabelsDisplay: uniquePages.length > 0 ? uniquePages.map((p) => `หน้า ${p}`).join(", ") : "หน้า 1",
     };
   }, [stagedQueue]);
   ```

---

### Task 4: Connect Active Card Filters to Executive Summary Sheet & Master Dossier

**Files:**
- Modify: `digital-evidence/src/components/ExecutiveSummarySheet.tsx`
- Modify: `digital-evidence/src/components/MasterDossierFullBook.tsx:190-205`
- Modify: `digital-evidence/src/app/page.tsx:2130-2160, 2450-2525`
- Test: Component rendering verification

**Interfaces:**
- Consumes: `summaryCards: SummaryCardToggleState`
- Produces: Filtered Executive Summary view where inactive card sections are cleanly omitted/blanked out.

- [ ] **Step 1: Update `ExecutiveSummarySheet.tsx` interface to accept `summaryCards`**

```typescript
// digital-evidence/src/components/ExecutiveSummarySheet.tsx
import type { SummaryCardToggleState } from "@/types/summary-cards";

interface Props {
  evidence: ForensicEvidenceState;
  caseNumber: string;
  suspectName?: string;
  summaryCards?: SummaryCardToggleState; // Optional for backward compatibility, defaults to all true
  chatPageMapping?: string;
}
```

- [ ] **Step 2: Conditionally render or omit sections based on `summaryCards`**

```tsx
{/* 3 Core Metric KPI Blocks */}
<div className="grid grid-cols-3 gap-3 my-4">
  {summaryCards?.card1_total ? (
    <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded text-center">
      <div className="text-xs text-emerald-800 font-semibold">ยอดความเสียหายรวมแห่งคดี (Total Loss)</div>
      <div className="font-mono text-2xl font-bold text-emerald-700 mt-1">
        ฿ {evidence.totalNetLoss.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
      </div>
      <div className="text-[10px] text-emerald-600 mt-0.5">รวมสลิปที่ตรวจพบในคดีทั้งหมด</div>
    </div>
  ) : (
    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded text-center opacity-40">
      <div className="text-xs text-slate-500 font-semibold">ยอดความเสียหายรวมแห่งคดี</div>
      <div className="font-mono text-lg text-slate-400 mt-1">- ไม่ระบุในสรุป -</div>
      <div className="text-[10px] text-slate-400 mt-0.5">ปิดการแสดงผลตามคำสั่ง</div>
    </div>
  )}

  {summaryCards?.card3_corroborated ? (
    <div className="p-3.5 bg-purple-50 border border-purple-300 rounded text-center">
      <div className="text-xs text-purple-800 font-semibold">ความสอดคล้อง แชท ⇋ สลิป</div>
      <div className="font-mono text-2xl font-bold text-purple-700 mt-1">
        {chatPageMapping || "หน้า 1"}
      </div>
      <div className="text-[10px] text-purple-600 mt-0.5">ตำแหน่งหน้าพยานหลักฐานในสำนวน</div>
    </div>
  ) : (
    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded text-center opacity-40">
      <div className="text-xs text-slate-500 font-semibold">ความสอดคล้อง แชท ⇋ สลิป</div>
      <div className="font-mono text-lg text-slate-400 mt-1">- ไม่ระบุในสรุป -</div>
      <div className="text-[10px] text-slate-400 mt-0.5">ปิดการแสดงผลตามคำสั่ง</div>
    </div>
  )}

  {summaryCards?.card4_dedup ? (
    <div className="p-3.5 bg-sky-50 border border-sky-300 rounded text-center">
      <div className="text-xs text-sky-800 font-semibold">การตัดยอดสลิปซ้ำ (NET)</div>
      <div className="font-mono text-2xl font-bold text-sky-700 mt-1">
        {evidence.duplicateCount > 0 ? `${evidence.duplicateCount} จุดซ้ำ` : "0 (ไม่ซ้ำ)"}
      </div>
      <div className="text-[10px] text-sky-600 mt-0.5">ตัดยอดซ้ำซ้อนออกแล้ว 100%</div>
    </div>
  ) : (
    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded text-center opacity-40">
      <div className="text-xs text-slate-500 font-semibold">การตัดยอดสลิปซ้ำ (NET)</div>
      <div className="font-mono text-lg text-slate-400 mt-1">- ไม่ระบุในสรุป -</div>
      <div className="text-[10px] text-slate-400 mt-0.5">ปิดการแสดงผลตามคำสั่ง</div>
    </div>
  )}
</div>

{/* Suspect / POI Financial Destination */}
{summaryCards?.card2_poi ? (
  <div className="mt-4 p-4 border border-slate-300 rounded bg-slate-50 text-xs">
    <h2 className="font-bold text-slate-900 text-sm mb-2 flex items-center gap-1.5">
      <span>🎯</span> สรุปเส้นทางเงินไหลสู่บุคคลเป้าหมาย / บัญชีม้าหลัก (Top Recipient)
    </h2>
    <div className="grid grid-cols-2 gap-3 leading-relaxed">
      <div>
        <span className="text-slate-600 font-medium">ชื่อบุคคลเป้าหมาย / ผู้รับโอน: </span>
        <span className="font-bold text-slate-900">{suspectName || evidence.poiName || "ยังไม่มีข้อมูล"}</span>
      </div>
      <div>
        <span className="text-slate-600 font-medium">มูลค่าความเสียหายเฉพาะบุคคลนี้: </span>
        <span className="font-mono font-bold text-emerald-700">
          ฿ {evidence.poiLossSum.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
        </span>
      </div>
    </div>
  </div>
) : (
  <div className="mt-4 p-3 border border-dashed border-slate-200 rounded bg-slate-50/50 text-xs text-slate-400 text-center italic">
    * ส่วนข้อมูลบุคคลเป้าหมายถูกปิดไว้ — ไม่นำมากรอกลงในเอกสารสรุปผู้บริหาร
  </div>
)}
```

- [ ] **Step 3: Pass `summaryCards` down from `page.tsx` through `MasterDossierFullBook.tsx`**

Update `MasterDossierFullBook.tsx` props and `ExecutiveSummarySheet` call.

---

### Task 5: End-to-End Verification & Evidence Table Synchronization

**Files:**
- Modify: `digital-evidence/src/app/page.tsx`
- Test: Browser verification on `http://localhost:3453/`

- [ ] **Step 1: Check build & static analysis**

Run: `npm run build` in `d:\Project\Digital Evi\digital-evidence`
Expected: Build passes with 0 type errors.

- [ ] **Step 2: Test User Flow in Browser**
1. Open `http://localhost:3453/`
2. Confirm:
   - Checkbox for detected POI is empty/unchecked by default.
   - The 4 cards start with active green indicators.
   - Clicking Card 1 turns its indicator gray, strikes through the amount, and marks badge as "ปิด".
   - Clicking "⚖️ สรุปผู้บริหาร" tab confirms that the unselected metric is cleanly omitted from the Executive Summary Sheet.
   - Re-clicking Card 1 restores its active green state and restores the metric to the Executive Summary.
   - Card 1 value equals the sum of all detected names in the left column.
   - Card 2 value equals ฿0.00 until a checkbox in the left column is checked.
   - Card 3 displays the exact A4 page number where the slip in the chat is placed.
   - Card 4 displays duplicate count with NET reconciliation.

---
