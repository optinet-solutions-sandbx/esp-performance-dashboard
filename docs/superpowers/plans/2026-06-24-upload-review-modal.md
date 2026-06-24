# Unified Upload Review Modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop harmless junk rows from blocking Reg & FTDs uploads, and warn before overwriting existing dates, by extending the existing confirm-before-save modal into a single "review before upload" surface.

**Architecture:** Two new pure, unit-tested helpers in `regFtdsAuthority.ts` (`isSkippableRow`, `computeDateOverwrites`) plus a combined `UploadReview` type. `RegFtdsView` composes them with the existing `buildUploadPlan` output and passes one `UploadReview` to `IpAuthorityModal`, which renders two new sections. The existing inline validations and `buildUploadPlan`/`applyCorrections` are not rewritten.

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5, Zustand, Supabase, Vitest.

## Global Constraints

- Skip rule: a blank-IP row is skipped (warned, not blocking) **only if** it also has no registrations and no FTDs. A blank-IP row with a nonzero metric still hard-blocks.
- Dupe-date prompt: any upload that would replace existing dates opens the modal, even if otherwise clean.
- `buildUploadPlan` and `applyCorrections` are NOT modified — compose around them.
- The modal stays all-or-nothing (Proceed / Cancel); no per-row accept/reject.
- ESP comparison stays inside `buildUploadPlan` via `normalizeEspName` — do not duplicate it.
- Tests run with `npm run test:run`; test files live in `src/lib/__tests__/` and import via the `@/` alias. The pure module has zero React/Supabase imports.
- This branch (`feat/upload-review-modal`) is stacked on `feat/regftds-ip-authority`; that code (`buildUploadPlan`, `applyCorrections`, `Correction`, `UnknownIp`, `UploadPlan`, `IpAuthorityModal`, the wired `RegFtdsView`) already exists.

---

### Task 1: `isSkippableRow` + `SkippedRow` type

**Files:**
- Modify: `src/lib/regFtdsAuthority.ts` (add export + type)
- Test: `src/lib/__tests__/regFtdsAuthority.test.ts` (add cases)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `interface SkippedRow { row: number; label: string }`
  - `function isSkippableRow(ip: string, reg: number | undefined, ftds: number | undefined): boolean`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/regFtdsAuthority.test.ts`:

```typescript
import { isSkippableRow } from '@/lib/regFtdsAuthority'

describe('isSkippableRow', () => {
  it('is true when IP is blank and there are no metrics', () => {
    expect(isSkippableRow('', undefined, undefined)).toBe(true)
    expect(isSkippableRow('', 0, 0)).toBe(true)
    expect(isSkippableRow('   ', 0, 0)).toBe(true) // whitespace IP counts as blank
  })

  it('is false when IP is blank but a metric is present (real data, no IP)', () => {
    expect(isSkippableRow('', 5, undefined)).toBe(false)
    expect(isSkippableRow('', undefined, 2)).toBe(false)
  })

  it('is false when the row has an IP', () => {
    expect(isSkippableRow('1.2.3.4', undefined, undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/lib/__tests__/regFtdsAuthority.test.ts`
Expected: FAIL — `isSkippableRow` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/regFtdsAuthority.ts`:

```typescript
export interface SkippedRow { row: number; label: string }

// A blank-IP row is junk to skip ONLY if it also carries no metrics. A blank-IP
// row with a nonzero metric is a blocking error (real data with no IP), so it
// returns false here and the caller keeps blocking it.
export function isSkippableRow(
  ip: string,
  reg: number | undefined,
  ftds: number | undefined,
): boolean {
  const noIp = String(ip ?? '').trim() === ''
  return noIp && !reg && !ftds
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/lib/__tests__/regFtdsAuthority.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/regFtdsAuthority.ts src/lib/__tests__/regFtdsAuthority.test.ts
git commit -m "feat(regftds): add isSkippableRow no-data-row rule"
```

---

### Task 2: `computeDateOverwrites` + `UploadReview` type

**Files:**
- Modify: `src/lib/regFtdsAuthority.ts` (add export + type)
- Test: `src/lib/__tests__/regFtdsAuthority.test.ts` (add cases)

**Interfaces:**
- Consumes: `Correction`, `UnknownIp` (existing), `SkippedRow` (Task 1).
- Produces:
  - `function computeDateOverwrites(uploadDates: string[], existingDates: string[]): string[]`
  - `interface UploadReview { corrections: Correction[]; unknowns: UnknownIp[]; ambiguous: UnknownIp[]; skippedRows: SkippedRow[]; dateOverwrites: string[]; hasIssues: boolean }`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/regFtdsAuthority.test.ts`:

```typescript
import { computeDateOverwrites } from '@/lib/regFtdsAuthority'

describe('computeDateOverwrites', () => {
  it('returns the dates that already exist, sorted ascending', () => {
    expect(computeDateOverwrites(['2026-06-05', '2026-06-02'], ['2026-06-02', '2026-06-05']))
      .toEqual(['2026-06-02', '2026-06-05'])
  })

  it('returns only the overlap', () => {
    expect(computeDateOverwrites(['2026-06-02', '2026-06-03'], ['2026-06-02', '2026-06-09']))
      .toEqual(['2026-06-02'])
  })

  it('returns empty when there is no overlap', () => {
    expect(computeDateOverwrites(['2026-06-03'], ['2026-06-02'])).toEqual([])
  })

  it('dedupes repeated upload dates', () => {
    expect(computeDateOverwrites(['2026-06-02', '2026-06-02'], ['2026-06-02'])).toEqual(['2026-06-02'])
  })

  it('handles empty inputs', () => {
    expect(computeDateOverwrites([], ['2026-06-02'])).toEqual([])
    expect(computeDateOverwrites(['2026-06-02'], [])).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/lib/__tests__/regFtdsAuthority.test.ts`
Expected: FAIL — `computeDateOverwrites` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/regFtdsAuthority.ts`:

```typescript
// Upload dates that already exist in storage, deduped and sorted ascending.
export function computeDateOverwrites(uploadDates: string[], existingDates: string[]): string[] {
  const existing = new Set(existingDates)
  return [...new Set(uploadDates)].filter(d => existing.has(d)).sort()
}

export interface UploadReview {
  corrections:    Correction[]
  unknowns:       UnknownIp[]
  ambiguous:      UnknownIp[]
  skippedRows:    SkippedRow[]
  dateOverwrites: string[]
  hasIssues:      boolean
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/lib/__tests__/regFtdsAuthority.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/regFtdsAuthority.ts src/lib/__tests__/regFtdsAuthority.test.ts
git commit -m "feat(regftds): add computeDateOverwrites + UploadReview type"
```

---

### Task 3: Extend `IpAuthorityModal` to render the two new sections

**Files:**
- Modify: `src/components/ui/IpAuthorityModal.tsx`

**Interfaces:**
- Consumes: `UploadReview` from `@/lib/regFtdsAuthority` (Task 2).
- Produces: default-exported component
  `IpAuthorityModal({ review, filename, isLight, onProceed, onCancel }: { review: UploadReview; filename: string; isLight: boolean; onProceed: () => void; onCancel: () => void })`

Presentational; no unit test (no React harness). Verify via lint + Task 4 manual check.

- [ ] **Step 1: Update the import and prop type**

In `src/components/ui/IpAuthorityModal.tsx`, change the type import and the component signature from `plan: UploadPlan` to `review: UploadReview`:

```tsx
import type { UploadReview } from '@/lib/regFtdsAuthority'

export default function IpAuthorityModal({
  review, filename, isLight, onProceed, onCancel,
}: {
  review: UploadReview
  filename: string
  isLight: boolean
  onProceed: () => void
  onCancel: () => void
}) {
```

- [ ] **Step 2: Rename existing `plan.` references and add a date formatter**

Replace the three existing references `plan.corrections`, `plan.ambiguous`, `plan.unknowns` with `review.corrections`, `review.ambiguous`, `review.unknowns` (the section JSX bodies are otherwise unchanged).

Add this helper just inside the component body (above the `return`), for formatting the overwrite dates:

```tsx
  const fmtDate = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
```

- [ ] **Step 3: Add the two new sections**

Immediately after the existing `review.unknowns` section block and before the Cancel/Proceed button row, add:

```tsx
        {review.skippedRows.length > 0 && (
          <div className="mb-4">
            <div className={`text-[11px] font-mono uppercase tracking-wider mb-2 ${muted}`}>
              ⓘ Skipped rows (no IP, no data)
            </div>
            <div className={`text-[11px] font-mono mb-2 ${muted}`}>
              These rows have no IP and no metrics — they&apos;ll be dropped:
            </div>
            <div className="space-y-1">
              {review.skippedRows.map(s => (
                <div key={s.row} className={`text-[11px] font-mono flex justify-between gap-3 ${txt}`}>
                  <span>row {s.row}</span>
                  <span className={muted}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {review.dateOverwrites.length > 0 && (
          <div className="mb-4">
            <div className={`text-[11px] font-mono uppercase tracking-wider mb-2 ${isLight ? 'text-amber-700' : 'text-[#ffd166]'}`}>
              ↻ These dates already have data — will be replaced
            </div>
            <div className="space-y-1">
              {review.dateOverwrites.map(d => (
                <div key={d} className={`text-[11px] font-mono ${txt}`}>{fmtDate(d)}</div>
              ))}
            </div>
          </div>
        )}
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new errors for `IpAuthorityModal.tsx`. (If lint flags an unused `UploadPlan` import, remove it.)

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/IpAuthorityModal.tsx
git commit -m "feat(regftds): render skipped-rows + date-overwrite sections in upload modal"
```

---

### Task 4: Wire skip + overwrite into `RegFtdsView`

**Files:**
- Modify: `src/components/views/RegFtdsView.tsx`

**Interfaces:**
- Consumes: `isSkippableRow`, `computeDateOverwrites`, `UploadReview`, `SkippedRow` from `@/lib/regFtdsAuthority`; existing `buildUploadPlan`, `applyCorrections`, `IpAuthorityModal`, store `regFtdsDaily`.
- Produces: no new exports; behavior change only.

Verified by lint + build + manual upload (dev server, Cancel-only).

- [ ] **Step 1: Update imports and the `pending` state shape**

Update the import from `@/lib/regFtdsAuthority` to add the new names:

```typescript
import { buildUploadPlan, applyCorrections, isSkippableRow, computeDateOverwrites, type UploadReview, type AggRow, type SkippedRow } from '@/lib/regFtdsAuthority'
```

Change the `pending` state to hold a `review` instead of a `plan`:

```typescript
  const [pending, setPending] = useState<{ review: UploadReview; rows: AggRow[]; filename: string; fileRowCount: number } | null>(null)
```

- [ ] **Step 2: Declare `skippedRows`, ensure `parseNum` is in scope, and split skip-vs-block in the validator**

In `handleFile`, alongside the other issue arrays (`badDates`, `missingIp`, etc.), add:

```typescript
      const skippedRows: SkippedRow[] = []
```

`isSkippableRow` needs the parsed numeric metrics. The helper `parseNum` is currently defined *after* the validator block — move its definition to just above the validator loop so it is in scope inside it (cut the existing `const parseNum = ...` line from below the validator and paste it above the `for` loop). It is unchanged:

```typescript
      const parseNum = (val: unknown) => { const n = Number(String(val ?? '').trim()); return isNaN(n) ? undefined : n }
```

In the validator loop, replace the IP block:

```typescript
        // IP — missing, then format. IP↔ESP matrix reconciliation is handled
        // downstream by the IP-Matrix authority gate (buildUploadPlan).
        if (!ipRaw) {
          missingIp.push(rowNum)
        } else if (!isValidIpv4(ipRaw)) {
          badIps.push({ row: rowNum, value: ipRaw })
        }
```

with:

```typescript
        // IP — missing, then format. A blank-IP row with no metrics is junk
        // (skip with a warning); a blank-IP row carrying a metric still blocks.
        if (!ipRaw) {
          if (isSkippableRow(ipRaw, parseNum(regRaw), parseNum(ftdsRaw))) {
            skippedRows.push({ row: rowNum, label: espRaw || '(blank)' })
          } else {
            missingIp.push(rowNum)
          }
        } else if (!isValidIpv4(ipRaw)) {
          badIps.push({ row: rowNum, value: ipRaw })
        }
```

Note: `hasIssues` (the hard-block check) is NOT changed — `skippedRows` must not be added to it, because skipped rows do not block.

- [ ] **Step 3: Handle the all-junk case in the empty-aggregation branch**

Find the existing line `if (aggregated.size === 0) return` and replace it with a message that accounts for skipped rows:

```typescript
      if (aggregated.size === 0) {
        setWarning(
          skippedRows.length > 0
            ? `No valid rows to upload — ${skippedRows.length} row${skippedRows.length === 1 ? '' : 's'} skipped (no IP / no data).`
            : 'No valid rows to upload.'
        )
        return
      }
```

- [ ] **Step 4: Assemble `UploadReview` and gate on it**

Replace the existing gate block (the `buildUploadPlan` call through the `if (!plan.hasIssues) {...} else {...}`) with:

```typescript
      const plan = buildUploadPlan(rows, matrixRows ?? [])
      const uploadDates = [...new Set(rows.map(r => r.date))]
      const existingDates = [...new Set(regFtdsDaily.map(r => r.date))]
      const dateOverwrites = computeDateOverwrites(uploadDates, existingDates)
      const review: UploadReview = {
        corrections: plan.corrections,
        unknowns: plan.unknowns,
        ambiguous: plan.ambiguous,
        skippedRows,
        dateOverwrites,
        hasIssues: plan.hasIssues || skippedRows.length > 0 || dateOverwrites.length > 0,
      }

      if (!review.hasIssues) {
        await commitUpload(rows, file.name, fileRowCount)
      } else {
        setPending({ review, rows, filename: file.name, fileRowCount })
      }
```

(`regFtdsDaily` is already destructured from `useDashboardStore()` at the top of the component; `fileRowCount` is already computed earlier in `handleFile`.)

- [ ] **Step 5: Update the Proceed handler and the modal render**

In `handleModalProceed`, change `pending.plan.corrections` to `pending.review.corrections`:

```typescript
      const corrected = applyCorrections(pending.rows, pending.review.corrections)
```

In the JSX, update the modal props from `plan={pending.plan}` to `review={pending.review}`:

```tsx
      {pending && (
        <IpAuthorityModal
          review={pending.review}
          filename={pending.filename}
          isLight={isLight}
          onProceed={handleModalProceed}
          onCancel={handleModalCancel}
        />
      )}
```

- [ ] **Step 6: Lint and build**

Run: `npm run lint`
Expected: no new errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Manual verification (dev server, Cancel-only against prod)**

Start `npm run dev`. In Reg & FTDs, upload a real client file from `references/new-uploads` (e.g. `Campaign Stats - 04-06-2026.xlsx`).
Expected: the modal opens and shows a **Skipped rows** section listing the `Ethan` row, a **dates already have data — will be replaced** section, and any ESP corrections. Click **Cancel** → confirm no new Upload History row and no DB change. (Do NOT click Proceed against prod.)

- [ ] **Step 8: Commit**

```bash
git add src/components/views/RegFtdsView.tsx
git commit -m "feat(regftds): unified upload review — skip junk rows + warn on date overwrite"
```

---

## Self-Review Notes

- **Spec coverage:** no-data skip rule (Task 1 + Task 4 Step 2), block on blank-IP-with-metric (Task 1 false case + Task 4 keeps `missingIp`), always-prompt-on-overwrite (Task 4 Step 4 `hasIssues` includes `dateOverwrites`), fold into existing modal (Task 3), all-junk message (Task 4 Step 3), pure tested helpers (Tasks 1-2), `buildUploadPlan`/`applyCorrections` untouched (composed in Task 4). All covered.
- **Type consistency:** `UploadReview` fields used in Task 3/4 match Task 2's definition; `isSkippableRow(ip, reg, ftds)` signature consistent between Task 1 and its Task 4 call; `SkippedRow { row, label }` consistent.
- **No date-misparse work** — matches the spec non-goal.
