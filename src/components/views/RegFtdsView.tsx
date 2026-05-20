'use client'
import { useRef, useState, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { useDashboardStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'

function parseDate(val: unknown): string | null {
  const s = String(val ?? '').trim()
  if (!s) return null
  const n = Number(s)
  // Excel serial date (threshold > 40000 = after 2009)
  if (!isNaN(n) && n > 40000) {
    return new Date((n - 25569) * 86400 * 1000).toISOString().split('T')[0]
  }
  // dd/mm/yyyy
  const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2, '0')}-${ddmm[1].padStart(2, '0')}`
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function RegFtdsView() {
  const { isLight, regFtdsDaily, setRegFtdsDaily, selectedRegDate, setSelectedRegDate } = useDashboardStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing] = useState(false)
  const [log, setLog] = useState<{ inserted: number; dates: number; rows: number } | null>(null)

  const txt   = isLight ? 'text-gray-900' : 'text-[#f0f2f5]'
  const muted = isLight ? 'text-gray-400' : 'text-[#6b7280]'
  const bdr   = isLight ? 'border-black/10' : 'border-white/7'
  const surf  = isLight ? 'bg-white' : 'bg-[#111418]'

  const availableDates = useMemo(() =>
    [...new Set(regFtdsDaily.map(r => r.date))].sort(),
    [regFtdsDaily]
  )

  const filtered = useMemo(() =>
    selectedRegDate ? regFtdsDaily.filter(r => r.date === selectedRegDate) : regFtdsDaily,
    [regFtdsDaily, selectedRegDate]
  )

  const totalReg  = filtered.reduce((s, r) => s + r.registrations, 0)
  const totalFtds = filtered.reduce((s, r) => s + r.ftds, 0)

  const perIp = useMemo(() => {
    const map = new Map<string, { esp: string; ip: string; reg: number; ftds: number }>()
    for (const r of filtered) {
      const key = `${r.esp}|${r.ip}`
      const prev = map.get(key) ?? { esp: r.esp, ip: r.ip, reg: 0, ftds: 0 }
      map.set(key, { esp: r.esp, ip: r.ip, reg: prev.reg + r.registrations, ftds: prev.ftds + r.ftds })
    }
    return [...map.values()].filter(r => r.reg > 0 || r.ftds > 0).sort((a, b) => b.reg - a.reg || b.ftds - a.ftds)
  }, [filtered])

  async function handleFile(file: File) {
    setProcessing(true)
    setLog(null)
    try {
      const isExcel = file.name.match(/\.xlsx?$/i)
      let rows: string[][]
      if (isExcel) {
        const buf = await file.arrayBuffer()
        const wb  = XLSX.read(buf, { type: 'array' })
        const ws  = wb.Sheets[wb.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][]
        rows = rows.filter(r => r.some(c => String(c).trim() !== ''))
      } else {
        const text = await file.text()
        rows = text.trim().split('\n').map(l => l.split(','))
      }
      if (rows.length < 2) return

      const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/[^a-z]/g, ''))
      const find = (...cands: string[]) => headers.findIndex(h => cands.some(c => h.includes(c)))
      const ci = {
        date: find('date'),
        esp:  find('esp', 'provider', 'service'),
        ip:   find('ip', 'ipaddress', 'address'),
        reg:  find('registrations', 'registration', 'reg'),
        ftds: find('ftds', 'ftd'),
      }

      const parseNum = (val: unknown) => { const n = Number(String(val ?? '').trim()); return isNaN(n) ? undefined : n }

      // Aggregate rows by (date, esp, ip)
      const aggregated = new Map<string, { date: string; esp: string; ip: string; reg: number; ftds: number }>()
      const uniqueDates = new Set<string>()

      for (const row of rows.slice(1)) {
        const dateIso = ci.date >= 0 ? parseDate(row[ci.date]) : null
        const espVal  = ci.esp  >= 0 ? String(row[ci.esp] ?? '').trim() : ''
        const ipVal   = ci.ip   >= 0 ? String(row[ci.ip]  ?? '').trim() : ''
        const reg     = ci.reg  >= 0 ? parseNum(row[ci.reg])  : undefined
        const ftds    = ci.ftds >= 0 ? parseNum(row[ci.ftds]) : undefined
        if (!dateIso || !espVal || !ipVal) continue
        if (reg === undefined && ftds === undefined) continue
        uniqueDates.add(dateIso)
        const key = `${dateIso}|${espVal.toLowerCase()}|${ipVal}`
        const prev = aggregated.get(key) ?? { date: dateIso, esp: espVal, ip: ipVal, reg: 0, ftds: 0 }
        aggregated.set(key, { ...prev, reg: prev.reg + (reg ?? 0), ftds: prev.ftds + (ftds ?? 0) })
      }

      if (aggregated.size === 0) return

      const datesArr = [...uniqueDates]
      // Replace existing records for these dates
      await supabase.from('reg_ftds_daily').delete().in('date', datesArr)

      const toInsert = [...aggregated.values()].map(a => ({
        date: a.date, esp: a.esp, ip: a.ip, registrations: a.reg, ftds: a.ftds,
      }))
      await supabase.from('reg_ftds_daily').insert(toInsert)

      // Reload store from DB
      const { data: allRows } = await supabase
        .from('reg_ftds_daily')
        .select('id, date, esp, ip, registrations, ftds')
        .order('date', { ascending: true })
      setRegFtdsDaily((allRows ?? []).map(r => ({
        id: r.id, date: r.date, esp: r.esp, ip: r.ip,
        registrations: r.registrations ?? 0, ftds: r.ftds ?? 0,
      })))

      setLog({ inserted: toInsert.length, dates: datesArr.length, rows: rows.length - 1 })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="p-6 space-y-5">

      {/* Header + date filter */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className={`text-xl font-bold tracking-tight ${txt}`}>Reg &amp; FTDs</h1>
          <p className={`text-xs font-mono mt-1 ${muted}`}>Date-level registration and FTD breakdown by IP</p>
        </div>
        {availableDates.length > 0 && (
          <div className="flex items-center gap-2">
            <label className={`text-[11px] font-mono tracking-widest uppercase ${muted}`}>Date</label>
            <select
              value={selectedRegDate}
              onChange={e => setSelectedRegDate(e.target.value)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-mono outline-none cursor-pointer transition-all
                ${isLight ? 'bg-[#f4f5f8] border-black/18 text-gray-800 hover:border-[#0d9488]' : 'bg-[#1e232b] border-white/14 text-white hover:border-[#0d9488]'}`}
            >
              <option value="">All dates</option>
              {availableDates.map(d => (
                <option key={d} value={d}>{fmtDate(d)}</option>
              ))}
            </select>
            {selectedRegDate && (
              <button
                onClick={() => setSelectedRegDate('')}
                className={`text-xs font-mono px-2 py-1 rounded-lg border transition-all
                  ${isLight ? 'border-black/15 text-gray-500 hover:text-[#ff4757] hover:border-[#ff4757]/40' : 'border-white/10 text-[#6b7280] hover:text-[#ff4757] hover:border-[#ff4757]/40'}`}
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: 'Registrations', value: totalReg,  color: isLight ? '#006a5b' : '#00e5c3' },
          { label: 'FTDs',          value: totalFtds, color: isLight ? '#b45309' : '#ffd166' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-xl border p-5 ${surf} ${bdr}`}>
            <div className={`text-[11px] font-mono tracking-widest uppercase mb-2 ${muted}`}>{label}</div>
            <div className="text-3xl font-bold font-mono" style={{ color }}>{value.toLocaleString()}</div>
            {selectedRegDate && (
              <div className={`text-[11px] font-mono mt-1.5 ${muted}`}>{fmtDate(selectedRegDate)}</div>
            )}
          </div>
        ))}
      </div>

      {/* Upload card */}
      <div className={`rounded-xl border p-6 ${surf} ${bdr}`}>
        <div className={`text-[11px] font-mono tracking-widest uppercase mb-4 ${muted}`}>Upload File</div>
        <div className={`text-xs font-mono mb-1 ${txt}`}>
          Columns: <span className="font-semibold">Date</span>, <span className="font-semibold">ESP</span>,{' '}
          <span className="font-semibold">IP</span>, <span className="font-semibold">Registrations</span>,{' '}
          <span className="font-semibold">FTD</span>
        </div>
        <div className={`text-[11px] font-mono mb-5 ${muted}`}>
          Stored per date &amp; IP. Re-uploading the same dates replaces existing records.
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={processing}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all
            ${processing ? 'opacity-50 cursor-not-allowed' : ''}
            bg-[rgb(0,229,195)] hover:bg-[rgb(0,200,170)] text-[#0a1628]`}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M8 10V2M5 5l3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="2" y="11" width="12" height="3" rx="1" />
          </svg>
          {processing ? 'Processing…' : 'Upload File'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xls,.xlsx"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { handleFile(f); e.target.value = '' } }}
        />

        {log && (
          <div className={`mt-5 pt-5 border-t flex items-center gap-5 flex-wrap text-[11px] font-mono ${isLight ? 'border-black/8' : 'border-white/7'}`}>
            <span className={muted}>{log.rows} rows processed</span>
            <span style={{ color: isLight ? '#006a5b' : '#00e5c3' }}>
              ✓ {log.inserted} IP records across {log.dates} date{log.dates !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Per-IP breakdown */}
      {perIp.length > 0 && (
        <div>
          <div className={`text-[11px] font-mono tracking-widest uppercase mb-2 ${muted}`}>
            IP Breakdown{selectedRegDate ? ` — ${fmtDate(selectedRegDate)}` : ' — All dates'}
          </div>
          <div className={`rounded-xl border overflow-hidden ${surf} ${bdr}`}>
            <table className="w-full border-collapse text-[11px] font-mono">
              <thead>
                <tr className={isLight ? 'bg-gray-50' : 'bg-[#181c22]'}>
                  {['ESP', 'IP Address', 'Reg', 'FTDs'].map((h, i) => (
                    <th key={h} className={`px-3 py-2.5 font-mono tracking-widest uppercase border-b text-[11px]
                      ${i < 2 ? 'text-left' : 'text-right'}
                      ${isLight ? 'border-black/8 text-gray-600' : 'border-white/7 text-[#6b7280]'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {perIp.map((r, i) => (
                  <tr key={i} className={`border-b last:border-0 ${isLight ? 'border-black/7' : 'border-white/5'}`}>
                    <td className={`px-3 py-2 ${txt}`}>{r.esp}</td>
                    <td className={`px-3 py-2 ${txt}`}>{r.ip}</td>
                    <td className={`px-3 py-2 text-right ${r.reg > 0 ? (isLight ? 'text-[#006a5b]' : 'text-[#00e5c3]') : muted}`}>
                      {r.reg > 0 ? r.reg : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right ${r.ftds > 0 ? (isLight ? 'text-[#b45309]' : 'text-[#ffd166]') : muted}`}>
                      {r.ftds > 0 ? r.ftds : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
