import { describe, it, expect } from 'vitest'
import { parseDate } from '../parsers'

describe('parseDate', () => {
  it('parses dd/mm/yyyy (monthFirst=false default) to "Mon DD"', () => {
    expect(parseDate('10/03/2026')).toEqual({ str: 'Mar 10', year: 2026 })
  })

  it('auto-detects month when the second number is > 12', () => {
    // "03/15/2026": n2=15 > 12 so month=03, day=15
    expect(parseDate('03/15/2026')).toEqual({ str: 'Mar 15', year: 2026 })
  })

  it('parses ISO yyyy-mm-dd', () => {
    expect(parseDate('2026-04-03')).toEqual({ str: 'Apr 03', year: 2026 })
  })

  it('parses an Excel date serial (45292 = 2024-01-01)', () => {
    expect(parseDate(45292)).toEqual({ str: 'Jan 01', year: 2024 })
  })

  it('returns null for empty or unparseable input', () => {
    expect(parseDate('')).toBeNull()
    expect(parseDate('not a date')).toBeNull()
  })
})
