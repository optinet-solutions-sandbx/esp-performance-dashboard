import { parseDate } from '@/lib/parsers'

/** Reject if a required numeric column parses as a number in fewer than this fraction of sampled rows. */
export const NUMERIC_VALID_THRESHOLD = 0.5
/** Max rows sampled for numeric content-sanity checks. */
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
  /** Human-readable date format hint shown in the rejection message. */
  dateFormatHint?: string
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
    dateFormatHint: 'dd/mm/yyyy — e.g. 25/05/2026',
  },
  Mailgun: {
    esp: 'Mailgun',
    requiredColumns: [['last-stats-date', 'last-sent-date', 'date', 'sent-time']],
    signatureColumns: ['domain-grouped-by-esp', 'success', 'last-stats-date'],
    dateColumn: ['last-stats-date', 'last-sent-date', 'date', 'sent-time'],
    monthFirst: true,
    dateFormatHint: 'mm/dd/yyyy or yyyy-mm-dd — e.g. 05/25/2026 or 2026-05-25',
  },
  Netcore: {
    esp: 'Netcore',
    requiredColumns: [['sent-date', 'sending-date', 'date'], ['email-(primary-key)', 'email', 'recipient']],
    signatureColumns: ['sent-date', 'bounce-type', 'unsub-reason'],
    dateColumn: ['sent-date', 'sending-date', 'date'],
    monthFirst: false,
    dateFormatHint: 'd/m/yyyy or d/m/yyyy HH:mm — e.g. 25/5/2026 or 25/5/2026 10:30',
  },
  Hotsol: {
    esp: 'Hotsol',
    requiredColumns: [['date-added', 'date'], ['sent-email', 'email']],
    signatureColumns: ['date-added', 'sent-email', 'process-status'],
    dateColumn: ['date-added', 'date'],
    monthFirst: false,
    dateFormatHint: 'M/D/YY or M/D/YY, H:MM AM/PM — e.g. 5/25/26 or 5/25/26, 10:30 AM',
  },
  MMS: {
    esp: 'MMS',
    requiredColumns: [['date-added', 'date'], ['sent-email', 'email']],
    signatureColumns: ['date-added', 'sent-email', 'process-status'],
    dateColumn: ['date-added', 'date'],
    monthFirst: false,
    dateFormatHint: 'M/D/YY or M/D/YY, H:MM AM/PM — e.g. 5/25/26 or 5/25/26, 10:30 AM',
  },
  '171 MailsApp': {
    esp: '171 MailsApp',
    requiredColumns: [['date-added', 'date'], ['sent-email', 'email']],
    signatureColumns: ['date-added', 'sent-email', 'process-status'],
    dateColumn: ['date-added', 'date'],
    monthFirst: false,
    dateFormatHint: 'M/D/YY, DD-MM-YYYY, or d/m/yyyy — e.g. 5/25/26 or 25-05-2026',
  },
  Moosend: {
    esp: 'Moosend',
    requiredColumns: ['sent-on', ['sent', 'email'], 'domain'],
    signatureColumns: ['sent-on', 'unsubscribes', 'domain'],
    dateColumn: 'sent-on',
    monthFirst: false,
    dateFormatHint: 'D/M/YYYY or DD-MM-YYYY HH:MM — e.g. 25/5/2026 or 25-05-2026 10:30',
  },
  Omnisend: { esp: 'Omnisend', requiredColumns: GENERIC_REQUIRED, dateColumn: GENERIC_DATE, monthFirst: false, dateFormatHint: 'yyyy-mm-dd or dd/mm/yyyy — e.g. 2026-05-25' },
  Klaviyo:  { esp: 'Klaviyo',  requiredColumns: GENERIC_REQUIRED, dateColumn: GENERIC_DATE, monthFirst: false, dateFormatHint: 'yyyy-mm-dd or dd/mm/yyyy — e.g. 2026-05-25' },
  Brevo:    { esp: 'Brevo',    requiredColumns: GENERIC_REQUIRED, dateColumn: GENERIC_DATE, monthFirst: false, dateFormatHint: 'yyyy-mm-dd or dd/mm/yyyy — e.g. 2026-05-25' },
  Kenscio: {
    esp: 'Kenscio',
    requiredColumns: ['timestamp', 'email-sent'],
    signatureColumns: ['timestamp', 'email-sent', 'domain-name'],
    dateColumn: 'timestamp',
    monthFirst: false,
    dateFormatHint: 'dd-mm-yyyy or dd-mm-yyyy HH:MM — e.g. 25-05-2026 or 25-05-2026 10:30',
  },
  Mailjet: {
    esp: 'Mailjet',
    requiredColumns: ['date', 'email'],
    signatureColumns: ['hard_bounce', 'soft_bounce', 'spam'],
    dateColumn: 'date',
    monthFirst: false,
    dateFormatHint: 'ISO timestamp — e.g. 2026-05-25T10:30:00',
  },
  Elastic: {
    esp: 'Elastic',
    requiredColumns: ['eventdate', ['to', 'email']],
    signatureColumns: ['eventdate', 'eventtype', 'fromemail'],
    dateColumn: 'eventdate',
    monthFirst: true,
    dateFormatHint: 'M/D/YYYY H:MM:SS AM/PM — e.g. 5/25/2026 10:30:00 AM',
  },
  Inboxroad: {
    esp: 'Inboxroad',
    // Inboxroad exports have stable, named headers. Require the columns the parser
    // depends on so a renamed/missing column is rejected up front rather than
    // silently zeroing bounces (which is exactly what slipped through before).
    requiredColumns: [
      ['esp', 'from-domain', 'sending-domain', 'domain'],
      ['domain-grouped-by-esp', 'isp', 'provider', 'recipient-domain'],
      ['hard-bounces', 'soft-bounces'],
      ['success', 'delivered'],
    ],
    signatureColumns: ['domain-grouped-by-esp', 'hard-bounces', 'success'],
    dateColumn: ['last-stats-date', 'last-sent-date', 'date', 'sending-date', 'send-date', 'sent-date'],
    monthFirst: false,
    numericColumns: ['hard-bounces', 'soft-bounces'],
    dateFormatHint: 'Excel serial number or dd/mm/yyyy — e.g. 45801 or 25/05/2026',
  },
  Map: {
    esp: 'Map',
    requiredColumns: ['date', ['confirmed-openers', 'messages-sent']],
    signatureColumns: ['confirmed-openers', 'messages-sent', 'clickers'],
    dateColumn: 'date',
    monthFirst: false,
    numericColumns: ['messages-sent', 'confirmed-openers'],
    dateFormatHint: 'yyyy-mm-dd — e.g. 2026-05-25',
  },
}

function findDateColumn(headerSet: Set<string>, dateColumn: string | string[]): string | undefined {
  const cands = Array.isArray(dateColumn) ? dateColumn : [dateColumn]
  return cands.find(c => headerSet.has(c))
}

/**
 * Mirror the parser's date tolerance: a value counts as a valid date if parseFile
 * would parse it. Covers ISO and 4-digit-year d/m/yyyy|m/d/yyyy (parseDate direct),
 * Excel serials that arrive as numeric strings (XLSX cells are stringified on read),
 * and 2-digit-year M/D/YY or D/M/YY used by some ESPs (e.g. MMS/Hotsol), with an
 * optional time/comma suffix like "3/24/26, 10:46 AM".
 */
function isParseableDate(raw: string, monthFirst: boolean): boolean {
  const s = (raw ?? '').trim()
  if (!s) return false
  // Excel serial stored as a numeric string (XLSX path stringifies all cells).
  if (/^\d+(\.\d+)?$/.test(s)) return parseDate(Number(s), monthFirst) !== null
  // Direct: handles ISO and 4-digit-year d/m/yyyy | m/d/yyyy.
  if (parseDate(s, monthFirst) !== null) return true
  // 2-digit-year M/D/YY or D/M/YY (optional time/comma suffix) → expand YY to 20YY.
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2}(?!\d)/.test(s)) {
    const expanded = s.replace(/^(\d{1,2}[\/\-]\d{1,2}[\/\-])(\d{2})(?!\d)/, (_, p, yy) => `${p}20${yy}`)
    return parseDate(expanded, monthFirst) !== null
  }
  return false
}

/**
 * Validate a parsed upload before it is committed to Supabase.
 *
 * **Precondition:** `headers` must be normalised exactly as produced by
 * `readUploadRows` in `parsers.ts` — i.e. lowercased with spaces replaced by
 * hyphens (e.g. `"sent-time"`, `"email-address"`).  All column lookups in this
 * function assume that normalised form; passing raw/un-normalised headers will
 * produce false "missing column" errors.
 */
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

  // ── Content sanity (date) — hard reject on any unparseable row ─
  const dateCol = findDateColumn(headerSet, schema.dateColumn)
  const getDateVal = (row: Record<string, string>): string => {
    if (dateCol) return row[dateCol] ?? ''
    if (schema.positionalDateIndex != null) {
      const key = headers[schema.positionalDateIndex]
      return key != null ? (row[key] ?? '') : ''
    }
    return ''
  }

  // Only run the date-content check when a date column is actually resolvable.
  // If neither a named date column nor a positional index is available, skip
  // entirely to avoid emitting a redundant error on top of the structural one.
  let validDateRatio = 0
  if (dateCol !== undefined || schema.positionalDateIndex != null) {
    const badDateRows: { row: number; value: string }[] = []
    let validCount = 0
    rows.forEach((r, i) => {
      const raw = (getDateVal(r) ?? '').trim()
      if (raw === '') return  // skip empty cells
      if (isParseableDate(raw, schema.monthFirst)) {
        validCount++
      } else {
        badDateRows.push({ row: i + 2, value: raw })  // +2: row 1 is header
      }
    })
    const nonEmpty = validCount + badDateRows.length
    validDateRatio = nonEmpty > 0 ? validCount / nonEmpty : 0

    if (badDateRows.length > 0) {
      const shown = badDateRows.slice(0, 5)
      const more  = badDateRows.length - shown.length
      errors.push(`${badDateRows.length} row${badDateRows.length === 1 ? '' : 's'} have an invalid date format for ${schema.esp}.`)
      shown.forEach(b => errors.push(`  Row ${b.row}: "${b.value}"`))
      if (more > 0) errors.push(`  …and ${more} more`)
      if (schema.dateFormatHint) errors.push(`Expected format: ${schema.dateFormatHint}`)
      errors.push('Fix every bad row in your source file and try again. Nothing was uploaded.')
    }
  }

  // ── Content sanity (numeric) ──────────────────────────────────
  const sample = rows.slice(0, CONTENT_SAMPLE_SIZE)
  for (const col of schema.numericColumns ?? []) {
    if (!headerSet.has(col)) continue
    const numeric = sample.filter(r => {
      const v = (r[col] ?? '').trim()
      return v === '' || Number.isFinite(Number(v))   // blanks are acceptable; parser treats them as 0
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
    stats: { totalRows, sampled: totalRows, validDateRatio, suggestedEsp },
  }
}
