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
 * Den rå admin-klient forlader aldrig backgroundCapability(): adapteren ser kun readSource (faste kolonner),
 * readPort (select på allowlist) og ingest (kun rpc reception_ingest).
 */
import { emailToInbound, isFormSubmit, portalToInbound, type EmailSourceRow, type PortalSourceRow } from './adapters'
import { backgroundCapability, receptionBackgroundIngest, type BackgroundCapability } from './background-actor'
import { emailIngestEnabled, portalIngestEnabled } from './flags'

export type ChannelIntakeOutcome = 'disabled' | 'created' | 'appended' | 'duplicate' | 'skipped' | 'read_error' | 'not_found' | 'error'
export interface ChannelIntakeResult { outcome: ChannelIntakeOutcome; reason?: string; conversationId?: string | null }

interface Deps { env?: Record<string, string | undefined>; capability?: BackgroundCapability }

/**
 * Kun NYE mails: en mail ældre end dette (modtaget-tidspunkt) indtages ikke automatisk — heller ikke via mail-sync'ens
 * genforsøg af ubehandlede mails. Historik er et særskilt, godkendt trin (C: "Hent nye fra mail/portal", afgrænset).
 */
export const EMAIL_INGEST_MAX_AGE_HOURS = 48

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

/** Ny indgående mail (kaldes af mail-sync EFTER kobling/analyse, så kildens kobling er den endelige) */
export async function ingestEmailSource(emailId: string, deps: Deps = {}): Promise<ChannelIntakeResult> {
  const env = deps.env ?? process.env
  if (!emailIngestEnabled(env)) return { outcome: 'disabled' }
  try {
    const cap = deps.capability ?? await defaultCapability()
    const src = await cap.readSource('incoming_emails', emailId)
    if (!src.ok) return { outcome: src.error }
    const row = src.row as unknown as EmailSourceRow & { body_text: string | null; body_html: string | null }
    if (OWN_DOMAIN.test(String(row.sender_email ?? ''))) return { outcome: 'skipped', reason: 'own_mailbox' }
    const received = Date.parse(String(row.received_at ?? ''))
    if (!Number.isFinite(received) || Date.now() - received > EMAIL_INGEST_MAX_AGE_HOURS * 3_600_000) return { outcome: 'skipped', reason: 'not_new' }
    let form: Record<string, string> | null = null
    if (isFormSubmit(row)) {
      const { extractFormSubmitFields } = await import('@/lib/utils/email-parser')
      form = extractFormSubmitFields(row.body_text, row.body_html)
    }
    const comm = emailToInbound({ ...row, form_fields: form })
    if (!comm) return { outcome: 'skipped', reason: 'ignored' }
    const r = await receptionBackgroundIngest(comm, `${comm.title}. ${comm.message}`, { capability: () => cap, cap, gate: 'email', env })
    return mapOutcome(r)
  } catch {
    return { outcome: 'error', reason: 'exception' }
  }
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
