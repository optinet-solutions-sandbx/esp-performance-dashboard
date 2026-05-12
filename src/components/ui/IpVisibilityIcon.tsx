'use client'
import { useDashboardStore } from '@/lib/store'

export default function IpVisibilityIcon({ ip, recordIds, size = 12 }: { ip: string; recordIds: string[]; size?: number }) {
  const { hiddenIpmIds, setHiddenIpmIds, isLight } = useDashboardStore()
  if (recordIds.length === 0) return null

  const isHidden = recordIds.every(id => hiddenIpmIds.includes(id))

  const color = isLight
    ? (isHidden ? '#b45309' : '#64748b')
    : (isHidden ? '#ffd166' : '#a8b0be')

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        const set = new Set(hiddenIpmIds)
        if (isHidden) {
          recordIds.forEach(id => set.delete(id))
        } else {
          recordIds.forEach(id => set.add(id))
        }
        setHiddenIpmIds(Array.from(set))
      }}
      title={isHidden ? `Show ${ip}` : `Hide ${ip} from IP Registry`}
      aria-label={isHidden ? `Show ${ip}` : `Hide ${ip} from IP Registry`}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size + 10, height: size + 10, borderRadius: 6,
        background: 'transparent', border: 'none', cursor: 'pointer',
        color, transition: 'background 0.12s, color 0.12s',
        outline: 'none',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      onFocus={e => { e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }}
      onBlur={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {isHidden ? (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false">
          <path d="M2 8c2-3 4-5 6-5s4 2 6 5c-2 3-4 5-6 5s-4-2-6-5z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2 2l12 12" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false">
          <path d="M2 8c2-3 4-5 6-5s4 2 6 5c-2 3-4 5-6 5s-4-2-6-5z" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="8" cy="8" r="2" />
        </svg>
      )}
    </button>
  )
}
