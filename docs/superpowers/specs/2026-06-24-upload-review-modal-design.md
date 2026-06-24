# Reg & FTDs — Unified Upload Review Modal (junk-row tolerance + dupe-date guard)

**Date:** 2026-06-24
**Status:** Design approved, pending spec review
**Area:** `src/components/views/RegFtdsView.tsx`, `src/lib/regFtdsAuthority.ts`, `src/components/ui/IpAuthorityModal.tsx`
**Builds on:** [2026-06-24-reg-ftds-ip-authority-design.md](2026-06-24-reg-ftds-ip-authority-design.md) (the confirm-before-save modal this extends)

---

## Problem

Two recurring upload pain points, both observed in the client's real files this session:

1. **Junk rows hard-block the whole upload.** Every Campaign Stats file carries a stray `Ethan` row with a blank IP and no metrics. The current validator treats any blank-IP row as `missingIp` and rejects the entire file, forcing a manual edit of every file before it will upload.

2. **Accidental duplicate-date uploads.** The same data has been re-uploaded under near-identical filenames (`-02-06` vs `- 02-06`), producing duplicate records (the legacy Feb date-misparse rows were exactly this — the same June-2 data stored twice). Uploads silently replace-by-date, so there is no prompt when an upload would overwrite existing dates.

Note: a third candidate — date-misparse detection — was investigated and dropped. The current strict parser (Excel date cells or `yyyy-mm-dd` text only) already rejects ambiguous text dates, so that class cannot recur. Only the two issues above remain.

---

## Goal

Stop good uploads from being blocked by harmless junk rows, and warn before overwriting existing dates — by extending the existing confirm-before-save modal into a single "review before upload" surface.

Non-goals (YAGNI):
- No full extraction/rewrite of the existing validation block (dates, IPv4, missing-field, ESP checks stay inline and unchanged).
- No date-misparse guard (already handled by the strict parser).
- No per-row accept/reject — the modal stays all-or-nothing (Proceed / Cancel), consistent with the IP-authority feature.

---

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Which rows are auto-skipped vs blocking | **No-data rows only.** Skip a blank-IP row only if it also has no registrations and no FTDs. A blank-IP row carrying a nonzero metric still hard-blocks (never silently drop real numbers). |
| When does the dupe-date prompt appear | **Always on overwrite.** Any upload that would replace existing dates opens the modal, even if otherwise clean. |
| Where the new logic lives | **Approach A:** new pure, unit-tested helpers in `regFtdsAuthority.ts`; `RegFtdsView` composes them into one `UploadReview`. The existing inline validations and `buildUploadPlan` are not rewritten. |

---

## Architecture & Data Flow

The flow keeps its shape. Two changes in the validator, one new pre-modal computation, two new modal sections.

```
parse rows
  → validate:
      hard-block issues? (bad/missing date, invalid IPv4, missing-field WITH data,
                          unknown ESP on unregistered IP) → reject as today
      no-data rows (blank IP, no reg, no ftd)             → collect into skippedRows (warn, not block)
  → aggregate rows (already skips rows without date/esp/ip)
  → fetch ip_matrix → buildUploadPlan → { corrections, unknowns, ambiguous }   (unchanged)
  → computeDateOverwrites(uploadDates, existingDates-from-store)                 (NEW)
  → assemble UploadReview { corrections, unknowns, ambiguous, skippedRows, dateOverwrites, hasIssues }
  → hasIssues ? open modal : commitUpload(rows, filename, fileRowCount)
  → modal Proceed → applyCorrections(rows, corrections) → commitUpload
            Cancel → nothing written
```

`existingDates` come from the Zustand `regFtdsDaily` store (reloaded after every upload and on mount) — no extra DB fetch. Skipped rows never enter aggregation, so the Proceed/commit path is unchanged from the IP-authority feature.

---

## Components

### `src/lib/regFtdsAuthority.ts` (extend — pure, tested)

```typescript
// No-data rule. Called when a row's IP is blank: junk (skip) only if it also
// has no metrics; otherwise it is a blocking error (real data with no IP).
// reg/ftds are parsed numbers (undefined if blank/unparseable).
export function isSkippableRow(ip: string, reg: number | undefined, ftds: number | undefined): boolean

export interface SkippedRow { row: number; label: string }   // row number + ESP label (or '(blank)')

// Upload dates that already exist in storage, deduped and sorted ascending.
export function computeDateOverwrites(uploadDates: string[], existingDates: string[]): string[]

export interface UploadReview {
  corrections:    Correction[]
  unknowns:       UnknownIp[]
  ambiguous:      UnknownIp[]
  skippedRows:    SkippedRow[]
  dateOverwrites: string[]
  hasIssues:      boolean        // any of the five arrays non-empty
}
```

`buildUploadPlan` and `applyCorrections` are unchanged. `RegFtdsView` builds `UploadReview` by spreading `buildUploadPlan(...)` and adding `skippedRows` (collected in the validator loop using `isSkippableRow`) and `dateOverwrites` (from `computeDateOverwrites`), then computes `hasIssues`.

### `src/components/views/RegFtdsView.tsx` (modify)

- In the validator loop: a blank-IP row goes to `skippedRows` when `isSkippableRow` is true, else to `missingIp` (blocking) as today. All other branches unchanged.
- After `buildUploadPlan`: compute `dateOverwrites` from the store's distinct dates; assemble `UploadReview`; open the modal if `hasIssues`, else `commitUpload`.
- Empty-aggregation branch: if there are no valid rows (e.g. an all-junk file), show a "no valid rows to upload" warning instead of returning silently.
- `pending` state widens from `plan` to the `UploadReview`.

### `src/components/ui/IpAuthorityModal.tsx` (extend)

Takes the `UploadReview`. Adds two conditional sections below the existing three:
- **Skipped rows (no IP, no data)** — informational; lists row number + label.
- **These dates already have data — will be replaced** — informational; dates formatted via the existing `fmtDate` helper.

Proceed / Cancel and all-or-nothing semantics unchanged.

```
Review before upload — <filename>
  ⚠ ESP corrections (from IP Matrix)        [existing]
  ⚠ Registered under multiple ESPs          [existing]
  ⓘ Not in IP Matrix                         [existing]
  ⓘ Skipped rows (no IP, no data)            [NEW]
  ↻ These dates already have data — will be replaced   [NEW]
  [ Cancel — don't upload ]   [ Proceed with upload ]
```

---

## Edge Cases

- **All-junk file:** every row skippable → aggregation empty → show "no valid rows to upload" (not a silent return).
- **Skipped-only upload:** if `skippedRows` is the only non-empty section, the modal still opens to report what was dropped, then Proceed stores.
- **Store staleness for overwrites:** `existingDates` from the store is reloaded after each upload/on mount; a stale read would at worst over-warn, never lose data.
- **Date formatting:** `dateOverwrites` are ISO strings rendered through the existing `fmtDate`.

---

## Testing

TDD on the pure helpers:

**`isSkippableRow`:**
- blank IP + `undefined`/`0` reg + `undefined`/`0` ftds → `true`
- blank IP + reg `5` → `false`
- blank IP + ftds `2` → `false`
- non-blank IP → `false`

**`computeDateOverwrites`:**
- overlapping dates → intersection
- no overlap → `[]`
- duplicate inputs → deduped
- result sorted ascending
- empty inputs → `[]`

Existing `buildUploadPlan` / `applyCorrections` tests remain unchanged.

**Manual integration (dev server, Cancel-only against prod):** upload a real client file (has the `Ethan` row and overwrites existing June dates) → modal shows the skipped `Ethan` row + the date-overwrite warning + any corrections; Cancel writes nothing; Proceed stores without the junk row.

---

## Files

| File | Change |
|------|--------|
| `src/lib/regFtdsAuthority.ts` | ADD `isSkippableRow`, `computeDateOverwrites`, `SkippedRow`, `UploadReview` |
| `src/lib/__tests__/regFtdsAuthority.test.ts` | ADD tests for the two new helpers |
| `src/components/views/RegFtdsView.tsx` | MODIFY validator (skip vs block), assemble `UploadReview`, empty-file message, widen `pending` |
| `src/components/ui/IpAuthorityModal.tsx` | EXTEND to render skipped-rows + date-overwrite sections |
