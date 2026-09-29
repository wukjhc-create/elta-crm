/**
 * P3 #19 — leverandoerfaktura-pipelinen paa staging (probe-fakturaer, ryddes i finally). Ingen e-conomic:
 * I4 koerer KUN hvis staging ikke har en aktiv regnskabsintegration (ellers springes det over).
 *
 *   I1  dublet via leverandoer + fakturanummer findes (foer: matcheren fandt altid fakturaen selv paa file_hash)
 *   I2  en faktura er ikke dublet af sig selv
 *   I3  reparse af en godkendt faktura afvises; status uaendret (foer: blev sendt tilbage i koeen)
 *   I4  3x parallel godkendelse: praecis én vinder; de andre faar konflikt (foer: alle "ok" + e-conomic-forsoeg)
 *   I5  API-faktura: strukturerede hoveddata overlever parse (foer: regex paa JSON-tekst satte dem til null)
 *   I6  linje -> produkt: sku / ean / varenr. i tekst / intet match (deterministisk, kun samme leverandoer)
 *   I7  reel daekningsgrad + merbetaling maales paa probe-fakturaen
 *   I8  vedhaeftnings-gate (ren funktion): kun ved flag TIL + has_attachments + graph-id + ingen gemte URL'er
 *   I9  flag OFF: ingen Graph-hentning, faktura indlaeses fra broedtekst (uaendret prod-adfaerd)
 *   I10 flag TIL + Graph-fejl (ukendt message-id): sikker fallback — faktura indlaeses stadig fra broedtekst
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface InvCheck { id: string; ok: boolean; note: string }

export async function runInvoicePipeline(c: { admin: SupabaseClient; ownerUid: string }): Promise<InvCheck[]> {
  const out: InvCheck[] = []
  const { matchSupplierInvoice } = await import('../../src/lib/services/incoming-invoice-matcher')
  const { parseAndMatch, approveInvoice } = await import('../../src/lib/services/incoming-invoices')
  const stamp = Date.now()
  const created: Array<{ table: string; id: string }> = []
  const ins = async (table: string, row: Record<string, unknown>) => {
    const { data, error } = await c.admin.from(table).insert([row]).select('id')
    const id = (data?.[0] as { id?: string } | undefined)?.id
    if (error || !id) throw new Error(`seed ${table}: ${error?.message}`)
    created.unshift({ table, id })
    return id
  }
  try {
    const supplierName = `HARNESS Faktura Leverandør ${stamp}`
    const supplierId = await ins('suppliers', { name: supplierName, code: `HSINV${stamp}` })
    const invNo = `HARN-${stamp}`
    const base = { source: 'manual', supplier_id: supplierId, invoice_number: invNo, amount_incl_vat: 100, status: 'awaiting_approval', parse_status: 'parsed', raw_text: '' }
    const a = await ins('incoming_invoices', { ...base, file_hash: `harness-a-${stamp}` })
    const b = await ins('incoming_invoices', { ...base, file_hash: `harness-b-${stamp}`, invoice_number: null })

    const input = { supplierName, supplierVatNumber: null, invoiceNumber: invNo, workOrderHints: [], supplierOrderRefs: [], deliveryAddressHints: [] }
    const mB = await matchSupplierInvoice({ ...input, fileHash: `harness-b-${stamp}`, excludeInvoiceId: b })
    out.push({ id: 'I1 dublet via leverandør+nr', ok: mB.duplicateOfId === a, note: `duplicateOf=${mB.duplicateOfId === a ? 'A (korrekt)' : mB.duplicateOfId ?? 'ingen'} · leverandør=${mB.supplierId === supplierId ? 'genkendt' : 'ikke genkendt'}` })
    const mA = await matchSupplierInvoice({ ...input, invoiceNumber: null, fileHash: `harness-a-${stamp}`, excludeInvoiceId: a })
    out.push({ id: 'I2 ikke dublet af sig selv', ok: mA.duplicateOfId == null, note: `duplicateOf=${mA.duplicateOfId ?? 'ingen'}` })

    const locked = await ins('incoming_invoices', { ...base, invoice_number: `${invNo}-L`, file_hash: `harness-l-${stamp}`, status: 'approved', approved_by: c.ownerUid, approved_at: new Date().toISOString() })
    const rp = await parseAndMatch(locked)
    const st = ((await c.admin.from('incoming_invoices').select('status').eq('id', locked).single()).data as { status: string }).status
    out.push({ id: 'I3 reparse af godkendt afvises', ok: /låst/.test(rp.message) && st === 'approved', note: `${rp.message} · status=${st}` })

    const { count: econ } = await c.admin.from('accounting_integration_settings').select('id', { count: 'exact', head: true }).eq('active', true)
    if ((econ ?? 0) > 0) {
      out.push({ id: 'I4 parallel godkendelse', ok: false, note: 'SPRUNGET OVER: staging har aktiv regnskabsintegration (vil ikke risikere e-conomic-push)' })
    } else {
      const race = await ins('incoming_invoices', { ...base, invoice_number: `${invNo}-R`, file_hash: `harness-r-${stamp}`, requires_manual_review: false })
      const res = await Promise.all(Array.from({ length: 3 }, () => approveInvoice(race, c.ownerUid)))
      const conflicts = res.filter((r) => /ændret af en anden/.test(r.message)).length
      const { count: approvedAudits } = await c.admin.from('incoming_invoice_audit_log').select('id', { count: 'exact', head: true }).eq('incoming_invoice_id', race).eq('action', 'approved')
      out.push({ id: 'I4 parallel godkendelse', ok: conflicts === 2 && approvedAudits === 1,
        note: `konflikter=${conflicts}/2 · godkendt-audit=${approvedAudits} · vinder: ${res.find((r) => !/ændret af en anden/.test(r.message))?.message ?? '-'}` })
    }

    // I5 — API-lignende raekke: strukturerede felter + JSON raw_text (regex finder intet)
    const api = await ins('incoming_invoices', { source: 'manual', supplier_id: supplierId, supplier_name_extracted: 'LM', invoice_number: `${invNo}-API`,
      invoice_date: '2026-09-01', due_date: '2026-10-01', currency: 'DKK', amount_excl_vat: 800, vat_amount: 200, amount_incl_vat: 1000,
      raw_text: JSON.stringify({ doc: 'api', items: [1, 2] }), file_hash: `harness-api-${stamp}`, status: 'received', parse_status: 'pending', notes: 'api-ingest:LM' })
    await parseAndMatch(api, { supplierOrderRefs: [], workOrderHints: [] })
    const after = (await c.admin.from('incoming_invoices').select('supplier_id, invoice_number, invoice_date, amount_incl_vat, currency').eq('id', api).single()).data as Record<string, unknown>
    out.push({ id: 'I5 API-hoveddata bevares', ok: after.supplier_id === supplierId && after.invoice_number === `${invNo}-API` && after.invoice_date === '2026-09-01' && Number(after.amount_incl_vat) === 1000,
      note: `leverandør=${after.supplier_id === supplierId ? 'bevaret' : 'TABT'} · nr=${after.invoice_number ?? 'NULL'} · dato=${after.invoice_date ?? 'NULL'} · beløb=${after.amount_incl_vat ?? 'NULL'}` })

    // I6/I7 — probe-produkter + linjer
    const { resolveLineProducts } = await import('../../src/lib/invoice-control/line-matcher')
    const { measureCoverage } = await import('../../src/lib/invoice-control/coverage')
    const pSku = await ins('supplier_products', { supplier_id: supplierId, supplier_sku: `70${String(stamp).slice(-6)}`, supplier_name: 'Probe SKU', cost_price: 100, ean: null })
    const pEan = await ins('supplier_products', { supplier_id: supplierId, supplier_sku: `ZZ-${stamp}`, supplier_name: 'Probe EAN', cost_price: 50, ean: `57${String(stamp).slice(-11)}` })
    const pDesc = await ins('supplier_products', { supplier_id: supplierId, supplier_sku: `81${String(stamp).slice(-6)}`, supplier_name: 'Probe tekst', cost_price: 10 })
    const lines = [
      { lineNumber: 1, description: 'Kabel', supplierProductCode: `70${String(stamp).slice(-6)}` },
      { lineNumber: 2, description: 'Stikdåse', supplierProductCode: `57${String(stamp).slice(-11)}` },
      { lineNumber: 3, description: `Varenr ${`81${String(stamp).slice(-6)}`} afbryder`, supplierProductCode: null },
      { lineNumber: 4, description: 'Fragt', supplierProductCode: null },
    ]
    const m = await resolveLineProducts(c.admin, supplierId, lines)
    out.push({ id: 'I6 linje→produkt', ok: m[0].supplierProductId === pSku && m[0].method === 'sku' && m[1].supplierProductId === pEan && m[1].method === 'ean'
      && m[2].supplierProductId === pDesc && m[2].method === 'description_sku' && m[3].supplierProductId === null,
      note: m.map((x) => `${x.lineNumber}:${x.method ?? 'intet'}`).join(' ') })

    const cov = measureCoverage([{ id: api, supplier_id: supplierId, lines: [
      { line_number: 1, description: 'Kabel', quantity: 10, unit_price: 110, supplier_product_id: pSku, raw_line: null },          // +10 % -> merbetaling 100
      { line_number: 2, description: 'Stikdåse', quantity: 4, unit_price: 50, supplier_product_id: null, raw_line: JSON.stringify({ supplier_product_code: lines[1].supplierProductCode }) },
      { line_number: 3, description: lines[2].description, quantity: 20, unit_price: 10, supplier_product_id: null, raw_line: null },
      { line_number: 4, description: 'Fragt', quantity: 1, unit_price: 95, supplier_product_id: null, raw_line: null },
    ] }], new Map([[supplierId, [
      { id: pSku, supplier_sku: `70${String(stamp).slice(-6)}`, ean: null, cost_price: 100 },
      { id: pEan, supplier_sku: `ZZ-${stamp}`, ean: `57${String(stamp).slice(-11)}`, cost_price: 50 },
      { id: pDesc, supplier_sku: `81${String(stamp).slice(-6)}`, ean: null, cost_price: 10 },
    ]]]), new Map([[pSku, { id: pSku, supplier_sku: null, ean: null, cost_price: 100 }]]))
    out.push({ id: 'I7 reel dækning + merbetaling', ok: cov.coveragePct === 75 && cov.controllableLines === 3 && cov.overchargeAmount === 100 && cov.verdicts.deviation === 1 && cov.byMethod.stored === 1,
      note: `dækning=${cov.coveragePct}% (${cov.controllableLines}/${cov.lines}) · merbetaling=${cov.overchargeAmount} kr · metoder=${JSON.stringify(cov.byMethod)}` })

    // I8 — ren gate-funktion
    const { shouldFetchAttachments } = await import('../../src/lib/invoice-control/attachment-gate')
    const g = (has: boolean, urls: unknown, gid: string | null, on: boolean) => shouldFetchAttachments({ has_attachments: has, attachment_urls: urls, graph_message_id: gid }, on)
    const gateOk = g(true, null, 'x', true) && g(true, [], 'x', true) && g(true, [{ url: '' }], 'x', true)
      && !g(true, null, 'x', false) && !g(false, null, 'x', true) && !g(true, null, null, true) && !g(true, [{ url: 'https://s/x.pdf' }], 'x', true)
    out.push({ id: 'I8 vedhæftnings-gate', ok: gateOk, note: gateOk ? 'kun flag TIL + vedhæftning + graph-id + ingen URL → hent' : 'forkert gate-logik' })

    // I9/I10 — ingestFromEmail med probe-mails (broedtekst >= 200 tegn, has_attachments, falsk graph-id)
    const { ingestFromEmail } = await import('../../src/lib/services/incoming-invoices')
    const body = (n: string) => `Faktura ${n}
Fakturanummer: ${n}
Fakturadato: 01-09-2026
Forfaldsdato: 01-10-2026
Beløb i alt inkl. moms: 1.250,00 DKK
` + 'Tak for handlen. '.repeat(12)
    const prev = process.env.INVOICE_ATTACHMENT_FETCH_ENABLED
    const probe = async (tag: string, flag: 'true' | undefined) => {
      const n = `${invNo}-${tag}`
      const mail = await ins('incoming_emails', { sender_email: `faktura-${tag.toLowerCase()}-${stamp}@harness.test`, sender_name: supplierName, subject: `[HARNESS] Faktura ${n}`,
        body_text: body(n), has_attachments: true, graph_message_id: `harness-missing-${tag}-${stamp}` })
      if (flag) process.env.INVOICE_ATTACHMENT_FETCH_ENABLED = flag; else delete process.env.INVOICE_ATTACHMENT_FETCH_ENABLED
      try { return await ingestFromEmail(mail) } finally {
        if (prev === undefined) delete process.env.INVOICE_ATTACHMENT_FETCH_ENABLED; else process.env.INVOICE_ATTACHMENT_FETCH_ENABLED = prev
      }
    }
    const track = (ids: string[]) => ids.forEach((id) => created.unshift({ table: 'incoming_invoices', id }))
    const off = await probe('OFF', undefined); track(off.invoiceIds)
    const tried = (r: { errors: string[] }) => r.errors.some((e) => /attachment fetch failed/.test(e))
    out.push({ id: 'I9 flag OFF: ingen hentning', ok: off.ingested === 1 && !tried(off), note: `indlæst=${off.ingested} · hentforsøg=${tried(off) ? 'JA' : 'nej'} · fejl=${off.errors.length}` })
    const on = await probe('ON', 'true'); track(on.invoiceIds)
    out.push({ id: 'I10 flag TIL + Graph-fejl: fallback', ok: on.ingested === 1 && tried(on), note: `indlæst=${on.ingested} · hentforsøg=${tried(on) ? 'ja (fejlede → brødtekst)' : 'NEJ'}` })
  } finally {
    for (const x of created) {
      if (x.table === 'incoming_invoices') await c.admin.from('incoming_invoice_audit_log').delete().eq('incoming_invoice_id', x.id)
      await c.admin.from(x.table).delete().eq('id', x.id)
    }
  }
  return out
}

export function formatInvoicePipeline(c: InvCheck[]): string {
  const bad = c.filter((x) => !x.ok).length
  return ['', 'LEVERANDØRFAKTURA-PIPELINE (P3 #19):', ...c.map((x) => `  ${x.ok ? '✓' : '❌'} ${x.id.padEnd(34)} ${x.note}`),
    bad ? `  ❌ ${bad} afvigelse(r)` : `  ✅ alle ${c.length} pipeline-checks som forventet`].join('\n')
}
