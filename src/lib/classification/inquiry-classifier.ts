/**
 * Phase C1 — deterministisk klassifikation af indgående henvendelser (SHADOW). Ren logik: ingen DB, ingen AI, ingen
 * bivirkninger, ikke 'use server'. Resultatet bruges kun til måling/sammenligning — det ændrer intet i drift.
 *
 * Tre ADSKILTE dimensioner + en foreslået handling (aldrig udført automatisk):
 *   1. afsendertype      — HVEM skriver (kunde, leverandør, samarbejdspartner, intern, automatisk system, webformular, ukendt)
 *   2. henvendelsestype  — HVAD handler det om (kundehenvendelse, service, ny salgsforespørgsel, faktura, ordrebekræftelse,
 *                          automatisk systemmail, intern, ukendt)
 *   3. sagsreference     — hører det til en EKSISTERENDE sag (eksplicit sagsnummer/tråd), mulig sag, flertydig, ingen
 *   + foreslået handling — afledt af de tre; kun et forslag til en medarbejder
 *
 * Principper: hver beslutning bærer de regler der afgjorde den (forklarbar); modstridende evidens → ukendt (aldrig gæt);
 * navnelighed og fuzzy matching bruges aldrig; leverandørværnets regler (lib/email/supplier-senders) genbruges uændret.
 */
import type { TextSignal } from './inquiry-text-signals'

export const INQUIRY_CLASSIFIER_VERSION = 'c1-v1'

export const SENDER_TYPES = ['existing_customer', 'supplier', 'cooperation_partner', 'internal', 'automated', 'web_form', 'unknown'] as const
export type SenderType = (typeof SENDER_TYPES)[number]

export const INQUIRY_TYPES = ['customer_inquiry', 'service_request', 'sales_inquiry', 'invoice', 'order_confirmation', 'automated_message', 'internal_message', 'unknown'] as const
export type InquiryType = (typeof INQUIRY_TYPES)[number]

export const CASE_REFERENCES = ['existing_case', 'possible_case', 'ambiguous', 'none', 'not_applicable'] as const
export type CaseReference = (typeof CASE_REFERENCES)[number]

export const PROPOSED_ACTIONS = [
  'link_to_case', 'create_service_case_proposal', 'create_lead_proposal', 'assign_customer_inquiry', 'route_to_bookkeeping',
  'match_to_purchase', 'review_party_mail', 'identify_sender', 'no_action', 'manual_review',
] as const
export type ProposedAction = (typeof PROPOSED_ACTIONS)[number]

export type PartnerRelation = 'cooperation_partner' | 'subcontractor' | 'manufacturer'

/** Deterministisk kontekst, indlæst af kalderen (DB/bulk) — alle felter valgfri, kun det der er kendt med sikkerhed */
export interface InquiryContext {
  /** Afsenderen er ELTA selv (eget domæne) — og ikke en videresendelse med kendt original afsender */
  internalSender?: boolean
  /** FormSubmit-henvendelse fra hjemmesiden (isWebsiteInquiry) */
  webForm?: boolean
  /** FormSubmit-systemmail (ikke en henvendelse) */
  webFormSystemMail?: boolean
  /** noreply/mailer-daemon/postmaster … (isAutomatedSender) */
  automatedSender?: boolean
  /** Leverandørværnets afgørelse + grunde (decideSupplierSender) */
  supplier?: { isSupplier: boolean; reasons: readonly string[] }
  /** Aktive, menneskeligt bekræftede relationer for afsenderens part (verificeret mail/domæne eller kundens part) */
  partyRelations?: readonly string[]
  /**
   * Kundematch på afsenderens (eller formularens) e-mail mod kunder/kontakter oprettet FØR mailen.
   * autoCreated = kunden er oprettet af mail-automatikken (tag auto-email) — stadig en kunde, men svagere evidens.
   */
  customerMatch?: { state: 'unique' | 'ambiguous' | 'none'; autoCreated?: boolean; viaFormEmail?: boolean }
  /** Mailen er registreret som leverandørfaktura (incoming_invoices.source_email_id) */
  invoiceRegistered?: boolean
  hasAttachments?: boolean
  /** Et vedhæftet filnavn indeholder faktura/invoice/kreditnota (kun et flag — navnet forlader aldrig databasen) */
  attachmentNamedInvoice?: boolean
  /** Afsenderadressens lokaldel er en faktura-postkasse (faktura@, invoice@, billing@, bogholderi@ …) */
  invoiceSenderAddress?: boolean
  /** Sagsnumre i teksten, opdelt i eksisterende/ukendte */
  caseNumbers?: { existing: readonly string[]; unknown: readonly string[] }
  /** Sager som tidligere mails i samme mailtråd er koblet til */
  threadCaseIds?: readonly string[]
  /** Antal åbne sager for den matchede kunde (kun kandidat — aldrig en kobling) */
  openCasesForCustomer?: number
  textSignals?: readonly TextSignal[]
}

export interface RuleHit { dimension: 'sender' | 'inquiry' | 'case' | 'action'; rule: string }

export interface InquiryClassification {
  version: string
  senderType: SenderType
  inquiryType: InquiryType
  caseReference: CaseReference
  proposedAction: ProposedAction
  /** De regler der afgjorde hver dimension (forklaring) */
  rules: RuleHit[]
  /** Hvorfor en dimension endte som ukendt/flertydig */
  doubts: string[]
}

const has = (ctx: InquiryContext, s: TextSignal) => (ctx.textSignals ?? []).includes(s)

function decideSender(ctx: InquiryContext, rules: RuleHit[], doubts: string[]): SenderType {
  const hit = (rule: string, t: SenderType) => { rules.push({ dimension: 'sender', rule }); return t }
  const rel = new Set(ctx.partyRelations ?? [])
  const partner = (['cooperation_partner', 'subcontractor', 'manufacturer'] as const).find((r) => rel.has(r))
  const supplier = !!ctx.supplier?.isSupplier || rel.has('supplier')
  const cm = ctx.customerMatch?.state ?? 'none'

  if (ctx.internalSender) return hit('elta_domain', 'internal')
  if (ctx.webFormSystemMail) return hit('formsubmit_system_mail', 'automated')
  if (ctx.webForm) {
    if (cm === 'unique' && ctx.customerMatch?.viaFormEmail) return hit('web_form_email_matches_customer', 'existing_customer')
    return hit('formsubmit_website_inquiry', 'web_form')
  }
  if (partner) return hit(`party_relation_${partner}`, 'cooperation_partner')
  if (supplier) {
    if (cm === 'unique' && !ctx.customerMatch?.autoCreated && !rel.has('supplier')) {
      doubts.push('sender:supplier_evidence_vs_manual_customer')
      return 'unknown'
    }
    const why = rel.has('supplier') ? ['party_relation_supplier'] : (ctx.supplier?.reasons ?? []).map((r) => `supplier_${r}`)
    for (const w of why) rules.push({ dimension: 'sender', rule: w })
    if (cm === 'unique') rules.push({ dimension: 'sender', rule: 'supplier_beats_auto_created_customer' })
    return 'supplier'
  }
  if (ctx.automatedSender) return hit('automated_sender_address', 'automated')
  if (has(ctx, 'delivery_failure')) return hit('delivery_failure_subject', 'automated')
  if (cm === 'unique') {
    if (has(ctx, 'auto_reply')) return hit('auto_reply_subject', 'automated')
    return hit(ctx.customerMatch?.autoCreated ? 'email_matches_auto_created_customer' : 'email_matches_customer', 'existing_customer')
  }
  if (cm === 'ambiguous') { doubts.push('sender:email_matches_several_customers'); return 'unknown' }
  if (has(ctx, 'auto_reply')) return hit('auto_reply_subject', 'automated')
  if (has(ctx, 'newsletter_markers')) return hit('newsletter_markers', 'automated')
  doubts.push('sender:no_deterministic_evidence')
  return 'unknown'
}

function decideInquiry(ctx: InquiryContext, sender: SenderType, rules: RuleHit[], doubts: string[]): InquiryType {
  const hit = (rule: string, t: InquiryType) => { rules.push({ dimension: 'inquiry', rule }); return t }
  if (sender === 'internal') return hit('internal_sender', 'internal_message')
  if (ctx.invoiceRegistered) return hit('registered_supplier_invoice', 'invoice')
  const businessParty = sender === 'supplier' || sender === 'cooperation_partner'
  if (businessParty || sender === 'automated' || sender === 'unknown') {
    if (has(ctx, 'subject_order_confirmation') && (businessParty || sender === 'automated')) return hit('order_confirmation_subject', 'order_confirmation')
    // Faktura: navngivne beviser + bilag. Kendt leverandør/partner: ét bevis. Ukendt/automatisk afsender: to UAFHÆNGIGE
    // beviser (ellers gæt). Kunder/webformular: aldrig (et "faktura"-ord fra en kunde er et spørgsmål).
    const evidence = [
      has(ctx, 'subject_invoice') && 'invoice_word_in_subject',
      ctx.attachmentNamedInvoice && 'attachment_named_invoice',
      ctx.invoiceSenderAddress && 'invoice_sender_address',
    ].filter(Boolean) as string[]
    if (ctx.hasAttachments && evidence.length >= (businessParty ? 1 : 2)) {
      for (const ev of evidence) rules.push({ dimension: 'inquiry', rule: ev })
      return hit(businessParty ? 'invoice_from_known_party' : 'invoice_two_independent_evidences', 'invoice')
    }
    if (evidence.length && ctx.hasAttachments && !businessParty) doubts.push('inquiry:single_invoice_evidence_unknown_sender')
  }
  if (sender === 'automated') return hit('automated_sender', 'automated_message')
  if (businessParty) { doubts.push('inquiry:party_mail_without_specific_type'); return 'unknown' }

  // Kunde, webformular eller ukendt afsender: service vs. salg
  const service = has(ctx, 'service_keywords') || has(ctx, 'form_type_service')
  const sales = has(ctx, 'sales_intent') || has(ctx, 'form_type_sales') || (sender === 'web_form' && has(ctx, 'product_mention') && !service)
  if (service && sales) {
    // Formularens eget type-felt er eksplicit og vinder over fritekst
    if (has(ctx, 'form_type_service') && !has(ctx, 'form_type_sales')) return hit('form_type_service', 'service_request')
    if (has(ctx, 'form_type_sales') && !has(ctx, 'form_type_service')) return hit('form_type_sales', 'sales_inquiry')
    doubts.push('inquiry:service_and_sales_signals'); return 'unknown'
  }
  if (service) return hit(has(ctx, 'form_type_service') ? 'form_type_service' : 'service_keywords', 'service_request')
  if (sales) return hit(has(ctx, 'form_type_sales') ? 'form_type_sales' : has(ctx, 'sales_intent') ? 'sales_intent' : 'web_form_product_mention', 'sales_inquiry')
  if (sender === 'existing_customer' || sender === 'web_form') {
    if (has(ctx, 'subject_invoice')) rules.push({ dimension: 'inquiry', rule: 'invoice_word_from_customer_is_question' })
    return hit(sender === 'web_form' ? 'web_form_general' : 'known_customer_general', 'customer_inquiry')
  }
  doubts.push('inquiry:no_signal_and_unknown_sender')
  return 'unknown'
}

function decideCase(ctx: InquiryContext, sender: SenderType, rules: RuleHit[], doubts: string[]): CaseReference {
  const hit = (rule: string, t: CaseReference) => { rules.push({ dimension: 'case', rule }); return t }
  const fromText = [...new Set(ctx.caseNumbers?.existing ?? [])]
  const fromThread = [...new Set(ctx.threadCaseIds ?? [])]
  if (fromText.length > 1 || fromThread.length > 1) { doubts.push('case:several_cases_referenced'); return hit('several_cases', 'ambiguous') }
  if (fromText.length === 1) return hit('case_number_in_text', 'existing_case')
  if (fromThread.length === 1) return hit('thread_linked_to_case', 'existing_case')
  if ((ctx.caseNumbers?.unknown ?? []).length) rules.push({ dimension: 'case', rule: 'unknown_case_number_ignored' })
  if (sender === 'internal' || sender === 'automated') return hit('sender_not_case_bound', 'not_applicable')
  if (sender === 'existing_customer' && (ctx.openCasesForCustomer ?? 0) === 1) return hit('customer_has_one_open_case', 'possible_case')
  return hit('no_case_reference', 'none')
}

function decideAction(sender: SenderType, inquiry: InquiryType, caseRef: CaseReference, rules: RuleHit[]): ProposedAction {
  const hit = (rule: string, a: ProposedAction) => { rules.push({ dimension: 'action', rule }); return a }
  if (sender === 'internal' || inquiry === 'automated_message') return hit('nothing_to_do', 'no_action')
  if (inquiry === 'invoice') return hit('invoice_to_bookkeeping', 'route_to_bookkeeping')
  if (inquiry === 'order_confirmation') return hit('order_confirmation_to_purchase', 'match_to_purchase')
  if (caseRef === 'existing_case') return hit('explicit_case_reference', 'link_to_case')
  if (caseRef === 'ambiguous') return hit('ambiguous_case_reference', 'manual_review')
  if (sender === 'supplier' || sender === 'cooperation_partner') return hit('party_mail_review', 'review_party_mail')
  if (inquiry === 'service_request') return sender === 'existing_customer'
    ? hit('service_from_known_customer', 'create_service_case_proposal')
    : hit('service_from_unidentified_sender', 'identify_sender')
  if (inquiry === 'sales_inquiry') return hit('sales_inquiry_lead', 'create_lead_proposal')
  if (inquiry === 'customer_inquiry') return hit('customer_inquiry_to_office', 'assign_customer_inquiry')
  return hit('uncertain', 'manual_review')
}

export function classifyInquiry(ctx: InquiryContext): InquiryClassification {
  const rules: RuleHit[] = []
  const doubts: string[] = []
  const senderType = decideSender(ctx, rules, doubts)
  const inquiryType = decideInquiry(ctx, senderType, rules, doubts)
  const caseReference = decideCase(ctx, senderType, rules, doubts)
  const proposedAction = decideAction(senderType, inquiryType, caseReference, rules)
  return { version: INQUIRY_CLASSIFIER_VERSION, senderType, inquiryType, caseReference, proposedAction, rules, doubts }
}

export const SENDER_TYPE_LABELS: Record<SenderType, string> = {
  existing_customer: 'Eksisterende kunde', supplier: 'Leverandør', cooperation_partner: 'Samarbejdspartner', internal: 'Intern (ELTA)',
  automated: 'Automatisk system', web_form: 'Hjemmesideformular', unknown: 'Ukendt',
}
export const INQUIRY_TYPE_LABELS: Record<InquiryType, string> = {
  customer_inquiry: 'Kundehenvendelse', service_request: 'Servicehenvendelse', sales_inquiry: 'Ny salgsforespørgsel', invoice: 'Faktura',
  order_confirmation: 'Ordrebekræftelse', automated_message: 'Automatisk systemmail', internal_message: 'Intern', unknown: 'Ukendt henvendelse',
}
export const CASE_REFERENCE_LABELS: Record<CaseReference, string> = {
  existing_case: 'Eksisterende sag', possible_case: 'Mulig sag (kundens eneste åbne)', ambiguous: 'Flere sager nævnt', none: 'Ingen sag', not_applicable: '—',
}
export const PROPOSED_ACTION_LABELS: Record<ProposedAction, string> = {
  link_to_case: 'Foreslå kobling til sagen', create_service_case_proposal: 'Foreslå servicesag', create_lead_proposal: 'Foreslå lead (ingen kunde oprettes)',
  assign_customer_inquiry: 'Til kontoret (kundehenvendelse)', route_to_bookkeeping: 'Til bogholderi', match_to_purchase: 'Match mod indkøb',
  review_party_mail: 'Gennemse (leverandør/partner)', identify_sender: 'Identificér afsender', no_action: 'Ingen handling', manual_review: 'Manuel behandling',
}

/** Menneskelæsbar forklaring (regel-id'er bevares, så de kan slås op i dokumentationen) */
export function explainClassification(c: InquiryClassification): string[] {
  return [
    `Afsender: ${SENDER_TYPE_LABELS[c.senderType]} (${c.rules.filter((r) => r.dimension === 'sender').map((r) => r.rule).join(', ') || 'ingen regel'})`,
    `Henvendelse: ${INQUIRY_TYPE_LABELS[c.inquiryType]} (${c.rules.filter((r) => r.dimension === 'inquiry').map((r) => r.rule).join(', ') || 'ingen regel'})`,
    `Sag: ${CASE_REFERENCE_LABELS[c.caseReference]} (${c.rules.filter((r) => r.dimension === 'case').map((r) => r.rule).join(', ')})`,
    `Forslag: ${PROPOSED_ACTION_LABELS[c.proposedAction]}`,
    ...c.doubts.map((d) => `Tvivl: ${d}`),
  ]
}
