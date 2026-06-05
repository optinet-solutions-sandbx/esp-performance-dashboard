import { describe, it, expect } from 'vitest'

describe('vitest smoke test', () => {
  it('runs and Node File global is available', () => {
    expect(typeof File).toBe('function')
    const f = new File(['hello'], 'x.csv', { type: 'text/csv' })
    expect(f.name).toBe('x.csv')
  })
})
