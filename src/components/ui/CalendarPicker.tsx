'use client'
import { useState, useEffect, useRef } from 'react'

const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS_SHORT  = ['Su','Mo','Tu','We','Th','Fr','Sa']

export default function CalendarPicker({
  value, onChange, isLight, rangeStart, rangeEnd, align = 'left',
}: {
  value: string
  onChange: (iso: string) => void
  isLight: boolean
  rangeStart?: string
  rangeEnd?: string
  align?: 'left' | 'right'
}) {
  const MIN_YEAR = 2025
  const toDate   = (iso: string) => new Date(iso + 'T00:00:00')

  const [open,      setOpen]      = useState(false)
  const [viewYear,  setViewYear]  = useState(() => value ? toDate(value).getFullYear() : new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => value ? toDate(value).getMonth()    : new Date().getMonth())
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional sync: when value prop changes externally, snap the calendar view to the selected date; cannot derive in render because viewYear/viewMonth are also mutated by prev/next navigation
    if (value) { const d = toDate(value); setViewYear(d.getFullYear()); setViewMonth(d.getMonth()) }
  }, [value])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function prevYear()  { setViewYear(y => Math.max(MIN_YEAR, y - 1)) }
  function nextYear()  { setViewYear(y => y + 1) }
  function prevMonth() {
    if (viewMonth === 0) { if (viewYear > MIN_YEAR) { setViewYear(y => y - 1); setViewMonth(11) } }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }
  function selectDay(day: number) {
    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    onChange(iso); setOpen(false)
  }

  const dayIso = (day: number) =>
    `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`

  const isSelected  = (day: number) => !!value && value === dayIso(day)
  const isRangeEdge = (day: number) => {
    const iso = dayIso(day)
    return (!!rangeStart && iso === rangeStart) || (!!rangeEnd && iso === rangeEnd)
  }
  const isInRange = (day: number) => {
    if (!rangeStart || !rangeEnd) return false
    const iso = dayIso(day)
    const lo  = rangeStart < rangeEnd ? rangeStart : rangeEnd
    const hi  = rangeStart < rangeEnd ? rangeEnd   : rangeStart
    return iso > lo && iso < hi
  }

  const firstDay    = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const displayVal = value
    ? toDate(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'Pick date'

  const popBg      = isLight ? '#ffffff'         : '#181c22'
  const popBdr     = isLight ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.12)'
  const btnCls     = isLight
    ? 'bg-white border-black/20 text-gray-800 hover:border-[#0d9488]'
    : 'bg-[#1e232b] border-white/18 text-white hover:border-[#0d9488]'
  const navBtnCls  = isLight ? 'text-gray-500 hover:bg-gray-100' : 'text-[#c8cdd6] hover:bg-white/8'

  function dayCls(day: number) {
    if (isSelected(day) || isRangeEdge(day)) return 'bg-[#0d9488] text-white font-bold z-10 relative'
    if (isInRange(day)) return isLight ? 'text-gray-700 hover:bg-[#0d9488]/20' : 'text-[#c8cdd6] hover:bg-[#0d9488]/20'
    return isLight ? 'text-gray-700 hover:bg-gray-100' : 'text-[#c8cdd6] hover:bg-white/8'
  }

  function rangeBg(day: number): string {
    if (!rangeStart || !rangeEnd) return 'transparent'
    const iso = dayIso(day)
    const lo  = rangeStart < rangeEnd ? rangeStart : rangeEnd
    const hi  = rangeStart < rangeEnd ? rangeEnd   : rangeStart
    if (iso < lo || iso > hi) return 'transparent'
    return isLight ? 'rgba(13,148,136,0.12)' : 'rgba(13,148,136,0.18)'
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold transition-all ${btnCls}`}
        style={{ minWidth: 96 }}
      >
        {displayVal}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="opacity-60">
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div
          className="absolute z-50 shadow-2xl rounded-xl overflow-hidden"
          style={{ top: '100%', ...(align === 'right' ? { right: 0 } : { left: 0 }), marginTop: 8, width: 262, background: popBg, border: `1px solid ${popBdr}` }}
        >
          {/* ── Nav header ── */}
          <div className="flex items-center justify-between px-2 py-2.5 border-b" style={{ borderColor: popBdr }}>
            <button onClick={prevYear} disabled={viewYear <= MIN_YEAR}
              className={`w-7 h-7 flex items-center justify-center rounded-md text-sm transition-all disabled:opacity-30 ${navBtnCls}`}>«</button>
            <button onClick={prevMonth} disabled={viewYear <= MIN_YEAR && viewMonth === 0}
              className={`w-7 h-7 flex items-center justify-center rounded-md text-base transition-all disabled:opacity-30 ${navBtnCls}`}>‹</button>

            <span className={`text-xs font-mono font-bold ${isLight ? 'text-gray-800' : 'text-[#f0f2f5]'}`}>
              {MONTHS_FULL[viewMonth]} {viewYear}
            </span>

            <button onClick={nextMonth}
              className={`w-7 h-7 flex items-center justify-center rounded-md text-base transition-all ${navBtnCls}`}>›</button>
            <button onClick={nextYear}
              className={`w-7 h-7 flex items-center justify-center rounded-md text-sm transition-all ${navBtnCls}`}>»</button>
          </div>

          {/* ── Day-of-week labels ── */}
          <div className="grid grid-cols-7 px-2 pt-2 pb-0.5">
            {DAYS_SHORT.map(d => (
              <div key={d} className={`text-center text-[9px] font-mono font-semibold uppercase tracking-wide ${isLight ? 'text-gray-400' : 'text-[#6b7280]'}`}>{d}</div>
            ))}
          </div>

          {/* ── Day cells ── */}
          <div className="grid grid-cols-7 px-2 pb-3 gap-y-0.5">
            {cells.map((day, i) => (
              <div
                key={i}
                className="flex items-center justify-center h-8"
                style={{ background: day != null ? rangeBg(day) : 'transparent' }}
              >
                {day != null && (
                  <button
                    onClick={() => selectDay(day)}
                    className={`w-7 h-7 rounded-full text-[11px] font-mono transition-all ${dayCls(day)}`}
                  >
                    {day}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
