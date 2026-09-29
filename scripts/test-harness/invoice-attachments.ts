/**
 * IC11–IC13 paa staging (probe-data, ryddes i finally). Ingen Graph: PDF'er lagres direkte i staging-storage og
 * attachment_urls saettes paa probe-mailen (samme form som email-attachment-storage skriver).
 *
 *   A1  kundens egen mail (afsender = kobl. kundes e-mail) frasorteres — ingen faktura
 *   A2  flag OFF: broedtekst-faktura oprettes (uaendret adfaerd)
 *   A3  flag TIL + PDF: SAMME faktura opgraderes (ingen ny raekke), PDF-fakturanummer/beloeb, audit-spor
 *   A4  genkoersel er idempotent: ingen ny raekke, ingen ny opgradering
 *   A5  backfill (afgraenset til probe-mail): opgraderer, logger pr. mail; 2. koersel har 0 kandidater
 *   A6  ekstra PDF uden fakturanummer (fx betingelser) giver ikke en ekstra faktura
 *   A7  backfill er no-op naar flaget er OFF
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { makeTextPdf } from './pdf-fixture'

export interface AttCheck { id: string; ok: boolean; note: string }

export async function runInvoiceAttachments(c: { admin: SupabaseClient; ownerUid: string }): Promise<AttCheck[]> {
  const out: AttCheck[] = []
  const { ingestFromEmail } = await import('../../src/lib/services/incoming-invoices')
  const { backfillInvoiceAttachments } = await import('../../src/lib/invoice-control/attachment-backfill')
  const stamp = Date.now()
  const created: Array<{ table: string; id: string }> = []
  const paths: string[] = []
  const prevFlag = process.env.INVOICE_ATTACHMENT_FETCH_ENABLED
  const flag = (on: boolean) => { if (on) process.env.INVOICE_ATTACHMENT_FETCH_ENABLED = 'true'; else delete process.env.INVOICE_ATTACHMENT_FETCH_ENABLED }
  const ins = async (table: string, row: Record<string, unknown>) => {
    const { data, error } = await c.admin.from(table).insert([row]).select('id')
    const id = (data?.[0] as { id?: string } | undefined)?.id
    if (error || !id) throw new Error(`seed ${table}: ${error?.message}`)
    created.unshift({ table, id })
    return id
  }
  const track = (ids: string[]) => ids.forEach((id) => { if (!created.some((x) => x.id === id)) created.unshift({ table: 'incoming_invoices', id }) })
  const body = (n: string) => `Faktura ${n}\nFakturanummer: ${n}\nFakturadato: 01-09-2026\nBeløb i alt inkl. moms: 999,00 DKK\n` + 'Se vedhæftede faktura. '.repeat(10)
  const mail = async (tag: string, extra: Record<string, unknown> = {}) => ins('incoming_emails', {
    sender_email: `faktura-${tag.toLowerCase()}-${stamp}@harness.test`, sender_name: `HARNESS Leverandør ${stamp}`, subject: `[HARNESS] Faktura ${tag}`,
    body_text: body(`HB-${tag}-${stamp}`), has_attachments: true, graph_message_id: `harness-att-${tag}-${stamp}`, to_email: 'harness@harness.test', ...extra })
  const storePdf = async (emailId: string, name: string, lines: string[]) => {
    const path = `email-attachments/${emailId}/${name}`
    const { error } = await c.admin.storage.from('attachments').upload(path, makeTextPdf(lines), { contentType: 'application/pdf', upsert: true })
    if (error) throw new Error(`upload: ${error.message}`)
    paths.push(path)
    const { data: signed } = await c.admin.storage.from('attachments').createSignedUrl(path, 3600)
    return { filename: name, contentType: 'application/pdf', size: 1000, url: signed?.signedUrl ?? '', storagePath: path }
  }
  const invoicesFor = async (emailId: string) => ((await c.admin.from('incoming_invoices')
    .select('id, file_name, mime_type, invoice_number, amount_incl_vat, status').eq('source_email_id', emailId)).data ?? []) as Array<Record<string, any>>
  const pdfNo = (tag: string) => `PDF${tag}${String(stamp).slice(-7)}`
  const pdfLines = (tag: string) => ['HARNESS El-grossist A/S', `Faktura ${pdfNo(tag)}`, `Fakturanummer: ${pdfNo(tag)}`, 'Fakturadato: 02-09-2026',
    'Forfaldsdato: 02-10-2026', 'Beloeb i alt inkl. moms: 2.500,00 DKK', 'Varenr 1234567 Kabel 3x1,5 10 stk']

  try {
    // A1 — kundens egen mail
    const custEmail = `kunde-${stamp}@harness.test`
    const cust = await ins('customers', { customer_number: `HARNESS-ATT-${stamp}`, company_name: '[HARNESS] att-kunde', contact_person: 'K', email: custEmail, created_by: c.ownerUid, custom_fields: { harness: 'invoice-attachments' } })
    const own = await mail('OWN', { sender_email: custEmail, customer_id: cust })
    flag(false)
    const r1 = await ingestFromEmail(own); track(r1.invoiceIds)
    out.push({ id: 'A1 kundens egen mail frasorteres', ok: r1.ingested === 0 && !!r1.skipped?.includes('customer_mail') && (await invoicesFor(own)).length === 0,
      note: `skipped=${(r1.skipped ?? []).join(',') || '-'} · fakturaer=${(await invoicesFor(own)).length}` })

    // A2 — flag OFF: broedtekst-faktura
    const m = await mail('UPG')
    const r2 = await ingestFromEmail(m); track(r2.invoiceIds)
    const before = await invoicesFor(m)
    out.push({ id: 'A2 flag OFF: brødtekst-faktura', ok: r2.ingested === 1 && before.length === 1 && before[0].file_name === `email-${m}.txt`,
      note: `fakturaer=${before.length} · fil=${before[0]?.file_name === `email-${m}.txt` ? 'brødtekst' : before[0]?.file_name}` })

    // A3 — flag TIL + PDF lagret: opgradering af SAMME raekke
    const att = await storePdf(m, 'faktura.pdf', pdfLines('U'))
    await c.admin.from('incoming_emails').update({ attachment_urls: [att] }).eq('id', m)
    flag(true)
    const r3 = await ingestFromEmail(m); track(r3.invoiceIds)
    const after = await invoicesFor(m)
    const { data: trail } = await c.admin.from('incoming_invoice_audit_log').select('action').eq('incoming_invoice_id', before[0]?.id).eq('action', 'upgraded_from_attachment')
    out.push({ id: 'A3 PDF opgraderer samme faktura', ok: r3.upgraded === 1 && r3.ingested === 0 && after.length === 1 && after[0].id === before[0]?.id
        && after[0].file_name === 'faktura.pdf' && after[0].invoice_number === pdfNo('U') && Number(after[0].amount_incl_vat) === 2500 && (trail ?? []).length === 1,
      note: `rækker=${after.length} · samme id=${after[0]?.id === before[0]?.id} · nr=${after[0]?.invoice_number === pdfNo('U') ? 'fra PDF' : after[0]?.invoice_number} · beløb=${after[0]?.amount_incl_vat} · audit=${(trail ?? []).length} · status=${after[0]?.status}` })

    // A4 — idempotens
    const r4 = await ingestFromEmail(m); track(r4.invoiceIds)
    out.push({ id: 'A4 genkørsel idempotent', ok: (await invoicesFor(m)).length === 1 && (r4.upgraded ?? 0) === 0 && r4.ingested === 0,
      note: `rækker=${(await invoicesFor(m)).length} · upgraded=${r4.upgraded} · dup=${r4.duplicates}` })

    // A5 — backfill afgraenset til probe-mail
    flag(false)
    const b = await mail('BF')
    const rb = await ingestFromEmail(b); track(rb.invoiceIds)
    await c.admin.from('incoming_emails').update({ attachment_urls: [await storePdf(b, 'Faktura_BF.pdf', pdfLines('B'))] }).eq('id', b)
    flag(true)
    const s1 = await backfillInvoiceAttachments({ limit: 10, onlyEmailIds: [b] })
    const s2 = await backfillInvoiceAttachments({ limit: 10, onlyEmailIds: [b] })
    const bInv = await invoicesFor(b)
    const { data: bAudit } = await c.admin.from('incoming_invoice_audit_log').select('message').eq('incoming_invoice_id', bInv[0]?.id).eq('action', 'attachment_backfill')
    out.push({ id: 'A5 backfill + log pr. mail', ok: s1.processed === 1 && s1.results[0]?.outcome === 'upgraded' && s2.candidates === 0 && bInv.length === 1 && bInv[0].invoice_number === pdfNo('B') && (bAudit ?? []).length === 1,
      note: `1. kørsel=${s1.results.map((x) => x.outcome).join(',')} · 2. kørsel kandidater=${s2.candidates} · rækker=${bInv.length} · log=${(bAudit ?? []).length}` })

    // A6 — ny mail med faktura-PDF + betingelser-PDF
    const x = await mail('TWO', { body_text: 'kort' })
    await c.admin.from('incoming_emails').update({ attachment_urls: [
      await storePdf(x, 'faktura_two.pdf', pdfLines('T')),
      await storePdf(x, 'salgsbetingelser.pdf', ['Salgs- og leveringsbetingelser', 'Gaelder for alle leverancer fra HARNESS El-grossist A/S', 'Ejendomsforbehold gaelder indtil betaling er sket.']),
    ] }).eq('id', x)
    const r6 = await ingestFromEmail(x); track(r6.invoiceIds)
    const xInv = await invoicesFor(x)
    out.push({ id: 'A6 betingelses-PDF ≠ faktura', ok: r6.ingested === 1 && xInv.length === 1 && xInv[0].invoice_number === pdfNo('T') && !!r6.skipped?.includes('non_invoice_attachment'),
      note: `fakturaer=${xInv.length} · skipped=${(r6.skipped ?? []).join(',') || '-'}` })

    // A7 — flag OFF: backfill no-op
    flag(false)
    const s3 = await backfillInvoiceAttachments({ limit: 10, onlyEmailIds: [b] })
    out.push({ id: 'A7 backfill no-op ved flag OFF', ok: !s3.enabled && s3.processed === 0, note: `enabled=${s3.enabled} · behandlet=${s3.processed}` })
  } finally {
    if (prevFlag === undefined) delete process.env.INVOICE_ATTACHMENT_FETCH_ENABLED; else process.env.INVOICE_ATTACHMENT_FETCH_ENABLED = prevFlag
    // fakturaer oprettet via ingest men ikke sporet (fx ved fejl midt i en test)
    const emailIds = created.filter((x) => x.table === 'incoming_emails').map((x) => x.id)
    if (emailIds.length) {
      const { data: stray } = await c.admin.from('incoming_invoices').select('id').in('source_email_id', emailIds)
      track(((stray ?? []) as Array<{ id: string }>).map((r) => r.id))
    }
    for (const x of created) {
      if (x.table === 'incoming_invoices') {
        await c.admin.from('incoming_invoice_audit_log').delete().eq('incoming_invoice_id', x.id)
        await c.admin.from('incoming_invoice_lines').delete().eq('incoming_invoice_id', x.id)
      }
      await c.admin.from(x.table).delete().eq('id', x.id)
    }
    if (paths.length) await c.admin.storage.from('attachments').remove(paths)
  }
  return out
}

export function formatInvoiceAttachments(c: AttCheck[]): string {
  const bad = c.filter((x) => !x.ok).length
  return ['', 'FAKTURA-VEDHÆFTNINGER (IC11–IC13):', ...c.map((x) => `  ${x.ok ? '✓' : '❌'} ${x.id.padEnd(34)} ${x.note}`),
    bad ? `  ❌ ${bad} afvigelse(r)` : `  ✅ alle ${c.length} vedhæftnings-checks som forventet`].join('\n')
}
