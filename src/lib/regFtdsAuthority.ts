import { normalizeEspName } from '@/lib/data'

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

export interface SkippedRow { row: number; label: string }

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

// Upload dates that already exist in storage, deduped and sorted ascending.
export function computeDateOverwrites(uploadDates: string[], existingDates: string[]): string[] {
  const existing = new Set(existingDates)
  return [...new Set(uploadDates)].filter(d => existing.has(d)).sort()
}

export interface UploadReview {
  corrections: Correction[]
  unknowns: UnknownIp[]
  ambiguous: UnknownIp[]
  skippedRows: SkippedRow[]
  dateOverwrites: string[]
  hasIssues: boolean
}
