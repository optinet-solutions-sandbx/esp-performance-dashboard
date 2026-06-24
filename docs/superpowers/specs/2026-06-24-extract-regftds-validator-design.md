# Reg & FTDs — Extract the Upload Validator into a Tested Module

**Date:** 2026-06-24
**Status:** Design approved, pending spec review
**Area:** `src/lib/regFtdsAuthority.ts`, `src/components/views/RegFtdsView.tsx`
**Builds on:** the IP-authority + upload-review features (this extracts logic those added inline)

---

## Problem

The row-level upload validation in `RegFtdsView.handleFile` is ~100 lines of inline, untested logic: a single-pass classification loop (dates, missing fields, IPv4, ESP with the registered-IP carve-out, the no-data skip rule) plus a multi-line warning-message builder. This is exactly where this session's Critical bug hid (the no-data skip was initially placed where the ESP check still blocked it) — it survived four task reviews because nothing unit-tested the integration. A future edit to that block could regress with no test to catch it.

---

## Goal

Extract the classification logic and the warning-message formatting into pure, unit-tested functions, with **zero behavior change**. The current behavior is the specification.

Non-goals (YAGNI):
- No behavior change of any kind — same checks, same order, same thresholds, same warning text.
- Do NOT extract the aggregation loop (separate, lower-risk concern; stays in the view).
- No change to `buildUploadPlan`, `applyCorrections`, the modal, or the upload flow.

---

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Extraction scope | **Classifier + warning-message formatter**, both as pure tested functions. Aggregation loop stays in the view. |
| Placement | **Approach A:** add both to `src/lib/regFtdsAuthority.ts` (already the home for the upload's pure logic); tests join `regFtdsAuthority.test.ts`. |

---

## Components

### `src/lib/regFtdsAuthority.ts` (extend — pure, tested)

```typescript
export interface RowIssue { row: number; value: string }

export interface ValidationResult {
  badDates:    RowIssue[]
  missingDate: number[]
  missingEsp:  number[]
  missingIp:   number[]
  badIps:      RowIssue[]
  unknownEsps: string[]        // deduped + sorted
  skippedRows: SkippedRow[]    // collected here, consumed downstream by the modal
  hasErrors:   boolean         // any hard-block array non-empty — EXCLUDES skippedRows
}

// Single-pass row classifier — the current loop lifted verbatim. Owns its own row
// parsing (normalizeEspName / parseDate / isValidIpv4 / isSkippableRow / a local parseNum).
export function classifyRegFtdsRows(
  fileRows: string[][],
  ci: { date: number; esp: number; ip: number; reg: number; ftds: number },
  ipmIpSet: Set<string> | null,
  activeEspSet: Set<string>,
): ValidationResult

// Builds the exact rejection warning string from the result, or null when hasErrors is false.
export function formatRegFtdsWarning(result: ValidationResult, activeEspSet: Set<string>): string | null
```

Behavior (unchanged from the current inline code):
- Per row, in order: skip entirely-blank rows; skip no-data rows (`isSkippableRow` → `skippedRows`, not blocking); classify date (missing / bad-format); ESP (missing / unknown, with the carve-out that an unrecognized ESP whose IP is in `ipmIpSet` is NOT flagged — the IP-authority gate corrects it); IP (missing / invalid IPv4).
- `unknownEsps` deduped internally and returned sorted.
- `hasErrors` = any of `badDates / missingDate / missingEsp / unknownEsps / missingIp / badIps` non-empty. `skippedRows` is excluded.
- `formatRegFtdsWarning` returns the identical multi-line text (same section headers, the same "…and N more" truncation past 5 rows, the "Active ESPs: …" line); `null` when `hasErrors` is false.

### `src/components/views/RegFtdsView.tsx` (modify `handleFile`)

Replace the inline issue-arrays, the classification loop, and the warning-builder block with:

```typescript
    const result = classifyRegFtdsRows(fileRows, ci, ipmIpSet, ACTIVE_ESP_SET)
    if (result.hasErrors) { setWarning(formatRegFtdsWarning(result, ACTIVE_ESP_SET)!); return }
```

- `ipmIpSet` and `ACTIVE_ESP_SET` are already in scope; they're passed in rather than read inside the loop.
- Downstream `skippedRows` references become `result.skippedRows` (in the `UploadReview` assembly).
- The aggregation loop and its `parseNum` are untouched; the classifier carries its own internal `parseNum` so it stays self-contained.
- Net: ~100 inline lines become 2 calls.

---

## Edge Cases

These are exactly the current behaviors, now locked by tests:
- Entirely-blank row → ignored (not in any array, not skipped-list).
- No-data row (blank IP, no metrics) → `skippedRows`, does not block.
- Blank-IP row WITH a metric → `missingIp` (blocks).
- Unknown ESP on a registered IP → not flagged; on an unregistered IP → `unknownEsps`.
- `ipmIpSet` null (empty IP Matrix) → the carve-out simply never applies; unknown ESPs are flagged as before.

---

## Testing

TDD on the two pure functions; existing 79 tests must still pass.

**`classifyRegFtdsRows`:**
- Clean file → all arrays empty, `hasErrors: false`.
- Bad date → `badDates`; missing date → `missingDate`; missing ESP → `missingEsp`; missing IP (with a metric) → `missingIp`; invalid IPv4 → `badIps`.
- Unknown ESP on unregistered IP → `unknownEsps`; unknown ESP on registered IP → not flagged.
- No-data row → `skippedRows`, `hasErrors` stays false; entirely-blank row → ignored.
- `unknownEsps` deduped + sorted across rows.

**`formatRegFtdsWarning`:**
- `null` when `hasErrors` is false.
- With issues: output contains each relevant section header, the "…and N more" line when >5 rows, and the "Active ESPs:" line.

**Regression:** logic lifted verbatim → existing suite + a quick manual upload (known-good still uploads; known-bad shows the same warning). No dev-server write needed (classifier is pure).

---

## Files

| File | Change |
|------|--------|
| `src/lib/regFtdsAuthority.ts` | ADD `RowIssue`, `ValidationResult`, `classifyRegFtdsRows`, `formatRegFtdsWarning` |
| `src/lib/__tests__/regFtdsAuthority.test.ts` | ADD tests for both functions |
| `src/components/views/RegFtdsView.tsx` | REPLACE inline validation block (~lines 233-335) with two calls; use `result.skippedRows` downstream |
