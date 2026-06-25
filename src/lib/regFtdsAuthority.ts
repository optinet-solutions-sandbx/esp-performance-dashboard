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
