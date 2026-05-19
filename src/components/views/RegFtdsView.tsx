'use client'
import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { useDashboardStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'

export default function RegFtdsView() {
  const { isLight, ipmData } = useDashboardStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing] = useState(false)
  const [log, setLog] = useState<{ matched: number; unmatched: number; rows: number } | null>(null)

  const txt   = isLight ? 'text-gray-900' : 'text-[#f0f2f5]'
  const muted = isLight ? 'text-gray-400' : 'text-[#6b7280]'
  const bdr   = isLight ? 'border-black/10' : 'border-white/7'
  const surf  = isLight ? 'bg-white' : 'bg-[#111418]'

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
        esp:  find('esp', 'provider', 'service'),
        ip:   find('ip', 'ipaddress', 'address'),
        reg:  find('registrations', 'registration', 'reg'),
        ftds: find('ftds', 'ftd'),
      }

      const parseNum = (val: unknown) => { const n = Number(String(val ?? '').trim()); return isNaN(n) ? undefined : n }

      let matched = 0, unmatched = 0
      const { updateIpmRecord } = useDashboardStore.getState()

      for (const row of rows.slice(1)) {
        const espVal = ci.esp >= 0 ? String(row[ci.esp] ?? '').trim() : ''
        const ipVal  = ci.ip  >= 0 ? String(row[ci.ip]  ?? '').trim() : ''
        const reg    = ci.reg  >= 0 ? parseNum(row[ci.reg])  : undefined
        const ftds   = ci.ftds >= 0 ? parseNum(row[ci.ftds]) : undefined
        if (reg === undefined && ftds === undefined) continue

        const { ipmData: current } = useDashboardStore.getState()
        const idxs = current.reduce<number[]>((acc, r, i) => {
          const espMatch = !espVal || r.esp.toLowerCase() === espVal.toLowerCase()
          const ipMatch  = !ipVal  || r.ip === ipVal
          if (espMatch && ipMatch) acc.push(i)
          return acc
        }, [])

        if (idxs.length === 0) { unmatched++; continue }

        for (const idx of idxs) {
          const rec = useDashboardStore.getState().ipmData[idx]
          const updated = { ...rec, registrations: reg ?? rec.registrations, ftds: ftds ?? rec.ftds }
          updateIpmRecord(idx, updated)
          if (rec.id) {
            await supabase.from('ip_matrix').update({
              registrations: updated.registrations ?? null,
              ftds: updated.ftds ?? null,
            }).eq('id', rec.id)
          }
        }
        matched++
      }

      setLog({ matched, unmatched, rows: rows.length - 1 })
    } finally {
      setProcessing(false)
    }
  }

  const totalReg  = ipmData.reduce((s, r) => s + (r.registrations ?? 0), 0)
  const totalFtds = ipmData.reduce((s, r) => s + (r.ftds ?? 0), 0)

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className={`text-xl font-bold tracking-tight ${txt}`}>Reg &amp; FTDs</h1>
        <p className={`text-xs font-mono mt-1 ${muted}`}>Upload a file to update Registrations and FTDs across all IP records</p>
      </div>

      {/* ── KPI summary ── */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: 'Total Registrations', value: totalReg, color: isLight ? '#006a5b' : '#00e5c3' },
          { label: 'Total FTDs',          value: totalFtds, color: isLight ? '#b45309' : '#ffd166' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-xl border p-5 ${surf} ${bdr}`}>
            <div className={`text-[11px] font-mono tracking-widest uppercase mb-2 ${muted}`}>{label}</div>
            <div className="text-3xl font-bold font-mono" style={{ color }}>{value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* ── Upload card ── */}
      <div className={`rounded-xl border p-6 ${surf} ${bdr}`}>
        <div className={`text-[11px] font-mono tracking-widest uppercase mb-4 ${muted}`}>Upload File</div>
        <div className={`text-xs font-mono mb-1 ${txt}`}>
          Accepted columns: <span className="font-semibold">ESP</span>, <span className="font-semibold">IP</span>, <span className="font-semibold">Registrations</span>, <span className="font-semibold">FTDs</span>
        </div>
        <div className={`text-[11px] font-mono mb-5 ${muted}`}>
          Rows are matched to existing IP records by ESP + IP and saved to the database.
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
            <span style={{ color: isLight ? '#006a5b' : '#00e5c3' }}>✓ {log.matched} matched &amp; updated</span>
            {log.unmatched > 0 && <span className="text-[#ff4757]">✗ {log.unmatched} unmatched</span>}
          </div>
        )}
      </div>

      {/* ── Per-IP breakdown ── */}
      {ipmData.some(r => r.registrations || r.ftds) && (
        <div>
          <div className={`text-[11px] font-mono tracking-widest uppercase mb-2 ${muted}`}>IP Breakdown</div>
          <div className={`rounded-xl border overflow-hidden ${surf} ${bdr}`}>
            <table className="w-full border-collapse text-[11px] font-mono">
              <thead>
                <tr className={isLight ? 'bg-gray-50' : 'bg-[#181c22]'}>
                  {['ESP', 'IP Address', 'From Domain', 'Reg', 'FTDs'].map((h, i) => (
                    <th key={h} className={`px-3 py-2.5 font-mono tracking-widest uppercase border-b text-[11px]
                      ${i < 3 ? 'text-left' : 'text-right'}
                      ${isLight ? 'border-black/8 text-gray-600' : 'border-white/7 text-[#6b7280]'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ipmData.filter(r => r.registrations || r.ftds).map((r, i) => (
                  <tr key={i} className={`border-b last:border-0 ${isLight ? 'border-black/7' : 'border-white/5'}`}>
                    <td className={`px-3 py-2 ${txt}`}>{r.esp}</td>
                    <td className={`px-3 py-2 ${txt}`}>{r.ip}</td>
                    <td className={`px-3 py-2 ${muted}`}>{r.domain || '—'}</td>
                    <td className={`px-3 py-2 text-right ${r.registrations ? (isLight ? 'text-[#006a5b]' : 'text-[#00e5c3]') : muted}`}>
                      {r.registrations ?? '—'}
                    </td>
                    <td className={`px-3 py-2 text-right ${r.ftds ? (isLight ? 'text-[#b45309]' : 'text-[#ffd166]') : muted}`}>
                      {r.ftds ?? '—'}
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
