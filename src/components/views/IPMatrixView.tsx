'use client'
import { useState, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { useDashboardStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import type { IpmRecord, IpmUploadRecord } from '@/lib/types'
import CustomSelect from '@/components/ui/CustomSelect'
import EspVisibilityIcon from '@/components/ui/EspVisibilityIcon'
import HiddenEspsBadge from '@/components/ui/HiddenEspsBadge'

/* ── Colors ─────────────────────────────────────────────────────── */
const ESP_PALETTE: Record<string, { bg: string; text: string }> = {
  Mailmodo:       { bg: '#7c5cfc', text: '#fff' },
  Ongage:         { bg: '#ffd166', text: '#1a1a2e' },
  Netcore:        { bg: '#f97316', text: '#fff' },
  Hotsol:         { bg: '#00e5c3', text: '#1a1a2e' },
  MMS:            { bg: '#3b82f6', text: '#fff' },
  '171 MailsApp': { bg: '#ff6b9d', text: '#fff' },
  '171':          { bg: '#ff6b9d', text: '#fff' },
  Moosend:        { bg: '#22c55e', text: '#fff' },
  Omnisend:       { bg: '#d946ef', text: '#fff' },
  Klaviyo:        { bg: '#06b6d4', text: '#fff' },
  Brevo:          { bg: '#84cc16', text: '#1a1a2e' },
  Kenscio:        { bg: '#e63946', text: '#fff' },
  Mailjet:        { bg: '#fdb022', text: '#1a1a2e' },
}
const FALLBACK_PALETTE = [
  { bg: '#7c5cfc', text: '#fff' }, { bg: '#00e5c3', text: '#1a1a2e' },
  { bg: '#ffd166', text: '#1a1a2e' }, { bg: '#f97316', text: '#fff' },
  { bg: '#3b82f6', text: '#fff' }, { bg: '#22c55e', text: '#fff' },
  { bg: '#d946ef', text: '#fff' }, { bg: '#06b6d4', text: '#fff' },
]

function espColor(esp: string, allEsps: string[]): { bg: string; text: string } {
  if (ESP_PALETTE[esp]) return ESP_PALETTE[esp]
  const idx = allEsps.indexOf(esp)
  return FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length] ?? { bg: '#4a5568', text: '#fff' }
}

/* ── Icons ──────────────────────────────────────────────────────── */
const IconPencil = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M11 2l3 3-8 8H3v-3L11 2z" strokeLinejoin="round" />
  </svg>
)
const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 4h10M6 4V2h4v2M5 4l1 9h4l1-9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const IconSearch = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="6" cy="6" r="4" /><path d="M10 10l3 3" strokeLinecap="round" />
  </svg>
)
const IconUpload = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M8 10V2M5 5l3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="2" y="11" width="12" height="3" rx="1" />
  </svg>
)
const IconPlus = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M8 2v12M2 8h12" strokeLinecap="round" />
  </svg>
)
const IconEye = ({ hidden }: { hidden: boolean }) => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false">
    <path d="M2 8c2-3 4-5 6-5s4 2 6 5c-2 3-4 5-6 5s-4-2-6-5z" strokeLinecap="round" strokeLinejoin="round" />
    {hidden ? <path d="M2 2l12 12" strokeLinecap="round" /> : <circle cx="8" cy="8" r="2" />}
  </svg>
)

/* ── Component ──────────────────────────────────────────────────── */
export default function IPMatrixView() {
  const {
    isLight, ipmData, addIpmRecord, deleteIpmRecord, updateIpmRecord,
    hiddenEsps, hiddenIpmIds, toggleIpmRecordVisibility, setHiddenIpmIds,
  } = useDashboardStore()
  const [showHidden, setShowHidden] = useState(false)

  // Search
  const [searchEsp,    setSearchEsp]    = useState('')
  const [searchIp,     setSearchIp]     = useState('')
  const [searchDomain, setSearchDomain] = useState('')
  // Filters
  const [filterEsp,    setFilterEsp]    = useState('')
  const [filterIp,     setFilterIp]     = useState('')
  const [filterDomain, setFilterDomain] = useState('')
  // Sort
  const [sortCol, setSortCol] = useState<keyof IpmRecord | null>(null)
  const [sortDir, setSortDir] = useState(1)
  // Summary expand
  const [expandedEsp, setExpandedEsp] = useState<Record<string, boolean>>({})
  const [expandedIp,  setExpandedIp]  = useState<Record<string, boolean>>({})
  // Modal
  const [modal, setModal] = useState<{ open: boolean; idx: number | null; rec: IpmRecord & { espNew?: string } }>({
    open: false, idx: null, rec: { esp: '', ip: '', domain: '' },
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Upload history
  const [uploadHistory, setUploadHistory] = useState<IpmUploadRecord[]>([])
  const [deletingUpload, setDeletingUpload] = useState<string | null>(null)

  useEffect(() => { fetchUploadHistory() }, [])


  async function fetchUploadHistory() {
    const { data } = await supabase
      .from('ip_matrix_uploads')
      .select('*')
      .order('uploaded_at', { ascending: false })
    if (data) setUploadHistory(data)
  }

  const allEspsSorted = [...new Set(ipmData.map(r => r.esp).filter(Boolean))].sort()

  /* ── Visibility helpers ───────────────────────────────────────── */
  function isRecordHidden(r: IpmRecord): boolean {
    if (hiddenEsps.includes(r.esp)) return true
    if (r.id && hiddenIpmIds.includes(r.id)) return true
    return false
  }
  const visibleIpmData  = showHidden ? ipmData : ipmData.filter(r => !isRecordHidden(r))
  const hiddenRowsCount = ipmData.filter(r => r.id && hiddenIpmIds.includes(r.id) && !hiddenEsps.includes(r.esp)).length

  /* ── Filtering ─────────────────────────────────────────────────── */
  function getFiltered(): IpmRecord[] {
    let data = [...visibleIpmData]
    if (filterEsp)    data = data.filter(r => r.esp    === filterEsp)
    if (filterIp)     data = data.filter(r => r.ip     === filterIp)
    if (filterDomain) data = data.filter(r => r.domain === filterDomain)
    if (searchEsp)    data = data.filter(r => r.esp.toLowerCase().includes(searchEsp.toLowerCase()))
    if (searchIp)     data = data.filter(r => r.ip.toLowerCase().includes(searchIp.toLowerCase()))
    if (searchDomain) data = data.filter(r => r.domain.toLowerCase().includes(searchDomain.toLowerCase()))
    if (sortCol) data.sort((a, b) => String(a[sortCol]).localeCompare(String(b[sortCol])) * sortDir)
    return data
  }

  function handleSort(col: keyof IpmRecord) {
    if (sortCol === col) setSortDir(d => d * -1)
    else { setSortCol(col); setSortDir(1) }
  }

  function clearAll() {
    setSearchEsp(''); setSearchIp(''); setSearchDomain('')
    setFilterEsp(''); setFilterIp(''); setFilterDomain('')
    setSortCol(null); setSortDir(1)
  }

  /* ── Dropdown options ──────────────────────────────────────────── */
  const uniqueIps     = [...new Set(ipmData.map(r => r.ip).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const uniqueDomains = [...new Set(ipmData.map(r => r.domain).filter(Boolean))].sort()

  /* ── Modal ─────────────────────────────────────────────────────── */
  function openModal(idx: number | null = null) {
    const rec = idx !== null ? { ...ipmData[idx] } : { esp: '', ip: '', domain: '' }
    setModal({ open: true, idx, rec })
  }

  async function saveModal() {
    const esp = (modal.rec.esp === '__new__' ? (modal.rec.espNew ?? '') : modal.rec.esp).trim()
    const ip  = modal.rec.ip.trim()
    if (!esp || !ip) return
    const saved: IpmRecord = { esp, ip, domain: modal.rec.domain.trim() }

    if (modal.idx !== null) {
      const existing = ipmData[modal.idx]
      updateIpmRecord(modal.idx, { ...saved, id: existing.id })
      if (existing.id) {
        await supabase.from('ip_matrix').update({ esp: saved.esp, ip: saved.ip, domain: saved.domain }).eq('id', existing.id)
      }
    } else {
      const { data: inserted } = await supabase.from('ip_matrix').insert({ esp: saved.esp, ip: saved.ip, domain: saved.domain }).select('id').single()
      addIpmRecord({ ...saved, id: inserted?.id })
    }
    setModal({ open: false, idx: null, rec: { esp: '', ip: '', domain: '' } })
  }

  /* ── File upload ───────────────────────────────────────────────── */
  async function handleFile(file: File) {
    const isExcel = file.name.match(/\.xlsx?$/i)
    let rows: string[][]

    if (isExcel) {
      const buf = await file.arrayBuffer()
      const wb  = XLSX.read(buf, { type: 'array' })
      const ws  = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][]
      rows = raw.filter(r => r.some(c => String(c).trim() !== ''))
    } else {
      const text = await file.text()
      rows = text.trim().split('\n').map(l => l.split(','))
    }

    if (rows.length < 2) return
    const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/[^a-z]/g, ''))
    const find = (...cands: string[]) => headers.findIndex(h => cands.some(c => h.includes(c)))
    const ci = {
      esp:    find('esp', 'provider', 'service'),
      ip:     find('ip', 'ipaddress', 'address'),
      domain: find('domain', 'fromdomain', 'from', 'sender'),
    }
    const newRecords: { esp: string; ip: string; domain: string }[] = []
    rows.slice(1).forEach(cols => {
      const r = {
        esp:    ci.esp    >= 0 ? String(cols[ci.esp]    ?? '').trim() : '',
        ip:     ci.ip     >= 0 ? String(cols[ci.ip]     ?? '').trim() : '',
        domain: ci.domain >= 0 ? String(cols[ci.domain] ?? '').trim() : '',
      }
      if (r.esp || r.ip) newRecords.push(r)
    })

    if (newRecords.length) {
      // Create upload record
      const { data: uploadRec } = await supabase
        .from('ip_matrix_uploads')
        .insert({ filename: file.name, rows: newRecords.length })
        .select('id')
        .single()

      const uploadId = uploadRec?.id
      const recordsWithUpload = newRecords.map(r => ({ ...r, upload_id: uploadId }))

      const { data: inserted } = await supabase.from('ip_matrix').insert(recordsWithUpload).select('id, esp, ip, domain, upload_id')
      if (inserted) {
        inserted.forEach(row => addIpmRecord({ id: row.id, upload_id: row.upload_id, esp: row.esp, ip: row.ip, domain: row.domain }))
      } else {
        newRecords.forEach(r => addIpmRecord(r))
      }

      await fetchUploadHistory()
    }
  }

  async function handleDeleteUpload(upload: IpmUploadRecord) {
    if (!confirm(`Delete this upload?\n\n"${upload.filename}" (${upload.rows} records)\n\nAll records from this file will be removed.`)) return
    setDeletingUpload(upload.id)
    try {
      // Delete IP records linked to this upload (cascade handles this if FK set, but explicit is safer)
      await supabase.from('ip_matrix').delete().eq('upload_id', upload.id)
      await supabase.from('ip_matrix_uploads').delete().eq('id', upload.id)

      // Reload all IP data from Supabase to stay in sync
      const { data: allRows } = await supabase
        .from('ip_matrix')
        .select('id, esp, ip, domain, upload_id')
        .order('created_at', { ascending: true })
      const { setIpmData } = useDashboardStore.getState()
      setIpmData(allRows?.map(r => ({ id: r.id, upload_id: r.upload_id, esp: r.esp, ip: r.ip, domain: r.domain ?? '' })) ?? [])

      await fetchUploadHistory()
    } catch {
      // ignore
    } finally {
      setDeletingUpload(null)
    }
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  /* ── Styles ────────────────────────────────────────────────────── */
  const rows     = getFiltered()
  const txt      = isLight ? 'text-gray-900' : 'text-[#f0f2f5]'
  const muted    = isLight ? 'text-gray-400' : 'text-[#6b7280]'
  const bdr      = isLight ? 'border-black/10' : 'border-white/7'
  const surfaceA = isLight ? 'bg-white' : 'bg-[#111418]'
  const surfaceB = isLight ? 'bg-gray-50' : 'bg-[#181c22]'
  const hdrCls   = `font-family-mono text-[11px] font-mono tracking-widest uppercase border-b ${bdr} ${isLight ? 'text-gray-600' : 'text-[#6b7280]'}`

  const searchCls = `w-full pl-7 pr-3 py-2 rounded-lg border text-xs font-mono outline-none transition-all
    ${isLight ? 'bg-[#f4f5f8] border-black/18 text-gray-900 placeholder-gray-400 focus:border-[#0d9488] hover:border-[#0d9488]' : 'bg-[#1e232b] border-white/14 text-white placeholder-[#4a5568] focus:border-[#0d9488] hover:border-[#0d9488]'}`

  const selectCls = `w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none cursor-pointer transition-all
    ${isLight ? 'bg-[#f4f5f8] border-black/18 text-gray-800 focus:border-[#0d9488] hover:border-[#0d9488]' : 'bg-[#1e232b] border-white/14 text-white focus:border-[#0d9488] hover:border-[#0d9488]'}`

  const inputCls = `w-full px-3 py-2 rounded-lg border text-sm font-mono outline-none transition-all
    ${isLight ? 'bg-[#f4f5f8] border-black/20 text-gray-900 focus:border-[#0d9488] hover:border-[#0d9488]' : 'bg-[#1e232b] border-white/18 text-white focus:border-[#0d9488] hover:border-[#0d9488]'}`

  /* ── Summary section ───────────────────────────────────────────── */
  const summaryEsps = showHidden
    ? allEspsSorted
    : allEspsSorted.filter(e => !hiddenEsps.includes(e))
  const espGroups = summaryEsps.map(esp => {
    const recs    = visibleIpmData.filter(r => r.esp === esp)
    const ips     = [...new Set(recs.map(r => r.ip).filter(Boolean))]
    const domains = [...new Set(recs.map(r => r.domain).filter(Boolean))]
    return { esp, ips, domains, color: espColor(esp, allEspsSorted) }
  }).sort((a, b) => b.ips.length - a.ips.length)

  return (
    <div className="p-6 space-y-5">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className={`text-xl font-bold tracking-tight ${txt}`}>IPs Matrix</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-mono uppercase tracking-wider transition-all
              ${isLight ? 'border-black/20 text-gray-600 hover:border-[#0d9488]' : 'border-white/13 text-[#a8b0be] hover:border-[#0d9488]'}`}
          >
            <IconUpload /> Upload File
          </button>
          <input ref={fileInputRef} type="file" accept=".csv,.xls,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) { handleFile(f); e.target.value = '' } }} />
          <button
            onClick={() => openModal(null)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[rgb(0,229,195)] hover:bg-[rgb(0,200,170)] text-[#0a1628] text-xs font-mono font-bold uppercase tracking-wider transition-all"
          >
            <IconPlus /> Add Record
          </button>
        </div>
      </div>

      {/* ── ESP Summary ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className={`text-[11px] font-mono tracking-widest uppercase ${muted}`}>ESP Summary</div>
          <div className="flex items-center gap-2">
            <HiddenEspsBadge />
            {(hiddenRowsCount > 0 || hiddenEsps.length > 0) && (
              <button
                onClick={() => setShowHidden(v => !v)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono uppercase tracking-wider transition-all
                  ${showHidden
                    ? isLight ? 'border-[#0d9488]/40 text-[#0d9488] bg-[#0d9488]/[0.08]' : 'border-[#00e5c3]/40 text-[#00e5c3] bg-[#00e5c3]/10'
                    : isLight ? 'border-black/20 text-gray-500 hover:border-black/40' : 'border-white/13 text-[#a8b0be] hover:border-white/25'}`}
              >
                {showHidden ? 'Showing hidden' : `Show hidden${hiddenRowsCount > 0 ? ` (${hiddenRowsCount})` : ''}`}
              </button>
            )}
            {hiddenIpmIds.length > 0 && (
              <button
                onClick={() => setHiddenIpmIds([])}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono uppercase tracking-wider transition-all
                  ${isLight ? 'border-black/20 text-gray-500 hover:border-violet-400' : 'border-white/13 text-[#a8b0be] hover:border-[#00e5c3]'}`}
              >
                Unhide all records
              </button>
            )}
          </div>
        </div>
        <div className={`rounded-xl border overflow-hidden ${surfaceA} ${bdr}`}>
          <table className="w-full border-collapse text-xs font-mono">
            <thead>
              <tr className={surfaceB}>
                <th className={`w-8 px-3 py-2.5 border-b ${bdr}`} />
                <th className={`px-3 py-2.5 text-left border-b ${hdrCls}`}>ESP</th>
                <th className={`px-3 py-2.5 text-right border-b ${hdrCls}`}>IPs</th>
                <th className={`px-3 py-2.5 text-right border-b ${hdrCls}`}>From Domains</th>
                <th className={`w-14 px-3 py-2.5 text-center border-b ${hdrCls}`}>Hide</th>
              </tr>
            </thead>
            <tbody>
              {espGroups.length === 0 ? (
                <tr><td colSpan={5} className={`px-3 py-6 text-center text-xs font-mono ${muted}`}>No data loaded</td></tr>
              ) : espGroups.map(({ esp, ips, domains, color }) => {
                const expanded = !!expandedEsp[esp]
                const espHidden = hiddenEsps.includes(esp)
                const subBg = isLight ? 'rgba(0,0,0,.02)' : 'rgba(255,255,255,.025)'
                const borderC = isLight ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.06)'
                return (
                  <>
                    {/* ESP row */}
                    <tr key={esp}
                      className={`cursor-pointer border-b transition-colors ${isLight ? 'border-black/7 hover:bg-black/2' : 'border-white/5 hover:bg-white/2'} ${espHidden ? 'opacity-50' : ''}`}
                      onClick={() => setExpandedEsp(p => ({ ...p, [esp]: !p[esp] }))}
                    >
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex items-center justify-center w-4 h-4 rounded border text-[11px] font-mono ${isLight ? 'border-black/15 text-gray-500' : 'border-white/13 text-[#6b7280]'}`}>
                          {expanded ? '−' : '+'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold tracking-wide"
                          style={{ background: color.bg, color: color.text }}>
                          {esp}
                        </span>
                      </td>
                      <td className={`px-3 py-2.5 text-right font-semibold ${txt}`}>{ips.length}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold ${txt}`}>{domains.length}</td>
                      <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                        <EspVisibilityIcon espName={esp} />
                      </td>
                    </tr>
                    {/* Expanded IP rows */}
                    {expanded && ips.map(ip => {
                      const ipKey = `${esp}::${ip}`
                      const ipExpanded = !!expandedIp[ipKey]
                      const ipDomains = [...new Set(visibleIpmData.filter(r => r.esp === esp && r.ip === ip).map(r => r.domain).filter(Boolean))]
                      return (
                        <>
                          {/* IP row — clickable to show domains */}
                          <tr key={ip}
                            className={`cursor-pointer border-b transition-colors ${isLight ? 'border-black/5 hover:bg-black/3' : 'border-white/4 hover:bg-white/3'}`}
                            style={{ background: subBg }}
                            onClick={e => { e.stopPropagation(); setExpandedIp(p => ({ ...p, [ipKey]: !p[ipKey] })) }}
                          >
                            <td className="px-3 py-1.5 text-center">
                              <span className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded border text-[11px] font-mono ${isLight ? 'border-black/15 text-gray-400' : 'border-white/13 text-[#6b7280]'}`}>
                                {ipExpanded ? '−' : '+'}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 pl-8 text-[11px] font-mono font-semibold" style={{ color: color.bg }}>{ip}</td>
                            <td className={`px-3 py-1.5 text-right text-[11px] ${muted}`}>1</td>
                            <td className={`px-3 py-1.5 text-right text-[11px] font-semibold ${txt}`}>{ipDomains.length}</td>
                            <td />
                          </tr>
                          {/* Domain rows — only shown when IP is expanded */}
                          {ipExpanded && ipDomains.map(domain => (
                            <tr key={ip + domain} style={{ background: subBg }}>
                              <td />
                              <td colSpan={4} className={`px-3 py-1 pl-16 text-[11px] font-mono ${muted}`}>
                                <span className="opacity-40 mr-2">↳</span>{domain}
                              </td>
                            </tr>
                          ))}
                          {ipExpanded && (
                            <tr style={{ background: subBg, borderTop: `1px solid ${borderC}` }}>
                              <td />
                              <td className={`px-3 py-1 pl-8 text-[11px] font-mono italic ${muted}`}>total for {ip}</td>
                              <td className={`px-3 py-1 text-right text-[11px] font-semibold ${txt}`}>1</td>
                              <td className={`px-3 py-1 text-right text-[11px] font-semibold ${txt}`}>{ipDomains.length}</td>
                              <td />
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Search row ──────────────────────────────────────────── */}
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
        {[
          { label: 'Search ESP',         val: searchEsp,    set: setSearchEsp    },
          { label: 'Search IP',          val: searchIp,     set: setSearchIp     },
          { label: 'Search From Domain', val: searchDomain, set: setSearchDomain },
        ].map(({ label, val, set }) => (
          <div key={label}>
            <div className={`text-[11px] font-mono tracking-widest uppercase mb-1.5 ${muted}`}>{label}</div>
            <div className="relative">
              <span className={`absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${muted}`}><IconSearch /></span>
              <input value={val} onChange={e => set(e.target.value)} placeholder="Type to search…" className={searchCls} />
            </div>
          </div>
        ))}
        <div className="flex items-end pb-0.5">
          <button onClick={clearAll}
            className={`px-3 py-2 rounded-lg border text-xs font-mono uppercase tracking-wider transition-all
              ${isLight ? 'border-black/20 text-gray-500 hover:border-violet-400' : 'border-white/13 text-[#a8b0be] hover:border-[#00e5c3]'}`}>
            Clear All
          </button>
        </div>
      </div>

      {/* ── Filter row ──────────────────────────────────────────── */}
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
        <div>
          <div className={`text-[11px] font-mono tracking-widest uppercase mb-1.5 ${muted}`}>Filter by ESP</div>
          <CustomSelect value={filterEsp} onChange={setFilterEsp} isLight={isLight} maxHeight={220} className="w-full"
            options={[{ value: '', label: 'All ESPs' }, ...allEspsSorted.map(e => ({ value: e, label: e }))]} />
        </div>
        <div>
          <div className={`text-[11px] font-mono tracking-widest uppercase mb-1.5 ${muted}`}>Filter by IP</div>
          <CustomSelect value={filterIp} onChange={setFilterIp} isLight={isLight} maxHeight={220} className="w-full"
            options={[{ value: '', label: 'All IPs' }, ...uniqueIps.map(ip => ({ value: ip, label: ip }))]} />
        </div>
        <div>
          <div className={`text-[11px] font-mono tracking-widest uppercase mb-1.5 ${muted}`}>Filter by From Domain</div>
          <CustomSelect value={filterDomain} onChange={setFilterDomain} isLight={isLight} maxHeight={220} className="w-full"
            options={[{ value: '', label: 'All Domains' }, ...uniqueDomains.map(d => ({ value: d, label: d }))]} />
        </div>
        <div className="flex items-end pb-0.5">
          <span className={`text-[11px] font-mono ${muted}`}>
            {rows.length} of {ipmData.length} records
            {(ipmData.length - visibleIpmData.length) > 0 && !showHidden && (
              <span className="ml-1 opacity-70">· {ipmData.length - visibleIpmData.length} hidden</span>
            )}
          </span>
        </div>
      </div>

      {/* ── All Records table ───────────────────────────────────── */}
      <div>
        <div className={`text-[11px] font-mono tracking-widest uppercase mb-2 ${muted}`}>All Records</div>
        <div className={`rounded-xl border overflow-hidden ${surfaceA} ${bdr}`}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs font-mono">
              <thead>
                <tr className={surfaceB}>
                  <th className={`w-8 px-3 py-2.5 text-center border-b ${hdrCls}`}>#</th>
                  {(['esp', 'ip', 'domain'] as const).map(col => (
                    <th key={col}
                      onClick={() => handleSort(col)}
                      className={`px-3 py-2.5 text-left border-b cursor-pointer select-none transition-colors ${hdrCls}
                        ${isLight ? 'hover:text-gray-900' : 'hover:text-[#f0f2f5]'}`}>
                      {col === 'esp' ? 'ESP' : col === 'ip' ? 'IP Address' : 'From Domain'}
                      <span className={`ml-1 ${sortCol === col ? (isLight ? 'text-violet-500' : 'text-[#00e5c3]') : 'opacity-30'}`}>
                        {sortCol === col ? (sortDir === 1 ? '↑' : '↓') : '⇅'}
                      </span>
                    </th>
                  ))}
                  <th className={`w-14 px-3 py-2.5 text-center border-b ${hdrCls}`}>Hide</th>
                  <th className={`w-14 px-3 py-2.5 text-center border-b ${hdrCls}`}>Edit</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={`px-3 py-14 text-center text-xs font-mono ${muted}`}>
                      {ipmData.length === 0 ? 'No records yet — upload a file or add records manually' : 'No records match your search'}
                    </td>
                  </tr>
                ) : rows.map((row, i) => {
                  const origIdx = ipmData.indexOf(row)
                  const color = espColor(row.esp, allEspsSorted)
                  const rowHidden = isRecordHidden(row)
                  const recordHidden = !!(row.id && hiddenIpmIds.includes(row.id))
                  return (
                    <tr key={i} className={`border-b last:border-0 transition-colors ${isLight ? 'border-black/7 hover:bg-[#4a2fa0]/4' : 'border-white/5 hover:bg-[#4a2fa0]/8'} ${rowHidden ? 'opacity-50' : ''}`}>
                      <td className={`px-3 py-2.5 text-center text-[11px] ${muted}`}>{i + 1}</td>
                      <td className="px-3 py-2.5">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold tracking-wide"
                          style={{ background: color.bg, color: color.text }}>
                          {row.esp}
                        </span>
                      </td>
                      <td className={`px-3 py-2.5 ${isLight ? 'text-gray-700' : 'text-[#c8cdd6]'}`}>{row.ip}</td>
                      <td className={`px-3 py-2.5 ${isLight ? 'text-gray-700' : 'text-[#c8cdd6]'}`}>{row.domain || '—'}</td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          onClick={() => row.id && toggleIpmRecordVisibility(row.id)}
                          disabled={!row.id}
                          title={!row.id ? 'Save record first to hide it' : recordHidden ? 'Show this record' : 'Hide this record'}
                          aria-label={recordHidden ? 'Show this record' : 'Hide this record'}
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-md transition-all
                            ${!row.id ? 'opacity-30 cursor-not-allowed' : ''}
                            ${recordHidden
                              ? isLight ? 'text-[#b45309] hover:bg-black/5' : 'text-[#ffd166] hover:bg-white/5'
                              : isLight ? 'text-gray-400 hover:text-gray-700 hover:bg-black/5' : 'text-[#6b7280] hover:text-[#a8b0be] hover:bg-white/5'}`}
                        >
                          <IconEye hidden={recordHidden} />
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openModal(origIdx)}
                            title="Edit"
                            className={`p-1.5 rounded-md transition-all ${isLight ? 'text-gray-400 hover:text-violet-600 hover:bg-violet-50' : 'text-[#6b7280] hover:text-[#7c5cfc] hover:bg-[#7c5cfc]/10'}`}>
                            <IconPencil />
                          </button>
                          <button
                            onClick={async () => {
                              if (confirm('Delete this record?')) {
                                const rec = ipmData[origIdx]
                                deleteIpmRecord(origIdx)
                                if (rec.id) await supabase.from('ip_matrix').delete().eq('id', rec.id)
                              }
                            }}
                            title="Delete"
                            className={`p-1.5 rounded-md transition-all ${isLight ? 'text-gray-400 hover:text-red-500 hover:bg-red-50' : 'text-[#6b7280] hover:text-[#ff4757] hover:bg-[#ff4757]/10'}`}>
                            <IconTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Upload History ────────────────────────────────────────── */}
      <div>
        <div className={`text-[11px] font-mono tracking-widest uppercase mb-2 ${muted}`}>Upload History</div>
        {uploadHistory.length === 0 ? (
          <div className={`rounded-xl border p-6 text-center ${surfaceA} ${bdr}`}>
            <div className={`text-xs font-mono ${muted}`}>No file uploads yet</div>
          </div>
        ) : (
          <div className="space-y-2">
            {uploadHistory.map(rec => (
              <div key={rec.id} className={`rounded-xl border overflow-hidden ${surfaceA} ${bdr}`}>
                <div className={`px-4 py-3 flex items-center justify-between gap-3`}>
                  <div className="min-w-0 flex-1">
                    <div className={`text-xs font-semibold truncate ${txt}`}>{rec.filename}</div>
                    <div className={`text-[11px] font-mono mt-0.5 flex items-center gap-2 ${muted}`}>
                      <span>{fmtDate(rec.uploaded_at)}</span>
                      <span className={`px-1.5 py-0.5 rounded ${isLight ? 'bg-gray-100' : 'bg-white/5'}`}>
                        {rec.rows} record{rec.rows !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteUpload(rec)}
                    disabled={deletingUpload === rec.id}
                    className="flex-shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider transition-all
                      border border-[#ff4757]/40 text-[#ff4757] hover:bg-[#ff4757]/10 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {deletingUpload === rec.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ─────────────────────────────────────── */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60" onClick={() => setModal(m => ({ ...m, open: false }))} />
          <div className={`relative z-10 rounded-2xl border p-7 w-96 ${isLight ? 'bg-white border-black/10' : 'bg-[#181c22] border-white/12'}`}>
            <h3 className={`text-sm font-semibold mb-5 flex items-center gap-2 ${txt}`}>
              {modal.idx !== null
                ? <><IconPencil /> Edit Record</>
                : <><IconPlus /> Add Record</>}
            </h3>
            <div className="space-y-4">
              <div>
                <label className={`block text-[11px] font-mono tracking-widest uppercase mb-1.5 ${muted}`}>ESP</label>
                <select
                  value={modal.rec.esp}
                  onChange={e => setModal(m => ({ ...m, rec: { ...m.rec, esp: e.target.value, espNew: '' } }))}
                  className={inputCls}
                >
                  <option value="">— Select ESP —</option>
                  {allEspsSorted.map(e => <option key={e} value={e}>{e}</option>)}
                  <option value="__new__">+ Add new ESP…</option>
                </select>
                {modal.rec.esp === '__new__' && (
                  <input
                    value={modal.rec.espNew ?? ''}
                    onChange={e => setModal(m => ({ ...m, rec: { ...m.rec, espNew: e.target.value } }))}
                    placeholder="New ESP name…"
                    className={`${inputCls} mt-2`}
                    autoFocus
                  />
                )}
              </div>
              <div>
                <label className={`block text-[11px] font-mono tracking-widest uppercase mb-1.5 ${muted}`}>IP Address</label>
                <input
                  value={modal.rec.ip}
                  onChange={e => setModal(m => ({ ...m, rec: { ...m.rec, ip: e.target.value } }))}
                  placeholder="e.g. 192.168.1.1"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={`block text-[11px] font-mono tracking-widest uppercase mb-1.5 ${muted}`}>From Domain <span className={`normal-case ${muted}`}>(optional)</span></label>
                <input
                  value={modal.rec.domain}
                  onChange={e => setModal(m => ({ ...m, rec: { ...m.rec, domain: e.target.value } }))}
                  placeholder="e.g. mail.example.com"
                  className={inputCls}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={saveModal}
                className="flex-1 py-2.5 rounded-xl bg-[#4a2fa0] hover:bg-[#6040c8] text-white text-xs font-mono font-bold uppercase tracking-wider transition-all">
                Save
              </button>
              <button onClick={() => setModal(m => ({ ...m, open: false }))}
                className={`flex-1 py-2.5 rounded-xl border text-xs font-mono uppercase tracking-wider transition-all
                  ${isLight ? 'border-black/20 text-gray-500 hover:border-black/40' : 'border-white/13 text-[#a8b0be] hover:border-white/25'}`}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
