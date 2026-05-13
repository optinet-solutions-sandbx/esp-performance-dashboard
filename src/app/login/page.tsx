'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signIn, signUp, signOut, requestPasswordReset } from '@/lib/auth'
import { fetchProfile } from '@/lib/profile'
import { useDashboardStore } from '@/lib/store'

type Mode = 'signin' | 'signup' | 'forgot'

export default function LoginPage() {
  const { isLight } = useDashboardStore()
  const { status } = useSession()
  const router = useRouter()

  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    if (status === 'signed-in') router.replace('/')
  }, [status, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setSubmitting(true)
    try {
      if (mode === 'signin') {
        const { error, data } = await signIn(email, password)
        if (error) {
          setError(error.message)
        } else if (data.user) {
          const profile = await fetchProfile(data.user.id)
          if (!profile || profile.status === 'pending') {
            await signOut()
            setError('Your account is awaiting admin approval. Try again once it has been approved.')
          } else {
            router.replace('/')
          }
        }
      } else if (mode === 'signup') {
        const { error, data } = await signUp(email, password)
        if (error) {
          setError(error.message)
        } else if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setError('This email is already registered. Try signing in instead.')
        } else {
          // Trigger creates a pending profile. Sign out the auto-created session.
          await signOut()
          setInfo('Account created. An admin will review and approve your account before you can sign in.')
        }
      } else {
        const { error } = await requestPasswordReset(email)
        if (error) {
          setError(error.message)
        } else {
          setInfo('Password reset link sent. Check your inbox.')
        }
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

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '10px 0',
    fontSize: 11,
    fontFamily: 'Space Mono, monospace',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: active ? accent : muted,
    borderBottom: `2px solid ${active ? accent : 'transparent'}`,
    transition: 'color 0.15s, border-color 0.15s',
  })

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
            {mode === 'forgot' ? 'Reset your password' : 'Welcome back'}
          </h1>
        </div>

        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, overflow: 'hidden' }}>
          {mode !== 'forgot' && (
            <div style={{ display: 'flex', borderBottom: `1px solid ${border}` }}>
              <button type="button" style={tabStyle(mode === 'signin')} onClick={() => { setMode('signin'); setError(''); setInfo('') }}>
                Sign in
              </button>
              <button type="button" style={tabStyle(mode === 'signup')} onClick={() => { setMode('signup'); setError(''); setInfo('') }}>
                Sign up
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontFamily: 'Space Mono, monospace', letterSpacing: '0.08em', textTransform: 'uppercase', color: muted, marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={inputStyle}
              />
            </div>

            {mode !== 'forgot' && (
              <div>
                <label style={{ display: 'block', fontSize: 11, fontFamily: 'Space Mono, monospace', letterSpacing: '0.08em', textTransform: 'uppercase', color: muted, marginBottom: 6 }}>
                  Password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}

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
                marginTop: 4,
                padding: '12px 16px',
                borderRadius: 8,
                background: accent,
                color: accentText,
                border: 'none',
                fontSize: 12,
                fontFamily: 'Space Mono, monospace',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: submitting ? 'wait' : 'pointer',
                opacity: submitting ? 0.6 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {submitting
                ? 'Working…'
                : mode === 'signin'
                  ? 'Sign in'
                  : mode === 'signup'
                    ? 'Create account'
                    : 'Send reset link'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError(''); setInfo('') }}
                  style={{ background: 'transparent', border: 'none', color: muted, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Forgot password?
                </button>
              )}
              {mode === 'forgot' && (
                <button
                  type="button"
                  onClick={() => { setMode('signin'); setError(''); setInfo('') }}
                  style={{ background: 'transparent', border: 'none', color: muted, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Back to sign in
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
