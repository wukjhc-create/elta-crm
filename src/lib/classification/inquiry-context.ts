/**
 * Phase C1 — kontekst for henvendelses-klassifikation, bygget "som på modtagelsestidspunktet". Ren funktion over
 * indlæste data (ingen DB, ikke 'use server'). Bruges af shadow-målingen (bulk, scripts/test-harness/inquiry-shadow-core)
 * og af C1a-feedback (delmængde for én mail, ./load-email-classification) — så begge giver PRÆCIS samme resultat.
 * Kun kunder/kontakter oprettet FØR mailen og kun historik fra tidligere mails tæller.
 */
import { classifyInquiry, type InquiryClassification, type InquiryContext } from './inquiry-classifier'
import { caseNumbersInText, extractTextSignals, formEmail, matchedSignalTerms } from './inquiry-text-signals'
import { decideSupplierSender, domainOf, domainUsableAsEvidence, normalizeSender, websiteDomain, type SupplierEvidence } from '@/lib/email/supplier-senders'
import { isAutomatedSender } from '@/lib/parties/communication-class'
import { isFreeMailDomain } from '@/lib/email/free-mail-domains'
import { isWebsiteInquiry, normalizeFormSubmitTable } from '@/lib/mail/website-inquiry'

export interface EmailRow {
  id: string; received_at: string; to_email: string; sender_email: string | null; original_sender_email: string | null; is_forwarded: boolean | null
  subject: string | null; body: string | null; has_attachments: boolean | null; att_invoice: boolean | null; thread: string | null; customer_id: string | null
  linked_by: string | null; link_status: string | null; service_case_id: string | null
}
/** Indlæste data (bulk i shadow, delmængde for én mail i C1a) */
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
  /** Mailens id (tilføjet Phase C — gør det muligt at parre rækker uden sortering) */
  emailId: string
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
export function classifyAll(d: ShadowData, opts: { since?: string; onlyIds?: readonly string[] } = {}): ShadowRow[] {
  const sinceMs = opts.since ? Date.parse(opts.since) : -Infinity
  const only = opts.onlyIds ? new Set(opts.onlyIds) : null
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
    if (only && !only.has(e.id)) continue
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
      emailId: e.id,
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
