/**
 * C2/C3/C7 — visningsmodel for én mail i arbejdskøen/mailvisningen. Server-modul (IKKE 'use server').
 *
 * Beregner med service-role (load-identity), men ALT der vises filtreres gennem brugerens egen klient (RLS-scope, D5):
 * kandidat-kunder og sager brugeren ikke kan læse fjernes. Tekniske koder/regler returneres kun til admin (settings.manage).
 */
import { loadCoordinatorContext, type CoordinatorContext, type Registry } from './load-identity'
import { buildSuggestions, type Suggestion, type SuggestionSet, type CaseOption } from './suggestions'
import { LEVEL_TEXT, type IdentityLevel, type SenderKind } from './identity'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface ViewCustomer { id: string; name: string; customerNumber: string | null; phone: string | null; email: string | null; address: string | null; autoCreated: boolean }
export interface ViewCase { id: string; caseNumber: string; title: string | null; status: string; customerId: string | null; open: boolean; updatedAt: string }
export interface ViewConversation {
  id: string; status: string; urgency: string | null; assignedProfileId: string | null; handledAt: string | null; matchVersion: number
  customerMatchState: string | null; callbackRequested: boolean; noiseActions: number; openProposals: number
}
export interface CoordinatorView {
  emailId: string
  subject: string | null
  receivedAt: string
  sender: { email: string | null; name: string | null; forwardedBy: string | null; webForm: boolean }
  identity: { kind: SenderKind; level: IdentityLevel; levelText: string; explanation: string[]; primaryLabel: string | null }
  suggestions: SuggestionSet
  customers: Record<string, ViewCustomer>
  cases: ViewCase[]
  linked: { customerId: string | null; serviceCaseId: string | null; linkedBy: string | null; human: boolean }
  conversation: ViewConversation | null
  status: { archived: boolean; ignored: boolean; handled: boolean; answeredAt: string | null; reliableSignal: boolean }
  form: CoordinatorContext['form']
  /** Kun admin (settings.manage) */
  technical: null | { identityVersion: string; suggestionVersion: string; codes: string[]; evidence: Array<{ id: string; level: string; evidence: string[] }>; conflicts: string[]; classification: unknown }
}

export type ViewResult = { ok: true; view: CoordinatorView } | { ok: false; error: string }

const OPEN = (c: { closedAt: string | null; status: string }) => !c.closedAt && c.status !== 'closed' && c.status !== 'converted'

/** Find Stage A-henvendelsen bag mailen (brugerens klient → kun hvis brugeren må se den) */
export async function loadConversationForEmail(userDb: Db, emailId: string): Promise<ViewConversation | null> {
  const it = await userDb.from('conversation_items').select('conversation_id').eq('source_table', 'incoming_emails').eq('source_id', emailId).limit(1)
  const convId = ((it.data ?? []) as Array<{ conversation_id: string }>)[0]?.conversation_id
  if (!convId) return null
  const c = await userDb.from('conversations').select('id, status, urgency, assigned_profile_id, handled_at, match_version, customer_match_state').eq('id', convId).maybeSingle()
  if (!c.data) return null
  const a = await userDb.from('conversation_actions').select('action_type, state').eq('conversation_id', convId).limit(200)
  const acts = (a.data ?? []) as Array<{ action_type: string; state: string }>
  const r = c.data as Record<string, unknown>
  return {
    id: String(r.id), status: String(r.status), urgency: (r.urgency as string | null) ?? null, assignedProfileId: (r.assigned_profile_id as string | null) ?? null,
    handledAt: (r.handled_at as string | null) ?? null, matchVersion: Number(r.match_version ?? 0), customerMatchState: (r.customer_match_state as string | null) ?? null,
    callbackRequested: acts.some((x) => x.action_type === 'create_callback' && (x.state === 'proposed' || x.state === 'blocked')),
    noiseActions: acts.filter((x) => x.action_type === 'append_communication').length,
    openProposals: acts.filter((x) => x.state === 'proposed' && x.action_type !== 'append_communication').length,
  }
}

export async function buildCoordinatorView(userDb: Db, adminDb: Db, emailId: string, opts: { technical: boolean; registry?: Registry; skipAccessCheck?: boolean }): Promise<ViewResult> {
  // Adgang til selve mailen: brugerens egen klient (00246-scope)
  if (!opts.skipAccessCheck) {
    const own = await userDb.from('incoming_emails').select('id').eq('id', emailId).maybeSingle()
    if (own.error || !own.data) return { ok: false, error: 'Mailen findes ikke eller du har ikke adgang' }
  }
  const loaded = await loadCoordinatorContext(adminDb, emailId, opts.registry)
  if (!loaded.ok) return loaded
  const ctx = loaded.ctx
  const conversation = await loadConversationForEmail(userDb, emailId)

  // Synlighed (RLS) for kandidat-kunder og sager
  const custIds = Object.keys(ctx.customersById)
  const caseIds = ctx.cases.map((c) => c.id)
  const visCust = new Set<string>()
  const visCase = new Set<string>()
  if (custIds.length) { const r = await userDb.from('customers').select('id').in('id', custIds); for (const x of (r.data ?? []) as Array<{ id: string }>) visCust.add(x.id) }
  if (caseIds.length) { const r = await userDb.from('service_cases').select('id').in('id', caseIds); for (const x of (r.data ?? []) as Array<{ id: string }>) visCase.add(x.id) }

  const identity = { ...ctx.identity }
  const visibleCand = (c: { customerId: string | null; type: string } | null) => !!c && (c.customerId ? visCust.has(c.customerId) : c.type !== 'customer')
  const hiddenCount = [identity.primary, ...identity.alternatives].filter((c) => c && c.customerId && !visCust.has(c.customerId)).length
  identity.primary = visibleCand(identity.primary) ? identity.primary : null
  identity.alternatives = identity.alternatives.filter(visibleCand)
  const cases = ctx.cases.filter((c) => visCase.has(c.id))

  const suggestions = buildSuggestions({
    classification: ctx.classification, identity,
    cases: cases.map((c) => ({ id: c.id, caseNumber: c.caseNumber, customerId: c.customerId, title: c.title, status: c.status, closedAt: c.closedAt, isProposal: c.isProposal, updatedAt: c.updatedAt })),
    mentionedCaseNumbers: ctx.signals.caseNumbers, threadCaseIds: ctx.threadCaseIds.filter((id) => visCase.has(id)),
    linked: { customerId: ctx.email.customerId && visCust.has(ctx.email.customerId) ? ctx.email.customerId : null, linkedBy: ctx.email.linkedBy, serviceCaseId: ctx.email.serviceCaseId && visCase.has(ctx.email.serviceCaseId) ? ctx.email.serviceCaseId : null },
    stageA: conversation ? { urgency: conversation.urgency, callbackRequested: conversation.callbackRequested } : null,
    answered: !!ctx.answeredAt,
  })
  // Et forslag må aldrig pege på noget skjult
  const okSug = (s: Suggestion) => (!s.customerId || visCust.has(s.customerId)) && (!s.caseId || visCase.has(s.caseId))
  suggestions.alternatives = suggestions.alternatives.filter(okSug)
  suggestions.caseOptions = suggestions.caseOptions.filter((o: CaseOption) => visCase.has(o.caseId))
  if (!okSug(suggestions.primary)) suggestions.primary = { kind: 'manual_review', level: 'uncertain', customerId: null, caseId: null, reasons: ['Vurder selv'], codes: ['hidden_target'] }

  const customers: Record<string, ViewCustomer> = {}
  for (const [id, c] of Object.entries(ctx.customersById)) if (visCust.has(id)) customers[id] = c
  const explanation = [...identity.explanation]
  if (hiddenCount) explanation.push('Der findes også match du ikke har adgang til')

  const handled = !!conversation?.handledAt || conversation?.status === 'handled'
  return {
    ok: true,
    view: {
      emailId, subject: ctx.email.subject, receivedAt: ctx.email.receivedAt,
      sender: { email: ctx.email.effectiveSender, name: ctx.email.senderName, forwardedBy: identity.forwardedBy, webForm: ctx.email.webForm },
      identity: { kind: identity.kind, level: identity.level, levelText: LEVEL_TEXT[identity.level], explanation, primaryLabel: identity.primary?.label ?? null },
      suggestions, customers,
      cases: cases.map((c) => ({ id: c.id, caseNumber: c.caseNumber, title: c.title, status: c.status, customerId: c.customerId, open: OPEN(c), updatedAt: c.updatedAt })),
      linked: { customerId: ctx.email.customerId && visCust.has(ctx.email.customerId) ? ctx.email.customerId : null, serviceCaseId: ctx.email.serviceCaseId && visCase.has(ctx.email.serviceCaseId) ? ctx.email.serviceCaseId : null,
        linkedBy: ctx.email.linkedBy, human: ctx.email.linkedBy === 'manual' || ctx.email.linkedBy === 'manual-create' },
      conversation,
      status: { archived: ctx.email.isArchived, ignored: ctx.email.linkStatus === 'ignored', handled, answeredAt: ctx.answeredAt, reliableSignal: handled || !!ctx.answeredAt || ctx.email.isArchived },
      form: ctx.form,
      technical: opts.technical ? {
        identityVersion: identity.version, suggestionVersion: suggestions.version,
        codes: [...suggestions.primary.codes, ...suggestions.alternatives.flatMap((a) => a.codes)],
        evidence: [identity.primary, ...identity.alternatives].filter(Boolean).map((c) => ({ id: c!.id, level: c!.level, evidence: c!.evidence })),
        conflicts: identity.conflicts, classification: ctx.classification,
      } : null,
    },
  }
}
