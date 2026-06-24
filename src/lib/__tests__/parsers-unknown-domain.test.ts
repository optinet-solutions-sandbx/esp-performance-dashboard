import { describe, it, expect } from 'vitest'
import { unknownDomainSends, type ParseResult } from '@/lib/parsers'

// Minimal structural fixture — the helper only reads byDate[*].domains[*].sent.
const make = (byDate: Record<string, Record<string, number>>): ParseResult => ({
  byDate: Object.fromEntries(
    Object.entries(byDate).map(([date, domains]) => [
      date,
      { rows: 0, providers: {}, providerDomains: {},
        domains: Object.fromEntries(Object.entries(domains).map(([d, sent]) => [d, { sent }])) },
    ]),
  ),
} as unknown as ParseResult)

describe('unknownDomainSends', () => {
  it('sums the "unknown" bucket sent across dates', () => {
    const parsed = make({
      '2026-06-01': { 'site.com': 10, unknown: 3 },
      '2026-06-02': { unknown: 4 },
    })
    expect(unknownDomainSends(parsed)).toBe(7)
  })

  it('returns 0 when no "unknown" bucket exists', () => {
    expect(unknownDomainSends(make({ '2026-06-01': { 'site.com': 10 } }))).toBe(0)
  })

  it('returns 0 for empty byDate', () => {
    expect(unknownDomainSends(make({}))).toBe(0)
  })

  it('counts only the "unknown" bucket, not real domains', () => {
    expect(unknownDomainSends(make({ '2026-06-01': { 'a.com': 5, 'b.com': 6, unknown: 2 } }))).toBe(2)
  })
})
