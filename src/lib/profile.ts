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

export async function listApprovedProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('status', 'approved')
    .order('approved_at', { ascending: false, nullsFirst: false })
  if (error) {
    console.error('listApprovedProfiles failed:', error)
    return []
  }
  return (data as Profile[]) ?? []
}

export async function approveUser(userId: string) {
  // RPC auto-confirms email at the auth layer + approves at the app layer in one transaction.
  return supabase.rpc('admin_approve_user', { target_user_id: userId })
}

export async function rejectUser(userId: string) {
  return supabase.rpc('admin_delete_user', { target_user_id: userId })
}

export async function deleteUser(userId: string) {
  return supabase.rpc('admin_delete_user', { target_user_id: userId })
}

export async function setUserAdmin(userId: string, value: boolean) {
  return supabase.rpc('admin_set_admin', { target_user_id: userId, value })
}
