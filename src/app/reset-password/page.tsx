'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { updatePassword } from '@/lib/auth'
import { useDashboardStore } from '@/lib/store'

export default function ResetPasswordPage() {
  const { isLight } = useDashboardStore()
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'INITIAL_SESSION' && session)) {
        setReady(true)
      }
    })
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setSubmitting(true)
    try {
      const { error } = await updatePassword(password)
      if (error) {
        setError(error.message)
      } else {
        setInfo('Password updated. Redirecting…')
        setTimeout(() => router.replace('/'), 1200)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const bg = isLight ? '#f5f7fb' : '#0a0d12'
  const cardBg = isLight ? '#ffffff' : '#111418'
  const border = isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.07)'
  const text = isLight ? '#0f172a' : '#f0f2f5'
  const muted = isLight ? '#64748b' : '#a8b0be'
  const inputBg = isLight ? '#f8fafc' : '#181c22'
  const inputBorder = isLight ? 'rgba(0,0,0,0.13)' : 'rgba(255,255,255,0.13)'
  const accent = isLight ? '#0d9488' : '#00e5c3'
  const accentText = isLight ? '#ffffff' : '#0a1628'
  const dangerColor = isLight ? '#b91c1c' : '#ff7b8a'
  const infoColor = isLight ? '#0369a1' : '#7dd3fc'

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 13px',
    borderRadius: 8,
    border: `1px solid ${inputBorder}`,
    background: inputBg,
    color: text,
    fontSize: 14,
    outline: 'none',
    fontFamily: 'Inter, system-ui, sans-serif',
  }

  return (
    <div style={{ minHeight: '100vh', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontFamily: 'Space Mono, monospace', letterSpacing: '0.15em', textTransform: 'uppercase', color: accent, marginBottom: 6 }}>
            ESP Dashboard
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: text, margin: 0 }}>
            Set a new password
          </h1>
        </div>

        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14 }}>
          {!ready ? (
            <div style={{ padding: 32, textAlign: 'center', color: muted, fontSize: 13 }}>
              This page only works from the link in your password reset email.
              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => router.replace('/login')}
                  style={{ background: 'transparent', border: 'none', color: accent, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Back to sign in
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontFamily: 'Space Mono, monospace', letterSpacing: '0.08em', textTransform: 'uppercase', color: muted, marginBottom: 6 }}>
                  New password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontFamily: 'Space Mono, monospace', letterSpacing: '0.08em', textTransform: 'uppercase', color: muted, marginBottom: 6 }}>
                  Confirm password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {error && (
                <div style={{ fontSize: 12, color: dangerColor, padding: '8px 10px', borderRadius: 6, background: isLight ? 'rgba(220,38,38,0.08)' : 'rgba(255,71,87,0.08)' }}>
                  {error}
                </div>
              )}
              {info && (
                <div style={{ fontSize: 12, color: infoColor, padding: '8px 10px', borderRadius: 6, background: isLight ? 'rgba(3,105,161,0.08)' : 'rgba(125,211,252,0.08)' }}>
                  {info}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  marginTop: 4, padding: '12px 16px', borderRadius: 8,
                  background: accent, color: accentText, border: 'none',
                  fontSize: 12, fontFamily: 'Space Mono, monospace', fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  cursor: submitting ? 'wait' : 'pointer',
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? 'Saving…' : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
