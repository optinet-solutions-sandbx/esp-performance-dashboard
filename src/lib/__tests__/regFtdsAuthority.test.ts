import { describe, it, expect } from 'vitest'
import { buildUploadPlan, applyCorrections } from '@/lib/regFtdsAuthority'

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
