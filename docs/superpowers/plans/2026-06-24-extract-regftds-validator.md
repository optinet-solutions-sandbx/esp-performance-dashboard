# Extract Reg & FTDs Upload Validator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the inline Reg & FTDs upload validation (row classifier + warning-message builder) into pure, unit-tested functions in `regFtdsAuthority.ts`, with zero behavior change.

**Architecture:** The classifier and formatter (and the two pure helpers they depend on, `parseRegFtdsDate` and `isValidIpv4`, relocated from the view since lib cannot import from a component) move into `src/lib/regFtdsAuthority.ts`. `RegFtdsView.handleFile` calls them instead of running ~100 lines of inline logic. Current behavior is the spec.

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5, Vitest.

## Global Constraints

- ZERO behavior change: same checks, same order (skip-blank → skip-no-data → date → ESP → IP), same thresholds, same warning text.
- Pure module: `regFtdsAuthority.ts` has no React/Supabase imports; uses the `@/lib` alias.
- `hasErrors` excludes `skippedRows` (skipped rows warn via the modal, they don't block).
- The aggregation loop in `handleFile` is NOT touched (separate concern).
- The relocated date parser is renamed `parseRegFtdsDate` (avoids collision with the different `parseDate` already exported from `parsers.ts`).
- Tests run with `npm run test:run`; tests live in `src/lib/__tests__/`. Existing suite (79) must stay green.

---

### Task 1: Relocate `parseRegFtdsDate` + `isValidIpv4` into `regFtdsAuthority.ts`

**Files:**
- Modify: `src/lib/regFtdsAuthority.ts` (add two exported helpers)
- Modify: `src/components/views/RegFtdsView.tsx` (remove local copies, import the relocated ones, update call sites)
- Test: `src/lib/__tests__/regFtdsAuthority.test.ts` (add cases)

**Interfaces:**
- Produces: `parseRegFtdsDate(val: unknown): string | null` and `isValidIpv4(ip: string): boolean`, both exported from `@/lib/regFtdsAuthority`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/regFtdsAuthority.test.ts`:

```typescript
import { parseRegFtdsDate, isValidIpv4 } from '@/lib/regFtdsAuthority'

describe('parseRegFtdsDate', () => {
  it('formats a Date object to yyyy-mm-dd (local parts)', () => {
    expect(parseRegFtdsDate(new Date(2026, 5, 4))).toBe('2026-06-04') // month is 0-based: 5 = June
  })
  it('passes through a valid yyyy-mm-dd string', () => {
    expect(parseRegFtdsDate('2026-06-04')).toBe('2026-06-04')
  })
  it('rejects non-ISO text and blanks', () => {
    expect(parseRegFtdsDate('04-06-2026')).toBeNull()
    expect(parseRegFtdsDate('')).toBeNull()
    expect(parseRegFtdsDate(undefined)).toBeNull()
  })
})

describe('isValidIpv4', () => {
  it('accepts a valid IPv4', () => {
    expect(isValidIpv4('156.70.46.105')).toBe(true)
  })
  it('rejects wrong part count, out-of-range octets, and non-numeric', () => {
    expect(isValidIpv4('1.2.3')).toBe(false)
    expect(isValidIpv4('1.2.3.256')).toBe(false)
    expect(isValidIpv4('a.b.c.d')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/lib/__tests__/regFtdsAuthority.test.ts`
Expected: FAIL — `parseRegFtdsDate` / `isValidIpv4` not exported.

- [ ] **Step 3: Add the two helpers to `regFtdsAuthority.ts`**

Append to `src/lib/regFtdsAuthority.ts`:

```typescript
// Reg & FTDs accepts ONLY yyyy-mm-dd text; genuine Excel date cells (read with
// cellDates) arrive as Date objects and are normalized to yyyy-mm-dd.
// (Named parseRegFtdsDate to avoid collision with the different parseDate in parsers.ts.)
export function parseRegFtdsDate(val: unknown): string | null {
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear()
    const m = String(val.getMonth() + 1).padStart(2, '0')
    const d = String(val.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(val ?? '').trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

export function isValidIpv4(ip: string): boolean {
  const parts = ip.split('.')
  if (parts.length !== 4) return false
  return parts.every(p => /^\d{1,3}$/.test(p) && parseInt(p, 10) >= 0 && parseInt(p, 10) <= 255)
}
```

- [ ] **Step 4: Update `RegFtdsView.tsx` to use the relocated helpers**

In `src/components/views/RegFtdsView.tsx`:
1. Delete the local `function parseDate(...)` (lines ~19-30) and `function isValidIpv4(...)` (lines ~32-36).
2. Add `parseRegFtdsDate, isValidIpv4` to the existing import from `@/lib/regFtdsAuthority` (line 8):

```typescript
import { buildUploadPlan, applyCorrections, isSkippableRow, computeDateOverwrites, parseRegFtdsDate, isValidIpv4, type UploadReview, type AggRow, type SkippedRow } from '@/lib/regFtdsAuthority'
```
3. Update the two `parseDate(` call sites in `handleFile` to `parseRegFtdsDate(` — one in the inline validation loop (the `const iso = parseDate(dateCell)` line) and one in the aggregation loop (`const dateIso = ci.date >= 0 ? parseDate(row[ci.date]) : null`). `isValidIpv4` call site (in the validation loop) stays the same name (now resolves to the import).

- [ ] **Step 5: Run tests + build**

Run: `npm run test:run`
Expected: 79 existing + 7 new = 86 passed.

Run: `npm run build`
Expected: succeeds (no remaining references to the deleted local functions).

- [ ] **Step 6: Commit**

```bash
git add src/lib/regFtdsAuthority.ts src/lib/__tests__/regFtdsAuthority.test.ts src/components/views/RegFtdsView.tsx
git commit -m "refactor(regftds): relocate parseRegFtdsDate + isValidIpv4 to lib"
```

---

### Task 2: Add `classifyRegFtdsRows` + `formatRegFtdsWarning` + types

**Files:**
- Modify: `src/lib/regFtdsAuthority.ts`
- Test: `src/lib/__tests__/regFtdsAuthority.test.ts`

**Interfaces:**
- Consumes: `parseRegFtdsDate`, `isValidIpv4`, `isSkippableRow`, `normalizeEspName`, `SkippedRow` (existing).
- Produces:
  - `interface RowIssue { row: number; value: string }`
  - `interface ValidationResult { badDates: RowIssue[]; missingDate: number[]; missingEsp: number[]; missingIp: number[]; badIps: RowIssue[]; unknownEsps: string[]; skippedRows: SkippedRow[]; hasErrors: boolean }`
  - `classifyRegFtdsRows(fileRows: string[][], ci: { date: number; esp: number; ip: number; reg: number; ftds: number }, ipmIpSet: Set<string> | null, activeEspSet: Set<string>): ValidationResult`
  - `formatRegFtdsWarning(result: ValidationResult, activeEspSet: Set<string>): string | null`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/regFtdsAuthority.test.ts`:

```typescript
import { classifyRegFtdsRows, formatRegFtdsWarning } from '@/lib/regFtdsAuthority'

const CI = { date: 0, esp: 1, ip: 2, reg: 3, ftds: 4 }
const HEADER = ['Date', 'ESP', 'IP', 'Registrations', 'FTD']
const ACTIVE = new Set(['Map', 'Mailjet', 'Mailmodo', 'Mailgun'])
const IPSET = new Set(['91.222.98.16', '156.70.46.105'])

describe('classifyRegFtdsRows', () => {
  it('reports no errors for a clean file', () => {
    const r = classifyRegFtdsRows([HEADER, ['2026-06-04', 'Map', '91.222.98.16', '5', '0']], CI, IPSET, ACTIVE)
    expect(r.hasErrors).toBe(false)
    expect(r).toMatchObject({ badDates: [], missingDate: [], missingEsp: [], missingIp: [], badIps: [], unknownEsps: [], skippedRows: [] })
  })

  it('flags a bad date', () => {
    const r = classifyRegFtdsRows([HEADER, ['04-06-2026', 'Map', '91.222.98.16', '5', '0']], CI, IPSET, ACTIVE)
    expect(r.badDates).toEqual([{ row: 2, value: '04-06-2026' }])
    expect(r.hasErrors).toBe(true)
  })

  it('flags missing date / esp / ip and bad IPv4', () => {
    const r = classifyRegFtdsRows([
      HEADER,
      ['', 'Map', '91.222.98.16', '5', '0'],          // row 2: missing date
      ['2026-06-04', '', '91.222.98.16', '5', '0'],    // row 3: missing esp
      ['2026-06-04', 'Map', '', '5', '0'],             // row 4: missing ip (has metric -> blocks)
      ['2026-06-04', 'Map', '999.1.1.1', '5', '0'],    // row 5: bad IPv4
    ], CI, IPSET, ACTIVE)
    expect(r.missingDate).toEqual([2])
    expect(r.missingEsp).toEqual([3])
    expect(r.missingIp).toEqual([4])
    expect(r.badIps).toEqual([{ row: 5, value: '999.1.1.1' }])
    expect(r.hasErrors).toBe(true)
  })

  it('flags an unknown ESP on an UNregistered IP, but not on a registered IP', () => {
    const r = classifyRegFtdsRows([
      HEADER,
      ['2026-06-04', 'Bogus', '8.8.8.8', '5', '0'],         // unregistered IP -> unknown ESP flagged
      ['2026-06-04', 'Maileroo', '91.222.98.16', '5', '0'], // registered IP -> NOT flagged (carve-out)
    ], CI, IPSET, ACTIVE)
    expect(r.unknownEsps).toEqual(['Bogus'])
  })

  it('skips a no-data row (no IP, no metrics) without blocking, and ignores an entirely-blank row', () => {
    const r = classifyRegFtdsRows([
      HEADER,
      ['2026-06-04', 'Ethan', '', '', ''],   // row 2: no-data -> skipped
      ['', '', '', '', ''],                  // row 3: entirely blank -> ignored
    ], CI, IPSET, ACTIVE)
    expect(r.skippedRows).toEqual([{ row: 2, label: 'Ethan' }])
    expect(r.hasErrors).toBe(false)
    expect(r.missingIp).toEqual([])
    expect(r.missingDate).toEqual([])
  })

  it('dedupes and sorts unknownEsps across rows', () => {
    const r = classifyRegFtdsRows([
      HEADER,
      ['2026-06-04', 'Zeta', '8.8.8.8', '1', '0'],
      ['2026-06-04', 'Alpha', '8.8.8.8', '1', '0'],
      ['2026-06-04', 'Zeta', '8.8.8.8', '1', '0'],
    ], CI, IPSET, ACTIVE)
    expect(r.unknownEsps).toEqual(['Alpha', 'Zeta'])
  })
})

describe('formatRegFtdsWarning', () => {
  const clean = classifyRegFtdsRows([HEADER, ['2026-06-04', 'Map', '91.222.98.16', '5', '0']], CI, IPSET, ACTIVE)
  const bad = classifyRegFtdsRows([HEADER, ['04-06-2026', 'Bogus', '999.1.1.1', '5', '0']], CI, IPSET, ACTIVE)

  it('returns null when there are no errors', () => {
    expect(formatRegFtdsWarning(clean, ACTIVE)).toBeNull()
  })

  it('includes section headers and the Active ESPs line', () => {
    const msg = formatRegFtdsWarning(bad, ACTIVE)!
    expect(msg).toContain('Upload rejected')
    expect(msg).toContain('Invalid date format')
    expect(msg).toContain('Invalid IP address')
    expect(msg).toContain('ESP not found in the system')
    expect(msg).toContain('Active ESPs:')
    expect(msg).toContain('Nothing was uploaded.')
  })

  it('truncates lists past 5 rows with an "…and N more" line', () => {
    const rows = Array.from({ length: 7 }, () => ['04-06-2026', 'Map', '91.222.98.16', '5', '0'])
    const many = classifyRegFtdsRows([HEADER, ...rows], CI, IPSET, ACTIVE)
    expect(formatRegFtdsWarning(many, ACTIVE)!).toContain('…and 2 more')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/lib/__tests__/regFtdsAuthority.test.ts`
Expected: FAIL — `classifyRegFtdsRows` / `formatRegFtdsWarning` not exported.

- [ ] **Step 3: Implement both functions**

Append to `src/lib/regFtdsAuthority.ts`:

```typescript
export interface RowIssue { row: number; value: string }

export interface ValidationResult {
  badDates:    RowIssue[]
  missingDate: number[]
  missingEsp:  number[]
  missingIp:   number[]
  badIps:      RowIssue[]
  unknownEsps: string[]
  skippedRows: SkippedRow[]
  hasErrors:   boolean
}

// Single-pass row classifier. Lifted verbatim from RegFtdsView.handleFile:
// skip-blank -> skip-no-data -> date -> ESP (with registered-IP carve-out) -> IP.
export function classifyRegFtdsRows(
  fileRows: string[][],
  ci: { date: number; esp: number; ip: number; reg: number; ftds: number },
  ipmIpSet: Set<string> | null,
  activeEspSet: Set<string>,
): ValidationResult {
  const badDates: RowIssue[] = []
  const missingDate: number[] = []
  const missingEsp: number[] = []
  const missingIp: number[] = []
  const badIps: RowIssue[] = []
  const unknownEspSet = new Set<string>()
  const skippedRows: SkippedRow[] = []
  const parseNum = (val: unknown) => { const n = Number(String(val ?? '').trim()); return isNaN(n) ? undefined : n }

  for (let i = 1; i < fileRows.length; i++) {
    const row    = fileRows[i]
    const rowNum = i + 1
    const dateCell = ci.date >= 0 ? row[ci.date] : undefined
    const espRaw   = ci.esp  >= 0 ? normalizeEspName(String(row[ci.esp]  ?? '').trim()) : ''
    const ipRaw    = ci.ip   >= 0 ? String(row[ci.ip]  ?? '').trim() : ''
    const regRaw   = ci.reg  >= 0 ? String(row[ci.reg]  ?? '').trim() : ''
    const ftdsRaw  = ci.ftds >= 0 ? String(row[ci.ftds] ?? '').trim() : ''

    const dateStr = String(dateCell ?? '').trim()
    if (!dateStr && !espRaw && !ipRaw && !regRaw && !ftdsRaw) continue

    if (isSkippableRow(ipRaw, parseNum(regRaw), parseNum(ftdsRaw))) {
      skippedRows.push({ row: rowNum, label: espRaw || '(blank)' })
      continue
    }

    if (!dateStr) {
      missingDate.push(rowNum)
    } else {
      const iso = parseRegFtdsDate(dateCell)
      if (!iso || isNaN(new Date(iso + 'T00:00:00').getTime())) {
        badDates.push({ row: rowNum, value: dateStr })
      }
    }

    if (!espRaw) {
      missingEsp.push(rowNum)
    } else if (!activeEspSet.has(espRaw)) {
      const ipKnown = ipmIpSet?.has(ipRaw.toLowerCase()) ?? false
      if (!ipKnown) unknownEspSet.add(espRaw)
    }

    if (!ipRaw) {
      missingIp.push(rowNum)
    } else if (!isValidIpv4(ipRaw)) {
      badIps.push({ row: rowNum, value: ipRaw })
    }
  }

  const unknownEsps = [...unknownEspSet].sort()
  const hasErrors =
    badDates.length > 0 || missingDate.length > 0 ||
    missingEsp.length > 0 || unknownEsps.length > 0 ||
    missingIp.length > 0 || badIps.length > 0

  return { badDates, missingDate, missingEsp, missingIp, badIps, unknownEsps, skippedRows, hasErrors }
}

// Builds the exact rejection warning string (or null when there are no errors).
export function formatRegFtdsWarning(result: ValidationResult, activeEspSet: Set<string>): string | null {
  if (!result.hasErrors) return null
  const lines: string[] = ['Upload rejected — fix all issues below and try again.\n']
  const show = (arr: RowIssue[], label: string, hint?: string) => {
    lines.push(`${label} (${arr.length} row${arr.length === 1 ? '' : 's'}):`)
    arr.slice(0, 5).forEach(r => lines.push(`  • Row ${r.row}: "${r.value}"`))
    if (arr.length > 5) lines.push(`  …and ${arr.length - 5} more`)
    if (hint) lines.push(`  ${hint}`)
    lines.push('')
  }
  const showRows = (arr: number[], label: string) => {
    lines.push(`${label} (${arr.length} row${arr.length === 1 ? '' : 's'}):`)
    arr.slice(0, 5).forEach(r => lines.push(`  • Row ${r}`))
    if (arr.length > 5) lines.push(`  …and ${arr.length - 5} more`)
    lines.push('')
  }

  if (result.missingDate.length > 0) showRows(result.missingDate, 'Missing date')
  if (result.badDates.length > 0)     show(result.badDates, 'Invalid date format', 'Expected: yyyy-mm-dd — e.g. 2026-05-25')
  if (result.missingEsp.length > 0)  showRows(result.missingEsp, 'Missing ESP')
  if (result.unknownEsps.length > 0) {
    lines.push(`ESP not found in the system (${result.unknownEsps.length} ESP${result.unknownEsps.length === 1 ? '' : 's'}):`)
    result.unknownEsps.forEach(e => lines.push(`  • ${e}`))
    lines.push(`  Active ESPs: ${[...activeEspSet].join(', ')}`)
    lines.push('')
  }
  if (result.missingIp.length > 0)   showRows(result.missingIp, 'Missing IP address')
  if (result.badIps.length > 0)       show(result.badIps, 'Invalid IP address', 'Expected: valid IPv4 — e.g. 156.70.46.105')

  lines.push('Nothing was uploaded.')
  return lines.join('\n')
}
```

Note: the original inline `show` used a generic constrained type; here it is typed directly to `RowIssue[]` since both callers pass `RowIssue[]`. Output is identical.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/lib/__tests__/regFtdsAuthority.test.ts`
Expected: PASS (all new classifier + formatter cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/regFtdsAuthority.ts src/lib/__tests__/regFtdsAuthority.test.ts
git commit -m "feat(regftds): add classifyRegFtdsRows + formatRegFtdsWarning (tested)"
```

---

### Task 3: Wire `RegFtdsView.handleFile` to the extracted functions

**Files:**
- Modify: `src/components/views/RegFtdsView.tsx`

**Interfaces:**
- Consumes: `classifyRegFtdsRows`, `formatRegFtdsWarning`, `ValidationResult` from `@/lib/regFtdsAuthority`.

Verified by lint + build + the full suite + a manual upload (no dev-server write needed beyond observing the warning/modal — Cancel-only if testing the happy path).

- [ ] **Step 1: Add the imports**

Update the `@/lib/regFtdsAuthority` import in `RegFtdsView.tsx` to also bring in the classifier/formatter:

```typescript
import { buildUploadPlan, applyCorrections, isSkippableRow, computeDateOverwrites, parseRegFtdsDate, isValidIpv4, classifyRegFtdsRows, formatRegFtdsWarning, type UploadReview, type AggRow, type SkippedRow } from '@/lib/regFtdsAuthority'
```
(`isValidIpv4` is no longer referenced in the view after this task — remove it from the import in Step 3 if lint flags it.)

- [ ] **Step 2: Replace the inline validation block with two calls**

In `handleFile`, delete the entire inline block — the `RowIssue` type alias, the issue-array declarations, `ipmIpSet`, the `parseNum` used only by that loop, the classification `for` loop, the `hasIssues` computation, and the `if (hasIssues) { ... setWarning(...) ... return }` message-builder block (currently ~lines 231-335). Replace with:

```typescript
      const ipmIpSet = ipmData.length > 0 ? new Set(ipmData.map(r => r.ip.toLowerCase())) : null
      const result = classifyRegFtdsRows(fileRows, ci, ipmIpSet, ACTIVE_ESP_SET)
      if (result.hasErrors) { setWarning(formatRegFtdsWarning(result, ACTIVE_ESP_SET)!); return }
```

- [ ] **Step 3: Use `result.skippedRows` downstream**

Find where `skippedRows` is referenced later in `handleFile` (the `UploadReview` assembly — `skippedRows,` inside the `review` object) and change it to `skippedRows: result.skippedRows,`. Confirm no other reference to the removed local `skippedRows`/`parseNum`(validation copy)/`unknownEsps` etc. remains. The aggregation loop keeps its own `parseNum` and now calls `parseRegFtdsDate`.

- [ ] **Step 4: Lint + build + tests**

Run: `npm run lint`
Expected: no new errors. Remove any now-unused imports (e.g. `isValidIpv4`) it flags.

Run: `npm run build`
Expected: succeeds.

Run: `npm run test:run`
Expected: full suite green (86).

- [ ] **Step 5: Manual sanity check (controller, optional)**

Behavior is unchanged, so this is a light confirmation rather than a new write: upload a known-bad file (e.g. one with an unknown ESP on an unregistered IP) and confirm the identical rejection warning appears; upload the real `Campaign Stats - 04-06-2026.xlsx` and confirm the review modal still shows the skipped `Ethan` row. Cancel — no write.

- [ ] **Step 6: Commit**

```bash
git add src/components/views/RegFtdsView.tsx
git commit -m "refactor(regftds): use extracted classifier + formatter in handleFile"
```

---

## Self-Review Notes

- **Spec coverage:** classifier extracted + tested (Task 2); formatter extracted + tested (Task 2); helpers relocated so lib is self-contained (Task 1); view reduced to two calls + `result.skippedRows` (Task 3); aggregation untouched (Task 3 leaves it); zero behavior change (verbatim lift + verbatim warning strings). All covered.
- **Type/name consistency:** `ValidationResult`/`RowIssue` fields and `classifyRegFtdsRows`/`formatRegFtdsWarning`/`parseRegFtdsDate` signatures identical across Tasks 1-3 and the spec.
- **No behavior change:** logic and warning text lifted verbatim; the only rename is `parseDate`→`parseRegFtdsDate` (internal).
