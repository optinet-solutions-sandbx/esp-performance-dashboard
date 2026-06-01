import type { EspRecord, DailyRecord, MmData, IpmRecord } from './types'

export const INITIAL_ESPS: EspRecord[] = []

export const ESP_COLORS: Record<string, string> = {
  Mailmodo:       '#7c5cfc',
  Mailgun:        '#ffd166',
  Netcore:        '#f97316',
  Hotsol:         '#00e5c3',
  MMS:            '#3b82f6',
  '171 MailsApp': '#ff6b9d',
  Moosend:        '#22c55e',
  Omnisend:       '#d946ef',
  Klaviyo:        '#06b6d4',
  Brevo:          '#84cc16',
  Kenscio:        '#e63946',
  Mailjet:        '#fdb022',
  Elastic:        '#6366f1',
  Inboxroad:      '#0ea5e9',
}

// Canonical ESP name resolution — used for upload parsing AND for normalizing
// stored Reg & FTDs records on load, so every view groups/counts by the same names.
// Legacy "Ongage" (and its "OG" short form) now route to Mailgun.
export const ESP_ALIASES: Record<string, string> = {
  // ── Mailmodo ──────────────────────────────────────────────────────
  'mm': 'Mailmodo', 'mailmodo': 'Mailmodo', 'mail modo': 'Mailmodo',
  'mailmdoo': 'Mailmodo', 'mailmood': 'Mailmodo', 'mailmdo': 'Mailmodo',
  'maimodo': 'Mailmodo', 'mlmodo': 'Mailmodo', 'mmailmodo': 'Mailmodo',
  'mailmodoo': 'Mailmodo', 'malimodo': 'Mailmodo', 'maiilmodo': 'Mailmodo',
  'mail-modo': 'Mailmodo',

  // ── Mailgun (incl. legacy "Ongage" / "OG" — now route to Mailgun) ──
  'mg': 'Mailgun', 'mailgun': 'Mailgun', 'mail gun': 'Mailgun',
  'mailgn': 'Mailgun', 'mailgunn': 'Mailgun', 'mialgun': 'Mailgun',
  'maligun': 'Mailgun', 'mailgnu': 'Mailgun', 'mailgnun': 'Mailgun',
  'mailgun-': 'Mailgun', 'mail-gun': 'Mailgun', 'maiilgun': 'Mailgun',
  'mialgnu': 'Mailgun', 'mlgun': 'Mailgun', 'mailgune': 'Mailgun',
  'ongage': 'Mailgun', 'on gage': 'Mailgun', 'on-gage': 'Mailgun',
  'onage': 'Mailgun', 'ongag': 'Mailgun', 'onga': 'Mailgun',
  'ongagee': 'Mailgun', 'oongage': 'Mailgun', 'og': 'Mailgun',

  // ── Netcore ───────────────────────────────────────────────────────
  'nc': 'Netcore', 'netcore': 'Netcore', 'net core': 'Netcore',
  'netcoree': 'Netcore', 'ntecore': 'Netcore', 'netcor': 'Netcore',
  'netcroe': 'Netcore', 'netcorre': 'Netcore', 'ncore': 'Netcore',
  'netocre': 'Netcore', 'net-core': 'Netcore', 'necore': 'Netcore', 'ntcore': 'Netcore',

  // ── Hotsol ────────────────────────────────────────────────────────
  'hs': 'Hotsol', 'hotsol': 'Hotsol', 'hot sol': 'Hotsol',
  'hotsoll': 'Hotsol', 'hotslo': 'Hotsol', 'hotol': 'Hotsol',
  'hotsool': 'Hotsol', 'hotosol': 'Hotsol', 'htsol': 'Hotsol',
  'hostsol': 'Hotsol', 'hotsl': 'Hotsol', 'hotsoel': 'Hotsol',
  'hotsall': 'Hotsol', 'hot-sol': 'Hotsol', 'htotsol': 'Hotsol',

  // ── MMS ───────────────────────────────────────────────────────────
  'mms': 'MMS',

  // ── 171 MailsApp ──────────────────────────────────────────────────
  '171': '171 MailsApp', '171mailsapp': '171 MailsApp', '171 mailsapp': '171 MailsApp',
  '171mailsap': '171 MailsApp', '171mailsaap': '171 MailsApp', '171 mailsap': '171 MailsApp',
  '171mails': '171 MailsApp', '171mailapp': '171 MailsApp', '171 mails app': '171 MailsApp',
  '171-mailsapp': '171 MailsApp', '171mailsappp': '171 MailsApp',

  // ── Moosend ───────────────────────────────────────────────────────
  'ms': 'Moosend', 'moosend': 'Moosend', 'moo send': 'Moosend',
  'moosnd': 'Moosend', 'mosend': 'Moosend', 'moosened': 'Moosend',
  'mooosend': 'Moosend', 'mosneed': 'Moosend', 'mossend': 'Moosend',
  'mosnde': 'Moosend', 'moo-send': 'Moosend', 'mosnd': 'Moosend',

  // ── Kenscio ───────────────────────────────────────────────────────
  'kn': 'Kenscio', 'kenscio': 'Kenscio', 'ken scio': 'Kenscio',
  'kensico': 'Kenscio', 'kencio': 'Kenscio', 'kensco': 'Kenscio',
  'kenscoo': 'Kenscio', 'kensio': 'Kenscio', 'knescio': 'Kenscio',
  'kenscioo': 'Kenscio', 'kensciio': 'Kenscio', 'ken-scio': 'Kenscio',

  // ── Mailjet ───────────────────────────────────────────────────────
  'mj': 'Mailjet', 'mailjet': 'Mailjet', 'mail jet': 'Mailjet',
  'maijet': 'Mailjet', 'maljet': 'Mailjet', 'mailjt': 'Mailjet',
  'mailjett': 'Mailjet', 'mialjet': 'Mailjet', 'maiiljet': 'Mailjet',
  'maliljet': 'Mailjet', 'mailljett': 'Mailjet', 'maijlet': 'Mailjet',
  'mail-jet': 'Mailjet', 'mailet': 'Mailjet',

  // ── Elastic ───────────────────────────────────────────────────────
  'el': 'Elastic', 'elastic': 'Elastic', 'elasticemail': 'Elastic',
  'elastic email': 'Elastic', 'elasticc': 'Elastic', 'elaastic': 'Elastic',
  'elasic': 'Elastic', 'elastci': 'Elastic', 'elatic': 'Elastic',
  'elastik': 'Elastic', 'elaetic': 'Elastic', 'elastiic': 'Elastic',
  'elasctic': 'Elastic', 'elastic-email': 'Elastic', 'elasticemal': 'Elastic',
}

// Resolve any raw ESP string to its canonical name. Idempotent for known names.
export function normalizeEspName(raw: string): string {
  return ESP_ALIASES[String(raw ?? '').trim().toLowerCase()] ?? String(raw ?? '').trim()
}

export const INITIAL_DAILY7: DailyRecord[] = []

export const INITIAL_MM_DATA: MmData = {
  dates: [], datesFull: [], providers: {}, domains: {}, overallByDate: {}, providerDomains: {},
}

export const INITIAL_IPM_DATA: IpmRecord[] = []

// IP type registry: 'D' = Dedicated, 'S' = Shared. IPs not listed render no badge.
export const IP_TYPES: Record<string, 'D' | 'S'> = {
  // Mailmodo
  '156.70.46.105':    'S',
  '168.203.49.158':   'S',
  '168.203.33.98':    'D',
  '204.220.178.253':  'D',
  '204.220.187.187':  'D',
  '161.38.192.118':   'D',
  '204.220.178.30':   'D',
  '204.220.178.12':   'D',
  '198.244.59.255':   'D',
  '204.220.181.255':  'D',
  '141.206.158.86':   'D',
  '91.222.98.16':     'D',
  '45.143.133.103':   'S',
  // Inboxroad
  '217.180.22.39':    'D',
  '213.193.233.16':   'D',
  '45.159.109.3':     'D',
  // Elastic Email
  '93.114.69.172':    'S',
  // Mailjet
  '185.250.237.63':   'S',
  '216.24.227.101':   'D',
  '216.24.227.102':   'D',
  '216.24.227.103':   'D',
  '216.24.227.104':   'D',
  '216.24.227.105':   'D',
}

export const PROVIDER_COLORS: Record<string, string> = {
  'gmail.com': '#ff7b6b',
  'yahoo.com': '#a78bff',
  'outlook.com': '#60d4f0',
  'icloud.com': '#c5f27a',
  'other': '#f9a8e8',
  'zohomail.in': '#ffcc44',
  'myyahoo.com': '#c4a8ff',
}

export const DOMAIN_COLORS: Record<string, string> = {
  'dailypromoinfo.com': '#00ffd5',
  'dailypromocoupon.com': '#b39dff',
  'dailydealhive.com': '#ffe066',
  'dealsonoffers.com': '#ff9a5c',
  'offersontoday.com': '#60d4f0',
  'rboy-au': '#ff6b77',
  'alerts.dailypromosdeal.com': '#c5f27a',
  'alerts.dealdivaz.com': '#f9a8e8',
  'alerts.promoalertz.com': '#ffcc44',
  'couponsdailypromo.com': '#ff7b6b',
  'dailypromosdeal.com': '#a78bff',
  'dealdivaz.com': '#c4a8ff',
  'promoalertz.com': '#00e5c3',
  'promocouponsdaily.com': '#7c5cfc',
}

export const IP_COLOR_PALETTE = [
  '#00ffd5', '#b39dff', '#ffe066', '#ff9a5c', '#ff6b77',
  '#60d4f0', '#c5f27a', '#f9a8e8', '#ff7b6b', '#a78bff', '#ffcc44', '#c4a8ff',
]

export const IP_COLOR_PALETTE_LIGHT = [
  '#076C62', '#7c5cfc', '#c49500', '#d46020', '#e04040',
  '#2196b5', '#5a9e30', '#c054a0', '#d43030', '#6b4fd4', '#b08000', '#8b5cd4',
]
