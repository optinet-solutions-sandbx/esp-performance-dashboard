'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EspRecord, MmData, IpmRecord, DmRecord, UploadHistoryEntry, ViewName, MmTabType, EspStatus, ThrottleRecord, DateFilter, RegFtdsDailyRecord } from './types'
import { INITIAL_ESPS, INITIAL_IPM_DATA } from './data'
import { supabase } from './supabase'

interface DashboardState {
  // Theme
  isLight: boolean
  toggleTheme: () => void

  // Navigation
  activeView: ViewName
  setView: (v: ViewName) => void

  // Dashboard filters
  activeFilter: EspStatus | 'all'
  activeEsp: string | null
  sortKey: string | null
  sortDir: number
  searchQ: string
  setFilter: (f: EspStatus | 'all') => void
  setActiveEsp: (name: string | null) => void
  setSort: (key: string) => void
  setSearch: (q: string) => void

  // ESP records
  esps: EspRecord[]
  setEsps: (esps: EspRecord[]) => void

  // Per-ESP data store
  espData: Record<string, MmData>
  espRanges: Record<string, { fromIdx: number; toIdx: number }>
  setEspData: (name: string, data: MmData) => void
  setEspRange: (name: string, from: number, to: number) => void

  // Which ESP to show when navigating to review views
  reviewEsp: string
  setReviewEsp: (esp: string) => void

  // Shared review UI state (tab + selected row for detail views)
  mmTab: MmTabType
  mmSelectedRow: string | null
  setMmTab: (tab: MmTabType) => void
  setMmSelectedRow: (row: string | null) => void

  // Upload
  uploadHistory: UploadHistoryEntry[]
  addUploadHistory: (entry: UploadHistoryEntry) => void

  // IP Matrix
  ipmData: IpmRecord[]
  setIpmData: (data: IpmRecord[]) => void
  addIpmRecord: (rec: IpmRecord) => void
  deleteIpmRecord: (idx: number) => void
  updateIpmRecord: (idx: number, rec: IpmRecord) => void

  // Data Management
  dmData: DmRecord[]
  setDmData: (data: DmRecord[]) => void

  // Throttle Matrix
  throttleData:    ThrottleRecord[]
  setThrottleData: (data: ThrottleRecord[]) => void

  // ESP Visibility (synced from Supabase esp_visibility table)
  hiddenEsps: string[]
  setHiddenEsps: (names: string[]) => void
  toggleEspVisibility: (name: string) => Promise<void>

  // IP Matrix record visibility (per-row, persisted to localStorage)
  hiddenIpmIds: string[]
  setHiddenIpmIds: (ids: string[]) => void
  toggleIpmRecordVisibility: (id: string) => void

  // Persisted date-picker filters keyed by view (and ESP where applicable)
  dateFilters: Record<string, DateFilter>
  setDateFilter: (key: string, patch: Partial<DateFilter>) => void

  // Reg & FTDs daily data (per date + IP, from reg_ftds_daily table)
  regFtdsDaily: RegFtdsDailyRecord[]
  setRegFtdsDaily: (data: RegFtdsDailyRecord[]) => void
  selectedRegDate: string   // ISO "YYYY-MM-DD" or '' for all dates
  setSelectedRegDate: (date: string) => void

  // Reset
  resetAllData: () => void
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      // Theme
      isLight: false,
      toggleTheme: () => set(s => ({ isLight: !s.isLight })),

      // Navigation
      activeView: 'mailmodo',
      setView: (v) => set({ activeView: v }),

      // Dashboard filters
      activeFilter: 'all',
      activeEsp: null,
      sortKey: null,
      sortDir: -1,
      searchQ: '',
      setFilter: (f) => set({ activeFilter: f, activeEsp: null }),
      setActiveEsp: (name) => set(s => ({
        activeEsp: s.activeEsp === name ? null : name,
        activeFilter: 'all',
      })),
      setSort: (key) => set(s => ({
        sortKey: key,
        sortDir: s.sortKey === key ? s.sortDir * -1 : -1,
      })),
      setSearch: (q) => set({ searchQ: q }),

      // ESP records
      esps: INITIAL_ESPS,
      setEsps: (esps) => set({ esps }),

      // Per-ESP data
      espData: {},
      espRanges: {},
      setEspData: (name, data) => set(s => ({
        espData: { ...s.espData, [name]: data },
        espRanges: {
          ...s.espRanges,
          [name]: { fromIdx: 0, toIdx: Math.max(0, data.dates.length - 1) },
        },
      })),
      setEspRange: (name, from, to) => set(s => ({
        espRanges: { ...s.espRanges, [name]: { fromIdx: from, toIdx: to } },
      })),

      // Review context
      reviewEsp: '',
      setReviewEsp: (esp) => set({ reviewEsp: esp }),

      // Shared review UI
      mmTab: 'ip',
      mmSelectedRow: null,
      setMmTab: (tab) => set({ mmTab: tab, mmSelectedRow: null }),
      setMmSelectedRow: (row) => set({ mmSelectedRow: row }),

      // Upload
      uploadHistory: [],
      addUploadHistory: (entry) => set(s => ({ uploadHistory: [entry, ...s.uploadHistory] })),

      // IP Matrix
      ipmData: INITIAL_IPM_DATA,
      setIpmData: (data) => set({ ipmData: data }),
      addIpmRecord: (rec) => set(s => ({ ipmData: [...s.ipmData, rec] })),
      deleteIpmRecord: (idx) => set(s => ({ ipmData: s.ipmData.filter((_, i) => i !== idx) })),
      updateIpmRecord: (idx, rec) => set(s => ({
        ipmData: s.ipmData.map((r, i) => i === idx ? rec : r),
      })),

      // Data Management
      dmData: [],
      setDmData: (data) => set({ dmData: data }),

      // Throttle Matrix
      throttleData: [],
      setThrottleData: (data) => set({ throttleData: data }),

      // ESP Visibility
      hiddenEsps: [],
      setHiddenEsps: (names) => set({ hiddenEsps: names }),
      toggleEspVisibility: async (name) => {
        const current = get().hiddenEsps
        const isHidden = current.includes(name)
        const next = isHidden ? current.filter(n => n !== name) : [...current, name]
        // Optimistic UI update
        set({ hiddenEsps: next })
        try {
          const { error } = await supabase
            .from('esp_visibility')
            .upsert({ esp: name, hidden: !isHidden, updated_at: new Date().toISOString() })
          if (error) throw error
        } catch (err) {
          console.error('Failed to persist ESP visibility:', err)
          // Only revert if no newer toggle has happened. Otherwise the user's later
          // action wins — don't clobber it.
          const stored = get().hiddenEsps
          const stillOurs = stored.length === next.length && stored.every((n, i) => n === next[i])
          if (stillOurs) {
            set({ hiddenEsps: current })
          }
        }
      },

      // IP Matrix record visibility
      hiddenIpmIds: [],
      setHiddenIpmIds: (ids) => set({ hiddenIpmIds: ids }),
      toggleIpmRecordVisibility: (id) => set(s => ({
        hiddenIpmIds: s.hiddenIpmIds.includes(id)
          ? s.hiddenIpmIds.filter(x => x !== id)
          : [...s.hiddenIpmIds, id],
      })),

      // Persisted date-picker filters
      dateFilters: {},
      setDateFilter: (key, patch) => set(s => {
        const prev = s.dateFilters[key] ?? { from: '', to: '', appliedFrom: '', appliedTo: '' }
        return {
          dateFilters: { ...s.dateFilters, [key]: { ...prev, ...patch } },
        }
      }),

      // Reg & FTDs daily
      regFtdsDaily: [],
      setRegFtdsDaily: (data) => set({ regFtdsDaily: data }),
      selectedRegDate: '',
      setSelectedRegDate: (date) => set({ selectedRegDate: date }),

      // Reset
      resetAllData: () => set({
        esps: [], uploadHistory: [], ipmData: [],
        espData: {}, espRanges: {}, reviewEsp: '',
        mmTab: 'ip', mmSelectedRow: null,
        hiddenEsps: [], hiddenIpmIds: [],
        dateFilters: {},
      }),
    }),
    {
      name: 'esp-dashboard-storage',
      version: 1,
      migrate: (stored: unknown) => {
        // v0 → v1: throttleData moved to Supabase, remove from localStorage
        const s = stored as Record<string, unknown>
        delete s.throttleData
        return s
      },
      partialize: (s) => ({
        isLight: s.isLight,
        hiddenIpmIds: s.hiddenIpmIds,
        dateFilters: s.dateFilters,
      }),
    }
  )
)
