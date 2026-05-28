'use client'
import { useEffect, useRef, useState } from 'react'
import { Chart } from 'chart.js/auto'
import { useDashboardStore } from '@/lib/store'
import { aggDates, fmtN, fmtP, fmtDateLabel, getGridColor, getTextColor, chartTooltip, visibleEspNames } from '@/lib/utils'
import { DOMAIN_COLORS, IP_COLOR_PALETTE, IP_COLOR_PALETTE_LIGHT, ESP_COLORS } from '@/lib/data'
import type { MmData, MmTabType, DateMetrics } from '@/lib/types'
import CalendarPicker from '@/components/ui/CalendarPicker'
import CustomSelect from '@/components/ui/CustomSelect'

/* ─────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────── */
const EMPTY: MmData = {
  dates: [], datesFull: [], providers: {}, domains: {}, overallByDate: {}, providerDomains: {},
}
const VOL_COLORS  = { sent: '#6b7280', delivered: '#e63946', opened: '#00e5c3', clicked: '#ffd166' }
const RATE_COLORS = { successRate: '#e63946', openRate: '#00e5c3', clickRate: '#ffd166', bounceRate: '#ff4757' }

// Kenscio-specific: CTR = Clicks ÷ Delivered, Unsub = Unsubs ÷ Delivered
const KPI_DEFS = [
  { key: 'openRate'   as keyof DateMetrics, label: 'Open Rate %',   color: '#00e5c3', lightColor: '#006a5b', formula: 'Opens ÷ Delivered × 100',        getValue: (r: DateMetrics) => r.openRate },
  { key: 'clickRate'  as keyof DateMetrics, label: 'CTR %',         color: '#ffd166', lightColor: '#D58B05', formula: 'Clicks ÷ Delivered × 100',       getValue: (r: DateMetrics) => r.delivered > 0 ? (r.clicked / r.delivered) * 100 : 0 },
  { key: 'bounceRate' as keyof DateMetrics, label: 'Bounce Rate %', color: '#ff4757', lightColor: '#BD0B19', formula: 'Bounced ÷ Sent × 100',           getValue: (r: DateMetrics) => r.bounceRate },
  { key: 'unsubRate'  as keyof DateMetrics, label: 'Unsub Rate %',  color: '#ff9a5c', lightColor: '#AF4302', formula: 'Unsubscribed ÷ Delivered × 100', getValue: (r: DateMetrics) => r.delivered > 0 ? ((r.unsubscribed ?? 0) / r.delivered) * 100 : 0 },
]
const GRID_KPIS = [
  { key: 'deliveryRate' as keyof DateMetrics, label: 'Success%', color: '#b39dff', lightColor: '#e63946', tipTitle: 'SUCCESS RATE',  formula: 'Delivered ÷ Sent × 100',           rawFn: (r: DateMetrics) => ({ a: r.delivered, b: r.sent        }), getValue: (r: DateMetrics) => r.deliveryRate,                                              dec: 1 },
  { key: 'openRate'     as keyof DateMetrics, label: 'Open%',    color: '#00ffd5', lightColor: '#006a5b', tipTitle: 'OPEN RATE',     formula: 'Opens ÷ Delivered × 100',          rawFn: (r: DateMetrics) => ({ a: r.opened,    b: r.delivered   }), getValue: (r: DateMetrics) => r.openRate,                                                  dec: 1 },
  { key: 'clickRate'    as keyof DateMetrics, label: 'CTR%',     color: '#ffe066', lightColor: '#D58B05', tipTitle: 'CTR',           formula: 'Clicks ÷ Delivered × 100',         rawFn: (r: DateMetrics) => ({ a: r.clicked,   b: r.delivered   }), getValue: (r: DateMetrics) => r.delivered > 0 ? (r.clicked / r.delivered) * 100 : 0,    dec: 1 },
  { key: 'bounceRate'   as keyof DateMetrics, label: 'Bounce%',  color: '#ff6b77', lightColor: '#BD0B19', tipTitle: 'BOUNCE RATE',   formula: 'Bounced ÷ Sent × 100',             rawFn: (r: DateMetrics) => ({ a: r.bounced,   b: r.sent        }), getValue: (r: DateMetrics) => r.bounceRate,                                                dec: 1 },
  { key: 'unsubRate'    as keyof DateMetrics, label: 'Unsub%',   color: '#ff9a5c', lightColor: '#AF4302', tipTitle: 'UNSUB RATE',    formula: 'Unsubscribed ÷ Delivered × 100',   rawFn: (r: DateMetrics) => ({ a: r.unsubscribed ?? 0, b: r.delivered }), getValue: (r: DateMetrics) => r.delivered > 0 ? ((r.unsubscribed ?? 0) / r.delivered) * 100 : 0, dec: 3 },
]
const BAD_METRICS = new Set(['bounceRate', 'unsubRate'])

/* ─────────────────────────────────────────────────────────────────
   TYPES
───────────────────────────────────────────────────────────────── */
type Granularity = 'daily' | 'weekly' | 'monthly'
type EmbedView   = 'date' | 'provider'
interface DateGroup { label: string; dates: string[] }

/* ─────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────── */
function lds(label: string, data: (number | null)[], color: string, dash?: number[]) {
  return {
    label, data,
    borderColor: color,
    backgroundColor: color + '18',
    borderWidth: 1.5,
    tension: 0.35,
    pointRadius: 2,
    pointHoverRadius: 5,
    fill: false,
    borderDash: dash ?? [],
  }
}

function rateDs(label: string, data: (number | null)[], color: string, dash?: number[], filled = true) {
  return {
    label, data,
    borderColor: color,
    backgroundColor: filled ? color + '28' : 'transparent',
    borderWidth: 2,
    tension: 0.4,
    pointRadius: 4,
    pointHoverRadius: 7,
    pointBackgroundColor: color,
    pointBorderColor: color,
    fill: filled ? ('origin' as const) : false,
    borderDash: dash ?? [],
  }
}

function groupDates(
  dates: string[],
  gran: Granularity,
  datesFull: { label: string; year: number; iso: string }[],
): DateGroup[] {
  if (gran === 'daily') return dates.map(d => ({ label: d, dates: [d] }))

  const isoMap: Record<string, string> = {}
  datesFull.forEach(df => { if (df.iso) isoMap[df.label] = df.iso })

  if (gran === 'weekly') {
    const groups: DateGroup[] = []
    for (const d of dates) {
      const iso = isoMap[d]
      if (!iso) { groups.push({ label: d, dates: [d] }); continue }
      const dt        = new Date(iso + 'T00:00:00')
      const wStart    = new Date(dt)
      wStart.setDate(dt.getDate() - dt.getDay())
      const wKey      = wStart.toISOString().slice(0, 10)
      const last      = groups[groups.length - 1]
      if (last && (last as DateGroup & { _wKey?: string })._wKey === wKey) {
        last.dates.push(d)
      } else {
        const g: DateGroup & { _wKey?: string } = { label: d, dates: [d], _wKey: wKey }
        groups.push(g)
      }
    }
    groups.forEach(g => { delete (g as DateGroup & { _wKey?: string })._wKey })
    return groups
  }

  if (gran === 'monthly') {
    const map = new Map<string, DateGroup>()
    for (const d of dates) {
      const df = datesFull.find(x => x.label === d)
      if (!df) continue
      const [mon]  = d.split(' ')
      const key    = `${mon} ${df.year}`
      if (!map.has(key)) map.set(key, { label: key, dates: [] })
      map.get(key)!.dates.push(d)
    }
    return Array.from(map.values())
  }

  return dates.map(d => ({ label: d, dates: [d] }))
}

function minMaxHeat(kpiKey: string, val: number, minV: number, maxV: number): string {
  if (maxV === minV) return 'transparent'
  let score = (val - minV) / (maxV - minV)
  if (BAD_METRICS.has(kpiKey)) score = 1 - score
  if (score >= 0.75) return 'rgba(0,229,195,0.14)'
  if (score >= 0.5)  return 'rgba(0,229,195,0.07)'
  if (score <= 0.25) return 'rgba(255,71,87,0.16)'
  if (score <= 0.5)  return 'rgba(255,160,60,0.10)'
  return 'transparent'
}

function ipHeat(kpiKey: string, val: number, minV: number, maxV: number): string {
  if (maxV === minV) return 'transparent'
  let score = (val - minV) / (maxV - minV)
  if (BAD_METRICS.has(kpiKey)) score = 1 - score
  if (score >= 0.75) return 'rgba(4,120,87,0.52)'
  if (score >= 0.5)  return 'rgba(4,100,70,0.28)'
  if (score <= 0.25) return 'rgba(120,20,30,0.55)'
  if (score <= 0.5)  return 'rgba(100,50,0,0.28)'
  return 'transparent'
}

function trendArrow(cur: number | null, prev: number | null, kpiKey: string, isLight = false) {
  if (cur == null || prev == null) return null
  const diff = cur - prev
  if (Math.abs(diff) < 0.01) return null
  const good = BAD_METRICS.has(kpiKey) ? diff < 0 : diff > 0
  return { arrow: good ? '▲' : '▼', color: good ? (isLight ? '#006a5b' : '#00e5c3') : '#ff4757' }
}

function ipColorIndex(ip: string, len: number): number {
  let h = 5381
  for (let i = 0; i < ip.length; i++) h = ((h << 5) + h + ip.charCodeAt(i)) >>> 0
  return h % len
}

function destroyAll(ref: React.MutableRefObject<(Chart | null)[]>) {
  ref.current.forEach(c => c?.destroy())
  ref.current = ref.current.map(() => null)
}

function buildIpAggByDate(
  domains: MmData['domains'],
  subDomains: string[],
): Record<string, DateMetrics> {
  const normSubs = subDomains.map(d => d.toLowerCase().trim())
  const allDates = new Set<string>()
  normSubs.forEach(d => Object.keys(domains[d]?.byDate || {}).forEach(dt => allDates.add(dt)))
  const byDate: Record<string, DateMetrics> = {}
  allDates.forEach(date => {
    let sent = 0, delivered = 0, opened = 0, clicked = 0, bounced = 0, unsubscribed = 0, complained = 0
    normSubs.forEach(dom => {
      const m = domains[dom]?.byDate?.[date]
      if (!m) return
      sent += m.sent || 0; delivered += m.delivered || 0; opened += m.opened || 0
      clicked += m.clicked || 0; bounced += m.bounced || 0
      unsubscribed += m.unsubscribed || 0; complained += m.complained || 0
    })
    if (!sent) return
    byDate[date] = {
      sent, delivered, opened, clicked, bounced, unsubscribed, complained,
      deliveryRate: (delivered / sent) * 100, successRate: (delivered / sent) * 100,
      openRate: delivered > 0 ? (opened / delivered) * 100 : 0,
      // Kenscio: CTR = clicks / delivered
      clickRate: delivered > 0 ? (clicked / delivered) * 100 : 0,
      bounceRate: (bounced / sent) * 100,
      // Kenscio: unsub rate = unsubs / delivered
      unsubRate: delivered > 0 ? (unsubscribed / delivered) * 100 : 0,
      complaintRate: delivered > 0 ? (complained / delivered) * 100 : 0,
    }
  })
  return byDate
}

/* ─────────────────────────────────────────────────────────────────
   MAIN VIEW
───────────────────────────────────────────────────────────────── */
export default function KenscioView() {
  const store     = useDashboardStore()
  const isLight   = store.isLight
  const ipmData   = store.ipmData
  const allEsps   = visibleEspNames(store.espData, store.hiddenEsps)
  const espList: string[] = allEsps.filter(e => e === 'Kenscio')

  const [selectedEsp, setSelectedEsp] = useState('')
  const [granularity, setGranularity] = useState<Granularity>('daily')
  const [embedView,   setEmbedView]   = useState<EmbedView>('date')
  const [filterIp,       setFilterIp]       = useState('all')
  const [filterDomain,   setFilterDomain]   = useState('all')
  const [filterProvider, setFilterProvider] = useState('all')
  const [kpiTooltip, setKpiTooltip] = useState<{ idx: number; x: number; y: number } | null>(null)
  const [gridTip, setGridTip] = useState<{ title: string; exact: string; formula: string; calc: string; color: string; x: number; y: number } | null>(null)

  useEffect(() => {
    if (!kpiTooltip) return
    const move = (e: MouseEvent) => {
      const tipW = 260, tipH = 130
      const x = e.clientX + 14 + tipW > window.innerWidth ? e.clientX - tipW - 8 : e.clientX + 14
      const y = e.clientY + 14 + tipH > window.innerHeight ? e.clientY - tipH - 8 : e.clientY + 14
      setKpiTooltip(t => t ? { ...t, x, y } : null)
    }
    window.addEventListener('mousemove', move)
    return () => window.removeEventListener('mousemove', move)
  }, [!!kpiTooltip]) // eslint-disable-line

  useEffect(() => {
    if (!gridTip) return
    const move = (e: MouseEvent) => {
      const tipW = 260, tipH = 130
      const x = e.clientX + 14 + tipW > window.innerWidth ? e.clientX - tipW - 8 : e.clientX + 14
      const y = e.clientY + 14 + tipH > window.innerHeight ? e.clientY - tipH - 8 : e.clientY + 14
      setGridTip(t => t ? { ...t, x, y } : null)
    }
    window.addEventListener('mousemove', move)
    return () => window.removeEventListener('mousemove', move)
  }, [!!gridTip]) // eslint-disable-line


  // ── Pick initial ESP ────────────────────────────────────────────
  useEffect(() => {
    if (!selectedEsp || !espList.includes(selectedEsp)) {
      const def = store.reviewEsp && espList.includes(store.reviewEsp)
        ? store.reviewEsp : espList[0] || ''
      if (def) setSelectedEsp(def)
    }
  }, [espList.join(','), store.reviewEsp]) // eslint-disable-line

  useEffect(() => {
    store.setMmSelectedRow(null)
    setFilterIp('all')
    setFilterDomain('all')
    setFilterProvider('all')
  }, [selectedEsp]) // eslint-disable-line

  // ── Data & range ────────────────────────────────────────────────
  const data: MmData = store.espData[selectedEsp] ?? EMPTY
  const fromIdx = store.espRanges[selectedEsp]?.fromIdx ?? 0
  const toIdx   = store.espRanges[selectedEsp]?.toIdx   ?? Math.max(0, data.dates.length - 1)
  const setRange = (f: number, t: number) => store.setEspRange(selectedEsp, f, t)

  const filterKey = `kenscio:${selectedEsp}`
  const df        = store.dateFilters[filterKey]
  const fromDate  = df?.from ?? ''
  const toDate    = df?.to   ?? ''

  useEffect(() => {
    if (!data.datesFull.length || !selectedEsp) return
    const current = useDashboardStore.getState().dateFilters[filterKey]
    if (current?.from || current?.to) return
    store.setDateFilter(filterKey, {
      from: data.datesFull[fromIdx]?.iso || '',
      to:   data.datesFull[Math.min(toIdx, data.datesFull.length - 1)]?.iso || '',
    })
  }, [selectedEsp, data.datesFull.length]) // eslint-disable-line

  function findFrom(iso: string) {
    const i = data.datesFull.findIndex(d => d.iso >= iso)
    return i === -1 ? 0 : i
  }
  function findTo(iso: string) {
    let r = data.datesFull.length - 1
    for (let i = r; i >= 0; i--) { if (data.datesFull[i].iso <= iso) { r = i; break } }
    return r
  }
  function handleFrom(iso: string) { store.setDateFilter(filterKey, { from: iso }) }
  function handleTo(iso: string)   { store.setDateFilter(filterKey, { to: iso }) }
  function handleFilter() {
    const newFrom = fromDate ? findFrom(fromDate) : 0
    const newTo   = toDate   ? findTo(toDate)     : data.dates.length - 1
    setRange(newFrom, newTo)
  }
  function handleAll() {
    setRange(0, data.dates.length - 1)
    store.setDateFilter(filterKey, {
      from: data.datesFull[0]?.iso || '',
      to:   data.datesFull[data.datesFull.length - 1]?.iso || '',
    })
  }

  // ── Tab / row ────────────────────────────────────────────────────
  const mmTab = 'ip' as MmTabType
  const selectedRow  = store.mmSelectedRow
  const setSelected  = store.setMmSelectedRow

  // ── Computed: dates, groups, entities ───────────────────────────
  const safeTo      = Math.min(toIdx, data.dates.length - 1)
  const activeDates = data.dates.slice(fromIdx, safeTo + 1)
  const dateGroups  = groupDates(activeDates, granularity, data.datesFull)
  const fmtDL = (label: string) => fmtDateLabel(label, data.datesFull)
  const groupsKey   = dateGroups.map(g => g.label).join(',')
  const datesKey    = activeDates.join(',')

  const gc = getGridColor(isLight)
  const tc = getTextColor(isLight)
  const kc = (kpi: { color: string; lightColor?: string }): string => isLight ? (kpi.lightColor ?? kpi.color) : kpi.color
  const teal = isLight ? '#006a5b' : '#00e5c3'

  // ── IP entity data ───────────────────────────────────────────────
  const espIpmRecords = ipmData.filter(r => r.esp?.toLowerCase() === selectedEsp.toLowerCase())
  const ipDomainsMap: Record<string, string[]> = {}
  espIpmRecords.forEach(r => {
    if (!r.ip) return
    const norm = r.domain?.toLowerCase().trim() || ''
    if (!ipDomainsMap[r.ip]) ipDomainsMap[r.ip] = []
    if (norm && !ipDomainsMap[r.ip].includes(norm)) ipDomainsMap[r.ip].push(norm)
  })
  const ipPalette = isLight ? IP_COLOR_PALETTE_LIGHT : IP_COLOR_PALETTE
  const ipEntityData = Object.entries(ipDomainsMap)
    .map(([ip, subDomains], idx) => {
      const byDate = buildIpAggByDate(data.domains, subDomains)
      return { name: ip, subDomains, color: ipPalette[ipColorIndex(ip, ipPalette.length)], byDate, data: aggDates(byDate, activeDates) }
    })
    .filter(e => e.data && e.data.sent > 0)
    .sort((a, b) => (b.data?.sent ?? 0) - (a.data?.sent ?? 0))

  // ── Filtered IP entity data (Daily KPIs table) ──────────────────
  const filteredIpEntityData = ipEntityData.filter(e => {
    if (filterIp !== 'all' && e.name !== filterIp) return false
    if (filterDomain !== 'all' && !e.subDomains.includes(filterDomain)) return false
    if (filterProvider !== 'all') {
      const provDomains = data.providerDomains[filterProvider]
      if (!provDomains) return false
      if (!e.subDomains.some(d => d in provDomains)) return false
    }
    return true
  })

  // ── Domain entity data ───────────────────────────────────────────
  const domainEntityData = Object.keys(data.domains || {})
    .map((name, idx) => {
      const bd = data.domains[name]?.byDate
      return { name, subDomains: [] as string[], color: DOMAIN_COLORS[name] || IP_COLOR_PALETTE[idx % IP_COLOR_PALETTE.length], byDate: bd || {}, data: aggDates(bd || {}, activeDates) }
    })
    .filter(e => e.data && e.data.sent > 0)
    .sort((a, b) => (b.data?.sent ?? 0) - (a.data?.sent ?? 0))

  const entityData = ipEntityData

  const entityNamesKey = entityData.map(e => e.name).join(',')
  const aggOverall     = aggDates(data.overallByDate, activeDates)

  // ── Grid col-stats (min/max per entity×kpi) ──
  const colStats: Record<string, Record<string, { min: number; max: number }>> = {}
  entityData.forEach(e => {
    colStats[e.name] = {}
    GRID_KPIS.forEach(kpi => {
      const vals = dateGroups
        .map(g => { const r = aggDates(e.byDate, g.dates); return r ? kpi.getValue(r) : null })
        .filter((v): v is number => v != null)
      colStats[e.name][kpi.key as string] = {
        min: vals.length ? Math.min(...vals) : 0,
        max: vals.length ? Math.max(...vals) : 0,
      }
    })
  })

  // ── Chart refs ───────────────────────────────────────────────────
  const volRef   = useRef<HTMLCanvasElement>(null)
  const volInst  = useRef<Chart | null>(null)
  const rateRef  = useRef<HTMLCanvasElement>(null)
  const rateInst = useRef<Chart | null>(null)
  const kpiRefs  = useRef<(HTMLCanvasElement | null)[]>([null, null, null, null])
  const kpiInsts = useRef<(Chart | null)[]>([null, null, null, null])
  const pieRefs  = useRef<(HTMLCanvasElement | null)[]>([null, null, null])
  const pieInsts = useRef<(Chart | null)[]>([null, null, null])

  // ── Volume chart ─────────────────────────────────────────────────
  useEffect(() => {
    if (volInst.current) { volInst.current.destroy(); volInst.current = null }
    if (!volRef.current || !dateGroups.length) return
    const od = data.overallByDate
    volInst.current = new Chart(volRef.current, {
      type: 'line',
      data: {
        labels: dateGroups.map(g => fmtDL(g.label)),
        datasets: [
          lds('Sent',      dateGroups.map(g => aggDates(od, g.dates)?.sent      ?? null), VOL_COLORS.sent),
          lds('Delivered', dateGroups.map(g => aggDates(od, g.dates)?.delivered ?? null), VOL_COLORS.delivered),
          lds('Opens',     dateGroups.map(g => aggDates(od, g.dates)?.opened    ?? null), isLight ? '#006a5b' : VOL_COLORS.opened),
          lds('Clicks',    dateGroups.map(g => aggDates(od, g.dates)?.clicked   ?? null), VOL_COLORS.clicked),
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...chartTooltip(isLight),
            mode: 'index',
            intersect: false,
            callbacks: {
              title: (items: any[]) => items[0]?.label ?? '',
              label: (ctx: any) => `${ctx.dataset.label}: ${fmtN(ctx.parsed.y ?? 0)}`,
            },
          },
        },
        scales: {
          x: { ticks: { color: tc, font: { size: 9 }, maxRotation: 30 }, grid: { display: false } },
          y: { ticks: { color: tc, font: { size: 9 }, callback: (v: any) => fmtN(+v) }, grid: { color: gc }, border: { display: false } },
        },
      },
    })
    return () => { volInst.current?.destroy(); volInst.current = null }
  }, [groupsKey, selectedEsp, isLight]) // eslint-disable-line

  // ── Rate trend chart (Mailgun formulas) ───────────────────────────
  useEffect(() => {
    if (rateInst.current) { rateInst.current.destroy(); rateInst.current = null }
    if (!rateRef.current || !dateGroups.length) return

    const src = selectedRow
      ? (mmTab === 'ip' && ipEntityData.length > 0)
        ? buildIpAggByDate(data.domains, ipEntityData.find(e => e.name === selectedRow)?.subDomains ?? [])
        : data.domains[selectedRow]?.byDate ?? {}
      : data.overallByDate

    const rateMetrics = dateGroups.map(g => aggDates(src, g.dates))

    // Kenscio: CTR = clicks / delivered
    const ogCtr = (r: DateMetrics | null) => r && r.delivered > 0 ? (r.clicked / r.delivered) * 100 : null

    rateInst.current = new Chart(rateRef.current, {
      type: 'line',
      data: {
        labels: dateGroups.map(g => fmtDL(g.label)),
        datasets: [
          rateDs('Success Rate', rateMetrics.map(r => r?.deliveryRate ?? null), RATE_COLORS.successRate),
          rateDs('Open Rate',    rateMetrics.map(r => r?.openRate     ?? null), isLight ? '#006a5b' : RATE_COLORS.openRate),
          rateDs('CTR',          rateMetrics.map(r => ogCtr(r)),                RATE_COLORS.clickRate, [4, 4]),
          rateDs('Bounce Rate',  rateMetrics.map(r => r?.bounceRate   ?? null), RATE_COLORS.bounceRate, [2, 2]),
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...chartTooltip(isLight),
            mode: 'index',
            intersect: false,
            callbacks: {
              title: (items: any[]) => items[0]?.label ?? '',
              label: (ctx: any) => {
                const r = rateMetrics[ctx.dataIndex]
                if (!r) return `${ctx.dataset.label}: —`
                const pct = (ctx.parsed.y ?? 0).toFixed(1)
                const lbl = ctx.dataset.label
                if (lbl === 'Success Rate') return `${lbl}: ${pct}% (${fmtN(r.delivered)} / ${fmtN(r.sent)})`
                if (lbl === 'Open Rate')    return `${lbl}: ${pct}% (${fmtN(r.opened)} / ${fmtN(r.delivered)})`
                if (lbl === 'CTR')          return `${lbl}: ${pct}% (${fmtN(r.clicked)} / ${fmtN(r.delivered)})`
                if (lbl === 'Bounce Rate')  return `${lbl}: ${pct}% (${fmtN(r.bounced)} / ${fmtN(r.sent)})`
                return `${lbl}: ${pct}%`
              },
            },
          },
        },
        scales: {
          x: { ticks: { color: tc, font: { size: 9 }, maxRotation: 30 }, grid: { display: false } },
          y: { min: 0, ticks: { color: tc, font: { size: 9 }, callback: (v: any) => v + '%' }, grid: { color: gc }, border: { display: false } },
        },
      },
    })
    return () => { rateInst.current?.destroy(); rateInst.current = null }
  }, [groupsKey, selectedEsp, selectedRow, mmTab, isLight]) // eslint-disable-line

  // ── KPI charts (Mailgun formulas) ─────────────────────────────────
  useEffect(() => {
    destroyAll(kpiInsts)
    if (!activeDates.length || !entityData.length) return

    // Kenscio-specific tooltip labels
    const kpiCalcLabel = (kpiKey: string, r: DateMetrics | null, pct: string) => {
      if (!r) return pct + '%'
      if (kpiKey === 'openRate')   return `${pct}% (${fmtN(r.opened)} / ${fmtN(r.delivered)})`
      if (kpiKey === 'clickRate')  return `${pct}% (${fmtN(r.clicked)} / ${fmtN(r.delivered)})`
      if (kpiKey === 'bounceRate') return `${pct}% (${fmtN(r.bounced)} / ${fmtN(r.sent)})`
      if (kpiKey === 'unsubRate')  return `${pct}% (${fmtN(r.unsubscribed ?? 0)} / ${fmtN(r.delivered)})`
      return pct + '%'
    }

    KPI_DEFS.forEach((kpi, i) => {
      const canvas = kpiRefs.current[i]
      if (!canvas) return
      if (embedView === 'date') {
        const kpiMetricsPerEntity = entityData.map(e => dateGroups.map(g => aggDates(e.byDate, g.dates)))
        kpiInsts.current[i] = new Chart(canvas, {
          type: 'line',
          data: {
            labels: dateGroups.map(g => fmtDL(g.label)),
            datasets: entityData.map((e, ei) =>
              rateDs(e.name, kpiMetricsPerEntity[ei].map(r => r ? (kpi.getValue(r) ?? null) : null), e.color, [], false)
            ),
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                ...chartTooltip(isLight),
                mode: 'index',
                intersect: false,
                callbacks: {
                  title: (items: any[]) => items[0]?.label ?? '',
                  label: (ctx: any) => {
                    const r = kpiMetricsPerEntity[ctx.datasetIndex]?.[ctx.dataIndex]
                    return `${ctx.dataset.label}: ${kpiCalcLabel(kpi.key as string, r ?? null, (ctx.parsed.y ?? 0).toFixed(1))}`
                  },
                },
              },
            },
            scales: {
              x: { ticks: { color: tc, font: { size: 9 }, maxRotation: 30 }, grid: { display: false } },
              y: { min: 0, ticks: { color: tc, font: { size: 9 }, callback: (v: any) => v + '%' }, grid: { color: gc }, border: { display: false } },
            },
          },
        })
      } else {
        const barMetrics = entityData.map(e => e.data ?? null)
        kpiInsts.current[i] = new Chart(canvas, {
          type: 'bar',
          data: {
            labels: entityData.map(e => e.name.length > 16 ? e.name.slice(0, 14) + '…' : e.name),
            datasets: [{
              label: kpi.label,
              data: entityData.map(e => e.data ? kpi.getValue(e.data) : 0),
              backgroundColor: entityData.map(e => e.color + 'aa'),
              borderColor: entityData.map(e => e.color),
              borderWidth: 1, borderRadius: 4,
            }],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: { ...chartTooltip(isLight), callbacks: { label: (ctx: any) => kpiCalcLabel(kpi.key as string, barMetrics[ctx.dataIndex], (ctx.parsed.y ?? 0).toFixed(2)) } },
            },
            scales: {
              x: { ticks: { color: tc, font: { size: 9 }, maxRotation: 30 }, grid: { display: false } },
              y: { min: 0, ticks: { color: tc, font: { size: 9 }, callback: v => v + '%' }, grid: { color: gc }, border: { display: false } },
            },
          },
        })
      }
    })
    return () => { destroyAll(kpiInsts) }
  }, [groupsKey, selectedEsp, mmTab, isLight, embedView, entityNamesKey]) // eslint-disable-line

  // ── Pie charts ───────────────────────────────────────────────────
  useEffect(() => {
    destroyAll(pieInsts)
    if (mmTab !== 'ip' || !entityData.length || !activeDates.length) return

    const PIE_KEYS: (keyof DateMetrics)[] = ['sent', 'opened', 'clicked']
    PIE_KEYS.forEach((mk, i) => {
      const canvas = pieRefs.current[i]
      if (!canvas) return
      const vals  = entityData.map(e => (e.data?.[mk] as number) ?? 0)
      const total = vals.reduce((a, b) => a + b, 0)

      const centerPlugin = {
        id: `pie_center_kenscio_${i}`,
        beforeDraw(chart: Chart) {
          const { ctx, chartArea } = chart
          if (!chartArea) return
          const cx = (chartArea.left + chartArea.right) / 2
          const cy = (chartArea.top  + chartArea.bottom) / 2
          ctx.save()
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillStyle = isLight ? '#0f172a' : '#f0f2f5'
          ctx.font = 'bold 14px "Space Mono", monospace'
          ctx.fillText(fmtN(total), cx, cy - 7)
          ctx.font = '8px "Space Mono", monospace'
          ctx.fillStyle = isLight ? '#64748b' : '#a8b0be'
          ctx.fillText('TOTAL', cx, cy + 8)
          ctx.restore()
        },
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfg: any = {
        type: 'doughnut',
        data: {
          labels: entityData.map(e => e.name),
          datasets: [{ data: vals, backgroundColor: entityData.map(e => e.color + 'cc'), borderColor: 'transparent', hoverOffset: 8 }],
        },
        options: {
          cutout: '66%', responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...chartTooltip(isLight),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              callbacks: { label: (ctx: any) => `${ctx.label}: ${fmtN(ctx.parsed)} (${total > 0 ? (ctx.parsed / total * 100).toFixed(1) : '0.0'}%)` },
            },
          },
        },
        plugins: [centerPlugin],
      }
      pieInsts.current[i] = new Chart(canvas, cfg)
    })
    return () => { destroyAll(pieInsts) }
  }, [datesKey, selectedEsp, mmTab, isLight, entityNamesKey]) // eslint-disable-line

  // ── Style shorthands ─────────────────────────────────────────────
  const card    = `rounded-xl border ${isLight ? 'bg-white border-black/10' : 'bg-[#111418] border-white/7'}`
  const selCls  = `px-3 py-1.5 rounded-lg border text-xs font-mono outline-none appearance-none transition-all ${isLight ? 'bg-white border-black/20 text-gray-800 focus:border-[#0d9488] hover:border-[#0d9488]' : 'bg-[#1e232b] border-white/18 text-white focus:border-[#0d9488] hover:border-[#0d9488]'}`
  const muted   = isLight ? 'text-gray-500' : 'text-[#a8b0be]'
  const txt     = isLight ? 'text-gray-900' : 'text-[#f0f2f5]'
  const divBdr  = { borderColor: isLight ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.07)' }

  const tabLabel      = 'IP Address'
  const tabLabelShort = 'IP'
  const selectedBD    = selectedRow
    ? buildIpAggByDate(data.domains, ipEntityData.find(e => e.name === selectedRow)?.subDomains ?? [])
    : {}

  // ── Range label ──────────────────────────────────────────────────
  const rangeLabel = activeDates.length > 0
    ? `${fmtDL(activeDates[0])} – ${fmtDL(activeDates[activeDates.length - 1])} · ${fmtN(aggOverall?.sent ?? 0)} sent`
    : 'No date range selected'

  /* ──────────────────────────────────────────────────────────────
     RENDER
  ─────────────────────────────────────────────────────────────── */
  if (selectedEsp && store.hiddenEsps.includes(selectedEsp)) {
    return (
      <div className="p-6">
        <div className={`rounded-xl border p-8 text-center ${isLight ? 'bg-white border-black/[0.10]' : 'bg-[#111418] border-white/7'}`}>
          <div className={`text-sm mb-3 ${isLight ? 'text-gray-600' : 'text-[#a8b0be]'}`}>
            <strong>{selectedEsp}</strong> is currently hidden from all views.
          </div>
          <button
            onClick={() => store.toggleEspVisibility(selectedEsp)}
            className={`px-4 py-2 rounded-lg border text-xs font-mono uppercase tracking-wider transition-all
              ${isLight ? 'border-[#0d9488]/40 text-[#0d9488] hover:bg-[#0d9488]/[0.08]' : 'border-[#00e5c3]/40 text-[#00e5c3] hover:bg-[#00e5c3]/10'}`}
          >
            Unhide {selectedEsp}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className={`text-xl font-bold tracking-tight ${txt}`}>Kenscio Review</h1>
          <p className={`text-[11px] mt-1 font-mono ${muted}`}>{rangeLabel}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* ESP selector (if multiple Kenscio ESPs) */}
          {espList.length > 1 && (
            <CustomSelect
              value={selectedEsp}
              onChange={setSelectedEsp}
              options={espList.map(e => ({ value: e, label: e }))}
              isLight={isLight}
              minWidth={110}
            />
          )}

          {/* Calendar pickers */}
          <CalendarPicker value={fromDate} onChange={iso => handleFrom(iso)} isLight={isLight} rangeStart={fromDate} rangeEnd={toDate} />
          <span className={`text-xs ${muted}`}>→</span>
          <CalendarPicker value={toDate}   onChange={iso => handleTo(iso)}   isLight={isLight} rangeStart={fromDate} rangeEnd={toDate} align="right" />
          <button
            onClick={handleAll}
            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono uppercase transition-all
              ${isLight ? 'border-black/20 text-gray-500 hover:border-[#0d9488]' : 'border-white/13 text-[#a8b0be] hover:border-[#0d9488]'}`}
          >All</button>
          <button
            onClick={handleFilter}
            className={`px-3 py-1.5 rounded-lg border text-[11px] font-mono uppercase tracking-wider font-semibold transition-all ${
              isLight
                ? 'border-[#0d9488] text-[#0d9488] bg-[#0d9488]/8 hover:bg-[#0d9488]/15'
                : 'border-[#0d9488] text-[#0d9488] bg-[#0d9488]/10 hover:bg-[#0d9488]/20'
            }`}
          >Filter</button>
          <button
            onClick={handleFilter}
            title="Refresh"
            className={`flex items-center justify-center w-[30px] h-[30px] rounded-lg border transition-all ${isLight ? 'border-black/20 text-gray-500 hover:border-[#0d9488] hover:text-[#0d9488]' : 'border-white/13 text-[#a8b0be] hover:border-[#0d9488] hover:text-[#0d9488]'}`}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.5 2A5 5 0 1 0 11 6.5"/><path d="M10.5 2v3h-3"/>
            </svg>
          </button>

          {/* Granularity dropdown */}
          <CustomSelect
            value={granularity}
            onChange={v => setGranularity(v as Granularity)}
            options={[{ value: 'daily', label: 'DAILY' }, { value: 'weekly', label: 'WEEKLY' }, { value: 'monthly', label: 'MONTHLY' }]}
            isLight={isLight}
            minWidth={90}
          />
        </div>
      </div>

      {/* ── Empty state ───────────────────────────────────────────── */}
      {espList.length === 0 || data.dates.length === 0 ? (
        <div className={`${card} p-12 text-center`}>
          <div className="text-4xl mb-4">📬</div>
          <div className={`text-lg font-medium mb-2 ${txt}`}>No Kenscio data yet</div>
          <div className={`text-sm ${muted}`}>Upload a Kenscio file via Upload Report to see data here.</div>
        </div>
      ) : (
        <>

          {/* ── KPI Cards ─────────────────────────────────────────── */}
          {aggOverall && (() => {
            const bounceAccent = aggOverall.bounceRate > 10 ? '#ff4757' : aggOverall.bounceRate > 2 ? '#ffd166' : teal
            // Kenscio: CTR = clicks / delivered
            const ogCtr       = aggOverall.delivered > 0 ? (aggOverall.clicked / aggOverall.delivered) * 100 : 0
            const ogUnsubRate  = aggOverall.delivered > 0 ? ((aggOverall.unsubscribed ?? 0) / aggOverall.delivered) * 100 : 0
            const kpiCards = [
              {
                label: 'Total Sent', val: fmtN(aggOverall.sent),
                sub: `${fmtN(aggOverall.delivered)} delivered`,
                accent: ESP_COLORS[selectedEsp] || '#7c5cfc',
                tip: { title: 'TOTAL SENT', exact: aggOverall.sent.toLocaleString(), formula: 'Raw count of emails dispatched', calc: `= ${aggOverall.sent.toLocaleString()}`, color: teal },
              },
              {
                label: 'Success Rate', val: fmtP(aggOverall.deliveryRate),
                sub: 'delivery rate', accent: '#7c5cfc',
                tip: { title: 'SUCCESS RATE', exact: aggOverall.deliveryRate.toFixed(2) + '%', formula: 'Delivered ÷ Sent × 100', calc: `${aggOverall.delivered.toLocaleString()} ÷ ${aggOverall.sent.toLocaleString()} × 100 = ${aggOverall.deliveryRate.toFixed(2)}%`, color: '#7c5cfc' },
              },
              {
                label: 'Open Rate', val: fmtP(aggOverall.openRate),
                sub: `${fmtN(aggOverall.opened)} opens`, accent: teal,
                tip: { title: 'OPEN RATE', exact: aggOverall.openRate.toFixed(2) + '%', formula: 'Opens ÷ Delivered × 100', calc: `${aggOverall.opened.toLocaleString()} ÷ ${aggOverall.delivered.toLocaleString()} × 100 = ${aggOverall.openRate.toFixed(2)}%`, color: teal },
              },
              {
                label: 'CTR', val: fmtP(ogCtr),
                sub: `${fmtN(aggOverall.clicked)} clicks`, accent: '#ffd166',
                tip: { title: 'CTR', exact: ogCtr.toFixed(2) + '%', formula: 'Clicks ÷ Delivered × 100', calc: `${aggOverall.clicked.toLocaleString()} ÷ ${aggOverall.delivered.toLocaleString()} × 100 = ${ogCtr.toFixed(2)}%`, color: '#ffd166' },
              },
              {
                label: 'Bounce Rate', val: fmtP(aggOverall.bounceRate),
                sub: `${fmtN(aggOverall.bounced)} bounced`, accent: bounceAccent,
                tip: { title: 'BOUNCE RATE', exact: aggOverall.bounceRate.toFixed(2) + '%', formula: 'Bounced ÷ Sent × 100', calc: `${aggOverall.bounced.toLocaleString()} ÷ ${aggOverall.sent.toLocaleString()} × 100 = ${aggOverall.bounceRate.toFixed(2)}%`, color: bounceAccent },
              },
            ]
            return (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {kpiCards.map((k, idx) => (
                  <div key={k.label}
                    className={`cursor-default rounded-xl border px-4 py-3 ${isLight ? 'bg-white border-black/10' : 'bg-[#111418] border-white/7'}`}
                    style={{ borderBottom: `2px solid ${k.accent}` }}
                    onMouseEnter={e => setKpiTooltip({ idx, x: e.clientX + 14, y: e.clientY + 14 })}
                    onMouseLeave={() => setKpiTooltip(null)}
                  >
                    <div className={`text-[11px] font-mono tracking-wider uppercase mb-2 ${muted}`}>{k.label}</div>
                    <div className={`text-2xl font-bold font-mono ${txt}`}>{k.val}</div>
                    <div className={`text-[11px] mt-1 ${muted}`}>{k.sub}</div>
                    {kpiTooltip?.idx === idx && (
                      <div
                        className="fixed z-[9999] pointer-events-none"
                        style={{ left: kpiTooltip.x, top: kpiTooltip.y, minWidth: 240 }}
                      >
                        <div className="rounded-xl shadow-2xl p-4"
                          style={{ background: isLight ? '#ffffff' : '#1a1e26', border: `1px solid ${isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.14)'}` }}>
                          <div className="text-[11px] font-mono tracking-widest uppercase mb-2" style={{ color: isLight ? '#9ca3af' : '#6b7280' }}>{k.tip.title}</div>
                          <div className="text-2xl font-bold font-mono mb-3" style={{ color: isLight ? '#111827' : '#ffffff' }}>{k.tip.exact}</div>
                          <div className="text-[11px] font-mono tracking-widest uppercase mb-1.5" style={{ color: isLight ? '#b45309' : '#ffd166' }}>Formula</div>
                          <div className="text-[11px] font-mono mb-1" style={{ color: isLight ? '#374151' : k.tip.color }}>{k.tip.formula}</div>
                          <div className="text-[11px] font-mono" style={{ color: isLight ? '#374151' : k.tip.color }}>{k.tip.calc}</div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          })()}


          {/* ── Tab Switcher ──────────────────────────────────────── */}
          <div className="flex items-center gap-1">
            <button
              className="px-3 py-1.5 rounded-lg border text-[11px] font-mono uppercase tracking-wider text-white"
              style={{ backgroundColor: '#e63946', borderColor: '#e63946' }}
            >
              IP Address
            </button>
          </div>

          {/* ── Volume + Rate Charts ──────────────────────────────── */}
          <div className="flex flex-col gap-4">

            <div className={`${card} p-4`}>
              <div className="mb-3">
                <div className={`text-xs font-medium ${txt}`}>Volume Trend</div>
                <div className={`text-[11px] font-mono mt-0.5 ${muted}`}>
                  Sent · Delivered · Opens · Clicks — all {tabLabel}s · {granularity}
                </div>
              </div>
              <div style={{ height: 200 }}><canvas ref={volRef} /></div>
              <div className="flex gap-4 mt-3 flex-wrap">
                {(Object.entries(VOL_COLORS) as [string, string][]).map(([k, c]) => (
                  <div key={k} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm" style={{ background: c }} />
                    <span className={`text-[11px] font-mono capitalize ${muted}`}>{k}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={`${card} p-4`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className={`text-xs font-medium ${txt}`}>Rate Trends{selectedRow ? ` — ${selectedRow}` : ''}</div>
                  <div className={`text-[11px] font-mono mt-0.5 ${muted}`}>
                    {selectedRow ? 'Click row again to reset' : `Click table row to isolate · ${granularity}`}
                  </div>
                </div>
                {selectedRow && (
                  <button onClick={() => setSelected(null)}
                    className={`text-[11px] font-mono px-2 py-1 rounded border transition-all
                      ${isLight ? 'border-black/20 text-gray-500 hover:border-black/40' : 'border-white/13 text-[#a8b0be] hover:border-white/30'}`}>
                    Reset
                  </button>
                )}
              </div>
              <div style={{ height: 200 }}><canvas ref={rateRef} /></div>
              <div className="flex gap-3 mt-3 flex-wrap">
                {[['Success Rate', RATE_COLORS.successRate],['Open Rate', RATE_COLORS.openRate],['CTR', RATE_COLORS.clickRate],['Bounce Rate', RATE_COLORS.bounceRate]].map(([l, c]) => (
                  <div key={l} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm" style={{ background: c }} />
                    <span className={`text-[11px] font-mono ${muted}`}>{l}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── KPI Charts ────────────────────────────────────────── */}
          <div className={`${card} p-4`}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className={`text-xs font-semibold ${txt}`}>KPI Charts · {tabLabel}</div>
              <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: isLight ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.1)' }}>
                {(['date', 'provider'] as EmbedView[]).map(v => (
                  <button key={v} onClick={() => setEmbedView(v)}
                    className={`px-3 py-1.5 text-[11px] font-mono font-semibold uppercase tracking-wider transition-all
                      ${embedView === v
                        ? 'bg-[#00e5c3] text-[#0a0d12]'
                        : isLight ? 'bg-white text-gray-500 hover:bg-gray-50' : 'bg-[#1e232b] text-[#a8b0be] hover:bg-[#252b35]'
                      }`}>
                    By {v === 'date' ? 'Date' : tabLabelShort}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {KPI_DEFS.map((kpi, i) => (
                <div key={kpi.key as string} className={`rounded-xl border p-4 ${isLight ? 'border-black/8 bg-white' : 'border-white/7 bg-[#0e1117]'}`}>
                  <div className="mb-3">
                    <div className={`text-xs font-semibold ${txt}`}>{kpi.label}</div>
                    <div className={`text-[11px] font-mono mt-0.5 ${muted}`}>{kpi.formula}</div>
                  </div>
                  <div style={{ height: 200 }}>
                    <canvas ref={el => { kpiRefs.current[i] = el }} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3">
                    {entityData.map(e => (
                      <div key={e.name} className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: e.color }} />
                          <span className={`text-[11px] font-mono font-semibold ${muted}`}>
                            {e.name.length > 22 ? e.name.slice(0, 20) + '…' : e.name}
                          </span>
                        </div>
                        {mmTab === 'ip' && e.subDomains && e.subDomains.map(d => (
                          <div key={d} className="flex items-center gap-1 ml-3.5">
                            <span className={`text-[8px] font-mono opacity-60 ${muted}`}>↳ {d}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Distribution Pies (IP tab only) ─────────────────── */}
          {mmTab === 'ip' && entityData.length > 0 && (
            <div className={`${card} p-4`}>
              <div className={`text-xs font-medium mb-4 ${txt}`}>Distribution by IP</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {(['Sent', 'Opens', 'Clicks'] as const).map((title, idx) => {
                  const mk = (['sent', 'opened', 'clicked'] as const)[idx]
                  const total = entityData.reduce((s, e) => s + ((e.data?.[mk] as number) ?? 0), 0)
                  return (
                    <div key={title} className="flex flex-col items-center">
                      <div className={`text-xs font-medium mb-0.5 ${txt}`}>{title}</div>
                      <div className={`text-[11px] font-mono mb-3 ${muted}`}>share of total {title.toLowerCase()}</div>
                      <div style={{ height: 160, width: '100%', maxWidth: 160 }}>
                        <canvas ref={el => { pieRefs.current[idx] = el }} />
                      </div>
                      <div className="mt-3 w-full space-y-1.5">
                        {entityData.map(e => {
                          const val = (e.data?.[mk] as number) ?? 0
                          const pct = total > 0 ? (val / total * 100).toFixed(1) : '0.0'
                          return (
                            <div key={e.name} className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.color }} />
                              <span className={`text-[11px] font-mono flex-1 truncate ${muted}`}>{e.name}</span>
                              <span className={`text-[11px] font-mono font-bold ${txt}`}>{pct}%</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Summary Table ─────────────────────────────────────── */}
          <div className={`${card} overflow-hidden`}>
            <div className="px-4 py-3 border-b flex items-center justify-between" style={divBdr}>
              <span className={`text-[11px] font-mono uppercase tracking-wider ${muted}`}>
                {tabLabel} Summary
              </span>
              <span className={`text-[11px] font-mono ${muted}`}>Click row → isolate rate trend & daily breakdown</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 940 }}>
                <thead className={isLight ? 'bg-gray-50' : 'bg-[#181c22]'}>
                  <tr>
                    {[tabLabel,'Sent','Delivered','Opens','Clicks','Bounced','Unsubs','Success%','Open%','CTR%','Bounce%','Unsub%'].map((h, i) => (
                      <th key={h}
                        className={`px-3 py-2.5 text-[11px] font-mono tracking-wider uppercase border-b
                          ${i === 0 ? 'text-left' : 'text-right'}
                          ${isLight ? 'border-black/8 text-gray-700' : 'border-white/7 text-[#d4dae6]'}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entityData.map(({ name, data: d, color }) => {
                    const s = d?.sent ?? 0, del = d?.delivered ?? 0, op = d?.opened ?? 0
                    const cl = d?.clicked ?? 0, bo = d?.bounced ?? 0, un = d?.unsubscribed ?? 0
                    // Kenscio formulas
                    const ctr      = del > 0 ? (cl / del) * 100 : 0
                    const unsubPct = del > 0 ? (un / del) * 100 : 0
                    const tip = (title: string, exact: string, formula: string, calc: string, color: string) =>
                      ({ title, exact, formula, calc, color })
                    const cols = [
                      { tip: tip('TOTAL SENT',    fmtN(s),   'Raw count of emails dispatched',              `= ${fmtN(s)}`,                                                                              '#a8b0be'), cls: muted },
                      { tip: tip('DELIVERED',      fmtN(del), 'Emails accepted by recipient server',         `${fmtN(del)} of ${fmtN(s)} sent`,                                                          '#c8cdd6'), cls: txt },
                      { tip: tip('OPENS',          fmtN(op),  'Unique opens recorded',                       `Open Rate = ${del > 0 ? (op/del*100).toFixed(2) : '0.00'}% (opens ÷ delivered)`,           teal), cls: 'text-[#00e5c3]' },
                      { tip: tip('CLICKS',         fmtN(cl),  'Unique clicks recorded',                      `CTR = ${del > 0 ? (cl/del*100).toFixed(2) : '0.00'}% (clicks ÷ delivered)`,                '#ffd166'), cls: 'text-[#ffd166]' },
                      { tip: tip('BOUNCED',        fmtN(bo),  'Emails not delivered',                        `Bounce Rate = ${s > 0 ? (bo/s*100).toFixed(2) : '0.00'}% (bounced ÷ sent)`,               '#ff4757'), cls: bo > 0 ? 'text-[#ff4757]' : muted },
                      { tip: tip('UNSUBSCRIBES',   fmtN(un),  'Recipients who unsubscribed',                 `Unsub Rate = ${del > 0 ? (un/del*100).toFixed(3) : '0.000'}% (unsubs ÷ delivered)`,        '#ff9a5c'), cls: un > 0 ? 'text-[#ff9a5c]' : muted },
                      { tip: tip('SUCCESS RATE',   `${(d?.deliveryRate??0).toFixed(2)}%`, 'Delivered ÷ Sent × 100',              `${fmtN(del)} ÷ ${fmtN(s)} × 100 = ${(d?.deliveryRate??0).toFixed(2)}%`,              '#b39dff'), cls: (d?.deliveryRate??0) < 80 ? 'text-[#ffd166]' : txt },
                      { tip: tip('OPEN RATE',      `${(d?.openRate??0).toFixed(2)}%`,     'Opens ÷ Delivered × 100',             `${fmtN(op)} ÷ ${fmtN(del)} × 100 = ${(d?.openRate??0).toFixed(2)}%`,               teal), cls: 'text-[#00e5c3]' },
                      { tip: tip('CTR',            `${ctr.toFixed(2)}%`,                  'Clicks ÷ Delivered × 100',            `${fmtN(cl)} ÷ ${fmtN(del)} × 100 = ${ctr.toFixed(2)}%`,                             '#ffd166'), cls: 'text-[#ffd166]' },
                      { tip: tip('BOUNCE RATE',    `${(d?.bounceRate??0).toFixed(2)}%`,   'Bounced ÷ Sent × 100',                `${fmtN(bo)} ÷ ${fmtN(s)} × 100 = ${(d?.bounceRate??0).toFixed(2)}%`,                '#ff6b77'), cls: (d?.bounceRate??0) > 10 ? 'text-[#ff4757]' : (d?.bounceRate??0) > 2 ? 'text-[#ffd166]' : muted },
                      { tip: tip('UNSUB RATE',     `${unsubPct.toFixed(3)}%`,             'Unsubscribed ÷ Delivered × 100',      `${fmtN(un)} ÷ ${fmtN(del)} × 100 = ${unsubPct.toFixed(3)}%`,                        '#ff9a5c'), cls: unsubPct > 0 ? 'text-[#ff9a5c]' : muted },
                    ]
                    const values = [fmtN(s), fmtN(del), fmtN(op), fmtN(cl), fmtN(bo), fmtN(un),
                      fmtP(d?.deliveryRate??0), fmtP(d?.openRate??0), fmtP(ctr),
                      fmtP(d?.bounceRate??0), fmtP(unsubPct, 3)]
                    return (
                      <tr key={name}
                        onClick={() => setSelected(selectedRow === name ? null : name)}
                        className={`cursor-pointer border-b last:border-0 transition-colors
                          ${isLight ? 'border-black/8 hover:bg-black/3' : 'border-white/7 hover:bg-white/3'}
                          ${selectedRow === name ? (isLight ? 'bg-[#009e88]/7' : 'bg-[#00e5c3]/4') : ''}`}
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-5 rounded-sm flex-shrink-0" style={{ background: color }} />
                            <span className={`text-[11px] font-mono ${txt}`}>{name}</span>
                          </div>
                        </td>
                        {cols.map((c, i) => (
                          <td key={i}
                            className={`px-3 py-2.5 text-right text-[11px] font-mono ${c.cls}`}
                            onMouseEnter={e2 => setGridTip({ ...c.tip, x: e2.clientX + 14, y: e2.clientY + 14 })}
                            onMouseLeave={() => setGridTip(null)}
                          >
                            {values[i]}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                  {/* Totals row */}
                  {aggOverall && (() => {
                    const s = aggOverall.sent, del = aggOverall.delivered, op = aggOverall.opened
                    const cl = aggOverall.clicked, bo = aggOverall.bounced, un = aggOverall.unsubscribed ?? 0
                    const ctr      = del > 0 ? (cl / del) * 100 : 0
                    const unsubPct = del > 0 ? (un / del) * 100 : 0
                    const tip = (title: string, exact: string, formula: string, calc: string, color: string) =>
                      ({ title, exact, formula, calc, color })
                    const cols = [
                      { tip: tip('TOTAL SENT',    fmtN(s),   'Raw count of emails dispatched',              `= ${fmtN(s)}`,                                                                              '#a8b0be'), cls: txt },
                      { tip: tip('DELIVERED',      fmtN(del), 'Emails accepted by recipient server',         `${fmtN(del)} of ${fmtN(s)} sent`,                                                          '#c8cdd6'), cls: txt },
                      { tip: tip('OPENS',          fmtN(op),  'Unique opens recorded',                       `Open Rate = ${del > 0 ? (op/del*100).toFixed(2) : '0.00'}% (opens ÷ delivered)`,           teal), cls: 'text-[#00e5c3]' },
                      { tip: tip('CLICKS',         fmtN(cl),  'Unique clicks recorded',                      `CTR = ${del > 0 ? (cl/del*100).toFixed(2) : '0.00'}% (clicks ÷ delivered)`,                '#ffd166'), cls: 'text-[#ffd166]' },
                      { tip: tip('BOUNCED',        fmtN(bo),  'Emails not delivered',                        `Bounce Rate = ${s > 0 ? (bo/s*100).toFixed(2) : '0.00'}% (bounced ÷ sent)`,               '#ff4757'), cls: bo > 0 ? 'text-[#ff4757]' : txt },
                      { tip: tip('UNSUBSCRIBES',   fmtN(un),  'Recipients who unsubscribed',                 `Unsub Rate = ${del > 0 ? (un/del*100).toFixed(3) : '0.000'}% (unsubs ÷ delivered)`,        '#ff9a5c'), cls: un > 0 ? 'text-[#ff9a5c]' : txt },
                      { tip: tip('SUCCESS RATE',   `${aggOverall.deliveryRate.toFixed(2)}%`, 'Delivered ÷ Sent × 100',   `${fmtN(del)} ÷ ${fmtN(s)} × 100 = ${aggOverall.deliveryRate.toFixed(2)}%`,     '#b39dff'), cls: txt },
                      { tip: tip('OPEN RATE',      `${aggOverall.openRate.toFixed(2)}%`,     'Opens ÷ Delivered × 100',  `${fmtN(op)} ÷ ${fmtN(del)} × 100 = ${aggOverall.openRate.toFixed(2)}%`,        teal), cls: 'text-[#00e5c3]' },
                      { tip: tip('CTR',            `${ctr.toFixed(2)}%`,                     'Clicks ÷ Delivered × 100', `${fmtN(cl)} ÷ ${fmtN(del)} × 100 = ${ctr.toFixed(2)}%`,                       '#ffd166'), cls: 'text-[#ffd166]' },
                      { tip: tip('BOUNCE RATE',    `${aggOverall.bounceRate.toFixed(2)}%`,   'Bounced ÷ Sent × 100',     `${fmtN(bo)} ÷ ${fmtN(s)} × 100 = ${aggOverall.bounceRate.toFixed(2)}%`,        '#ff6b77'), cls: aggOverall.bounceRate > 10 ? 'text-[#ff4757]' : aggOverall.bounceRate > 2 ? 'text-[#ffd166]' : txt },
                      { tip: tip('UNSUB RATE',     `${unsubPct.toFixed(3)}%`,               'Unsubscribed ÷ Delivered × 100', `${fmtN(un)} ÷ ${fmtN(del)} × 100 = ${unsubPct.toFixed(3)}%`,            '#ff9a5c'), cls: unsubPct > 0 ? 'text-[#ff9a5c]' : txt },
                    ]
                    const values = [fmtN(s), fmtN(del), fmtN(op), fmtN(cl), fmtN(bo), fmtN(un),
                      fmtP(aggOverall.deliveryRate), fmtP(aggOverall.openRate), fmtP(ctr),
                      fmtP(aggOverall.bounceRate), fmtP(unsubPct, 3)]
                    return (
                      <tr className={`border-t font-bold ${isLight ? 'border-black/15 bg-gray-50' : 'border-white/12 bg-[#181c22]'}`}>
                        <td className={`px-3 py-2.5 text-[11px] font-mono ${txt}`}>TOTAL</td>
                        {cols.map((c, i) => (
                          <td key={i}
                            className={`px-3 py-2.5 text-right text-[11px] font-mono ${c.cls}`}
                            onMouseEnter={e2 => setGridTip({ ...c.tip, x: e2.clientX + 14, y: e2.clientY + 14 })}
                            onMouseLeave={() => setGridTip(null)}
                          >
                            {values[i]}
                          </td>
                        ))}
                      </tr>
                    )
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Day Breakdown ─────────────────────────────────────── */}
          {selectedRow && activeDates.some(d => selectedBD[d]) && (
            <div className={`${card} overflow-hidden`}>
              <div className="px-4 py-3 border-b flex items-center justify-between" style={divBdr}>
                <span className={`text-[11px] font-mono uppercase tracking-wider ${muted}`}>
                  Daily Breakdown — {selectedRow}
                </span>
                <button onClick={() => setSelected(null)}
                  className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-all
                    ${isLight ? 'border-black/20 text-gray-500 hover:text-gray-800' : 'border-white/13 text-[#a8b0be] hover:text-[#f0f2f5]'}`}>
                  Close ✕
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: 800 }}>
                  <thead className={isLight ? 'bg-gray-50' : 'bg-[#181c22]'}>
                    <tr>
                      {['Date','Sent','Delivered','Opens','Clicks','Bounced','Success%','Open%','CTR%','Bounce%'].map((h, i) => (
                        <th key={h}
                          className={`px-3 py-2.5 text-[11px] font-mono tracking-wider uppercase border-b
                            ${i === 0 ? 'text-left' : 'text-right'}
                            ${isLight ? 'border-black/8 text-gray-700' : 'border-white/7 text-[#d4dae6]'}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeDates.filter(d => selectedBD[d]).map(d => {
                      const r = selectedBD[d]
                      const ogCtrVal = r.delivered > 0 ? (r.clicked / r.delivered) * 100 : 0
                      return (
                        <tr key={d} className={`border-b last:border-0 ${isLight ? 'border-black/8' : 'border-white/7'}`}>
                          <td className={`px-3 py-2 text-[11px] font-mono ${txt}`}>{d}</td>
                          <td className={`px-3 py-2 text-right text-[11px] font-mono ${muted}`}>{fmtN(r.sent)}</td>
                          <td className={`px-3 py-2 text-right text-[11px] font-mono ${txt}`}>{fmtN(r.delivered)}</td>
                          <td className="px-3 py-2 text-right text-[11px] font-mono text-[#00e5c3]">{fmtN(r.opened)}</td>
                          <td className="px-3 py-2 text-right text-[11px] font-mono text-[#ffd166]">{fmtN(r.clicked)}</td>
                          <td className={`px-3 py-2 text-right text-[11px] font-mono ${r.bounced > 0 ? 'text-[#ff4757]' : muted}`}>{fmtN(r.bounced)}</td>
                          <td className={`px-3 py-2 text-right text-[11px] font-mono ${r.deliveryRate < 85 ? 'text-[#ffd166]' : txt}`}>{fmtP(r.deliveryRate)}</td>
                          <td className="px-3 py-2 text-right text-[11px] font-mono text-[#00e5c3]">{fmtP(r.openRate)}</td>
                          <td className="px-3 py-2 text-right text-[11px] font-mono text-[#ffd166]">{fmtP(ogCtrVal)}</td>
                          <td className={`px-3 py-2 text-right text-[11px] font-mono ${r.bounceRate > 10 ? 'text-[#ff4757]' : r.bounceRate > 2 ? 'text-[#ffd166]' : muted}`}>
                            {fmtP(r.bounceRate)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Daily KPIs by IP Address ──────────────────────────── */}
          {ipEntityData.length > 0 && dateGroups.length > 0 && (
            <div className={`${card} overflow-hidden`}>
              <div className="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2" style={divBdr}>
                <span className={`text-[11px] font-mono uppercase tracking-wider ${muted}`}>
                  Daily KPIs by IP Address
                  {activeDates.length > 0 && ` · ${fmtDL(activeDates[0])} – ${fmtDL(activeDates[activeDates.length - 1])}`}
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <CustomSelect value={filterIp} onChange={setFilterIp} isLight={isLight} minWidth={90} maxHeight={200}
                    options={[{ value: 'all', label: 'All IPs' }, ...ipEntityData.map(e => ({ value: e.name, label: e.name }))]} />
                  <CustomSelect value={filterDomain} onChange={setFilterDomain} isLight={isLight} minWidth={110} maxHeight={200}
                    options={[{ value: 'all', label: 'All Domains' }, ...Object.keys(data.domains).map(d => ({ value: d, label: d }))]} />
                  <CustomSelect value={filterProvider} onChange={setFilterProvider} isLight={isLight} minWidth={120} maxHeight={200} align="right"
                    options={[{ value: 'all', label: 'All Providers' }, ...Object.keys(data.providerDomains).map(p => ({ value: p, label: p }))]} />
                  {(filterIp !== 'all' || filterDomain !== 'all' || filterProvider !== 'all') && (
                    <button
                      onClick={() => { setFilterIp('all'); setFilterDomain('all'); setFilterProvider('all') }}
                      className={`px-2 py-1 rounded border text-[11px] font-mono uppercase transition-all
                        ${isLight ? 'border-black/20 text-gray-500 hover:border-[#0d9488] hover:text-[#0d9488]' : 'border-white/13 text-[#a8b0be] hover:border-[#0d9488] hover:text-[#0d9488]'}`}
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[11px] font-mono" style={{ minWidth: filteredIpEntityData.length * 5 * 80 + 100 }}>
                  <colgroup>
                    <col style={{ width: 100 }} />
                    {filteredIpEntityData.flatMap(e => GRID_KPIS.map(kpi => (
                      <col key={e.name + kpi.key} />
                    )))}
                  </colgroup>
                  <thead>
                    <tr style={{ background: isLight ? '#f1f3f7' : '#181c22' }}>
                      <th className={`px-3 py-2.5 text-left text-[11px] tracking-widest uppercase border-b border-r ${isLight ? 'border-black/8 text-gray-500' : 'border-white/7 text-[#6b7280]'}`}>
                        Date
                      </th>
                      {filteredIpEntityData.map((e, ei) => (
                        <th key={e.name} colSpan={5}
                          className={`px-3 py-2.5 border-b text-center ${ei < filteredIpEntityData.length - 1 ? 'border-r' : ''} ${isLight ? 'border-black/8' : 'border-white/7'}`}>
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.color }} />
                            <span className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: e.color }}>{e.name}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                    <tr style={{ background: isLight ? '#f1f3f7' : '#181c22' }}>
                      <th className={`border-b border-r ${isLight ? 'border-black/8' : 'border-white/7'}`} />
                      {filteredIpEntityData.flatMap((e, ei) =>
                        GRID_KPIS.map((kpi, ki) => (
                          <th key={e.name + kpi.key}
                            className={`px-3 py-2 text-right border-b ${ki === 4 && ei < filteredIpEntityData.length - 1 ? 'border-r' : ''} ${isLight ? 'border-black/8' : 'border-white/7'}`}
                            style={{ color: kc(kpi), fontSize: 11, letterSpacing: '0.08em' }}>
                            {kpi.label}
                          </th>
                        ))
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIpEntityData.length === 0 ? (
                      <tr>
                        <td colSpan={1 + GRID_KPIS.length}
                          className={`px-4 py-8 text-center text-[11px] font-mono ${muted}`}>
                          No IPs match the selected filters
                        </td>
                      </tr>
                    ) : dateGroups.map((group, gi) => (
                      <tr key={group.label}
                        className={`border-b last:border-0 transition-colors ${isLight ? 'border-black/7 hover:bg-black/3' : 'border-white/5 hover:bg-white/3'}`}>
                        <td className={`px-3 py-2.5 whitespace-nowrap font-semibold border-r ${isLight ? 'border-black/8 text-gray-700' : 'border-white/7 text-[#c8cdd6]'}`}
                          style={{ fontSize: 11 }}>
                          {fmtDL(group.label)}
                        </td>
                        {filteredIpEntityData.flatMap((e, ei) =>
                          GRID_KPIS.map((kpi, ki) => {
                            const r     = aggDates(e.byDate, group.dates)
                            const val   = r ? kpi.getValue(r) : null
                            const prev  = gi > 0 ? aggDates(e.byDate, dateGroups[gi - 1].dates) : null
                            const pVal  = prev ? kpi.getValue(prev) : null
                            const stats = colStats[e.name]?.[kpi.key as string]
                            const bg    = val != null && stats ? ipHeat(kpi.key as string, val, stats.min, stats.max) : 'transparent'
                            const trend = trendArrow(val, pVal, kpi.key as string, isLight)
                            const hasHeatBg = bg !== 'transparent'
                            const valColor = isLight
                              ? (hasHeatBg
                                ? (kpi.key === 'bounceRate' && val != null && val > 10 ? '#991b1b' : kpi.key === 'bounceRate' && val != null && val > 2 ? '#92400e' : '#111827')
                                : kpi.key === 'bounceRate' && val != null
                                  ? val > 10 ? '#BD0B19' : val > 2 ? '#D58B05' : kc(kpi)
                                  : kpi.key === 'deliveryRate' && val != null && val < 95 ? '#D58B05' : kc(kpi))
                              : kpi.key === 'bounceRate' && val != null
                                ? val > 10 ? '#ff6b77' : val > 2 ? '#ffe066' : kc(kpi)
                                : kpi.key === 'deliveryRate' && val != null && val < 95
                                  ? '#ffe066' : kc(kpi)

                            const tipContent = val != null && r ? (() => {
                              const { a, b } = kpi.rawFn(r)
                              const pct = b > 0 ? (a / b * 100).toFixed(kpi.dec) : '—'
                              return {
                                title: kpi.tipTitle,
                                exact: val.toFixed(kpi.dec) + '%',
                                formula: kpi.formula,
                                calc: `${a.toLocaleString()} ÷ ${b.toLocaleString()} × 100 = ${pct}%`,
                                color: valColor,
                              }
                            })() : null

                            return (
                              <td key={e.name + kpi.key + group.label}
                                className={`px-3 py-2.5 text-right ${ki === 4 && ei < filteredIpEntityData.length - 1 ? 'border-r' : ''} ${isLight ? 'border-black/5' : 'border-white/5'}`}
                                style={{ background: bg, fontSize: 11 }}
                                onMouseEnter={e2 => { if (tipContent) setGridTip({ ...tipContent, x: e2.clientX + 14, y: e2.clientY + 14 }) }}
                                onMouseLeave={() => setGridTip(null)}
                              >
                                {val != null ? (
                                  <span className="inline-flex items-center gap-0.5 justify-end" style={{ color: valColor }}>
                                    {val.toFixed(kpi.dec)}%
                                    {trend && <span style={{ color: trend.color, fontSize: 7, lineHeight: 1 }}>{trend.arrow}</span>}
                                  </span>
                                ) : (
                                  <span style={{ opacity: 0.3 }}>—</span>
                                )}
                              </td>
                            )
                          })
                        )}
                      </tr>
                    ))}
                    {filteredIpEntityData.length > 0 && (
                    <tr style={{ background: isLight ? '#e8eaef' : '#1a1e26', borderTop: `2px solid ${isLight ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.1)'}` }}>
                      <td className={`px-3 py-2.5 text-[11px] font-mono font-bold tracking-widest uppercase border-r ${isLight ? 'border-black/8 text-gray-700' : 'border-white/7 text-[#d4dae6]'}`}>
                        Total
                      </td>
                      {filteredIpEntityData.flatMap((e, ei) =>
                        GRID_KPIS.map((kpi, ki) => {
                          const r   = aggDates(e.byDate, activeDates)
                          const val = r ? kpi.getValue(r) : null
                          const valColor = isLight
                            ? (kpi.key === 'bounceRate' && val != null && val > 10 ? '#991b1b' : kpi.key === 'bounceRate' && val != null && val > 2 ? '#92400e' : '#111827')
                            : kpi.key === 'bounceRate' && val != null
                              ? val > 10 ? '#ff6b77' : val > 2 ? '#ffe066' : kc(kpi)
                              : kpi.key === 'deliveryRate' && val != null && val < 95 ? '#ffe066' : kc(kpi)

                          const tipContent = val != null && r ? (() => {
                            const { a, b } = kpi.rawFn(r)
                            const pct = b > 0 ? (a / b * 100).toFixed(kpi.dec) : '—'
                            return { title: kpi.tipTitle, exact: val.toFixed(kpi.dec) + '%', formula: kpi.formula, calc: `${a.toLocaleString()} ÷ ${b.toLocaleString()} × 100 = ${pct}%`, color: valColor }
                          })() : null

                          return (
                            <td key={e.name + kpi.key + 'ip-total'}
                              className={`px-3 py-2.5 text-right font-bold ${ki === 4 && ei < filteredIpEntityData.length - 1 ? 'border-r' : ''} ${isLight ? 'border-black/5' : 'border-white/5'}`}
                              style={{ fontSize: 11 }}
                              onMouseEnter={e2 => { if (tipContent) setGridTip({ ...tipContent, x: e2.clientX + 14, y: e2.clientY + 14 }) }}
                              onMouseLeave={() => setGridTip(null)}
                            >
                              {val != null ? (
                                <span style={{ color: valColor }}>{val.toFixed(kpi.dec)}%</span>
                              ) : (
                                <span style={{ opacity: 0.3 }}>—</span>
                              )}
                            </td>
                          )
                        })
                      )}
                    </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Grid tooltip */}
          {gridTip && (
            <div className="fixed z-[9999] pointer-events-none" style={{ left: gridTip.x, top: gridTip.y, minWidth: 230 }}>
              <div className="rounded-xl shadow-2xl p-4" style={{ background: isLight ? '#ffffff' : '#1a1e26', border: `1px solid ${isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.14)'}` }}>
                <div className="text-[11px] font-mono tracking-widest uppercase mb-2" style={{ color: isLight ? '#9ca3af' : '#6b7280' }}>{gridTip.title}</div>
                <div className="text-2xl font-bold font-mono mb-3" style={{ color: isLight ? '#111827' : '#ffffff' }}>{gridTip.exact}</div>
                <div className="text-[11px] font-mono tracking-widest uppercase mb-1.5" style={{ color: isLight ? '#b45309' : '#ffd166' }}>Formula</div>
                <div className="text-[11px] font-mono mb-1" style={{ color: isLight ? '#374151' : gridTip.color }}>{gridTip.formula}</div>
                <div className="text-[11px] font-mono" style={{ color: isLight ? '#374151' : gridTip.color }}>{gridTip.calc}</div>
              </div>
            </div>
          )}

        </>
      )}
    </div>
  )
}
