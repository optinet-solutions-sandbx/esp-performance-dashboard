import { describe, it, expect } from 'vitest'
import type { DateMetrics } from '../types'
import {
  getEspStatus,
  aggDates,
  isEspHidden,
  visibleEsps,
  visibleEspNames,
  visibleEspData,
} from '../utils'

// Build a full DateMetrics from the fields aggDates actually reads.
function dm(p: Partial<DateMetrics>): DateMetrics {
  return {
    sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0,
    deliveryRate: 0, openRate: 0, clickRate: 0, bounceRate: 0,
    ...p,
  }
}

describe('getEspStatus (bounceRate, deliveryRate)', () => {
  it('healthy when delivery > 95 and bounce < 2', () => {
    expect(getEspStatus(1, 98)).toBe('healthy')
  })
  it('warn when delivery in 70..95', () => {
    expect(getEspStatus(1, 90)).toBe('warn')
  })
  it('warn when bounce in 2..10', () => {
    expect(getEspStatus(5, 98)).toBe('warn')
  })
  it('critical when delivery < 70', () => {
    expect(getEspStatus(1, 60)).toBe('critical')
  })
  it('critical when bounce > 10', () => {
    expect(getEspStatus(15, 98)).toBe('critical')
  })
  it('boundaries are exclusive: bounce==2, delivery==95 is healthy', () => {
    expect(getEspStatus(2, 95)).toBe('healthy')
  })
  it('boundary: bounce==10, delivery==70 is warn (not critical)', () => {
    expect(getEspStatus(10, 70)).toBe('warn')
  })
})

describe('aggDates', () => {
  const byDate: Record<string, DateMetrics> = {
    'Mar 10': dm({ sent: 100, delivered: 90, opened: 45, clicked: 9, bounced: 5, deliveryRate: 90 }),
    'Mar 11': dm({ sent: 200, delivered: 180, opened: 90, clicked: 18, bounced: 10, deliveryRate: 90 }),
  }

  it('sums metrics across the named dates', () => {
    const r = aggDates(byDate, ['Mar 10', 'Mar 11'])!
    expect(r.sent).toBe(300)
    expect(r.delivered).toBe(270)
    expect(r.opened).toBe(135)
    expect(r.clicked).toBe(27)
    expect(r.bounced).toBe(15)
  })

  it('recomputes rates from totals, does NOT sum per-date rates', () => {
    const r = aggDates(byDate, ['Mar 10', 'Mar 11'])!
    expect(r.deliveryRate).toBeCloseTo(90, 5)   // 270/300, not 90+90
    expect(r.openRate).toBeCloseTo(50, 5)        // 135/270
    expect(r.clickRate).toBeCloseTo(20, 5)       // 27/135
    expect(r.bounceRate).toBeCloseTo(5, 5)       // 15/300
  })

  it('ignores dates not present in byDate', () => {
    const r = aggDates(byDate, ['Mar 10', 'Mar 99'])!
    expect(r.sent).toBe(100)
  })

  it('returns null when total sent is 0', () => {
    expect(aggDates({}, ['Mar 10'])).toBeNull()
  })
})

describe('visibility helpers', () => {
  it('isEspHidden', () => {
    expect(isEspHidden('A', ['A', 'B'])).toBe(true)
    expect(isEspHidden('C', ['A', 'B'])).toBe(false)
  })
  it('visibleEsps filters by name', () => {
    expect(visibleEsps([{ name: 'A' }, { name: 'B' }], ['A'])).toEqual([{ name: 'B' }])
  })
  it('visibleEsps returns all when nothing hidden', () => {
    const list = [{ name: 'A' }, { name: 'B' }]
    expect(visibleEsps(list, [])).toBe(list)
  })
  it('visibleEspNames filters keys', () => {
    expect(visibleEspNames({ A: 1, B: 2, C: 3 }, ['B'])).toEqual(['A', 'C'])
  })
  it('visibleEspData drops hidden keys', () => {
    expect(visibleEspData({ A: 1, B: 2, C: 3 }, ['B'])).toEqual({ A: 1, C: 3 })
  })
})

import type { MmData, EspRecord } from '../types'
import { mergeMmData, overwriteMmData, syncEspFromData } from '../utils'

// A full DateMetrics with the five core counters set.
function met(sent: number, delivered: number, opened: number, clicked: number, bounced: number): DateMetrics {
  return {
    sent, delivered, opened, clicked, bounced,
    hardBounced: 0, softBounced: 0, unsubscribed: 0, complained: 0,
    deliveryRate: sent ? (delivered / sent) * 100 : 0,
    openRate: delivered ? (opened / delivered) * 100 : 0,
    clickRate: opened ? (clicked / opened) * 100 : 0,
    bounceRate: sent ? (bounced / sent) * 100 : 0,
  }
}

// Minimal single-date MmData with one provider and one domain on that date.
function mm(date: string, m: DateMetrics): MmData {
  return {
    dates: [date],
    datesFull: [{ label: date, year: 2026, iso: '2026-03-10' }],
    providers: { 'gmail.com': { overall: m, byDate: { [date]: m } } },
    domains: { 'example.com': { overall: m, byDate: { [date]: m } } },
    overallByDate: { [date]: m },
    providerDomains: {},
  }
}

describe('overwriteMmData vs mergeMmData (the double-count footgun)', () => {
  it('overwriteMmData REPLACES a re-uploaded date (no doubling)', () => {
    const base = mm('Mar 10', met(100, 90, 45, 9, 5))
    const override = mm('Mar 10', met(100, 90, 45, 9, 5))
    const r = overwriteMmData(base, override)
    expect(r.overallByDate['Mar 10'].sent).toBe(100)
    expect(r.providers['gmail.com'].overall.sent).toBe(100)
  })

  it('mergeMmData ACCUMULATES the same re-uploaded date (doubles)', () => {
    const base = mm('Mar 10', met(100, 90, 45, 9, 5))
    const override = mm('Mar 10', met(100, 90, 45, 9, 5))
    const r = mergeMmData(base, override)
    expect(r.overallByDate['Mar 10'].sent).toBe(200)
  })

  it('overwriteMmData leaves non-overlapping dates untouched and adds new ones', () => {
    const base = mm('Mar 10', met(100, 90, 45, 9, 5))
    const override: MmData = {
      ...mm('Mar 11', met(50, 50, 25, 5, 0)),
      datesFull: [{ label: 'Mar 11', year: 2026, iso: '2026-03-11' }],
    }
    const r = overwriteMmData(base, override)
    expect(r.dates.sort()).toEqual(['Mar 10', 'Mar 11'])
    expect(r.overallByDate['Mar 10'].sent).toBe(100)
    expect(r.overallByDate['Mar 11'].sent).toBe(50)
  })
})

describe('syncEspFromData', () => {
  const baseEsp: EspRecord = {
    name: 'X', color: '#fff',
    sent: 0, delivered: 0, opens: 0, clicks: 0, bounced: 0, unsub: 0,
    deliveryRate: 0, openRate: 0, clickRate: 0, bounceRate: 0, unsubRate: 0,
    status: 'healthy',
  }

  it('computes KPIs and status from overallByDate', () => {
    const data = mm('Mar 10', met(100, 90, 45, 9, 5))
    const r = syncEspFromData(baseEsp, data)
    expect(r.sent).toBe(100)
    expect(r.delivered).toBe(90)
    expect(r.opens).toBe(45)
    expect(r.clicks).toBe(9)
    expect(r.deliveryRate).toBeCloseTo(90, 5)
    expect(r.openRate).toBeCloseTo(50, 5)
    expect(r.clickRate).toBeCloseTo(20, 5)
    expect(r.bounceRate).toBeCloseTo(5, 5)
    expect(r.status).toBe('warn') // bounce 5 > 2
  })
})
