# Evidence Timeline Modal Design

## Goal

Turn the existing chat-to-slip linkage modal into an evidence-first Timeline story. A user should understand why the application suggests that two items may be related and be able to inspect the source evidence without the application asserting a conclusion.

## Scope

- Reuse the existing linkage modal, its candidate list, source images, provenance, and current review states.
- Open the modal from the existing linkage action under `03 สรุปข้อมูลตรวจสอบ`, positioned before the four summary cards.
- Present candidate events in time order and make source evidence directly inspectable.
- Keep all candidates visible with explicit status labels. Only human-confirmed records count toward confirmed totals.
- Keep the current candidate-generation and export behavior unless a targeted incompatibility is found.
- Card-specific Timeline filters are a later iteration and are out of scope for this change.

## User experience

The modal title is `Timeline · ลำดับเหตุการณ์และหลักฐานที่เกี่ยวข้อง`. It begins with a short, non-conclusive explanation. Example:

> ระบบพบจุดที่อาจเกี่ยวข้องกัน: แชทวันที่ 9 มิ.ย. มีข้อความ “คืน 9/6 ยอด 15000” และพบสลิปวันที่ 8 มิ.ย. ยอด 15,000 บาท ระบบเสนอให้ตรวจจากคำว่า “คืน” และวันที่ใกล้กัน ข้อมูลนี้ยังไม่ยืนยันว่าเป็นการคืนเงินหรือเป็นธุรกรรมเดียวกัน

The explanation must be assembled only from evidence actually available for the candidate. If the text, date, amount, or other basis is missing, omit that claim and say what is unavailable. Date proximity and keyword overlap are reasons to review, never proof of a relationship or intent. Do not invent a confidence score.

Each candidate is shown as a chronological story containing:

1. A chat event, when present: date/time, OCR text excerpt, chat page, source file, and source image.
2. A visible candidate connector with status `candidate · review_required` unless existing persisted review state says otherwise.
3. A slip event: transaction date/time, extracted amount/reference as available, dossier page, source file, and slip image/crop.
4. Evidence-basis labels such as `พบคำว่า “คืน”`, `ยอดตรงกัน`, `Ref ตรงกัน`, or `เวลาใกล้กัน`, only when the existing candidate actually supports that basis.

Source images and page provenance remain visible and openable. Missing OCR or source references are labeled as unavailable; they are not inferred. Conflicts and review-required fields remain marked for human review.

## Interaction and status semantics

- The close button closes the modal without changing evidence or review state.
- Existing review actions, if present for a candidate, retain their current semantics and persistence. The Timeline adds no automatic confirmation, rejection, or ledger mutation.
- Candidate, conflict, review-required, and human-reviewed states have distinct visible labels.
- Confirmed totals remain based only on user-confirmed records.
- Existing review-packet export remains available and continues to identify candidates as unconfirmed.

## Layout

- Reuse the current large modal and dark glass visual language.
- Header: title, short status description, close action.
- Intro panel: concise rationale and an always-visible non-confirmation notice.
- Body: vertically ordered timeline entries; paired evidence is connected visually without implying a confirmed relationship.
- Each entry uses a compact metadata row and a source-evidence area. On wide screens, chat and slip source previews may sit side-by-side; on narrow screens they stack.
- Keep the modal body scrollable, while keeping the header and close control visible.

## Data flow

Existing OCR groups, slip ledger records, chat-to-slip candidates, source references, and review state feed the modal. Presentation may format existing values and selectively omit unavailable values, but it must not alter the OCR record, candidate score/basis, provenance, or confirmation state.

## Failure and empty states

- No candidates: explain that no chat/slip candidate is currently available and retain any existing source-processing warnings.
- Missing chat source, page, image, or crop: show a specific unavailable-evidence placeholder for that side.
- Missing/invalid timestamp: show the event under an `เวลาไม่ระบุ` section after chronologically sortable events.
- Conflicting or unclear OCR: preserve raw candidate evidence and display `conflict` or `review_required`.

## Acceptance criteria

1. The existing linkage action opens the Timeline modal and the old table-only presentation is replaced by a chronological story presentation.
2. Each narrative statement is traceable to candidate data; keyword/time proximity is phrased as a suggestion, not a conclusion.
3. Candidate, conflict, review-required, and human-reviewed statuses remain distinguishable.
4. Available source page/file/image evidence is shown alongside its event; missing evidence is labeled rather than guessed.
5. Opening/closing the modal does not change candidate, confirmation, or financial-total state.
6. Existing review-packet export remains available and does not treat candidates as confirmed.
7. Card-driven Timeline filters are not added in this iteration.

## Alternatives considered

1. **Extend the existing linkage modal into Timeline (selected):** reuses candidate data, previews, and export, reducing duplicate UI and state.
2. Add a separate Timeline modal and keep linkage modal: clearer separation but duplicates evidence and review surfaces.
3. Show a narrative-only summary: fastest to scan but weak for provenance and source verification.

## Risks and constraints

- Timestamps may have different sources or missing precision; ordering must not imply more temporal certainty than the source provides.
- OCR keyword evidence may be noisy; retain raw text and review labels.
- Do not automatically link chat messages to transfers, infer repayment/loan intent, or include unconfirmed candidates in confirmed sums.
- This design changes the UI only; it does not revise OCR, matching thresholds, legal-signal rules, IndexedDB persistence, API providers, or export formats.
