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
