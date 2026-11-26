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
import { classifyAll, type ShadowData, type ShadowRow } from '../../src/lib/classification/inquiry-context'
export { classifyAll, type ShadowData, type ShadowRow }

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

/** Optællinger til målepunkt-rapporten (C0) */
export function shadowCounts(rows: ShadowRow[]): { total: number; sender: Record<string, number>; inquiry: Record<string, number>; action: Record<string, number>; multiCustomerEmail: number } {
  return {
    total: rows.length,
    sender: countBy(rows, (r) => r.result.senderType),
    inquiry: countBy(rows, (r) => r.result.inquiryType),
    action: countBy(rows, (r) => r.result.proposedAction),
    multiCustomerEmail: rows.filter((r) => r.result.doubts.includes('sender:email_matches_several_customers')).length,
  }
}
