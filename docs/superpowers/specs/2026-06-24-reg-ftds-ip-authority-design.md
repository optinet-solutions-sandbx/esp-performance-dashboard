# Reg & FTDs — IP Matrix Authority at Upload

**Date:** 2026-06-24
**Status:** Design approved, pending spec review
**Area:** `src/components/views/RegFtdsView.tsx`, `src/lib/`

---

## Problem

The client reported "Reg and FTDs not matching." Investigation showed the cause is
**ESP labels in the uploaded Campaign Stats files disagreeing with the IP Matrix**
(the registry of which ESP owns which IP):

- `141.206.158.86` and `91.222.98.16` were labeled `Kenscio` in uploads, but the
  IP Matrix registers them to `Map`.
- `194.127.197.7` was labeled `Maileroo` in uploads, but the IP Matrix registers
  it to `Mailjet`.

The IP Matrix itself is correct. Only the date-stamped ledger (`reg_ftds_daily`)
carries the wrong labels.

### Why the existing mitigation doesn't cover this

The previous developer built `normalizeEspName` + `ESP_ALIASES` (`src/lib/data.ts`),
applied at upload and on load. It already cleans **name typos / case / abbreviations**
(`MM→Mailmodo`, `ongage/OG→Mailgun`). But it operates on the *name string* and cannot
resolve an **IP-level** conflict: `Kenscio` is a legitimate ESP with its own IPs, so
`Kenscio→Map` cannot be a global alias. The conflict must be resolved per-IP, using the
IP Matrix as the source of truth — which the client intuited ("are you not pulling the
data from the IPs?").

### Related immediate fix (separate from this spec)

A one-time SQL relabel of existing `reg_ftds_daily` data was produced at
`sql/2026-06-24_relabel-map-mailjet-ips.sql` (reviewable, transactional, with backup).
Evidence from the live DB: after that SQL runs, the **only** ledger↔Matrix conflicts are
those same 3 IPs, and there are **zero** unknown IPs. So existing data becomes fully
consistent once the SQL is committed; this spec covers **prevention going forward only**.

---

## Goal

Prevent mislabeled ESP data from entering `reg_ftds_daily` by making the **IP Matrix
authoritative for the ESP at upload time**, with a human confirmation step when the
file disagrees with the Matrix.

Non-goals (YAGNI):
- No retroactive re-validation tool (existing data is already clean post-SQL).
- No change to the main campaign uploads (Mailmodo/Mailgun) — they derive ESP from a
  dropdown, not a file column, so they have no conflict class.
- No per-row accept/reject in the modal (all-or-nothing).

---

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Behavior on file↔Matrix conflict | **Confirm-before-apply modal.** Show proposed corrections; Proceed applies them, Cancel blocks the whole upload. Chosen over silent auto-correct because the Matrix is user-maintained and can be stale — keep a human in the loop on disagreement. |
| Modal granularity | **All-or-nothing.** A disagreement almost always means the Matrix or the file needs fixing outside this upload. |
| IPs not in the Matrix | **Warn, allow proceed.** Shown in the modal informationally; stored under the file's label as-is. Surfaces the existing post-hoc warning at upload time instead of after. |
| Retroactive scope | **Going-forward only.** |
| Structure | **Approach B:** pure validation module + presentational modal + thin view orchestration. |

---

## Architecture & Data Flow

The fix splices one validation step into the existing `handleFile` flow. Parsing, date
validation, and the DB-write path are unchanged.

```
parse file → validate dates (unchanged)
           → aggregate rows by (date, esp, ip)   (unchanged)
           → buildUploadPlan(rows, ipMatrix)      (NEW)
                ├─ no conflicts & no unknowns → commitUpload(rows)            [silent, as today]
                └─ conflicts and/or unknowns  → open <IpAuthorityModal>
                                                   ├─ Proceed → commitUpload(applyCorrections(rows))
                                                   └─ Cancel  → abort, nothing written
```

**Authority source:** the `ip_matrix` table, **fetched fresh at validation time** (not
the cached store/localStorage copy) — decisions must be made off the current registry.
If the fetch *fails*, abort with a clear error and write nothing (do not fall back to
treating every IP as unknown). A legitimately empty Matrix is treated as "all unknown"
and shown in the modal.

ESP comparison uses `normalizeEspName` on both the file label and the Matrix label so
casing/aliases never cause spurious conflicts.

---

## Components

### `src/lib/regFtdsAuthority.ts` (new — pure, no React/Supabase)

```typescript
interface AggRow { date: string; esp: string; ip: string; reg: number; ftds: number }

interface Correction {
  ip: string
  from: string        // normalized file label, e.g. "Kenscio"
  to: string          // IP Matrix label, e.g. "Map"
  rowCount: number    // aggregated rows affected
  reg: number         // total registrations being relabeled (modal shows stakes)
  ftds: number
}

interface UnknownIp { ip: string; label: string; rowCount: number }

interface UploadPlan {
  corrections: Correction[]   // IP in Matrix, but under a different ESP than the file
  unknowns:    UnknownIp[]    // IP not in the Matrix at all
  ambiguous:   UnknownIp[]    // IP in Matrix under >1 distinct ESP — not auto-corrected
  hasIssues:   boolean        // corrections || unknowns || ambiguous non-empty
}

// Build ip -> Set<canonicalEsp> from the Matrix, then classify each row.
function buildUploadPlan(rows: AggRow[], ipMatrix: { esp: string; ip: string }[]): UploadPlan

// Relabel conflicting rows to the Matrix ESP, then RE-AGGREGATE by (date, esp, ip)
// so a relabeled row merges into an existing target row for that date+IP.
function applyCorrections(rows: AggRow[], corrections: Correction[]): AggRow[]
```

### `src/components/ui/IpAuthorityModal.tsx` (new — presentational)

Opens only when `plan.hasIssues`. Two conditionally-rendered sections — "ESP corrections
(from IP Matrix)" and "Not in IP Matrix" (plus ambiguous warnings) — styled to match the
existing dark/light mono aesthetic. Props: the plan, `onProceed`, `onCancel`. Each
correction shows `from → to`, row count, and regs at stake.

```
┌─────────────────────────────────────────────────────────────┐
│  Review before upload — Campaign Stats - 04-06-2026.xlsx      │
│  ⚠ ESP CORRECTIONS (from IP Matrix)                           │
│   • 141.206.158.86   Kenscio → Map      (19 rows, 0 reg)      │
│   • 91.222.98.16     Kenscio → Map      (19 rows, 4 reg)      │
│   • 194.127.197.7    Maileroo → Mailjet (18 rows, 0 reg)      │
│  ⓘ NOT IN IP MATRIX                                           │
│   • 203.0.113.9      (label: Hotsol, 5 rows)                  │
│         [ Cancel — don't upload ]   [ Proceed with upload ]   │
└─────────────────────────────────────────────────────────────┘
```

### `src/components/views/RegFtdsView.tsx` (modified)

- Split the tail of `handleFile` (insert upload record, delete-by-date, insert rows,
  reload store, log) into a reusable `commitUpload(rows, filename, dates)`.
- `handleFile` now: parse → validate dates → aggregate → fetch Matrix → `buildUploadPlan`.
  If `!hasIssues`, call `commitUpload` directly. Otherwise store the plan + corrected rows
  in state and open the modal.
- **Move upload-history-record creation into `commitUpload`** so a cancelled upload leaves
  zero trace (currently it is created before the write).

---

## Edge Cases & Error Handling

1. **Merge-on-relabel:** a file can contain both a `Kenscio` and a `Map` row for the same
   date+IP. After relabeling, `applyCorrections` re-aggregates into one summed row — mirrors
   the SQL's fold-then-delete.
2. **Ambiguous Matrix entry:** IP registered under two different ESPs → not auto-corrected;
   surfaced as a warning in the modal.
3. **Matrix fetch fails:** abort, write nothing, show error. Do not treat all IPs as unknown.
4. **Case/alias differences:** normalized before comparison → never flagged.
5. **Cancel = total no-op:** no insert, no history row, no store mutation.

---

## Testing

TDD — write the pure-module tests first.

**`buildUploadPlan`:**
- IP in Matrix, same ESP → no correction/unknown.
- IP in Matrix, different ESP → one correction with correct `from`/`to`.
- IP absent from Matrix → one unknown.
- Case/alias difference (`map` vs `Map`, `OG` vs `Mailgun`) → not flagged.
- IP under two ESPs in Matrix → ambiguous, not auto-corrected.
- `reg`/`ftds`/`rowCount` aggregate correctly across multiple rows per IP.

**`applyCorrections`:**
- Relabels conflicting rows to the Matrix ESP.
- Merge case: `Kenscio` + `Map` rows for same date+IP collapse into one summed `Map` row.
- Non-conflicting rows pass through untouched.
- Real-data fixture (3 client IPs across June dates) reaches the same end state as the SQL
  (Map @ 91.222.98.16 gains exactly 4 reg).

**Manual integration check:** upload a real file from `references/new-uploads` against the
dev DB; confirm the modal lists the 3 corrections, Proceed stores corrected data, Cancel
stores nothing. No automated React-render test for the modal (presentational; no component
test harness in the project).

---

## Files

| File | Change |
|------|--------|
| `src/lib/regFtdsAuthority.ts` | NEW — pure detection + correction logic |
| `src/lib/regFtdsAuthority.test.ts` | NEW — unit tests (TDD) |
| `src/components/ui/IpAuthorityModal.tsx` | NEW — presentational confirmation modal |
| `src/components/views/RegFtdsView.tsx` | MODIFIED — split `commitUpload`, add Matrix fetch + plan + modal state |
