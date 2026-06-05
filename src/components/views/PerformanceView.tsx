'use client'
import { useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import type { TooltipItem } from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { useDashboardStore } from '@/lib/store'
import { fmtN, fmtP, getGridColor, getTextColor, chartTooltip, visibleEsps } from '@/lib/utils'
import HiddenEspsBadge from '@/components/ui/HiddenEspsBadge'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export default function PerformanceView() {
  const { esps, isLight, hiddenEsps } = useDashboardStore()
  const gc = getGridColor(isLight)
  const tc = getTextColor(isLight)
  const teal = isLight ? '#006a5b' : '#00e5c3'

  const cardClass = `rounded-xl border ${isLight ? 'bg-white border-black/10' : 'bg-[#111418] border-white/7'}`

  // Only ESPs with real data
  const activeEsps = useMemo(() => visibleEsps(esps.filter(e => e.sent > 0), hiddenEsps), [esps, hiddenEsps])
  const hasData = activeEsps.length > 0

  // Aggregate KPIs across all active ESPs
  const totalSent = activeEsps.reduce((s, e) => s + e.sent, 0)
  const avgDelivery = activeEsps.length
    ? activeEsps.reduce((s, e) => s + e.deliveryRate, 0) / activeEsps.length
    : 0
  const avgOpen = activeEsps.length
    ? activeEsps.reduce((s, e) => s + e.openRate, 0) / activeEsps.length
    : 0
  const avgBounce = activeEsps.length
    ? activeEsps.reduce((s, e) => s + e.bounceRate, 0) / activeEsps.length
    : 0

  // Sort for open rate chart (descending)
  const sortedByOpen = [...activeEsps].sort((a, b) => b.openRate - a.openRate)

  const openRateChartData = {
    labels: sortedByOpen.map(e => e.name),
    datasets: [
      {
        label: 'Open Rate',
        data: sortedByOpen.map(e => +e.openRate.toFixed(2)),
        backgroundColor: sortedByOpen.map(e => e.color + 'cc'),
        borderColor: sortedByOpen.map(e => e.color),
        borderWidth: 1.5,
        borderRadius: 4,
        borderSkipped: false,
      },
    ],
  }

  const bounceRateChartData = {
    labels: activeEsps.map(e => e.name),
    datasets: [
      {
        label: 'Bounce Rate',
        data: activeEsps.map(e => +e.bounceRate.toFixed(2)),
        backgroundColor: activeEsps.map(e =>
          e.bounceRate > 10 ? (isLight ? '#dc2626cc' : '#ff4757cc') : e.bounceRate > 2 ? (isLight ? '#b45309cc' : '#ffd166cc') : teal + 'cc'
        ),
        borderColor: activeEsps.map(e =>
          e.bounceRate > 10 ? (isLight ? '#dc2626' : '#ff4757') : e.bounceRate > 2 ? (isLight ? '#b45309' : '#ffd166') : teal
        ),
        borderWidth: 1.5,
        borderRadius: 4,
        borderSkipped: false,
      },
    ],
  }

  const commonScales = {
    x: {
      ticks: { color: tc, font: { size: 10 }, maxRotation: 30, autoSkip: false },
      grid: { display: false },
      border: { display: false },
    },
    y: {
      ticks: { color: tc, font: { size: 9 }, callback: (v: number | string) => v + '%' },
      grid: { color: gc },
      border: { display: false },
    },
  }

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { ...chartTooltip(isLight) },
    },
  }

  const openRateTooltip = {
    ...chartTooltip(isLight),
    callbacks: {
      label: (ctx: TooltipItem<'bar'>) => {
        const e = sortedByOpen[ctx.dataIndex]
        return e ? `Open Rate: ${e.openRate.toFixed(2)}% (${fmtN(e.opens)} / ${fmtN(e.delivered)})` : ''
      },
    },
  }

  const bounceRateTooltip = {
    ...chartTooltip(isLight),
    callbacks: {
      label: (ctx: TooltipItem<'bar'>) => {
        const e = activeEsps[ctx.dataIndex]
        return e ? `Bounce Rate: ${e.bounceRate.toFixed(2)}% (${fmtN(e.bounced)} / ${fmtN(e.sent)})` : ''
      },
    },
  }

  const kpis = [
    { label: 'Total Sent', value: fmtN(totalSent), accent: isLight ? '#64748b' : '#a8b0be', sub: `${activeEsps.length} ESP${activeEsps.length !== 1 ? 's' : ''}` },
    { label: 'Avg Delivery Rate', value: fmtP(avgDelivery), accent: teal, sub: avgDelivery > 95 ? '▲ Strong delivery' : '▼ Review needed' },
    { label: 'Avg Open Rate', value: fmtP(avgOpen), accent: isLight ? '#5b21b6' : '#7c5cfc', sub: sortedByOpen[0] ? `Best: ${sortedByOpen[0].name}` : '' },
    { label: 'Avg Bounce Rate', value: fmtP(avgBounce), accent: avgBounce > 10 ? (isLight ? '#dc2626' : '#ff4757') : avgBounce > 2 ? (isLight ? '#b45309' : '#ffd166') : teal, sub: avgBounce > 5 ? '⚠ Review needed' : '▲ Within limits' },
  ]

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-5">
        <h1 className={`text-2xl font-bold tracking-tight ${isLight ? 'text-gray-900' : 'text-[#f0f2f5]'}`}>
          Performance
        </h1>
        <HiddenEspsBadge />
        <p className={`text-sm mt-1 ${isLight ? 'text-gray-500' : 'text-[#a8b0be]'}`}>
          ESP performance benchmarking across all providers
        </p>
      </div>

      {!hasData ? (
        <div className={`${cardClass} p-12 text-center`}>
          <div className="text-4xl mb-4">📊</div>
          <div className={`text-lg font-medium mb-2 ${isLight ? 'text-gray-900' : 'text-[#f0f2f5]'}`}>
            No performance data yet
          </div>
          <div className={`text-sm ${isLight ? 'text-gray-500' : 'text-[#a8b0be]'}`}>
            Upload data to get started
          </div>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            {kpis.map(k => (
              <div
                key={k.label}
                className={`${cardClass} px-4 py-3`}
                style={{ borderLeft: `3px solid ${k.accent}` }}
              >
                <div className={`text-[11px] font-mono tracking-wider uppercase mb-1 ${isLight ? 'text-gray-400' : 'text-[#a8b0be]'}`}>
                  {k.label}
                </div>
                <div className={`text-2xl font-bold mb-0.5 ${isLight ? 'text-gray-900' : 'text-[#f0f2f5]'}`}>
                  {k.value}
                </div>
                <div className={`text-[11px] font-mono ${isLight ? 'text-gray-500' : 'text-[#a8b0be]'}`}>
                  {k.sub}
                </div>
              </div>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-2 gap-4 mb-5">
            {/* Open Rate by ESP */}
            <div className={`${cardClass} p-4`}>
              <div className="mb-3">
                <div className={`text-sm font-semibold ${isLight ? 'text-gray-800' : 'text-[#f0f2f5]'}`}>
                  Open Rate by ESP
                </div>
                <div className={`text-[11px] font-mono ${isLight ? 'text-gray-400' : 'text-[#a8b0be]'}`}>
                  Sorted highest → lowest
                </div>
              </div>
              <div style={{ height: 240 }}>
                <Bar
                  data={openRateChartData}
                  options={{
                    ...commonOptions,
                    plugins: { ...commonOptions.plugins, tooltip: openRateTooltip },
                    scales: commonScales,
                  }}
                />
              </div>
            </div>

            {/* Bounce Rate by ESP */}
            <div className={`${cardClass} p-4`}>
              <div className="mb-3">
                <div className={`text-sm font-semibold ${isLight ? 'text-gray-800' : 'text-[#f0f2f5]'}`}>
                  Bounce Rate by ESP
                </div>
                <div className={`text-[11px] font-mono ${isLight ? 'text-gray-400' : 'text-[#a8b0be]'}`}>
                  Red &gt;10% · Amber &gt;2% · Green = healthy
                </div>
              </div>
              <div style={{ height: 240 }}>
                <Bar
                  data={bounceRateChartData}
                  options={{
                    ...commonOptions,
                    plugins: { ...commonOptions.plugins, tooltip: bounceRateTooltip },
                    scales: commonScales,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Full Metrics Table */}
          <div className={`${cardClass} overflow-hidden`}>
            <div className={`px-4 py-3 border-b ${isLight ? 'border-black/8 bg-gray-50' : 'border-white/7 bg-[#181c22]'}`}>
              <div className={`text-xs font-mono font-bold tracking-wider uppercase ${isLight ? 'text-gray-700' : 'text-[#d4dae6]'}`}>
                Full Metrics Table
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead className={isLight ? 'bg-gray-50' : 'bg-[#181c22]'}>
                  <tr>
                    {['ESP', 'Sent', 'Delivered', 'Opens', 'Clicks', 'Bounced', 'Delivery %', 'Open %', 'Click %', 'Bounce %'].map((h, i) => (
                      <th
                        key={h}
                        className={`px-4 py-3 text-[11px] font-mono tracking-wider uppercase border-b
                          ${i === 0 ? 'text-left' : 'text-right'}
                          ${isLight ? 'border-black/8 text-gray-700' : 'border-white/7 text-[#d4dae6]'}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeEsps.map(e => (
                    <tr
                      key={e.name}
                      className={`border-b last:border-0 ${isLight ? 'border-black/8 hover:bg-black/3' : 'border-white/7 hover:bg-white/3'}`}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: e.color }} />
                          <span className={`font-mono text-xs ${isLight ? 'text-gray-800' : 'text-[#f0f2f5]'}`}>{e.name}</span>
                        </div>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono ${isLight ? 'text-gray-600' : 'text-[#a8b0be]'}`}>{fmtN(e.sent)}</td>
                      <td className={`px-4 py-2.5 text-right font-mono ${isLight ? 'text-gray-600' : 'text-[#a8b0be]'}`}>{fmtN(e.delivered)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[#7c5cfc]">{fmtN(e.opens)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[#00b8d9]">{fmtN(e.clicks)}</td>
                      <td
                        className="px-4 py-2.5 text-right font-mono"
                        style={{ color: e.bounceRate > 5 ? (isLight ? '#dc2626' : '#ff4757') : isLight ? '#475569' : '#a8b0be' }}
                      >
                        {fmtN(e.bounced)}
                      </td>
                      <td
                        className="px-4 py-2.5 text-right font-mono"
                        style={{ color: e.deliveryRate > 95 ? teal : e.deliveryRate > 70 ? (isLight ? '#b45309' : '#ffd166') : (isLight ? '#dc2626' : '#ff4757') }}
                      >
                        {fmtP(e.deliveryRate)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[#7c5cfc]">{fmtP(e.openRate)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[#00b8d9]">{fmtP(e.clickRate, 2)}</td>
                      <td
                        className="px-4 py-2.5 text-right font-mono font-bold"
                        style={{ color: e.bounceRate > 10 ? (isLight ? '#dc2626' : '#ff4757') : e.bounceRate > 2 ? (isLight ? '#b45309' : '#ffd166') : teal }}
                      >
                        {fmtP(e.bounceRate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
