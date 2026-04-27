/**
 * Elta Solar — Unified Brand Constants
 *
 * Single source of truth for brand colors, names, and metadata.
 * Used by: PDF template, offer portal, email templates.
 */

// ── Colors ───────────────────────────────────────────
export const BRAND_GREEN = '#2D8A2D'
export const BRAND_GREEN_DARK = '#236E23'
export const BRAND_GREEN_LIGHT = '#e8f5e8'
export const BRAND_GREEN_SECTION = '#f0f9f0'

export const BRAND_ORANGE = '#E8841A'
export const BRAND_ORANGE_DARK = '#D0750F'
export const BRAND_ORANGE_LIGHT = '#fef3e2'

// ── Company Info ─────────────────────────────────────
export const BRAND_COMPANY_NAME = 'Elta Solar ApS'
export const BRAND_TAGLINE = 'Professionelle el- & solcelleinstallationer'
export const BRAND_CVR = '44291028'
export const BRAND_EMAIL = 'kontakt@eltasolar.dk'
export const BRAND_WEBSITE = 'eltasolar.dk'

// ── Convenience object (for components that prefer a single import) ──
export const BRAND = {
  green: BRAND_GREEN,
  greenDark: BRAND_GREEN_DARK,
  greenLight: BRAND_GREEN_LIGHT,
  greenSection: BRAND_GREEN_SECTION,
  orange: BRAND_ORANGE,
  orangeDark: BRAND_ORANGE_DARK,
  orangeLight: BRAND_ORANGE_LIGHT,
  companyName: BRAND_COMPANY_NAME,
  tagline: BRAND_TAGLINE,
  cvr: BRAND_CVR,
  email: BRAND_EMAIL,
  website: BRAND_WEBSITE,
} as const
