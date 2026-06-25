# Reg & FTDs — Extract `decideUpload` Orchestration for Integration Coverage

**Date:** 2026-06-25
**Status:** Design approved, pending spec review
**Area:** `src/lib/regFtdsAuthority.ts`, `src/components/views/RegFtdsView.tsx`
**Builds on:** the IP-authority, upload-review, atomic-replace, and validator-extraction features (all merged)

---

## Problem

The Reg & FTDs upload's pure pieces are now individually tested (`classifyRegFtdsRows`, `buildUploadPlan`, `applyCorrections`, `computeDateOverwrites`, `isSkippableRow`). But the **orchestration** in `RegFtdsView.handleFile` — how those pieces are wired into a reject / review / commit decision (plus column detection and aggregation) — is inline in a React component and has no automated coverage. That orchestration is exactly where this session's failures occurred (the IP-authority gate was initially unreachable; the junk-row skip was initially placed where the ESP check still blocked it). The project's test setup is node-only Vitest with pure-function unit tests — no jsdom, React Testing Library, Playwright, or Supabase mock.

---

## Goal

Lock the upload-decision orchestration with automated tests by extracting it into a pure `decideUpload` function (node-unit-testable), leaving the view as thin read → decide → act + I/O.

Non-goals (YAGNI):
- No new test stack (no jsdom/RTL/Playwright/Supabase-mock). Decision logic is tested purely; the component-render, the `supabase.rpc` call, and the modal button wiring stay out of scope (thin, already verified live this session).
- No change to the decision *behavior* except the one consolidation below.
- No change to `commitUpload`, the modal, the Proceed/Cancel handlers, or the pure helpers' internals.

---

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Test level | **Extract the orchestration into a pure `decideUpload` function and unit-test it** (node, no new deps). Idiomatic to the repo; covers the logic that broke. |
| Extraction boundary | **Full** — `decideUpload` absorbs column detection, classify, aggregation, plan, overwrites, and the review-vs-commit decision. The view keeps file read, matrix fetch, store reads, the decision switch, and `commitUpload`. |
| Matrix source | **Consolidate on the fresh matrix.** Today `classifyRegFtdsRows` reads `ipmIpSet` from the cached `ipmData` store while `buildUploadPlan` uses the freshly-fetched matrix — two sources. `decideUpload` takes one fresh `ipMatrix` and uses it for both (spec-aligned fresh-matrix behavior; removes a latent staleness inconsistency). This is a small, deliberate behavior fix, not a pure lift. |

---

## Components

### `src/lib/regFtdsAuthority.ts` (extend — pure, tested)

```typescript
export type UploadDecision =
  | { kind: 'reject'; warning: string }
  | { kind: 'commit'; rows: AggRow[]; fileRowCount: number }
  | { kind: 'review'; review: UploadReview; rows: AggRow[]; fileRowCount: number }

// Runs the whole pre-commit pipeline and returns the decision the view acts on.
export function decideUpload(
  fileRows: string[][],            // includes header row 0
  ipMatrix: { esp: string; ip: string }[],
  existingDates: string[],
  activeEspSet: Set<string>,
): UploadDecision
```

Pipeline (lifts the current inline logic, in order):
1. Derive column indices from `fileRows[0]` (the existing `find`/normalize logic). If no Date column → `{ kind: 'reject', warning: <"Date column not found…" + found headers> }`.
2. `classifyRegFtdsRows(fileRows, ci, ipmIpSet, activeEspSet)` where `ipmIpSet` is derived from `ipMatrix`. If `result.hasErrors` → `{ kind: 'reject', warning: formatRegFtdsWarning(result, activeEspSet)! }`.
3. Aggregate the rows by `(date, esp, ip)` (the existing aggregation loop using `parseRegFtdsDate`/`normalizeEspName`). If the aggregate is empty → `{ kind: 'reject', warning: <"No valid rows to upload…" + skipped count> }`.
4. `buildUploadPlan(rows, ipMatrix)` + `computeDateOverwrites(uploadDates, existingDates)` → assemble `UploadReview` (with `result.skippedRows`). `review.hasIssues ? { kind: 'review', review, rows, fileRowCount } : { kind: 'commit', rows, fileRowCount }`.

`fileRowCount = fileRows.length - 1`. No React/Supabase imports.

### `src/components/views/RegFtdsView.tsx` (modify `handleFile`)

```typescript
  // ...read file into fileRows (unchanged)...
  if (fileRows.length < 2) return

  const { data: matrixRows, error } = await supabase.from('ip_matrix').select('esp, ip')
  if (error) { setWarning('Could not load the IP Matrix to validate this upload. Nothing was uploaded — please try again.'); return }

  const existingDates = [...new Set(regFtdsDaily.map(r => r.date))]
  const decision = decideUpload(fileRows, matrixRows ?? [], existingDates, ACTIVE_ESP_SET)

  if (decision.kind === 'reject') { setWarning(decision.warning); return }
  if (decision.kind === 'commit') { await commitUpload(decision.rows, file.name, decision.fileRowCount); return }
  setPending({ review: decision.review, rows: decision.rows, filename: file.name, fileRowCount: decision.fileRowCount })
```

- The matrix fetch moves **before** the decision (now feeds both classify and the plan).
- Column detection, classify, aggregation, plan, overwrites, and review assembly all move into `decideUpload`.
- `commitUpload`, `handleModalProceed` (`applyCorrections(pending.rows, pending.review.corrections)` → `commitUpload`), and `handleModalCancel` are **unchanged**.
- View import from `@/lib/regFtdsAuthority` shrinks to `{ applyCorrections, decideUpload, type UploadReview, type AggRow }`; the now-internal helpers drop out (lint confirms). `normalizeEspName`/`isValidIsoDate` stay (used in `commitUpload`'s reload).

---

## Edge Cases

- `fileRows.length < 2` → the view returns silently before calling `decideUpload` (preserves current behavior).
- Matrix fetch error → view aborts with a warning before deciding (I/O concern, stays in the view).
- Empty/`'unknown'`-only matrix → `decideUpload` still works (classify carve-out simply doesn't apply; plan flags unknowns as today).
- Behavior is otherwise identical to the current inline flow, except the cached→fresh matrix consolidation (Decisions table).

---

## Testing

`decideUpload` unit tests (node) — one representative case per decision branch:
- No Date column → `reject` (warning names the Date column).
- A classify error (bad date / missing field / invalid IPv4 / unknown ESP on an unregistered IP) → `reject` with the formatted warning.
- All rows junk/skipped → `reject` ("No valid rows…").
- Clean file, IPs match the matrix, all-new dates → `commit` with correct `rows` and `fileRowCount`.
- Conflict (e.g. Kenscio on a Map IP) → `review` whose `review.corrections` has the relabel.
- A date already in `existingDates` → `review` with `dateOverwrites`.
- A no-data junk row alongside good rows → `review` with `skippedRows`, good rows in `rows`.

These exercise the full wired pipeline in one call. Component-render / `supabase.rpc` / button paths are out of scope. Existing suite stays green; a quick manual upload (known-bad shows the same warning; the real `Campaign Stats - 04-06-2026.xlsx` still shows the review modal) confirms no behavior drift.

---

## Files

| File | Change |
|------|--------|
| `src/lib/regFtdsAuthority.ts` | ADD `UploadDecision`, `decideUpload` (lifts column-detection + classify + aggregation + plan + overwrites + decision) |
| `src/lib/__tests__/regFtdsAuthority.test.ts` | ADD `decideUpload` branch tests |
| `src/components/views/RegFtdsView.tsx` | REPLACE the inline orchestration in `handleFile` with `decideUpload` + a 3-way switch; shrink imports; matrix fetch moves before the decision |
