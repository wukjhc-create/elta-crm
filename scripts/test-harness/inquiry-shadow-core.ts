/**
 * Phase C1 SHADOW-evaluering + C0-baseline — fælles kerne for prod (read-only runner) og staging (stagingSql).
 *
 * Læser (kun SELECT) mails og den kontekst klassifikatoren behøver, klassificerer HVER mail med
 * src/lib/classification/inquiry-classifier.ts i hukommelsen og sammenligner med det de eksisterende arbejdsgange gjorde
 * (mail-AI'ens klassifikation, kundekobling, registrerede leverandørfakturaer, Stage A-intent). Intet skrives nogen steder.
 *
 * Output er KUN antal/andele og regel-id'er — aldrig emner, afsendere, navne eller indhold.
 * Kontekst bygges "som på modtagelsestidspunktet": kun kunder/kontakter oprettet FØR mailen og kun historik fra tidligere
 * mails tæller (ellers ville en kunde auto-oprettet AF mailen selv gøre afsenderen "kendt").
 *
 * SQL'en indeholder bevidst ingen semikolon (prod-runneren tillader kun én SELECT).
 */
import { classifyInquiry, type InquiryClassification, type InquiryContext } from '../../src/lib/classification/inquiry-classifier'
import { caseNumbersInText, extractTextSignals, formEmail, matchedSignalTerms } from '../../src/lib/classification/inquiry-text-signals'
import { decideSupplierSender, domainOf, domainUsableAsEvidence, normalizeSender, websiteDomain, type SupplierEvidence } from '../../src/lib/email/supplier-senders'
import { isAutomatedSender } from '../../src/lib/parties/communication-class'
import { isFreeMailDomain } from '../../src/lib/email/free-mail-domains'
import { isWebsiteInquiry, normalizeFormSubmitTable } from '../../src/lib/mail/website-inquiry'

export type SqlRunner = (sql: string) => Promise<Array<Record<string, unknown>>>

/** Én SELECT → én json-kolonne `j` med alle rækker (stripper HTML i SQL; højst 6000 tegn tekst pr. mail) */
export const SHADOW_DATA_SQL = `SELECT json_build_object(
  'emails', (SELECT coalesce(json_agg(e ORDER BY e.received_at), '[]'::json) FROM (
     SELECT id, received_at, lower(coalesce(to_email, '')) to_email, sender_email, original_sender_email, is_forwarded, subject,
       left(coalesce(nullif(body_text, ''), regexp_replace(coalesce(body_html, ''), '<[^>]*>', ' ', 'g'), body_preview, ''), 6000) body,
       has_attachments, coalesce(attachment_urls::text, '') ~* '(faktura|invoice|kreditnota|credit.?note)' att_invoice,
       conversation_id thread, customer_id, linked_by, link_status::text link_status, service_case_id
     FROM public.incoming_emails) e),
  'customers', (SELECT coalesce(json_agg(json_build_object('id', id, 'email', lower(trim(email)), 'auto', coalesce('auto-email' = ANY(tags), false), 'created_at', created_at)), '[]'::json)
     FROM public.customers WHERE coalesce(trim(email), '') <> '' AND lower(email) NOT LIKE '%@elta-crm.local'),
  'contacts', (SELECT coalesce(json_agg(json_build_object('customer_id', customer_id, 'email', lower(trim(email)), 'created_at', created_at)), '[]'::json)
     FROM public.customer_contacts WHERE coalesce(trim(email), '') <> ''),
  'suppliers', (SELECT coalesce(json_agg(json_build_object('email', contact_email, 'website', website)), '[]'::json) FROM public.suppliers WHERE is_active),
  'parties', (SELECT coalesce(json_agg(json_build_object('id', p.id, 'customer_id', p.customer_id, 'emails', p.verified_emails, 'domains', p.verified_domains,
       'rels', (SELECT coalesce(json_agg(r.relationship), '[]'::json) FROM public.party_relationships r WHERE r.party_id = p.id AND r.status = 'active'))), '[]'::json)
     FROM public.parties p),
  'cases', (SELECT coalesce(json_agg(json_build_object('id', id, 'nr', upper(case_number), 'customer_id', customer_id, 'created_at', created_at, 'closed_at', closed_at)), '[]'::json)
     FROM public.service_cases),
  'eil', (SELECT coalesce(json_agg(json_build_object('email_id', email_id, 'c', classification, 'at', created_at)), '[]'::json) FROM public.email_intelligence_logs),
  'invoices', (SELECT coalesce(json_agg(DISTINCT source_email_id), '[]'::json) FROM public.incoming_invoices WHERE source_email_id IS NOT NULL),
  'stage_a', (SELECT coalesce(json_agg(json_build_object('email_id', i.source_id, 'intent', c.intent, 'cm', c.customer_match_state, 'handled', c.handled_at IS NOT NULL)), '[]'::json)
     FROM public.conversation_items i JOIN public.conversations c ON c.id = i.conversation_id WHERE i.source_table = 'incoming_emails')
) j`

interface EmailRow {
  id: string; received_at: string; to_email: string; sender_email: string | null; original_sender_email: string | null; is_forwarded: boolean | null
  subject: string | null; body: string | null; has_attachments: boolean | null; att_invoice: boolean | null; thread: string | null; customer_id: string | null
  linked_by: string | null; link_status: string | null; service_case_id: string | null
}
export interface ShadowData {
  emails: EmailRow[]
  customers: Array<{ id: string; email: string; auto: boolean; created_at: string }>
  contacts: Array<{ customer_id: string; email: string; created_at: string }>
  suppliers: Array<{ email: string | null; website: string | null }>
  parties: Array<{ id: string; customer_id: string | null; emails: string[] | null; domains: string[] | null; rels: string[] }>
  cases: Array<{ id: string; nr: string | null; customer_id: string | null; created_at: string; closed_at: string | null }>
  eil: Array<{ email_id: string; c: string | null; at: string }>
  invoices: string[]
  stage_a: Array<{ email_id: string; intent: string | null; cm: string | null; handled: boolean }>
}

export interface ShadowRow {
  mailbox: 'kontakt' | 'ordre' | 'andet'
  result: InquiryClassification
  /** Samme mail klassificeret UDEN registreret-faktura-signalet (til uafhængig faktura-måling) */
  invoiceTypeWithoutRegistry: string
  matchedCustomerId: string | null
  /** Diagnose (kun nøgleord/flag, aldrig indhold) */
  diag: { terms: { service: string[]; sales: string[]; product: string[] }; subjectInvoice: boolean; hasAttachments: boolean; fwd: boolean; attInvoice: boolean; invoiceAddr: boolean; freeMail: boolean; newsletterMarker: boolean; reply: boolean }
  actual: { eil: string | null; customerId: string | null; linkedBy: string | null; linkStatus: string | null; invoice: boolean; stageAIntent: string | null }
}

const t = (s: string | null | undefined) => (s ? Date.parse(s) : NaN)
const isElta = (d: string | null) => !!d && (d === 'eltasolar.dk' || d.endsWith('.eltasolar.dk'))
const FORMSUBMIT = (d: string | null) => !!d && /(^|\.)formsubmit\.co$/.test(d)

/** Byg kontekst og klassificér alle mails (ren funktion over de indlæste data) */
export function classifyAll(d: ShadowData, opts: { since?: string } = {}): ShadowRow[] {
  const sinceMs = opts.since ? Date.parse(opts.since) : -Infinity
  const supplierEmails = new Set<string>(), supplierDomains = new Set<string>()
  for (const s of d.suppliers) {
    const ce = normalizeSender(s.email); if (ce) { supplierEmails.add(ce); const dm = domainOf(ce); if (dm && domainUsableAsEvidence(dm)) supplierDomains.add(dm) }
    const wd = websiteDomain(s.website); if (wd && domainUsableAsEvidence(wd)) supplierDomains.add(wd)
  }
  // AI-klassifikationer pr. mail (seneste vinder; supplier vinder over customer ved genbehandling — som loadSupplierEvidence)
  const eilByEmail = new Map<string, string>()
  for (const r of [...d.eil].sort((a, b) => t(a.at) - t(b.at))) if (r.c) eilByEmail.set(r.email_id, r.c)
  const supplierLabeled = new Set(d.eil.filter((r) => r.c === 'supplier').map((r) => r.email_id))
  const customerLabeled = new Set(d.eil.filter((r) => r.c === 'customer').map((r) => r.email_id))
  const invoices = new Set(d.invoices)
  const stageA = new Map(d.stage_a.map((s) => [s.email_id, s]))
  const casesByNr = new Map(d.cases.filter((c) => c.nr).map((c) => [c.nr as string, c]))
  const custById = new Map(d.customers.map((c) => [c.id, c]))
  const sorted = [...d.emails].sort((a, b) => t(a.received_at) - t(b.received_at))
  const effSender = (e: EmailRow) => normalizeSender(e.is_forwarded && e.original_sender_email ? e.original_sender_email : e.sender_email)

  const out: ShadowRow[] = []
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i]
    const at = t(e.received_at)
    if (!(at >= sinceMs)) continue
    const earlier = sorted.slice(0, i)
    const sender = effSender(e)
    const rawDomain = domainOf(e.sender_email)
    const domain = sender ? sender.split('@')[1] : null
    const webForm = isWebsiteInquiry({ senderEmail: e.sender_email, subject: e.subject })
    const body = webForm ? normalizeFormSubmitTable(e.body ?? '') : (e.body ?? '')

    // Leverandørværnets evidens — kun historik fra tidligere mails
    const hist = (rows: EmailRow[]) => {
      const sup = rows.filter((r) => supplierLabeled.has(r.id))
      const cust = rows.filter((r) => customerLabeled.has(r.id) && !supplierLabeled.has(r.id))
      return { supplier: sup.length, customer: cust.length, supplierSenders: new Set(sup.map((r) => effSender(r))).size }
    }
    const senderRows = sender ? earlier.filter((r) => effSender(r) === sender) : []
    const domainRows = domain && domainUsableAsEvidence(domain) ? earlier.filter((r) => effSender(r)?.endsWith(`@${domain}`)) : []
    const sh = hist(senderRows), dh = hist(domainRows)
    const ev: SupplierEvidence = { supplierEmails, supplierDomains, senderHistory: { supplier: sh.supplier, customer: sh.customer },
      domainHistory: domain && domainUsableAsEvidence(domain) ? dh : null }
    const supplier = decideSupplierSender(sender, ev)

    // Kundematch (eksakt e-mail; kun kunder/kontakter oprettet før mailen)
    const matchEmail = webForm ? formEmail(body) : sender
    const ids = new Set<string>()
    if (matchEmail) {
      for (const c of d.customers) if (c.email === matchEmail && t(c.created_at) < at) ids.add(c.id)
      for (const c of d.contacts) if (c.email === matchEmail && t(c.created_at) < at) ids.add(c.customer_id)
    }
    const matched = ids.size === 1 ? [...ids][0] : null
    const customerMatch = { state: (ids.size === 0 ? 'none' : ids.size === 1 ? 'unique' : 'ambiguous') as 'none' | 'unique' | 'ambiguous',
      autoCreated: matched ? !!custById.get(matched)?.auto : undefined, viaFormEmail: webForm || undefined }

    // Parter (verificeret mail/domæne, eller den matchede kundes part)
    const rels = new Set<string>()
    for (const p of d.parties) {
      const byEmail = !!sender && (p.emails ?? []).map((x) => x.toLowerCase()).includes(sender)
      const byDomain = !!domain && domainUsableAsEvidence(domain) && (p.domains ?? []).map((x) => x.toLowerCase()).includes(domain)
      const byCustomer = !!matched && p.customer_id === matched
      if (byEmail || byDomain || byCustomer) for (const r of p.rels) rels.add(r)
    }

    const nrs = caseNumbersInText({ subject: e.subject, body })
    const existing = nrs.filter((n) => { const c = casesByNr.get(n); return !!c && t(c.created_at) < at })
    const threadCaseIds = e.thread ? [...new Set(earlier.filter((r) => r.thread === e.thread && r.service_case_id).map((r) => r.service_case_id as string))] : []
    const openCases = matched ? d.cases.filter((c) => c.customer_id === matched && t(c.created_at) < at && (!c.closed_at || t(c.closed_at) > at)).length : 0

    const ctx: InquiryContext = {
      internalSender: isElta(domain),
      webForm,
      webFormSystemMail: FORMSUBMIT(rawDomain) && !webForm,
      automatedSender: isAutomatedSender(sender),
      supplier,
      partyRelations: [...rels],
      customerMatch,
      invoiceRegistered: invoices.has(e.id),
      hasAttachments: !!e.has_attachments,
      attachmentNamedInvoice: !!e.att_invoice,
      invoiceSenderAddress: !!sender && /^(faktura|fakturaer|invoice|invoices|billing|bogholderi|regnskab|debitor|kreditor|e-?faktura|accounting)([+._-].*)?@/.test(sender),
      caseNumbers: { existing, unknown: nrs.filter((n) => !existing.includes(n)) },
      threadCaseIds,
      openCasesForCustomer: openCases,
      textSignals: extractTextSignals({ subject: e.subject, body }, { webForm, forwarded: !!e.is_forwarded }),
    }
    const result = classifyInquiry(ctx)
    const withoutRegistry = classifyInquiry({ ...ctx, invoiceRegistered: false }).inquiryType
    out.push({
      mailbox: /kontakt@/.test(e.to_email) ? 'kontakt' : /ordre@/.test(e.to_email) ? 'ordre' : 'andet',
      result, invoiceTypeWithoutRegistry: withoutRegistry, matchedCustomerId: matched,
      diag: { terms: matchedSignalTerms({ subject: e.subject, body }, { forwarded: !!e.is_forwarded }), subjectInvoice: (ctx.textSignals ?? []).includes("subject_invoice"), hasAttachments: !!e.has_attachments, fwd: !!e.is_forwarded,
        attInvoice: !!ctx.attachmentNamedInvoice, invoiceAddr: !!ctx.invoiceSenderAddress, freeMail: isFreeMailDomain(domain), newsletterMarker: /unsubscribe|afmeld|nyhedsbrev|newsletter/i.test(e.body ?? ""), reply: (ctx.textSignals ?? []).includes("reply_subject") },
      actual: { eil: eilByEmail.get(e.id) ?? null, customerId: e.customer_id, linkedBy: e.linked_by, linkStatus: e.link_status,
        invoice: invoices.has(e.id), stageAIntent: stageA.get(e.id)?.intent ?? null },
    })
  }
  return out
}

const pct = (n: number, d: number) => (d ? `${Math.round((1000 * n) / d) / 10} %` : '—')
function countBy<T>(rows: T[], key: (r: T) => string): Record<string, number> {
  const m: Record<string, number> = {}
  for (const r of rows) { const k = key(r); m[k] = (m[k] ?? 0) + 1 }
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]))
}

/** Aggregeret shadow-rapport (kun antal/andele/regel-id'er) */
export function shadowReport(rows: ShadowRow[]): string[] {
  const n = rows.length
  const L: string[] = []
  const line = (s: string) => L.push(s)
  const fmt = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k}=${v} (${pct(v, n)})`).join(' · ')
  line(`mails klassificeret: ${n} · version ${rows[0]?.result.version ?? '—'} · postkasser ${JSON.stringify(countBy(rows, (r) => r.mailbox))}`)
  line(`AFSENDERTYPE     ${fmt(countBy(rows, (r) => r.result.senderType))}`)
  line(`HENVENDELSESTYPE ${fmt(countBy(rows, (r) => r.result.inquiryType))}`)
  line(`SAGSREFERENCE    ${fmt(countBy(rows, (r) => r.result.caseReference))}`)
  line(`FORESLÅET HANDL. ${fmt(countBy(rows, (r) => r.result.proposedAction))}`)
  const unkS = rows.filter((r) => r.result.senderType === 'unknown').length
  const unkI = rows.filter((r) => r.result.inquiryType === 'unknown').length
  const manual = rows.filter((r) => ['manual_review', 'identify_sender'].includes(r.result.proposedAction)).length
  line(`UKENDT: afsender ${pct(unkS, n)} · henvendelse ${pct(unkI, n)} · manuel behandling/identifikation ${pct(manual, n)}`)
  for (const mb of ['kontakt', 'ordre'] as const) {
    const sub = rows.filter((r) => r.mailbox === mb)
    line(`  ${mb}@ (${sub.length}): afsender ${JSON.stringify(countBy(sub, (r) => r.result.senderType))} · type ${JSON.stringify(countBy(sub, (r) => r.result.inquiryType))}`)
  }
  line(`TVIVL-grunde: ${JSON.stringify(countBy(rows.flatMap((r) => r.result.doubts.map((d) => ({ d }))), (x) => x.d))}`)
  line(`REGLER (afsender): ${JSON.stringify(countBy(rows.flatMap((r) => r.result.rules.filter((h) => h.dimension === 'sender')), (h) => h.rule))}`)
  line(`REGLER (henvendelse): ${JSON.stringify(countBy(rows.flatMap((r) => r.result.rules.filter((h) => h.dimension === 'inquiry')), (h) => h.rule))}`)

  // Sammenligning med eksisterende arbejdsgange (shadow — ingen af dem er "facit", men uenighed viser hvor man skal kigge)
  const grp = (s: string) => (s === 'existing_customer' || s === 'web_form' ? 'kunde' : s === 'supplier' || s === 'cooperation_partner' ? 'leverandør/partner' : s === 'automated' ? 'automatisk' : s === 'internal' ? 'intern' : 'ukendt')
  const withEil = rows.filter((r) => r.actual.eil)
  line(`MOD MAIL-AI (email_intelligence_logs, n=${withEil.length}): ${JSON.stringify(countBy(withEil, (r) => `${r.actual.eil}→${grp(r.result.senderType)}`))}`)
  const agreeable = withEil.filter((r) => grp(r.result.senderType) !== 'ukendt' && ['customer', 'supplier', 'newsletter'].includes(r.actual.eil as string))
  const agree = agreeable.filter((r) => ({ customer: 'kunde', supplier: 'leverandør/partner', newsletter: 'automatisk' } as Record<string, string>)[r.actual.eil as string] === grp(r.result.senderType)).length
  line(`  enighed hvor begge har en afgørelse (kunde/leverandør/nyhedsbrev): ${agree}/${agreeable.length} = ${pct(agree, agreeable.length)}`)
  const inv = rows.filter((r) => r.actual.invoice), invPred = rows.filter((r) => r.invoiceTypeWithoutRegistry === 'invoice')
  const tp = invPred.filter((r) => r.actual.invoice).length
  line(`FAKTURA (uden registreringssignal) mod registrerede leverandørfakturaer: fundet ${tp}/${inv.length} (${pct(tp, inv.length)}) · forslag uden registrering ${invPred.length - tp}`)
  const linked = rows.filter((r) => r.actual.customerId)
  const sameCust = linked.filter((r) => r.matchedCustomerId === r.actual.customerId).length
  const custPred = rows.filter((r) => r.result.senderType === 'existing_customer')
  line(`KUNDEKOBLING: mails koblet til kunde i dag ${linked.length} (linked_by ${JSON.stringify(countBy(linked, (r) => r.actual.linkedBy ?? 'null'))}) · samme kunde fundet deterministisk ${sameCust} (${pct(sameCust, linked.length)}) · klassifikator "eksisterende kunde" ${custPred.length}`)
  const sa = rows.filter((r) => r.actual.stageAIntent)
  const invRows = rows.filter((r) => r.actual.invoice)
  line(`DIAGNOSE faktura (registrerede, n=${invRows.length}): afsender ${JSON.stringify(countBy(invRows, (r) => r.result.senderType))} · faktura-ord i emne ${invRows.filter((r) => r.diag.subjectInvoice).length} · bilag ${invRows.filter((r) => r.diag.hasAttachments).length} · videresendt ${invRows.filter((r) => r.diag.fwd).length}`)
  line(`  faktura-filnavn ${invRows.filter((r) => r.diag.attInvoice).length} · faktura-afsenderadresse ${invRows.filter((r) => r.diag.invoiceAddr).length} · alle mails med faktura-filnavn ${rows.filter((r) => r.diag.attInvoice).length}`)
  const salesUnknown = rows.filter((r) => r.result.inquiryType === 'sales_inquiry' && r.result.senderType === 'unknown')
  line(`DIAGNOSE salg fra ukendt afsender (n=${salesUnknown.length}): privat-maildomæne ${salesUnknown.filter((r) => r.diag.freeMail).length} · firmadomæne ${salesUnknown.filter((r) => !r.diag.freeMail).length} · med produktord ${salesUnknown.filter((r) => r.diag.terms.product.length).length} · nyhedsbrev-ord ${salesUnknown.filter((r) => r.diag.newsletterMarker).length} · svar-emne ${salesUnknown.filter((r) => r.diag.reply).length} · eneste salgsord "tilbud" ${salesUnknown.filter((r) => r.diag.terms.sales.join() === 'tilbud').length}`)
  line(`  mail-AI for disse: ${JSON.stringify(countBy(salesUnknown, (r) => r.actual.eil ?? 'ingen'))}`)
  for (const mb of ['kontakt', 'ordre'] as const) {
    const sub = rows.filter((r) => r.mailbox === mb)
    const top = (k: 'service' | 'sales' | 'product', type: string) => JSON.stringify(Object.fromEntries(Object.entries(countBy(sub.filter((r) => r.result.inquiryType === type).flatMap((r) => r.diag.terms[k].map((x) => ({ x }))), (o) => o.x)).slice(0, 12)))
    line(`DIAGNOSE ${mb}@ service-ord: ${top('service', 'service_request')} · salgs-ord: ${top('sales', 'sales_inquiry')}`)
    line(`  ${mb}@ service fra afsender ${JSON.stringify(countBy(sub.filter((r) => r.result.inquiryType === 'service_request'), (r) => r.result.senderType))} · salg fra ${JSON.stringify(countBy(sub.filter((r) => r.result.inquiryType === 'sales_inquiry'), (r) => r.result.senderType))}`)
  }
  line(`STAGE A (n=${sa.length}): ${JSON.stringify(countBy(sa, (r) => `${r.actual.stageAIntent}→${r.result.inquiryType}`))}`)
  return L
}
