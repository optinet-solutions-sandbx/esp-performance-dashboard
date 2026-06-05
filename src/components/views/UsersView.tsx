'use client'
import { useEffect, useState } from 'react'
import { useDashboardStore } from '@/lib/store'
import {
  useProfile,
  listPendingProfiles,
  listApprovedProfiles,
  approveUser,
  rejectUser,
  deleteUser,
  setUserAdmin,
} from '@/lib/profile'
import type { Profile } from '@/lib/types'

export default function UsersView() {
  const { isLight } = useDashboardStore()
  const { profile } = useProfile()
  const isAdmin = profile?.is_admin === true

  const [pending, setPending] = useState<Profile[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingBusyId, setPendingBusyId] = useState<string | null>(null)

  const [approved, setApproved] = useState<Profile[]>([])
  const [approvedLoading, setApprovedLoading] = useState(false)
  const [approvedBusyId, setApprovedBusyId] = useState<string | null>(null)
  const [adminBusyId, setAdminBusyId] = useState<string | null>(null)

  async function refreshPending() {
    if (!isAdmin) return
    setPendingLoading(true)
    const rows = await listPendingProfiles()
    setPending(rows)
    setPendingLoading(false)
  }

  async function refreshApproved() {
    if (!isAdmin) return
    setApprovedLoading(true)
    const rows = await listApprovedProfiles()
    setApproved(rows)
    setApprovedLoading(false)
  }

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- intentional: load admin user lists (or clear them) whenever isAdmin changes; async hydration on auth-state change, not cascading render */
    if (isAdmin) {
      refreshPending()
      refreshApproved()
    } else {
      setPending([])
      setApproved([])
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  async function handleApprove(userId: string) {
    setPendingBusyId(userId)
    const { error } = await approveUser(userId)
    setPendingBusyId(null)
    if (error) { alert(`Approve failed: ${error.message}`); return }
    setPending(p => p.filter(r => r.id !== userId))
    refreshApproved()
  }

  async function handleReject(userId: string, email: string) {
    if (!confirm(`Reject and delete ${email}? This cannot be undone.`)) return
    setPendingBusyId(userId)
    const { error } = await rejectUser(userId)
    setPendingBusyId(null)
    if (error) { alert(`Reject failed: ${error.message}`); return }
    setPending(p => p.filter(r => r.id !== userId))
  }

  async function handleDelete(userId: string, email: string) {
    if (userId === profile?.id) {
      alert("You can't delete your own account.")
      return
    }
    if (!confirm(`Delete ${email}? This will permanently remove their account and cannot be undone.`)) return
    setApprovedBusyId(userId)
    const { error } = await deleteUser(userId)
    setApprovedBusyId(null)
    if (error) { alert(`Delete failed: ${error.message}`); return }
    setApproved(p => p.filter(r => r.id !== userId))
  }

  async function handleToggleAdmin(userId: string, email: string, current: boolean) {
    if (userId === profile?.id && current) {
      alert("You can't remove your own admin privileges.")
      return
    }
    const next = !current
    const verb = next ? 'Promote' : 'Demote'
    const detail = next
      ? `${email} will gain full admin access (manage users, approve sign-ups, delete data).`
      : `${email} will lose admin access.`
    if (!confirm(`${verb} ${email}?\n\n${detail}`)) return
    setAdminBusyId(userId)
    const { error } = await setUserAdmin(userId, next)
    setAdminBusyId(null)
    if (error) { alert(`${verb} failed: ${error.message}`); return }
    setApproved(p => p.map(r => r.id === userId ? { ...r, is_admin: next } : r))
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className={`rounded-xl border p-8 text-center ${isLight ? 'bg-white border-black/[0.10]' : 'bg-[#111418] border-white/7'}`}>
          <div className={`text-sm font-semibold mb-1 ${isLight ? 'text-gray-900' : 'text-[#f0f2f5]'}`}>
            Admins only
          </div>
          <div className={`text-xs ${isLight ? 'text-gray-500' : 'text-[#a8b0be]'}`}>
            This page is restricted to administrators.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className={`text-2xl font-bold tracking-tight ${isLight ? 'text-gray-900' : 'text-[#f0f2f5]'}`}>
          Users
        </h1>
        <p className={`text-sm mt-1 ${isLight ? 'text-gray-500' : 'text-[#a8b0be]'}`}>
          Approve sign-ups, manage admin access, and remove accounts.
        </p>
      </div>

      {/* Approved Users */}
      <div className={`rounded-xl border overflow-hidden ${isLight ? 'bg-white border-black/[0.10] shadow-sm' : 'bg-[#111418] border-white/7'}`}>
        <div className={`px-5 py-4 border-b ${isLight ? 'border-black/[0.08]' : 'border-white/7'}`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`text-base font-semibold ${isLight ? 'text-gray-900' : 'text-[#f0f2f5]'}`}>
                Approved Users
                {approved.length > 0 && (
                  <span className={`ml-2 text-xs font-mono ${isLight ? 'text-gray-500' : 'text-[#a8b0be]'}`}>
                    {approved.length}
                  </span>
                )}
              </h2>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-gray-500' : 'text-[#a8b0be]'}`}>
                Accounts with dashboard access. Promote a user to grant admin privileges, or delete to remove permanently.
              </p>
            </div>
            <button
              onClick={refreshApproved}
              disabled={approvedLoading}
              className={`px-3 py-1.5 rounded-lg border text-[11px] font-mono uppercase tracking-wider transition-all
                ${isLight ? 'border-black/[0.15] text-gray-600 hover:border-black/[0.30]' : 'border-white/13 text-[#a8b0be] hover:border-white/25'}
                ${approvedLoading ? 'opacity-50 cursor-wait' : ''}`}
            >
              {approvedLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
        {approved.length === 0 ? (
          <div className={`px-5 py-6 text-sm text-center ${isLight ? 'text-gray-400' : 'text-[#a8b0be]'}`}>
            {approvedLoading ? 'Loading…' : 'No approved users.'}
          </div>
        ) : (
          <div>
            {approved.map(u => {
              const busyDelete = approvedBusyId === u.id
              const busyAdmin = adminBusyId === u.id
              const busy = busyDelete || busyAdmin
              const isSelf = u.id === profile?.id
              const canToggleAdmin = !isSelf || !u.is_admin
              return (
                <div
                  key={u.id}
                  className={`flex items-center justify-between px-5 py-3 border-b last:border-0 ${isLight ? 'border-black/[0.06]' : 'border-white/5'}`}
                >
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${isLight ? 'text-gray-900' : 'text-[#f0f2f5]'}`}>{u.email}</span>
                      {u.is_admin && (
                        <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${isLight ? 'bg-[#0d9488]/10 text-[#0d9488]' : 'bg-[#00e5c3]/10 text-[#00e5c3]'}`}>
                          Admin
                        </span>
                      )}
                      {isSelf && (
                        <span className={`text-[10px] font-mono uppercase tracking-wider ${isLight ? 'text-gray-400' : 'text-[#7a8294]'}`}>
                          (you)
                        </span>
                      )}
                    </div>
                    <span className={`text-[11px] mt-0.5 ${isLight ? 'text-gray-400' : 'text-[#7a8294]'}`}>
                      {u.approved_at
                        ? `Approved ${new Date(u.approved_at).toLocaleString()}`
                        : `Signed up ${new Date(u.created_at).toLocaleString()}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleAdmin(u.id, u.email, u.is_admin)}
                      disabled={busy || !canToggleAdmin}
                      title={
                        !canToggleAdmin
                          ? "You can't remove your own admin privileges"
                          : u.is_admin ? `Remove admin access from ${u.email}` : `Promote ${u.email} to admin`
                      }
                      className={`px-3 py-1.5 rounded-lg border text-[11px] font-mono uppercase tracking-wider transition-all
                        ${u.is_admin
                          ? (isLight ? 'border-[#b45309]/40 text-[#b45309] hover:bg-[#b45309]/[0.08]' : 'border-[#ffd166]/40 text-[#ffd166] hover:bg-[#ffd166]/10')
                          : (isLight ? 'border-[#0d9488]/40 text-[#0d9488] hover:bg-[#0d9488]/[0.08]' : 'border-[#00e5c3]/40 text-[#00e5c3] hover:bg-[#00e5c3]/10')
                        }
                        ${(busy || !canToggleAdmin) ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      {busyAdmin ? 'Saving…' : (u.is_admin ? 'Remove Admin' : 'Make Admin')}
                    </button>
                    <button
                      onClick={() => handleDelete(u.id, u.email)}
                      disabled={busy || isSelf}
                      title={isSelf ? "You can't delete your own account" : `Delete ${u.email}`}
                      className={`px-3 py-1.5 rounded-lg border text-[11px] font-mono uppercase tracking-wider transition-all
                        ${isLight ? 'border-[#dc2626]/40 text-[#dc2626] hover:bg-[#dc2626]/[0.08]' : 'border-[#ff4757]/40 text-[#ff4757] hover:bg-[#ff4757]/10'}
                        ${(busy || isSelf) ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      {busyDelete ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pending Sign-ups */}
      <div className={`rounded-xl border overflow-hidden ${isLight ? 'bg-white border-black/[0.10] shadow-sm' : 'bg-[#111418] border-white/7'}`}>
        <div className={`px-5 py-4 border-b ${isLight ? 'border-black/[0.08]' : 'border-white/7'}`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`text-base font-semibold ${isLight ? 'text-gray-900' : 'text-[#f0f2f5]'}`}>
                Pending Sign-ups
                {pending.length > 0 && (
                  <span className={`ml-2 text-xs font-mono ${isLight ? 'text-[#b45309]' : 'text-[#ffd166]'}`}>
                    {pending.length}
                  </span>
                )}
              </h2>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-gray-500' : 'text-[#a8b0be]'}`}>
                Approve or reject new accounts. Rejected accounts are deleted permanently.
              </p>
            </div>
            <button
              onClick={refreshPending}
              disabled={pendingLoading}
              className={`px-3 py-1.5 rounded-lg border text-[11px] font-mono uppercase tracking-wider transition-all
                ${isLight ? 'border-black/[0.15] text-gray-600 hover:border-black/[0.30]' : 'border-white/13 text-[#a8b0be] hover:border-white/25'}
                ${pendingLoading ? 'opacity-50 cursor-wait' : ''}`}
            >
              {pendingLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
        {pending.length === 0 ? (
          <div className={`px-5 py-6 text-sm text-center ${isLight ? 'text-gray-400' : 'text-[#a8b0be]'}`}>
            {pendingLoading ? 'Loading…' : 'No pending sign-ups.'}
          </div>
        ) : (
          <div>
            {pending.map(p => {
              const busy = pendingBusyId === p.id
              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between px-5 py-3 border-b last:border-0 ${isLight ? 'border-black/[0.06]' : 'border-white/5'}`}
                >
                  <div className="flex flex-col">
                    <span className={`text-sm ${isLight ? 'text-gray-900' : 'text-[#f0f2f5]'}`}>{p.email}</span>
                    <span className={`text-[11px] mt-0.5 ${isLight ? 'text-gray-400' : 'text-[#7a8294]'}`}>
                      Signed up {new Date(p.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApprove(p.id)}
                      disabled={busy}
                      className={`px-3 py-1.5 rounded-lg border text-[11px] font-mono uppercase tracking-wider transition-all
                        ${isLight ? 'border-[#0d9488]/40 text-[#0d9488] hover:bg-[#0d9488]/[0.08]' : 'border-[#00e5c3]/40 text-[#00e5c3] hover:bg-[#00e5c3]/10'}
                        ${busy ? 'opacity-50 cursor-wait' : ''}`}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(p.id, p.email)}
                      disabled={busy}
                      className={`px-3 py-1.5 rounded-lg border text-[11px] font-mono uppercase tracking-wider transition-all
                        ${isLight ? 'border-[#dc2626]/40 text-[#dc2626] hover:bg-[#dc2626]/[0.08]' : 'border-[#ff4757]/40 text-[#ff4757] hover:bg-[#ff4757]/10'}
                        ${busy ? 'opacity-50 cursor-wait' : ''}`}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
