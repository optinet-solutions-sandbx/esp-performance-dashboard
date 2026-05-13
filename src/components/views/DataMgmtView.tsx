'use client'
import { useState, useRef } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'
import { useDashboardStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import { getGridColor, getTextColor, chartTooltip } from '@/lib/utils'
import type { DmRecord } from '@/lib/types'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend)

export default function DataMgmtView() {
  const { isLight, dmData, setDmData, resetAllData, hiddenEsps, espData, toggleEspVisibility, setHiddenEsps, ipmData, hiddenIpmIds, setHiddenIpmIds } = useDashboardStore()

  const gc = getGridColor(isLight)
  const tc = getTextColor(isLight)
  const teal = isLight ? '#006a5b' : '#00e5c3'
  const [search, setSearch] = useState('')
  const [filterCountry, setFilterCountry] = useState('')
  const [pinModal, setPinModal] = useState(false)
  const [pinValue, setPinValue] = useState('')
  const [pinError, setPinError] = useState('')
  const [resetConfirm, setResetConfirm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const countries = [...new Set(dmData.map(r => r.country).filter(Boolean))]
  const domains = [...new Set(dmData.map(r => r.domain).filter(Boolean))]

  const filtered = dmData.filter(r => {
    const matchSearch = !search || Object.values(r).some(v => String(v).toLowerCase().includes(search.toLowerCase()))
    const matchCountry = !filterCountry || r.country === filterCountry
    return matchSearch && matchCountry
  })

  async function handleFileLoad(file: File) {
    const text = await file.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) return
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
    const rows: DmRecord[] = lines.slice(1).map(line => {
      const vals = line.split(',')
      const row: DmRecord = {}
      headers.forEach((h, i) => { row[h] = vals[i]?.trim() || '' })
      return row
    })
    setDmData(rows)

    // Sync to Supabase: clear old data, insert new
    await supabase.from('data_management').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (rows.length) {
      await supabase.from('data_management').insert(rows.map(r => ({ raw_data: r })))
    }
  }

  function handleDownload() {
    if (!dmData.length) return
    setPinModal(true)
    setPinValue('')
    setPinError('')
  }

  function confirmDownload() {
    if (pinValue !== '1234') { setPinError('Incorrect PIN'); return }
    const headers = Object.keys(dmData[0] || {})
    const csv = [headers.join(','), ...dmData.map(r => headers.map(h => r[h] || '').join(','))].join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = 'partner_roster.csv'
    a.click()
    setPinModal(false)
  }

  const cardClass = `rounded-xl border ${isLight ? 'bg-white border-black/10' : 'bg-[#111418] border-white/7'}`

  const allEspNames = Object.keys(espData)

  async function hideAll() {
    const toHide = allEspNames.filter(n => !hiddenEsps.includes(n))
    setHiddenEsps(allEspNames)
    for (const name of toHide) {
      await supabase.from('esp_visibility').upsert({ esp: name, hidden: true, updated_at: new Date().toISOString() })
    }
  }

  async function showAll() {
    const toShow = [...hiddenEsps]
    setHiddenEsps([])
    for (const name of toShow) {
      await supabase.from('esp_visibility').upsert({ esp: name, hidden: false, updated_at: new Date().toISOString() })
    }
  }

  const hiddenIpRows = (() => {
    const groups: Record<string, { ip: string; esp: string; recordIds: string[] }> = {}
    ipmData.forEach(r => {
      if (!r.id || !r.ip || !hiddenIpmIds.includes(r.id)) return
      const key = `${r.ip}::${r.esp ?? ''}`
      if (!groups[key]) groups[key] = { ip: r.ip, esp: r.esp ?? '', recordIds: [] }
      groups[key].recordIds.push(r.id)
    })
    return Object.values(groups).sort((a, b) => {
      const ipCmp = a.ip.localeCompare(b.ip, undefined, { numeric: true })
      return ipCmp !== 0 ? ipCmp : a.esp.localeCompare(b.esp)
    })
  })()

  function unhideIp(recordIds: string[]) {
    const drop = new Set(recordIds)
    setHiddenIpmIds(hiddenIpmIds.filter(id => !drop.has(id)))
  }

  function unhideAllIps() {
    setHiddenIpmIds([])
  }

  return (
    <div className="p-6">
      {/* ESP Visibility */}
      <div id="esp-visibility-section" className={`rounded-xl border mb-6 overflow-hidden ${isLight ? 'bg-white border-black/[0.10] shadow-sm' : 'bg-[#111418] border-white/7'}`}>
        <div className={`px-5 py-4 border-b ${isLight ? 'border-black/[0.08]' : 'border-white/7'}`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`text-base font-semibold ${isLight ? 'text-gray-900' : 'text-[#f0f2f5]'}`}>ESP Visibility</h2>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-gray-500' : 'text-[#a8b0be]'}`}>
                Hidden ESPs are removed from all views and totals.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={showAll}
                disabled={hiddenEsps.length === 0}
                className={`px-3 py-1.5 rounded-lg border text-[11px] font-mono uppercase tracking-wider transition-all
                  ${hiddenEsps.length === 0
                    ? (isLight ? 'border-black/[0.08] text-gray-300 cursor-not-allowed' : 'border-white/7 text-[#4a5568] cursor-not-allowed')
                    : (isLight ? 'border-[#0d9488]/40 text-[#0d9488] hover:bg-[#0d9488]/[0.08]' : 'border-[#00e5c3]/40 text-[#00e5c3] hover:bg-[#00e5c3]/10')
                  }`}
              >
                Show All
              </button>
              <button
                onClick={hideAll}
                disabled={hiddenEsps.length >= allEspNames.length}
                className={`px-3 py-1.5 rounded-lg border text-[11px] font-mono uppercase tracking-wider transition-all
                  ${hiddenEsps.length >= allEspNames.length
                    ? (isLight ? 'border-black/[0.08] text-gray-300 cursor-not-allowed' : 'border-white/7 text-[#4a5568] cursor-not-allowed')
                    : (isLight ? 'border-black/[0.15] text-gray-600 hover:border-black/[0.30]' : 'border-white/13 text-[#a8b0be] hover:border-white/25')
                  }`}
              >
                Hide All
              </button>
            </div>
          </div>
        </div>
        {allEspNames.length === 0 ? (
          <div className={`px-5 py-6 text-sm text-center ${isLight ? 'text-gray-400' : 'text-[#a8b0be]'}`}>
            No ESPs uploaded yet.
          </div>
        ) : (
          <div>
            {allEspNames.map(name => {
              const isHidden = hiddenEsps.includes(name)
              return (
                <div
                  key={name}
                  className={`flex items-center justify-between px-5 py-3 border-b last:border-0 ${isLight ? 'border-black/[0.06]' : 'border-white/5'}`}
                >
                  <span className={`text-sm ${isLight ? 'text-gray-900' : 'text-[#f0f2f5]'}`}>{name}</span>
                  <button
                    onClick={() => toggleEspVisibility(name)}
                    className="flex items-center gap-2 cursor-pointer bg-transparent border-0"
                    title={isHidden ? `Show ${name}` : `Hide ${name}`}
                  >
                    <span className={`text-[10px] font-mono uppercase tracking-wider ${isHidden ? (isLight ? 'text-[#b45309]' : 'text-[#ffd166]') : (isLight ? 'text-[#0d9488]' : 'text-[#00e5c3]')}`}>
                      {isHidden ? 'hidden' : 'shown'}
                    </span>
                    <span
                      style={{
                        width: 36, height: 20, borderRadius: 99, position: 'relative', display: 'inline-block',
                        background: isHidden ? (isLight ? '#d1d5db' : '#2d3748') : (isLight ? '#0d9488' : '#00e5c3'),
                        transition: 'background 0.2s',
                      }}
                    >
                      <span
                        style={{
                          width: 14, height: 14, borderRadius: '50%', position: 'absolute', top: 2,
                          left: isHidden ? 2 : 19,
                          background: '#ffffff',
                          transition: 'left 0.2s',
                        }}
                      />
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* IP Visibility */}
      {hiddenIpRows.length > 0 && (
        <div id="ip-visibility-section" className={`rounded-xl border mb-6 overflow-hidden ${isLight ? 'bg-white border-black/[0.10] shadow-sm' : 'bg-[#111418] border-white/7'}`}>
          <div className={`px-5 py-4 border-b ${isLight ? 'border-black/[0.08]' : 'border-white/7'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className={`text-base font-semibold ${isLight ? 'text-gray-900' : 'text-[#f0f2f5]'}`}>IP Visibility</h2>
                <p className={`text-xs mt-0.5 ${isLight ? 'text-gray-500' : 'text-[#a8b0be]'}`}>
                  Hidden IPs are removed from the ESP Deliverability Matrix.
                </p>
              </div>
              <button
                onClick={unhideAllIps}
                className={`px-3 py-1.5 rounded-lg border text-[11px] font-mono uppercase tracking-wider transition-all
                  ${isLight ? 'border-[#0d9488]/40 text-[#0d9488] hover:bg-[#0d9488]/[0.08]' : 'border-[#00e5c3]/40 text-[#00e5c3] hover:bg-[#00e5c3]/10'}`}
              >
                Unhide All
              </button>
            </div>
          </div>
          <div>
            {hiddenIpRows.map(row => (
              <div
                key={`${row.ip}::${row.esp}`}
                className={`flex items-center justify-between px-5 py-3 border-b last:border-0 ${isLight ? 'border-black/[0.06]' : 'border-white/5'}`}
              >
                <div className="flex flex-col">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-sm font-mono ${isLight ? 'text-[#0369a1]' : 'text-[#7dd3fc]'}`}>{row.ip}</span>
                    {row.esp && (
                      <span className={`text-xs ${isLight ? 'text-gray-500' : 'text-[#a8b0be]'}`}>{row.esp}</span>
                    )}
                  </div>
                  {row.recordIds.length > 1 && (
                    <span className={`text-[11px] mt-0.5 ${isLight ? 'text-gray-400' : 'text-[#7a8294]'}`}>
                      {row.recordIds.length} records hidden
                    </span>
                  )}
                </div>
                <button
                  onClick={() => unhideIp(row.recordIds)}
                  title={`Unhide ${row.ip}`}
                  className={`px-3 py-1.5 rounded-lg border text-[11px] font-mono uppercase tracking-wider transition-all
                    ${isLight ? 'border-[#0d9488]/40 text-[#0d9488] hover:bg-[#0d9488]/[0.08]' : 'border-[#00e5c3]/40 text-[#00e5c3] hover:bg-[#00e5c3]/10'}`}
                >
                  Unhide
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight ${isLight ? 'text-gray-900' : 'text-[#f0f2f5]'}`}>
            Data Management
          </h1>
          <p className={`text-sm mt-1 ${isLight ? 'text-gray-500' : 'text-[#a8b0be]'}`}>
            Partner roster and analytics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 rounded-lg bg-[rgb(0,229,195)] hover:bg-[rgb(0,200,170)] text-[#0a1628] text-xs font-mono font-bold tracking-wider uppercase transition-all"
          >
            ↑ Import CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileLoad(f) }}
          />
          {dmData.length > 0 && (
            <button
              onClick={handleDownload}
              className={`px-3 py-2 rounded-lg border text-xs font-mono uppercase tracking-wider transition-all
                ${isLight ? 'border-black/20 text-gray-600 hover:border-[#009e88]' : 'border-white/13 text-[#a8b0be] hover:border-[#00e5c3]'}`}
            >
              ↓ Export CSV
            </button>
          )}
          <button
            onClick={() => setResetConfirm(true)}
            className="px-3 py-2 rounded-lg border border-[#ff4757]/40 text-[#ff4757] text-xs font-mono uppercase tracking-wider hover:bg-[#ff4757]/10 transition-all"
          >
            Reset All Data
          </button>
        </div>
      </div>

      {dmData.length === 0 ? (
        <div className={`${cardClass} p-12 text-center`}>
          <div className="text-4xl mb-4">📊</div>
          <div className={`text-lg font-medium mb-2 ${isLight ? 'text-gray-900' : 'text-[#f0f2f5]'}`}>No roster data</div>
          <div className={`text-sm ${isLight ? 'text-gray-400' : 'text-[#a8b0be]'}`}>
            Import a CSV file with partner data to get started.
          </div>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: 'Total Records', value: dmData.length },
              { label: 'Countries', value: countries.length },
              { label: 'Domains', value: domains.length },
            ].map(s => (
              <div key={s.label} className={`${cardClass} px-4 py-3`}>
                <div className={`text-[11px] font-mono tracking-wider uppercase mb-1 ${isLight ? 'text-gray-400' : 'text-[#a8b0be]'}`}>{s.label}</div>
                <div className={`text-2xl font-bold ${isLight ? 'text-gray-900' : 'text-[#f0f2f5]'}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Charts */}
          {(() => {
            // Top 10 countries by count
            const countryCounts: Record<string, number> = {}
            dmData.forEach(r => { if (r.country) countryCounts[r.country] = (countryCounts[r.country] || 0) + 1 })
            const topCountries = Object.entries(countryCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
            const countryLabels = topCountries.map(([k]) => k)
            const countryValues = topCountries.map(([, v]) => v)

            // Top 8 domains by count
            const domainCounts: Record<string, number> = {}
            dmData.forEach(r => { if (r.domain) domainCounts[r.domain] = (domainCounts[r.domain] || 0) + 1 })
            const topDomains = Object.entries(domainCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
            const domainLabels = topDomains.map(([k]) => k)
            const domainValues = topDomains.map(([, v]) => v)

            const PIE_COLORS = [
              teal + 'cc', '#7c5cfc cc', '#ffd166cc', '#ff6b35cc',
              '#ff4757cc', '#00b8d9cc', '#a8e6cfcc', '#c67cffcc',
            ].map(c => c.replace(' ', ''))

            const barData = {
              labels: countryLabels,
              datasets: [{
                label: 'Records',
                data: countryValues,
                backgroundColor: teal + 'cc',
                borderColor: teal,
                borderWidth: 1.5,
                borderRadius: 4,
                borderSkipped: false,
              }],
            }

            const doughnutData = {
              labels: domainLabels,
              datasets: [{
                data: domainValues,
                backgroundColor: PIE_COLORS,
                borderColor: isLight ? '#ffffff' : '#111418',
                borderWidth: 2,
                hoverOffset: 8,
              }],
            }

            const barOptions = {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: { ...chartTooltip(isLight) },
              },
              scales: {
                x: {
                  ticks: { color: tc, font: { size: 9 }, maxRotation: 25, autoSkip: false },
                  grid: { display: false },
                  border: { display: false },
                },
                y: {
                  ticks: { color: tc, font: { size: 9 } },
                  grid: { color: gc },
                  border: { display: false },
                },
              },
            }

            const doughnutOptions = {
              responsive: true,
              maintainAspectRatio: false,
              cutout: '60%' as const,
              plugins: {
                legend: {
                  position: 'right' as const,
                  labels: {
                    color: tc,
                    font: { size: 10 },
                    padding: 10,
                    boxWidth: 12,
                    boxHeight: 12,
                  },
                },
                tooltip: { ...chartTooltip(isLight) },
              },
            }

            return (
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div className={`${cardClass} p-4`}>
                  <div className="mb-3">
                    <div className={`text-sm font-semibold ${isLight ? 'text-gray-800' : 'text-[#f0f2f5]'}`}>
                      Top 10 Countries
                    </div>
                    <div className={`text-[11px] font-mono ${isLight ? 'text-gray-400' : 'text-[#a8b0be]'}`}>
                      By record count
                    </div>
                  </div>
                  <div style={{ height: 220 }}>
                    <Bar data={barData} options={barOptions} />
                  </div>
                </div>

                <div className={`${cardClass} p-4`}>
                  <div className="mb-3">
                    <div className={`text-sm font-semibold ${isLight ? 'text-gray-800' : 'text-[#f0f2f5]'}`}>
                      Domain Distribution
                    </div>
                    <div className={`text-[11px] font-mono ${isLight ? 'text-gray-400' : 'text-[#a8b0be]'}`}>
                      Top 8 sending domains
                    </div>
                  </div>
                  <div style={{ height: 220 }}>
                    <Doughnut data={doughnutData} options={doughnutOptions} />
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Filters */}
          <div className="flex items-center gap-2 mb-4">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className={`px-3 py-1.5 rounded-lg border text-xs font-mono outline-none transition-all w-44
                ${isLight ? 'bg-gray-50 border-black/15 text-gray-900 placeholder-gray-400 focus:border-[#009e88]' : 'bg-[#181c22] border-white/13 text-[#f0f2f5] placeholder-[#a8b0be] focus:border-[#00e5c3]'}`}
            />
            <select
              value={filterCountry}
              onChange={e => setFilterCountry(e.target.value)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-mono outline-none
                ${isLight ? 'bg-white border-black/20 text-gray-800' : 'bg-[#1e232b] border-white/18 text-white'}`}
            >
              <option value="">All Countries</option>
              {countries.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {(search || filterCountry) && (
              <button
                onClick={() => { setSearch(''); setFilterCountry('') }}
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono transition-all
                  ${isLight ? 'border-black/20 text-gray-500' : 'border-white/13 text-[#a8b0be]'}`}
              >
                Clear
              </button>
            )}
          </div>

          {/* Table */}
          <div className={`${cardClass} overflow-auto max-h-[500px]`}>
            <table className="w-full border-collapse">
              <thead className={`sticky top-0 ${isLight ? 'bg-gray-50' : 'bg-[#181c22]'}`}>
                <tr>
                  {Object.keys(dmData[0] || {}).slice(0, 8).map(h => (
                    <th key={h} className={`px-4 py-3 text-left text-[11px] font-mono tracking-wider uppercase border-b
                      ${isLight ? 'border-black/8 text-gray-700' : 'border-white/7 text-[#d4dae6]'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 200).map((row, i) => (
                  <tr key={i} className={`border-b last:border-0 ${isLight ? 'border-black/8 hover:bg-black/3' : 'border-white/7 hover:bg-white/3'}`}>
                    {Object.keys(dmData[0] || {}).slice(0, 8).map(h => (
                      <td key={h} className={`px-4 py-2.5 text-xs ${isLight ? 'text-gray-800' : 'text-[#f0f2f5]'}`}>
                        {row[h] || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
                {filtered.length > 200 && (
                  <tr><td colSpan={8} className={`px-4 py-3 text-center text-xs ${isLight ? 'text-gray-400' : 'text-[#a8b0be]'}`}>
                    Showing 200 of {filtered.length} records
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Reset Confirm Modal */}
      {resetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setResetConfirm(false)} />
          <div className={`relative z-10 rounded-xl border p-6 w-80 ${isLight ? 'bg-white border-black/10' : 'bg-[#1a1d27] border-white/13'}`}>
            <h3 className={`text-sm font-semibold mb-2 ${isLight ? 'text-gray-900' : 'text-[#f0f2f5]'}`}>Reset All Data?</h3>
            <p className={`text-xs mb-4 ${isLight ? 'text-gray-500' : 'text-[#a8b0be]'}`}>
              This will clear all uploaded reports, ESP data, and upload history. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  resetAllData()
                  setResetConfirm(false)
                  await supabase.from('uploads').delete().neq('id', '00000000-0000-0000-0000-000000000000')
                  await supabase.from('ip_matrix').delete().neq('id', '00000000-0000-0000-0000-000000000000')
                  await supabase.from('data_management').delete().neq('id', '00000000-0000-0000-0000-000000000000')
                }}
                className="flex-1 py-2 rounded-lg bg-[#ff4757] text-white text-xs font-mono font-bold uppercase hover:bg-[#ff6370] transition-all"
              >
                Yes, Clear All
              </button>
              <button
                onClick={() => setResetConfirm(false)}
                className={`flex-1 py-2 rounded-lg border text-xs font-mono uppercase ${isLight ? 'border-black/20 text-gray-500' : 'border-white/13 text-[#a8b0be]'}`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PIN Modal */}
      {pinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setPinModal(false)} />
          <div className={`relative z-10 rounded-xl border p-6 w-72 ${isLight ? 'bg-white border-black/10' : 'bg-[#1a1d27] border-white/13'}`}>
            <h3 className={`text-sm font-semibold mb-3 ${isLight ? 'text-gray-900' : 'text-[#f0f2f5]'}`}>Enter PIN to download</h3>
            <input
              type="password"
              value={pinValue}
              onChange={e => { setPinValue(e.target.value); setPinError('') }}
              onKeyDown={e => e.key === 'Enter' && confirmDownload()}
              placeholder="4-digit PIN"
              maxLength={4}
              className={`w-full px-3 py-2 rounded-lg border outline-none font-mono text-sm mb-1
                ${isLight ? 'bg-white border-black/20 text-gray-900' : 'bg-[#1e232b] border-white/18 text-white'}`}
            />
            {pinError && <div className="text-xs text-[#ff4757] mb-3">{pinError}</div>}
            <div className="flex gap-2 mt-3">
              <button onClick={confirmDownload} className="flex-1 py-2 rounded-lg bg-[#4a2fa0] text-white text-xs font-mono font-bold uppercase">Confirm</button>
              <button onClick={() => setPinModal(false)} className={`flex-1 py-2 rounded-lg border text-xs font-mono uppercase ${isLight ? 'border-black/20 text-gray-500' : 'border-white/13 text-[#a8b0be]'}`}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
