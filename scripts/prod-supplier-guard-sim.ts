/**
 * Leverandør-/kunde-integritetsværn — PRODUCTION READ-ONLY simulering (2026-11-23). Ingen skrivning, kun antal.
 * Anvender den RIGTIGE rene regel (decideSupplierSender) på alle indgående afsendere med evidens indlæst via SQL, og
 * sammenligner med i dag: hvilke afsendere værnet fanger (og hvorfor), hvad der sker med de 111 auto-oprettede kunder
 * (baseline 12 / 56 / 43), og om nogen ægte kunde fejlagtigt fanges.
 *   npx tsx scripts/prod-supplier-guard-sim.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { decideSupplierSender, normalizeSender, domainOf, websiteDomain, domainUsableAsEvidence, type SupplierEvidence } from '../src/lib/email/supplier-senders'

withProdReadOnly('prod-supplier-guard-sim', async (run) => {
  const sup = await run(`SELECT contact_email, website FROM suppliers WHERE is_active`)
  const supplierEmails = new Set<string>(), supplierDomains = new Set<string>()
  for (const r of sup) { const ce = normalizeSender(r.contact_email); if (ce) { supplierEmails.add(ce); const d = domainOf(ce); if (d && domainUsableAsEvidence(d)) supplierDomains.add(d) } const wd = websiteDomain(r.website); if (wd && domainUsableAsEvidence(wd)) supplierDomains.add(wd) }
  // pr. afsender: distinkte mails klassificeret supplier/customer (samme mail begge veje tæller som supplier — som loaderen)
  const hist = await run(`SELECT lower(e.sender_email) s,
      count(DISTINCT e.id) FILTER (WHERE EXISTS (SELECT 1 FROM email_intelligence_logs l WHERE l.email_id = e.id AND l.classification = 'supplier'))::int sup,
      count(DISTINCT e.id) FILTER (WHERE EXISTS (SELECT 1 FROM email_intelligence_logs l WHERE l.email_id = e.id AND l.classification = 'customer')
        AND NOT EXISTS (SELECT 1 FROM email_intelligence_logs l WHERE l.email_id = e.id AND l.classification = 'supplier'))::int cust,
      count(*)::int mails, count(*) FILTER (WHERE e.customer_id IS NOT NULL AND coalesce(e.linked_by, '') <> 'manual')::int auto_linked
    FROM incoming_emails e WHERE e.sender_email NOT ILIKE '%@eltasolar.dk' AND e.sender_email LIKE '%@%' GROUP BY 1`)
  const byDomain = new Map<string, { supplier: number; customer: number; senders: Set<string> }>()
  for (const h of hist) { const d = domainOf(h.s); if (!d) continue; const x = byDomain.get(d) ?? { supplier: 0, customer: 0, senders: new Set<string>() }; x.supplier += h.sup; x.customer += h.cust; if (h.sup > 0) x.senders.add(h.s); byDomain.set(d, x) }
  const decide = (email: string) => {
    const h = hist.find((x) => x.s === email)
    const d = domainOf(email); const dh = d ? byDomain.get(d) : undefined
    const ev: SupplierEvidence = { supplierEmails, supplierDomains, senderHistory: { supplier: h?.sup ?? 0, customer: h?.cust ?? 0 },
      domainHistory: d && domainUsableAsEvidence(d) && dh ? { supplier: dh.supplier, customer: dh.customer, supplierSenders: dh.senders.size } : null }
    return decideSupplierSender(email, ev)
  }
  const reasons: Record<string, number> = {}
  let supSenders = 0, supMails = 0, vetoedAutoLinks = 0
  for (const h of hist) { const r = decide(h.s); if (r.isSupplier) { supSenders++; supMails += h.mails; vetoedAutoLinks += h.auto_linked; for (const x of r.reasons) reasons[x] = (reasons[x] ?? 0) + 1 } }
  console.log(`INFO  indgående afsendere: ${hist.length} · værnet fanger ${supSenders} afsendere (${supMails} mails) · årsager ${JSON.stringify(reasons)}`)
  console.log(`INFO  automatiske kundekoblinger der ville være blevet nedlagt veto mod (historisk): ${vetoedAutoLinks}`)

  // De 111 auto-oprettede kunder — baseline-klassifikation (samme regel som rapporten 2026-11-22) + værnets syn
  const SUP = `('mikma.dk','lemvigmueller.dk','lemvigh-muller.dk','lemvighmuller.dk','solar.dk','ao.dk','eltagrossisten.dk')`
  const autos = await run(`SELECT c.id, lower(c.email) email,
      (lower(split_part(c.email, '@', 2)) IN ${SUP} OR EXISTS (SELECT 1 FROM email_intelligence_logs l WHERE l.customer_id = c.id AND l.classification = 'supplier' AND l.action IN ('created','matched'))) base_sup,
      (EXISTS (SELECT 1 FROM email_intelligence_logs l WHERE l.customer_id = c.id AND l.classification = 'customer' AND l.action = 'created')
        AND c.phone IS NOT NULL AND coalesce(c.billing_address, '') <> '' AND c.email NOT ILIKE '%@elta-crm.local') base_gen
    FROM customers c WHERE 'auto-email' = ANY(c.tags)`)
  const cls = { likely_supplier_partner: 0, likely_genuine_customer: 0, unknown: 0 }
  const guard = { supplier_guarded: 0, genuine_guarded: 0, unknown_guarded: 0, placeholder_email: 0 }
  for (const a of autos) {
    const k = a.base_sup ? 'likely_supplier_partner' : a.base_gen ? 'likely_genuine_customer' : 'unknown'
    cls[k]++
    if (/@elta-crm\.local$/.test(a.email ?? '')) { guard.placeholder_email++; continue }
    if (a.email && decide(a.email).isSupplier) { if (k === 'likely_supplier_partner') guard.supplier_guarded++; else if (k === 'likely_genuine_customer') guard.genuine_guarded++; else guard.unknown_guarded++ }
  }
  console.log(`INFO  auto-oprettede kunder: ${autos.length} · ${JSON.stringify(cls)} (baseline 2026-11-22: 111 · 12 / 56 / 43)`)
  console.log(`INFO  værnet på auto-kundernes e-mail: ${JSON.stringify(guard)}`)
  // Ikke-auto kunder (manuelt oprettede) fanget af værnet — skal være 0 eller forklares
  const manual = await run(`SELECT lower(email) email FROM customers WHERE NOT ('auto-email' = ANY(tags)) AND email LIKE '%@%' AND email NOT ILIKE '%@elta-crm.local'`)
  const manualGuarded = manual.filter((m) => decide(m.email).isSupplier).length
  console.log(`INFO  manuelt oprettede kunder hvis e-mail værnet ville fange: ${manualGuarded} af ${manual.length}`)
  // Eksisterende henvendelser med kundekandidat: hvor mange ville værnet have stoppet?
  const convs = await run(`SELECT DISTINCT lower(e.sender_email) s, c.id FROM conversations c JOIN conversation_items i ON i.conversation_id = c.id AND i.source_table = 'incoming_emails' JOIN incoming_emails e ON e.id = i.source_id
    WHERE c.customer_candidate_id IS NOT NULL AND c.customer_id IS NULL`)
  console.log(`INFO  henvendelser med kundekandidat: ${new Set(convs.map((c) => c.id)).size} · heraf afsender fanget af værnet: ${new Set(convs.filter((c) => decide(c.s).isSupplier).map((c) => c.id)).size}`)
  // Scenarier
  const firstOf = (pred: (r: { s: string; sup: number; cust: number }) => boolean) => hist.find(pred)?.s ?? null
  const wholesaler = firstOf((r) => !!domainOf(r.s) && ['mikma.dk','lemvigmueller.dk','lemvigh-muller.dk','lemvighmuller.dk','solar.dk','ao.dk','eltagrossisten.dk'].some((d) => domainOf(r.s) === d || domainOf(r.s)!.endsWith(`.${d}`)))
  const pollutedEmail = autos.find((a) => a.base_sup && a.email && !/@elta-crm\.local$/.test(a.email))?.email ?? null
  const genuineEmail = autos.find((a) => a.base_gen && a.email)?.email ?? null
  console.log(`SCENARIE kendt grossist: ${wholesaler ? (decide(wholesaler).isSupplier ? 'leverandør → ingen kunde/kobling/kandidat' : 'IKKE fanget') : 'ingen afsender i prod'}`)
  console.log(`SCENARIE forurenet leverandør-kunde: ${pollutedEmail ? (decide(pollutedEmail).isSupplier ? `leverandør (${decide(pollutedEmail).reasons.join(',')}) → ingen auto-kobling/kandidat` : 'IKKE fanget af deterministisk evidens') : 'ingen'}`)
  console.log(`SCENARIE normal kunde: ${genuineEmail ? (decide(genuineEmail).isSupplier ? 'FEJLAGTIGT fanget' : 'ikke leverandør → kandidat som før') : 'ingen'}`)
  console.log(`SCENARIE ukendt afsender: ${decide('ny-afsender@helt-ukendt-firma-xyz.dk').isSupplier ? 'FEJLAGTIGT fanget' : 'ikke leverandør → nuværende adfærd'}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
