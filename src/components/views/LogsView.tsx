'use client'
import { useState, useEffect } from 'react'
import { useDashboardStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import type { LogEntry } from '@/lib/types'
import CustomSelect from '@/components/ui/CustomSelect'

const FILTER_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'upload', label: 'Uploads' },
  { value: 'download', label: 'Downloads' },
  { value: 'delete', label: 'Deletes' },
]

export default function LogsView() {
  const { isLight } = useDashboardStore()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filterAction, setFilterAction] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchLogs() }, [])

  async function fetchLogs() {
    setLoading(true)
    const { data } = await supabase
      .from('logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    if (data) setLogs(data)
    setLoading(false)
  }

  const filtered = filterAction ? logs.filter(l => l.action === filterAction) : logs

  const txt = isLight ? 'text-gray-900' : 'text-[#f0f2f5]'
  const muted = isLight ? 'text-gray-400' : 'text-[#6b7280]'
  const surface = isLight ? 'bg-white border-black/10' : 'bg-[#111418] border-white/7'

  const actionBadge = (action: string) => {
    const colors: Record<string, string> = {
      upload: isLight ? 'bg-[#00e5c3]/15 text-[#047857]' : 'bg-[#00e5c3]/15 text-[#00e5c3]',
      download: isLight ? 'bg-[#7c5cfc]/15 text-[#5b21b6]' : 'bg-[#7c5cfc]/15 text-[#7c5cfc]',
      delete: isLight ? 'bg-[#ff4757]/15 text-[#991b1b]' : 'bg-[#ff4757]/15 text-[#ff4757]',
    }
    return `inline-block px-2 py-0.5 rounded text-[11px] font-mono font-bold uppercase ${colors[action] || ''}`
  }

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  }

  return (
    <div className="p-6" style={{ maxWidth: 900 }}>
      <div className="mb-5">
        <h1 className={`text-2xl font-bold tracking-tight ${txt}`}>Activity Logs</h1>
        <p className={`text-sm mt-1 ${muted}`}>Upload, download, and delete history</p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <CustomSelect
          value={filterAction}
          onChange={setFilterAction}
          options={FILTER_OPTIONS}
          isLight={isLight}
          minWidth={140}
        />
        <span className={`text-[11px] font-mono ${muted}`}>{filtered.length} entries</span>
      </div>

      {loading ? (
        <div className={`rounded-xl border p-12 text-center ${surface}`}>
          <div className={`text-sm ${muted}`}>Loading logs...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className={`rounded-xl border p-12 text-center ${surface}`}>
          <div className="text-3xl mb-3">📋</div>
          <div className={`text-sm ${muted}`}>No activity logs yet</div>
        </div>
      ) : (
        <div className={`rounded-xl border overflow-hidden ${surface}`}>
          <table className="w-full border-collapse text-xs font-mono">
            <thead className={isLight ? 'bg-gray-50' : 'bg-[#181c22]'}>
              <tr>
                <th className={`px-4 py-3 text-left text-[11px] tracking-wider uppercase border-b ${isLight ? 'border-black/8 text-gray-700' : 'border-white/7 text-[#d4dae6]'}`}>Time</th>
                <th className={`px-4 py-3 text-left text-[11px] tracking-wider uppercase border-b ${isLight ? 'border-black/8 text-gray-700' : 'border-white/7 text-[#d4dae6]'}`}>User</th>
                <th className={`px-4 py-3 text-left text-[11px] tracking-wider uppercase border-b ${isLight ? 'border-black/8 text-gray-700' : 'border-white/7 text-[#d4dae6]'}`}>Action</th>
                <th className={`px-4 py-3 text-left text-[11px] tracking-wider uppercase border-b ${isLight ? 'border-black/8 text-gray-700' : 'border-white/7 text-[#d4dae6]'}`}>Target</th>
                <th className={`px-4 py-3 text-left text-[11px] tracking-wider uppercase border-b ${isLight ? 'border-black/8 text-gray-700' : 'border-white/7 text-[#d4dae6]'}`}>Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(log => (
                <tr key={log.id} className={`border-b last:border-0 ${isLight ? 'border-black/7 hover:bg-black/2' : 'border-white/5 hover:bg-white/2'}`}>
                  <td className={`px-4 py-2.5 whitespace-nowrap ${muted}`}>{fmtTime(log.created_at)}</td>
                  <td className={`px-4 py-2.5 whitespace-nowrap ${log.user_email ? txt : muted}`}>
                    {log.user_email || <span className="italic">system</span>}
                  </td>
                  <td className="px-4 py-2.5"><span className={actionBadge(log.action)}>{log.action}</span></td>
                  <td className={`px-4 py-2.5 ${txt}`}>{log.target}</td>
                  <td className={`px-4 py-2.5 ${muted}`}>{log.details || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
