import { describe, it, expect } from 'vitest'
import { parseFile } from '../parsers'

// Real header + rows from a client Inboxroad export ("Inboxroad - 09062026.csv").
// Note: the export's named headers are what the parser must key off — the column
// ORDER differs from the positional layout the original branch assumed.
const HEADER =
  'Esp connection id,ESP,Domain Grouped by ESP,Targeted,Sent,Success,Success Rate,Failed,Failed Rate,' +
  'Last Stats Date,Last Sent Date,Hard Bounces,Hard Bounces Rate,Soft Bounces,Soft Bounces Rate,' +
  'Opens,Opens Rate,Unique Opens,Unique Opens Rate,Clicks,Clicks Rate,Unique Clickers,Unique Clicks Rate,' +
  'Unsubscribes,Unsubscribes Rate,Complaints,Complaints Rate,Post-backs,Post Back Clicks Rate,CTR,CTR Rate,uCTR,UCTR Rate'

// rp.rivoreport.com / gmail.com — soft bounces 5, no hard
const ROW_RIVO_GMAIL =
  '1094974,InboxRoad - rp.rivoreport.com,gmail.com,3603,3603,3598,99.86%,5,0.13%,09-06-2026 23:45,09-06-2026 16:40,' +
  '0,0%,5,0.13%,4522,125.68%,2469,68.62%,738,16.32%,716,28.99%,1,0.02%,0,0%,0,0%,0,0%,20.51,20.51%,19.89,19.89%'

// rp.minometric.com / gmail.com — hard bounces 4, soft 21, success < sent
const ROW_MINO_GMAIL =
  '1094978,InboxRoad - rp.minometric.com,gmail.com,6051,6051,6026,99.58%,25,0.41%,09-06-2026 23:45,09-06-2026 16:33,' +
  '4,0.06%,21,0.34%,5120,84.96%,3024,50.18%,807,15.76%,773,25.56%,6,0.09%,0,0%,0,0%,0,0%,13.39,13.39%,12.82,12.82%'

// rp.rivoreport.com / icloud.com — clean row, no bounces
const ROW_RIVO_ICLOUD =
  '1094974,InboxRoad - rp.rivoreport.com,icloud.com,21,21,21,100%,0,0%,09-06-2026 22:00,09-06-2026 16:40,' +
  '0,0%,0,0%,4,19.04%,4,19.04%,0,0%,0,0%,0,0%,0,0%,0,0%,0,0%,0,0%,0,0%'

function inboxroadFile(): File {
  const csv = [HEADER, ROW_RIVO_GMAIL, ROW_MINO_GMAIL, ROW_RIVO_ICLOUD].join('\n')
  return new File([csv], 'Inboxroad - 09062026.csv', { type: 'text/csv' })
}

describe('parseFile — Inboxroad named-column mapping', () => {
  it('captures hard and soft bounces from the named Hard/Soft Bounces columns', async () => {
    const res = await parseFile(inboxroadFile(), 'Inboxroad')
    const day = res.byDate['Jun 09']
    expect(day).toBeDefined()

    const mino = day.domains['rp.minometric.com']
    expect(mino.hardBounced).toBe(4)
    expect(mino.softBounced).toBe(21)
    expect(mino.bounced).toBe(25)

    const rivo = day.domains['rp.rivoreport.com']   // gmail soft 5 + icloud 0
    expect(rivo.hardBounced).toBe(0)
    expect(rivo.softBounced).toBe(5)
    expect(rivo.bounced).toBe(5)
  })

  it('groups providers by recipient ISP domain, not by Esp connection id', async () => {
    const res = await parseFile(inboxroadFile(), 'Inboxroad')
    const providers = Object.keys(res.byDate['Jun 09'].providers)
    expect(providers).toContain('gmail.com')
    expect(providers).toContain('icloud.com')
    // The connection-id numbers must never become provider keys.
    expect(providers).not.toContain('1094974')
    expect(providers).not.toContain('1094978')
  })

  it('uses Success (not Sent) as delivered', async () => {
    const res = await parseFile(inboxroadFile(), 'Inboxroad')
    const mino = res.byDate['Jun 09'].domains['rp.minometric.com']
    expect(mino.sent).toBe(6051)
    expect(mino.delivered).toBe(6026)   // Success column, not Sent
  })

  it('reads opens/clicks/unsubs from their named columns', async () => {
    const res = await parseFile(inboxroadFile(), 'Inboxroad')
    const mino = res.byDate['Jun 09'].domains['rp.minometric.com']
    expect(mino.opened).toBe(3024)        // Unique Opens
    expect(mino.clicked).toBe(773)        // Unique Clickers
    expect(mino.unsubscribed).toBe(6)     // Unsubscribes
  })
})
