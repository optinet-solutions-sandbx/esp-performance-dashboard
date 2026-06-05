export type EspStatus = 'healthy' | 'warn' | 'critical'

export interface EspRecord {
  name: string
  color: string
  sent: number
  delivered: number
  opens: number
  clicks: number
  bounced: number
  unsub: number
  deliveryRate: number
  openRate: number
  clickRate: number
  bounceRate: number
  unsubRate: number
  status: EspStatus
}

export interface DailyRecord {
  date: string
  sent: number
  delivered: number
  opens: number
  clicks: number
  bounced: number
}

export interface DateMetrics {
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  hardBounced?: number
  softBounced?: number
  unsubscribed?: number
  complained?: number
  deliveryRate: number
  openRate: number
  clickRate: number
  bounceRate: number
  successRate?: number
  unsubRate?: number
  complaintRate?: number
}

export interface ProviderData {
  overall: DateMetrics
  byDate: Record<string, DateMetrics>
}

export interface ProviderDomainCell {
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  hardBounced?: number
  softBounced?: number
  unsubscribed: number
}

export interface MmData {
  dates: string[]
  datesFull: { label: string; year: number; iso: string }[]
  providers: Record<string, ProviderData>
  domains: Record<string, ProviderData>
  overallByDate: Record<string, DateMetrics>
  providerDomains: Record<string, Record<string, Record<string, ProviderDomainCell>>>
}

export interface IpmRecord {
  id?: string
  upload_id?: string
  esp: string
  ip: string
  domain: string
  registrations?: number
  ftds?: number
}

export interface RegFtdsDailyRecord {
  id?: string
  upload_id?: string
  date: string   // ISO "YYYY-MM-DD"
  esp: string
  ip: string
  registrations: number
  ftds: number
}

export interface RegFtdsUploadRecord {
  id: string
  filename: string
  rows: number
  dates: string[]   // ISO date strings covered by this upload
  uploaded_at: string
}

export interface IpmUploadRecord {
  id: string
  filename: string
  rows: number
  uploaded_at: string
}

export interface DmRecord {
  country?: string
  domain?: string
  partner?: string
  [key: string]: string | undefined
}

export interface UploadHistoryEntry {
  esp: string
  file: string
  rows: number
  dates: string[]
  time: string
  newDates: number
}

export interface LogEntry {
  id: string
  action: 'upload' | 'download' | 'delete'
  target: string
  details?: string
  created_at: string
  user_id?: string | null
  user_email?: string | null
}

export interface Profile {
  id: string
  email: string
  status: 'pending' | 'approved'
  is_admin: boolean
  created_at: string
  approved_at: string | null
  approved_by: string | null
}

export type ViewName =
  | 'home'
  | 'dashboard'
  | 'performance'
  | 'daily'
  | 'mailmodo'
  | 'mailgun'
  | 'netcore'
  | 'mms'
  | 'hotsol'
  | '171mailsapp'
  | 'upload'
  | 'throttling'
  | 'regftds'
  | 'matrix'
  | 'datamgmt'
  | 'ipmatrix'
  | 'logs'
  | 'analytics'
  | 'moosend'
  | 'kenscio'
  | 'mailjet'
  | 'elastic'
  | 'inboxroad'
  | 'users'
  | 'askai'

export type MmTabType = 'ip' | 'provider' | 'domain'

// --- Throttle Matrix ---
export type ThrottleValue = number | 'TBC'

export interface ThrottleRecord {
  esp:        string
  ip:         string
  fromDomain: string
  gmail:      ThrottleValue
  hotmail:    ThrottleValue
  outlook:    ThrottleValue
  yahoo:      ThrottleValue
  icloud:     ThrottleValue
  aol:        ThrottleValue
  live:       ThrottleValue
  gmx:        ThrottleValue
  web:        ThrottleValue
  others:     ThrottleValue
}

// --- Persisted date-picker filters ---
export interface DateFilter {
  from:        string
  to:          string
  appliedFrom: string
  appliedTo:   string
}

// ── AI Assistant ──────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface UseAskAIReturn {
  messages: ChatMessage[]
  isLoading: boolean
  sendMessage: (text: string) => Promise<void>
  clearMessages: () => void
}

export interface AIContextInput {
  esps: EspRecord[]
  espData: Record<string, MmData>
  ipmData: IpmRecord[]
  throttleData: ThrottleRecord[]
}
