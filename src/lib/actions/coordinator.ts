'use server'

/**
 * Phase C2/C3/C7 — koordinator-handlinger (flag COORDINATOR_ENABLED, standard FRA).
 *
 * - getCoordinatorViewAction: identitet + forslag for én mail (read-only; filtreret til brugerens scope)
 * - decideCoordinatorSuggestionAction: medarbejderen godkender / ændrer / afviser et forslag. Godkendte handlinger UDFØRES
 *   via de eksisterende, gatede koblingsstier (linkEmailToCustomer, linkEmailToCase, createServiceCaseFromEmail,
 *   createLeadFromEmailAction). Idempotent: allerede udført → "uændret". Hver afgørelse auditeres (coordinator_decision).
 * - completeQueueItemAction / reopenQueueItemAction: ÉT behandlingssted (D2) — afslut lukker henvendelsen (Stage A) OG
 *   arkiverer mailen; genåbn gør det modsatte. Auditeret.
 * - rememberSenderAction: "Husk afsender" — tilføjer e-mail (eller firmadomæne) til kundens part via fase B's RPC'er
 *   (kun parties.manage + PARTIES_UI_ENABLED). Ingen ny skrivevej.
 *
 * Intet sker automatisk. Ingen ekstern kommunikation. Kun ID'er/koder i audit — aldrig mailindhold.
 */
import { revalidatePath } from 'next/cache'
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { insertAuditRow } from '@/lib/audit/insert-audit-row'
import { coordinatorEnabled, COORDINATOR_DISABLED_TEXT } from '@/lib/coordinator/feature-flag'
import { buildCoordinatorView, buildCoordinatorViews, loadConversationForEmail, type CoordinatorView } from '@/lib/coordinator/view'
import { SUGGESTION_KINDS, type SuggestionKind } from '@/lib/coordinator/suggestions'
import { buildQueue, countOpenQueue, type QueueResult } from '@/lib/coordinator/queue'
import { isFreeMailDomain, isNonCustomerDomain } from '@/lib/email/free-mail-domains'
import { normalizeSender } from '@/lib/email/supplier-senders'
import {
  archiveEmail, createLeadFromEmailAction, linkEmailToCase, linkEmailToCustomer, markEmailAsRead, unarchiveEmail,
} from '@/lib/actions/incoming-emails'
import { createServiceCaseFromEmail } from '@/lib/actions/service-cases'
import { createCallbackFromHenvendelse, markHenvendelseHandled, setHenvendelseStatus } from '@/lib/actions/henvendelser'
import { ensureRegisterPartyAction, updatePartyAction } from '@/lib/actions/parties'
import { partiesUiEnabled } from '@/lib/parties/feature-flag'

type R<T> = { success: true; data: T } | { success: false; error: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

async function requireCoordinatorCtx() {
  if (!coordinatorEnabled()) return { error: COORDINATOR_DISABLED_TEXT } as const
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('inbox.view')) return { error: 'Du har ikke adgang til mail-indbakken' } as const
    return { ctx } as const
  } catch {
    return { error: 'Ikke logget ind' } as const
  }
}

export async function getCoordinatorViewAction(emailId: string): Promise<R<CoordinatorView>> {
  if (!isId(emailId)) return { success: false, error: 'Ugyldig mail' }
  const g = await requireCoordinatorCtx(); if ('error' in g) return { success: false, error: g.error as string }
  const r = await buildCoordinatorView(g.ctx.supabase, createAdminClient(), emailId, { technical: g.ctx.hasPermission('settings.manage') })
  return r.ok ? { success: true, data: r.view } : { success: false, error: r.error }
}

export interface DecisionInput {
  emailId: string
  decision: 'accept' | 'change' | 'reject'
  /** Det udførte (ved accept = forslaget; ved change = medarbejderens valg) */
  kind: SuggestionKind
  customerId?: string | null
  caseId?: string | null
  /** Hvad systemet foreslog (til måling af accepteret/ændret/afvist) */
  suggested?: { kind: SuggestionKind; level: string; customerId?: string | null; caseId?: string | null } | null
}

const EXECUTABLE: ReadonlySet<SuggestionKind> = new Set(['link_customer', 'link_case', 'create_service_case', 'create_lead'])

export async function decideCoordinatorSuggestionAction(input: DecisionInput): Promise<R<{ result: 'executed' | 'unchanged' | 'recorded'; caseId?: string | null; leadId?: string | null }>> {
  if (!isId(input?.emailId)) return { success: false, error: 'Ugyldig mail' }
  if (!['accept', 'change', 'reject'].includes(input.decision)) return { success: false, error: 'Ugyldig afgørelse' }
  if (!(SUGGESTION_KINDS as readonly string[]).includes(input.kind)) return { success: false, error: 'Ugyldig handling' }
  if (input.customerId != null && !isId(input.customerId)) return { success: false, error: 'Ugyldig kunde' }
  if (input.caseId != null && !isId(input.caseId)) return { success: false, error: 'Ugyldig sag' }
  const g = await requireCoordinatorCtx(); if ('error' in g) return { success: false, error: g.error as string }
  const db = g.ctx.supabase

  const mail = await db.from('incoming_emails').select('id, customer_id, linked_by, service_case_id').eq('id', input.emailId).maybeSingle()
  if (mail.error || !mail.data) return { success: false, error: 'Mailen findes ikke eller du har ikke adgang' }
  const m = mail.data as { customer_id: string | null; linked_by: string | null; service_case_id: string | null }

  let result: 'executed' | 'unchanged' | 'recorded' = 'recorded'
  let caseId: string | null = input.caseId ?? null
  let leadId: string | null = null
  let customerId: string | null = input.customerId ?? null

  if (input.decision !== 'reject' && EXECUTABLE.has(input.kind)) {
    // Mål skal være synlige for brugeren selv (RLS) — et forslag giver aldrig adgang ud over scope
    if (customerId) { const c = await db.from('customers').select('id').eq('id', customerId).maybeSingle(); if (!c.data) return { success: false, error: 'Kunden findes ikke eller du har ikke adgang' } }
    let caseCustomer: string | null = null
    if (caseId) {
      const c = await db.from('service_cases').select('id, customer_id').eq('id', caseId).maybeSingle()
      if (!c.data) return { success: false, error: 'Sagen findes ikke eller du har ikke adgang' }
      caseCustomer = (c.data as { customer_id: string | null }).customer_id
      if (customerId && caseCustomer && caseCustomer !== customerId) return { success: false, error: 'Sagen hører til en anden kunde' }
    }

    if (input.kind === 'link_customer' || input.kind === 'link_case') {
      const targetCustomer = customerId ?? caseCustomer ?? m.customer_id
      if (!targetCustomer) return { success: false, error: 'Vælg en kunde først' }
      const humanSame = m.customer_id === targetCustomer && (m.linked_by === 'manual' || m.linked_by === 'manual-create')
      if (!humanSame) {
        const l = await linkEmailToCustomer(input.emailId, targetCustomer)
        if (!l.success) return { success: false, error: l.error ?? 'Mailen kunne ikke kobles til kunden' }
        result = 'executed'
      }
      customerId = targetCustomer
      if (caseId && m.service_case_id !== caseId) {
        const l = await linkEmailToCase(input.emailId, caseId)
        if (!l.success) return { success: false, error: l.error ?? 'Mailen kunne ikke kobles til sagen' }
        result = 'executed'
      }
      if (result !== 'executed') result = 'unchanged'
    } else if (input.kind === 'create_service_case') {
      // Idempotent: findes der allerede en sag oprettet fra denne mail, genbruges den
      const existing = await db.from('service_cases').select('id').eq('source_email_id', input.emailId).limit(1)
      const ex = ((existing.data ?? []) as Array<{ id: string }>)[0]
      if (ex) { caseId = ex.id; result = 'unchanged' }
      else {
        if (customerId && m.customer_id !== customerId) {
          const l = await linkEmailToCustomer(input.emailId, customerId)
          if (!l.success) return { success: false, error: l.error ?? 'Mailen kunne ikke kobles til kunden' }
        }
        const c = await createServiceCaseFromEmail(input.emailId)
        if (!c.success || !c.data) return { success: false, error: c.error ?? 'Sagen kunne ikke oprettes' }
        caseId = c.data.id
        result = 'executed'
      }
      if (caseId && (customerId ?? m.customer_id) && m.service_case_id !== caseId) await linkEmailToCase(input.emailId, caseId)
    } else if (input.kind === 'create_lead') {
      const l = await createLeadFromEmailAction(input.emailId)
      if (!l.success) return { success: false, error: l.error ?? 'Lead kunne ikke oprettes' }
      leadId = l.data?.leadId ?? null
      result = l.data?.existed ? 'unchanged' : 'executed'
    }

    // Stage A: et udført kunde-/sagsforslag på henvendelsen afsluttes (proposed → executed, beslutter = brugeren)
    if (result === 'executed') await settleStageAProposals(db, g.ctx.userId, input.emailId, input.kind, caseId ?? customerId)
  }

  await insertAuditRow({
    user_id: g.ctx.userId, entity_type: 'incoming_email', entity_id: input.emailId, action: 'coordinator_decision',
    action_description: `Forslag ${input.decision}: ${input.kind}`,
    metadata: {
      version: 'c3-v1', decision: input.decision, result,
      suggested: input.suggested ? { kind: input.suggested.kind, level: input.suggested.level, customer_id: input.suggested.customerId ?? null, case_id: input.suggested.caseId ?? null } : null,
      chosen: { kind: input.kind, customer_id: customerId, case_id: caseId, lead_id: leadId },
    },
  })
  revalidatePath('/dashboard/arbejdsko')
  return { success: true, data: { result, caseId, leadId } }
}

async function settleStageAProposals(db: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>['supabase'], userId: string, emailId: string, kind: SuggestionKind, ref: string | null) {
  try {
    const conv = await loadConversationForEmail(db, emailId)
    if (!conv || !ref) return
    const types = kind === 'link_customer' ? ['create_customer_proposal'] : kind === 'create_service_case' || kind === 'link_case' ? ['create_case_proposal'] : []
    if (!types.length) return
    await db.from('conversation_actions').update({ state: 'executed', executed_ref: ref.slice(0, 100), decided_by: userId, decided_at: new Date().toISOString() })
      .eq('conversation_id', conv.id).in('action_type', types).eq('state', 'proposed')
  } catch { /* best effort — selve handlingen er udført og auditeret */ }
}

export async function completeQueueItemAction(emailId: string, opts: { reason?: 'handled' | 'answered_outlook' | 'not_relevant' } = {}): Promise<R<{ conversationClosed: boolean; mailArchived: boolean }>> {
  if (!isId(emailId)) return { success: false, error: 'Ugyldig mail' }
  const g = await requireCoordinatorCtx(); if ('error' in g) return { success: false, error: g.error as string }
  const reason = opts.reason ?? 'handled'
  if (!['handled', 'answered_outlook', 'not_relevant'].includes(reason)) return { success: false, error: 'Ugyldig årsag' }
  const conv = await loadConversationForEmail(g.ctx.supabase, emailId)
  let conversationClosed = false
  if (conv && conv.status !== 'handled') {
    if (!g.ctx.hasPermission('conversations.manage')) return { success: false, error: 'Du kan ikke afslutte henvendelsen (mangler rettighed)' }
    const h = await markHenvendelseHandled(conv.id)
    if (!h.success) return { success: false, error: h.error }
    conversationClosed = true
  }
  await markEmailAsRead(emailId)
  const a = await archiveEmail(emailId)
  if (!a.success) return { success: false, error: a.error ?? 'Mailen kunne ikke arkiveres' }
  await insertAuditRow({ user_id: g.ctx.userId, entity_type: 'incoming_email', entity_id: emailId, action: 'coordinator_completed',
    action_description: `Behandlet (${reason})`, metadata: { reason, conversation_id: conv?.id ?? null, conversation_closed: conversationClosed } })
  revalidatePath('/dashboard/arbejdsko')
  return { success: true, data: { conversationClosed, mailArchived: true } }
}

export async function reopenQueueItemAction(emailId: string): Promise<R<null>> {
  if (!isId(emailId)) return { success: false, error: 'Ugyldig mail' }
  const g = await requireCoordinatorCtx(); if ('error' in g) return { success: false, error: g.error as string }
  const conv = await loadConversationForEmail(g.ctx.supabase, emailId)
  if (conv && conv.status === 'handled') {
    if (!g.ctx.hasPermission('conversations.manage')) return { success: false, error: 'Du kan ikke genåbne henvendelsen (mangler rettighed)' }
    const s = await setHenvendelseStatus(conv.id, 'open')
    if (!s.success) return { success: false, error: s.error }
  }
  const u = await unarchiveEmail(emailId)
  if (!u.success) return { success: false, error: u.error ?? 'Mailen kunne ikke genåbnes' }
  await insertAuditRow({ user_id: g.ctx.userId, entity_type: 'incoming_email', entity_id: emailId, action: 'coordinator_reopened', action_description: 'Genåbnet', metadata: { conversation_id: conv?.id ?? null } })
  revalidatePath('/dashboard/arbejdsko')
  return { success: true, data: null }
}

/**
 * "Husk afsender": bekræft at afsenderens e-mail (scope 'email') eller firmadomæne (scope 'domain') hører til kunden.
 * Kun parties.manage. Gratis-/egne domæner kan aldrig huskes som domæne. Genlæser partens lister og tilføjer (additivt).
 */
export async function rememberSenderAction(input: { emailId: string; customerId: string; scope: 'email' | 'domain' }): Promise<R<{ partyId: string; added: string | null }>> {
  if (!isId(input?.emailId) || !isId(input?.customerId) || !['email', 'domain'].includes(input.scope)) return { success: false, error: 'Ugyldige oplysninger' }
  const g = await requireCoordinatorCtx(); if ('error' in g) return { success: false, error: g.error as string }
  if (!g.ctx.hasPermission('parties.manage')) return { success: false, error: 'Kun medarbejdere med partsrettighed kan huske afsendere' }
  const db = g.ctx.supabase
  const mail = await db.from('incoming_emails').select('sender_email, original_sender_email, is_forwarded').eq('id', input.emailId).maybeSingle()
  if (!mail.data) return { success: false, error: 'Mailen findes ikke eller du har ikke adgang' }
  const md = mail.data as { sender_email: string | null; original_sender_email: string | null; is_forwarded: boolean | null }
  const sender = normalizeSender(md.is_forwarded ? md.original_sender_email : md.sender_email)
  if (!sender) return { success: false, error: 'Afsenderen kunne ikke aflæses' }
  const domain = sender.split('@')[1]
  if (isNonCustomerDomain(domain)) return { success: false, error: 'ELTA\'s egne adresser og formular-relæet kan ikke huskes' }
  if (input.scope === 'domain' && isFreeMailDomain(domain)) return { success: false, error: 'Et gratis maildomæne kan ikke huskes som firmadomæne — husk e-mailadressen i stedet' }
  const cust = await db.from('customers').select('id').eq('id', input.customerId).maybeSingle()
  if (!cust.data) return { success: false, error: 'Kunden findes ikke eller du har ikke adgang' }
  const ens = await ensureRegisterPartyAction('customer', input.customerId)
  if (!ens.success || !ens.data) return { success: false, error: ens.error ?? 'Kundens part kunne ikke findes' }
  const partyId = ens.data.partyId
  const p = await db.from('parties').select('display_name, organisation_party_id, verified_emails, verified_domains, vat_number').eq('id', partyId).maybeSingle()
  if (!p.data) return { success: false, error: 'Parten kunne ikke læses' }
  const pd = p.data as { display_name: string; organisation_party_id: string | null; verified_emails: string[]; verified_domains: string[]; vat_number: string | null }
  const value = input.scope === 'email' ? sender : domain
  const list = input.scope === 'email' ? pd.verified_emails : pd.verified_domains
  if (list.includes(value)) return { success: true, data: { partyId, added: null } }
  const u = await updatePartyAction({ partyId, displayName: pd.display_name, organisationPartyId: pd.organisation_party_id,
    verifiedEmails: input.scope === 'email' ? [...pd.verified_emails, value] : pd.verified_emails,
    verifiedDomains: input.scope === 'domain' ? [...pd.verified_domains, value] : pd.verified_domains, vatNumber: pd.vat_number })
  if (!u.success) return { success: false, error: u.error ?? 'Afsenderen kunne ikke huskes' }
  // Efterkontrol (update_party erstatter hele listen → et samtidigt "Husk" kan være tabt; genlæs)
  const after = await db.from('parties').select('verified_emails, verified_domains').eq('id', partyId).maybeSingle()
  const ad = after.data as { verified_emails: string[]; verified_domains: string[] } | null
  if (!ad || !(input.scope === 'email' ? ad.verified_emails : ad.verified_domains).includes(value)) return { success: false, error: 'Afsenderen blev ikke gemt (samtidig ændring) — prøv igen' }
  await insertAuditRow({ user_id: g.ctx.userId, entity_type: 'incoming_email', entity_id: input.emailId, action: 'coordinator_sender_remembered',
    action_description: `Husk afsender (${input.scope})`, metadata: { party_id: partyId, customer_id: input.customerId, scope: input.scope } })
  return { success: true, data: { partyId, added: input.scope } }
}

export async function listWorkQueueAction(search?: string | null): Promise<R<QueueResult & { canManageConversations: boolean; canRemember: boolean; userId: string }>> {
  const g = await requireCoordinatorCtx(); if ('error' in g) return { success: false, error: g.error as string }
  try {
    const r = await buildQueue(g.ctx.supabase, createAdminClient(), g.ctx.userId, { search: typeof search === 'string' ? search : null })
    return { success: true, data: { ...r, canManageConversations: g.ctx.hasPermission('conversations.manage'), canRemember: g.ctx.hasPermission('parties.manage') && partiesUiEnabled(), userId: g.ctx.userId } }
  } catch {
    return { success: false, error: 'Arbejdskøen kunne ikke indlæses' }
  }
}

/** Tæller til sidebaren (billig). 0 når flaget er FRA eller brugeren mangler adgang. */
export async function getWorkQueueCountAction(): Promise<number> {
  if (!coordinatorEnabled()) return 0
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('inbox.view')) return 0
    return await countOpenQueue(ctx.supabase)
  } catch { return 0 }
}

/**
 * Batch-afslutning KUN for lavrisiko-poster: serveren genberegner hver post og afslutter kun dem, hvor forslaget er
 * "ingen handling" for en automatisk afsender eller en medarbejder. Alt andet springes over (aldrig batch på usikre
 * identiteter, tvetydige kundematch eller sager).
 */
export async function completeLowRiskBatchAction(emailIds: string[]): Promise<R<{ completed: number; skipped: number }>> {
  const g = await requireCoordinatorCtx(); if ('error' in g) return { success: false, error: g.error as string }
  const ids = (Array.isArray(emailIds) ? emailIds : []).filter(isId).slice(0, 50)
  const views = await buildCoordinatorViews(g.ctx.supabase, createAdminClient(), ids, { technical: false })
  let completed = 0, skipped = 0
  for (const id of ids) {
    const v = views.get(id)
    const safe = !!v && v.suggestions.primary.kind === 'no_action' && (v.identity.kind === 'automated' || v.identity.kind === 'employee') && !v.conversation
    if (!safe) { skipped++; continue }
    const r = await completeQueueItemAction(id, { reason: 'not_relevant' })
    if (r.success) completed++; else skipped++
  }
  return { success: true, data: { completed, skipped } }
}

/**
 * Stage A: et tilbagekald som Stage A foreslog (eller blokerede ved lav sikkerhed) oprettes med ét klik fra køen.
 * Kræver at kunden er koblet af en medarbejder (manuel mailkobling bekræfter henvendelsens kunde via 00250-triggeren).
 * Genbruger createCallbackFromHenvendelse (idempotent: højst ét åbent tilbagekald pr. kunde). Den blokerede række
 * forbliver låst som revisionsspor.
 */
export async function createCallbackFromQueueAction(emailId: string): Promise<R<{ existing: boolean }>> {
  if (!isId(emailId)) return { success: false, error: 'Ugyldig mail' }
  const g = await requireCoordinatorCtx(); if ('error' in g) return { success: false, error: g.error as string }
  const conv = await loadConversationForEmail(g.ctx.supabase, emailId)
  if (!conv) return { success: false, error: 'Mailen har ingen henvendelse at oprette tilbagekald fra' }
  if (conv.customerMatchState !== 'confirmed') return { success: false, error: 'Kobl mailen til kunden først (godkend kundeforslaget) — så kan tilbagekaldet oprettes' }
  const r = await createCallbackFromHenvendelse(conv.id)
  if (!r.success) return { success: false, error: r.error }
  await insertAuditRow({ user_id: g.ctx.userId, entity_type: 'incoming_email', entity_id: emailId, action: 'coordinator_callback_created',
    action_description: r.data.existing ? 'Tilbagekald fandtes allerede' : 'Tilbagekald oprettet fra arbejdskøen', metadata: { conversation_id: conv.id, existing: r.data.existing } })
  revalidatePath('/dashboard/arbejdsko')
  return { success: true, data: r.data }
}
