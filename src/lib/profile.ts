'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/lib/auth'
import type { Profile } from '@/lib/types'

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.error('fetchProfile failed:', error)
    return null
  }
  return (data as Profile | null) ?? null
}

export function useProfile() {
  const { user } = useSession()
  const userId = user?.id ?? null
  const [cache, setCache] = useState<Record<string, Profile | null>>({})
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchProfile(userId).then(p => {
      if (cancelled) return
      setCache(prev => ({ ...prev, [userId]: p }))
    })
    return () => { cancelled = true }
  }, [userId, refreshKey])

  const profile = userId ? cache[userId] ?? null : null
  const loading = userId !== null && !(userId in cache)
  const refresh = useCallback(() => { setRefreshKey(k => k + 1) }, [])

  return { profile, loading, refresh }
}

export async function listPendingProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('listPendingProfiles failed:', error)
    return []
  }
  return (data as Profile[]) ?? []
}

export async function approveUser(userId: string) {
  const { data: { user: me } } = await supabase.auth.getUser()
  return supabase
    .from('profiles')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: me?.id ?? null,
    })
    .eq('id', userId)
}

export async function rejectUser(userId: string) {
  return supabase.rpc('admin_delete_user', { target_user_id: userId })
}
