'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/auth'
import { useDashboardStore } from '@/lib/store'

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useSession()
  const { isLight } = useDashboardStore()
  const router = useRouter()

  useEffect(() => {
    if (status === 'signed-out') router.replace('/login')
  }, [status, router])

  if (status === 'loading' || status === 'signed-out') {
    return (
      <div
        style={{
          position: 'fixed', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isLight ? '#ffffff' : '#0a0d12',
          color: isLight ? '#475569' : '#a8b0be',
          fontFamily: 'Space Mono, monospace', fontSize: 12, letterSpacing: '0.08em',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 12, height: 12, borderRadius: '50%',
              border: `2px solid ${isLight ? '#0d9488' : '#00e5c3'}`,
              borderTopColor: 'transparent',
              animation: 'authgate-spin 0.8s linear infinite',
              display: 'inline-block',
            }}
          />
          <span style={{ textTransform: 'uppercase' }}>
            {status === 'loading' ? 'Checking session…' : 'Redirecting…'}
          </span>
        </div>
        <style>{`@keyframes authgate-spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return <>{children}</>
}
