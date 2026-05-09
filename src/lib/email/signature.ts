/**
 * Sprint 8C-2 — Brugerspecifik mailsignatur.
 *
 * Bygger HTML + plain-text signatur fra brugerprofil + employee + branding.
 * Defensiv: alle felt-opslag bruger pickString() med fallback-kæde.
 * Logo udelades helt hvis branding.logoUrl er null (ingen broken image).
 *
 * Bruges af task-mail.ts og kan genbruges af enhver mail-flow.
 */

import { createClient } from '@/lib/supabase/server'
import {
  getCompanyBranding,
  pickString,
  type CompanyBranding,
} from '@/lib/branding/company-branding'
import { logger } from '@/lib/utils/logger'

export interface SignatureUserInput {
  /** Brugerens navn — aldrig tomt (mindst en fallback) */
  name: string
  email?: string
  directPhone?: string
  title?: string
}

export interface SignatureRenderInput extends SignatureUserInput {
  branding: CompanyBranding
}

export interface RenderedSignature {
  html: string
  text: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildUserEmailSignatureHtml(input: SignatureRenderInput): string {
  const { name, email, directPhone, title, branding } = input

  const nameHtml = escapeHtml(name)
  const titleHtml = title ? escapeHtml(title) : null
  const emailHtml = email ? escapeHtml(email) : null
  const directHtml = directPhone ? escapeHtml(directPhone) : null
  const companyNameHtml = escapeHtml(branding.legalName)
  const websiteHtml = escapeHtml(branding.website)
  const websiteUrlHtml = escapeHtml(branding.websiteUrl)
  const mainPhoneHtml = escapeHtml(branding.mainPhone)
  const cvrHtml = escapeHtml(branding.cvr)

  const labelColor = branding.textMutedColor
  const linkColor = branding.primaryDarkColor
  const textColor = branding.textColor
  const accentColor = branding.primaryColor

  // Logo-cell rendres KUN hvis valid absolut https URL findes.
  // Hvis null: ingen <img>-tag overhovedet → ingen broken image.
  const logoCell = branding.logoUrl
    ? `
    <td valign="top" style="padding-right:18px;vertical-align:top;">
      <img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.companyName)}"
           width="80" height="80"
           style="display:block;border:0;outline:none;text-decoration:none;width:80px;height:auto;" />
    </td>`
    : ''

  const titleLine = titleHtml
    ? `<div style="color:${labelColor};font-size:12px;margin-bottom:6px;">${titleHtml}</div>`
    : ''

  const directLine = directHtml
    ? `<div><span style="color:${labelColor};">Direkte:</span> ${directHtml}</div>`
    : ''

  const emailLine = emailHtml
    ? `<div><span style="color:${labelColor};">E-mail:</span> <a href="mailto:${emailHtml}" style="color:${linkColor};text-decoration:none;">${emailHtml}</a></div>`
    : ''

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${textColor};line-height:1.55;border-collapse:collapse;margin-top:24px;">
  <tr>${logoCell}
    <td valign="top" style="border-left:4px solid ${accentColor};padding-left:14px;vertical-align:top;">
      <div style="font-weight:bold;color:${textColor};font-size:15px;margin-bottom:2px;">${nameHtml}</div>
      ${titleLine}
      <div><span style="color:${labelColor};">Firma:</span> ${companyNameHtml}</div>
      <div><span style="color:${labelColor};">Telefon:</span> ${mainPhoneHtml}</div>
      ${directLine}
      ${emailLine}
      <div><span style="color:${labelColor};">CVR:</span> ${cvrHtml}</div>
      <div style="margin-top:4px;"><a href="${websiteUrlHtml}" style="color:${linkColor};text-decoration:none;">${websiteHtml}</a></div>
    </td>
  </tr>
</table>`
}

export function buildUserEmailSignatureText(input: SignatureRenderInput): string {
  const { name, email, directPhone, title, branding } = input
  const lines: string[] = []
  lines.push(name)
  if (title) lines.push(title)
  lines.push(`Firma: ${branding.legalName}`)
  lines.push(`Telefon: ${branding.mainPhone}`)
  if (directPhone) lines.push(`Direkte: ${directPhone}`)
  if (email) lines.push(`E-mail: ${email}`)
  lines.push(`CVR: ${branding.cvr}`)
  lines.push(branding.website)
  return lines.join('\n')
}

/**
 * Defensiv resolver — slår profile + employee op via select('*') og bygger
 * SignatureUserInput med fallback-kæde. Crasher aldrig på manglende kolonner.
 *
 * Fallback-kæde:
 *   name:        employee.full_name → .display_name → .name
 *                profile.full_name → .display_name → .name
 *                profile.email → branding.legalName
 *   email:       employee.email → profile.email
 *   directPhone: employee.direct_phone → .mobile → .phone
 *                profile.direct_phone → .mobile → .phone
 *   title:       employee.title → .role → profile.title → .role
 */
async function resolveUserSignatureInput(
  userId: string,
  branding: CompanyBranding
): Promise<SignatureRenderInput> {
  const supabase = await createClient()

  let profile: Record<string, unknown> | null = null
  try {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    profile = (data as Record<string, unknown> | null) || null
  } catch (err) {
    logger.warn('resolveUserSignatureInput: profiles query failed', { error: err })
  }

  let employee: Record<string, unknown> | null = null
  try {
    const { data } = await supabase
      .from('employees')
      .select('*')
      .eq('profile_id', userId)
      .limit(1)
      .maybeSingle()
    employee = (data as Record<string, unknown> | null) || null
  } catch (err) {
    logger.warn('resolveUserSignatureInput: employees by profile_id failed', { error: err })
  }

  // Hvis ikke linket via profile_id, prøv via email-match
  if (!employee && profile) {
    const profileEmail = pickString(profile, 'email')
    if (profileEmail) {
      try {
        const { data } = await supabase
          .from('employees')
          .select('*')
          .ilike('email', profileEmail)
          .limit(1)
          .maybeSingle()
        employee = (data as Record<string, unknown> | null) || null
      } catch (err) {
        logger.warn('resolveUserSignatureInput: employees by email failed', { error: err })
      }
    }
  }

  const name =
    pickString(employee, 'full_name', 'display_name', 'name') ||
    pickString(profile, 'full_name', 'display_name', 'name') ||
    pickString(profile, 'email') ||
    branding.legalName

  const email =
    pickString(employee, 'email') ||
    pickString(profile, 'email')

  const directPhone =
    pickString(employee, 'direct_phone', 'mobile', 'phone') ||
    pickString(profile, 'direct_phone', 'mobile', 'phone')

  const titleRaw =
    pickString(employee, 'title') ||
    pickString(employee, 'role') ||
    pickString(profile, 'title') ||
    pickString(profile, 'role')

  // Skip "admin"/"electrician" osv som titel — kun pæne danske roller.
  const title = titleRaw && /^(montør|elektriker|lærling|projektleder|sælger|serviceleder|salg|bogholderi|kontor)$/i.test(titleRaw)
    ? titleRaw.charAt(0).toUpperCase() + titleRaw.slice(1).toLowerCase()
    : undefined

  return { name, email, directPhone, title, branding }
}

/**
 * Bekvemmelighed: hent branding + bruger + render. Returnerer både
 * HTML og text klar til at indlejre i body_html/body_text.
 */
export async function resolveAndBuildSignature(
  userId: string
): Promise<RenderedSignature> {
  const branding = await getCompanyBranding()
  const input = await resolveUserSignatureInput(userId, branding)
  return {
    html: buildUserEmailSignatureHtml(input),
    text: buildUserEmailSignatureText(input),
  }
}
