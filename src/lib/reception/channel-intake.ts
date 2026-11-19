/**
 * Fase 3A — automatisk indtag af NYE kanal-kilder i Henvendelser (mail og portal). Server-only: bevidst IKKE 'use server'
 * (kan ikke kaldes fra en browser) og aldrig importeret i klientkode (scripts/assert-server-only-helpers.ts).
 *
 *   eksisterende intake (mail-sync / portal) → kanonisk kilderække → ÉN række læst med faste kolonner → normaliseret
 *   kontrakt (adapters.ts) → samme motor (engine.ts) → reception_ingest (atomisk, kilde-afledt, tråd-regler i DB)
 *
 * Kilden kopieres ikke og ændres ikke. Kunde fra kilden: manuelt koblet = bekræftet (kan ikke overskrives); automatisk =
 * kandidat; ukoblet forbliver ukoblet. Læsefejl er et eget udfald (aldrig "ukoblet"). Kun FORSLAG — intet udføres, intet
 * sendes. Fejl her må ALDRIG vælte mail-sync eller portal-afsendelsen: alle udfald returneres, intet kastes videre.
 *
 * Den rå admin-klient forlader aldrig backgroundCapability(): adapteren ser kun readSource/readSourceBody (faste
 * kolonner), readPort (select på allowlist) og ingest (kun rpc reception_ingest).
 */
import { emailToInbound, isFormSubmit, portalToInbound, type EmailSourceRow, type PortalSourceRow } from './adapters'
import { backgroundCapability, receptionBackgroundIngest, type BackgroundCapability } from './background-actor'
import { emailIngestEnabled, emailIngestSince, portalIngestEnabled } from './flags'

export type ChannelIntakeOutcome = 'disabled' | 'created' | 'appended' | 'duplicate' | 'skipped' | 'read_error' | 'not_found' | 'error'
export interface ChannelIntakeResult { outcome: ChannelIntakeOutcome; reason?: string; conversationId?: string | null }

interface Deps { env?: Record<string, string | undefined>; capability?: BackgroundCapability; now?: () => number }

/**
 * Final review §2 — "ny mail" afgøres af HVORNÅR MAIL-SYNC'EN FØRST SÅ DEN (incoming_emails.created_at), ikke af
 * afsendt/modtaget-tiden: efter et Microsoft-udfald på 49 timer, 3 eller 7 dage er en mail, der først opdages i dag, stadig
 * ny og indtages (ellers ville ~11 % af prod-mails — opdaget > 2 døgn efter modtagelse — forsvinde stille).
 *   1. opdaget ≥ RECEPTION_EMAIL_INGEST_SINCE (aktiveringen) — alt opdaget før er historik og kræver den EKSPLICITTE
 *      backfill (trin C, RECEPTION_BACKFILL_ENABLED). Mangler SINCE ⇒ intet indtag (fail closed).
 *   2. opdaget inden for EMAIL_INGEST_DISCOVERY_DAYS (= mail-sync'ens genforsøgsvindue for ubehandlede mails), så et
 *      genforsøg aldrig kan trække vilkårlig gammel historik ind.
 */
export const EMAIL_INGEST_DISCOVERY_DAYS = 14

/** ELTAs egne postkasser/domæne er aldrig en kundehenvendelse (sendte mails, interne videresendelser) */
const OWN_DOMAIN = /@eltasolar\.dk$/i

async function defaultCapability(): Promise<BackgroundCapability> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  return backgroundCapability(createAdminClient())
}

function mapOutcome(r: Awaited<ReturnType<typeof receptionBackgroundIngest>>): ChannelIntakeResult {
  if (r.outcome === 'disabled') return { outcome: 'disabled' }
  if (r.outcome === 'created' || r.outcome === 'appended') return { outcome: r.outcome, conversationId: r.conversationId }
  if (r.outcome === 'duplicate') return { outcome: 'duplicate', conversationId: r.conversationId }
  return { outcome: 'error', reason: r.outcome === 'error' ? r.error : 'unknown' }
}

/** Er mailen "ny" efter opdagelses-reglen? Ren funktion (testes for udfald på 49 t / 3 d / 7 d). */
export function emailDiscoveryEligibility(discoveredAtIso: unknown, env: Record<string, string | undefined>, nowMs: number): { ok: true } | { ok: false; reason: 'since_not_configured' | 'no_discovery_time' | 'discovered_before_activation' | 'discovery_window' } {
  const since = emailIngestSince(env)
  if (!since) return { ok: false, reason: 'since_not_configured' }
  const discovered = Date.parse(String(discoveredAtIso ?? ''))
  if (!Number.isFinite(discovered)) return { ok: false, reason: 'no_discovery_time' }
  if (discovered < since.getTime()) return { ok: false, reason: 'discovered_before_activation' }
  if (nowMs - discovered > EMAIL_INGEST_DISCOVERY_DAYS * 86_400_000) return { ok: false, reason: 'discovery_window' }
  return { ok: true }
}

/** Ny indgående mail (kaldes af mail-sync EFTER kobling/analyse, så kildens kobling er den endelige) */
export async function ingestEmailSource(emailId: string, deps: Deps = {}): Promise<ChannelIntakeResult> {
  const env = deps.env ?? process.env
  if (!emailIngestEnabled(env)) return { outcome: 'disabled' }
  try {
    const cap = deps.capability ?? await defaultCapability()
    const src = await cap.readSource('incoming_emails', emailId)
    if (!src.ok) return { outcome: src.error }
    const row = src.row as unknown as EmailSourceRow & { created_at: string | null }
    if (OWN_DOMAIN.test(String(row.sender_email ?? ''))) return { outcome: 'skipped', reason: 'own_mailbox' }
    const elig = emailDiscoveryEligibility(row.created_at, env, (deps.now ?? Date.now)())
    if (!elig.ok) return { outcome: 'skipped', reason: elig.reason }
    let form: Record<string, string> | null = null
    if (isFormSubmit(row)) {
      const body = await cap.readSourceBody('incoming_emails', emailId)
      if (!body.ok) return { outcome: body.error }
      const { extractFormSubmitFields } = await import('@/lib/utils/email-parser')
      form = extractFormSubmitFields(body.row.body_text as string | null, body.row.body_html as string | null)
    }
    const comm = emailToInbound({ ...row, form_fields: form })
    if (!comm) return { outcome: 'skipped', reason: 'ignored' }
    const r = await receptionBackgroundIngest(comm, `${comm.title}. ${comm.message}`, { capability: () => cap, cap, gate: 'email', env })
    return mapOutcome(r)
  } catch {
    return { outcome: 'error', reason: 'exception' }
  }
}

/**
 * Stage A-preflight 2026-11-19 (S2): et mislykket indtag (DB-timeout, afbrudt kørsel, fejl i reception_ingest) blev
 * ALDRIG forsøgt igen — mail-sync'ens genforsøg tager kun rækker der stadig er link_status 'pending', og en mail hvis
 * kobling lykkedes er ikke længere pending. Afstemningen her finder indgående mails der er opdaget inden for indtagsvinduet
 * (≥ SINCE og ≤ 14 dage), er færdigbehandlet af mail-sync'en (ikke 'pending'/'ignored'), ikke er fra ELTAs egne postkasser
 * og som IKKE har et henvendelses-item — og indtager dem via samme vej. Idempotent: reception_ingest + det unikke indeks
 * (source_table, source_id) giver højst ét item pr. mail; en samtidig kørsel ender som 'duplicate'.
 * Kun læsning med den læseklient mail-sync'en allerede har (service_role); skrivning KUN via ingestEmailSource.
 */
export const EMAIL_INTAKE_SWEEP_LIMIT = 25
export type IntakeCounts = Partial<Record<ChannelIntakeOutcome, number>>

/** Mail-id'er der skulle have en henvendelse men ikke har det (ren udvælgelse — testes uden DB) */
export function selectMissedEmailIds(candidates: Array<{ id: string; sender_email: string | null }>, ingested: Set<string>, limit = EMAIL_INTAKE_SWEEP_LIMIT): string[] {
  return candidates.filter((c) => !ingested.has(c.id) && !OWN_DOMAIN.test(String(c.sender_email ?? ''))).slice(0, limit).map((c) => c.id)
}

/** Opdagelsesvinduet afstemningen ser i: fra max(SINCE, nu − 14 dage). Fejl = Stage A ikke (gyldigt) slået til. */
export function emailIntakeSweepWindow(env: Record<string, string | undefined>, nowMs: number): { from: string } | { error: 'disabled' | 'since_not_configured' } {
  if (!emailIngestEnabled(env)) return { error: 'disabled' }
  const since = emailIngestSince(env)
  if (!since) return { error: 'since_not_configured' }
  return { from: new Date(Math.max(since.getTime(), nowMs - EMAIL_INGEST_DISCOVERY_DAYS * 86_400_000)).toISOString() }
}

/**
 * Indtag de udvalgte mails via den normale vej (ingestEmailSource — samme regler, samme kapabilitet). Kaldes af mail-sync'en,
 * som selv læser kandidaterne med sin egen klient — adapteren får aldrig den rå admin-klient.
 */
export async function ingestMissedEmailSources(ids: string[], deps: Deps = {}): Promise<IntakeCounts> {
  const counts: IntakeCounts = {}
  for (const id of ids.slice(0, EMAIL_INTAKE_SWEEP_LIMIT)) {
    const r = await ingestEmailSource(id, deps)
    counts[r.outcome] = (counts[r.outcome] ?? 0) + 1
  }
  return counts
}

/** Ny kundebesked i portalen (kaldes af sendPortalMessage EFTER at beskeden er gemt) */
export async function ingestPortalMessageSource(messageId: string, deps: Deps = {}): Promise<ChannelIntakeResult> {
  const env = deps.env ?? process.env
  if (!portalIngestEnabled(env)) return { outcome: 'disabled' }
  try {
    const cap = deps.capability ?? await defaultCapability()
    const src = await cap.readSource('portal_messages', messageId)
    if (!src.ok) return { outcome: src.error }
    const comm = portalToInbound(src.row as unknown as PortalSourceRow)
    if (!comm) return { outcome: 'skipped', reason: 'not_customer_message' }
    // Portal-token = stærk identitet: kunden er bekræftet af kilden (L3 i disclosure-politikken, deterministisk)
    // En besked med kun vedhæftninger er ikke "manglende indhold" — titlen ("Portalbesked (n vedhæftet)") er teksten
    const r = await receptionBackgroundIngest(comm, comm.message || comm.title, { capability: () => cap, cap, gate: 'portal', env })
    return mapOutcome(r)
  } catch {
    return { outcome: 'error', reason: 'exception' }
  }
}
