'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Session, User } from '@supabase/supabase-js'

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out'

export interface AuthState {
  status: AuthStatus
  session: Session | null
  user: User | null
}

export function useSession(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading', session: null, user: null })

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      const session = data.session
      setState({
        status: session ? 'signed-in' : 'signed-out',
        session,
        user: session?.user ?? null,
      })
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      setState({
        status: session ? 'signed-in' : 'signed-out',
        session,
        user: session?.user ?? null,
      })
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return state
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signUp(email: string, password: string) {
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/` : undefined
  return supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } })
}

export async function signOut() {
  return supabase.auth.signOut()
}

export async function requestPasswordReset(email: string) {
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined
  return supabase.auth.resetPasswordForEmail(email, { redirectTo })
}

export async function updatePassword(password: string) {
  return supabase.auth.updateUser({ password })
}
