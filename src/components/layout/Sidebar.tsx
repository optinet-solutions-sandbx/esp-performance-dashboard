'use client'
import { useState } from 'react'
import { useDashboardStore } from '@/lib/store'
import { useSession, signOut } from '@/lib/auth'
import type { ViewName } from '@/lib/types'

const STATUS_LABEL = { healthy: 'OK', warn: 'WARN', critical: 'CRIT' } as const
const STATUS_COLORS = {
  healthy: { color: '#00e5c3', bg: 'rgba(0,229,195,0.08)', border: 'rgba(0,229,195,0.25)' },
  warn:    { color: '#ffd166', bg: 'rgba(255,209,102,0.08)', border: 'rgba(255,209,102,0.25)' },
  critical:{ color: '#ff4757', bg: 'rgba(255,71,87,0.08)',  border: 'rgba(255,71,87,0.25)' },
} as const

const STATUS_COLORS_LIGHT = {
  healthy: { color: '#0d9488', bg: 'rgba(13,148,128,0.08)', border: 'rgba(13,148,128,0.20)' },
  warn:    { color: '#b45309', bg: 'rgba(180,83,9,0.08)',   border: 'rgba(180,83,9,0.20)' },
  critical:{ color: '#dc2626', bg: 'rgba(220,38,38,0.07)', border: 'rgba(220,38,38,0.18)' },
}

interface SidebarProps { onClose?: () => void; collapsed?: boolean; onToggleCollapse?: () => void }

export default function Sidebar({ onClose, collapsed, onToggleCollapse }: SidebarProps) {
  const { activeView, setView, isLight, toggleTheme, esps, activeEsp, setActiveEsp, hiddenEsps } = useDashboardStore()
  const { user } = useSession()
  const [providersOpen, setProvidersOpen] = useState(true)
  const [espListOpen, setEspListOpen] = useState(false)

  const userEmail = user?.email ?? ''
  const userInitial = userEmail ? userEmail[0].toUpperCase() : '?'

  function navTo(v: ViewName) { setView(v); onClose?.() }

  const bg = isLight ? '#ffffff' : '#0e1116'
  const borderColor = isLight ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.05)'
  const mutedColor = isLight ? '#64748b' : '#4a5568'
  const textColor = isLight ? '#475569' : '#8a94a6'
  const textHover = isLight ? '#0f172a' : '#d4dae6'
  const activeAccent = isLight ? '#0d9488' : '#00e5c3'
  const activeBg = isLight ? 'rgba(13,148,128,0.09)' : 'rgba(0,229,195,0.08)'
  const activeText = isLight ? '#0f766e' : '#00e5c3'
  const hoverBg = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)'

  const NavItem = ({ id, label, icon }: { id: ViewName; label: string; icon: React.ReactNode }) => {
    const active = activeView === id
    return (
      <button
        onClick={() => navTo(id)}
        title={collapsed ? label : undefined}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 10,
          padding: collapsed ? '9px 0' : '9px 12px', borderRadius: 12, border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: active ? 600 : 400, textAlign: 'left',
          justifyContent: collapsed ? 'center' : 'flex-start',
          background: active ? activeBg : 'transparent',
          color: active ? activeText : textColor,
          transition: 'background 0.12s, color 0.12s',
        }}
        onMouseEnter={e => { if (!active) { e.currentTarget.style.background = hoverBg; e.currentTarget.style.color = textHover } }}
        onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = textColor } }}
      >
        <span style={{ width: 18, height: 18, flexShrink: 0, opacity: active ? 1 : 0.55, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </span>
        {!collapsed && <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>}
        {!collapsed && active && <span style={{ width: 5, height: 5, borderRadius: '50%', background: activeAccent, flexShrink: 0 }} />}
      </button>
    )
  }

  const SectionLabel = ({ text }: { text: string }) => (
    collapsed ? <div style={{ height: 1, background: borderColor, margin: '10px 6px' }} /> :
    <div style={{
      fontSize: 9, fontFamily: 'Space Mono, monospace', letterSpacing: '0.15em',
      textTransform: 'uppercase', color: mutedColor,
      padding: '16px 12px 6px',
    }}>
      {text}
    </div>
  )

  const iconHome = <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" style={{ width: 18, height: 18 }}><path d="M1.5 8L9 1.5l7.5 6.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M3.5 7v8.5h4v-4.5h3v4.5h4V7" strokeLinecap="round" strokeLinejoin="round" /></svg>
  const iconDash = <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" style={{ width: 18, height: 18 }}><rect x="1.5" y="1.5" width="6" height="6" rx="1.5" /><rect x="10.5" y="1.5" width="6" height="6" rx="1.5" /><rect x="1.5" y="10.5" width="6" height="6" rx="1.5" /><rect x="10.5" y="10.5" width="6" height="6" rx="1.5" /></svg>
  const iconPerf = <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" style={{ width: 18, height: 18 }}><polyline points="1.5,14 5,9 9,11 13,5 16.5,7" strokeLinecap="round" strokeLinejoin="round" /></svg>
  const iconCal  = <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" style={{ width: 18, height: 18 }}><rect x="1.5" y="3" width="15" height="13" rx="2" /><path d="M6 3V1.5M12 3V1.5M1.5 7h15" strokeLinecap="round" /></svg>
  const iconChart= <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" style={{ width: 18, height: 18 }}><polyline points="1.5,14.5 5,9 8,11 11.5,5.5 15,8 16.5,3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
  const iconUp   = <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" style={{ width: 18, height: 18 }}><path d="M9 11.5V3M6 6l3-3 3 3" strokeLinecap="round" strokeLinejoin="round" /><rect x="2" y="12.5" width="14" height="3.5" rx="1.5" /></svg>
  const iconGrid = <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" style={{ width: 18, height: 18 }}><rect x="1.5" y="1.5" width="15" height="3" rx="1" /><rect x="1.5" y="7.5" width="15" height="3" rx="1" /><rect x="1.5" y="13.5" width="15" height="3" rx="1" /></svg>
  const iconDb   = <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" style={{ width: 18, height: 18 }}><ellipse cx="9" cy="4.5" rx="6" ry="2.5" /><path d="M3 4.5v4.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V4.5" strokeLinecap="round" /><path d="M3 9v4.5C3 14.9 5.7 16 9 16s6-1.1 6-2.5V9" strokeLinecap="round" /></svg>
  const iconIP   = <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" style={{ width: 18, height: 18 }}><rect x="1.5" y="3.5" width="15" height="11" rx="2.5" /><path d="M5.5 8h7M5.5 11h5" strokeLinecap="round" /></svg>
  const iconEmail= <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" style={{ width: 18, height: 18 }}><rect x="1.5" y="3.5" width="15" height="11" rx="2" /><path d="M1.5 7l7.5 5 7.5-5" strokeLinecap="round" /></svg>
  const iconAnalytics = <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" style={{ width: 18, height: 18 }}><rect x="1.5" y="9.5" width="3" height="7" rx="1" /><rect x="7" y="5.5" width="3" height="11" rx="1" /><rect x="12.5" y="2" width="3" height="14.5" rx="1" /></svg>
  const iconThrottle = (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" style={{ width: 18, height: 18 }}>
      <path d="M2 9h14" strokeLinecap="round"/>
      <path d="M2 5h8"  strokeLinecap="round"/>
      <path d="M2 13h10" strokeLinecap="round"/>
      <circle cx="13" cy="5" r="1.5" fill="currentColor" stroke="none"/>
      <circle cx="15" cy="9" r="1.5" fill="currentColor" stroke="none"/>
      <circle cx="14" cy="13" r="1.5" fill="currentColor" stroke="none"/>
    </svg>
  )

  return (
    <aside style={{
      width: '100%', height: '100vh', display: 'flex', flexDirection: 'column',
      background: bg, borderRight: `1px solid ${borderColor}`,
    }}>
      {/* Logo */}
      <div style={{ padding: collapsed ? '16px 8px' : '20px 16px 16px', borderBottom: `1px solid ${borderColor}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start' }}>
          {collapsed ? (
            <div style={{ fontSize: 15, fontWeight: 700, color: activeAccent, textAlign: 'center' }}>E</div>
          ) : (
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 9, fontFamily: 'Space Mono,monospace', letterSpacing: '0.2em', textTransform: 'uppercase', color: mutedColor, marginBottom: 3 }}>
                Email Ops
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
                <span style={{ color: isLight ? '#111827' : '#f0f2f5' }}>ESP</span>
                <span style={{ color: activeAccent }}> Control</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
        <SectionLabel text="Providers" />

        {/* Email Providers group */}
        {collapsed ? (
          <>
            <NavItem id="mailmodo" label="Mailmodo" icon={<span style={{ width: 7, height: 7, borderRadius: '50%', background: '#7c5cfc', display: 'inline-block' }} />} />
            <NavItem id="ongage" label="Ongage" icon={<span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ffd166', display: 'inline-block' }} />} />
            <NavItem id="netcore" label="Netcore" icon={<span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f97316', display: 'inline-block' }} />} />
          </>
        ) : (
          <>
            <button
              onClick={() => setProvidersOpen(p => !p)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 12, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 400, textAlign: 'left',
                background: 'transparent', color: textColor, transition: 'background 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = hoverBg }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ width: 18, height: 18, flexShrink: 0, opacity: 0.55 }}>{iconEmail}</span>
              <span style={{ flex: 1 }}>Email Providers</span>
              <span style={{ fontSize: 10, opacity: 0.5, transition: 'transform 0.2s', transform: providersOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
            </button>

            {providersOpen && (
              <div style={{ marginLeft: 16, paddingLeft: 12, borderLeft: `1px solid ${isLight ? 'rgba(13,148,128,0.20)' : 'rgba(0,229,195,0.20)'}`, marginTop: 2, marginBottom: 4 }}>
                {[
                  { id: 'mailmodo' as ViewName, label: 'Mailmodo Review', color: '#7c5cfc' },
                  { id: 'ongage' as ViewName, label: 'Ongage Review', color: '#ffd166' },
                  { id: 'netcore' as ViewName, label: 'Netcore Review', color: '#f97316' },
                  { id: 'mms' as ViewName, label: 'MMS Review', color: '#3b82f6' },
                  { id: 'hotsol' as ViewName, label: 'Hotsol Review', color: '#00e5c3' },
                  { id: '171mailsapp' as ViewName, label: '171 MailsApp Review', color: '#ff6b9d' },
                  { id: 'moosend' as ViewName, label: 'Moosend Review', color: '#22c55e' },
                  { id: 'kenscio' as ViewName, label: 'Kenscio Review', color: '#e63946' },
                  { id: 'mailjet' as ViewName, label: 'Mailjet Review', color: '#fdb022' },
                  { id: 'elastic' as ViewName, label: 'Elastic Review', color: '#6366f1' },
                ].filter(item => {
                  // Hide review link if the ESP this view represents is hidden
                  const espNameForView: Record<string, string> = {
                    mailmodo: 'Mailmodo', ongage: 'Ongage', netcore: 'Netcore',
                    mms: 'MMS', hotsol: 'Hotsol', '171mailsapp': '171 MailsApp',
                    moosend: 'Moosend', kenscio: 'Kenscio', mailjet: 'Mailjet',
                    elastic: 'Elastic',
                  }
                  return !hiddenEsps.includes(espNameForView[item.id] ?? item.id)
                }).map(item => {
                  const active = activeView === item.id
                  return (
                    <button key={item.id} onClick={() => navTo(item.id)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                        fontSize: 12.5, fontWeight: active ? 600 : 400, textAlign: 'left',
                        background: active ? `${item.color}14` : 'transparent',
                        color: active ? item.color : textColor,
                        transition: 'background 0.12s, color 0.12s',
                      }}
                      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = hoverBg; e.currentTarget.style.color = textHover } }}
                      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = textColor } }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: item.color, flexShrink: 0, opacity: 0.85 }} />
                      {item.label}
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}


        <SectionLabel text="Tools" />
        <NavItem id="analytics" label="Analytics" icon={iconAnalytics} />
        <NavItem id="upload" label="Upload Report" icon={iconUp} />
        <NavItem id="matrix" label="ESP Deliverability" icon={iconGrid} />
        <NavItem id="datamgmt" label="Data Management" icon={iconDb} />
        <NavItem id="ipmatrix" label="IPs Matrix" icon={iconIP} />
        <NavItem id="throttling" label="Throttling Matrix" icon={iconThrottle} />
        <NavItem id="logs" label="Logs" icon={iconChart} />

        {/* Active ESP list — hidden when collapsed */}
        {!collapsed && (() => {
          const STATUS_ORDER: Record<string, number> = { healthy: 0, warn: 1, critical: 2 }
          const activeEsps = esps.filter(e => e.sent > 0 && !hiddenEsps.includes(e.name)).sort((a, b) => (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0))
          if (activeEsps.length === 0) return null
          return (
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => setEspListOpen(p => !p)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 12px 6px', fontSize: 9, fontFamily: 'Space Mono,monospace',
                  letterSpacing: '0.15em', textTransform: 'uppercase', background: 'none', border: 'none',
                  cursor: 'pointer', color: mutedColor,
                }}
              >
                <span>Active ESPs ({activeEsps.length})</span>
                <span style={{ transition: 'transform 0.2s', transform: espListOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
              </button>
              {espListOpen && activeEsps.map(e => {
                const sc = isLight ? STATUS_COLORS_LIGHT[e.status] : STATUS_COLORS[e.status]
                return (
                  <button
                    key={e.name}
                    onClick={() => setActiveEsp(e.name)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', borderRadius: 12, border: 'none', cursor: 'pointer',
                      fontSize: 12, fontWeight: activeEsp === e.name ? 600 : 400,
                      background: activeEsp === e.name ? hoverBg : 'transparent',
                      color: activeEsp === e.name ? (isLight ? '#111827' : '#f0f2f5') : textColor,
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={ev => { ev.currentTarget.style.background = hoverBg }}
                    onMouseLeave={ev => { if (activeEsp !== e.name) ev.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={{ width: 3, height: 20, borderRadius: 99, background: e.color, flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                    </span>
                    <span style={{
                      fontSize: 9, fontFamily: 'Space Mono,monospace', fontWeight: 700,
                      padding: '3px 7px', borderRadius: 6,
                      color: sc.color, background: sc.bg, border: `1px solid ${sc.border}`,
                      flexShrink: 0,
                    }}>
                      {STATUS_LABEL[e.status]}
                    </span>
                  </button>
                )
              })}
            </div>
          )
        })()}
      </nav>

      {/* Footer */}
      <div style={{ flexShrink: 0, padding: collapsed ? '8px 4px 12px' : '12px 8px 16px', borderTop: `1px solid ${borderColor}` }}>
        {/* User / Sign out */}
        {user && (
          <div style={{ marginBottom: 10 }}>
            {collapsed ? (
              <button
                onClick={() => signOut()}
                title={`${userEmail} — Sign out`}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '6px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: 'transparent', color: textColor,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = hoverBg }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: activeBg, color: activeAccent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, fontFamily: 'Space Mono, monospace',
                  border: `1px solid ${isLight ? 'rgba(13,148,128,0.25)' : 'rgba(0,229,195,0.25)'}`,
                }}>
                  {userInitial}
                </span>
              </button>
            ) : (
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 12,
                  border: `1px solid ${borderColor}`,
                  background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
                }}
              >
                <span style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                  background: activeBg, color: activeAccent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, fontFamily: 'Space Mono, monospace',
                  border: `1px solid ${isLight ? 'rgba(13,148,128,0.25)' : 'rgba(0,229,195,0.25)'}`,
                }}>
                  {userInitial}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, color: isLight ? '#0f172a' : '#d4dae6',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {userEmail}
                  </div>
                  <button
                    onClick={() => signOut()}
                    style={{
                      background: 'transparent', border: 'none', padding: 0,
                      fontSize: 10, fontFamily: 'Space Mono, monospace',
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: mutedColor, cursor: 'pointer',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = isLight ? '#dc2626' : '#ff7b8a' }}
                    onMouseLeave={e => { e.currentTarget.style.color = mutedColor }}
                  >
                    Sign out →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between',
            padding: collapsed ? '8px 0' : '10px 14px', borderRadius: 12, border: `1px solid ${borderColor}`, cursor: 'pointer',
            fontSize: 11, fontFamily: 'Space Mono,monospace', letterSpacing: '0.12em', textTransform: 'uppercase',
            background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
            color: textColor, transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = isLight ? '#d1d5db' : 'rgba(255,255,255,0.15)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = borderColor }}
          title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {collapsed ? (
            <span>{isLight ? '☀' : '🌙'}</span>
          ) : (
            <>
              <span>{isLight ? '☀ Light' : '🌙 Dark'}</span>
              <span style={{
                width: 36, height: 20, borderRadius: 99, flexShrink: 0, position: 'relative', display: 'inline-block',
                background: isLight ? '#0d9488' : '#2d3748',
                border: `1px solid ${isLight ? '#0d9488' : 'rgba(255,255,255,0.1)'}`,
                transition: 'background 0.2s',
              }}>
                <span style={{
                  width: 14, height: 14, borderRadius: '50%', position: 'absolute', top: 2,
                  left: isLight ? 19 : 2,
                  background: isLight ? '#ffffff' : '#6b7280',
                  transition: 'left 0.2s',
                }} />
              </span>
            </>
          )}
        </button>
        {!collapsed && (
          <div style={{ fontSize: 10, fontFamily: 'Space Mono,monospace', textAlign: 'center', marginTop: 10, color: isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.12)' }}>
            {esps.length} provider{esps.length !== 1 ? 's' : ''} loaded
          </div>
        )}
      </div>
    </aside>
  )
}
