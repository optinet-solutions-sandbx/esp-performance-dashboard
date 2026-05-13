'use client'
import { useRef, useState } from 'react'
import { useDashboardStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import { parseThrottleCsv } from '@/lib/parsers'
import type { ThrottleRecord, ThrottleValue } from '@/lib/types'
import CustomSelect from '@/components/ui/CustomSelect'

const PROVIDERS = ['Gmail','Hotmail','Outlook','Yahoo','Icloud','AOL','Live','Gmx','Web','Others'] as const
const PROVIDER_KEYS: (keyof Omit<ThrottleRecord,'esp'|'ip'|'fromDomain'>)[] = [
  'gmail','hotmail','outlook','yahoo','icloud','aol','live','gmx','web','others',
]

const ESP_OPTIONS = ['Mailmodo','Ongage','Netcore','MMS','Hotsol','171 MailsApp','Moosend','Kenscio','Mailjet','Elastic']

const ESP_BADGE_COLORS: Record<string, string> = {
  Mailmodo: '#7c5cfc', Ongage: '#ffd166', Netcore: '#f97316',
  MMS: '#3b82f6', Hotsol: '#00e5c3', '171 MailsApp': '#ff6b9d',
  Moosend: '#22c55e', Kenscio: '#e63946', Mailjet: '#fdb022',
  Elastic: '#6366f1',
}

function fmtVal(v: ThrottleValue): string {
  if (v === 'TBC') return 'TBC'
  if (v === 0) return '0'
  return v.toLocaleString()
}

function parseThrottleValue(s: string): ThrottleValue {
  const t = s.trim().toUpperCase()
  if (t === 'TBC') return 'TBC'
  const n = Number(s.replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

type RecordForm = {
  esp: string
  ip: string
  fromDomain: string
  gmail: string
  hotmail: string
  outlook: string
  yahoo: string
  icloud: string
  aol: string
  live: string
  gmx: string
  web: string
  others: string
}

const EMPTY_FORM: RecordForm = {
  esp: '', ip: '', fromDomain: '',
  gmail: '', hotmail: '', outlook: '', yahoo: '', icloud: '',
  aol: '', live: '', gmx: '', web: '', others: '',
}

function recordToForm(r: ThrottleRecord): RecordForm {
  return {
    esp: r.esp, ip: r.ip, fromDomain: r.fromDomain,
    gmail: String(r.gmail), hotmail: String(r.hotmail), outlook: String(r.outlook),
    yahoo: String(r.yahoo), icloud: String(r.icloud), aol: String(r.aol),
    live: String(r.live), gmx: String(r.gmx), web: String(r.web), others: String(r.others),
  }
}

function formToRecord(f: RecordForm): ThrottleRecord {
  return {
    esp: f.esp.trim(), ip: f.ip.trim(), fromDomain: f.fromDomain.trim(),
    gmail:   parseThrottleValue(f.gmail),
    hotmail: parseThrottleValue(f.hotmail),
    outlook: parseThrottleValue(f.outlook),
    yahoo:   parseThrottleValue(f.yahoo),
    icloud:  parseThrottleValue(f.icloud),
    aol:     parseThrottleValue(f.aol),
    live:    parseThrottleValue(f.live),
    gmx:     parseThrottleValue(f.gmx),
    web:     parseThrottleValue(f.web),
    others:  parseThrottleValue(f.others),
  }
}

export default function ThrottlingMatrixView() {
  const { isLight, throttleData, setThrottleData } = useDashboardStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [filterEsp, setFilterEsp] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Modal state: null = closed, 'add' = new record, ThrottleRecord = editing that record
  const [modal, setModal] = useState<null | 'add' | ThrottleRecord>(null)
  const [form, setForm] = useState<RecordForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const txt      = isLight ? '#111827' : '#f0f2f5'
  const muted    = isLight ? '#374151' : '#c8cdd6'
  const bdr      = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'
  const headerBg = isLight ? '#f1f3f7' : '#181c22'
  const surfBg   = isLight ? '#ffffff' : '#111418'
  const inputBg  = isLight ? '#f3f4f6' : '#1a1f27'
  const inputBdr = isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.1)'

  const byEsp: Record<string, ThrottleRecord[]> = {}
  throttleData.forEach(r => {
    if (!byEsp[r.esp]) byEsp[r.esp] = []
    byEsp[r.esp].push(r)
  })
  const espNames = Object.keys(byEsp).sort()
  const visibleEsps = filterEsp
    ? [[filterEsp, byEsp[filterEsp] ?? []]] as [string, ThrottleRecord[]][]
    : Object.entries(byEsp)

  function openAdd() {
    setForm(EMPTY_FORM)
    setModal('add')
  }

  function openEdit(r: ThrottleRecord) {
    setForm(recordToForm(r))
    setModal(r)
  }

  function closeModal() {
    setModal(null)
    setForm(EMPTY_FORM)
  }

  function setField(key: keyof RecordForm, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    if (!form.esp.trim() || !form.ip.trim() || !form.fromDomain.trim()) {
      setMsg({ text: 'ESP, IP, and From Domain are required.', ok: false })
      return
    }
    setSaving(true)
    try {
      const rec = formToRecord(form)
      const dbRow = {
        esp: rec.esp, ip: rec.ip, from_domain: rec.fromDomain,
        gmail: String(rec.gmail), hotmail: String(rec.hotmail), outlook: String(rec.outlook),
        yahoo: String(rec.yahoo), icloud: String(rec.icloud), aol: String(rec.aol),
        live: String(rec.live), gmx: String(rec.gmx), web: String(rec.web), others: String(rec.others),
      }

      if (modal === 'add') {
        const { error } = await supabase.from('throttle_matrix').insert(dbRow)
        if (error) throw error
        setThrottleData([...throttleData, rec])
        setMsg({ text: `Added row: ${rec.esp} — ${rec.fromDomain}`, ok: true })
      } else {
        const orig = modal as ThrottleRecord
        const { error } = await supabase
          .from('throttle_matrix')
          .update(dbRow)
          .match({ esp: orig.esp, ip: orig.ip, from_domain: orig.fromDomain })
        if (error) throw error
        setThrottleData(throttleData.map(r =>
          r.esp === orig.esp && r.ip === orig.ip && r.fromDomain === orig.fromDomain ? rec : r
        ))
        setMsg({ text: `Updated: ${rec.esp} — ${rec.fromDomain}`, ok: true })
      }
      closeModal()
    } catch (err) {
      setMsg({ text: String(err), ok: false })
    } finally {
      setSaving(false)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = parseThrottleCsv(text)
      if (parsed.length === 0) throw new Error('No rows parsed — check the file format.')
      setThrottleData(parsed)
      await supabase.from('throttle_matrix').delete().not('id', 'is', null)
      await supabase.from('throttle_matrix').insert(
        parsed.map(r => ({
          esp: r.esp, ip: r.ip, from_domain: r.fromDomain,
          gmail: String(r.gmail), hotmail: String(r.hotmail), outlook: String(r.outlook),
          yahoo: String(r.yahoo), icloud: String(r.icloud), aol: String(r.aol),
          live: String(r.live), gmx: String(r.gmx), web: String(r.web), others: String(r.others),
        }))
      )
      setMsg({ text: `Loaded ${parsed.length} rows from "${file.name}"`, ok: true })
    } catch (err) {
      setMsg({ text: String(err), ok: false })
    }
    e.target.value = ''
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await supabase.from('throttle_matrix').delete().not('id', 'is', null)
      setThrottleData([])
      setFilterEsp('')
      setMsg({ text: 'All throttle data deleted.', ok: true })
    } catch (err) {
      setMsg({ text: String(err), ok: false })
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  function downloadCsv() {
    const header = ['', 'IP', 'From Domain', ...PROVIDERS]
    const csvRows = [
      header,
      ...throttleData.map(r => [
        r.esp, r.ip, r.fromDomain,
        ...PROVIDER_KEYS.map(k => String(r[k])),
      ]),
    ]
    const csv = csvRows
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'Throttling Matrix.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const thCls = 'px-3 py-2.5 text-[11px] font-mono tracking-widest uppercase text-left border-b whitespace-nowrap'
  const tdCls = 'px-3 py-2 text-left text-[11px] font-mono border-b'

  const isEditing = modal !== null && modal !== 'add'
  const modalTitle = modal === 'add' ? 'Add Record' : 'Edit Record'

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: txt }}>
            Throttling Matrix
          </h1>
          <p className="text-sm mt-1" style={{ color: muted }}>
            Per-domain send limits by email provider
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {espNames.length > 0 && (
            <CustomSelect
              value={filterEsp}
              onChange={setFilterEsp}
              isLight={isLight}
              minWidth={130}
              maxHeight={220}
              options={[
                { value: '', label: 'All ESPs' },
                ...espNames.map(esp => ({ value: esp, label: esp, color: ESP_BADGE_COLORS[esp] })),
              ]}
            />
          )}
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          <button
            onClick={() => fileRef.current?.click()}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-mono uppercase tracking-wider transition-all ${isLight ? 'border-black/20 text-gray-600 hover:border-[#0d9488] hover:text-[#0d9488]' : 'border-white/[0.13] text-[#a8b0be] hover:border-[#0d9488] hover:text-[#0d9488]'}`}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8V1M3.5 3.5L6 1l2.5 2.5"/><path d="M1 10h10"/>
            </svg>
            Upload CSV
          </button>
          {/* Add Record button */}
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider transition-all font-semibold"
            style={{ background: '#00e5c3', color: '#0a1a17' }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 1v10M1 6h10"/>
            </svg>
            Add Record
          </button>
          {throttleData.length > 0 && (
            <>
              <button
                onClick={downloadCsv}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-mono uppercase tracking-wider transition-all ${isLight ? 'border-black/20 text-gray-600 hover:border-[#0d9488] hover:text-[#0d9488]' : 'border-white/[0.13] text-[#a8b0be] hover:border-[#0d9488] hover:text-[#0d9488]'}`}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 1v7M3.5 6l2.5 2.5L8.5 6"/><path d="M1 10h10"/>
                </svg>
                CSV
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-mono uppercase tracking-wider transition-all ${isLight ? 'border-red-300 text-red-500 hover:border-red-500 hover:bg-red-50' : 'border-[#ff4757]/40 text-[#ff4757] hover:border-[#ff4757] hover:bg-[#ff4757]/10'}`}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h8M5 3V1.5h2V3M3 3l.5 7.5h5L9 3"/>
                </svg>
                Delete Data
              </button>
            </>
          )}
        </div>
      </div>

      {/* Status message */}
      {msg && (
        <div
          className={`mb-4 px-4 py-2.5 rounded-lg text-[12px] font-mono border ${
            msg.ok
              ? isLight ? 'border-teal-300 bg-teal-50 text-teal-700' : 'border-[#00e5c3]/30 bg-[#00e5c3]/[0.08] text-[#00e5c3]'
              : isLight ? 'border-red-300 bg-red-50 text-red-600'   : 'border-[#ff4757]/30 bg-[#ff4757]/[0.08] text-[#ff4757]'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Empty state */}
      {throttleData.length === 0 ? (
        <div className="rounded-xl border p-12 text-center" style={{ background: surfBg, borderColor: bdr }}>
          <div className="text-4xl mb-4">⚡</div>
          <div className="text-lg font-medium mb-2" style={{ color: txt }}>No throttle data</div>
          <div className="text-sm" style={{ color: muted }}>
            Upload a CSV or use{' '}
            <button onClick={openAdd} className="underline" style={{ color: '#00e5c3' }}>Add Record</button>
            {' '}to add entries manually.
          </div>
        </div>
      ) : (
        <div className="rounded-xl border overflow-auto" style={{ background: surfBg, borderColor: bdr, maxHeight: 'calc(100vh - 200px)' }}>
          <table className="w-full border-collapse" style={{ minWidth: 1160 }}>
            <thead>
              <tr style={{ background: headerBg }}>
                {['ESP', 'IP', 'From Domain', ...PROVIDERS, ''].map((col, i) => (
                  <th
                    key={col + i}
                    className={`${thCls} sticky top-0 z-10`}
                    style={{
                      color: txt, borderColor: bdr, background: headerBg,
                      width: col === 'From Domain' ? 180 : col === 'IP' ? 130 : col === 'ESP' ? 100 : col === '' ? 44 : 70,
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleEsps.map(([esp, rows]) => {
                const espColor = ESP_BADGE_COLORS[esp] ?? '#a8b0be'
                return rows.map((r, i) => (
                  <tr
                    key={`${esp}-${r.ip}-${r.fromDomain}`}
                    style={{ borderBottom: `1px solid ${bdr}` }}
                  >
                    {i === 0 ? (
                      <td
                        className={tdCls}
                        rowSpan={rows.length}
                        style={{ borderBottom: `1px solid ${bdr}`, color: espColor, fontWeight: 700, verticalAlign: 'top', paddingTop: 10 }}
                      >
                        {esp}
                      </td>
                    ) : null}
                    <td className={tdCls} style={{ borderBottom: `1px solid ${bdr}`, color: muted }}>{r.ip}</td>
                    <td className={tdCls} style={{ borderBottom: `1px solid ${bdr}`, color: txt }}>{r.fromDomain}</td>
                    {PROVIDER_KEYS.map(k => {
                      const v = r[k]
                      const isTbc = v === 'TBC'
                      return (
                        <td
                          key={k}
                          className={`${tdCls} text-center`}
                          style={{
                            borderBottom: `1px solid ${bdr}`,
                            color: isTbc    ? (isLight ? '#b45309' : '#ffd166')
                                 : v === 0 ? (isLight ? '#9ca3af' : '#4a5568')
                                 : txt,
                            fontStyle: isTbc ? 'italic' : 'normal',
                          }}
                        >
                          {fmtVal(v)}
                        </td>
                      )
                    })}
                    {/* Edit action */}
                    <td
                      className={tdCls}
                      style={{ borderBottom: `1px solid ${bdr}`, width: 44, textAlign: 'center', padding: '6px 8px' }}
                    >
                      <button
                        onClick={() => openEdit(r)}
                        title="Edit row"
                        className="rounded p-1 hover:bg-white/10 transition-colors"
                        style={{ color: '#00e5c3' }}
                      >
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Record Modal */}
      {modal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60" onClick={() => !saving && closeModal()} />
          <div
            className="relative z-10 rounded-2xl border w-[540px] max-h-[90vh] overflow-y-auto"
            style={{ background: surfBg, borderColor: bdr }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b" style={{ borderColor: bdr }}>
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ background: 'rgba(0,229,195,0.12)' }}>
                  {isEditing ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#00e5c3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#00e5c3" strokeWidth="2" strokeLinecap="round">
                      <path d="M7 1v12M1 7h12"/>
                    </svg>
                  )}
                </div>
                <span className="text-sm font-semibold" style={{ color: txt }}>{modalTitle}</span>
              </div>
              <button
                onClick={closeModal}
                disabled={saving}
                className="rounded-lg p-1.5 transition-all hover:bg-white/10 disabled:opacity-40"
                style={{ color: muted }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M2 2l10 10M12 2L2 12"/>
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* ESP + IP row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color: muted }}>ESP *</label>
                  <input
                    list="esp-options"
                    value={form.esp}
                    onChange={e => setField('esp', e.target.value)}
                    placeholder="e.g. Mailmodo"
                    className="w-full px-3 py-2 rounded-lg border text-[12px] font-mono outline-none focus:border-[#00e5c3] transition-colors"
                    style={{ background: inputBg, borderColor: inputBdr, color: txt }}
                  />
                  <datalist id="esp-options">
                    {ESP_OPTIONS.map(o => <option key={o} value={o} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color: muted }}>IP *</label>
                  <input
                    value={form.ip}
                    onChange={e => setField('ip', e.target.value)}
                    placeholder="e.g. 103.52.180.198"
                    className="w-full px-3 py-2 rounded-lg border text-[12px] font-mono outline-none focus:border-[#00e5c3] transition-colors"
                    style={{ background: inputBg, borderColor: inputBdr, color: txt }}
                  />
                </div>
              </div>

              {/* From Domain */}
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color: muted }}>From Domain *</label>
                <input
                  value={form.fromDomain}
                  onChange={e => setField('fromDomain', e.target.value)}
                  placeholder="e.g. dailytwists.com"
                  className="w-full px-3 py-2 rounded-lg border text-[12px] font-mono outline-none focus:border-[#00e5c3] transition-colors"
                  style={{ background: inputBg, borderColor: inputBdr, color: txt }}
                />
              </div>

              {/* Provider limits */}
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: muted }}>Provider Limits (number or TBC)</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {PROVIDER_KEYS.map((k, idx) => (
                    <div key={k} className="flex items-center gap-2">
                      <span className="text-[10px] font-mono uppercase w-16 shrink-0 text-right" style={{ color: muted }}>
                        {PROVIDERS[idx]}
                      </span>
                      <input
                        value={form[k as keyof RecordForm]}
                        onChange={e => setField(k as keyof RecordForm, e.target.value)}
                        placeholder="0"
                        className="flex-1 px-2.5 py-1.5 rounded-lg border text-[12px] font-mono outline-none focus:border-[#00e5c3] transition-colors text-center"
                        style={{ background: inputBg, borderColor: inputBdr, color: txt }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex gap-2 px-6 pb-5">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-[12px] font-mono font-bold uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: '#00e5c3', color: '#0a1a17' }}
              >
                {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Record'}
              </button>
              <button
                onClick={closeModal}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl border text-[12px] font-mono uppercase tracking-wider transition-all disabled:opacity-40"
                style={{ borderColor: bdr, color: muted }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60" onClick={() => !deleting && setConfirmDelete(false)} />
          <div className="relative z-10 rounded-2xl border p-7 w-[360px]" style={{ background: surfBg, borderColor: bdr }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full" style={{ background: 'rgba(255,71,87,0.12)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff4757" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
                </svg>
              </div>
              <div>
                <div className="text-sm font-semibold" style={{ color: txt }}>Delete all throttle data?</div>
                <div className="text-[12px] mt-0.5" style={{ color: muted }}>This will remove all {throttleData.length} rows from the database.</div>
              </div>
            </div>
            <p className="text-[12px] font-mono mb-5 px-1" style={{ color: muted }}>
              This action cannot be undone. You will need to re-upload the CSV to restore the data.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-[12px] font-mono font-bold uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: '#dc2626', color: '#fff' }}
              >
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl border text-[12px] font-mono uppercase tracking-wider transition-all"
                style={{ borderColor: bdr, color: muted }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
