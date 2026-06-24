# Reg & FTDs — IP Matrix Authority at Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the IP Matrix authoritative for the ESP at Reg & FTDs upload time, with a confirm-before-apply modal when an uploaded row's ESP label conflicts with the registry.

**Architecture:** A pure validation module (`regFtdsAuthority.ts`) classifies aggregated upload rows against the `ip_matrix` registry into corrections / unknowns / ambiguous. A presentational modal (`IpAuthorityModal.tsx`) shows the plan. `RegFtdsView` orchestrates: build plan → if clean, write directly; if issues, open modal → Proceed applies corrections and writes, Cancel writes nothing.

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5, Zustand, Supabase, Vitest.

## Global Constraints

- ESP-name comparison MUST use `normalizeEspName` from `@/lib/data` on both sides — never raw strings.
- Date keys in `reg_ftds_daily` are ISO `yyyy-mm-dd` strings (Reg & FTDs is ISO, unlike the `MmData` short-label convention).
- Authority source is the `ip_matrix` table, fetched fresh at upload time — not the cached Zustand/localStorage copy.
- Canonical aggregation key is `` `${date}|${esp.toLowerCase()}|${ip}` `` (matches existing `handleFile`).
- Tests run with `npm run test:run`; test files live in `src/lib/__tests__/` and import via the `@/` alias.
- Pure module has zero React/Supabase imports.

---

### Task 1: `buildUploadPlan` — classify rows against the IP Matrix

**Files:**
- Create: `src/lib/regFtdsAuthority.ts`
- Test: `src/lib/__tests__/regFtdsAuthority.test.ts`

**Interfaces:**
- Consumes: `normalizeEspName` from `@/lib/data`.
- Produces:
  - `interface AggRow { date: string; esp: string; ip: string; reg: number; ftds: number }`
  - `interface Correction { ip: string; from: string; to: string; rowCount: number; reg: number; ftds: number }`
  - `interface UnknownIp { ip: string; label: string; rowCount: number }`
  - `interface UploadPlan { corrections: Correction[]; unknowns: UnknownIp[]; ambiguous: UnknownIp[]; hasIssues: boolean }`
  - `function buildUploadPlan(rows: AggRow[], ipMatrix: { esp: string; ip: string }[]): UploadPlan`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/regFtdsAuthority.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildUploadPlan } from '@/lib/regFtdsAuthority'

const MATRIX = [
  { esp: 'Map',     ip: '91.222.98.16' },
  { esp: 'Map',     ip: '141.206.158.86' },
  { esp: 'Mailjet', ip: '194.127.197.7' },
  { esp: 'Mailgun', ip: '204.220.178.30' },
]

const row = (esp: string, ip: string, reg = 0, ftds = 0, date = '2026-06-04') =>
  ({ date, esp, ip, reg, ftds })

describe('buildUploadPlan', () => {
  it('returns no issues when every row matches the matrix', () => {
    const plan = buildUploadPlan([row('Map', '91.222.98.16', 5)], MATRIX)
    expect(plan.hasIssues).toBe(false)
    expect(plan.corrections).toEqual([])
    expect(plan.unknowns).toEqual([])
    expect(plan.ambiguous).toEqual([])
  })

  it('flags a correction when the IP belongs to a different ESP in the matrix', () => {
    const plan = buildUploadPlan([row('Kenscio', '91.222.98.16', 2)], MATRIX)
    expect(plan.hasIssues).toBe(true)
    expect(plan.corrections).toHaveLength(1)
    expect(plan.corrections[0]).toMatchObject({
      ip: '91.222.98.16', from: 'Kenscio', to: 'Map', rowCount: 1, reg: 2, ftds: 0,
    })
  })

  it('aggregates rowCount/reg/ftds across multiple rows for one IP', () => {
    const plan = buildUploadPlan(
      [row('Kenscio', '91.222.98.16', 2), row('Kenscio', '91.222.98.16', 1, 3)],
      MATRIX,
    )
    expect(plan.corrections[0]).toMatchObject({ rowCount: 2, reg: 3, ftds: 3 })
  })

  it('flags an unknown IP not present in the matrix', () => {
    const plan = buildUploadPlan([row('Hotsol', '203.0.113.9', 5)], MATRIX)
    expect(plan.unknowns).toEqual([{ ip: '203.0.113.9', label: 'Hotsol', rowCount: 1 }])
    expect(plan.corrections).toEqual([])
  })

  it('does NOT flag case/alias-only differences as conflicts', () => {
    // 'OG' normalizes to 'Mailgun'; 'map' normalizes to 'Map'
    const plan = buildUploadPlan(
      [row('OG', '204.220.178.30'), row('map', '91.222.98.16')],
      MATRIX,
    )
    expect(plan.hasIssues).toBe(false)
  })

  it('flags an IP registered under two different ESPs as ambiguous, not a correction', () => {
    const ambiguousMatrix = [
      { esp: 'Map', ip: '10.0.0.1' },
      { esp: 'Kenscio', ip: '10.0.0.1' },
    ]
    const plan = buildUploadPlan([row('Hotsol', '10.0.0.1')], ambiguousMatrix)
    expect(plan.ambiguous).toEqual([{ ip: '10.0.0.1', label: 'Hotsol', rowCount: 1 }])
    expect(plan.corrections).toEqual([])
    expect(plan.hasIssues).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/lib/__tests__/regFtdsAuthority.test.ts`
Expected: FAIL — `buildUploadPlan` is not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/regFtdsAuthority.ts`:

```typescript
import { normalizeEspName } from './data'

export interface AggRow { date: string; esp: string; ip: string; reg: number; ftds: number }

export interface Correction {
  ip: string
  from: string
  to: string
  rowCount: number
  reg: number
  ftds: number
}

export interface UnknownIp { ip: string; label: string; rowCount: number }

export interface UploadPlan {
  corrections: Correction[]
  unknowns: UnknownIp[]
  ambiguous: UnknownIp[]
  hasIssues: boolean
}

// Classify each aggregated upload row against the IP Matrix:
//  - IP in matrix under a different canonical ESP  -> correction
//  - IP absent from matrix                         -> unknown
//  - IP in matrix under >1 distinct ESP            -> ambiguous (not auto-corrected)
export function buildUploadPlan(
  rows: AggRow[],
  ipMatrix: { esp: string; ip: string }[],
): UploadPlan {
  const ipToEsps = new Map<string, Set<string>>()
  for (const m of ipMatrix) {
    const ip = String(m.ip ?? '').trim()
    const esp = normalizeEspName(String(m.esp ?? ''))
    if (!ip || !esp) continue
    if (!ipToEsps.has(ip)) ipToEsps.set(ip, new Set())
    ipToEsps.get(ip)!.add(esp)
  }

  const corrMap = new Map<string, Correction>()
  const unknownMap = new Map<string, UnknownIp>()
  const ambiguousMap = new Map<string, UnknownIp>()

  for (const r of rows) {
    const ip = String(r.ip ?? '').trim()
    if (!ip) continue
    const esp = normalizeEspName(String(r.esp ?? ''))
    const matrixEsps = ipToEsps.get(ip)

    if (!matrixEsps) {
      const u = unknownMap.get(ip) ?? { ip, label: esp, rowCount: 0 }
      u.rowCount += 1
      unknownMap.set(ip, u)
      continue
    }
    if (matrixEsps.size > 1) {
      const a = ambiguousMap.get(ip) ?? { ip, label: esp, rowCount: 0 }
      a.rowCount += 1
      ambiguousMap.set(ip, a)
      continue
    }
    const target = [...matrixEsps][0]
    if (esp !== target) {
      const c = corrMap.get(ip) ?? { ip, from: esp, to: target, rowCount: 0, reg: 0, ftds: 0 }
      c.rowCount += 1
      c.reg += r.reg
      c.ftds += r.ftds
      corrMap.set(ip, c)
    }
  }

  const corrections = [...corrMap.values()]
  const unknowns = [...unknownMap.values()]
  const ambiguous = [...ambiguousMap.values()]
  return {
    corrections,
    unknowns,
    ambiguous,
    hasIssues: corrections.length > 0 || unknowns.length > 0 || ambiguous.length > 0,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/lib/__tests__/regFtdsAuthority.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/regFtdsAuthority.ts src/lib/__tests__/regFtdsAuthority.test.ts
git commit -m "feat(regftds): add buildUploadPlan IP-Matrix classifier"
```

---

### Task 2: `applyCorrections` — relabel conflicting rows and re-aggregate

**Files:**
- Modify: `src/lib/regFtdsAuthority.ts` (add export)
- Test: `src/lib/__tests__/regFtdsAuthority.test.ts` (add cases)

**Interfaces:**
- Consumes: `AggRow`, `Correction` (Task 1), `normalizeEspName`.
- Produces: `function applyCorrections(rows: AggRow[], corrections: Correction[]): AggRow[]`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/regFtdsAuthority.test.ts`:

```typescript
import { applyCorrections } from '@/lib/regFtdsAuthority'

describe('applyCorrections', () => {
  const corr = { ip: '91.222.98.16', from: 'Kenscio', to: 'Map', rowCount: 1, reg: 0, ftds: 0 }

  it('relabels every row for a corrected IP to the matrix ESP', () => {
    const out = applyCorrections(
      [{ date: '2026-06-07', esp: 'Kenscio', ip: '91.222.98.16', reg: 1, ftds: 0 }],
      [corr],
    )
    expect(out).toEqual([{ date: '2026-06-07', esp: 'Map', ip: '91.222.98.16', reg: 1, ftds: 0 }])
  })

  it('merges a relabeled row into the existing target row for the same date+IP', () => {
    const out = applyCorrections(
      [
        { date: '2026-06-04', esp: 'Kenscio', ip: '91.222.98.16', reg: 2, ftds: 0 },
        { date: '2026-06-04', esp: 'Map',     ip: '91.222.98.16', reg: 1, ftds: 1 },
      ],
      [corr],
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({ date: '2026-06-04', esp: 'Map', ip: '91.222.98.16', reg: 3, ftds: 1 })
  })

  it('leaves non-corrected rows untouched', () => {
    const rows = [{ date: '2026-06-04', esp: 'Mailgun', ip: '204.220.178.30', reg: 9, ftds: 2 }]
    expect(applyCorrections(rows, [corr])).toEqual(rows)
  })

  it('does not merge rows for different dates', () => {
    const out = applyCorrections(
      [
        { date: '2026-06-04', esp: 'Kenscio', ip: '91.222.98.16', reg: 2, ftds: 0 },
        { date: '2026-06-05', esp: 'Map',     ip: '91.222.98.16', reg: 1, ftds: 0 },
      ],
      [corr],
    )
    expect(out).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/lib/__tests__/regFtdsAuthority.test.ts`
Expected: FAIL — `applyCorrections` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/regFtdsAuthority.ts`:

```typescript
// Relabel every row whose IP has a correction to the matrix ESP, then
// re-aggregate by (date, esp, ip) so a relabeled row folds into any existing
// target row for that date+IP (mirrors the one-time SQL's fold-then-delete).
export function applyCorrections(rows: AggRow[], corrections: Correction[]): AggRow[] {
  const targetByIp = new Map<string, string>()
  for (const c of corrections) targetByIp.set(c.ip, c.to)

  const agg = new Map<string, AggRow>()
  for (const r of rows) {
    const ip = String(r.ip ?? '').trim()
    const esp = targetByIp.get(ip) ?? r.esp
    const key = `${r.date}|${normalizeEspName(esp).toLowerCase()}|${ip}`
    const prev = agg.get(key)
    if (prev) {
      prev.reg += r.reg
      prev.ftds += r.ftds
    } else {
      agg.set(key, { date: r.date, esp, ip, reg: r.reg, ftds: r.ftds })
    }
  }
  return [...agg.values()]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/lib/__tests__/regFtdsAuthority.test.ts`
Expected: PASS (10 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/regFtdsAuthority.ts src/lib/__tests__/regFtdsAuthority.test.ts
git commit -m "feat(regftds): add applyCorrections relabel + re-aggregate"
```

---

### Task 3: `IpAuthorityModal` presentational component

**Files:**
- Create: `src/components/ui/IpAuthorityModal.tsx`

**Interfaces:**
- Consumes: `UploadPlan` from `@/lib/regFtdsAuthority`.
- Produces: default-exported React component
  `IpAuthorityModal({ plan, filename, isLight, onProceed, onCancel }: { plan: UploadPlan; filename: string; isLight: boolean; onProceed: () => void; onCancel: () => void })`

This component is presentational (no logic worth a unit test, and the project has no React-render test harness). Verify via typecheck/lint + the manual check in Task 4.

- [ ] **Step 1: Write the component**

Create `src/components/ui/IpAuthorityModal.tsx`:

```tsx
'use client'
import type { UploadPlan } from '@/lib/regFtdsAuthority'

export default function IpAuthorityModal({
  plan, filename, isLight, onProceed, onCancel,
}: {
  plan: UploadPlan
  filename: string
  isLight: boolean
  onProceed: () => void
  onCancel: () => void
}) {
  const surf  = isLight ? 'bg-white' : 'bg-[#111418]'
  const bdr   = isLight ? 'border-black/10' : 'border-white/7'
  const txt   = isLight ? 'text-gray-900' : 'text-[#f0f2f5]'
  const muted = isLight ? 'text-gray-500' : 'text-[#6b7280]'
  const teal  = isLight ? '#006a5b' : '#00e5c3'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className={`w-full max-w-lg rounded-2xl border p-6 ${surf} ${bdr} max-h-[85vh] overflow-y-auto`}>
        <div className={`text-[11px] font-mono tracking-widest uppercase mb-1 ${muted}`}>
          Review before upload
        </div>
        <div className={`text-sm font-semibold mb-4 ${txt}`}>{filename}</div>

        {plan.corrections.length > 0 && (
          <div className="mb-4">
            <div className="text-[11px] font-mono uppercase tracking-wider mb-2" style={{ color: teal }}>
              ⚠ ESP corrections (from IP Matrix)
            </div>
            <div className={`text-[11px] font-mono mb-2 ${muted}`}>
              These rows will be relabeled to match the IP Matrix:
            </div>
            <div className="space-y-1">
              {plan.corrections.map(c => (
                <div key={c.ip} className={`text-[11px] font-mono flex justify-between gap-3 ${txt}`}>
                  <span>{c.ip}</span>
                  <span><span className={muted}>{c.from}</span> → <span className="font-semibold">{c.to}</span></span>
                  <span className={muted}>{c.rowCount} row{c.rowCount !== 1 ? 's' : ''}, {c.reg} reg</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {plan.ambiguous.length > 0 && (
          <div className="mb-4">
            <div className={`text-[11px] font-mono uppercase tracking-wider mb-2 ${isLight ? 'text-amber-700' : 'text-[#ffd166]'}`}>
              ⚠ Registered under multiple ESPs
            </div>
            <div className={`text-[11px] font-mono mb-2 ${muted}`}>
              Stored under the file&apos;s label as-is — fix the IP Matrix to resolve:
            </div>
            <div className="space-y-1">
              {plan.ambiguous.map(a => (
                <div key={a.ip} className={`text-[11px] font-mono flex justify-between gap-3 ${txt}`}>
                  <span>{a.ip}</span>
                  <span className={muted}>label: {a.label}, {a.rowCount} row{a.rowCount !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {plan.unknowns.length > 0 && (
          <div className="mb-4">
            <div className={`text-[11px] font-mono uppercase tracking-wider mb-2 ${muted}`}>
              ⓘ Not in IP Matrix
            </div>
            <div className={`text-[11px] font-mono mb-2 ${muted}`}>
              Stored under the file&apos;s label as-is — consider registering:
            </div>
            <div className="space-y-1">
              {plan.unknowns.map(u => (
                <div key={u.ip} className={`text-[11px] font-mono flex justify-between gap-3 ${txt}`}>
                  <span>{u.ip}</span>
                  <span className={muted}>label: {u.label}, {u.rowCount} row{u.rowCount !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className={`px-3 py-2 rounded-lg border text-[11px] font-mono uppercase tracking-wider transition-all
              border-[#ff4757]/40 text-[#ff4757] hover:bg-[#ff4757]/10`}
          >
            Cancel — don&apos;t upload
          </button>
          <button
            onClick={onProceed}
            className="px-4 py-2 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider
              bg-[rgb(0,229,195)] hover:bg-[rgb(0,200,170)] text-[#0a1628]"
          >
            Proceed with upload
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck / lint the new file**

Run: `npm run lint`
Expected: no errors for `IpAuthorityModal.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/IpAuthorityModal.tsx
git commit -m "feat(regftds): add IpAuthorityModal confirmation component"
```

---

### Task 4: Wire validation + modal into `RegFtdsView`

**Files:**
- Modify: `src/components/views/RegFtdsView.tsx`

**Interfaces:**
- Consumes: `buildUploadPlan`, `applyCorrections`, `UploadPlan`, `AggRow` from `@/lib/regFtdsAuthority`; `IpAuthorityModal` from `@/components/ui/IpAuthorityModal`; existing `supabase`, `normalizeEspName`, `isValidIsoDate`.
- Produces: no new exports; behavior change only.

This task refactors `handleFile` so its DB-write tail becomes `commitUpload`, inserts the plan gate, and renders the modal. Verified by lint + manual upload against the dev DB.

- [ ] **Step 1: Add imports and modal state**

In `src/components/views/RegFtdsView.tsx`, update the import from `@/lib/data` and add two imports below it:

```typescript
import { ESP_COLORS, normalizeEspName } from '@/lib/data'
import { buildUploadPlan, applyCorrections, type UploadPlan, type AggRow } from '@/lib/regFtdsAuthority'
import IpAuthorityModal from '@/components/ui/IpAuthorityModal'
```

Add state alongside the existing `useState` hooks (after the `expandedEsps` state near line 50):

```typescript
  const [pending, setPending] = useState<{ plan: UploadPlan; rows: AggRow[]; filename: string } | null>(null)
```

- [ ] **Step 2: Extract `commitUpload` from the tail of `handleFile`**

Replace the block in `handleFile` that starts at `const datesArr = [...uniqueDates]` and runs through `setLog({ ... })` (currently ~lines 220-252) with this single call:

```typescript
      const rows: AggRow[] = [...aggregated.values()]

      // Gate on IP-Matrix authority (fetch the registry fresh — decisions must
      // reflect the current matrix, not the cached store copy).
      const { data: matrixRows, error: matrixErr } = await supabase
        .from('ip_matrix')
        .select('esp, ip')
      if (matrixErr) {
        setWarning('Could not load the IP Matrix to validate this upload. Nothing was uploaded — please try again.')
        return
      }

      const plan = buildUploadPlan(rows, matrixRows ?? [])
      if (!plan.hasIssues) {
        await commitUpload(rows, file.name)
      } else {
        setPending({ plan, rows, filename: file.name })
      }
```

Then add the new `commitUpload` function immediately after `handleFile` (before `handleDeleteUpload`):

```typescript
  async function commitUpload(rows: AggRow[], filename: string) {
    const datesArr = [...new Set(rows.map(r => r.date))]

    const { data: uploadRec } = await supabase
      .from('reg_ftds_uploads')
      .insert({ filename, rows: rows.length, dates: datesArr })
      .select('id')
      .single()
    const uploadId = uploadRec?.id

    await supabase.from('reg_ftds_daily').delete().in('date', datesArr)

    const toInsert = rows.map(a => ({
      date: a.date, esp: a.esp, ip: a.ip,
      registrations: a.reg, ftds: a.ftds,
      upload_id: uploadId ?? null,
    }))
    await supabase.from('reg_ftds_daily').insert(toInsert)

    const { data: allRows } = await supabase
      .from('reg_ftds_daily')
      .select('id, upload_id, date, esp, ip, registrations, ftds')
      .order('date', { ascending: true })
    setRegFtdsDaily((allRows ?? []).filter(r => isValidIsoDate(r.date)).map(r => ({
      id: r.id, upload_id: r.upload_id, date: r.date, esp: normalizeEspName(r.esp), ip: r.ip,
      registrations: r.registrations ?? 0, ftds: r.ftds ?? 0,
    })))

    await fetchUploadHistory()
    await addLog('upload', `Reg & FTDs — ${filename}`, `${toInsert.length} IP records across ${datesArr.length} date(s)`)
    setLog({ inserted: toInsert.length, dates: datesArr.length, rows: rows.length })
  }
```

Note: `setProcessing(false)` remains in the existing `finally` block of `handleFile`, so the button re-enables while the modal is open.

- [ ] **Step 3: Add modal handlers and render the modal**

Add these handlers after `commitUpload`:

```typescript
  async function handleModalProceed() {
    if (!pending) return
    setProcessing(true)
    try {
      const corrected = applyCorrections(pending.rows, pending.plan.corrections)
      await commitUpload(corrected, pending.filename)
    } finally {
      setProcessing(false)
      setPending(null)
    }
  }

  function handleModalCancel() {
    setPending(null)
  }
```

In the JSX `return`, add the modal as the first child inside the outermost `<div className="p-6 space-y-5">`:

```tsx
      {pending && (
        <IpAuthorityModal
          plan={pending.plan}
          filename={pending.filename}
          isLight={isLight}
          onProceed={handleModalProceed}
          onCancel={handleModalCancel}
        />
      )}
```

- [ ] **Step 4: Lint and build**

Run: `npm run lint`
Expected: no new errors.

Run: `npm run build`
Expected: build succeeds (compiles `RegFtdsView` and the new modules).

- [ ] **Step 5: Manual verification against the dev DB**

Start the dev server: `npm run dev`. In the Reg & FTDs view, upload `references/new-uploads/Campaign Stats - 04-06-2026.xlsx`.
Expected: the modal appears listing corrections for `141.206.158.86` (Kenscio→Map), `91.222.98.16` (Kenscio→Map), and `194.127.197.7` (Maileroo→Mailjet).
- Click **Cancel** → confirm no new row appears in Upload History (nothing written).
- Re-upload, click **Proceed** → confirm the data stores with `Map`/`Mailjet` labels and no `Kenscio`/`Maileroo` entries for those IPs in the per-ESP breakdown.

- [ ] **Step 6: Commit**

```bash
git add src/components/views/RegFtdsView.tsx
git commit -m "feat(regftds): gate uploads on IP-Matrix authority with confirm modal"
```

---

## Self-Review Notes

- **Spec coverage:** confirm-before-apply modal (Task 3 + 4), all-or-nothing Proceed/Cancel (Task 4 handlers), unknown-IP warn-and-proceed (modal section + plan), ambiguous handling (Task 1 + modal), fresh Matrix fetch + fail-closed (Task 4 Step 2), merge-on-relabel (Task 2), cancel = no-op incl. no history row (commitUpload now owns history insert). All covered.
- **Going-forward only / no retroactive tool:** no task adds one — matches the spec non-goal.
- **No campaign-upload changes:** only `RegFtdsView` and `lib`/`ui` files touched.
