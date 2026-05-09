/**
 * Sprint 8C-2 — Central branding-konfiguration.
 *
 * Hentes fra company_settings hvis tilgængelig, ellers fra defensive
 * fallback-konstanter. Firmaoplysninger må KUN hardkodes her — ikke
 * spredes ud i forskellige mail/PDF-templates.
 *
 * Brand-farver er konstanter (ingen DB-felter for primary/accent endnu).
 * Når admin-konfigurabel branding ønskes, tilføjes en migration der
 * udvider company_settings med primary_color/accent_color/legal_name —
 * helperen ændres så til at læse fra DB med konstant-fallback.
 */

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'

const BRAND_DEFAULTS = {
  companyName: 'Elta Solar',
  legalName: 'Elta Solar ApS',
  cvr: '45630897',
  mainPhone: '70 60 51 50',
  mainEmail: 'hc@eltasolar.dk',
  website: 'eltasolar.dk',
  websiteUrl: 'https://eltasolar.dk',
  primaryColor: '#16A34A',
  primaryDarkColor: '#15803D',
  accentColor: '#F97316',
  textColor: '#1F2937',
  textMutedColor: '#6B7280',
} as const

export interface CompanyBranding {
  companyName: string
  legalName: string
  cvr: string
  mainPhone: string
  mainEmail: string
  /** Display-form uden protocol/trailing slash, fx 'eltasolar.dk' */
  website: string
  /** Absolut URL med https://, fx 'https://eltasolar.dk' */
  websiteUrl: string
  /** Kun hvis valid absolut https — ellers null så img-tag udelades */
  logoUrl: string | null
  primaryColor: string
  primaryDarkColor: string
  accentColor: string
  textColor: string
  textMutedColor: string
}

function isValidAbsoluteHttpsUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false
  const trimmed = url.trim()
  if (!trimmed) return false
  return /^https:\/\/[^\s]+$/i.test(trimmed)
}

export function pickString(
  rec: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | undefined {
  if (!rec) return undefined
  for (const k of keys) {
    const v = rec[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return undefined
}

function normalizeWebsite(raw: string): { display: string; url: string } {
  const trimmed = raw.trim()
  const stripped = trimmed.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
  const url = trimmed.startsWith('http') ? trimmed.replace(/\/+$/, '') : `https://${stripped}`
  return { display: stripped, url }
}

export async function getCompanyBranding(): Promise<CompanyBranding> {
  let row: Record<string, unknown> | null = null
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('company_settings')
      .select('*')
      .limit(1)
      .maybeSingle()
    row = (data as Record<string, unknown> | null) || null
  } catch (err) {
    logger.warn('getCompanyBranding: company_settings query failed — using defaults', {
      error: err,
    })
  }

  const logoCandidate = pickString(row, 'company_logo_url', 'logo_url')
  const logoUrl = isValidAbsoluteHttpsUrl(logoCandidate) ? logoCandidate! : null

  const websiteRaw =
    pickString(row, 'company_website', 'website') || BRAND_DEFAULTS.website
  const { display: websiteDisplay, url: websiteUrl } = normalizeWebsite(websiteRaw)

  return {
    companyName: pickString(row, 'company_name') || BRAND_DEFAULTS.companyName,
    legalName:
      pickString(row, 'legal_name') ||
      pickString(row, 'company_name') ||
      BRAND_DEFAULTS.legalName,
    cvr:
      pickString(row, 'company_vat_number', 'cvr', 'vat_number') ||
      BRAND_DEFAULTS.cvr,
    mainPhone:
      pickString(row, 'company_phone', 'main_phone', 'phone') ||
      BRAND_DEFAULTS.mainPhone,
    mainEmail:
      pickString(row, 'company_email', 'main_email', 'email') ||
      BRAND_DEFAULTS.mainEmail,
    website: websiteDisplay,
    websiteUrl,
    logoUrl,
    primaryColor: pickString(row, 'primary_color') || BRAND_DEFAULTS.primaryColor,
    primaryDarkColor: BRAND_DEFAULTS.primaryDarkColor,
    accentColor: pickString(row, 'accent_color') || BRAND_DEFAULTS.accentColor,
    textColor: BRAND_DEFAULTS.textColor,
    textMutedColor: BRAND_DEFAULTS.textMutedColor,
  }
}
