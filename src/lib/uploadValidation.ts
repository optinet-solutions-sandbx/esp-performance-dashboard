import { parseDate } from '@/lib/parsers'

/** Reject if fewer than this fraction of sampled rows have a parseable date. */
export const DATE_VALID_THRESHOLD = 0.7
/** Reject if a required numeric column parses as a number in fewer than this fraction of sampled rows. */
export const NUMERIC_VALID_THRESHOLD = 0.5
/** Max rows sampled for content-sanity checks. */
export const CONTENT_SAMPLE_SIZE = 500

export interface UploadSchema {
  esp: string
  /** Each entry must be satisfied. A string[] = "any one of these aliases counts". Names are post-normalization. */
  requiredColumns: (string | string[])[]
  /** Distinctive columns proving it's THIS esp, used for the "did you mean X?" hint. */
  signatureColumns?: string[]
  dateColumn: string | string[]
  monthFirst: boolean
  numericColumns?: string[]
  /** Headerless/positional formats (e.g. Inboxroad): validate column count + content, not header names. */
  positional?: boolean
  minColumns?: number
  /** For positional files with no header date column, read the date at this 0-based column index. */
  positionalDateIndex?: number
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  stats: { totalRows: number; sampled: number; validDateRatio: number; suggestedEsp?: string }
}

// Generic fallback shape — ESPs with no dedicated parser branch use the generic
// path in parseFile (date = sent-time|date|...; email = email|recipient|to|...).
const GENERIC_REQUIRED: (string | string[])[] = [
  ['sent-time', 'date', 'action_timestamp_rounded', 'timestamp'],
  ['email', 'email-address', 'email_address', 'recipient', 'to'],
]
const GENERIC_DATE = ['sent-time', 'date', 'action_timestamp_rounded', 'timestamp']

export const UPLOAD_SCHEMAS: Record<string, UploadSchema> = {
  Mailmodo: {
    esp: 'Mailmodo',
    requiredColumns: [['campaign-name', 'opens-html'], ['email', 'email-address', 'recipient', 'to']],
    signatureColumns: ['campaign-name', 'opens-html'],
    dateColumn: ['sent-time', 'date'],
    monthFirst: false,
  },
  Mailgun: {
    esp: 'Mailgun',
    requiredColumns: [['last-stats-date', 'last-sent-date', 'date', 'sent-time']],
    signatureColumns: ['domain-grouped-by-esp', 'success', 'last-stats-date'],
    dateColumn: ['last-stats-date', 'last-sent-date', 'date', 'sent-time'],
    monthFirst: true,
  },
  Netcore: {
    esp: 'Netcore',
    requiredColumns: [['sent-date', 'sending-date', 'date'], ['email-(primary-key)', 'email', 'recipient']],
    signatureColumns: ['sent-date', 'bounce-type', 'unsub-reason'],
    dateColumn: ['sent-date', 'sending-date', 'date'],
    monthFirst: false,
  },
  Hotsol: {
    esp: 'Hotsol',
    requiredColumns: [['date-added', 'date'], ['sent-email', 'email']],
    signatureColumns: ['date-added', 'sent-email', 'process-status'],
    dateColumn: ['date-added', 'date'],
    monthFirst: false,
  },
  MMS: {
    esp: 'MMS',
    requiredColumns: [['date-added', 'date'], ['sent-email', 'email']],
    signatureColumns: ['date-added', 'sent-email', 'process-status'],
    dateColumn: ['date-added', 'date'],
    monthFirst: false,
  },
  '171 MailsApp': {
    esp: '171 MailsApp',
    requiredColumns: [['date-added', 'date'], ['sent-email', 'email']],
    signatureColumns: ['date-added', 'sent-email', 'process-status'],
    dateColumn: ['date-added', 'date'],
    monthFirst: false,
  },
  Moosend: {
    esp: 'Moosend',
    requiredColumns: ['sent-on', ['sent', 'email'], 'domain'],
    signatureColumns: ['sent-on', 'unsubscribes', 'domain'],
    dateColumn: 'sent-on',
    monthFirst: false,
  },
  Omnisend: { esp: 'Omnisend', requiredColumns: GENERIC_REQUIRED, dateColumn: GENERIC_DATE, monthFirst: false },
  Klaviyo:  { esp: 'Klaviyo',  requiredColumns: GENERIC_REQUIRED, dateColumn: GENERIC_DATE, monthFirst: false },
  Brevo:    { esp: 'Brevo',    requiredColumns: GENERIC_REQUIRED, dateColumn: GENERIC_DATE, monthFirst: false },
  Kenscio: {
    esp: 'Kenscio',
    requiredColumns: ['timestamp', 'email-sent'],
    signatureColumns: ['timestamp', 'email-sent', 'domain-name'],
    dateColumn: 'timestamp',
    monthFirst: false,
  },
  Mailjet: {
    esp: 'Mailjet',
    requiredColumns: ['date', 'email'],
    signatureColumns: ['hard_bounce', 'soft_bounce', 'spam'],
    dateColumn: 'date',
    monthFirst: false,
  },
  Elastic: {
    esp: 'Elastic',
    requiredColumns: ['eventdate', ['to', 'email']],
    signatureColumns: ['eventdate', 'eventtype', 'fromemail'],
    dateColumn: 'eventdate',
    monthFirst: true,
  },
  Inboxroad: {
    esp: 'Inboxroad',
    requiredColumns: [],
    dateColumn: ['date', 'sending-date', 'send-date', 'sent-date'],
    monthFirst: false,
    positional: true,
    minColumns: 10,
    positionalDateIndex: 9,
  },
  Map: {
    esp: 'Map',
    requiredColumns: ['date', ['confirmed-openers', 'messages-sent']],
    signatureColumns: ['confirmed-openers', 'messages-sent', 'clickers'],
    dateColumn: 'date',
    monthFirst: false,
    numericColumns: ['messages-sent', 'confirmed-openers'],
  },
}

function findDateColumn(headerSet: Set<string>, dateColumn: string | string[]): string | undefined {
  const cands = Array.isArray(dateColumn) ? dateColumn : [dateColumn]
  return cands.find(c => headerSet.has(c))
}

export function validateUpload(
  headers: string[],
  rows: Record<string, string>[],
  espName: string
): ValidationResult {
  const schema = UPLOAD_SCHEMAS[espName]
  const errors: string[] = []
  const warnings: string[] = []
  const headerSet = new Set(headers)
  const totalRows = rows.length

  if (!schema) {
    return { ok: false, errors: [`No format schema is configured for "${espName}".`], warnings, stats: { totalRows, sampled: 0, validDateRatio: 0 } }
  }
  if (totalRows === 0) {
    return { ok: false, errors: ['File has no data rows.'], warnings, stats: { totalRows: 0, sampled: 0, validDateRatio: 0 } }
  }

  // ── Structural ────────────────────────────────────────────────
  if (schema.positional) {
    const cols = headers.length
    if (cols < (schema.minColumns ?? 0)) {
      errors.push(`File has ${cols} columns but ${schema.esp} needs at least ${schema.minColumns}.`)
    }
  } else {
    const missing: string[] = []
    for (const req of schema.requiredColumns) {
      const ok = typeof req === 'string' ? headerSet.has(req) : req.some(c => headerSet.has(c))
      if (!ok) missing.push(typeof req === 'string' ? req : req.join(' or '))
    }
    if (missing.length) {
      errors.push(`Missing required column(s) for ${schema.esp}: ${missing.join(', ')}.`)
    }
  }

  // ── Content sanity (date) ─────────────────────────────────────
  const sample = rows.slice(0, CONTENT_SAMPLE_SIZE)
  const dateCol = findDateColumn(headerSet, schema.dateColumn)
  const getDateVal = (row: Record<string, string>): string => {
    if (dateCol) return row[dateCol] ?? ''
    if (schema.positionalDateIndex != null) return Object.values(row)[schema.positionalDateIndex] ?? ''
    return ''
  }
  const validDates = sample.filter(r => parseDate(getDateVal(r), schema.monthFirst) !== null).length
  const validDateRatio = sample.length ? validDates / sample.length : 0

  if (validDateRatio < DATE_VALID_THRESHOLD) {
    errors.push(`Only ${Math.round(validDateRatio * 100)}% of sampled rows have a parseable date — this doesn't look like a ${schema.esp} export (or the wrong ESP is selected).`)
  } else if (validDateRatio < 1) {
    const bad = sample.length - validDates
    warnings.push(`${bad} of ${sample.length} sampled rows have unparseable dates and will be skipped.`)
  }

  // ── Content sanity (numeric) ──────────────────────────────────
  for (const col of schema.numericColumns ?? []) {
    if (!headerSet.has(col)) continue
    const numeric = sample.filter(r => {
      const v = (r[col] ?? '').trim()
      return v !== '' && Number.isFinite(Number(v))
    }).length
    const ratio = sample.length ? numeric / sample.length : 0
    if (ratio < NUMERIC_VALID_THRESHOLD) {
      errors.push(`Column "${col}" is non-numeric in ${Math.round((1 - ratio) * 100)}% of sampled rows.`)
    }
  }

  // ── Mismatch hint ─────────────────────────────────────────────
  let suggestedEsp: string | undefined
  if (errors.length) {
    let bestScore = 0
    for (const s of Object.values(UPLOAD_SCHEMAS)) {
      if (s.esp === espName || !s.signatureColumns?.length) continue
      const score = s.signatureColumns.filter(c => headerSet.has(c)).length
      if (score === s.signatureColumns.length && score >= 2 && score > bestScore) {
        bestScore = score
        suggestedEsp = s.esp
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: { totalRows, sampled: sample.length, validDateRatio, suggestedEsp },
  }
}
