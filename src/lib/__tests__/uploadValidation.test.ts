import { describe, it, expect } from 'vitest'
import { validateUpload, UPLOAD_SCHEMAS } from '@/lib/uploadValidation'
import { ESP_LIST } from '@/lib/data'

// Helper: build row objects from a header list + value rows.
function build(headers: string[], valueRows: string[][]) {
  const rows = valueRows.map(vals => {
    const r: Record<string, string> = {}
    headers.forEach((h, i) => { r[h] = vals[i] ?? '' })
    return r
  })
  return { headers, rows }
}

describe('UPLOAD_SCHEMAS coverage', () => {
  it('has a schema for every ESP in the dropdown', () => {
    for (const esp of ESP_LIST) {
      expect(UPLOAD_SCHEMAS[esp], `missing schema for ${esp}`).toBeDefined()
    }
  })
})

describe('validateUpload — structural', () => {
  it('rejects an empty file', () => {
    const r = validateUpload([], [], 'Map')
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/no data rows/i)
  })

  it('rejects when a required column is missing', () => {
    const { headers, rows } = build(
      ['confirmed-openers', 'messages-sent', 'campaign-name'],
      [['10', '100', 'site.com - Promo']]
    )
    const r = validateUpload(headers, rows, 'Map')
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/date/i)
  })

  it('accepts a valid Map file', () => {
    const { headers, rows } = build(
      ['date', 'confirmed-openers', 'messages-sent', 'clickers', 'domains', 'campaign-name'],
      [
        ['2026-03-10', '12', '100', '4', 'gmail.com', 'site.com - Promo'],
        ['2026-03-11', '20', '200', '9', 'gmail.com', 'site.com - Promo'],
      ]
    )
    const r = validateUpload(headers, rows, 'Map')
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })
})

describe('validateUpload — content sanity', () => {
  it('rejects when too few rows have parseable dates', () => {
    const valueRows = Array.from({ length: 10 }, () => ['not-a-date', '10', '100'])
    const { headers, rows } = build(['date', 'confirmed-openers', 'messages-sent'], valueRows)
    const r = validateUpload(headers, rows, 'Map')
    expect(r.ok).toBe(false)
    expect(r.stats.validDateRatio).toBeLessThan(0.7)
  })

  it('passes with a warning when only a few rows have bad dates', () => {
    const good = Array.from({ length: 19 }, () => ['2026-03-10', '10', '100'])
    const bad = [['garbage', '10', '100']]
    const { headers, rows } = build(['date', 'confirmed-openers', 'messages-sent'], [...good, ...bad])
    const r = validateUpload(headers, rows, 'Map')
    expect(r.ok).toBe(true)
    expect(r.warnings.length).toBeGreaterThan(0)
  })
})

describe('validateUpload — mismatch hint', () => {
  it('suggests the right ESP when the wrong one is selected', () => {
    const { headers, rows } = build(
      ['sent-date', 'email-(primary-key)', 'bounce-type', 'unsub-reason'],
      [['10/03/2026', 'a@x.com', '', '']]
    )
    const r = validateUpload(headers, rows, 'Mailgun')
    expect(r.ok).toBe(false)
    expect(r.stats.suggestedEsp).toBe('Netcore')
  })
})

describe('validateUpload — Inboxroad named columns', () => {
  // Real Inboxroad export columns (post-normalisation), trimmed to what the
  // parser/validator depend on.
  const INBOXROAD_HEADERS = [
    'esp-connection-id', 'esp', 'domain-grouped-by-esp', 'sent', 'success',
    'last-stats-date', 'hard-bounces', 'soft-bounces', 'unique-opens', 'unique-clickers', 'unsubscribes',
  ]
  const inboxroadRow = () =>
    ['1094978', 'InboxRoad - rp.minometric.com', 'gmail.com', '6051', '6026',
      '09-06-2026 22:00', '4', '21', '3024', '773', '6']

  it('accepts a real Inboxroad export with named bounce columns', () => {
    const { headers, rows } = build(INBOXROAD_HEADERS, [inboxroadRow(), inboxroadRow()])
    const r = validateUpload(headers, rows, 'Inboxroad')
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it('rejects an Inboxroad file missing the Hard/Soft Bounces columns', () => {
    // This is the exact gap that silently zeroed bounces: a file without the
    // bounce columns must now be rejected, not accepted.
    const headers = INBOXROAD_HEADERS.filter(h => h !== 'hard-bounces' && h !== 'soft-bounces')
    const { rows } = build(headers, [
      ['1094978', 'InboxRoad - rp.minometric.com', 'gmail.com', '6051', '6026', '09-06-2026 22:00', '3024', '773', '6'],
    ])
    const r = validateUpload(headers, rows, 'Inboxroad')
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/hard-bounces|soft-bounces/i)
  })

  it('rejects an Inboxroad file whose bounce columns are non-numeric', () => {
    const { headers, rows } = build(INBOXROAD_HEADERS, Array.from({ length: 5 }, () =>
      ['1094978', 'InboxRoad - rp.minometric.com', 'gmail.com', '6051', '6026', '09-06-2026 22:00', 'NaN', 'oops', '3024', '773', '6']
    ))
    const r = validateUpload(headers, rows, 'Inboxroad')
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => /non-numeric/i.test(e))).toBe(true)
  })
})

describe('validateUpload — numeric column check (Map)', () => {
  it('rejects a Map file whose numeric columns contain non-numeric values', () => {
    // All 5 rows have valid dates but non-numeric messages-sent / confirmed-openers.
    // This isolates the rejection to the numeric-column check.
    const valueRows = Array.from({ length: 5 }, () => ['2026-03-10', 'abc', 'xyz'])
    const { headers, rows } = build(['date', 'confirmed-openers', 'messages-sent'], valueRows)
    const r = validateUpload(headers, rows, 'Map')
    expect(r.ok).toBe(false)
    // At least one error must mention the non-numeric column
    expect(r.errors.some(e => /non-numeric/i.test(e))).toBe(true)
  })
})

describe('validateUpload — unknown ESP', () => {
  it('returns ok:false with a "no format schema" error for an unrecognised ESP', () => {
    // The schema check runs before the empty-rows guard, so passing empty arrays
    // still hits the unknown-schema branch unambiguously.
    const r = validateUpload([], [], 'NonExistentESP')
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/no format schema/i)
  })
})

describe('validateUpload — date/numeric tolerance', () => {
  it('accepts MMS files with 2-digit-year dates (e.g. "3/24/26, 10:46 AM")', () => {
    // MMS format: date-added = "M/D/YY, H:MM AM/PM" — 2-digit year with optional time suffix.
    // Before the fix, the validator used parseDate which only handles 4-digit years,
    // resulting in validDateRatio 0 and a false rejection.
    const valueRows = Array.from({ length: 5 }, () => ['3/24/26, 10:46 AM', 'a@x.com', 'x.com'])
    const { headers, rows } = build(['date-added', 'sent-email', 'domain'], valueRows)
    const r = validateUpload(headers, rows, 'MMS')
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it('accepts Map files with Excel-serial date strings (e.g. "46100")', () => {
    // Map files exported from Excel can have dates as numeric serials stringified.
    // Before the fix, isParseableDate was not called, so "46100" (a string) passed
    // to parseDate(string) failed to match any pattern, giving validDateRatio 0.
    const valueRows = Array.from({ length: 5 }, () => ['46100', '10', '100'])
    const { headers, rows } = build(['date', 'confirmed-openers', 'messages-sent'], valueRows)
    const r = validateUpload(headers, rows, 'Map')
    expect(r.ok).toBe(true)
    expect(r.errors.some(e => /parseable date/i.test(e))).toBe(false)
  })

  it('accepts Map files where metric columns are mostly blank (sparse numeric columns)', () => {
    // The parser treats blank metric cells as 0. Before the fix, the numeric-column
    // check counted blank cells as non-numeric, falsely rejecting sparse exports.
    const allRows: string[][] = [
      ['2026-03-10', '10', '100'],  // 1 populated row
      ['2026-03-10', '', ''],
      ['2026-03-10', '', ''],
      ['2026-03-10', '', ''],
      ['2026-03-10', '', ''],
      ['2026-03-10', '', ''],
    ]
    const { headers, rows } = build(['date', 'confirmed-openers', 'messages-sent'], allRows)
    const r = validateUpload(headers, rows, 'Map')
    expect(r.ok).toBe(true)
  })

  it('still rejects Map files with genuinely non-numeric values in metric columns (regression guard)', () => {
    // Regression: text values like 'abc'/'xyz' must still be rejected.
    // This verifies the numeric fix did not over-relax the check.
    const valueRows = Array.from({ length: 5 }, () => ['2026-03-10', 'abc', 'xyz'])
    const { headers, rows } = build(['date', 'confirmed-openers', 'messages-sent'], valueRows)
    const r = validateUpload(headers, rows, 'Map')
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => /non-numeric/i.test(e))).toBe(true)
  })
})
