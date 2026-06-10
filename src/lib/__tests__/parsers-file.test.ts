import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseFile } from '../parsers'

function fixtureFile(name: string): File {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
  const text = readFileSync(path, 'utf8')
  return new File([text], name, { type: 'text/csv' })
}

describe('parseFile — Mailmodo format', () => {
  it('detects mailmodo, dates, providers and sending domain', async () => {
    const r = await parseFile(fixtureFile('mailmodo.csv'))

    expect(r.format).toBe('mailmodo')
    expect(r.dates).toEqual(['Mar 10'])

    const day = r.byDate['Mar 10']
    expect(day.rows).toBe(3)

    // recipient providers grouped by email domain
    expect(day.providers['gmail.com'].sent).toBe(2)       // user1 + user3
    expect(day.providers['gmail.com'].delivered).toBe(1)  // only user1 delivered
    expect(day.providers['gmail.com'].opened).toBe(1)     // user1
    expect(day.providers['gmail.com'].bounced).toBe(1)    // user3
    expect(day.providers['yahoo.com'].sent).toBe(1)

    // sending domain extracted from campaign-name prefix
    expect(day.domains['example.com'].sent).toBe(3)
    expect(day.domains['example.com'].delivered).toBe(2)
    expect(day.domains['example.com'].opened).toBe(1)
  })
})

describe('parseFile — generic format', () => {
  it('falls back to generic detection and maps numeric metric columns', async () => {
    const r = await parseFile(fixtureFile('generic.csv'))

    expect(r.format).toBe('generic')
    expect(r.dates).toEqual(['Mar 11'])

    const day = r.byDate['Mar 11']
    expect(day.rows).toBe(2)
    expect(day.providers['gmail.com'].sent).toBe(1)
    expect(day.providers['gmail.com'].delivered).toBe(1)
    expect(day.providers['gmail.com'].opened).toBe(1)
    expect(day.providers['hotmail.com'].sent).toBe(1)

    // generic format has no campaign-name, so sending domain is "unknown"
    expect(day.domains['unknown'].sent).toBe(2)
    expect(day.domains['unknown'].delivered).toBe(2)
  })
})

describe('parseFile — Map format', () => {
  it('detects map format, parses dd-mm-yyyy date, provider domain, sending domain, and all metrics', async () => {
    const r = await parseFile(fixtureFile('map.csv'))

    expect(r.format).toBe('map')
    expect(r.dates).toEqual(['Jan 01'])

    const day = r.byDate['Jan 01']

    // recipient provider grouping
    expect(day.providers['gmail.com'].sent).toBe(1000)
    expect(day.providers['gmail.com'].delivered).toBe(985)       // 1000 - 10 - 5
    expect(day.providers['gmail.com'].opened).toBe(150)
    expect(day.providers['gmail.com'].clicked).toBe(50)
    expect(day.providers['gmail.com'].bounced).toBe(15)          // 10 + 5
    expect(day.providers['gmail.com'].hardBounced).toBe(10)
    expect(day.providers['gmail.com'].softBounced).toBe(5)
    expect(day.providers['gmail.com'].unsubscribed).toBe(2)

    expect(day.providers['yahoo.com'].sent).toBe(250)
    expect(day.providers['yahoo.com'].delivered).toBe(248)       // 250 - 0 - 2
    expect(day.providers['yahoo.com'].bounced).toBe(2)
    expect(day.providers['yahoo.com'].unsubscribed).toBe(0)

    // sending domain extracted from campaign name (su. prefix stripped)
    expect(day.domains['testdomain.com'].sent).toBe(1250)
    expect(day.domains['testdomain.com'].delivered).toBe(1233)   // 985 + 248
    expect(day.domains['testdomain.com'].opened).toBe(180)       // 150 + 30
    expect(day.domains['testdomain.com'].clicked).toBe(60)       // 50 + 10
    expect(day.domains['testdomain.com'].bounced).toBe(17)       // 15 + 2
  })
})
