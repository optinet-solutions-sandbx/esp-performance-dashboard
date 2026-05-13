'use client'
import { useState, useMemo, useEffect } from 'react'
import { useDashboardStore } from '@/lib/store'
import { aggDates, fmtN, fmtP, getEspStatus, visibleEspNames } from '@/lib/utils'
import CalendarPicker from '@/components/ui/CalendarPicker'
import HiddenEspsBadge from '@/components/ui/HiddenEspsBadge'
import CustomSelect from '@/components/ui/CustomSelect'
import type { ProviderData } from '@/lib/types'

// ── Types ────────────────────────────────────────────────────────
type AnalyticsTab = 'isp' | 'domain' | 'ip'
type SortCol = 'entity' | 'sent' | 'delivered' | 'deliveryRate' | 'opened' | 'openRate'
  | 'clicked' | 'clickRate' | 'bounced' | 'bounceRate' | 'unsub' | 'complaintRate'
type TopN = 10 | 25 | 50 | 'all'

interface AnalyticsRow {
  entity: string
  rowKey: string
  sent: number
  delivered: number
  deliveryRate: number
  opened: number
  openRate: number
  clicked: number
  clickRate: number
  bounced: number
  bounceRate: number
  unsub: number
  complaintRate: number
  trendData: number[]
  noData?: boolean
}

// ── Sparkline ────────────────────────────────────────────────────
function Sparkline({ data, isLight }: { data: number[]; isLight: boolean }) {
  if (data.length < 2) return <span style={{ color: isLight ? '#9ca3af' : '#4a5568', fontSize: 11 }}>—</span>

  const W = 64, H = 24
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - ((v - min) / range) * (H - 4) - 2
    return `${x},${y}`
  }).join(' ')

  const last = data[data.length - 1]
  const color = last >= 95 ? '#00e5c3' : last >= 70 ? '#ffd166' : '#ff4757'

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

// ── Row builder for ISP / Domain tabs ───────────────────────────
function buildRows(
  source: Record<string, ProviderData>,
  selectedDates: string[],
): AnalyticsRow[] {
  return Object.entries(source).flatMap(([entity, provData]) => {
    const agg = aggDates(provData.byDate, selectedDates)
    if (!agg) return []
    const trendData = selectedDates
      .map(d => {
        const m = provData.byDate[d]
        return m?.deliveryRate ?? null
      })
      .filter((v): v is number => v !== null)

    return [{
      entity,
      rowKey: entity,
      sent: agg.sent,
      delivered: agg.delivered,
      deliveryRate: agg.deliveryRate,
      opened: agg.opened,
      openRate: agg.openRate,
      clicked: agg.clicked,
      clickRate: agg.clickRate,
      bounced: agg.bounced,
      bounceRate: agg.bounceRate,
      unsub: agg.unsubscribed ?? 0,
      complaintRate: agg.complaintRate ?? 0,
      trendData,
    }]
  })
}

// ── KPI summary row ──────────────────────────────────────────────
function KpiSummary({ rows, isLight }: { rows: AnalyticsRow[]; isLight: boolean }) {
  const totalSent = rows.reduce((s, r) => s + r.sent, 0)
  const totalDel  = rows.reduce((s, r) => s + r.delivered, 0)
  const totalOpen = rows.reduce((s, r) => s + r.opened, 0)
  const totalClk  = rows.reduce((s, r) => s + r.clicked, 0)
  const totalBnc  = rows.reduce((s, r) => s + r.bounced, 0)

  const deliveryRate = totalSent > 0 ? (totalDel / totalSent) * 100 : 0
  const openRate     = totalDel  > 0 ? (totalOpen / totalDel) * 100 : 0
  const clickRate    = totalOpen > 0 ? (totalClk / totalOpen) * 100 : 0
  const bounceRate   = totalSent > 0 ? (totalBnc / totalSent) * 100 : 0

  const cardBg     = isLight ? '#ffffff' : '#151a22'
  const cardBorder = isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)'
  const labelColor = isLight ? '#6b7280' : '#6b7280'

  const kpis = [
    { label: 'Sent',          value: fmtN(totalSent),    color: isLight ? '#374151' : '#c8cdd6' },
    { label: 'Delivery Rate', value: fmtP(deliveryRate), color: '#7c5cfc' },
    { label: 'Open Rate',     value: fmtP(openRate),     color: '#00e5c3' },
    { label: 'Click Rate',    value: fmtP(clickRate),    color: isLight ? '#D58B05' : '#ffd166' },
    { label: 'Bounce Rate',   value: fmtP(bounceRate),   color: bounceRate > 10 ? '#ff4757' : bounceRate > 2 ? (isLight ? '#b45309' : '#ffd166') : '#00e5c3' },
  ]

  return (
    <div className="grid-kpi-5">
      {kpis.map(k => (
        <div key={k.label} style={{
          background: cardBg, border: `1px solid ${cardBorder}`,
          borderRadius: 12, padding: '14px 16px',
        }}>
          <div style={{ fontSize: 9, fontFamily: 'Space Mono, monospace', letterSpacing: '0.12em', textTransform: 'uppercase', color: labelColor, marginBottom: 6 }}>
            {k.label}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: k.color, letterSpacing: '-0.02em' }}>
            {k.value}
          </div>
        </div>
      ))}
    </div>
  )
}

// ESP name → IP Matrix alias(es) — same map as MatrixView / MailmodoView
const ESP_IPM_ALIASES: Record<string, string[]> = {
  '171 mailsapp': ['171'],
}

function isIPv4(str: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(str.trim())
}

// ── Main view ────────────────────────────────────────────────────
export default function AnalyticsView() {
  const { espData, ipmData, isLight, hiddenEsps, dateFilters, setDateFilter } = useDashboardStore()

  const espNames = useMemo(() => visibleEspNames(espData, hiddenEsps), [espData, hiddenEsps])
  const [selectedEsp, setSelectedEsp] = useState<string>(espNames[0] ?? '')
  const [activeTab, setActiveTab]     = useState<AnalyticsTab>('isp')
  const [sortCol, setSortCol]         = useState<SortCol>('sent')
  const [sortDir, setSortDir]         = useState<1 | -1>(-1)
  const [searchQ, setSearchQ]         = useState('')
  const [topN, setTopN]               = useState<TopN>(25)

  // Re-sync selectedEsp when espData loads or the selected ESP becomes hidden
  useEffect(() => {
    if (!selectedEsp && espNames.length > 0) {
      setSelectedEsp(espNames[0])
    } else if (selectedEsp && hiddenEsps.includes(selectedEsp)) {
      setSelectedEsp(espNames[0] ?? '')
    }
  }, [espNames, selectedEsp, hiddenEsps])

  const mmData    = espData[selectedEsp]
  const allDates  = mmData?.dates ?? []
  const datesFull = mmData?.datesFull ?? []

  const filterKey       = `analytics:${selectedEsp}`
  const df              = dateFilters[filterKey]
  const fromIso         = df?.from        ?? ''
  const toIso           = df?.to          ?? ''
  const appliedFromIso  = df?.appliedFrom ?? ''
  const appliedToIso   = df?.appliedTo   ?? ''

  const setFromIso = (iso: string) => setDateFilter(filterKey, { from: iso })
  const setToIso   = (iso: string) => setDateFilter(filterKey, { to: iso })

  function handleEspChange(name: string) {
    setSelectedEsp(name)
    setSortCol('sent')
    setSortDir(-1)
    setSearchQ('')
  }

  function handleFilter() {
    setDateFilter(filterKey, { appliedFrom: fromIso, appliedTo: toIso })
  }

  const selectedDates = useMemo(() => {
    if (!appliedFromIso && !appliedToIso) return allDates
    const lo = appliedFromIso && appliedToIso ? (appliedFromIso < appliedToIso ? appliedFromIso : appliedToIso) : appliedFromIso || appliedToIso
    const hi = appliedFromIso && appliedToIso ? (appliedFromIso < appliedToIso ? appliedToIso : appliedFromIso) : appliedFromIso || appliedToIso
    return allDates.filter(label => {
      const df = datesFull.find(d => d.label === label)
      if (!df?.iso) return true
      return df.iso >= lo && df.iso <= hi
    })
  }, [allDates, datesFull, appliedFromIso, appliedToIso])

  // ── Data pipeline — fully inline, zero memoization.
  //    Memos were causing stale IP-tab data to persist when switching tabs.
  //    Dataset sizes (~50–200 entries) make the cost of recomputing negligible.
  const espNameLower  = selectedEsp?.toLowerCase() ?? ''
  const espAliases    = ESP_IPM_ALIASES[espNameLower] ?? []
  const ipmMatchNames = [espNameLower, ...espAliases.map(a => a.toLowerCase())]
  const espIpmRecs    = ipmData.filter(r => ipmMatchNames.includes(r.esp?.toLowerCase() ?? ''))

  let rawRows: AnalyticsRow[] = []
  if (mmData) {
    if (activeTab === 'isp') {
      const src = Object.fromEntries(Object.entries(mmData.providers).filter(([k]) => !isIPv4(k)))
      rawRows = buildRows(src, selectedDates)
    } else if (activeTab === 'domain') {
      const src = Object.fromEntries(Object.entries(mmData.domains).filter(([k]) => !isIPv4(k)))
      rawRows = buildRows(src, selectedDates)
    } else {
      rawRows = espIpmRecs.flatMap(rec => {
        const domainData = mmData.domains[rec.domain] ?? mmData.domains[rec.ip]
        if (!domainData) {
          return [{ entity: rec.ip, rowKey: `${rec.ip}-${rec.domain}-nodata`, sent: 0, delivered: 0, deliveryRate: 0, opened: 0, openRate: 0, clicked: 0, clickRate: 0, bounced: 0, bounceRate: 0, unsub: 0, complaintRate: 0, trendData: [], noData: true }]
        }
        const agg = aggDates(domainData.byDate, selectedDates)
        if (!agg) return [{ entity: rec.ip, rowKey: `${rec.ip}-${rec.domain}-noagg`, sent: 0, delivered: 0, deliveryRate: 0, opened: 0, openRate: 0, clicked: 0, clickRate: 0, bounced: 0, bounceRate: 0, unsub: 0, complaintRate: 0, trendData: [], noData: true }]
        const trendData = selectedDates.map(d => domainData.byDate[d]?.deliveryRate ?? null).filter((v): v is number => v !== null)
        return [{ entity: rec.ip, rowKey: `${rec.ip}-${rec.domain}`, sent: agg.sent, delivered: agg.delivered, deliveryRate: agg.deliveryRate, opened: agg.opened, openRate: agg.openRate, clicked: agg.clicked, clickRate: agg.clickRate, bounced: agg.bounced, bounceRate: agg.bounceRate, unsub: agg.unsubscribed ?? 0, complaintRate: agg.complaintRate ?? 0, trendData }]
      })
    }
  }

  const sorted = [...rawRows].sort((a, b) => {
    const av = a[sortCol], bv = b[sortCol]
    if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * sortDir
    return ((av as number) - (bv as number)) * sortDir
  })

  const searched = searchQ.trim()
    ? sorted.filter(r => r.entity.toLowerCase().includes(searchQ.toLowerCase()))
    : sorted

  const displayed = topN === 'all' ? searched : searched.slice(0, topN)

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 1 ? -1 : 1)
    else { setSortCol(col); setSortDir(-1) }
  }

  // ── Colors ──
  const bg          = isLight ? '#f0f2f6' : '#0a0c10'
  const cardBg      = isLight ? '#ffffff' : '#151a22'
  const cardBorder  = isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)'
  const textColor   = isLight ? '#374151' : '#c8cdd6'
  const mutedColor  = isLight ? '#9ca3af' : '#6b7280'
  const headerBg    = isLight ? '#f9fafb' : '#0e1116'
  const rowHover    = isLight ? '#f9fafb' : '#181c22'
  const borderColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)'
  const activeAccent = isLight ? '#0d9488' : '#00e5c3'
  const inputBg     = isLight ? '#ffffff' : '#1a1f28'
  const inputBorder = isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.1)'

  const TABS: { id: AnalyticsTab; label: string }[] = [
    { id: 'isp',    label: 'ISP' },
    { id: 'domain', label: 'Domain' },
    { id: 'ip',     label: 'IP' },
  ]

  const TOP_N_OPTIONS: { value: TopN; label: string }[] = [
    { value: 10,    label: 'Top 10' },
    { value: 25,    label: 'Top 25' },
    { value: 50,    label: 'Top 50' },
    { value: 'all', label: 'All' },
  ]

  const entityLabel = activeTab === 'isp' ? 'ISP' : activeTab === 'domain' ? 'Domain' : 'IP'

  type ColDef = { key: SortCol; label: string; align?: 'right' | 'left' }
  const COLS: ColDef[] = [
    { key: 'entity',        label: entityLabel },
    { key: 'sent',          label: 'Sent',       align: 'right' },
    { key: 'delivered',     label: 'Delivered',  align: 'right' },
    { key: 'deliveryRate',  label: 'Del. Rate',  align: 'right' },
    { key: 'opened',        label: 'Opened',     align: 'right' },
    { key: 'openRate',      label: 'Open Rate',  align: 'right' },
    { key: 'clicked',       label: 'Clicked',    align: 'right' },
    { key: 'clickRate',     label: 'Click Rate', align: 'right' },
    { key: 'bounced',       label: 'Bounced',    align: 'right' },
    { key: 'bounceRate',    label: 'Bounce %',   align: 'right' },
    { key: 'unsub',         label: 'Unsub',      align: 'right' },
    { key: 'complaintRate', label: 'Complaint%', align: 'right' },
  ]

  function bounceCellStyle(rate: number) {
    const status = getEspStatus(rate, 100)
    if (status === 'critical') return { color: '#ff4757',                                background: 'rgba(255,71,87,0.08)' }
    if (status === 'warn')     return { color: isLight ? '#b45309' : '#ffd166',          background: 'rgba(255,209,102,0.08)' }
    return                            { color: isLight ? '#0d9488' : '#00e5c3',          background: 'rgba(0,229,195,0.08)' }
  }

  function cellVal(row: AnalyticsRow, key: SortCol): React.ReactNode {
    if (key === 'entity') {
      return <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 11 }}>{row.entity}</span>
    }
    if (row.noData) return <span style={{ color: mutedColor }}>—</span>
    const v = row[key] as number
    if (key === 'bounceRate') {
      const s = bounceCellStyle(v)
      return (
        <span style={{ ...s, padding: '2px 6px', borderRadius: 6, fontSize: 11, fontFamily: 'Space Mono, monospace', fontWeight: 600 }}>
          {fmtP(v)}
        </span>
      )
    }
    if (key === 'deliveryRate' || key === 'openRate' || key === 'clickRate' || key === 'complaintRate') {
      return <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 11 }}>{fmtP(v)}</span>
    }
    return <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 11 }}>{fmtN(v)}</span>
  }

  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) return <span style={{ opacity: 0.25, marginLeft: 3, fontSize: 9 }}>↕</span>
    return <span style={{ marginLeft: 3, fontSize: 9, color: activeAccent }}>{sortDir === -1 ? '↓' : '↑'}</span>
  }

  if (espNames.length === 0) {
    return (
      <div style={{ padding: 40, color: mutedColor, fontFamily: 'Space Mono, monospace', fontSize: 13 }}>
        No ESP data loaded. Upload a report first.
      </div>
    )
  }

  return (
    <div style={{ padding: '28px', background: bg, minHeight: '100vh' }}>

      {/* ── Header controls ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <CustomSelect
          value={selectedEsp}
          onChange={handleEspChange}
          options={espNames.map(n => ({ value: n, label: n }))}
          isLight={isLight}
          minWidth={130}
        />
        <HiddenEspsBadge />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CalendarPicker
            value={fromIso}
            onChange={setFromIso}
            isLight={isLight}
            rangeStart={fromIso}
            rangeEnd={toIso}
          />
          <span style={{ color: mutedColor, fontSize: 12 }}>→</span>
          <CalendarPicker
            value={toIso}
            onChange={setToIso}
            isLight={isLight}
            rangeStart={fromIso}
            rangeEnd={toIso}
            align="right"
          />
        </div>

        <button
          onClick={handleFilter}
          style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 11, fontFamily: 'Space Mono, monospace',
            fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
            border: `1px solid ${activeAccent}`, color: activeAccent,
            background: isLight ? 'rgba(13,148,128,0.08)' : 'rgba(0,229,195,0.10)',
            transition: 'all 0.12s',
          }}
        >Filter</button>
        <button
          onClick={handleFilter}
          title="Refresh"
          style={{
            width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${inputBorder}`, background: 'transparent', cursor: 'pointer',
            color: mutedColor, transition: 'all 0.12s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = activeAccent; (e.currentTarget as HTMLButtonElement).style.color = activeAccent }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = inputBorder; (e.currentTarget as HTMLButtonElement).style.color = mutedColor }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.5 2A5 5 0 1 0 11 6.5"/><path d="M10.5 2v3h-3"/>
          </svg>
        </button>

        <span style={{ fontSize: 11, color: mutedColor, fontFamily: 'Space Mono, monospace' }}>
          {selectedDates.length} day{selectedDates.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSortCol('sent'); setSortDir(-1); setSearchQ('') }}
              style={{
                padding: '8px 20px', borderRadius: 10, border: `1px solid ${active ? 'transparent' : cardBorder}`,
                cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 400,
                background: active ? activeAccent : cardBg,
                color: active ? (isLight ? '#ffffff' : '#0a0c10') : textColor,
                transition: 'all 0.12s',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── KPI row ── */}
      <KpiSummary rows={searched} isLight={isLight} />

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder={`Search ${entityLabel}…`}
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          style={{
            background: inputBg, border: `1px solid ${inputBorder}`, borderRadius: 8,
            color: textColor, fontSize: 12, padding: '7px 12px', outline: 'none',
            fontFamily: 'Space Mono, monospace', width: 220,
          }}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {TOP_N_OPTIONS.map(opt => (
            <button
              key={String(opt.value)}
              onClick={() => setTopN(opt.value)}
              style={{
                padding: '6px 12px', borderRadius: 8,
                border: `1px solid ${topN === opt.value ? activeAccent : inputBorder}`,
                background: topN === opt.value ? (isLight ? 'rgba(13,148,128,0.1)' : 'rgba(0,229,195,0.08)') : 'transparent',
                color: topN === opt.value ? activeAccent : mutedColor,
                fontSize: 11, fontFamily: 'Space Mono, monospace', cursor: 'pointer',
                transition: 'all 0.12s',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: mutedColor, fontFamily: 'Space Mono, monospace', marginLeft: 'auto' }}>
          {displayed.length} / {rawRows.length} rows
        </span>
      </div>

      {/* ── Table ── */}
      <div key={activeTab} style={{
        background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 14, overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: headerBg }}>
                {COLS.map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    style={{
                      padding: '10px 14px', textAlign: col.align ?? 'left',
                      fontSize: 10, fontFamily: 'Space Mono, monospace', letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: sortCol === col.key ? activeAccent : mutedColor,
                      cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none',
                      borderBottom: `1px solid ${borderColor}`,
                    }}
                  >
                    {col.label}<SortIcon col={col.key} />
                  </th>
                ))}
                <th style={{
                  padding: '10px 14px', textAlign: 'center',
                  fontSize: 10, fontFamily: 'Space Mono, monospace', letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: mutedColor, whiteSpace: 'nowrap',
                  borderBottom: `1px solid ${borderColor}`,
                }}>
                  Trend
                </th>
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan={COLS.length + 1} style={{ padding: '40px 14px', textAlign: 'center', color: mutedColor, fontFamily: 'Space Mono, monospace', fontSize: 12 }}>
                    No data for selected range
                  </td>
                </tr>
              ) : displayed.map((row, i) => (
                <tr
                  key={row.rowKey}
                  style={{ borderBottom: `1px solid ${borderColor}`, transition: 'background 0.1s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = rowHover }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}
                >
                  {COLS.map(col => (
                    <td
                      key={col.key}
                      style={{
                        padding: '10px 14px',
                        textAlign: col.align ?? 'left',
                        color: textColor,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {cellVal(row, col.key)}
                    </td>
                  ))}
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <Sparkline data={row.trendData} isLight={isLight} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
