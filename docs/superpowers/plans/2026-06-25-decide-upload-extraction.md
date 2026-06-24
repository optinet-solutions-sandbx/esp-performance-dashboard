# Extract `decideUpload` Orchestration + Integration Tests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the Reg & FTDs upload-decision orchestration out of `RegFtdsView.handleFile` into a pure, unit-tested `decideUpload` function, locking the reject/review/commit logic that broke twice this session.

**Architecture:** `decideUpload(fileRows, ipMatrix, existingDates, activeEspSet)` runs the whole pre-commit pipeline (column detection → classify → aggregate → plan → overwrites → decision) and returns a discriminated `UploadDecision`. `handleFile` becomes read → fetch matrix → `decideUpload` → 3-way switch. I/O (file read, matrix fetch, `commitUpload` rpc) stays in the view.

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5, Vitest (node env, pure-function unit tests).

## Global Constraints

- Behavior identical to the current inline flow, EXCEPT one approved consolidation: `decideUpload` derives its IP set from the single **fresh** `ipMatrix` argument (used for both classify's carve-out and `buildUploadPlan`), replacing the current split where classify read the cached `ipmData` store. Spec-aligned fresh-matrix behavior.
- `decideUpload` is pure: no React/Supabase imports; lives in `src/lib/regFtdsAuthority.ts`; reuses that module's existing functions.
- Warning strings and decision outcomes match the current code verbatim.
- `commitUpload`, `handleModalProceed`, `handleModalCancel`, and the modal are unchanged.
- Tests run with `npm run test:run`; tests in `src/lib/__tests__/`. Existing suite stays green.

---

### Task 1: Add `UploadDecision` + `decideUpload` (with tests)

**Files:**
- Modify: `src/lib/regFtdsAuthority.ts`
- Test: `src/lib/__tests__/regFtdsAuthority.test.ts`

**Interfaces:**
- Consumes: `classifyRegFtdsRows`, `formatRegFtdsWarning`, `buildUploadPlan`, `computeDateOverwrites`, `parseRegFtdsDate`, `normalizeEspName`, `AggRow`, `UploadReview` (all already in the module / its imports).
- Produces:
  - `type UploadDecision = { kind: 'reject'; warning: string } | { kind: 'commit'; rows: AggRow[]; fileRowCount: number } | { kind: 'review'; review: UploadReview; rows: AggRow[]; fileRowCount: number }`
  - `function decideUpload(fileRows: string[][], ipMatrix: { esp: string; ip: string }[], existingDates: string[], activeEspSet: Set<string>): UploadDecision`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/regFtdsAuthority.test.ts`:

```typescript
import { decideUpload } from '@/lib/regFtdsAuthority'

const H = ['Date', 'ESP', 'IP', 'Registrations', 'FTD']
const ACTIVE = new Set(['Map', 'Mailjet', 'Mailmodo', 'Mailgun', 'Kenscio'])
const MATRIX = [
  { esp: 'Map',      ip: '91.222.98.16' },
  { esp: 'Mailjet',  ip: '194.127.197.7' },
  { esp: 'Mailmodo', ip: '156.70.46.105' },
]

describe('decideUpload', () => {
  it('rejects when there is no Date column', () => {
    const d = decideUpload([['ESP', 'IP', 'Registrations', 'FTD'], ['Map', '91.222.98.16', '5', '0']], MATRIX, [], ACTIVE)
    expect(d.kind).toBe('reject')
    expect(d.kind === 'reject' && d.warning).toContain('Date column not found')
  })

  it('rejects on a classify error (bad date)', () => {
    const d = decideUpload([H, ['04-06-2026', 'Map', '91.222.98.16', '5', '0']], MATRIX, [], ACTIVE)
    expect(d.kind).toBe('reject')
    expect(d.kind === 'reject' && d.warning).toContain('Invalid date format')
  })

  it('rejects with "No valid rows" when every row is junk/skipped', () => {
    const d = decideUpload([H, ['2026-06-10', 'Ethan', '', '', '']], MATRIX, [], ACTIVE)
    expect(d.kind).toBe('reject')
    expect(d.kind === 'reject' && d.warning).toContain('No valid rows')
  })

  it('commits a clean file with matching IPs and all-new dates', () => {
    const d = decideUpload([H, ['2026-06-10', 'Mailmodo', '156.70.46.105', '5', '0']], MATRIX, [], ACTIVE)
    expect(d.kind).toBe('commit')
    if (d.kind === 'commit') {
      expect(d.rows).toEqual([{ date: '2026-06-10', esp: 'Mailmodo', ip: '156.70.46.105', reg: 5, ftds: 0 }])
      expect(d.fileRowCount).toBe(1)
    }
  })

  it('returns review with a correction when an IP belongs to a different ESP in the matrix', () => {
    const d = decideUpload([H, ['2026-06-10', 'Kenscio', '91.222.98.16', '5', '0']], MATRIX, [], ACTIVE)
    expect(d.kind).toBe('review')
    if (d.kind === 'review') {
      expect(d.review.corrections).toHaveLength(1)
      expect(d.review.corrections[0]).toMatchObject({ ip: '91.222.98.16', from: 'Kenscio', to: 'Map' })
    }
  })

  it('returns review with dateOverwrites when a date already exists', () => {
    const d = decideUpload([H, ['2026-06-10', 'Map', '91.222.98.16', '5', '0']], MATRIX, ['2026-06-10'], ACTIVE)
    expect(d.kind).toBe('review')
    if (d.kind === 'review') expect(d.review.dateOverwrites).toEqual(['2026-06-10'])
  })

  it('returns review with skippedRows for a no-data row alongside a good row', () => {
    const d = decideUpload([
      H,
      ['2026-06-10', 'Mailmodo', '156.70.46.105', '5', '0'],
      ['2026-06-10', 'Ethan', '', '', ''],
    ], MATRIX, [], ACTIVE)
    expect(d.kind).toBe('review')
    if (d.kind === 'review') {
      expect(d.review.skippedRows).toEqual([{ row: 3, label: 'Ethan' }])
      expect(d.rows).toHaveLength(1)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/lib/__tests__/regFtdsAuthority.test.ts`
Expected: FAIL — `decideUpload` not exported.

- [ ] **Step 3: Implement `decideUpload`**

Append to `src/lib/regFtdsAuthority.ts`:

```typescript
export type UploadDecision =
  | { kind: 'reject'; warning: string }
  | { kind: 'commit'; rows: AggRow[]; fileRowCount: number }
  | { kind: 'review'; review: UploadReview; rows: AggRow[]; fileRowCount: number }

// Whole pre-commit upload pipeline as one pure decision: column detection ->
// classify -> aggregate -> plan -> date-overwrites -> reject | commit | review.
// Lifted verbatim from RegFtdsView.handleFile; the IP set is derived from the
// single fresh ipMatrix (used for both classify and buildUploadPlan).
export function decideUpload(
  fileRows: string[][],
  ipMatrix: { esp: string; ip: string }[],
  existingDates: string[],
  activeEspSet: Set<string>,
): UploadDecision {
  const fileRowCount = fileRows.length - 1

  const headers = fileRows[0].map(h => String(h).trim().toLowerCase().replace(/[^a-z]/g, ''))
  const find = (...cands: string[]) => headers.findIndex(h => cands.some(c => h.includes(c)))
  const ci = {
    date: find('date'),
    esp:  find('esp', 'provider', 'service'),
    ip:   find('ip', 'ipaddress', 'address'),
    reg:  find('registrations', 'registration', 'reg'),
    ftds: find('ftds', 'ftd'),
  }

  if (ci.date < 0) {
    return { kind: 'reject', warning:
      `Upload rejected — Date column not found.\n` +
      `Required columns: Date, ESP, IP, Registrations, FTD\n` +
      `Found headers: ${fileRows[0].map(h => String(h).trim()).filter(Boolean).join(', ')}` }
  }

  const ipmIpSet = ipMatrix.length > 0 ? new Set(ipMatrix.map(r => r.ip.toLowerCase())) : null
  const result = classifyRegFtdsRows(fileRows, ci, ipmIpSet, activeEspSet)
  if (result.hasErrors) return { kind: 'reject', warning: formatRegFtdsWarning(result, activeEspSet)! }

  const parseNum = (val: unknown) => { const n = Number(String(val ?? '').trim()); return isNaN(n) ? undefined : n }
  const aggregated = new Map<string, AggRow>()
  for (const row of fileRows.slice(1)) {
    const dateIso = parseRegFtdsDate(row[ci.date])
    const espVal  = ci.esp  >= 0 ? normalizeEspName(String(row[ci.esp] ?? '')) : ''
    const ipVal   = ci.ip   >= 0 ? String(row[ci.ip]  ?? '').trim() : ''
    const reg     = ci.reg  >= 0 ? parseNum(row[ci.reg])  : undefined
    const ftds    = ci.ftds >= 0 ? parseNum(row[ci.ftds]) : undefined
    if (!dateIso || !espVal || !ipVal) continue
    if (reg === undefined && ftds === undefined) continue
    const key = `${dateIso}|${espVal.toLowerCase()}|${ipVal}`
    const prev = aggregated.get(key) ?? { date: dateIso, esp: espVal, ip: ipVal, reg: 0, ftds: 0 }
    aggregated.set(key, { ...prev, reg: prev.reg + (reg ?? 0), ftds: prev.ftds + (ftds ?? 0) })
  }

  if (aggregated.size === 0) {
    return { kind: 'reject', warning:
      result.skippedRows.length > 0
        ? `No valid rows to upload — ${result.skippedRows.length} row${result.skippedRows.length === 1 ? '' : 's'} skipped (no IP / no data).`
        : 'No valid rows to upload.' }
  }

  const rows: AggRow[] = [...aggregated.values()]
  const plan = buildUploadPlan(rows, ipMatrix)
  const uploadDates = [...new Set(rows.map(r => r.date))]
  const dateOverwrites = computeDateOverwrites(uploadDates, existingDates)
  const review: UploadReview = {
    corrections: plan.corrections,
    unknowns: plan.unknowns,
    ambiguous: plan.ambiguous,
    skippedRows: result.skippedRows,
    dateOverwrites,
    hasIssues: plan.hasIssues || result.skippedRows.length > 0 || dateOverwrites.length > 0,
  }

  return review.hasIssues
    ? { kind: 'review', review, rows, fileRowCount }
    : { kind: 'commit', rows, fileRowCount }
}
```

Note: in the aggregation loop, `ci.date >= 0` is guaranteed here (we returned above if it wasn't), so `parseRegFtdsDate(row[ci.date])` is called directly — equivalent to the original `ci.date >= 0 ? … : null`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/lib/__tests__/regFtdsAuthority.test.ts`
Expected: PASS (7 new `decideUpload` cases).

- [ ] **Step 5: Run full suite + build**

Run: `npm run test:run`
Expected: full suite green.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/lib/regFtdsAuthority.ts src/lib/__tests__/regFtdsAuthority.test.ts
git commit -m "feat(regftds): add decideUpload orchestration (tested)"
```

---

### Task 2: Rewire `handleFile` to `decideUpload`

**Files:**
- Modify: `src/components/views/RegFtdsView.tsx`

**Interfaces:**
- Consumes: `decideUpload`, `applyCorrections`, `UploadReview`, `AggRow` from `@/lib/regFtdsAuthority`.

Verified by lint + build + the full suite + a manual upload (dev server, Cancel-only).

- [ ] **Step 1: Update the import**

Change the `@/lib/regFtdsAuthority` import (line 8) to drop the now-internal helpers and add `decideUpload`:

```typescript
import { applyCorrections, decideUpload, type UploadReview, type AggRow } from '@/lib/regFtdsAuthority'
```
(`buildUploadPlan`, `computeDateOverwrites`, `parseRegFtdsDate`, `classifyRegFtdsRows`, `formatRegFtdsWarning` are no longer used in the view — removed. `normalizeEspName` from `@/lib/data` and `isValidIsoDate` from `@/lib/utils` stay; they're used by `commitUpload`/memos.)

- [ ] **Step 2: Replace the inline orchestration in `handleFile`**

Replace the block from `const headers = fileRows[0].map(...)` (line 191) through the `if (!review.hasIssues) { ... } else { ... }` block (line 270) — i.e. everything between the `if (fileRows.length < 2) return` guard and the closing `} finally {` — with:

```typescript
      // Fetch the registry fresh — decisions must reflect the current matrix.
      const { data: matrixRows, error: matrixErr } = await supabase
        .from('ip_matrix')
        .select('esp, ip')
      if (matrixErr) {
        setWarning('Could not load the IP Matrix to validate this upload. Nothing was uploaded — please try again.')
        return
      }

      const existingDates = [...new Set(regFtdsDaily.map(r => r.date))]
      const decision = decideUpload(fileRows, matrixRows ?? [], existingDates, ACTIVE_ESP_SET)

      if (decision.kind === 'reject') { setWarning(decision.warning); return }
      if (decision.kind === 'commit') { await commitUpload(decision.rows, file.name, decision.fileRowCount); return }
      setPending({ review: decision.review, rows: decision.rows, filename: file.name, fileRowCount: decision.fileRowCount })
```

Leave the file-read block (lines 177-189), the `try/finally` with `setProcessing(false)`, `commitUpload`, `handleModalProceed`, and `handleModalCancel` unchanged.

- [ ] **Step 3: Lint + build + tests**

Run: `npm run lint`
Expected: no new errors. Remove any import the linter flags as now-unused.

Run: `npm run build`
Expected: succeeds.

Run: `npm run test:run`
Expected: full suite green.

- [ ] **Step 4: Manual sanity check (controller, optional)**

Behavior is unchanged. Light confirmation: upload a known-bad file (unknown ESP on an unregistered IP) → same rejection warning; upload `references/new-uploads/Campaign Stats - 04-06-2026.xlsx` → review modal still shows the skipped `Ethan` row + corrections. Cancel — no write.

- [ ] **Step 5: Commit**

```bash
git add src/components/views/RegFtdsView.tsx
git commit -m "refactor(regftds): handleFile delegates to decideUpload"
```

---

## Self-Review Notes

- **Spec coverage:** `decideUpload` + `UploadDecision` with full pipeline (Task 1); fresh-matrix consolidation (Task 1 `ipmIpSet` from `ipMatrix`); view reduced to read→fetch→decide→switch (Task 2); `commitUpload`/modal/Proceed/Cancel unchanged (Task 2 leaves them); branch tests cover every decision kind (Task 1 Step 1). All covered.
- **Type/name consistency:** `decideUpload`/`UploadDecision` and the `{ kind, rows, fileRowCount, review, warning }` shapes are identical across Task 1 (def + tests) and Task 2 (consumption) and the spec.
- **Behavior:** logic + warning strings lifted verbatim; the only intended change is cached→fresh matrix for classify (approved).
