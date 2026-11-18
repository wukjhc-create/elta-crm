/**
 * Portal-sikkerhed mod STAGING med den RIGTIGE portalkode (src/lib/actions/portal.ts m.fl.) — portal-sikkerhedsreview
 * 2026-11-18. Kunde A og B (syntetiske ps252-*), tokens, tilbud med kost-/margin-/note-sentineller, opgaver (kundevendt,
 * intern med "Besigtigelse hos"-titel, assistent-aftale, B's), dokumenter, beskeder, sager. Alt slettes igen.
 *
 * Kun kald UDEN udgående effekt: læsninger + angreb der afvises FØR sideeffekter (fremmed accept/afvis/bekræft/ombook,
 * fremmed tilbud på besked, fremmed fil-sti). Egen accept testes i UI (U10/U256), egen visning via HTTP i U269.
 *   npx tsx scripts/test-harness/cli.ts portal-security-staging
 */
import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

type Check = { id: string; ok: boolean; note?: string }

export async function runPortalSecurityStaging(admin: SupabaseClient, runtime: { url: string; serviceKey: string }, log: (m: string) => void): Promise<number> {
  // Portalkoden læser service_role fra process.env — bundet til STAGING (cli'ens env-guard har allerede afvist prod)
  process.env.NEXT_PUBLIC_SUPABASE_URL = runtime.url
  process.env.SUPABASE_SERVICE_ROLE_KEY = runtime.serviceKey
  const portal = await import('../../src/lib/actions/portal')
  const { getPortalServiceCases } = await import('../../src/lib/actions/service-cases')
  const { getPortalFuldmagter } = await import('../../src/lib/actions/fuldmagt')
  const { findForbiddenPortalKeys } = await import('../../src/lib/portal/projections')

  const checks: Check[] = []
  const add = (id: string, ok: boolean, note = '') => checks.push({ id, ok, note })
  const tag = `ps252-${Date.now()}`
  const SENT_COST = 4711.13
  const SENT_NOTE = `${tag}-INTERN-NOTE`
  const SENT_TASK = `${tag}-INTERN-OPGAVE`
  const SENT_OFFER_NOTE = `${tag}-TILBUD-INTERN`
  const hex = () => randomBytes(32).toString('hex')
  const created = { customers: [] as string[], offers: [] as string[], tokens: [] as string[], tasks: [] as string[], docs: [] as string[], msgs: [] as string[], cases: [] as string[] }
  const leakText = (v: unknown) => {
    const s = JSON.stringify(v ?? null)
    return [String(SENT_COST), '4711,13', SENT_NOTE, SENT_TASK, SENT_OFFER_NOTE, 'margin_percentage', 'cost_price'].filter((x) => s.includes(x))
  }
  const safe = (label: string, v: unknown) => {
    const keys = findForbiddenPortalKeys(v)
    const txt = leakText(v)
    add(`${label}: ingen interne felter/sentineller i svaret`, keys.length === 0 && txt.length === 0, [...keys.slice(0, 5), ...txt].join(','))
  }

  try {
    const adminProfile = (await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1).maybeSingle()).data as { id: string } | null
    if (!adminProfile) { log('ingen aktiv admin-profil på staging'); return 2 }
    const mkCustomer = async (k: string) => {
      const r = await admin.from('customers').insert({ company_name: `${tag} ${k}`, contact_person: `PS252 ${k}`, customer_number: `${tag}-${k}`.slice(0, 40), email: `${tag}-${k.toLowerCase()}@ps252-test.dk`, created_by: adminProfile.id }).select('id').single()
      if (r.error) throw new Error(`kunde ${k}: ${r.error.message}`)
      created.customers.push(r.data.id); return r.data.id as string
    }
    const A = await mkCustomer('A'); const B = await mkCustomer('B')
    const mkToken = async (cust: string, over: Record<string, unknown> = {}) => {
      const tok = hex()
      const r = await admin.from('portal_access_tokens').insert({ customer_id: cust, token: tok, email: `${tag}@ps252-test.dk`, created_by: adminProfile.id, is_active: true, expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(), ...over }).select('id').single()
      if (r.error) throw new Error(`token: ${r.error.message}`)
      created.tokens.push(r.data.id); return tok
    }
    const tokA = await mkToken(A); const tokB = await mkToken(B)
    const tokExpired = await mkToken(A, { expires_at: new Date(Date.now() - 86400_000).toISOString() })
    const tokInactive = await mkToken(A, { is_active: false })
    const mkOffer = async (cust: string, k: string, status: string) => {
      const now = new Date().toISOString()
      const r = await admin.from('offers').insert({ offer_number: `${tag}-${k}`.slice(0, 40), title: `${tag} tilbud ${k}`, customer_id: cust, created_by: adminProfile.id, status,
        sent_at: status === 'draft' ? null : now, viewed_at: status === 'viewed' ? now : null, total_amount: 1000, tax_percentage: 25, tax_amount: 250, final_amount: 1250,
        valid_until: new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10), notes: SENT_OFFER_NOTE }).select('id').single()
      if (r.error) throw new Error(`tilbud ${k}: ${r.error.message}`)
      created.offers.push(r.data.id)
      const li = await admin.from('offer_line_items').insert([
        { offer_id: r.data.id, position: 1, line_type: 'manual', description: `Ladestander ${k}`, quantity: 2, unit: 'stk', unit_price: 500, discount_percentage: 0, total: 1000,
          cost_price: SENT_COST, supplier_cost_price_at_creation: SENT_COST, margin_percentage: 37, notes: SENT_NOTE },
      ])
      if (li.error) throw new Error(`linjer ${k}: ${li.error.message}`)
      return r.data.id as string
    }
    const oA = await mkOffer(A, 'A', 'viewed'); const oB = await mkOffer(B, 'B', 'viewed'); const oAdraft = await mkOffer(A, 'AD', 'draft')
    const due = new Date(Date.now() + 5 * 86400_000).toISOString()
    const mkTask = async (cust: string, title: string, over: Record<string, unknown> = {}) => {
      const r = await admin.from('customer_tasks').insert({ customer_id: cust, title, description: `Besigtigelse planlagt d. 1. januar kl. 10:00\n${SENT_TASK}`, status: 'pending', priority: 'normal', due_date: due, ...over }).select('id').single()
      if (r.error) throw new Error(`opgave ${title}: ${r.error.message}`)
      created.tasks.push(r.data.id); return r.data.id as string
    }
    const tVis = await mkTask(A, `Besigtigelse hos ${tag} A`, { customer_visible: true })
    const tTitleOnly = await mkTask(A, `Besigtigelse hos ${tag} A (intern)`)
    const tInternal = await mkTask(A, `Ring til leverandør ${tag}`)
    const tAssist = await mkTask(A, `Besigtigelse hos ${tag} A (assistent)`, { auto_rule: 'assistant_appointment' })
    const tReq = await mkTask(A, `PORTAL: Besigtigelse anmodet — ${tag}`, { customer_visible: true, description: `PORTAL-BOOKING\nTidspunkt: 08-10\n${SENT_TASK}` })
    const tB = await mkTask(B, `Besigtigelse hos ${tag} B`, { customer_visible: true })
    const mkDoc = async (cust: string, k: string, over: Record<string, unknown> = {}) => {
      const r = await admin.from('customer_documents').insert({ customer_id: cust, title: `${tag} dok ${k}`, file_url: '', file_name: `${k}.pdf`, storage_path: `customer-documents/${cust}/${tag}-${k}.pdf`, document_type: 'other', visible_in_portal: true, mime_type: 'application/pdf', ...over }).select('id').single()
      if (r.error) throw new Error(`dok ${k}: ${r.error.message}`)
      created.docs.push(r.data.id); return r.data.id as string
    }
    const dA = await mkDoc(A, 'A'); const dAhidden = await mkDoc(A, 'AHID', { visible_in_portal: false }); const dB = await mkDoc(B, 'B')
    const mkMsg = async (cust: string, k: string) => {
      const r = await admin.from('portal_messages').insert({ customer_id: cust, sender_type: 'customer', sender_name: `PS252 ${k}`, message: `${tag} besked ${k}` }).select('id').single()
      if (r.error) throw new Error(`besked ${k}: ${r.error.message}`)
      created.msgs.push(r.data.id); return r.data.id as string
    }
    const mA = await mkMsg(A, 'A'); const mB = await mkMsg(B, 'B')
    const mkCase = async (cust: string, k: string) => {
      const r = await admin.from('service_cases').insert({ customer_id: cust, title: `${tag} sag ${k}`, status: 'new', status_note: SENT_NOTE }).select('id').single()
      if (r.error) throw new Error(`sag ${k}: ${r.error.message}`)
      created.cases.push(r.data.id); return r.data.id as string
    }
    const cA = await mkCase(A, 'A'); const cB = await mkCase(B, 'B')

    // ── Tilbud ──
    const offs = await portal.getPortalOffers(tokA)
    const ids = (offs.data ?? []).map((o) => o.id)
    add('A: egne sendte/sete tilbud vises (A)', offs.success && ids.includes(oA), offs.error ?? '')
    add('A: B\'s tilbud vises ikke; A\'s kladde vises ikke', !ids.includes(oB) && !ids.includes(oAdraft))
    const oneA = (offs.data ?? []).find((o) => o.id === oA)
    add('A: tilbuddet har kundens salgspris (stk-pris 500, linjetotal 1000, i alt 1250 inkl. moms)', !!oneA && oneA.final_amount === 1250 && oneA.line_items?.[0]?.unit_price === 500 && oneA.line_items?.[0]?.total === 1000 && oneA.line_items?.[0]?.quantity === 2)
    safe('getPortalOffers', offs)
    const det = await portal.getPortalOffer(tokA, oA)
    add('A: åbner eget tilbud direkte', det.success && det.data?.id === oA, det.error ?? '')
    safe('getPortalOffer (eget)', det)
    const detB = await portal.getPortalOffer(tokA, oB)
    add('A: direkte id-angreb på B\'s tilbud afvises', !detB.success && !detB.data, detB.error ?? '')
    const detDraft = await portal.getPortalOffer(tokA, oAdraft)
    add('A: egen kladde (ikke sendt) kan ikke åbnes via id', !detDraft.success)
    const sig = `data:image/png;base64,${'A'.repeat(300)}`
    const accB = await portal.acceptOffer(tokA, { offer_id: oB, signer_name: 'Angriber', signer_email: 'x@ps252-test.dk', signature_data: sig } as never)
    const rejB = await portal.rejectOffer(tokA, { offer_id: oB, reason: 'price' } as never)
    const oBnow = (await admin.from('offers').select('status, accepted_at, rejected_at').eq('id', oB).single()).data as { status: string; accepted_at: string | null; rejected_at: string | null }
    add('A: accept af B\'s tilbud afvises; B\'s tilbud uændret', !accB.success && oBnow.status === 'viewed' && !oBnow.accepted_at, accB.error ?? '')
    add('A: afvisning af B\'s tilbud afvises; B\'s tilbud uændret', !rejB.success && oBnow.status === 'viewed' && !oBnow.rejected_at, rejB.error ?? '')
    const sigCount = (await admin.from('offer_signatures').select('id', { count: 'exact', head: true }).eq('offer_id', oB)).count ?? 0
    add('A: ingen underskrift oprettet på B\'s tilbud', sigCount === 0, String(sigCount))

    // ── Opgaver / besigtigelser ──
    const bes = await portal.getPortalBesigtigelser(tokA)
    const bIds = (bes.data ?? []).map((b) => b.id)
    add('A: kundevendt booket besigtigelse vises', bes.success && bIds.includes(tVis), bes.error ?? '')
    add('A: kundens egen portal-anmodning (kundevendt) vises', bIds.includes(tReq))
    add('A: intern opgave med titlen "Besigtigelse hos …" UDEN kundesynlighed vises IKKE (titel-udledning lukket)', !bIds.includes(tTitleOnly))
    add('A: almindelig intern opgave vises ikke', !bIds.includes(tInternal))
    add('A: assistent-aftale vises ikke', !bIds.includes(tAssist))
    add('A: B\'s opgave vises ikke', !bIds.includes(tB))
    add('A: præcis 2 opgaver i portalen', bIds.length === 2, String(bIds.length))
    const shown = (bes.data ?? []).find((b) => b.id === tVis)
    add('A: opgaven vises med fast titel og kun tidspunkt-linjen', shown?.title === 'Besigtigelse' && shown?.description === 'Tidspunkt: 10:00', JSON.stringify({ t: shown?.title, d: shown?.description }))
    add('A: opgave-svaret har kun projektionens felter (id, title, description, due_date, status, created_at)', (bes.data ?? []).every((b) => Object.keys(b).sort().join(',') === 'created_at,description,due_date,id,status,title'), Object.keys((bes.data ?? [])[0] ?? {}).join(','))
    safe('getPortalBesigtigelser', bes)
    for (const [label, id] of [['intern "Besigtigelse hos"-opgave', tTitleOnly], ['almindelig intern opgave', tInternal], ['assistent-aftale', tAssist], ['B\'s opgave', tB], ['kundens egen anmodning (kan ikke bekræftes)', tReq]] as const) {
      const r = await portal.portalConfirmBesigtigelse(tokA, id)
      const st = (await admin.from('customer_tasks').select('status').eq('id', id).single()).data as { status: string }
      add(`A: bekræft ${label} via id afvises; status uændret`, !r.success && st.status === 'pending', r.error ?? '')
      const rr = await portal.portalRequestReschedule(tokA, id, 'Passer bedre i næste uge')
      add(`A: ombook ${label} via id afvises`, !rr.success, rr.error ?? '')
    }

    // ── Dokumenter ──
    const docs = await portal.getPortalDocuments(tokA)
    const dIds = (docs.data ?? []).map((d) => d.id)
    add('A: eget delt dokument vises', docs.success && dIds.includes(dA), docs.error ?? '')
    add('A: ikke-delt (internt) dokument vises ikke', !dIds.includes(dAhidden))
    add('A: B\'s dokument vises ikke', !dIds.includes(dB))
    safe('getPortalDocuments', docs)
    const urlB = await portal.getAttachmentUrl(tokA, `${B}/fil.pdf`)
    const urlTrav = await portal.getAttachmentUrl(tokA, `${A}/../${B}/fil.pdf`)
    add('A: signeret URL til B\'s fil afvises (inkl. sti-traversal)', !urlB.success && !urlTrav.success)

    // ── Beskeder ──
    const msgs = await portal.getPortalMessages(tokA)
    const mIds = (msgs.data ?? []).map((m) => m.id)
    add('A: egne beskeder vises; B\'s gør ikke', msgs.success && mIds.includes(mA) && !mIds.includes(mB), msgs.error ?? '')
    const before = (await admin.from('portal_messages').select('id', { count: 'exact', head: true }).eq('customer_id', A)).count ?? 0
    const sendB = await portal.sendPortalMessage(tokA, { message: `${tag} angreb`, offer_id: oB } as never)
    const after = (await admin.from('portal_messages').select('id', { count: 'exact', head: true }).eq('customer_id', A)).count ?? 0
    add('A: besked knyttet til B\'s tilbud afvises (intet gemt)', !sendB.success && before === after, sendB.error ?? '')
    safe('getPortalMessages', msgs)

    // ── Sager, fakturaer, fuldmagter ──
    const cases = await getPortalServiceCases(tokA)
    const cIds = ((cases.data ?? []) as Array<{ id: string }>).map((c) => c.id)
    add('A: egen sag vises; B\'s gør ikke', cases.success && cIds.includes(cA) && !cIds.includes(cB), cases.error ?? '')
    safe('getPortalServiceCases', cases)
    const inv = await portal.getPortalInvoices(tokA)
    add('A: fakturaliste afgrænset og kost-fri', inv.success)
    safe('getPortalInvoices', inv)
    const fm = await getPortalFuldmagter(tokA)
    add('A: fuldmagter afgrænset (ingen fra B)', fm.success && (fm.data ?? []).every((f) => (f as { customer_id?: string }).customer_id !== B))

    // ── Ugyldig adgang (anon / udløbet / deaktiveret) ──
    for (const [label, t] of [['ugyldigt token', 'zz'], ['tilfældigt (ukendt) token', hex()], ['udløbet token', tokExpired], ['deaktiveret token', tokInactive]] as const) {
      const r1 = await portal.getPortalOffers(t); const r2 = await portal.getPortalBesigtigelser(t); const r3 = await portal.getPortalDocuments(t)
      add(`${label}: ingen tilbud/opgaver/dokumenter`, !r1.success && !r2.success && !r3.success && !r1.data && !r2.data && !r3.data)
    }

    // ── B ser sit eget, aldrig A's ──
    const offsB = await portal.getPortalOffers(tokB)
    const besB = await portal.getPortalBesigtigelser(tokB)
    add('B: ser eget tilbud og egen opgave, aldrig A\'s', (offsB.data ?? []).some((o) => o.id === oB) && !(offsB.data ?? []).some((o) => o.id === oA)
      && (besB.data ?? []).some((b) => b.id === tB) && !(besB.data ?? []).some((b) => b.id === tVis))

    // ── Portal-PDF: fremmed tilbud → 404 ──
    try {
      const { GET } = await import('../../src/app/api/portal/offers/pdf/route')
      const { NextRequest } = await import('next/server')
      const res = await GET(new NextRequest(`http://localhost/api/portal/offers/pdf?token=${tokA}&offerId=${oB}`))
      const res2 = await GET(new NextRequest(`http://localhost/api/portal/offers/pdf?token=zz&offerId=${oA}`))
      add('PDF: A kan ikke hente B\'s tilbud (404); ugyldigt token (401)', res.status === 404 && res2.status === 401, `${res.status}/${res2.status}`)
    } catch (e) {
      add('PDF-route kunne indlæses i harness', false, String((e as Error).message).slice(0, 120))
    }
  } catch (e) {
    add('opsætning', false, String((e as Error).message).slice(0, 200))
  } finally {
    if (created.msgs.length) await admin.from('portal_messages').delete().in('id', created.msgs)
    if (created.docs.length) await admin.from('customer_documents').delete().in('id', created.docs)
    if (created.tasks.length) await admin.from('customer_tasks').delete().in('id', created.tasks)
    if (created.offers.length) { await admin.from('offer_signatures').delete().in('offer_id', created.offers); await admin.from('offer_activities').delete().in('offer_id', created.offers); await admin.from('offer_line_items').delete().in('offer_id', created.offers); await admin.from('offers').delete().in('id', created.offers) }
    if (created.cases.length) await admin.from('service_cases').delete().in('id', created.cases)
    if (created.tokens.length) await admin.from('portal_access_tokens').delete().in('id', created.tokens)
    if (created.customers.length) {
      // opgaver/beskeder som portalkoden selv kunne have oprettet (skal være 0) fjernes før kunderne
      await admin.from('customer_tasks').delete().in('customer_id', created.customers)
      await admin.from('portal_messages').delete().in('customer_id', created.customers)
      await admin.from('customers').delete().in('id', created.customers)
    }
  }
  for (const c of checks) log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.id}${!c.ok && c.note ? ` (${c.note})` : ''}`)
  const failed = checks.filter((c) => !c.ok).length
  log(failed ? `❌ ${failed} af ${checks.length}` : `✅ ${checks.length} tjek — portal-sikkerhed (staging, rigtig kode)`)
  return failed ? 2 : 0
}
