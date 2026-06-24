'use client'
import { useRef, useState, useMemo, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { useDashboardStore } from '@/lib/store'
import { supabase, addLog } from '@/lib/supabase'
import { isValidIsoDate } from '@/lib/utils'
import { ESP_COLORS, normalizeEspName, ESP_LIST } from '@/lib/data'
import { buildUploadPlan, applyCorrections, type UploadPlan, type AggRow } from '@/lib/regFtdsAuthority'
import IpAuthorityModal from '@/components/ui/IpAuthorityModal'

const ACTIVE_ESP_SET = new Set<string>(ESP_LIST)
import CalendarPicker from '@/components/ui/CalendarPicker'
import type { RegFtdsUploadRecord } from '@/lib/types'

const FILTER_KEY = 'regftds'

// Reg & FTDs accepts ONLY the yyyy-mm-dd date format for text values.
// Genuine Excel date-typed cells (read with cellDates) arrive as Date objects and are normalized to yyyy-mm-dd.
function parseDate(val: unknown): string | null {
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear()
    const m = String(val.getMonth() + 1).padStart(2, '0')
    const d = String(val.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(val ?? '').trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

function isValidIpv4(ip: string): boolean {
  const parts = ip.split('.')
  if (parts.length !== 4) return false
  return parts.every(p => /^\d{1,3}$/.test(p) && parseInt(p, 10) >= 0 && parseInt(p, 10) <= 255)
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
  const { isLight, regFtdsDaily, setRegFtdsDaily, dateFilters, setDateFilter, ipmData } = useDashboardStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing]       = useState(false)
  const [log, setLog]                     = useState<{ inserted: number; dates: number; rows: number; totalReg: number; totalFtds: number; byEsp: { esp: string; reg: number; ftds: number }[] } | null>(null)
  const [warning, setWarning]             = useState<string | null>(null)
  const [uploadHistory, setUploadHistory] = useState<RegFtdsUploadRecord[]>([])
  const [deletingId, setDeletingId]       = useState<string | null>(null)
  // Track which ESPs are expanded — default (empty) collapses every group.
  const [expandedEsps, setExpandedEsps] = useState<Set<string>>(new Set())
  const [badDatesInDb, setBadDatesInDb] = useState<{ date: string; count: number }[]>([])
  const [pending, setPending] = useState<{ plan: UploadPlan; rows: AggRow[]; filename: string; fileRowCount: number } | null>(null)

  const df          = dateFilters[FILTER_KEY]
  const fromDate    = df?.from        ?? ''
  const toDate      = df?.to          ?? ''
  const appliedFrom = df?.appliedFrom ?? ''
  const appliedTo   = df?.appliedTo   ?? ''
  const handleFrom   = (iso: string) => setDateFilter(FILTER_KEY, { from: iso })
  const handleTo     = (iso: string) => setDateFilter(FILTER_KEY, { to: iso })
  const handleAll    = () => setDateFilter(FILTER_KEY, { from: '', to: '', appliedFrom: '', appliedTo: '' })
  const handleFilter = () => setDateFilter(FILTER_KEY, { appliedFrom: fromDate, appliedTo: toDate })
  const toggleEsp = (esp: string) =>
    setExpandedEsps(prev => {
      const next = new Set(prev)
      if (next.has(esp)) next.delete(esp); else next.add(esp)
      return next
    })

  const txt   = isLight ? 'text-gray-900' : 'text-[#f0f2f5]'
  const muted = isLight ? 'text-gray-400' : 'text-[#6b7280]'
  const bdr   = isLight ? 'border-black/10' : 'border-white/7'
  const surf  = isLight ? 'bg-white' : 'bg-[#111418]'

  const fetchUploadHistory = useCallback(async () => {
    const { data } = await supabase
      .from('reg_ftds_uploads')
      .select('*')
      .order('uploaded_at', { ascending: false })
    if (data) setUploadHistory(data as RegFtdsUploadRecord[])
  }, [])

  const fetchBadDates = useCallback(async () => {
    const { data } = await supabase.from('reg_ftds_daily').select('date')
    if (!data) return
    const counts = new Map<string, number>()
    for (const r of data) {
      if (!isValidIsoDate(r.date)) counts.set(r.date, (counts.get(r.date) ?? 0) + 1)
    }
    setBadDatesInDb(
      [...counts.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date))
    )
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchUploadHistory sets state after async fetch; this is a deliberate initial-load trigger, not a cascading render
  useEffect(() => { fetchUploadHistory(); fetchBadDates() }, [fetchUploadHistory, fetchBadDates])

  const availableDates = useMemo(() =>
    [...new Set(regFtdsDaily.map(r => r.date))].sort(),
    [regFtdsDaily]
  )

  const filtered = useMemo(() => {
    if (appliedFrom && appliedTo) {
      const lo = appliedFrom < appliedTo ? appliedFrom : appliedTo
      const hi = appliedFrom < appliedTo ? appliedTo : appliedFrom
      return regFtdsDaily.filter(r => r.date >= lo && r.date <= hi)
    }
    if (appliedFrom) return regFtdsDaily.filter(r => r.date >= appliedFrom)
    if (appliedTo)   return regFtdsDaily.filter(r => r.date <= appliedTo)
    return regFtdsDaily
  }, [regFtdsDaily, appliedFrom, appliedTo])

  const totalReg  = filtered.reduce((s, r) => s + r.registrations, 0)
  const totalFtds = filtered.reduce((s, r) => s + r.ftds, 0)

  const perIp = useMemo(() => {
    const map = new Map<string, { esp: string; ip: string; reg: number; ftds: number }>()
    for (const r of filtered) {
      const esp = normalizeEspName(r.esp)   // remap legacy names (e.g. OnGage → Mailgun) and merge
      const key = `${esp}|${r.ip}`
      const prev = map.get(key) ?? { esp, ip: r.ip, reg: 0, ftds: 0 }
      map.set(key, { esp, ip: r.ip, reg: prev.reg + r.registrations, ftds: prev.ftds + r.ftds })
    }
    return [...map.values()].filter(r => r.reg > 0 || r.ftds > 0).sort((a, b) => b.reg - a.reg || b.ftds - a.ftds)
  }, [filtered])

  const groupedByEsp = useMemo(() => {
    const groups = new Map<string, { esp: string; reg: number; ftds: number; ips: { ip: string; reg: number; ftds: number }[] }>()
    for (const r of perIp) {
      const g = groups.get(r.esp) ?? { esp: r.esp, reg: 0, ftds: 0, ips: [] }
      g.reg  += r.reg
      g.ftds += r.ftds
      g.ips.push({ ip: r.ip, reg: r.reg, ftds: r.ftds })
      groups.set(r.esp, g)
    }
    return [...groups.values()].sort((a, b) => b.reg - a.reg || b.ftds - a.ftds)
  }, [perIp])

  const missingFromMatrix = useMemo(() => {
    if (regFtdsDaily.length === 0 || ipmData.length === 0) return []
    const ipmSet = new Set(ipmData.map(r => `${r.esp.toLowerCase()}|${r.ip.toLowerCase()}`))
    const seen = new Set<string>()
    const missing: { esp: string; ip: string }[] = []
    for (const r of regFtdsDaily) {
      const esp = normalizeEspName(r.esp)
      const key = `${esp.toLowerCase()}|${r.ip.toLowerCase()}`
      if (!seen.has(key) && !ipmSet.has(key)) {
        seen.add(key)
        missing.push({ esp, ip: r.ip })
      }
    }
    return missing.sort((a, b) => a.esp.localeCompare(b.esp) || a.ip.localeCompare(b.ip))
  }, [regFtdsDaily, ipmData])

  const missingByEsp = useMemo(() => {
    const groups = new Map<string, string[]>()
    for (const { esp, ip } of missingFromMatrix) {
      const arr = groups.get(esp) ?? []
      arr.push(ip)
      groups.set(esp, arr)
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [missingFromMatrix])

  const unknownEspsInData = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of regFtdsDaily) {
      if (!ACTIVE_ESP_SET.has(r.esp)) counts.set(r.esp, (counts.get(r.esp) ?? 0) + 1)
    }
    return [...counts.entries()].map(([esp, count]) => ({ esp, count })).sort((a, b) => a.esp.localeCompare(b.esp))
  }, [regFtdsDaily])

  const rangeLabel = (appliedFrom && appliedTo)
    ? `${fmtDate(appliedFrom < appliedTo ? appliedFrom : appliedTo)} – ${fmtDate(appliedFrom < appliedTo ? appliedTo : appliedFrom)}`
    : appliedFrom
      ? `from ${fmtDate(appliedFrom)}`
      : appliedTo
        ? `up to ${fmtDate(appliedTo)}`
        : 'All dates'

  async function handleFile(file: File) {
    setProcessing(true)
    setLog(null)
    setWarning(null)
    try {
      const isExcel = file.name.match(/\.xlsx?$/i)
      let fileRows: string[][]
      if (isExcel) {
        const buf = await file.arrayBuffer()
        const wb  = XLSX.read(buf, { type: 'array', cellDates: true })
        const ws  = wb.Sheets[wb.SheetNames[0]]
        fileRows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][]
        fileRows = fileRows.filter(r => r.some(c => String(c).trim() !== ''))
      } else {
        const text = await file.text()
        fileRows = text.trim().split('\n').map(l => l.split(','))
      }
      if (fileRows.length < 2) return

      const headers = fileRows[0].map(h => String(h).trim().toLowerCase().replace(/[^a-z]/g, ''))
      const find = (...cands: string[]) => headers.findIndex(h => cands.some(c => h.includes(c)))
      const ci = {
        date: find('date'),
        esp:  find('esp', 'provider', 'service'),
        ip:   find('ip', 'ipaddress', 'address'),
        reg:  find('registrations', 'registration', 'reg'),
        ftds: find('ftds', 'ftd'),
      }

      // ── Structural: date column must exist ───────────────────────────────────
      if (ci.date < 0) {
        setWarning(
          `Upload rejected — Date column not found.\n` +
          `Required columns: Date, ESP, IP, Registrations, FTD\n` +
          `Found headers: ${fileRows[0].map(h => String(h).trim()).filter(Boolean).join(', ')}`
        )
        return
      }

      // ── Comprehensive row-level validation (single pass) ─────────────────────
      // Collects ALL issues before blocking so the user can fix everything at once.
      type RowIssue = { row: number; value: string }
      const badDates:    RowIssue[]                     = []
      const missingDate: number[]                       = []
      const missingEsp:  number[]                       = []
      const missingIp:   number[]                       = []
      const badIps:      RowIssue[]                     = []
      const unknownEsps  = new Set<string>()
      const unknownCombos: { esp: string; ip: string }[] = []
      const seenCombos  = new Set<string>()
      const ipmSet = ipmData.length > 0
        ? new Set(ipmData.map(r => `${r.esp.toLowerCase()}|${r.ip.toLowerCase()}`))
        : null

      for (let i = 1; i < fileRows.length; i++) {
        const row    = fileRows[i]
        const rowNum = i + 1
        const dateCell = ci.date >= 0 ? row[ci.date] : undefined
        const espRaw   = ci.esp  >= 0 ? normalizeEspName(String(row[ci.esp]  ?? '').trim()) : ''
        const ipRaw    = ci.ip   >= 0 ? String(row[ci.ip]  ?? '').trim() : ''
        const regRaw   = ci.reg  >= 0 ? String(row[ci.reg]  ?? '').trim() : ''
        const ftdsRaw  = ci.ftds >= 0 ? String(row[ci.ftds] ?? '').trim() : ''

        // Skip entirely blank rows
        const dateStr = String(dateCell ?? '').trim()
        if (!dateStr && !espRaw && !ipRaw && !regRaw && !ftdsRaw) continue

        // Date
        if (!dateStr) {
          missingDate.push(rowNum)
        } else {
          const iso = parseDate(dateCell)
          if (!iso || isNaN(new Date(iso + 'T00:00:00').getTime())) {
            badDates.push({ row: rowNum, value: dateStr })
          }
        }

        // ESP — missing, then unknown
        if (!espRaw) {
          missingEsp.push(rowNum)
        } else if (!ACTIVE_ESP_SET.has(espRaw)) {
          unknownEsps.add(espRaw)
        }

        // IP — missing, then format, then matrix
        if (!ipRaw) {
          missingIp.push(rowNum)
        } else if (!isValidIpv4(ipRaw)) {
          badIps.push({ row: rowNum, value: ipRaw })
        } else if (ipmSet && espRaw) {
          const comboKey = `${espRaw.toLowerCase()}|${ipRaw.toLowerCase()}`
          if (!seenCombos.has(comboKey) && !ipmSet.has(comboKey)) {
            seenCombos.add(comboKey)
            unknownCombos.push({ esp: espRaw, ip: ipRaw })
          }
        }
      }

      const hasIssues =
        badDates.length > 0 || missingDate.length > 0 ||
        missingEsp.length > 0 || unknownEsps.size > 0 ||
        missingIp.length > 0 || badIps.length > 0 || unknownCombos.length > 0

      if (hasIssues) {
        const lines: string[] = ['Upload rejected — fix all issues below and try again.\n']
        const show = <T extends { row?: number; value?: string }>(arr: T[], label: string, hint?: string) => {
          lines.push(`${label} (${arr.length} row${arr.length === 1 ? '' : 's'}):`)
          ;(arr.slice(0, 5) as Array<{ row?: number; value?: string }>).forEach(r =>
            lines.push(r.value !== undefined ? `  • Row ${r.row}: "${r.value}"` : `  • Row ${r.row}`)
          )
          if (arr.length > 5) lines.push(`  …and ${arr.length - 5} more`)
          if (hint) lines.push(`  ${hint}`)
          lines.push('')
        }
        const showRows = (arr: number[], label: string) => {
          lines.push(`${label} (${arr.length} row${arr.length === 1 ? '' : 's'}):`)
          arr.slice(0, 5).forEach(r => lines.push(`  • Row ${r}`))
          if (arr.length > 5) lines.push(`  …and ${arr.length - 5} more`)
          lines.push('')
        }

        if (missingDate.length > 0)   showRows(missingDate, 'Missing date')
        if (badDates.length > 0)       show(badDates,   'Invalid date format',    'Expected: yyyy-mm-dd — e.g. 2026-05-25')
        if (missingEsp.length > 0)    showRows(missingEsp,  'Missing ESP')
        if (unknownEsps.size > 0) {
          const list = [...unknownEsps].sort()
          lines.push(`ESP not found in the system (${list.length} ESP${list.length === 1 ? '' : 's'}):`)
          list.forEach(e => lines.push(`  • ${e}`))
          lines.push(`  Active ESPs: ${[...ACTIVE_ESP_SET].join(', ')}`)
          lines.push('')
        }
        if (missingIp.length > 0)     showRows(missingIp,   'Missing IP address')
        if (badIps.length > 0)         show(badIps,     'Invalid IP address',      'Expected: valid IPv4 — e.g. 156.70.46.105')
        if (unknownCombos.length > 0) {
          lines.push(`IP not registered in IP Matrix (${unknownCombos.length} combination${unknownCombos.length === 1 ? '' : 's'}):`)
          unknownCombos.slice(0, 5).forEach(c => lines.push(`  • ${c.esp} / ${c.ip}`))
          if (unknownCombos.length > 5) lines.push(`  …and ${unknownCombos.length - 5} more`)
          lines.push('  Register these IPs in the IP Matrix before uploading.')
          lines.push('')
        }

        lines.push('Nothing was uploaded.')
        setWarning(lines.join('\n'))
        return
      }

      const parseNum = (val: unknown) => { const n = Number(String(val ?? '').trim()); return isNaN(n) ? undefined : n }

      const aggregated = new Map<string, { date: string; esp: string; ip: string; reg: number; ftds: number }>()

      for (const row of fileRows.slice(1)) {
        const dateIso = ci.date >= 0 ? parseDate(row[ci.date]) : null
        const espVal  = ci.esp  >= 0 ? normalizeEspName(String(row[ci.esp] ?? '')) : ''
        const ipVal   = ci.ip   >= 0 ? String(row[ci.ip]  ?? '').trim() : ''
        const reg     = ci.reg  >= 0 ? parseNum(row[ci.reg])  : undefined
        const ftds    = ci.ftds >= 0 ? parseNum(row[ci.ftds]) : undefined
        if (!dateIso || !espVal || !ipVal) continue
        if (reg === undefined && ftds === undefined) continue
        const key = `${dateIso}|${espVal.toLowerCase()}|${ipVal}`
        const prev = aggregated.get(key) ?? { date: dateIso, esp: espVal, ip: ipVal, reg: 0, ftds: 0 }
        aggregated.set(key, { ...prev, reg: prev.reg + (reg ?? 0), ftds: prev.ftds + (ftds ?? 0) })
      }

      if (aggregated.size === 0) return

      const rows: AggRow[] = [...aggregated.values()]

      // Gate on IP-Matrix authority (fetch the registry fresh — decisions must
      // reflect the current matrix, not the cached store copy).
      const { data: matrixRows, error: matrixErr } = await supabase
        .from('ip_matrix')
        .select('esp, ip')
      if (matrixErr) {
        setWarning('Could not load the IP Matrix to validate this upload. Nothing was uploaded — please try again.')
        return
      }

      const fileRowCount = fileRows.length - 1
      const plan = buildUploadPlan(rows, matrixRows ?? [])
      if (!plan.hasIssues) {
        await commitUpload(rows, file.name, fileRowCount)
      } else {
        setPending({ plan, rows, filename: file.name, fileRowCount })
      }
    } finally {
      setProcessing(false)
    }
  }

  async function commitUpload(rows: AggRow[], filename: string, fileRowCount: number) {
    const datesArr = [...new Set(rows.map(r => r.date))]

    const { data: uploadRec } = await supabase
      .from('reg_ftds_uploads')
      .insert({ filename, rows: rows.length, dates: datesArr })
      .select('id')
      .single()
    const uploadId = uploadRec?.id

    await supabase.from('reg_ftds_daily').delete().in('date', datesArr)

    const toInsert = rows.map(a => ({
      date: a.date, esp: a.esp, ip: a.ip,
      registrations: a.reg, ftds: a.ftds,
      upload_id: uploadId ?? null,
    }))
    const { error: insertErr } = await supabase.from('reg_ftds_daily').insert(toInsert)
    if (insertErr) { setWarning('Upload failed while saving records. Please try again.'); return }

    const { data: allRows } = await supabase
      .from('reg_ftds_daily')
      .select('id, upload_id, date, esp, ip, registrations, ftds')
      .order('date', { ascending: true })
    setRegFtdsDaily((allRows ?? []).filter(r => isValidIsoDate(r.date)).map(r => ({
      id: r.id, upload_id: r.upload_id, date: r.date, esp: normalizeEspName(r.esp), ip: r.ip,
      registrations: r.registrations ?? 0, ftds: r.ftds ?? 0,
    })))

    await fetchUploadHistory()
    await fetchBadDates()
    await addLog('upload', `Reg & FTDs — ${filename}`, `${toInsert.length} IP records across ${datesArr.length} date(s)`)

    const uploadTotalReg  = rows.reduce((s, a) => s + a.reg, 0)
    const uploadTotalFtds = rows.reduce((s, a) => s + a.ftds, 0)
    const espTotalsMap    = new Map<string, { reg: number; ftds: number }>()
    for (const a of rows) {
      const prev = espTotalsMap.get(a.esp) ?? { reg: 0, ftds: 0 }
      espTotalsMap.set(a.esp, { reg: prev.reg + a.reg, ftds: prev.ftds + a.ftds })
    }
    const uploadByEsp = [...espTotalsMap.entries()]
      .map(([esp, v]) => ({ esp, reg: v.reg, ftds: v.ftds }))
      .sort((a, b) => b.reg - a.reg)
    setLog({ inserted: toInsert.length, dates: datesArr.length, rows: fileRowCount, totalReg: uploadTotalReg, totalFtds: uploadTotalFtds, byEsp: uploadByEsp })
  }

  async function handleModalProceed() {
    if (!pending) return
    setProcessing(true)
    try {
      const corrected = applyCorrections(pending.rows, pending.plan.corrections)
      await commitUpload(corrected, pending.filename, pending.fileRowCount)
    } finally {
      setProcessing(false)
      setPending(null)
    }
  }

  function handleModalCancel() {
    setPending(null)
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
      setRegFtdsDaily((allRows ?? []).filter(r => isValidIsoDate(r.date)).map(r => ({
        id: r.id, upload_id: r.upload_id, date: r.date, esp: normalizeEspName(r.esp), ip: r.ip,
        registrations: r.registrations ?? 0, ftds: r.ftds ?? 0,
      })))

      await fetchUploadHistory()
      await fetchBadDates()
      await addLog('delete', `Reg & FTDs — ${upload.filename}`, `${upload.rows} records removed`)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="p-6 space-y-5">

      {pending && (
        <IpAuthorityModal
          plan={pending.plan}
          filename={pending.filename}
          isLight={isLight}
          onProceed={handleModalProceed}
          onCancel={handleModalCancel}
        />
      )}

      {/* Header + date filter */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className={`text-xl font-bold tracking-tight ${txt}`}>Reg &amp; FTDs</h1>
          <p className={`text-xs font-mono mt-1 ${muted}`}>
            Date-level registration and FTD breakdown by IP
            {(appliedFrom || appliedTo) && ` · ${appliedFrom || '…'} – ${appliedTo || '…'}`}
          </p>
        </div>
        {availableDates.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-mono uppercase tracking-wider ${muted}`}>From</span>
            <CalendarPicker value={fromDate} onChange={handleFrom} isLight={isLight} rangeStart={fromDate} rangeEnd={toDate} />
            <span className={`text-xs ${muted}`}>→</span>
            <CalendarPicker value={toDate} onChange={handleTo} isLight={isLight} rangeStart={fromDate} rangeEnd={toDate} align="right" />
            <button
              onClick={handleAll}
              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono uppercase transition-all
                ${isLight ? 'border-black/20 text-gray-500 hover:border-[#0d9488]' : 'border-white/13 text-[#a8b0be] hover:border-[#0d9488]'}`}
            >
              All
            </button>
            <button
              onClick={handleFilter}
              className={`px-3 py-1.5 rounded-lg border text-[11px] font-mono uppercase tracking-wider font-semibold transition-all
                ${isLight
                  ? 'border-[#0d9488] text-[#0d9488] bg-[#0d9488]/8 hover:bg-[#0d9488]/15'
                  : 'border-[#0d9488] text-[#0d9488] bg-[#0d9488]/10 hover:bg-[#0d9488]/20'}`}
            >
              Filter
            </button>
            <button
              onClick={handleFilter}
              title="Refresh"
              className={`flex items-center justify-center w-[30px] h-[30px] rounded-lg border text-[11px] transition-all
                ${isLight ? 'border-black/20 text-gray-500 hover:border-[#0d9488] hover:text-[#0d9488]' : 'border-white/13 text-[#a8b0be] hover:border-[#0d9488] hover:text-[#0d9488]'}`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.5 2A5 5 0 1 0 11 6.5"/>
                <path d="M10.5 2v3h-3"/>
              </svg>
            </button>
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
            {(appliedFrom || appliedTo) && (
              <div className={`text-[11px] font-mono mt-1.5 ${muted}`}>{rangeLabel}</div>
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
          Date format: <span className={`font-semibold ${isLight ? 'text-gray-700' : 'text-[#c9cdd4]'}`}>yyyy-mm-dd</span>
          <span className="mx-1.5 opacity-40">only</span>
          <span className={isLight ? 'text-gray-500' : 'text-[#8a909c]'}>(e.g. 2026-05-25 · Excel date cells auto-detected)</span>
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
          <div className={`mt-5 pt-5 border-t ${isLight ? 'border-black/8' : 'border-white/7'}`}>
            <div className="flex items-center gap-3 flex-wrap text-[11px] font-mono">
              <span className={muted}>{log.rows} rows processed</span>
              <span className={isLight ? 'text-black/20' : 'text-white/15'}>|</span>
              <span style={{ color: isLight ? '#006a5b' : '#00e5c3' }}>✓ {log.totalReg.toLocaleString()} Registrations</span>
              <span className={isLight ? 'text-black/20' : 'text-white/15'}>|</span>
              <span style={{ color: isLight ? '#b45309' : '#ffd166' }}>{log.totalFtds.toLocaleString()} FTDs</span>
              <span className={isLight ? 'text-black/20' : 'text-white/15'}>|</span>
              <span className={muted}>{log.dates} date{log.dates !== 1 ? 's' : ''}</span>
              {log.byEsp.length > 1 && (
                <>
                  <span className={isLight ? 'text-black/20' : 'text-white/15'}>|</span>
                  <span className={muted}>{log.byEsp.length} ESPs</span>
                </>
              )}
            </div>
            {log.byEsp.length > 1 && (
              <table className="mt-3 text-[11px] font-mono border-collapse">
                <thead>
                  <tr>
                    <th className={`text-left pr-10 pb-1 font-mono tracking-widest uppercase text-[10px] ${muted}`}>ESP</th>
                    <th className={`text-right pr-6 pb-1 font-mono tracking-widest uppercase text-[10px] ${muted}`}>Registrations</th>
                    <th className={`text-right pb-1 font-mono tracking-widest uppercase text-[10px] ${muted}`}>FTDs</th>
                  </tr>
                </thead>
                <tbody>
                  {log.byEsp.map(e => (
                    <tr key={e.esp}>
                      <td className={`pr-10 py-0.5 ${txt}`}>{e.esp}</td>
                      <td className="pr-6 py-0.5 text-right" style={{ color: isLight ? '#006a5b' : '#00e5c3' }}>{e.reg.toLocaleString()}</td>
                      <td className="py-0.5 text-right" style={{ color: isLight ? '#b45309' : '#ffd166' }}>{e.ftds.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Per-ESP accordion breakdown */}
      {groupedByEsp.length > 0 && (
        <div>
          <div className={`flex items-center justify-between mb-2 flex-wrap gap-2`}>
            <div className={`text-[11px] font-mono tracking-widest uppercase ${muted}`}>
              IP Breakdown — {rangeLabel}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setExpandedEsps(new Set(groupedByEsp.map(g => g.esp)))}
                className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded-md border transition-all
                  ${isLight ? 'border-black/15 text-gray-500 hover:border-[#0d9488] hover:text-[#0d9488]' : 'border-white/10 text-[#6b7280] hover:border-[#0d9488] hover:text-[#0d9488]'}`}
              >
                Expand all
              </button>
              <button
                onClick={() => setExpandedEsps(new Set())}
                className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded-md border transition-all
                  ${isLight ? 'border-black/15 text-gray-500 hover:border-[#0d9488] hover:text-[#0d9488]' : 'border-white/10 text-[#6b7280] hover:border-[#0d9488] hover:text-[#0d9488]'}`}
              >
                Collapse all
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {groupedByEsp.map(g => {
              const collapsed = !expandedEsps.has(g.esp)
              const color     = ESP_COLORS[g.esp] ?? '#7c5cfc'
              return (
                <div key={g.esp} className={`rounded-xl border overflow-hidden ${surf} ${bdr}`}>
                  <button
                    onClick={() => toggleEsp(g.esp)}
                    className={`w-full flex items-center justify-between gap-4 px-4 py-3 text-left transition-colors
                      ${isLight ? 'hover:bg-gray-50' : 'hover:bg-white/3'}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <svg
                        width="10" height="10" viewBox="0 0 10 10" fill="none"
                        className="flex-shrink-0 transition-transform"
                        style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', color: isLight ? '#6b7280' : '#a8b0be' }}
                      >
                        <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className={`text-sm font-semibold ${txt}`}>{g.esp}</span>
                      <span className={`text-[10px] font-mono ${muted}`}>
                        {g.ips.length} IP{g.ips.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-5 font-mono text-xs flex-shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] uppercase tracking-wider ${muted}`}>Reg</span>
                        <span style={{ color: g.reg > 0 ? (isLight ? '#006a5b' : '#00e5c3') : undefined }} className={g.reg > 0 ? 'font-bold' : muted}>
                          {g.reg > 0 ? g.reg.toLocaleString() : '—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] uppercase tracking-wider ${muted}`}>FTDs</span>
                        <span style={{ color: g.ftds > 0 ? (isLight ? '#b45309' : '#ffd166') : undefined }} className={g.ftds > 0 ? 'font-bold' : muted}>
                          {g.ftds > 0 ? g.ftds.toLocaleString() : '—'}
                        </span>
                      </div>
                    </div>
                  </button>
                  {!collapsed && (
                    <div className={`border-t ${isLight ? 'border-black/8' : 'border-white/7'}`}>
                      <table className="w-full border-collapse text-[11px] font-mono">
                        <thead>
                          <tr className={isLight ? 'bg-gray-50/60' : 'bg-[#181c22]'}>
                            {['IP Address', 'Reg', 'FTDs'].map((h, i) => (
                              <th key={h} className={`px-3 py-2 font-mono tracking-widest uppercase border-b text-[10px]
                                ${i === 0 ? 'text-left pl-10' : 'text-right'}
                                ${isLight ? 'border-black/8 text-gray-500' : 'border-white/7 text-[#6b7280]'}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {g.ips.map((row, i) => (
                            <tr key={i} className={`border-b last:border-0 ${isLight ? 'border-black/5' : 'border-white/5'}`}>
                              <td className={`px-3 py-2 pl-10 ${txt}`}>{row.ip}</td>
                              <td className={`px-3 py-2 text-right ${row.reg > 0 ? (isLight ? 'text-[#006a5b]' : 'text-[#00e5c3]') : muted}`}>
                                {row.reg > 0 ? row.reg : '—'}
                              </td>
                              <td className={`px-3 py-2 text-right ${row.ftds > 0 ? (isLight ? 'text-[#b45309]' : 'text-[#ffd166]') : muted}`}>
                                {row.ftds > 0 ? row.ftds : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Data quality warnings — bad dates, unknown ESPs, IPs not in matrix */}
      {(badDatesInDb.length > 0 || unknownEspsInData.length > 0 || missingByEsp.length > 0) && (
        <div className={`rounded-xl border p-5 space-y-5 ${isLight ? 'bg-[#fff8f0] border-[#f59e0b]/30' : 'bg-[#ffd166]/5 border-[#ffd166]/20'}`}>
          <div className="flex items-center gap-2">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#ffd166" strokeWidth="1.8">
              <path d="M8 2L14.5 13H1.5L8 2z" strokeLinejoin="round"/>
              <path d="M8 6v3.5M8 11.5h.01" strokeLinecap="round"/>
            </svg>
            <span className={`text-[11px] font-mono tracking-widest uppercase font-semibold ${isLight ? 'text-[#b45309]' : 'text-[#ffd166]'}`}>
              Data quality issues in uploaded records
            </span>
          </div>

          {/* Wrong date format */}
          {badDatesInDb.length > 0 && (
            <div>
              <div className={`text-[11px] font-mono tracking-widest uppercase font-semibold mb-1.5 ${isLight ? 'text-[#b45309]' : 'text-[#ffd166]'}`}>
                Wrong date format ({badDatesInDb.length} distinct value{badDatesInDb.length !== 1 ? 's' : ''})
              </div>
              <p className={`text-[11px] font-mono mb-2 ${isLight ? 'text-[#92400e]' : 'text-[#ffd166]/70'}`}>
                These date values in stored records do not match the required <span className="font-semibold">yyyy-mm-dd</span> format.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {badDatesInDb.map(({ date, count }) => (
                  <span key={date} className={`px-2 py-0.5 rounded text-[11px] font-mono ${isLight ? 'bg-[#fef3c7] text-[#92400e]' : 'bg-[#ffd166]/10 text-[#ffd166]'}`}>
                    {date || '(empty)'}{count > 1 ? ` ×${count}` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Unknown ESPs */}
          {unknownEspsInData.length > 0 && (
            <div>
              <div className={`text-[11px] font-mono tracking-widest uppercase font-semibold mb-1.5 ${isLight ? 'text-[#b45309]' : 'text-[#ffd166]'}`}>
                ESP not in active list ({unknownEspsInData.length} ESP{unknownEspsInData.length !== 1 ? 's' : ''})
              </div>
              <p className={`text-[11px] font-mono mb-2 ${isLight ? 'text-[#92400e]' : 'text-[#ffd166]/70'}`}>
                These ESP names in stored records are not recognized active ESPs.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {unknownEspsInData.map(({ esp, count }) => (
                  <span key={esp} className={`px-2 py-0.5 rounded text-[11px] font-mono ${isLight ? 'bg-[#fef3c7] text-[#92400e]' : 'bg-[#ffd166]/10 text-[#ffd166]'}`}>
                    {esp} <span className={`opacity-60`}>×{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* IPs not in IP Matrix */}
          {missingByEsp.length > 0 && (
            <div>
              <div className={`text-[11px] font-mono tracking-widest uppercase font-semibold mb-1.5 ${isLight ? 'text-[#b45309]' : 'text-[#ffd166]'}`}>
                {missingFromMatrix.length} IP{missingFromMatrix.length !== 1 ? 's' : ''} not in IP Matrix
              </div>
              <p className={`text-[11px] font-mono mb-2 ${isLight ? 'text-[#92400e]' : 'text-[#ffd166]/70'}`}>
                These IP+ESP combinations exist in uploaded data but are not registered in the IP Matrix.
              </p>
              <div className="space-y-2">
                {missingByEsp.map(([esp, ips]) => (
                  <div key={esp}>
                    <div className={`text-[10px] font-mono tracking-widest uppercase mb-1 ${isLight ? 'text-[#b45309]' : 'text-[#ffd166]/60'}`}>{esp}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {ips.map(ip => (
                        <span key={ip} className={`px-2 py-0.5 rounded text-[11px] font-mono ${isLight ? 'bg-[#fef3c7] text-[#92400e]' : 'bg-[#ffd166]/10 text-[#ffd166]'}`}>{ip}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
