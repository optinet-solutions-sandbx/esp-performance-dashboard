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

describe('validateUpload — positional (Inboxroad)', () => {
  it('accepts a wide headerless file and rejects a too-narrow one', () => {
    const wideHeaders = Array.from({ length: 12 }, (_, i) => `c${i}`)
    const wideVals = ['isp', 'dom', 'x', '100', '95', 'x', 'x', 'x', 'x', '2026-03-10', '1', '0']
    const wide = build(wideHeaders, [wideVals, wideVals])
    expect(validateUpload(wide.headers, wide.rows, 'Inboxroad').ok).toBe(true)

    const narrow = build(['a', 'b', 'c'], [['1', '2', '3']])
    expect(validateUpload(narrow.headers, narrow.rows, 'Inboxroad').ok).toBe(false)
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
