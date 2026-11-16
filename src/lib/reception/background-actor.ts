/**
 * Baggrundsaktøren `ai_receptionist` (final review S1/S2). Server-only — bevidst IKKE 'use server' (ingen server-action:
 * kan ikke kaldes fra en browser) og aldrig importeret i klientkode (scripts/assert-server-only-helpers.ts).
 *
 * Til indtag UDEN indlogget medarbejder: nat/weekend-telefon, web-chat, portal-baggrundsbehandling, udbyder-webhooks.
 * Supabase giver kun service_role som server-identitet, derfor er aktøren snævret ind i tre lag:
 *   1. KODE: aktøren får ALDRIG den rå admin-klient. Den får en kapabilitet med
 *        - `read(table)` → KUN `.select()` på en allowlist af tabeller (deterministisk kunde-/kontakt-/sagsopslag), og
 *        - `ingest(payload)` → KUN rpc('reception_ingest').
 *      Ingen insert/update/delete/upsert, ingen storage, ingen andre RPC'er, ingen afsendelse.
 *   2. DATABASE: reception_ingest afleder kildens identitet selv og giver service_role-kald KUN 'proposed'/'blocked'
 *      handlinger (aldrig 'approved'/udført), ingen tildeling til personer, intake_actor='ai_receptionist',
 *      created_by=NULL; conversation_actions-værnet afviser at en ikke-bruger godkender/udfører et AI-forslag.
 *   3. AUDIT: reception_ingest skriver audit_logs i samme transaktion (actor=ai_receptionist, mode=background, user_id NULL).
 * Flag: RECEPTION_BACKGROUND_ENABLED (standard FRA). Intet kalder modulet i fase 2.
 *
 * MÅ automatisk: indtage, deterministisk kunde-/kontaktopslag, oprette/opdatere henvendelsens tilstand, foreslå
 * opgave/tilbageringning, foreslå kunde/sag (efter politikken), markere hastegrad, bede om menneskelig gennemgang.
 * MÅ IKKE: love pris/dato, afgøre garanti/compliance, ændre faktura, annullere, sende nødpersonale, sende ekstern
 * kommunikation (der findes ingen afsender her — EXTERNAL_SENDS_ENABLED er konstant false).
 */
import type { InboundCommunication } from './contract'
import { runReceptionTurn, type ReceptionTurn } from './engine'
import { buildIngestPayload, callReceptionIngest, enginePortsFor, type IngestResult } from './henvendelser-core'
import { receptionBackgroundEnabled, receptionLlmEnabled } from './flags'

/** Tabeller baggrundsaktøren må LÆSE (kun select) — deterministisk identitet og sagsopslag */
export const BACKGROUND_READ_TABLES = ['customers', 'customer_contacts', 'leads', 'service_cases'] as const
/** Den ENESTE skrivevej */
export const BACKGROUND_RPC = 'reception_ingest' as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface BackgroundCapability {
  /** Læse-port med samme form som en supabase-klient, men kun `.from(<allowlist>).select(...)` */
  readPort: { from: (table: string) => { select: (...args: unknown[]) => unknown } }
  ingest: (payload: Record<string, unknown>) => Promise<IngestResult>
}

export class BackgroundCapabilityError extends Error {}

/** Snævrer en admin-klient ind til aktørens kapabilitet. Den rå klient forlader aldrig denne funktion. */
export function backgroundCapability(admin: Db): BackgroundCapability {
  return {
    readPort: {
      from: (table: string) => {
        if (!(BACKGROUND_READ_TABLES as readonly string[]).includes(table)) throw new BackgroundCapabilityError(`baggrundsaktøren må ikke læse ${table}`)
        const qb = admin.from(table)
        return {
          select: (...args: unknown[]) => {
            // Review F9: ingen indlejrede relationer (fx 'id, incoming_emails(*)') — det ville læse uden for allowlisten
            if (typeof args[0] === 'string' && /[()]/.test(args[0])) throw new BackgroundCapabilityError('baggrundsaktøren må ikke læse relationer')
            return qb.select(...args)
          },
        }
      },
    },
    ingest: (payload) => callReceptionIngest((fn, args) => {
      if (fn !== BACKGROUND_RPC) throw new BackgroundCapabilityError(`baggrundsaktøren må ikke kalde ${String(fn)}`)
      return admin.rpc(BACKGROUND_RPC, args)
    }, payload),
  }
}

export type BackgroundOutcome =
  | { outcome: 'disabled' }
  | { outcome: 'created'; conversationId: string; proposals: number; urgency: ReceptionTurn['urgency']; handoff: boolean }
  | { outcome: 'duplicate'; conversationId: string | null }
  | { outcome: 'error'; error: string }

/**
 * Indtag én normaliseret kommunikation som baggrundsaktør. `text` er beskedens indhold (null = kunne ikke leveres).
 * Svaret til afsenderen (turn.reply) returneres IKKE herfra — en kanal-adapter med sin egen godkendte afsendelse må
 * tage det i brug i en senere fase. Her sendes intet.
 */
export async function receptionBackgroundIngest(
  comm: InboundCommunication, text: string | null,
  deps: { capability: () => BackgroundCapability; env?: Record<string, string | undefined> },
): Promise<BackgroundOutcome> {
  const env = deps.env ?? process.env
  if (!receptionBackgroundEnabled(env)) return { outcome: 'disabled' }
  const cap = deps.capability()
  const ports = enginePortsFor(cap.readPort, { confirmedCustomerId: comm.customer.customerId, candidateCustomerId: comm.customer.candidateId })
  if (receptionLlmEnabled(env)) {
    const { llmClassify } = await import('./llm-classify')
    ports.classify = (t, kw) => llmClassify(t, kw)
  }
  const turn = await runReceptionTurn({
    channel: comm.channel, text, conversationKey: comm.dedupeKey,
    sender: { phone: comm.sender.phone, email: comm.sender.email, contactId: comm.sender.contactId, customerNumber: comm.sender.customerNumber },
  }, ports)
  // execute: false → alle handlinger gemmes som forslag (databasen håndhæver det også for service_role)
  const r = await cap.ingest(buildIngestPayload(comm, turn, { execute: false }))
  if (r.outcome === 'created') return { outcome: 'created', conversationId: r.conversationId, proposals: r.actions.filter((a) => a.state === 'proposed').length, urgency: turn.urgency, handoff: !!turn.handoff }
  if (r.outcome === 'duplicate') return { outcome: 'duplicate', conversationId: r.conversationId }
  return { outcome: 'error', error: r.error }
}
