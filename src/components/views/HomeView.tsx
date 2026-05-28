'use client'
import { useEffect, useRef, useMemo } from 'react'
import { Chart } from 'chart.js/auto'
import { useDashboardStore } from '@/lib/store'
import { fmtN, getGridColor, getTextColor, chartTooltip, visibleEspNames, visibleEspData } from '@/lib/utils'
import { ESP_COLORS } from '@/lib/data'
import type { ViewName } from '@/lib/types'
import KpiCard from '@/components/ui/KpiCard'
import ChartCard, { LegendItem } from '@/components/ui/ChartCard'
import HiddenEspsBadge from '@/components/ui/HiddenEspsBadge'

export default function HomeView() {
  const { isLight, espData, uploadHistory, setView, setReviewEsp, hiddenEsps } = useDashboardStore()
  const volumeRef = useRef<HTMLCanvasElement>(null)
  const catRef = useRef<HTMLCanvasElement>(null)
  const volumeChart = useRef<Chart | null>(null)
  const catChart = useRef<Chart | null>(null)

  const espList = useMemo(() => visibleEspNames(espData, hiddenEsps), [espData, hiddenEsps])

  const ESP_VIEW_MAP: Record<string, ViewName> = {
    Mailgun: 'mailgun', Netcore: 'netcore', MMS: 'mms',
    Hotsol: 'hotsol', '171 MailsApp': '171mailsapp', Moosend: 'moosend',
  }
  const allEspData = useMemo(() => Object.values(visibleEspData(espData, hiddenEsps)), [espData, hiddenEsps])

  // Aggregate monthly totals across all ESPs
  const monthTotals: Record<string, number> = {}
  allEspData.forEach(data => {
    ;(data.dates || []).forEach(d => {
      const m = d.replace(/\s+\d+$/, '')
      monthTotals[m] = (monthTotals[m] || 0) + (data.overallByDate[d]?.sent || 0)
    })
  })
  const months = Object.keys(monthTotals)
  const volumes = months.map(m => monthTotals[m])

  // Total sent per ESP (for doughnut)
  const espSentMap: Record<string, number> = {}
  espList.forEach(name => {
    const data = espData[name]
    espSentMap[name] = (data.dates || []).reduce((s, d) => s + (data.overallByDate[d]?.sent || 0), 0)
  })
  const totalSent = Object.values(espSentMap).reduce((s, v) => s + v, 0)

  // Unique email provider domains across all ESPs
  const allProviders = new Set<string>()
  allEspData.forEach(d => Object.keys(d.providers || {}).forEach(p => allProviders.add(p)))

  const gc = getGridColor(isLight)
  const tc = getTextColor(isLight)

  useEffect(() => {
    if (!volumeRef.current) return
    volumeChart.current?.destroy()
    volumeChart.current = new Chart(volumeRef.current, {
      type: 'bar',
      data: {
        labels: months.length ? months : ['No data'],
        datasets: [{
          label: 'Sent',
          data: volumes.length ? volumes : [0],
          backgroundColor: isLight ? 'rgba(13,148,128,0.65)' : 'rgba(0,229,195,0.65)',
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { ...chartTooltip(isLight) } },
        scales: {
          x: { ticks: { color: tc, font: { size: 10 } }, grid: { display: false }, border: { display: false } },
          y: {
            ticks: {
              color: tc, font: { size: 10 },
              callback: (v: number | string) => Math.round(Number(v)).toLocaleString(),
            },
            grid: { color: gc }, border: { display: false },
          },
        },
      },
    })
    return () => { volumeChart.current?.destroy(); volumeChart.current = null }
  }, [isLight, JSON.stringify(monthTotals)])

  useEffect(() => {
    if (!catRef.current || espList.length === 0) return
    catChart.current?.destroy()
    const colors = espList.map(name => ESP_COLORS[name] || '#a8b0be')
    catChart.current = new Chart(catRef.current, {
      type: 'doughnut',
      data: {
        labels: espList,
        datasets: [{
          data: espList.map(name => espSentMap[name] || 0.001),
          backgroundColor: colors.map(c => c + 'bf'),
          borderWidth: 0,
          hoverOffset: 8,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '68%',
        plugins: { legend: { display: false }, tooltip: { ...chartTooltip(isLight) } },
      },
    })
    return () => { catChart.current?.destroy(); catChart.current = null }
  }, [isLight, JSON.stringify(espSentMap)])

  const latest = uploadHistory[0]
  const muted = isLight ? '#64748b' : '#5a6478'
  const teal = isLight ? '#006a5b' : '#00e5c3'
  const textMain = isLight ? '#0f172a' : '#f0f2f5'
  const cardBg = isLight ? '#ffffff' : '#111418'
  const cardBorder = isLight ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.06)'
  const hoverBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.02)'

  return (
    <div className="view-page fade-up">
      <div className="section-title" style={{ marginBottom: 4 }}>
        <div className="section-title-bar" style={{ background: teal }} />
        <h1>Overview</h1>
      </div>
      <p className="section-title-sub">ESP performance summary across all providers</p>
      <div style={{ marginTop: 8 }}>
        <HiddenEspsBadge />
      </div>

      {/* KPI row */}
      <div className="grid-kpi">
        <KpiCard
          label="Total Emails Sent"
          value={totalSent > 0 ? fmtN(totalSent) : '—'}
          accent={teal}
          delta={<span style={{ color: muted, fontSize: 11 }}>{espList.length} ESP{espList.length !== 1 ? 's' : ''} tracked</span>}
          icon={
            <svg style={{ width: 18, height: 18 }} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
              <rect x="2" y="4" width="16" height="12" rx="2" />
              <path d="M2 8l8 5 8-5" />
            </svg>
          }
        />
        <KpiCard
          label="Providers Tracked"
          value={allProviders.size || '—'}
          accent="#7c5cfc"
          delta={<span style={{ color: muted, fontSize: 11 }}>{allProviders.size} unique email providers</span>}
          icon={
            <svg style={{ width: 18, height: 18 }} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
              <circle cx="10" cy="7" r="3" />
              <path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6" />
            </svg>
          }
        />
        <KpiCard
          label="Latest Upload"
          value={latest ? latest.esp.toUpperCase() : '—'}
          accent="#ffd166"
          delta={latest
            ? <span style={{ color: muted, fontSize: 11 }}>{latest.file.length > 24 ? latest.file.slice(0,24)+'…' : latest.file}</span>
            : <span style={{ color: muted, fontSize: 11 }}>No uploads yet</span>
          }
          icon={
            <svg style={{ width: 18, height: 18 }} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M10 13V5M7 8l3-3 3 3" strokeLinecap="round" />
              <rect x="3" y="14" width="14" height="3" rx="1.5" />
            </svg>
          }
        />
      </div>

      {/* Charts row */}
      <div className="grid-charts">
        <ChartCard title="Volume by Month" subtitle="Total emails sent across all ESPs" height={200}>
          <canvas ref={volumeRef} />
        </ChartCard>
        <ChartCard
          title="ESP Split"
          subtitle="Volume breakdown by provider"
          height={200}
          legend={
            <>
              {espList.map(name => (
                <LegendItem key={name} color={(ESP_COLORS[name] || '#a8b0be') + 'bf'} label={`${name} — ${fmtN(espSentMap[name] || 0)}`} />
              ))}
            </>
          }
        >
          <canvas ref={catRef} />
        </ChartCard>
      </div>

      {/* ESP quick-access cards */}
      {espList.length > 0 && (
        <div className="grid-2" style={{ marginBottom: 20 }}>
          {espList.map(name => {
            const data = espData[name]
            const sent = espSentMap[name] || 0
            const color = ESP_COLORS[name] || '#a8b0be'
            const provCount = Object.keys(data.providers || {}).length
            const dateCount = (data.dates || []).length
            return (
              <button
                key={name}
                onClick={() => { setReviewEsp(name); setView(ESP_VIEW_MAP[name] ?? 'mailmodo') }}
                style={{
                  background: cardBg, border: `1px solid ${cardBorder}`,
                  borderRadius: 16, padding: '20px 20px', textAlign: 'left', cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = color + '55')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = cardBorder)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 10, fontFamily: 'Space Mono,monospace', letterSpacing: '0.18em', textTransform: 'uppercase', color }}>{name}</span>
                  <span style={{ width: 32, height: 32, borderRadius: 10, background: color + '18', color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>→</span>
                </div>
                <div style={{ fontSize: 32, fontWeight: 700, color: textMain, marginBottom: 4, lineHeight: 1 }}>{fmtN(sent) || '—'}</div>
                <div style={{ fontSize: 12, color: muted }}>{dateCount} date{dateCount !== 1 ? 's' : ''} · {provCount} provider{provCount !== 1 ? 's' : ''} · Click to review</div>
              </button>
            )
          })}
        </div>
      )}

      {/* Recent activity */}
      <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 16, padding: '20px 20px' }}>
        <div style={{ fontSize: 10, fontFamily: 'Space Mono,monospace', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, marginBottom: 16 }}>
          Recent Activity
        </div>
        {uploadHistory.length === 0 ? (
          <div style={{ fontSize: 13, color: muted, padding: '16px 0', textAlign: 'center' }}>
            No uploads yet — use Upload Report to get started.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {uploadHistory.slice(0, 6).map((h, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                borderRadius: 12, transition: 'background 0.12s',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                }}>📂</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: textMain, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {h.file}
                  </div>
                  <div style={{ fontSize: 11, fontFamily: 'Space Mono,monospace', color: muted, marginTop: 2 }}>
                    {h.esp.toUpperCase()} · {h.rows.toLocaleString()} rows · {h.dates.length} dates · {h.time}
                  </div>
                </div>
                <span style={{
                  fontSize: 9, fontFamily: 'Space Mono,monospace', fontWeight: 700,
                  padding: '4px 8px', borderRadius: 8, flexShrink: 0,
                  color: h.newDates > 0 ? teal : muted,
                  background: h.newDates > 0 ? 'rgba(0,229,195,0.08)' : isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${h.newDates > 0 ? 'rgba(0,229,195,0.25)' : 'rgba(255,255,255,0.06)'}`,
                }}>
                  {h.newDates > 0 ? `+${h.newDates} new` : 'updated'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
