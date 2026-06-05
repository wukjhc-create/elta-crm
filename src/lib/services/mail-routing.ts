/**
 * Sprint 8H Phase 1B — Central mail-routing service.
 *
 * Types + pure helpers til validation af mail-routes. Server-side
 * resolvers ligger i `src/lib/actions/mail-route-resolvers.ts` og
 * kalder denne service.
 *
 * Ingen 'use server'-direktiv — service eksporterer både sync helpers
 * og types.
 */

import { getMailbox } from '@/lib/services/microsoft-graph'

// =====================================================
// Types
// =====================================================

export type MailIntent =
  | 'reply_inbound'        // svar paa indkommende kunde-mail
  | 'reply_thread'         // svar paa tråd (kan vaere outbound mirror)
  | 'task_practical'       // mail fra task-dialog
  | 'task_technical'       // mail fra task med teknisk fokus
  | 'offer'                // tilbud — Phase 2
  | 'invoice'              // faktura — Phase 2
  | 'invoice_reminder'     // faktura-rykker — Phase 2
  | 'besigtigelse'         // besigtigelses-rapport — Phase 2
  | 'fuldmagt'             // fuldmagt — Phase 2
  | 'internal_notification' // bevidst intern (admin/CRM mailbox)
  | 'manual'               // bruger har eksplicit valgt modtager

export type RecipientRole =
  | 'paying_customer'
  | 'site_customer'
  | 'site_contact'
  | 'billing_contact'
  | 'ordering_contact'
  | 'technical_contact'
  | 'resident'
  | 'property_manager'
  | 'manual'
  | 'internal_admin'

export interface MailRoute {
  /** Mailbox vi sender FRA (typisk @eltasolar.dk-adresse). */
  fromMailbox: string
  /** Recipient — ALDRIG intern medmindre isInternalAllowed=true. */
  toEmail: string
  toName?: string | null
  recipientRole: RecipientRole
  intent: MailIntent
  customerId?: string | null
  serviceCaseId?: string | null
  customerContactId?: string | null
  siteCustomerId?: string | null
  /** Menneske-laesbar audit-trail vist i UI + logger. */
  reason: string
  /** True KUN ved intent='internal_*' eller fuldmagt-admin. */
  isInternalAllowed: boolean
}

export interface MailRouteContext {
  /** Brugerens valgte modtager (fra RecipientPicker eller manuel). */
  recipientOverride?: string | null
  /** Hvis bruger eksplicit har valgt en specifik kontakt-id. */
  customerContactIdOverride?: string | null
  // ---------------------------------------------------------------
  // Sprint 9F Phase 6a — sagspartner-felter (read-only shadow input).
  //
  // Disse felter paavirker IKKE eksisterende resolveres faktiske
  // recipient-valg. De er udelukkende til at give preview-helperen
  // praecis kontekst hvis caller har dataet allerede. Bliver de ikke
  // sat, slaar preview-helperen selv op via service_cases-rowen.
  // ---------------------------------------------------------------
  ordererCustomerId?: string | null
  endCustomerId?: string | null
  payerCustomerId?: string | null
  siteContactId?: string | null
  purchasedFromCustomerId?: string | null
  billingMode?: string | null
}

// =====================================================
// Sprint 9F Phase 6a — Routing-preview types (shadow-only)
// =====================================================
//
// Disse typer beskriver "hvad fremtidig sagspartner-routing ville
// have anbefalet" — uden at aendre faktisk afsendelse. Bruges af
// service-case-route-preview.ts og logMailRoute-meta.

/**
 * Snapshot af parti-rolle-felterne paa en service_case paa det
 * tidspunkt mailen blev routet. Alle felter optional fordi
 * eksisterende sager (foer migration 00112-backfill) eller andre
 * entiteter (offers, invoices) ikke har felterne sat.
 */
export interface PartyRolesSnapshot {
  customerId?: string | null
  ordererCustomerId?: string | null
  endCustomerId?: string | null
  payerCustomerId?: string | null
  siteCustomerId?: string | null
  siteContactId?: string | null
  purchasedFromCustomerId?: string | null
  billingMode?: string | null
}

/**
 * En "anbefalet" route — samme shape som MailRoute, men markeret
 * shadow_only saa intet konsumeres ved en fejltagelse som faktisk
 * recipient. Indeholder kun de felter der er meningsfulde for
 * sammenligning.
 */
export interface RecommendedRoute {
  toEmail: string | null
  toName?: string | null
  recipientRole: RecipientRole | 'unresolved'
  intent: MailIntent
  reason: string
  /** UUID af den rolle der loeste routen, hvis relevant. */
  resolvedFromCustomerId?: string | null
  resolvedFromContactId?: string | null
  /** True hvis vi ikke kunne finde nogen brugbar email. */
  unresolved?: boolean
  /** Fejl-kode hvis recommended ikke kunne bygges. */
  errorCode?: string
}

/**
 * Type af afvigelse mellem nuvaerende og anbefalet route.
 *  - none      : begge peger paa samme email + samme rolle
 *  - role_only : samme email, men anden rolle-label (audit-trail-forskel)
 *  - recipient : anden email — den vigtige forskel
 *  - error     : recommended kunne ikke bygges (data mangler)
 */
export type RoutingDivergence = 'none' | 'role_only' | 'recipient' | 'error'

export interface RoutePreview {
  current: {
    toEmail: string
    recipientRole: RecipientRole
    reason: string
  }
  recommended: RecommendedRoute
  divergence: RoutingDivergence
  divergenceReason: string
  partyRoles: PartyRolesSnapshot
}

// =====================================================
// Constants
// =====================================================

export const INTERNAL_DOMAIN = '@eltasolar.dk'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// =====================================================
// Helpers
// =====================================================

/**
 * Lowercased + trimmed email. Returnerer tom streng for null/undefined.
 */
export function normalizeEmail(email: string | null | undefined): string {
  if (!email) return ''
  return email.trim().toLowerCase()
}

/**
 * True hvis adressen tilhører intern @eltasolar.dk-domæne.
 * Bemærk: tomme adresser regnes IKKE som interne (bruger
 * `assertValidRecipient` til at fange tomme).
 */
export function isInternalEmail(email: string | null | undefined): boolean {
  const n = normalizeEmail(email)
  if (!n) return false
  return n.includes(INTERNAL_DOMAIN)
}

/**
 * Returnerer true hvis email har gyldig form (lokal@domæne.tld).
 * Ingen DNS-tjek — kun syntax.
 */
export function isValidEmail(email: string | null | undefined): boolean {
  const n = normalizeEmail(email)
  if (!n) return false
  if (n.length > 320) return false // RFC 5321 max
  return EMAIL_REGEX.test(n)
}

export class MailRouteError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = 'MailRouteError'
  }
}

/**
 * Validér at routens recipient er ekstern, gyldig og adskilt fra
 * afsender-mailboxen. Kaster MailRouteError ved fejl.
 *
 * `isInternalAllowed` skip'er intern-domæne-tjekket — bruges KUN for
 * bevidst interne intents (admin-alerts, fuldmagt-notif til intern
 * mailbox).
 */
export function assertExternalRecipient(route: MailRoute): void {
  const to = normalizeEmail(route.toEmail)
  const from = normalizeEmail(route.fromMailbox)

  if (!to) {
    throw new MailRouteError('EMPTY_RECIPIENT', 'Modtager-email er tom')
  }
  if (!isValidEmail(to)) {
    throw new MailRouteError('INVALID_RECIPIENT', `Ugyldig modtager-email: ${to}`)
  }
  if (!route.isInternalAllowed && isInternalEmail(to)) {
    throw new MailRouteError(
      'INTERNAL_RECIPIENT_BLOCKED',
      `Kan ikke sende til intern e-mail-adresse (${to}). Vælg en ekstern modtager.`
    )
  }
  if (from && to === from.toLowerCase()) {
    throw new MailRouteError(
      'SELF_REPLY_BLOCKED',
      `Kan ikke sende reply: modtager (${to}) matcher afsender-mailbox (${from})`
    )
  }
}

/**
 * Mindre streng version: tjekker kun at adressen er gyldig email.
 * Bruges til at validere brugerens manuelle input før vi byggers route.
 */
export function assertValidRecipient(email: string | null | undefined): void {
  if (!email || !email.trim()) {
    throw new MailRouteError('EMPTY_RECIPIENT', 'Modtager-email mangler')
  }
  if (!isValidEmail(email)) {
    throw new MailRouteError('INVALID_RECIPIENT', `Ugyldig email-adresse: ${email}`)
  }
}

/**
 * Default from-mailbox via Microsoft Graph helper.
 */
export function defaultFromMailbox(): string {
  return getMailbox().toLowerCase()
}

/**
 * Vælg from-mailbox: hvis email's to_email er en af vores interne
 * mailboxes, brug den (så reply'et threader på rette indbakke);
 * ellers default GRAPH_MAILBOX.
 */
export function pickFromMailbox(originalToEmail: string | null | undefined): string {
  const normalized = normalizeEmail(originalToEmail)
  if (normalized && isInternalEmail(normalized)) {
    return normalized
  }
  return defaultFromMailbox()
}

const ROLE_LABELS: Record<RecipientRole, string> = {
  paying_customer: 'Betaler',
  site_customer: 'Leveringskunde',
  site_contact: 'Kontakt på stedet',
  billing_contact: 'Fakturakontakt',
  ordering_contact: 'Ordregiver',
  technical_contact: 'Teknisk kontakt',
  resident: 'Beboer',
  property_manager: 'Ejendomsadministrator',
  manual: 'Manuel modtager',
  internal_admin: 'Intern administrator',
}

export function roleLabel(role: RecipientRole): string {
  return ROLE_LABELS[role] || role
}

/**
 * Byg en menneske-læsbar audit-trail-streng til logger + UI.
 * Eksempler:
 *   "Reply til ekstern afsender (peter@fasetech.dk) — Betaler: Fasetech ApS"
 *   "Manuel modtager — kontrollér email før afsendelse"
 *   "Task-mail valgt af bruger — Site: Ruddi"
 */
export function buildRouteReason(
  intent: MailIntent,
  role: RecipientRole,
  meta?: {
    payerName?: string | null
    contactName?: string | null
    caseNumber?: string | null
    manualNote?: string | null
  }
): string {
  const parts: string[] = []

  switch (intent) {
    case 'reply_inbound':
      parts.push('Svar til indkommende kunde-mail')
      break
    case 'reply_thread':
      parts.push('Svar i tråd')
      break
    case 'task_practical':
      parts.push('Praktisk task-mail')
      break
    case 'task_technical':
      parts.push('Teknisk task-mail')
      break
    case 'offer':
      parts.push('Tilbud')
      break
    case 'invoice':
      parts.push('Faktura')
      break
    case 'invoice_reminder':
      parts.push('Faktura-rykker')
      break
    case 'besigtigelse':
      parts.push('Besigtigelse')
      break
    case 'fuldmagt':
      parts.push('Fuldmagt')
      break
    case 'internal_notification':
      parts.push('Intern notifikation')
      break
    case 'manual':
      parts.push('Manuel modtager — kontrollér email før afsendelse')
      break
  }

  if (role && role !== 'manual') {
    parts.push(`${roleLabel(role)}${meta?.contactName ? `: ${meta.contactName}` : ''}`)
  }
  if (meta?.payerName) {
    parts.push(`Betaler: ${meta.payerName}`)
  }
  if (meta?.caseNumber) {
    parts.push(`Sag: ${meta.caseNumber}`)
  }
  if (meta?.manualNote) {
    parts.push(meta.manualNote)
  }

  return parts.join(' — ')
}

// =====================================================
// Candidate-vælger (delt af resolvers)
// =====================================================

/**
 * Vælg første EKSTERNE adresse fra en prioriteret kandidat-liste.
 * Returnerer null hvis ingen ekstern findes.
 */
export function pickFirstExternalEmail(
  candidates: Array<string | null | undefined>
): string | null {
  for (const c of candidates) {
    const n = normalizeEmail(c)
    if (!n) continue
    if (isInternalEmail(n)) continue
    if (!isValidEmail(n)) continue
    return n
  }
  return null
}
