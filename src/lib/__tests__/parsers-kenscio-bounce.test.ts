import { describe, it, expect } from 'vitest'
import { parseFile } from '../parsers'

// Kenscio export: each column is an independent list of emails (a non-empty cell
// = one event). Columns: Campaign, Domain, Email-Sent, Timestamp, Delivered,
// Open, Click, Bounce (total), Soft Bounce, Hard Bounce.
// Per the client's KPI sheet (confirmed): Hard Bounce = the "Hard Bounce" column,
// Soft Bounce = the "Soft Bounce" column.
const K_HEADER =
  'Campaign Name,Domain Name,Email-Sent,Timestamp,Delivered,Open,Click,Bounce,Soft Bounce,Hard Bounce'

// soft bounce populated, no hard
const K_SOFT  = 'CAMP-test,test.com,a@gmail.com,23-06-2026 17:32,b@gmail.com,,,c@gmail.com,c@gmail.com,'
// hard bounce populated, no soft
const K_HARD  = 'CAMP-test,test.com,d@gmail.com,23-06-2026 17:32,,,,e@gmail.com,,e@gmail.com'
// clean delivered row, no bounce of any kind
const K_CLEAN = 'CAMP-test,test.com,f@gmail.com,23-06-2026 17:32,g@gmail.com,,,,,'

function kenscioFile(): File {
  const csv = [K_HEADER, K_SOFT, K_HARD, K_CLEAN].join('\n')
  return new File([csv], 'Kenscio - 23062026.csv', { type: 'text/csv' })
}

describe('parseFile — Kenscio hard/soft bounce split', () => {
  it('counts hard and soft bounces from the Hard Bounce / Soft Bounce columns', async () => {
    const res = await parseFile(kenscioFile(), 'Kenscio')
    const day = res.byDate['Jun 23']
    expect(day).toBeDefined()

    const dom = day.domains['test.com']
    expect(dom.softBounced).toBe(1)   // one soft-bounce cell
    expect(dom.hardBounced).toBe(1)   // one hard-bounce cell
    expect(dom.bounced).toBe(2)       // total Bounce column (soft row + hard row)
    expect(dom.sent).toBe(3)
    expect(dom.delivered).toBe(2)
  })
})
