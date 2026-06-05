'use client'
import React, { useState, useEffect } from 'react'
import { useDashboardStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import { buildProviderDomains, syncEspFromData, overwriteMmData, isValidIsoDate } from '@/lib/utils'
import { ESP_COLORS, INITIAL_MM_DATA, normalizeEspName } from '@/lib/data'
import type { MmData } from '@/lib/types'
import Sidebar from '@/components/layout/Sidebar'
import AuthGate from '@/components/ui/AuthGate'
import HomeView from '@/components/views/HomeView'
import DashboardView from '@/components/views/DashboardView'
import MailmodoView from '@/components/views/MailmodoView'
import MailgunView from '@/components/views/MailgunView'
import UploadView from '@/components/views/UploadView'
import MatrixView from '@/components/views/MatrixView'
import DataMgmtView from '@/components/views/DataMgmtView'
import IPMatrixView from '@/components/views/IPMatrixView'
import PerformanceView from '@/components/views/PerformanceView'
import DailyView from '@/components/views/DailyView'
import LogsView from '@/components/views/LogsView'
import AnalyticsView from '@/components/views/AnalyticsView'
import KenscioView from '@/components/views/KenscioView'
import ThrottlingMatrixView from '@/components/views/ThrottlingMatrixView'
import RegFtdsView from '@/components/views/RegFtdsView'
import UsersView from '@/components/views/UsersView'

const VIEW_LABELS: Record<string, string> = {
  home: 'Overview', dashboard: 'Dashboard', mailmodo: 'Mailmodo Review',
  mailgun: 'Mailgun Review', netcore: 'Netcore Review', mms: 'MMS Review', hotsol: 'Hotsol Review', '171mailsapp': '171 MailsApp Review', upload: 'Upload Report',
  throttling: 'Throttling Matrix', regftds: 'Reg & FTDs', matrix: 'ESP Deliverability Matrix', datamgmt: 'Data Management',
  ipmatrix: 'IPs Matrix', performance: 'Performance',
  logs: 'Activity Logs', daily: 'Daily Report',
  analytics: 'Analytics', moosend: 'Moosend Review', kenscio: 'Kenscio Review',
  mailjet: 'Mailjet Review', elastic: 'Elastic Review', inboxroad: 'Inboxroad Review', users: 'Users',
}

export default function Page() {
  const { activeView, isLight, setEspData, setEsps, esps, setIpmData, setDmData, setHiddenEsps, setThrottleData, setRegFtdsDaily } = useDashboardStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const sidebarWidth = sidebarCollapsed ? 60 : 240
  const [dbLoaded, setDbLoaded] = useState(false)
  const [mountedViews, setMountedViews] = useState<Set<string>>(new Set([activeView]))

  useEffect(() => {
    async function loadFromDB() {
      try {
        const { data: rows } = await supabase
          .from('uploads')
          .select('esp, solo_data')
          .order('uploaded_at', { ascending: true })

        if (rows?.length) {
          // Group uploads by ESP name and merge per-ESP
          const byEsp: Record<string, MmData[]> = {}
          for (const row of rows) {
            if (!row.esp || !row.solo_data) continue
            if (!byEsp[row.esp]) byEsp[row.esp] = []
            byEsp[row.esp].push(row.solo_data as MmData)
          }

          const newEsps = [...esps]
          for (const [espName, uploads] of Object.entries(byEsp)) {
            let merged = INITIAL_MM_DATA as MmData
            for (const data of uploads) {
              merged = overwriteMmData(merged, data)
            }
            // providerDomains already merged by overwriteMmData from solo_data
            setEspData(espName, merged)

            const existing = newEsps.find(e => e.name === espName)
            const base = existing ?? {
              name: espName,
              color: ESP_COLORS[espName] ?? '#a8b0be',
              sent: 0, delivered: 0, opens: 0, clicks: 0, bounced: 0, unsub: 0,
              deliveryRate: 0, openRate: 0, clickRate: 0, bounceRate: 0, unsubRate: 0,
              status: 'healthy' as const,
            }
            const updated = syncEspFromData(base, merged)
            if (existing) {
              newEsps[newEsps.findIndex(e => e.name === espName)] = updated
            } else {
              newEsps.push(updated)
            }
          }

          if (newEsps.length) setEsps(newEsps)
        }

        // Load IP Matrix data
        const { data: ipmRows } = await supabase
          .from('ip_matrix')
          .select('id, esp, ip, domain, upload_id, registrations, ftds')
          .order('created_at', { ascending: true })
        if (ipmRows?.length) {
          setIpmData(ipmRows.map(r => ({ id: r.id, upload_id: r.upload_id, esp: r.esp, ip: r.ip, domain: r.domain ?? '', registrations: r.registrations ?? undefined, ftds: r.ftds ?? undefined })))
        }

        // Load Data Management data
        const { data: dmRows } = await supabase
          .from('data_management')
          .select('raw_data')
          .order('created_at', { ascending: true })
        if (dmRows?.length) {
          setDmData(dmRows.map(r => r.raw_data))
        }

        // Load Throttle Matrix data (source of truth is Supabase, not localStorage)
        const { data: throttleRows } = await supabase
          .from('throttle_matrix')
          .select('esp, ip, from_domain, gmail, hotmail, outlook, yahoo, icloud, aol, live, gmx, web, others')
          .order('created_at', { ascending: true })
        function parseThrottleVal(v: string | null): number | 'TBC' {
          if (!v || v.toUpperCase() === 'TBC') return 'TBC'
          const n = Number(v)
          return isNaN(n) ? 0 : n
        }
        setThrottleData((throttleRows ?? []).map(r => ({
          esp: r.esp ?? '',
          ip: r.ip ?? '',
          fromDomain: r.from_domain ?? '',
          gmail:   parseThrottleVal(r.gmail),
          hotmail: parseThrottleVal(r.hotmail),
          outlook: parseThrottleVal(r.outlook),
          yahoo:   parseThrottleVal(r.yahoo),
          icloud:  parseThrottleVal(r.icloud),
          aol:     parseThrottleVal(r.aol),
          live:    parseThrottleVal(r.live),
          gmx:     parseThrottleVal(r.gmx),
          web:     parseThrottleVal(r.web),
          others:  parseThrottleVal(r.others),
        })))

        // Load Reg & FTDs daily data
        const { data: rfRows } = await supabase
          .from('reg_ftds_daily')
          .select('id, date, esp, ip, registrations, ftds')
          .order('date', { ascending: true })
        if (rfRows?.length) {
          setRegFtdsDaily(rfRows.filter(r => isValidIsoDate(r.date)).map(r => ({
            id: r.id, date: r.date, esp: normalizeEspName(r.esp), ip: r.ip,
            registrations: r.registrations ?? 0, ftds: r.ftds ?? 0,
          })))
        }

        // Load ESP visibility
        const { data: visRows } = await supabase
          .from('esp_visibility')
          .select('esp')
          .eq('hidden', true)
        setHiddenEsps(visRows?.map(r => r.esp) ?? [])
      } catch (err) {
        console.error('Failed to load from Supabase:', err)
      } finally {
        setDbLoaded(true)
      }
    }
    loadFromDB()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    document.body.classList.toggle('light', isLight)
  }, [isLight])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: close sidebar and track mounted views on route/view change, not derivable from render
    setSidebarOpen(false)
    setMountedViews(prev => { prev.add(activeView); return new Set(prev) })
  }, [activeView])

  const bg = isLight ? '#f0f2f6' : '#0a0c10'

  if (!dbLoaded) {
    return (
      <AuthGate>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', background: bg,
          flexDirection: 'column', gap: 16,
        }}>
          <div style={{
            width: 40, height: 40, border: '3px solid rgba(0,229,195,0.2)',
            borderTopColor: isLight ? '#006a5b' : '#00e5c3', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <div style={{ fontSize: 13, color: '#5a6478', fontFamily: 'Space Mono, monospace' }}>
            Loading from database…
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </AuthGate>
    )
  }

  return (
    <AuthGate>
    <div style={{ display: 'flex', minHeight: '100vh', background: bg }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(0,0,0,0.6)' }}
          className="lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar wrapper — drawer on mobile */}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 40,
        width: 240, transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
      }} className="sidebar-wrapper lg:hidden">
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Desktop sidebar — collapsible */}
      <div style={{ width: sidebarWidth, flexShrink: 0, transition: 'width 0.2s ease' }} className="hidden lg:block">
        <div style={{ position: 'sticky', top: 0, height: '100vh' }}>
          <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(c => !c)} />
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Top bar — always visible, toggles sidebar */}
        <header
          style={{
            position: 'sticky', top: 0, zIndex: 20,
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '0 16px', height: 48,
            background: isLight ? 'rgba(255,255,255,0.92)' : 'rgba(17,20,24,0.92)',
            borderBottom: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.06)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <button
            onClick={() => {
              // On mobile (< lg), open the drawer; on desktop, toggle collapse
              if (window.innerWidth < 1024) setSidebarOpen(true)
              else setSidebarCollapsed(c => !c)
            }}
            style={{
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer',
              color: isLight ? '#374151' : '#a8b0be',
            }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
              style={{ transition: 'transform 0.2s', transform: sidebarCollapsed ? 'rotate(180deg)' : 'none' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div style={{ fontSize: 8, fontFamily: 'Space Mono, monospace', letterSpacing: '0.18em', textTransform: 'uppercase', color: isLight ? '#9ca3af' : '#4a5568' }}>
              Email Ops
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: isLight ? '#111827' : '#f0f2f5', lineHeight: 1 }}>
              {VIEW_LABELS[activeView] ?? 'ESP Control'}
            </div>
          </div>
        </header>

        {/* View — keep-alive: mount once, hide with display:none when inactive */}
        <main style={{ flex: 1, overflowY: 'auto', background: bg }}>
          {([
            ['home',        <HomeView key="home" />],
            ['dashboard',   <DashboardView key="dashboard" />],
            ['mailmodo',    <MailmodoView key="mailmodo" filter="mailmodo" />],
            ['mailgun',     <MailgunView key="mailgun" />],
            ['netcore',     <MailmodoView key="netcore" filter="netcore" />],
            ['mms',         <MailmodoView key="mms" filter="mms" />],
            ['hotsol',      <MailmodoView key="hotsol" filter="hotsol" />],
            ['171mailsapp', <MailmodoView key="171mailsapp" filter="171mailsapp" />],
            ['moosend',     <MailmodoView key="moosend" filter="moosend" />],
            ['kenscio',     <KenscioView key="kenscio" />],
            ['mailjet',     <MailmodoView key="mailjet" filter="mailjet" />],
            ['elastic',     <MailmodoView key="elastic" filter="elastic" />],
            ['inboxroad',   <MailmodoView key="inboxroad" filter="inboxroad" />],
            ['upload',      <UploadView key="upload" />],
            ['throttling',  <ThrottlingMatrixView key="throttling" />],
            ['regftds',     <RegFtdsView key="regftds" />],
            ['matrix',      <MatrixView key="matrix" />],
            ['datamgmt',    <DataMgmtView key="datamgmt" />],
            ['ipmatrix',    <IPMatrixView key="ipmatrix" />],
            ['performance', <PerformanceView key="performance" />],
            ['daily',       <DailyView key="daily" />],
            ['logs',        <LogsView key="logs" />],
            ['analytics',   <AnalyticsView key="analytics" />],
            ['users',       <UsersView key="users" />],
          ] as [string, React.ReactNode][]).map(([id, node]) =>
            mountedViews.has(id) ? (
              <div key={id} style={{ display: activeView === id ? 'contents' : 'none' }}>
                {node}
              </div>
            ) : null
          )}
        </main>
      </div>
    </div>
    </AuthGate>
  )
}
