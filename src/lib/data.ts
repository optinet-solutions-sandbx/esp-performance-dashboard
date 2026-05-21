import type { EspRecord, DailyRecord, MmData, IpmRecord } from './types'

export const INITIAL_ESPS: EspRecord[] = []

export const ESP_COLORS: Record<string, string> = {
  Mailmodo:       '#7c5cfc',
  Ongage:         '#ffd166',
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
