import { describe, it, expect } from 'vitest'
import { buildUploadPlan, applyCorrections, isSkippableRow, computeDateOverwrites, parseRegFtdsDate, isValidIpv4 } from '@/lib/regFtdsAuthority'

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
    expect(plan.hasIssues).toBe(true)
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
    expect(out).toEqual(expect.arrayContaining([
      { date: '2026-06-04', esp: 'Map', ip: '91.222.98.16', reg: 2, ftds: 0 },
      { date: '2026-06-05', esp: 'Map', ip: '91.222.98.16', reg: 1, ftds: 0 },
    ]))
  })
})

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
