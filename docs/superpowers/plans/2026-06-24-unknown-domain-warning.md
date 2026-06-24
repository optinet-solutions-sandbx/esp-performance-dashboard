# Surface Unparseable ("unknown") Sending Domains — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface (non-blocking) how much campaign-upload send activity landed under an unparseable `'unknown'` sending domain, so it no longer slips past the domain guardrail silently.

**Architecture:** A pure, tested helper `unknownDomainSends(parsed)` in `parsers.ts` sums the `'unknown'` domain bucket's `sent` across dates; `UploadView.handleProcess` logs a warning when it's > 0. No blocking, no parser/guardrail changes.

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5, Vitest.

## Global Constraints

- Non-blocking: the warning is `addLog` only — no `return`, the upload proceeds.
- Do NOT change parsing, the `'unknown'` fallback, the domain guardrail's block-on-unregistered behavior, or the line-110 `'unknown'` exclusion.
- `unknownDomainSends` is pure (no React/Supabase); lives in `src/lib/parsers.ts`; uses the `@/lib` alias from consumers.
- Existing test suite must stay green.

---

### Task 1: Add `unknownDomainSends` helper (+ export `ParseResult`)

**Files:**
- Modify: `src/lib/parsers.ts` (export the `ParseResult` interface; add the helper)
- Create: `src/lib/__tests__/parsers-unknown-domain.test.ts`

**Interfaces:**
- Produces: `unknownDomainSends(parsed: ParseResult): number`, exported from `@/lib/parsers`; the `ParseResult` interface is now exported.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/parsers-unknown-domain.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { unknownDomainSends, type ParseResult } from '@/lib/parsers'

// Minimal structural fixture — the helper only reads byDate[*].domains[*].sent.
const make = (byDate: Record<string, Record<string, number>>): ParseResult => ({
  byDate: Object.fromEntries(
    Object.entries(byDate).map(([date, domains]) => [
      date,
      { rows: 0, providers: {}, providerDomains: {},
        domains: Object.fromEntries(Object.entries(domains).map(([d, sent]) => [d, { sent }])) },
    ]),
  ),
} as unknown as ParseResult)

describe('unknownDomainSends', () => {
  it('sums the "unknown" bucket sent across dates', () => {
    const parsed = make({
      '2026-06-01': { 'site.com': 10, unknown: 3 },
      '2026-06-02': { unknown: 4 },
    })
    expect(unknownDomainSends(parsed)).toBe(7)
  })

  it('returns 0 when no "unknown" bucket exists', () => {
    expect(unknownDomainSends(make({ '2026-06-01': { 'site.com': 10 } }))).toBe(0)
  })

  it('returns 0 for empty byDate', () => {
    expect(unknownDomainSends(make({}))).toBe(0)
  })

  it('counts only the "unknown" bucket, not real domains', () => {
    expect(unknownDomainSends(make({ '2026-06-01': { 'a.com': 5, 'b.com': 6, unknown: 2 } }))).toBe(2)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/lib/__tests__/parsers-unknown-domain.test.ts`
Expected: FAIL — `unknownDomainSends` is not exported (and/or `ParseResult` not exported).

- [ ] **Step 3: Export `ParseResult` and add the helper**

In `src/lib/parsers.ts`, change the interface declaration `interface ParseResult {` (around line 13) to `export interface ParseResult {`. Then add the helper (near the other exported parser utilities):

```typescript
// Total send activity attributed to an unparseable sending domain ("unknown"),
// summed across all dates. A row contributes to a domain's `sent`, so this is a
// row-count proxy for how much data couldn't be matched to a real domain.
export function unknownDomainSends(parsed: ParseResult): number {
  return Object.values(parsed.byDate)
    .reduce((sum, b) => sum + (b.domains['unknown']?.sent ?? 0), 0)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/lib/__tests__/parsers-unknown-domain.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full suite + build**

Run: `npm run test:run`
Expected: full suite green (exporting `ParseResult` is additive — no existing test changes).

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/lib/parsers.ts src/lib/__tests__/parsers-unknown-domain.test.ts
git commit -m "feat(upload): add unknownDomainSends helper (tested)"
```

---

### Task 2: Log the non-blocking warning in `UploadView`

**Files:**
- Modify: `src/components/views/UploadView.tsx`

**Interfaces:**
- Consumes: `unknownDomainSends` from `@/lib/parsers` (Task 1).

- [ ] **Step 1: Add the import**

In `src/components/views/UploadView.tsx`, add `unknownDomainSends` to the existing `@/lib/parsers` import (currently `import { parseFile, mergeIntoMmData, readUploadRows } from '@/lib/parsers'`):

```typescript
import { parseFile, mergeIntoMmData, readUploadRows, unknownDomainSends } from '@/lib/parsers'
```

- [ ] **Step 2: Add the warning after the parse-success logs**

In `handleProcess`, immediately after the `🔎 Format:` log line (`addLog(\`🔎 Format: ${parsed.format}\`)`, ~line 97) and BEFORE the IP-Matrix domain-guardrail block, add:

```typescript
      const unknownSends = unknownDomainSends(parsed)
      if (unknownSends > 0) {
        addLog(`⚠️ ${unknownSends.toLocaleString()} send(s) have an unparseable sending domain — stored under "unknown". Check the campaign names or register the domain in the IP Matrix.`)
      }
```

Do not add a `return` — this is informational and the upload proceeds. Do not modify the guardrail block, the parse logic, or anything else.

- [ ] **Step 3: Lint + build + tests**

Run: `npm run lint`
Expected: no new errors.

Run: `npm run build`
Expected: succeeds.

Run: `npm run test:run`
Expected: full suite green (no test changes from this task).

- [ ] **Step 4: Commit**

```bash
git add src/components/views/UploadView.tsx
git commit -m "feat(upload): warn when sends land under an unparseable domain"
```

---

## Self-Review Notes

- **Spec coverage:** pure tested helper summing the `'unknown'` `sent` (Task 1); `ParseResult` exported (Task 1 Step 3); non-blocking warning placed after parse logs, before the guardrail (Task 2); no parser/guardrail/line-110 changes (neither task touches them). All covered.
- **No placeholders; complete code in every step.**
- **Type/name consistency:** `unknownDomainSends(parsed: ParseResult): number` identical across Task 1 (definition) and Task 2 (call) and the spec.
