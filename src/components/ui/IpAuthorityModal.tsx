'use client'
import type { UploadReview } from '@/lib/regFtdsAuthority'

export default function IpAuthorityModal({
  review, filename, isLight, onProceed, onCancel,
}: {
  review: UploadReview
  filename: string
  isLight: boolean
  onProceed: () => void
  onCancel: () => void
}) {
  const surf  = isLight ? 'bg-white' : 'bg-[#111418]'
  const bdr   = isLight ? 'border-black/10' : 'border-white/7'
  const txt   = isLight ? 'text-gray-900' : 'text-[#f0f2f5]'
  const muted = isLight ? 'text-gray-500' : 'text-[#6b7280]'
  const teal  = isLight ? '#006a5b' : '#00e5c3'

  const fmtDate = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className={`w-full max-w-lg rounded-2xl border p-6 ${surf} ${bdr} max-h-[85vh] overflow-y-auto`}>
        <div className={`text-[11px] font-mono tracking-widest uppercase mb-1 ${muted}`}>
          Review before upload
        </div>
        <div className={`text-sm font-semibold mb-4 ${txt}`}>{filename}</div>

        {review.corrections.length > 0 && (
          <div className="mb-4">
            <div className="text-[11px] font-mono uppercase tracking-wider mb-2" style={{ color: teal }}>
              ⚠ ESP corrections (from IP Matrix)
            </div>
            <div className={`text-[11px] font-mono mb-2 ${muted}`}>
              These rows will be relabeled to match the IP Matrix:
            </div>
            <div className="space-y-1">
              {review.corrections.map(c => (
                <div key={c.ip} className={`text-[11px] font-mono flex justify-between gap-3 ${txt}`}>
                  <span>{c.ip}</span>
                  <span><span className={muted}>{c.from}</span> → <span className="font-semibold">{c.to}</span></span>
                  <span className={muted}>{c.rowCount} row{c.rowCount !== 1 ? 's' : ''}, {c.reg} reg</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {review.ambiguous.length > 0 && (
          <div className="mb-4">
            <div className={`text-[11px] font-mono uppercase tracking-wider mb-2 ${isLight ? 'text-amber-700' : 'text-[#ffd166]'}`}>
              ⚠ Registered under multiple ESPs
            </div>
            <div className={`text-[11px] font-mono mb-2 ${muted}`}>
              Stored under the file&apos;s label as-is — fix the IP Matrix to resolve:
            </div>
            <div className="space-y-1">
              {review.ambiguous.map(a => (
                <div key={a.ip} className={`text-[11px] font-mono flex justify-between gap-3 ${txt}`}>
                  <span>{a.ip}</span>
                  <span className={muted}>label: {a.label}, {a.rowCount} row{a.rowCount !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {review.unknowns.length > 0 && (
          <div className="mb-4">
            <div className={`text-[11px] font-mono uppercase tracking-wider mb-2 ${muted}`}>
              ⓘ Not in IP Matrix
            </div>
            <div className={`text-[11px] font-mono mb-2 ${muted}`}>
              Stored under the file&apos;s label as-is — consider registering:
            </div>
            <div className="space-y-1">
              {review.unknowns.map(u => (
                <div key={u.ip} className={`text-[11px] font-mono flex justify-between gap-3 ${txt}`}>
                  <span>{u.ip}</span>
                  <span className={muted}>label: {u.label}, {u.rowCount} row{u.rowCount !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {review.skippedRows.length > 0 && (
          <div className="mb-4">
            <div className={`text-[11px] font-mono uppercase tracking-wider mb-2 ${muted}`}>
              ⓘ Skipped rows (no IP, no data)
            </div>
            <div className={`text-[11px] font-mono mb-2 ${muted}`}>
              These rows have no IP and no metrics — they&apos;ll be dropped:
            </div>
            <div className="space-y-1">
              {review.skippedRows.map(s => (
                <div key={s.row} className={`text-[11px] font-mono flex justify-between gap-3 ${txt}`}>
                  <span>row {s.row}</span>
                  <span className={muted}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {review.dateOverwrites.length > 0 && (
          <div className="mb-4">
            <div className={`text-[11px] font-mono uppercase tracking-wider mb-2 ${isLight ? 'text-amber-700' : 'text-[#ffd166]'}`}>
              ↻ These dates already have data — will be replaced
            </div>
            <div className="space-y-1">
              {review.dateOverwrites.map(d => (
                <div key={d} className={`text-[11px] font-mono ${txt}`}>{fmtDate(d)}</div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className={`px-3 py-2 rounded-lg border text-[11px] font-mono uppercase tracking-wider transition-all
              border-[#ff4757]/40 text-[#ff4757] hover:bg-[#ff4757]/10`}
          >
            Cancel — don&apos;t upload
          </button>
          <button
            onClick={onProceed}
            className="px-4 py-2 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider
              bg-[rgb(0,229,195)] hover:bg-[rgb(0,200,170)] text-[#0a1628]"
          >
            Proceed with upload
          </button>
        </div>
      </div>
    </div>
  )
}
