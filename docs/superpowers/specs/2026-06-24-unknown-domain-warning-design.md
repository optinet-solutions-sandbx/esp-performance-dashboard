# Campaign Upload — Surface Unparseable ("unknown") Sending Domains

**Date:** 2026-06-24
**Status:** Design approved, pending spec review
**Area:** `src/lib/parsers.ts`, `src/components/views/UploadView.tsx`

---

## Background & Problem

Follow-up #2 ("harden the campaign-upload path") was investigated via a discovery pass. Finding: that path is **already hardened** — `UploadView.handleProcess` runs `validateUpload` (tested format/schema check), `parseFile` skips no-date/no-email rows and reports counts, and a domain-registration guardrail blocks uploads whose sending domains aren't registered in the IP Matrix for the ESP. So #2 is closed as already-covered, except for one real residual gap:

**The `'unknown'`-domain silent bypass.** When `extractSendingDomain` ([parsers.ts:246](../../../src/lib/parsers.ts#L246)) can't determine a campaign's sending domain (no registered-domain match, no regex-extractable domain, no usable split-part — or an empty domain column for generic formats), it returns `'unknown'`. The domain guardrail explicitly excludes `'unknown'` from its registered-domain check ([UploadView.tsx:110](../../../src/components/views/UploadView.tsx#L110)), so rows with an unparseable sending domain pass through silently and are stored under "unknown" with no operator awareness.

---

## Goal

Make unparseable-domain activity **visible** at upload time, without blocking.

Non-goals (YAGNI):
- No blocking — `'unknown'` can legitimately occur on an oddly-named campaign; blocking would over-reject (decision below).
- No change to parsing, the `'unknown'` fallback itself, the guardrail's block-on-unregistered behavior, or the line-110 exclusion.
- Not extracting/refactoring the inline domain guardrail (a separate, lower-value gap noted in discovery).

---

## Decision (from brainstorming)

| Question | Decision |
|----------|----------|
| Behavior for `'unknown'`-domain rows | **Warn, allow proceed.** Surface a non-blocking warning of how much send activity landed under `'unknown'`. Consistent with the parser's skip-and-report style and the RegFtds "unknown → warn" decision; avoids over-rejecting a single oddly-named campaign. |

---

## Components

### `src/lib/parsers.ts` (extend — pure, tested)

Export the (currently internal) `ParseResult` interface so the helper can name it, and add:

```typescript
// Total send activity attributed to an unparseable sending domain ("unknown"),
// summed across all dates. A row contributes to a domain's `sent`, so this is a
// row-count proxy for how much data couldn't be matched to a real domain.
export function unknownDomainSends(parsed: ParseResult): number {
  return Object.values(parsed.byDate)
    .reduce((sum, b) => sum + (b.domains['unknown']?.sent ?? 0), 0)
}
```

### `src/components/views/UploadView.tsx` (modify `handleProcess`)

Immediately after the parse-success logs (after the `🔎 Format:` line, ~line 97), add a non-blocking warning:

```typescript
      const unknownSends = unknownDomainSends(parsed)
      if (unknownSends > 0) {
        addLog(`⚠️ ${unknownSends.toLocaleString()} send(s) have an unparseable sending domain — stored under "unknown". Check the campaign names or register the domain in the IP Matrix.`)
      }
```

- **Non-blocking** — `addLog` only, no `return`; the upload proceeds.
- Placed **before** the existing domain-registration guardrail so the operator is informed even if the guardrail later blocks for a different reason.
- Import `unknownDomainSends` from `@/lib/parsers` (alongside the existing `parseFile`, `mergeIntoMmData`, `readUploadRows` import).
- Nothing else changes: the guardrail, parsing, and the line-110 `'unknown'` exclusion stay as-is. The warning is purely additive visibility.

---

## Edge Cases

- **No unknown activity** → `unknownDomainSends` returns 0 → no warning (clean uploads unaffected).
- **Empty `byDate`** → 0.
- **Guardrail also blocks** (an unregistered *known* domain present) → the unknown warning has already been logged; the rejection proceeds as today. The two are independent.

---

## Testing

- **`unknownDomainSends` (unit, TDD):** a `ParseResult` with an `'unknown'` domain bucket on two dates → summed total; one with no `'unknown'` bucket → 0; empty `byDate` → 0; a bucket where `'unknown'` coexists with real domains → only the `'unknown'` `sent` is counted.
- **Wiring:** the `addLog` call is UI — verified by `npm run lint` + `npm run build` (no unit test, consistent with the rest of `UploadView`).
- Existing suite must stay green.

---

## Files

| File | Change |
|------|--------|
| `src/lib/parsers.ts` | EXPORT `ParseResult`; ADD `unknownDomainSends` |
| `src/lib/__tests__/parsers-*.test.ts` (or a new `parsers-unknown-domain.test.ts`) | ADD unit tests for `unknownDomainSends` |
| `src/components/views/UploadView.tsx` | ADD the non-blocking warning + import |
