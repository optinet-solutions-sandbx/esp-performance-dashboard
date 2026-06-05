import type { AIContextInput } from './types'

const SYSTEM_PREFIX = `You are an email deliverability analyst assistant for an ESP Performance Dashboard. Answer questions using only the data provided below. Be concise, use numbers, and format tables with markdown when helpful. If requested data isn't available, say so clearly.`

export function buildAIContext(input: AIContextInput): string {
  const { esps, espData, ipmData, throttleData } = input

  if (esps.length === 0) {
    return `${SYSTEM_PREFIX}\n\nNo ESP data is currently loaded in the dashboard.`
  }

  const lines: string[] = [SYSTEM_PREFIX, '']

  // 1. Overall totals
  const totalSent = esps.reduce((s, e) => s + e.sent, 0)
  const totalDelivered = esps.reduce((s, e) => s + e.delivered, 0)
  const totalOpened = esps.reduce((s, e) => s + e.opens, 0)
  const totalClicked = esps.reduce((s, e) => s + e.clicks, 0)
  const totalBounced = esps.reduce((s, e) => s + e.bounced, 0)
  const overallDeliveryRate = totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0
  const overallBounceRate = totalSent > 0 ? (totalBounced / totalSent) * 100 : 0
  const overallOpenRate = totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0

  lines.push('## Overall Totals (All ESPs)')
  lines.push(`- Total Sent: ${totalSent.toLocaleString()}`)
  lines.push(`- Total Delivered: ${totalDelivered.toLocaleString()}`)
  lines.push(`- Total Opened: ${totalOpened.toLocaleString()}`)
  lines.push(`- Total Clicked: ${totalClicked.toLocaleString()}`)
  lines.push(`- Overall Delivery Rate: ${overallDeliveryRate.toFixed(2)}%`)
  lines.push(`- Overall Bounce Rate: ${overallBounceRate.toFixed(2)}%`)
  lines.push(`- Overall Open Rate: ${overallOpenRate.toFixed(2)}%`)
  lines.push('')

  // 2. ESP summary table
  lines.push('## ESP Summary')
  lines.push('| ESP | Status | Sent | Delivery% | Open% | Bounce% | Unsub% |')
  lines.push('|-----|--------|------|-----------|-------|---------|--------|')
  for (const esp of esps) {
    lines.push(
      `| ${esp.name} | ${esp.status} | ${esp.sent.toLocaleString()} | ${esp.deliveryRate.toFixed(2)}% | ${esp.openRate.toFixed(2)}% | ${esp.bounceRate.toFixed(2)}% | ${esp.unsubRate.toFixed(2)}% |`
    )
  }
  lines.push('')

  // 3. Top/bottom performers (only meaningful with 2+ ESPs)
  if (esps.length > 1) {
    const byDelivery = [...esps].sort((a, b) => b.deliveryRate - a.deliveryRate)
    const byBounce = [...esps].sort((a, b) => a.bounceRate - b.bounceRate)
    lines.push('## Performance Rankings')
    lines.push(`- Best delivery rate: ${byDelivery[0].name} (${byDelivery[0].deliveryRate.toFixed(2)}%)`)
    lines.push(`- Worst delivery rate: ${byDelivery[byDelivery.length - 1].name} (${byDelivery[byDelivery.length - 1].deliveryRate.toFixed(2)}%)`)
    lines.push(`- Lowest bounce rate: ${byBounce[0].name} (${byBounce[0].bounceRate.toFixed(2)}%)`)
    lines.push(`- Highest bounce rate: ${byBounce[byBounce.length - 1].name} (${byBounce[byBounce.length - 1].bounceRate.toFixed(2)}%)`)
    lines.push('')
  }

  // 4. Provider + domain breakdown per ESP
  for (const esp of esps) {
    const data = espData[esp.name]
    if (!data) continue

    const providerEntries = Object.entries(data.providers)
      .filter(([, pd]) => pd.overall && pd.overall.sent > 0)
      .sort(([, a], [, b]) => b.overall.sent - a.overall.sent)
      .slice(0, 5)

    if (providerEntries.length > 0) {
      lines.push(`## ${esp.name} — Top Recipient Providers`)
      lines.push('| Provider | Sent | Delivery% | Bounce% |')
      lines.push('|----------|------|-----------|---------|')
      for (const [name, pd] of providerEntries) {
        lines.push(
          `| ${name} | ${pd.overall.sent.toLocaleString()} | ${pd.overall.deliveryRate.toFixed(2)}% | ${pd.overall.bounceRate.toFixed(2)}% |`
        )
      }
      lines.push('')
    }

    const domainEntries = Object.entries(data.domains)
      .filter(([, pd]) => pd.overall && pd.overall.sent > 0)
      .sort(([, a], [, b]) => b.overall.sent - a.overall.sent)
      .slice(0, 5)

    if (domainEntries.length > 0) {
      lines.push(`## ${esp.name} — Top Sending Domains`)
      lines.push('| Domain | Sent | Delivery% |')
      lines.push('|--------|------|-----------|')
      for (const [name, pd] of domainEntries) {
        lines.push(
          `| ${name} | ${pd.overall.sent.toLocaleString()} | ${pd.overall.deliveryRate.toFixed(2)}% |`
        )
      }
      lines.push('')
    }
  }

  // 5. IP Matrix summary
  if (ipmData.length > 0) {
    const totalRegs = ipmData.reduce((s, r) => s + (r.registrations ?? 0), 0)
    const totalFtds = ipmData.reduce((s, r) => s + (r.ftds ?? 0), 0)
    lines.push('## IP Matrix Summary')
    lines.push(`- Total IPs tracked: ${ipmData.length}`)
    lines.push(`- Total Registrations: ${totalRegs.toLocaleString()}`)
    lines.push(`- Total FTDs: ${totalFtds.toLocaleString()}`)
    lines.push('')
  }

  // 6. Throttle Matrix — flag non-zero combos only
  const flagged = throttleData.filter(r => {
    const vals = [r.gmail, r.hotmail, r.outlook, r.yahoo, r.icloud, r.aol, r.live, r.gmx, r.web, r.others]
    return vals.some(v => typeof v === 'number' && v > 0)
  })

  if (flagged.length > 0) {
    lines.push('## Throttling Issues')
    lines.push('The following ESP/IP/domain combinations have active throttle rates:')
    for (const r of flagged) {
      lines.push(`- ${r.esp} | IP: ${r.ip} | Domain: ${r.fromDomain}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
