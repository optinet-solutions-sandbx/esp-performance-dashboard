'use client'
import { useRef, useState, useMemo, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { useDashboardStore } from '@/lib/store'
import { supabase, addLog } from '@/lib/supabase'
import type { RegFtdsUploadRecord } from '@/lib/types'

const ESP_ALIASES: Record<string, string> = {
  // ── Mailmodo ──────────────────────────────────────────────────────
  'mm': 'Mailmodo', 'mailmodo': 'Mailmodo', 'mail modo': 'Mailmodo',
  'mailmdoo': 'Mailmodo', 'mailmood': 'Mailmodo', 'mailmdo': 'Mailmodo',
  'maimodo': 'Mailmodo', 'mlmodo': 'Mailmodo', 'mmailmodo': 'Mailmodo',
  'mailmodoo': 'Mailmodo', 'malimodo': 'Mailmodo', 'maiilmodo': 'Mailmodo',
  'mail-modo': 'Mailmodo',

  // ── Ongage ────────────────────────────────────────────────────────
  'og': 'Ongage', 'ong': 'Ongage', 'ongage': 'Ongage', 'on gage': 'Ongage',
  'ongge': 'Ongage', 'ogage': 'Ongage', 'ongaeg': 'Ongage', 'ongagee': 'Ongage',
  'ogange': 'Ongage', 'onagge': 'Ongage', 'ongae': 'Ongage', 'onge': 'Ongage',
  'ognage': 'Ongage', 'onggae': 'Ongage', 'ongagge': 'Ongage', 'onagage': 'Ongage',
  'on-gage': 'Ongage', 'onagae': 'Ongage',

  // ── Netcore ───────────────────────────────────────────────────────
  'nc': 'Netcore', 'netcore': 'Netcore', 'net core': 'Netcore',
  'netcoree': 'Netcore', 'ntecore': 'Netcore', 'netcor': 'Netcore',
  'netcroe': 'Netcore', 'netcorre': 'Netcore', 'ncore': 'Netcore',
  'netocre': 'Netcore', 'net-core': 'Netcore', 'necore': 'Netcore', 'ntcore': 'Netcore',

  // ── Hotsol ────────────────────────────────────────────────────────
  'hs': 'Hotsol', 'hotsol': 'Hotsol', 'hot sol': 'Hotsol',
  'hotsoll': 'Hotsol', 'hotslo': 'Hotsol', 'hotol': 'Hotsol',
  'hotsool': 'Hotsol', 'hotosol': 'Hotsol', 'htsol': 'Hotsol',
  'hostsol': 'Hotsol', 'hotsl': 'Hotsol', 'hotsoel': 'Hotsol',
  'hotsall': 'Hotsol', 'hot-sol': 'Hotsol', 'htotsol': 'Hotsol',

  // ── MMS ───────────────────────────────────────────────────────────
  'mms': 'MMS',

  // ── 171 MailsApp ──────────────────────────────────────────────────
  '171': '171 MailsApp', '171mailsapp': '171 MailsApp', '171 mailsapp': '171 MailsApp',
  '171mailsap': '171 MailsApp', '171mailsaap': '171 MailsApp', '171 mailsap': '171 MailsApp',
  '171mails': '171 MailsApp', '171mailapp': '171 MailsApp', '171 mails app': '171 MailsApp',
  '171-mailsapp': '171 MailsApp', '171mailsappp': '171 MailsApp',

  // ── Moosend ───────────────────────────────────────────────────────
  'ms': 'Moosend', 'moosend': 'Moosend', 'moo send': 'Moosend',
  'moosnd': 'Moosend', 'mosend': 'Moosend', 'moosened': 'Moosend',
  'mooosend': 'Moosend', 'mosneed': 'Moosend', 'mossend': 'Moosend',
  'mosnde': 'Moosend', 'moo-send': 'Moosend', 'mosnd': 'Moosend',

  // ── Kenscio ───────────────────────────────────────────────────────
  'kn': 'Kenscio', 'kenscio': 'Kenscio', 'ken scio': 'Kenscio',
  'kensico': 'Kenscio', 'kencio': 'Kenscio', 'kensco': 'Kenscio',
  'kenscoo': 'Kenscio', 'kensio': 'Kenscio', 'knescio': 'Kenscio',
  'kenscioo': 'Kenscio', 'kensciio': 'Kenscio', 'ken-scio': 'Kenscio',

  // ── Mailjet ───────────────────────────────────────────────────────
  'mj': 'Mailjet', 'mailjet': 'Mailjet', 'mail jet': 'Mailjet',
  'maijet': 'Mailjet', 'maljet': 'Mailjet', 'mailjt': 'Mailjet',
  'mailjett': 'Mailjet', 'mialjet': 'Mailjet', 'maiiljet': 'Mailjet',
  'maliljet': 'Mailjet', 'mailljett': 'Mailjet', 'maijlet': 'Mailjet',
  'mail-jet': 'Mailjet', 'mailet': 'Mailjet',

  // ── Elastic ───────────────────────────────────────────────────────
  'el': 'Elastic', 'elastic': 'Elastic', 'elasticemail': 'Elastic',
  'elastic email': 'Elastic', 'elasticc': 'Elastic', 'elaastic': 'Elastic',
  'elasic': 'Elastic', 'elastci': 'Elastic', 'elatic': 'Elastic',
  'elastik': 'Elastic', 'elaetic': 'Elastic', 'elastiic': 'Elastic',
  'elasctic': 'Elastic', 'elastic-email': 'Elastic', 'elasticemal': 'Elastic',
}

function normalizeEsp(raw: string): string {
  return ESP_ALIASES[raw.trim().toLowerCase()] ?? raw.trim()
}

function parseDate(val: unknown): string | null {
  const s = String(val ?? '').trim()
  if (!s) return null
  const n = Number(s)
  if (!isNaN(n) && n > 40000) {
    return new Date((n - 25569) * 86400 * 1000).toISOString().split('T')[0]
  }
  const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2, '0')}-${ddmm[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function RegFtdsView() {
  const { isLight, regFtdsDaily, setRegFtdsDaily, selectedRegDate, setSelectedRegDate } = useDashboardStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing]       = useState(false)
  const [log, setLog]                     = useState<{ inserted: number; dates: number; rows: number } | null>(null)
  const [warning, setWarning]             = useState<string | null>(null)
  const [uploadHistory, setUploadHistory] = useState<RegFtdsUploadRecord[]>([])
  const [deletingId, setDeletingId]       = useState<string | null>(null)

  const txt   = isLight ? 'text-gray-900' : 'text-[#f0f2f5]'
  const muted = isLight ? 'text-gray-400' : 'text-[#6b7280]'
  const bdr   = isLight ? 'border-black/10' : 'border-white/7'
  const surf  = isLight ? 'bg-white' : 'bg-[#111418]'

  useEffect(() => { fetchUploadHistory() }, [])

  async function fetchUploadHistory() {
    const { data } = await supabase
      .from('reg_ftds_uploads')
      .select('*')
      .order('uploaded_at', { ascending: false })
    if (data) setUploadHistory(data as RegFtdsUploadRecord[])
  }

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
    setWarning(null)
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

      // Validate date format and values before processing
      if (ci.date >= 0) {
        const dateSamples = rows.slice(1)
          .map(r => String(r[ci.date] ?? '').trim())
          .filter(s => s !== '')

        const firstBad = dateSamples.find(s => {
          const iso = parseDate(s)
          if (!iso) return true
          return isNaN(new Date(iso + 'T00:00:00').getTime())
        })

        if (firstBad !== undefined) {
          setWarning(
            `Invalid date detected: "${firstBad}"\n` +
            `Accepted formats:\n` +
            `  • dd/mm/yyyy — e.g. 25/05/2026\n` +
            `  • yyyy-mm-dd — e.g. 2026-05-25\n` +
            `Check that month and day values are correct and try again.`
          )
          return
        }
      }

      const parseNum = (val: unknown) => { const n = Number(String(val ?? '').trim()); return isNaN(n) ? undefined : n }

      const aggregated = new Map<string, { date: string; esp: string; ip: string; reg: number; ftds: number }>()
      const uniqueDates = new Set<string>()

      for (const row of rows.slice(1)) {
        const dateIso = ci.date >= 0 ? parseDate(row[ci.date]) : null
        const espVal  = ci.esp  >= 0 ? normalizeEsp(String(row[ci.esp] ?? '')) : ''
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

      // Create upload history record first to get upload_id
      const { data: uploadRec } = await supabase
        .from('reg_ftds_uploads')
        .insert({ filename: file.name, rows: aggregated.size, dates: datesArr })
        .select('id')
        .single()
      const uploadId = uploadRec?.id

      // Replace existing daily records for these dates
      await supabase.from('reg_ftds_daily').delete().in('date', datesArr)

      const toInsert = [...aggregated.values()].map(a => ({
        date: a.date, esp: a.esp, ip: a.ip,
        registrations: a.reg, ftds: a.ftds,
        upload_id: uploadId ?? null,
      }))
      await supabase.from('reg_ftds_daily').insert(toInsert)

      // Reload store
      const { data: allRows } = await supabase
        .from('reg_ftds_daily')
        .select('id, upload_id, date, esp, ip, registrations, ftds')
        .order('date', { ascending: true })
      setRegFtdsDaily((allRows ?? []).map(r => ({
        id: r.id, upload_id: r.upload_id, date: r.date, esp: r.esp, ip: r.ip,
        registrations: r.registrations ?? 0, ftds: r.ftds ?? 0,
      })))

      await fetchUploadHistory()
      await addLog('upload', `Reg & FTDs — ${file.name}`, `${toInsert.length} IP records across ${datesArr.length} date(s)`)
      setLog({ inserted: toInsert.length, dates: datesArr.length, rows: rows.length - 1 })
    } finally {
      setProcessing(false)
    }
  }

  async function handleDeleteUpload(upload: RegFtdsUploadRecord) {
    if (!confirm(`Delete this upload?\n\n"${upload.filename}"\n\nAll Reg & FTD records from this file will be removed.`)) return
    setDeletingId(upload.id)
    try {
      await supabase.from('reg_ftds_uploads').delete().eq('id', upload.id)

      // Reload daily data
      const { data: allRows } = await supabase
        .from('reg_ftds_daily')
        .select('id, upload_id, date, esp, ip, registrations, ftds')
        .order('date', { ascending: true })
      setRegFtdsDaily((allRows ?? []).map(r => ({
        id: r.id, upload_id: r.upload_id, date: r.date, esp: r.esp, ip: r.ip,
        registrations: r.registrations ?? 0, ftds: r.ftds ?? 0,
      })))

      await fetchUploadHistory()
      await addLog('delete', `Reg & FTDs — ${upload.filename}`, `${upload.rows} records removed`)
    } finally {
      setDeletingId(null)
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
        <div className={`text-[11px] font-mono mb-1 ${muted}`}>
          Stored per date &amp; IP. Re-uploading the same dates replaces existing records.
        </div>
        <div className={`text-[11px] font-mono mb-5 ${muted}`}>
          Date format: <span className={`font-semibold ${isLight ? 'text-gray-700' : 'text-[#c9cdd4]'}`}>dd/mm/yyyy</span>
          <span className="mx-1.5 opacity-40">or</span>
          <span className={`font-semibold ${isLight ? 'text-gray-700' : 'text-[#c9cdd4]'}`}>yyyy-mm-dd</span>
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

        {warning && (
          <div className={`mt-5 pt-5 border-t ${isLight ? 'border-black/8' : 'border-white/7'}`}>
            <div className={`flex gap-3 rounded-xl border p-4 ${isLight ? 'bg-red-50 border-red-200' : 'bg-[#ff4757]/8 border-[#ff4757]/30'}`}>
              <svg className="flex-shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#ff4757" strokeWidth="1.8">
                <circle cx="8" cy="8" r="6.5" />
                <path d="M8 5v3.5M8 11h.01" strokeLinecap="round" />
              </svg>
              <pre className={`text-[11px] font-mono whitespace-pre-wrap leading-relaxed ${isLight ? 'text-red-700' : 'text-[#ff8a93]'}`}>{warning}</pre>
            </div>
          </div>
        )}

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

      {/* Upload history */}
      <div>
        <div className={`text-[11px] font-mono tracking-widest uppercase mb-2 ${muted}`}>Upload History</div>
        {uploadHistory.length === 0 ? (
          <div className={`rounded-xl border p-6 text-center ${surf} ${bdr}`}>
            <div className={`text-xs font-mono ${muted}`}>No uploads yet</div>
          </div>
        ) : (
          <div className="space-y-2">
            {uploadHistory.map(rec => (
              <div key={rec.id} className={`rounded-xl border overflow-hidden ${surf} ${bdr}`}>
                <div className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className={`text-xs font-semibold truncate ${txt}`}>{rec.filename}</div>
                    <div className={`text-[11px] font-mono mt-0.5 flex items-center gap-2 flex-wrap ${muted}`}>
                      <span>{fmtDateTime(rec.uploaded_at)}</span>
                      <span className={`px-1.5 py-0.5 rounded ${isLight ? 'bg-gray-100' : 'bg-white/5'}`}>
                        {rec.rows} IP record{rec.rows !== 1 ? 's' : ''}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded ${isLight ? 'bg-gray-100' : 'bg-white/5'}`}>
                        {rec.dates?.length ?? 0} date{(rec.dates?.length ?? 0) !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {rec.dates?.length > 0 && (
                      <div className={`text-[10px] font-mono mt-1 ${muted}`}>
                        {rec.dates.sort().map(fmtDate).join(' · ')}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteUpload(rec)}
                    disabled={deletingId === rec.id}
                    className="flex-shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider transition-all
                      border border-[#ff4757]/40 text-[#ff4757] hover:bg-[#ff4757]/10 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {deletingId === rec.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
