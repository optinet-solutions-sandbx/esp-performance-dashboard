'use client'
import { useState, useRef, useEffect } from 'react'
import { useDashboardStore } from '@/lib/store'
import CustomSelect from '@/components/ui/CustomSelect'
import { parseFile, mergeIntoMmData } from '@/lib/parsers'
import { buildProviderDomains, syncEspFromData, overwriteMmData } from '@/lib/utils'
import { ESP_COLORS, ESP_LIST } from '@/lib/data'
import type { MmData } from '@/lib/types'
import { supabase, addLog as logToDb } from '@/lib/supabase'

interface UploadRecord {
  id: string
  esp: string
  filename: string
  rows: number
  dates: string[]
  new_dates: number
  uploaded_at: string
}

export default function UploadView() {
  const { isLight, espData, setEspData, addUploadHistory, esps, setEsps, ipmData, hiddenEsps, toggleEspVisibility } = useDashboardStore()

  const [esp, setEsp] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState(1)
  const [processing, setProcessing] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [result, setResult] = useState<{ rows: number; dates: string[]; newDates: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [history, setHistory] = useState<UploadRecord[]>([])
  const [deleting, setDeleting] = useState<string | null>(null)
  const [historyEspFilter, setHistoryEspFilter] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchHistory() }, [])

  async function fetchHistory() {
    const { data } = await supabase
      .from('uploads')
      .select('*')
      .order('uploaded_at', { ascending: false })
    if (data) setHistory(data)
  }

  function addLog(msg: string) { setLog(prev => [...prev, msg]) }

  function handleEspChange(name: string) {
    setEsp(name)
    if (name) setStep(s => Math.max(s, 2))
  }

  function handleFileSelected(f: File) {
    setFile(f)
    setStep(3)
    setLog([])
    setResult(null)
  }

  async function handleProcess() {
    if (!file || !esp) return
    setProcessing(true)
    setLog([])
    setResult(null)

    try {
      addLog(`📂 Reading ${file.name}…`)
      // Get registered from-domains for this ESP from IP Matrix — used by parser
      // for fuzzy substring matching against campaign names. Adding a domain to the
      // IP Matrix automatically improves parsing without code changes.
      const knownDomains = ipmData
        .filter(r => r.esp?.toLowerCase() === esp.toLowerCase())
        .map(r => r.domain?.trim())
        .filter((d): d is string => !!d)
      if (knownDomains.length) addLog(`🔎 Using ${knownDomains.length} registered domain(s) from IP Matrix for matching`)
      const parsed = await parseFile(file, esp, knownDomains)
      const skipDetail = parsed.skipped > 0
        ? ` — ${parsed.skippedNoDate} no-date, ${parsed.skippedNoEmail} no-email`
        : ''
      addLog(`✅ Parsed ${parsed.totalRows.toLocaleString()} rows (${parsed.skipped} skipped${skipDetail})`)
      addLog(`📅 Found ${parsed.dates.length} date(s): ${parsed.dates.join(', ')}`)
      addLog(`🔎 Format: ${parsed.format}`)

      const freshEmpty = (): MmData => ({ dates: [], datesFull: [], providers: {}, domains: {}, overallByDate: {}, providerDomains: {} })

      // Compute solo data for this upload only
      const { data: soloData } = mergeIntoMmData(freshEmpty(), parsed, esp)
      // providerDomains already populated by mergeIntoMmData with actual per-row data

      // Save new upload to DB — always insert, never delete previous uploads
      const category = esp === 'Mailgun' ? 'mailgun' : 'mailmodo'
      const { error: insertError } = await supabase.from('uploads').insert({
        esp, category, filename: file.name,
        rows: parsed.totalRows, dates: parsed.dates, new_dates: parsed.dates.length,
        solo_data: soloData,
      })
      if (insertError) {
        addLog(`⚠️ Save failed: ${insertError.message}`)
      } else {
        addLog('☁️ Saved to database.')
      }

      // Rebuild this ESP's data from all uploads in order — later uploads override earlier ones for same dates
      const { data: allUploads } = await supabase
        .from('uploads')
        .select('solo_data')
        .eq('esp', esp)
        .order('uploaded_at', { ascending: true })

      let merged = freshEmpty()
      if (allUploads?.length) {
        for (const row of allUploads) {
          if (row.solo_data) merged = overwriteMmData(merged, row.solo_data as MmData)
        }
      }
      // providerDomains already merged by overwriteMmData from solo_data
      setEspData(esp, merged)

      const existingEsp = esps.find(e => e.name === esp)
      const espRecord = existingEsp ?? {
        name: esp, color: ESP_COLORS[esp] ?? '#a8b0be',
        sent: 0, delivered: 0, opens: 0, clicks: 0, bounced: 0, unsub: 0,
        deliveryRate: 0, openRate: 0, clickRate: 0, bounceRate: 0, unsubRate: 0,
        status: 'healthy' as const,
      }
      const updated = syncEspFromData(espRecord, merged)
      setEsps(existingEsp ? esps.map(e => e.name === esp ? updated : e) : [...esps, updated])

      addLog(`🔀 Merged into ${esp} (${parsed.dates.length} date${parsed.dates.length !== 1 ? 's' : ''})`)

      await fetchHistory()

      addUploadHistory({
        esp, file: file.name, rows: parsed.totalRows,
        dates: parsed.dates, time: new Date().toLocaleTimeString(),
        newDates: parsed.dates.length,
      })

      if (hiddenEsps.includes(esp)) {
        await toggleEspVisibility(esp)
        console.log(`${esp} was hidden — now visible.`)
      }

      setResult({ rows: parsed.totalRows, dates: parsed.dates, newDates: parsed.dates.length })
      addLog('✨ Done! Dashboard updated.')
      logToDb('upload', `${esp} — ${file.name}`, `${parsed.totalRows} rows, ${parsed.dates.length} dates`)
      setStep(4)
    } catch (err) {
      addLog(`❌ Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setProcessing(false)
    }
  }

  async function handleDelete(record: UploadRecord) {
    if (!confirm(`Delete this upload?\n\n"${record.filename}" (${record.esp})\n\nOnly this file's data will be removed.`)) return
    setDeleting(record.id)
    try {
      await supabase.from('uploads').delete().eq('id', record.id)

      // Rebuild this ESP's data from remaining uploads
      const { data: remaining } = await supabase
        .from('uploads')
        .select('solo_data')
        .eq('esp', record.esp)
        .order('uploaded_at', { ascending: true })

      const freshEmpty = (): MmData => ({ dates: [], datesFull: [], providers: {}, domains: {}, overallByDate: {}, providerDomains: {} })
      let merged = freshEmpty()
      if (remaining?.length) {
        for (const row of remaining) {
          if (row.solo_data) merged = overwriteMmData(merged, row.solo_data as MmData)
        }
      }
      // providerDomains already merged by overwriteMmData
      setEspData(record.esp, merged)

      const existingEsp = esps.find(e => e.name === record.esp)
      if (existingEsp) {
        const updated = syncEspFromData(existingEsp, merged)
        setEsps(esps.map(e => e.name === record.esp ? updated : e))
      }

      await fetchHistory()
      logToDb('delete', `${record.esp} — ${record.filename}`, `${record.rows} rows removed`)
    } catch {
      // ignore
    } finally {
      setDeleting(null)
    }
  }

  function reset() {
    setEsp(''); setFile(null)
    setStep(1); setLog([]); setResult(null)
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ espData }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = 'esp-dashboard-data.json'; a.click()
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const textMain = isLight ? 'text-gray-900' : 'text-[#f0f2f5]'
  const muted = isLight ? 'text-gray-400' : 'text-[#5a6478]'
  const surface = isLight ? 'bg-white border-black/8' : 'bg-[#111418] border-white/6'
  const inputCls = `w-full px-3.5 py-2.5 rounded-xl border outline-none text-sm transition-all appearance-none
    ${isLight
      ? 'bg-white border-black/15 text-gray-900 focus:border-[#0d9488] focus:ring-2 focus:ring-[#0d9488]/10 hover:border-[#0d9488]'
      : 'bg-[#1a1e26] border-white/10 text-[#f0f2f5] focus:border-[#0d9488] focus:ring-2 focus:ring-[#0d9488]/10 hover:border-[#0d9488]'
    }`

  const stepCircle = (n: number, label: string) => {
    const active = step === n
    const done = step > n
    return (
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all
          ${done
            ? 'bg-[#00e5c3] text-[#0a0c10]'
            : active
              ? isLight ? 'bg-[#007a67] text-white' : 'bg-[#00e5c3] text-[#0a0c10]'
              : isLight ? 'bg-gray-200 text-gray-400' : 'bg-white/8 text-[#5a6478]'
          }`}>
          {done ? '✓' : n}
        </div>
        <span className={`text-sm font-semibold ${active || done ? textMain : muted}`}>{label}</span>
      </div>
    )
  }

  return (
    <div className="view-page fade-up" style={{ maxWidth: 1200 }}>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-8 items-start">
      {/* ── LEFT: Upload Wizard ─────────────────── */}
      <div>
      {/* Header */}
      <div className="section-title" style={{ marginBottom: 4 }}>
        <div className="section-title-bar" style={{ background: '#7c5cfc' }} />
        <h1>Upload Report</h1>
      </div>
      <p className="section-title-sub">Import XLSX or CSV email data to update the dashboard</p>

      {/* Step indicators */}
      <div className={`flex items-center gap-0 mb-6 rounded-2xl border p-4 ${surface}`}>
        {stepCircle(1, 'Configure')}
        <div className={`flex-1 h-px mx-3 ${step > 1 ? 'bg-[#00e5c3]/40' : isLight ? 'bg-black/10' : 'bg-white/8'}`} />
        {stepCircle(2, 'Select File')}
        <div className={`flex-1 h-px mx-3 ${step > 2 ? 'bg-[#00e5c3]/40' : isLight ? 'bg-black/10' : 'bg-white/8'}`} />
        {stepCircle(3, 'Process')}
        <div className={`flex-1 h-px mx-3 ${step > 3 ? 'bg-[#00e5c3]/40' : isLight ? 'bg-black/10' : 'bg-white/8'}`} />
        {stepCircle(4, 'Done')}
      </div>

      {/* Step 1 */}
      <div className={`rounded-2xl border mb-4 ${surface}`}>
        <div className={`px-5 py-3.5 border-b ${isLight ? 'border-black/6 bg-gray-50/60' : 'border-white/5 bg-white/[0.02]'}`}>
          <div className={`text-[11px] font-mono tracking-[0.15em] uppercase ${muted}`}>Step 1</div>
          <div className={`text-sm font-semibold mt-0.5 ${textMain}`}>Select ESP Provider</div>
        </div>
        <div className="p-5">
          <div>
            <label className={`block text-[11px] font-mono tracking-[0.08em] uppercase mb-1.5 ${muted}`}>ESP Provider</label>
            <CustomSelect
              value={esp}
              onChange={handleEspChange}
              options={[
                { value: '', label: 'Select ESP…' },
                ...ESP_LIST.map(e => ({ value: e, label: e }))
              ]}
              isLight={isLight}
              fullWidth
              maxHeight={280}
            />
          </div>
        </div>
      </div>

      {/* Step 2 */}
      <div className={`rounded-2xl border mb-4 overflow-hidden transition-opacity ${surface} ${step < 2 ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className={`px-5 py-3.5 border-b ${isLight ? 'border-black/6 bg-gray-50/60' : 'border-white/5 bg-white/[0.02]'}`}>
          <div className={`text-[11px] font-mono tracking-[0.15em] uppercase ${muted}`}>Step 2</div>
          <div className={`text-sm font-semibold mt-0.5 ${textMain}`}>Select File</div>
        </div>
        <div className="p-5">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelected(f) }} />
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileSelected(f) }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all
              ${dragOver
                ? 'border-[#00e5c3] bg-[#00e5c3]/5'
                : file
                  ? 'border-[#00e5c3]/50 bg-[#00e5c3]/3'
                  : isLight
                    ? 'border-black/15 hover:border-gray-400 hover:bg-black/2'
                    : 'border-white/10 hover:border-white/25 hover:bg-white/2'
              }`}
          >
            <div className="text-3xl mb-3">{file ? '📄' : '📎'}</div>
            {file ? (
              <>
                <div className={`text-sm font-semibold mb-1 ${textMain}`}>{file.name}</div>
                <div className={`text-xs font-mono ${muted}`}>{(file.size / 1024).toFixed(1)} KB · Click to change</div>
              </>
            ) : (
              <>
                <div className={`text-sm mb-1 ${isLight ? 'text-gray-600' : 'text-[#8a94a6]'}`}>
                  Drop file here or <span className={isLight ? 'text-[#007a67] font-semibold' : 'text-[#00e5c3] font-semibold'}>browse</span>
                </div>
                <div className={`text-[11px] font-mono ${muted}`}>.xlsx · .xls · .csv</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Step 3 */}
      <div className={`rounded-2xl border mb-4 overflow-hidden transition-opacity ${surface} ${step < 3 ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className={`px-5 py-3.5 border-b ${isLight ? 'border-black/6 bg-gray-50/60' : 'border-white/5 bg-white/[0.02]'}`}>
          <div className={`text-[11px] font-mono tracking-[0.15em] uppercase ${muted}`}>Step 3</div>
          <div className={`text-sm font-semibold mt-0.5 ${textMain}`}>Process &amp; Import</div>
        </div>
        <div className="p-5">
          <button
            onClick={handleProcess}
            disabled={!esp || !file || processing}
            className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-bold tracking-wide transition-all
              disabled:opacity-40 disabled:cursor-not-allowed
              ${isLight
                ? 'bg-[#007a67] hover:bg-[#006558] text-white shadow-lg shadow-[#007a67]/25'
                : 'bg-[#00e5c3] hover:bg-[#00c9aa] text-[#0a0c10] shadow-lg shadow-[#00e5c3]/20'
              }`}
          >
            {processing
              ? <><span className="animate-spin">⏳</span> Processing…</>
              : <><span>▶</span> Process File</>
            }
          </button>

          {log.length > 0 && (
            <div className={`mt-4 rounded-xl border px-4 py-3 font-mono text-[11px] space-y-1 max-h-40 overflow-y-auto
              ${isLight ? 'bg-gray-50 border-black/8 text-gray-700' : 'bg-[#0d0f13] border-white/7 text-[#8a94a6]'}`}>
              {log.map((l, i) => (
                <div key={i} className={`leading-relaxed
                  ${l.startsWith('✅') || l.startsWith('✨') ? (isLight ? 'text-[#007a67]' : 'text-[#00e5c3]') : ''}
                  ${l.startsWith('❌') || l.startsWith('⚠️') ? 'text-[#ff4757]' : ''}
                  ${l.startsWith('☁️') ? 'text-[#7c5cfc]' : ''}
                `}>{l}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Step 4 done */}
      {step === 4 && result && (
        <div className={`rounded-2xl border overflow-hidden fade-up ${surface}`}>
          <div className="px-5 py-3.5 border-b border-[#00e5c3]/20 bg-[#00e5c3]/5">
            <div className="text-[11px] font-mono tracking-[0.15em] uppercase text-[#00e5c3]">Complete</div>
            <div className={`text-sm font-semibold mt-0.5 ${textMain}`}>Upload Successful</div>
          </div>
          <div className="p-5">
            <div className="flex flex-wrap gap-3 text-sm mb-5">
              <span className={`px-3 py-1.5 rounded-lg font-mono text-[11px] ${isLight ? 'bg-gray-100 text-gray-600' : 'bg-white/5 text-[#8a94a6]'}`}>
                {result.rows.toLocaleString()} rows
              </span>
              <span className={`px-3 py-1.5 rounded-lg font-mono text-[11px] ${isLight ? 'bg-gray-100 text-gray-600' : 'bg-white/5 text-[#8a94a6]'}`}>
                {result.dates.length} dates
              </span>
              <span className="px-3 py-1.5 rounded-lg font-mono text-[11px] text-[#00e5c3] bg-[#00e5c3]/10">
                +{result.newDates} new
              </span>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={exportData}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-mono uppercase tracking-wider transition-all
                  ${isLight ? 'border-[#007a67]/40 text-[#007a67] hover:bg-[#007a67]/8' : 'border-[#00e5c3]/30 text-[#00e5c3] hover:bg-[#00e5c3]/8'}`}
              >
                ↓ Export JSON
              </button>
              <button
                onClick={reset}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-mono uppercase tracking-wider transition-all
                  ${isLight ? 'border-black/15 text-gray-500 hover:border-black/30' : 'border-white/10 text-[#5a6478] hover:border-white/20'}`}
              >
                + Upload Another
              </button>
            </div>
          </div>
        </div>
      )}

      </div>{/* end left column */}

      {/* ── RIGHT: Upload History ────────────────── */}
      <div>
        <div className="section-title" style={{ marginBottom: 4 }}>
          <div className="section-title-bar" style={{ background: '#ff6b35' }} />
          <h1>Upload History</h1>
        </div>
        <p className="section-title-sub">Manage past uploads</p>

        {/* ESP filter */}
        <div className="mb-4">
          <CustomSelect
            value={historyEspFilter}
            onChange={setHistoryEspFilter}
            options={[{ value: '', label: 'All ESPs' }, ...[...new Set(history.map(h => h.esp))].sort().map(e => ({ value: e, label: e }))]}
            isLight={isLight}
            minWidth={130}
          />
        </div>

        {(() => {
          const filtered = historyEspFilter ? history.filter(h => h.esp === historyEspFilter) : history
          return filtered.length === 0 ? (
          <div className={`rounded-2xl border p-8 text-center ${surface}`}>
            <div className={`text-sm ${muted}`}>{history.length === 0 ? 'No uploads yet' : 'No uploads for this ESP'}</div>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(rec => (
              <div key={rec.id} className={`rounded-2xl border overflow-hidden ${surface}`}>
                <div className={`px-5 py-3.5 border-b ${isLight ? 'border-black/6 bg-gray-50/60' : 'border-white/5 bg-white/[0.02]'} flex items-start justify-between gap-3`}>
                  <div>
                    <div className={`text-[11px] font-mono tracking-[0.12em] uppercase ${muted}`}>
                      {fmtDate(rec.uploaded_at)}
                    </div>
                    <div className={`text-sm font-semibold mt-0.5 ${textMain}`}>
                      {rec.esp} · {rec.filename}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={async () => {
                        const { data: row } = await supabase.from('uploads').select('solo_data').eq('id', rec.id).single()
                        if (row?.solo_data) {
                          const d = row.solo_data as MmData
                          const csvHeaders = ['Date','Provider','Domain','Sent','Delivered','Opened','Clicked','Bounced','Hard Bounced','Soft Bounced','Unsubscribed','Delivery Rate','Open Rate','Click Rate','Bounce Rate']
                          const csvRows: string[] = [csvHeaders.join(',')]
                          d.dates.forEach(date => {
                            Object.entries(d.providers).forEach(([prov, pData]) => {
                              const r = pData.byDate?.[date]
                              if (!r || !r.sent) return
                              // Find which domain this provider+date belongs to (best effort)
                              let dom = ''
                              Object.entries(d.providerDomains || {}).forEach(([p, dMap]) => {
                                if (p === prov) Object.keys(dMap).forEach(dd => { if (!dom) dom = dd })
                              })
                              csvRows.push([date, prov, dom, r.sent, r.delivered, r.opened, r.clicked, r.bounced, r.hardBounced||0, r.softBounced||0, r.unsubscribed||0, (r.deliveryRate||0).toFixed(2), (r.openRate||0).toFixed(2), (r.clickRate||0).toFixed(2), (r.bounceRate||0).toFixed(2)].join(','))
                            })
                          })
                          const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
                          const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
                          a.download = rec.filename.replace(/\.[^.]+$/, '') + '_export.csv'; a.click()
                          logToDb('download', `${rec.esp} — ${rec.filename}`, 'Upload data exported as CSV')
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider transition-all border
                        ${isLight ? 'border-black/15 text-gray-500 hover:border-[#0d9488] hover:text-[#0d9488]' : 'border-white/13 text-[#a8b0be] hover:border-[#0d9488] hover:text-[#0d9488]'}`}
                    >
                      Download
                    </button>
                    <button
                      onClick={() => handleDelete(rec)}
                      disabled={deleting === rec.id}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider transition-all
                        border border-[#ff4757]/40 text-[#ff4757] hover:bg-[#ff4757]/10 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {deleting === rec.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
                <div className="px-5 py-3 flex flex-wrap gap-3">
                  <span className={`px-2.5 py-1 rounded-lg font-mono text-[11px] ${isLight ? 'bg-gray-100 text-gray-600' : 'bg-white/5 text-[#8a94a6]'}`}>
                    {rec.rows.toLocaleString()} rows
                  </span>
                  <span className={`px-2.5 py-1 rounded-lg font-mono text-[11px] ${isLight ? 'bg-gray-100 text-gray-600' : 'bg-white/5 text-[#8a94a6]'}`}>
                    {rec.dates.length} date{rec.dates.length !== 1 ? 's' : ''}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg font-mono text-[11px] text-[#00e5c3] bg-[#00e5c3]/10">
                    +{rec.new_dates} new
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
        })()}
      </div>{/* end right column */}
      </div>{/* end grid */}
    </div>
  )
}
