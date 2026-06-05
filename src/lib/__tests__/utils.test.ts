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
