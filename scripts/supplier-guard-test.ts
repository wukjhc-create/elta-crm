/**
 * Leverandør-/kunde-integritetsværn (2026-11-23) — rene tests + Stage A-indtag med falsk kapabilitet (ingen DB).
 *   npx tsx scripts/supplier-guard-test.ts
 * Dynamisk: `cli.ts supplier-guard-staging` (rigtig kode mod staging), prod: `scripts/prod-supplier-guard-sim.ts` (read-only).
 */
import { readFileSync } from 'fs'
import { decideSupplierSender, classifySupplierSender, clearSupplierSenderCache, websiteDomain, NO_EVIDENCE, SUPPLIER_DOMAINS, type SupplierEvidence } from '../src/lib/email/supplier-senders'
import { ingestEmailSource } from '../src/lib/reception/channel-intake'

let fails = 0
const ok = (c: boolean, n: string, note = '') => { if (c) console.log(`PASS  ${n}`); else { fails++; console.log(`FAIL  ${n}${note ? ` (${note})` : ''}`) } }
const ev = (o: Partial<SupplierEvidence>): SupplierEvidence => ({ ...NO_EVIDENCE, ...o })

async function main() {
  // ── Ren afgørelse ──
  ok(decideSupplierSender('ordre@ao.dk', NO_EVIDENCE).isSupplier && decideSupplierSender('ordre@ao.dk', NO_EVIDENCE).reasons.includes('known_wholesaler_domain'), 'A: kendt grossist-domæne → leverandør (uden at stå i customers)')
  ok(decideSupplierSender('x@salg.solar.dk', NO_EVIDENCE).isSupplier, 'A: underdomæne af kendt grossist → leverandør')
  ok(!decideSupplierSender('x@notsolar.dk', NO_EVIDENCE).isSupplier, 'A: lignende men andet domæne (notsolar.dk) → ikke leverandør')
  ok(decideSupplierSender('kontakt@inverter-support.dk', ev({ supplierEmails: new Set(['kontakt@inverter-support.dk']) })).reasons.includes('supplier_contact_email'), 'B-felt: suppliers.contact_email (eksakt) → leverandør')
  ok(decideSupplierSender('salg@panelhuset.dk', ev({ supplierDomains: new Set(['panelhuset.dk']) })).reasons.includes('supplier_website_domain'), 'B-felt: suppliers.website-domæne → leverandør')
  ok(decideSupplierSender('anne@firma.dk', ev({ senderHistory: { supplier: 2, customer: 0 } })).reasons.includes('sender_history_supplier'), 'C: samme afsender tidligere klassificeret supplier → leverandør')
  ok(!decideSupplierSender('anne@firma.dk', ev({ senderHistory: { supplier: 1, customer: 3 } })).isSupplier, 'C: flere kunde- end leverandør-klassifikationer → ikke leverandør (blandet historik, E)')
  ok(!decideSupplierSender('anne@firma.dk', ev({ senderHistory: { supplier: 1, customer: 1 } })).isSupplier, 'C/E: blandet historik 1/1 → ikke leverandør (én AI-klassifikation vipper ikke en kunde)')
  ok(!decideSupplierSender('anne@firma.dk', ev({ senderHistory: { supplier: 9, customer: 6 } })).isSupplier, 'C/E: blandet historik 9/6 → ikke leverandør (både leverandør og kunde — partsmodellen afgør)')
  ok(decideSupplierSender('anne@firma.dk', ev({ senderHistory: { supplier: 6, customer: 2 } })).isSupplier, 'C: klart dominerende leverandør-historik (≥ 3 og ≥ 2×) → leverandør')
  ok(decideSupplierSender('ny@grossist.dk', ev({ domainHistory: { supplier: 5, customer: 0, supplierSenders: 3 } })).reasons.includes('domain_history_supplier'), 'C: domæne med stærk, entydig leverandør-historik → leverandør')
  ok(!decideSupplierSender('ny@grossist.dk', ev({ domainHistory: { supplier: 5, customer: 0, supplierSenders: 1 } })).isSupplier, 'C: domænehistorik fra kun ÉN afsender → ikke nok')
  ok(!decideSupplierSender('ny@blandet.dk', ev({ domainHistory: { supplier: 4, customer: 3, supplierSenders: 2 } })).isSupplier, 'C: domæne med blandet historik (< 80 %) → ikke leverandør')
  // H: gratis-mail
  ok(decideSupplierSender('lars.leverandor@gmail.com', ev({ senderHistory: { supplier: 3, customer: 0 } })).isSupplier, 'H: gratis-mail-afsender med egen leverandør-historik → kun DEN adresse er leverandør')
  ok(!decideSupplierSender('kunde.jensen@gmail.com', ev({ domainHistory: { supplier: 50, customer: 0, supplierSenders: 10 } })).isSupplier, 'H: gmail.com bliver ALDRIG leverandør-domæne (heller ikke ved meget historik)')
  ok(!decideSupplierSender('x@gmail.com', ev({ supplierDomains: new Set(['gmail.com']) })).isSupplier, 'H: gratis-maildomæne i suppliers.website ignoreres')
  ok(!decideSupplierSender('kontakt@eltasolar.dk', ev({ domainHistory: { supplier: 9, customer: 0, supplierSenders: 3 } })).isSupplier, 'eget domæne er aldrig leverandør-evidens')
  ok(!decideSupplierSender('kunde@example.dk', NO_EVIDENCE).isSupplier, 'G: ukendt afsender uden evidens → ikke leverandør (nuværende adfærd)')
  ok(websiteDomain('https://www.ao.dk/shop?x=1') === 'ao.dk' && websiteDomain('lemvigh-muller.dk') === 'lemvigh-muller.dk' && websiteDomain('ikke et domæne') === null, 'website → domæne')
  ok(SUPPLIER_DOMAINS.has('ao.dk') && SUPPLIER_DOMAINS.has('solar.dk'), 'grossist-listen er flyttet uændret')

  // ── Loader mod falsk DB: B (forurenet kunderække + historik) ──
  type Rows = Record<string, Array<Record<string, unknown>>>
  const fakeDb = (rows: Rows) => ({
    from: (t: string) => {
      const filters: Array<(r: Record<string, unknown>) => boolean> = []
      const q: Record<string, unknown> = {
        select: () => q, eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q },
        ilike: (c: string, pat: string) => { const p = pat.replace(/\\/g, '').toLowerCase(); filters.push((r) => { const v = String(r[c] ?? '').toLowerCase(); return p.startsWith('%') ? v.endsWith(p.slice(1)) : v === p }); return q },
        in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q },
        order: () => q,
        limit: async () => ({ data: (rows[t] ?? []).filter((r) => filters.every((f) => f(r))), error: null }),
      }
      return q
    },
  })
  clearSupplierSenderCache()
  const db = fakeDb({
    suppliers: [{ contact_email: null, website: 'https://www.lemvigh-muller.dk', is_active: true }],
    incoming_emails: [{ id: 'e1', sender_email: 'faktura@polluted-supplier.dk' }, { id: 'e2', sender_email: 'faktura@polluted-supplier.dk' }, { id: 'e3', sender_email: 'kunde@gmail.com' }],
    email_intelligence_logs: [{ email_id: 'e1', classification: 'supplier' }, { email_id: 'e2', classification: 'supplier' }, { email_id: 'e3', classification: 'customer' }],
  })
  const b = await classifySupplierSender(db, 'faktura@polluted-supplier.dk', { noCache: true })
  ok(b.isSupplier && b.reasons.includes('sender_history_supplier'), 'B: afsender der findes som (forurenet) kunde, men har leverandør-historik → leverandør (værnet vinder)', JSON.stringify(b))
  ok((await classifySupplierSender(db, 'salg@lemvigh-muller.dk', { noCache: true })).reasons.includes('supplier_website_domain') , 'B-felt: suppliers.website indlæses fra DB')
  ok(!(await classifySupplierSender(db, 'kunde@gmail.com', { noCache: true })).isSupplier, 'E: kendt kunde (kunde-historik) → ikke leverandør')
  const broken = { from: () => { throw new Error('db nede') } }
  ok((await classifySupplierSender(broken, 'ordre@ao.dk', { noCache: true })).isSupplier && !(await classifySupplierSender(broken, 'x@ukendt.dk', { noCache: true })).isSupplier, 'læsefejl kaster ikke: statisk grossist-regel gælder, ellers "ingen evidens" (som i dag)')

  // ── Stage A-indtag med falsk kapabilitet ──
  const NOW = Date.parse('2026-11-25T12:00:00Z')
  const ON = { RECEPTION_EMAIL_INGEST_ENABLED: 'true', RECEPTION_EMAIL_INGEST_SINCE: '2026-11-20T09:00:00Z' }
  const POLLUTED = '11111111-1111-1111-1111-111111111111'
  const mkCap = (row: Record<string, unknown>, supplier: boolean) => {
    const calls: Array<Record<string, unknown>> = []
    const custRow = { id: POLLUTED, customer_number: 'K1', email: String(row.sender_email), phone: null, mobile: null }
    const chain = (t: string) => { const q: Record<string, unknown> = { select: () => q, eq: () => q, not: () => q, order: () => q, or: () => q, ilike: () => q,
      maybeSingle: async () => ({ data: null, error: null }), limit: async () => ({ data: t === 'customers' ? [custRow] : [], error: null }), range: async () => ({ data: [], error: null }) }; return q }
    return { calls, cap: {
      readPort: { from: (t: string) => chain(t) },
      ingest: async (p: Record<string, unknown>) => { calls.push(p); return { outcome: 'created', conversationId: 'c1', itemId: 'i1', actions: [] } },
      readSource: async () => ({ ok: true, row }),
      readSourceBody: async () => ({ ok: true, row: { body_text: '', body_html: '' } }),
      supplierSender: async () => ({ isSupplier: supplier, reasons: supplier ? ['sender_history_supplier'] : [] }),
    } as never }
  }
  const mail = (o: Record<string, unknown> = {}) => ({ id: 'm1', subject: 'Levering til kunde Jensen, Vejen 1, 6000 Kolding, tlf 20304050', sender_email: 'faktura@polluted-supplier.dk', sender_name: 'Leverandør', body_preview: 'Varerne til Jensen leveres torsdag',
    received_at: new Date(NOW - 3600_000).toISOString(), created_at: new Date(NOW - 3600_000).toISOString(), customer_id: null, linked_by: null, link_status: 'unidentified', conversation_id: 'T1', attachment_urls: [], ...o })
  const sup = mkCap(mail(), true)
  await ingestEmailSource('m1', { env: ON, capability: sup.cap, now: () => NOW })
  const ps = sup.calls[0] ?? {}
  ok(sup.calls.length === 1, 'I: leverandørmail indtages stadig (intern henvendelse bevares)')
  ok(ps.customer_candidate_id === null && ps.customer_match_state === 'no_match' && !('confirmed_customer_id' in ps), 'B/I: forurenet kunderække med samme e-mail → INGEN kundekandidat, no_match, ingen bekræftet kunde', JSON.stringify({ c: ps.customer_candidate_id, s: ps.customer_match_state }))
  ok((ps.handoff_reasons as string[] | undefined)?.includes('supplier_sender') === true, "I: intern årsag 'supplier_sender' på henvendelsen")
  ok(!('confirmed_case_id' in ps) && (ps.case_candidate_id ?? null) === null, 'I: ingen tilknyttet sag og ingen sags-kandidat (ingen kunde at slå op på)')
  ok(((ps.actions as Array<{ execute: boolean }> | undefined) ?? []).every((a) => a.execute === false), 'I: alle handlinger er forslag (execute=false) — intet udføres/sendes')
  const cust = mkCap(mail({ sender_email: 'jensen@example.dk', subject: 'Mit batteri er offline' }), false)
  await ingestEmailSource('m1', { env: ON, capability: cust.cap, now: () => NOW })
  const pc = cust.calls[0] ?? {}
  ok(pc.customer_candidate_id === POLLUTED && pc.customer_match_state === 'unique_match' && !(pc.handoff_reasons as string[]).includes('supplier_sender'), 'E: normal kendt kunde (e-mail-match) → kundekandidat som før', JSON.stringify({ c: pc.customer_candidate_id, s: pc.customer_match_state }))
  const manual = mkCap(mail({ customer_id: POLLUTED, linked_by: 'manual', link_status: 'linked' }), true)
  await ingestEmailSource('m1', { env: ON, capability: manual.cap, now: () => NOW })
  const pm = manual.calls[0] ?? {}
  ok(pm.confirmed_customer_id === POLLUTED && !((pm.handoff_reasons as string[] | undefined) ?? []).includes('supplier_sender'), 'F: manuel kobling → bekræftet kunde, også for en leverandør-afsender (et menneske har afgjort det)')
  const legacy = mkCap(mail({ sender_email: 'kunde2@example.dk', subject: 'Hej' }), false)
  const oldCap = { ...(legacy.cap as Record<string, unknown>) }; delete oldCap.supplierSender
  await ingestEmailSource('m1', { env: ON, capability: oldCap as never, now: () => NOW })
  ok(legacy.calls.length === 1, 'kapabilitet uden supplierSender (ældre testdobbelt) → indtag virker som før')

  // ── Statisk: alle fire indgange bruger værnet før kundematchning ──
  const intel = readFileSync('src/lib/services/email-intelligence.ts', 'utf8')
  const iStage3 = intel.indexOf('// -------- Stage 3: decide (match or create) --------')
  const iGuard = intel.indexOf("if (type === 'supplier') {", iStage3)
  const iFind = intel.indexOf('await findOrCreateCustomer(', iStage3)
  ok(iGuard > iStage3 && iGuard < iFind && /return \{ type, customerId: null, created: false, skipped: true \}/.test(intel.slice(iGuard, iFind)), 'D: mail-analysen returnerer FØR findOrCreateCustomer for leverandørmails (ingen oprettelse, intet match, ingen auto-ai-kobling)')
  ok(/if \(type === 'customer' && supplierGuard\?\.isSupplier\)/.test(intel), 'deterministisk leverandør-evidens overstyrer AI\'ens "customer"')
  const linker = readFileSync('src/lib/services/email-linker.ts', 'utf8')
  const fnL = linker.slice(linker.indexOf('export async function linkEmail('))
  ok(fnL.indexOf('classifySupplierSender(') > 0 && fnL.indexOf('classifySupplierSender(') < fnL.indexOf('matchCustomer(extracted.email'), 'linker: værnet køres FØR eksakt/kontakt/domæne-matchning')
  ok(/if \(supplierGuard\.isSupplier\) threadCustomerId = null/.test(fnL) && /threadServiceCaseId && !supplierGuard\.isSupplier/.test(fnL), 'linker: heller ingen tråd-kobling eller tråd-sag for leverandør-afsendere')
  ok(/!supplierGuard\.isSupplier && classifyNoise\(/.test(fnL), 'linker: leverandørmail markeres ikke som støj (forbliver unidentified → indtages)')
  const auto = readFileSync('src/lib/services/email-autolink.ts', 'utf8')
  const fnG = auto.slice(auto.indexOf('export async function gatherAutoLinkSignals('))
  ok(fnG.indexOf('classifySupplierSender(') > 0 && fnG.indexOf('classifySupplierSender(') < fnG.indexOf("from('customers')"), 'autolink: leverandør-veto før alle kundesignaler (link- og suggest-tilstand)')
  ok(/supplierSenderIdentity\(\)/.test(readFileSync('src/lib/reception/background-actor.ts', 'utf8')) && /export function supplierSenderIdentity/.test(readFileSync('src/lib/reception/identity-match.ts', 'utf8')), 'Stage A: identitet = no_match for leverandør-afsendere (identity-match)')
  const portalFiles = ['src/lib/actions/portal.ts', 'src/lib/actions/partner-portal.ts', 'src/app/api/portal/offers/pdf/route.ts', 'src/app/api/portal/invoices/pdf/route.ts', 'src/app/api/partner/documents/route.ts']
  const reads = portalFiles.filter((f) => /from\('(incoming_emails|conversations|conversation_items|conversation_actions|email_intelligence_logs|suppliers)'\)/.test(readFileSync(f, 'utf8')))
  ok(reads.length === 0, 'kunde-/partnerportal læser aldrig incoming_emails, henvendelser, mail-klassifikation eller suppliers', reads.join(','))

  if (fails) { console.log(`\n❌ ${fails} fejl`); process.exit(1) }
  console.log('\n✅ supplier-guard-test: alle bestået')
}
main()
