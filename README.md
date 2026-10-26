# Digital Evi - Codex

## Purpose

Workspace for organizing digital evidence, processing chat and bank-slip images, reviewing OCR/QR-derived candidates, and preparing evidence documents. Automated extraction is decision support; uncertain values remain pending human review.

## Project Layout

| Path | Role |
| --- | --- |
| `src/`, `scripts/`, `package.json` | Active root Next.js 16 / React 19 application, TypeScript UI, local OCR/QR pipeline, legal signal scan, tests, and export routes. |
| `digital-evidence/` | Alternate/legacy checkout; do not use for the active runtime unless a task explicitly names it. |
| `core/`, root `scripts/`, `static/` | Python/PIL and legacy evidence-processing components. Their relationship to the browser OCR path is not assumed. |
| `docs/`, root `PROJECT_STATUS.md`, `PROJECT_FLOW.md` | Plans, current evidence-based status, and system flow. |
| `skills/`, `.agents/` | Agent guidance and project skills; these documents are not runtime hooks by themselves. |
| `For Test/`, `For Test Results/`, `RAW/`, `RAWFILE/` | Evidence fixtures and user/runtime data. Preserve unless cleanup is separately requested. |
| `_workspaces/` | Alternate copies. Confirm the intended checkout before editing. |

## Current Focus

The latest verified UI flow separates a user-reviewed recipient name from the original OCR conflict, persists that review with its source queue, and restores it after reload without confirming financial data. Details, test evidence, and remaining limits are in [PROJECT_STATUS.md](PROJECT_STATUS.md). The browser flow is documented in [PROJECT_FLOW.md](PROJECT_FLOW.md).

## Run the Web App

```powershell
Set-Location "D:\Project\Digital Evi - Codex"
npm run dev
```

Use the URL/port printed by Next.js; do not assume a previously used port serves the current checkout.

## Resume Work

1. Read root `AGENTS.md` and `digital-evidence/AGENTS.md`.
2. Read `PROJECT_STATUS.md` for verified behavior and open gaps.
3. Confirm the active app copy, runtime, and evidence inputs before reproducing a defect.
4. Preserve source images, hashes, raw OCR, QR evidence, coordinates, and uncertainty. Add focused regression coverage before changing extraction logic.
5. Keep OCR conflicts, user-reviewed values, and explicit ledger confirmation as distinct states.
