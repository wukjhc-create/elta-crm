/**
 * Phase C3 — kunde- og sagsforslag for én mail. Ren funktion (ingen DB, ikke 'use server').
 *
 * Input: C1-klassifikation + C2-identitet + relevante sager. Output: ét primært forslag med begrundelse og niveau,
 * alternativer, kategori og prioritet til arbejdskøen (C7). Intet udføres her — medarbejderen godkender/ændrer/afviser,
 * og serveren udfører via eksisterende koblingsstier (coordinator-actions).
 *
 * Regler: ingen sagskobling uden medarbejder; domæne alene giver aldrig sagsforslag; sagsreference verificerer ikke
 * afsenderen; flere lige gode sager/kunder → "vælg mellem"; ukendt afsender → aldrig kunde automatisk.
 */
import type { InquiryClassification } from '@/lib/classification/inquiry-classifier'
import type { IdentityLevel, SenderIdentity } from './identity'

export const SUGGESTION_KINDS = [
  'link_customer', 'link_case', 'create_service_case', 'create_case', 'create_lead', 'create_customer', 'identify_sender',
  'choose_between', 'route_bookkeeping', 'match_purchase', 'manual_review', 'no_action',
] as const
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number]

export const QUEUE_CATEGORIES = ['service', 'callback', 'sales', 'existing_case', 'unknown_sender', 'duplicate', 'admin', 'other'] as const
export type QueueCategory = (typeof QUEUE_CATEGORIES)[number]
export const QUEUE_PRIORITIES = ['urgent', 'high', 'normal', 'low'] as const
export type QueuePriority = (typeof QUEUE_PRIORITIES)[number]

export interface SuggestionCase { id: string; caseNumber: string; customerId: string | null; title: string | null; status: string; closedAt: string | null; isProposal: boolean; updatedAt: string }

export interface Suggestion {
  kind: SuggestionKind
  level: IdentityLevel
  customerId: string | null
  caseId: string | null
  /** Korte danske begrundelser til medarbejderen (ingen regel-id'er) */
  reasons: string[]
  /** Tekniske koder (kun admin-visning / audit) */
  codes: string[]
}

export interface CaseOption { caseId: string; caseNumber: string; customerId: string | null; level: IdentityLevel; reason: string; warning: string | null }

export interface SuggestionSet {
  version: 'c3-v1'
  primary: Suggestion
  alternatives: Suggestion[]
  caseOptions: CaseOption[]
  category: QueueCategory
  priority: QueuePriority
  /** Allerede færdigt? (fx mailen er koblet af en medarbejder til samme kunde og sag) */
  alreadyDone: boolean
}

export interface SuggestionInput {
  classification: InquiryClassification | null
  identity: SenderIdentity
  cases: SuggestionCase[]
  mentionedCaseNumbers: string[]
  threadCaseIds: string[]
  linked: { customerId: string | null; linkedBy: string | null; serviceCaseId: string | null }
  /** Stage A: henvendelsens hastegrad og om der ligger et (blokeret) tilbagekald */
  stageA?: { urgency: string | null; callbackRequested: boolean } | null
  answered: boolean
}

const OPEN = (c: SuggestionCase) => !c.closedAt && c.status !== 'closed' && c.status !== 'converted'
const HUMAN = (l: string | null) => l === 'manual' || l === 'manual-create'
const rank: Record<IdentityLevel, number> = { verified: 3, probable: 2, uncertain: 1, unknown: 0 }

/** Sagsmuligheder for en kunde (eller nævnte sager). Kun for kandidater der ikke er domæne-alene. */
export function caseOptionsFor(customerId: string | null, input: SuggestionInput): CaseOption[] {
  const out: CaseOption[] = []
  const seen = new Set<string>()
  const push = (o: CaseOption) => { if (!seen.has(o.caseId)) { seen.add(o.caseId); out.push(o) } }
  for (const c of input.cases) {
    if (input.mentionedCaseNumbers.includes(c.caseNumber)) {
      const other = !!customerId && c.customerId !== customerId
      push({ caseId: c.id, caseNumber: c.caseNumber, customerId: c.customerId, level: other ? 'uncertain' : 'verified',
        reason: 'sagsnummeret står i mailen', warning: other ? 'Sagen hører til en anden kunde end afsenderen' : !OPEN(c) ? 'Sagen er lukket' : null })
    }
  }
  for (const id of input.threadCaseIds) {
    const c = input.cases.find((x) => x.id === id)
    if (c) push({ caseId: c.id, caseNumber: c.caseNumber, customerId: c.customerId, level: customerId && c.customerId !== customerId ? 'uncertain' : 'verified',
      reason: 'en tidligere mail i samme tråd er koblet til sagen', warning: !OPEN(c) ? 'Sagen er lukket' : null })
  }
  if (customerId) {
    const open = input.cases.filter((c) => c.customerId === customerId && OPEN(c) && !c.isProposal)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    for (const c of open) push({ caseId: c.id, caseNumber: c.caseNumber, customerId, level: 'uncertain',
      reason: open.length === 1 ? 'kundens eneste åbne sag' : 'en af kundens åbne sager', warning: null })
  }
  return out.sort((a, b) => rank[b.level] - rank[a.level])
}

export function buildSuggestions(input: SuggestionInput): SuggestionSet {
  const { identity: id, classification: cl } = input
  const inquiry = cl?.inquiryType ?? 'unknown'
  const primaryCand = id.primary && !id.primary.domainOnly && id.primary.customerId ? id.primary : null
  const custId = input.linked.customerId ?? primaryCand?.customerId ?? null
  const caseOptions = caseOptionsFor(custId, input)
  const verifiedCase = caseOptions.filter((o) => o.level === 'verified' && !o.warning)
  const alternatives: Suggestion[] = []
  const mk = (kind: SuggestionKind, level: IdentityLevel, reasons: string[], codes: string[], customerId: string | null = null, caseId: string | null = null): Suggestion => ({ kind, level, customerId, caseId, reasons, codes })

  let primary: Suggestion
  let alreadyDone = false
  // Allerede koblet af en medarbejder?
  if (input.linked.customerId && HUMAN(input.linked.linkedBy)) {
    if (input.linked.serviceCaseId) { alreadyDone = true; primary = mk('no_action', 'verified', ['Mailen er allerede koblet til kunde og sag af en medarbejder'], ['already_linked_case'], input.linked.customerId, input.linked.serviceCaseId) }
    else if (verifiedCase.length === 1) primary = mk('link_case', 'verified', [`Kobl til sag ${verifiedCase[0].caseNumber} — ${verifiedCase[0].reason}`], ['case_verified'], input.linked.customerId, verifiedCase[0].caseId)
    else if (inquiry === 'service_request' && !caseOptions.some((o) => o.level !== 'uncertain' || o.reason === 'kundens eneste åbne sag')) primary = mk('create_service_case', 'probable', ['Servicehenvendelse fra en kendt kunde uden åben sag'], ['service_no_open_case'], input.linked.customerId)
    else if (caseOptions.length) primary = mk('choose_between', 'uncertain', ['Vælg evt. en af kundens sager'], ['case_options'], input.linked.customerId)
    else { alreadyDone = true; primary = mk('no_action', 'verified', ['Mailen er koblet til kunden af en medarbejder'], ['already_linked'], input.linked.customerId) }
  } else if (id.kind === 'employee') {
    primary = mk('no_action', 'verified', ['Intern mail fra en medarbejder'], ['internal'])
  } else if (id.kind === 'automated' || inquiry === 'automated_message') {
    primary = mk('no_action', 'probable', ['Automatisk systemmail — kræver normalt ingen handling'], ['automated'])
  } else if (id.kind === 'supplier') {
    if (inquiry === 'invoice') primary = mk('route_bookkeeping', 'probable', ['Leverandørfaktura → bogholderi'], ['supplier_invoice'])
    else if (inquiry === 'order_confirmation') primary = mk('match_purchase', 'probable', ['Ordrebekræftelse fra leverandør → match mod indkøb'], ['supplier_order_confirmation'])
    else primary = mk('manual_review', 'probable', ['Mail fra leverandør — vurder selv'], ['supplier_other'])
  } else if (primaryCand && rank[primaryCand.level] >= 2) {
    const name = primaryCand.label
    const withCase = verifiedCase.length === 1 ? verifiedCase[0] : null
    primary = mk('link_customer', primaryCand.level,
      // Begrundelsen for afsenderen står allerede i afsenderboksen — forslaget siger kun hvad der sker (og hvorfor sagen)
      [`Kobl til ${name}${withCase ? ` og sag ${withCase.caseNumber}` : ''}`, ...(withCase ? [`Sagen: ${withCase.reason}`] : [])],
      ['customer_' + primaryCand.level, ...primaryCand.evidence], primaryCand.customerId, withCase?.caseId ?? null)
    if (!withCase && inquiry === 'service_request' && !caseOptions.length) alternatives.push(mk('create_service_case', 'probable', ['Opret servicesag til kunden'], ['service_no_open_case'], primaryCand.customerId))
  } else if (id.alternatives.length || (id.primary && id.primary.level === 'uncertain')) {
    primary = mk('choose_between', 'uncertain', ['Flere mulige kunder — vælg den rigtige eller opret ny', ...id.conflicts.length ? [id.explanation.find((l) => l.includes('deler')) ?? ''].filter(Boolean) : []], ['ambiguous', ...id.conflicts])
  } else if (inquiry === 'sales_inquiry') {
    primary = mk('create_lead', 'unknown', ['Ny salgsforespørgsel fra en ukendt afsender → opret lead (ingen kunde endnu)'], ['unknown_sales'])
    alternatives.push(mk('create_customer', 'unknown', ['Opret som ny kunde (kontrol for dubletter først)'], ['unknown_create_customer']))
  } else if (inquiry === 'service_request') {
    primary = mk('create_customer', 'unknown', ['Servicehenvendelse fra en ukendt afsender → opret kunde (dubletkontrol) og derefter sag'], ['unknown_service'])
    alternatives.push(mk('create_lead', 'unknown', ['Opret som lead i stedet'], ['unknown_lead']))
  } else if (id.kind === 'partner') {
    primary = mk('manual_review', id.level, ['Samarbejdspartner — vurder hvilken kunde/sag mailen handler om'], ['partner'])
  } else {
    primary = mk('identify_sender', 'unknown', ['Ukendt afsender — vælg kunde, opret ny eller markér som ikke relevant'], ['unknown'])
  }

  // Alternativer: øvrige kunde-kandidater (aldrig domæne-alene) og sager
  for (const c of [id.primary, ...id.alternatives]) {
    if (!c || !c.customerId || c.domainOnly) continue
    if (primary.kind === 'link_customer' && primary.customerId === c.customerId) continue
    if (input.linked.customerId === c.customerId) continue
    alternatives.push(mk('link_customer', c.level, [`Kobl til ${c.label}`], ['alt_customer', ...c.evidence], c.customerId))
  }
  for (const o of caseOptions) {
    if (primary.caseId === o.caseId) continue
    alternatives.push(mk('link_case', o.level, [`Sag ${o.caseNumber} — ${o.reason}${o.warning ? ` (${o.warning})` : ''}`], ['alt_case'], o.customerId, o.caseId))
  }

  // Kategori og prioritet
  let category: QueueCategory
  if (input.stageA?.callbackRequested) category = 'callback'
  else if (inquiry === 'service_request') category = 'service'
  else if (inquiry === 'sales_inquiry') category = 'sales'
  else if (inquiry === 'invoice' || inquiry === 'order_confirmation' || id.kind === 'supplier') category = 'admin'
  else if (verifiedCase.length || (input.linked.serviceCaseId && !alreadyDone)) category = 'existing_case'
  else if (id.conflicts.includes('email_shared_by_customers')) category = 'duplicate'
  else if (id.kind === 'unknown' || id.kind === 'prospect') category = 'unknown_sender'
  else category = 'other'
  const urgency = input.stageA?.urgency
  let priority: QueuePriority = urgency === 'emergency' ? 'urgent' : urgency === 'high' ? 'high'
    : category === 'service' || category === 'callback' ? 'high'
    : category === 'sales' || category === 'existing_case' || category === 'unknown_sender' || category === 'duplicate' ? 'normal' : 'low'
  if (id.kind === 'automated' || id.kind === 'employee') priority = 'low'

  return { version: 'c3-v1', primary, alternatives: alternatives.slice(0, 8), caseOptions, category, priority, alreadyDone }
}

export const SUGGESTION_LABELS: Record<SuggestionKind, string> = {
  link_customer: 'Kobl til kunde', link_case: 'Kobl til sag', create_service_case: 'Opret servicesag', create_case: 'Opret sag',
  create_lead: 'Opret lead', create_customer: 'Opret ny kunde', identify_sender: 'Identificér afsender', choose_between: 'Vælg mellem muligheder',
  route_bookkeeping: 'Til bogholderi', match_purchase: 'Match mod indkøb', manual_review: 'Manuel vurdering', no_action: 'Ingen handling',
}
export const CATEGORY_LABELS: Record<QueueCategory, string> = {
  service: 'Service', callback: 'Tilbagekald', sales: 'Salg', existing_case: 'Eksisterende sag', unknown_sender: 'Ukendt afsender',
  duplicate: 'Mulig dublet', admin: 'Faktura/administration', other: 'Øvrige',
}
export const PRIORITY_LABELS: Record<QueuePriority, string> = { urgent: 'Akut', high: 'Høj', normal: 'Normal', low: 'Lav' }
