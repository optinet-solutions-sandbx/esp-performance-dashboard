'use client'
import { useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import type { TooltipItem } from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'
import { useDashboardStore } from '@/lib/store'
import { fmtN, fmtP, getGridColor, getTextColor, chartTooltip, aggDates, visibleEspData } from '@/lib/utils'
import HiddenEspsBadge from '@/components/ui/HiddenEspsBadge'
import type { DateMetrics } from '@/lib/types'

ChartJS.register(
  CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, Filler, Title, Tooltip, Legend
)

interface DayRow {
  date: string
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  deliveryRate: number
  openRate: number
  bounceRate: number
}

export default function DailyView() {
  const { espData, isLight, hiddenEsps } = useDashboardStore()
  const gc = getGridColor(isLight)
  const tc = getTextColor(isLight)

  const cardClass = `rounded-xl border ${isLight ? 'bg-white border-black/[0.10] shadow-sm' : 'bg-[#111418] border-white/7'}`
  const teal = isLight ? '#006a5b' : '#00e5c3'

  // Merge all dates across all ESPs
  const allEspData = useMemo(() => Object.values(visibleEspData(espData, hiddenEsps)), [espData, hiddenEsps])
  const allDatesSet = new Set<string>()
  allEspData.forEach(d => Object.keys(d.overallByDate).forEach(date => allDatesSet.add(date)))

  // Sort dates (month day format e.g. "Feb 17")
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const sortedDates = [...allDatesSet].sort((a, b) => {
    const [am, ad] = a.split(' ')
    const [bm, bd] = b.split(' ')
    return (MONTHS.indexOf(am) * 31 + parseInt(ad)) - (MONTHS.indexOf(bm) * 31 + parseInt(bd))
  })

  // Take last 7 dates
  const last7 = sortedDates.slice(-7)

  // Merge combined daily rows across all ESPs
  const rows: DayRow[] = last7.map(date => {
    let sent = 0, delivered = 0, opened = 0, clicked = 0, bounced = 0
    allEspData.forEach(d => {
      const r = d.overallByDate[date]
      if (r) {
        sent += r.sent || 0
        delivered += r.delivered || 0
        opened += r.opened || 0
        clicked += r.clicked || 0
        bounced += r.bounced || 0
      }
    })

    return {
      date,
      sent,
      delivered,
      opened,
      clicked,
      bounced,
      deliveryRate: sent > 0 ? (delivered / sent) * 100 : 0,
      openRate: delivered > 0 ? (opened / delivered) * 100 : 0,
      bounceRate: sent > 0 ? (bounced / sent) * 100 : 0,
    }
  }).filter(r => r.sent > 0)

  const hasData = rows.length > 0

  const sentDeliveredData = {
    labels: rows.map(r => r.date),
    datasets: [
      {
        label: 'Sent',
        data: rows.map(r => r.sent),
        borderColor: '#7c5cfc',
        backgroundColor: 'rgba(124,92,252,0.07)',
        fill: true,
        tension: 0.3,
        pointRadius: 5,
        pointHoverRadius: 8,
        borderWidth: 2,
      },
      {
        label: 'Delivered',
        data: rows.map(r => r.delivered),
        borderColor: teal,
        backgroundColor: 'rgba(0,229,195,0.05)',
        fill: true,
        tension: 0.3,
        pointRadius: 5,
        pointHoverRadius: 8,
        borderWidth: 2,
      },
    ],
  }

  const bouncedData = {
    labels: rows.map(r => r.date),
    datasets: [
      {
        label: 'Bounced',
        data: rows.map(r => r.bounced),
        backgroundColor: rows.map(r =>
          r.bounced > 1000 ? (isLight ? '#dc2626cc' : '#ff4757cc') : r.bounced > 100 ? (isLight ? '#b45309cc' : '#ffd166cc') : (isLight ? '#64748bcc' : '#a8b0becc')
        ),
        borderColor: rows.map(r =>
          r.bounced > 1000 ? (isLight ? '#dc2626' : '#ff4757') : r.bounced > 100 ? (isLight ? '#b45309' : '#ffd166') : (isLight ? '#64748b' : '#a8b0be')
        ),
        borderWidth: 1.5,
        borderRadius: 4,
        borderSkipped: false,
      },
    ],
  }

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...chartTooltip(isLight),
        callbacks: {
          label: (ctx: TooltipItem<'line'>) => {
            const row = rows[ctx.dataIndex]
            if (!row) return `${ctx.dataset.label}: ${fmtN(ctx.parsed.y ?? 0)}`
            const val = fmtN(ctx.parsed.y ?? 0)
            if (ctx.dataset.label === 'Delivered') return `Delivered: ${val} — Delivery Rate: ${row.deliveryRate.toFixed(1)}% (${fmtN(row.delivered)} / ${fmtN(row.sent)})`
            return `${ctx.dataset.label}: ${val}`
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { color: tc, font: { size: 10 } },
        grid: { display: false },
        border: { display: false },
      },
      y: {
        ticks: { color: tc, font: { size: 9 }, callback: (v: number | string) => fmtN(Number(v)) },
        grid: { color: gc },
        border: { display: false },
      },
    },
  }

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...chartTooltip(isLight),
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) => {
            const row = rows[ctx.dataIndex]
            if (!row) return `Bounced: ${fmtN(ctx.parsed.y ?? 0)}`
            return `Bounced: ${fmtN(row.bounced)} — Bounce Rate: ${row.bounceRate.toFixed(1)}% (${fmtN(row.bounced)} / ${fmtN(row.sent)})`
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { color: tc, font: { size: 10 } },
        grid: { display: false },
        border: { display: false },
      },
      y: {
        ticks: { color: tc, font: { size: 9 }, callback: (v: number | string) => fmtN(Number(v)) },
        grid: { color: gc },
        border: { display: false },
      },
    },
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-5">
        <h1 className={`text-2xl font-bold tracking-tight ${isLight ? 'text-gray-900' : 'text-[#f0f2f5]'}`}>
          Daily Report
        </h1>
        <p className={`text-sm mt-1 ${isLight ? 'text-gray-500' : 'text-[#a8b0be]'}`}>
          Last 7 days of combined send volume across all ESPs
        </p>
        <HiddenEspsBadge />
      </div>

      {!hasData ? (
        <div className={`${cardClass} p-12 text-center`}>
          <div className="text-4xl mb-4">📅</div>
          <div className={`text-lg font-medium mb-2 ${isLight ? 'text-gray-900' : 'text-[#f0f2f5]'}`}>
            No daily data yet
          </div>
          <div className={`text-sm ${isLight ? 'text-gray-500' : 'text-[#a8b0be]'}`}>
            Upload data to get started
          </div>
        </div>
      ) : (
        <>
          {/* Charts Row */}
          <div className="grid grid-cols-2 gap-4 mb-5">
            {/* Sent vs Delivered */}
            <div className={`${cardClass} p-4`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className={`text-sm font-semibold ${isLight ? 'text-gray-800' : 'text-[#f0f2f5]'}`}>
                    Sent vs Delivered
                  </div>
                  <div className={`text-[11px] font-mono ${isLight ? 'text-gray-400' : 'text-[#a8b0be]'}`}>
                    Last 7 days
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-[11px] font-mono text-[#7c5cfc]">
                    <span className="w-2.5 h-0.5 bg-[#7c5cfc] inline-block rounded" /> Sent
                  </span>
                  <span className="flex items-center gap-1 text-[11px] font-mono text-[#00e5c3]">
                    <span className="w-2.5 h-0.5 bg-[#00e5c3] inline-block rounded" /> Delivered
                  </span>
                </div>
              </div>
              <div style={{ height: 220 }}>
                <Line data={sentDeliveredData} options={lineOptions} />
              </div>
            </div>

            {/* Bounced per day */}
            <div className={`${cardClass} p-4`}>
              <div className="mb-3">
                <div className={`text-sm font-semibold ${isLight ? 'text-gray-800' : 'text-[#f0f2f5]'}`}>
                  Bounced per Day
                </div>
                <div className={`text-[11px] font-mono ${isLight ? 'text-gray-400' : 'text-[#a8b0be]'}`}>
                  Red = critical (&gt;1K) · Amber = elevated (&gt;100)
                </div>
              </div>
              <div style={{ height: 220 }}>
                <Bar data={bouncedData} options={barOptions} />
              </div>
            </div>
          </div>

          {/* Daily Table */}
          <div className={`${cardClass} overflow-hidden`}>
            <div className={`px-4 py-3 border-b ${isLight ? 'border-black/8 bg-gray-50' : 'border-white/7 bg-[#181c22]'}`}>
              <div className={`text-xs font-mono font-bold tracking-wider uppercase ${isLight ? 'text-gray-700' : 'text-[#d4dae6]'}`}>
                Daily Breakdown
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead className={isLight ? 'bg-gray-50' : 'bg-[#181c22]'}>
                  <tr>
                    {['Date', 'Sent', 'Delivered', 'Delivery %', 'Opens', 'Open %', 'Bounced', 'Bounce %'].map((h, i) => (
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
                  {rows.map((row, i) => (
                    <tr
                      key={row.date}
                      className={`border-b last:border-0 ${isLight ? 'border-black/8 hover:bg-black/3' : 'border-white/7 hover:bg-white/3'}`}
                    >
                      <td
                        className="px-4 py-2.5 font-mono text-xs"
                        style={{ color: row.bounced > 1000 ? (isLight ? '#dc2626' : '#ff4757') : isLight ? '#374151' : '#f0f2f5' }}
                      >
                        {row.date}
                        {row.bounced > 1000 && <span className="ml-1.5 text-[#ff4757]">⚠</span>}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono ${isLight ? 'text-gray-600' : 'text-[#a8b0be]'}`}>
                        {fmtN(row.sent)}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono ${isLight ? 'text-gray-600' : 'text-[#a8b0be]'}`}>
                        {fmtN(row.delivered)}
                      </td>
                      <td
                        className="px-4 py-2.5 text-right font-mono"
                        style={{ color: row.deliveryRate > 95 ? teal : row.deliveryRate > 70 ? (isLight ? '#b45309' : '#ffd166') : (isLight ? '#dc2626' : '#ff4757') }}
                      >
                        {fmtP(row.deliveryRate)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[#7c5cfc]">
                        {fmtN(row.opened)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[#7c5cfc]">
                        {fmtP(row.openRate)}
                      </td>
                      <td
                        className="px-4 py-2.5 text-right font-mono"
                        style={{ color: row.bounced > 1000 ? (isLight ? '#dc2626' : '#ff4757') : row.bounced > 100 ? (isLight ? '#b45309' : '#ffd166') : (isLight ? '#475569' : '#a8b0be') }}
                      >
                        {fmtN(row.bounced)}
                      </td>
                      <td
                        className="px-4 py-2.5 text-right font-mono font-bold"
                        style={{ color: row.bounceRate > 10 ? (isLight ? '#dc2626' : '#ff4757') : row.bounceRate > 2 ? (isLight ? '#b45309' : '#ffd166') : teal }}
                      >
                        {fmtP(row.bounceRate)}
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
