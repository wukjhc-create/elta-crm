/**
 * Unit-test af Agent Core Fase 5 (intern): offer.propose_draft_from_case + Opfoelgningsagenten.
 * MOCKET admin-klient (ingen DB/prod).   npx tsx scripts/agent-offer-followup-test.ts
 */
import { getCapability } from '../src/lib/agents/capability-registry'
import { offerProposalBlocker, buildOfferProposal, type OfferProposalCase } from '../src/lib/agents/offer-proposal'
import { followupBlocker, buildReminderDraft, buildFollowupPayload, type FollowupOffer } from '../src/lib/agents/followup-agent'
import { isHardBlocked } from '../src/types/agent-core.types'

let fails = 0
const assert = (cond: boolean, label: string, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) fails++ }

type Row = Record<string, any>
/** Generisk kaedbar supabase-mock over in-memory tabeller. Registrerer inserts. */
function makeDb(tables: Record<string, Row[]>) {
  const inserts: Array<{ table: string; row: Row }> = []
  const get = (r: Row, k: string) => (k.includes('->>') ? r[k.split('->>')[0]]?.[k.split('->>')[1]] : r[k])
  const admin = {
    from(table: string) {
      const preds: Array<(r: Row) => boolean> = []
      let lim = Infinity
      const rows = () => (tables[table] ?? []).filter((r) => preds.every((p) => p(r))).slice(0, lim)
      const q: any = {
        select() { return q },
        eq(k: string, v: unknown) { preds.push((r) => get(r, k) === v); return q },
        neq(k: string, v: unknown) { preds.push((r) => get(r, k) !== v); return q },
        in(k: string, vs: unknown[]) { preds.push((r) => vs.includes(get(r, k))); return q },
        like(k: string, pat: string) { const p = pat.replace(/%/g, ''); preds.push((r) => String(get(r, k) ?? '').startsWith(p)); return q },
        ilike(k: string, pat: string) { const p = pat.replace(/%/g, '').toLowerCase(); preds.push((r) => String(get(r, k) ?? '').toLowerCase().includes(p)); return q },
        not() { return q }, lte() { return q }, order() { return q },
        limit(n: number) { lim = n; return q },
        async maybeSingle() { return { data: rows()[0] ?? null, error: null } },
        then(res: (v: unknown) => void) { res({ data: rows(), error: null }) },
        insert(row: Row) {
          inserts.push({ table, row })
          const created = { id: `${table}-new-${inserts.length}`, ...row }
          ;(tables[table] ??= []).push(created)
          return { select() { return { async single() { return { data: created, error: null } } } } }
        },
      }
      return q
    },
  }
  return { admin, inserts }
}

const baseCase: OfferProposalCase = {
  id: 'case1', case_number: 'SVC-00042', title: 'Ny eltavle', description: 'Udskiftning af tavle', status: 'in_progress',
  customer_id: 'cust1', source_offer_id: null, is_proposal: false, orderer_customer_id: null, end_customer_id: null, payer_customer_id: 'payer1',
}
const now = new Date('2026-09-26T10:00:00Z')
const baseOffer: FollowupOffer = {
  id: 'off1', offer_number: 'TILBUD-2026-0007', title: 'Solcelleanlaeg', status: 'sent', customer_id: 'cust1', created_by: 'sales1',
  sent_at: '2026-09-10T08:00:00Z', valid_until: '2026-10-31', customer_name: 'Jensen ApS', contact_person: 'Mette Jensen',
}

async function run() {
  // ================= offer.propose_draft_from_case =================
  assert(offerProposalBlocker(baseCase) === null, 'offer: bekraeftet, aaben sag med kunde => maa foreslaas')
  assert(!!offerProposalBlocker({ ...baseCase, customer_id: null }), 'offer: sag uden kunde => blokeret')
  assert(!!offerProposalBlocker({ ...baseCase, is_proposal: true }), 'offer: sagsforslag (ikke bekraeftet) => blokeret')
  assert(!!offerProposalBlocker({ ...baseCase, status: 'closed' }) && !!offerProposalBlocker({ ...baseCase, status: 'converted' }), 'offer: lukket/konverteret sag => blokeret')
  assert(!!offerProposalBlocker({ ...baseCase, source_offer_id: 'o9' }), 'offer: sag der stammer fra tilbud => blokeret')
  assert(buildOfferProposal(baseCase)?.proposed_title === 'Tilbud - Ny eltavle', 'offer: forslagstitel')

  const offerCap = getCapability('offer.propose_draft_from_case')
  assert(!!offerCap?.handler && offerCap.sideEffectClass === 'create' && offerCap.defaultRequiresApproval && !isHardBlocked('create'),
    'offer: capability create, approval kraevet, handler wired')
  const execOffer = (admin: unknown, payload: Row, id = 'act1') => offerCap!.handler!({ run: {} as never, admin, action: { id, payload } } as never)
  const payload = { case_id: 'case1', case_number: 'SVC-00042', customer_id: 'cust1', proposed_title: 'Tilbud - Ny eltavle' }
  const tbl = (over: Partial<Record<string, Row[]>> = {}) => ({
    service_cases: [{ ...baseCase }], offers: [{ id: 'o-old', offer_number: 'TILBUD-2026-0041', notes: '' }], agent_actions: [],
    agent_action_approvals: [{ action_id: 'act1', decision: 'approved', decided_by: 'approver1' }], profiles: [{ id: 'adm', role: 'admin' }], ...over,
  } as Record<string, Row[]>)

  { const { admin, inserts } = makeDb(tbl()); const r = await execOffer(admin, { case_id: 'case1' })
    assert(!r.ok && inserts.length === 0, 'offer handler: manglende customer_id => afvist, ingen insert') }
  { const { admin, inserts } = makeDb(tbl({ service_cases: [] })); const r = await execOffer(admin, payload)
    assert(!r.ok && inserts.length === 0, 'offer handler: ukendt sag => afvist') }
  { const { admin, inserts } = makeDb(tbl({ service_cases: [{ ...baseCase, customer_id: 'other' }] })); const r = await execOffer(admin, payload)
    assert(!r.ok && inserts.length === 0 && /kunde/.test(r.error ?? ''), 'offer handler: aendret kunde (tamper/stale) => afvist') }
  { const { admin, inserts } = makeDb(tbl({ service_cases: [{ ...baseCase, status: 'closed' }] })); const r = await execOffer(admin, payload)
    assert(!r.ok && inserts.length === 0, 'offer handler: sag lukket siden forslaget (stale) => afvist') }
  { const { admin, inserts } = makeDb(tbl()); const r = await execOffer(admin, payload); const row = inserts[0]?.row ?? {}
    assert(r.ok && r.data?.created === true && inserts.length === 1 && inserts[0].table === 'offers', 'offer handler: opretter praecis ét tilbud')
    assert(row.status === 'draft' && row.is_proposal === true && row.total_amount === 0 && row.final_amount === 0, 'offer handler: tomt udkast som forslag (draft, is_proposal, 0 kr)')
    assert(row.customer_id === 'cust1' && row.payer_customer_id === 'payer1' && row.created_by === 'approver1', 'offer handler: kunde/betaler fra sagen, opretter = godkender')
    assert(row.offer_number === 'TILBUD-2026-0042' && String(row.notes).includes('[agent-action:act1]'), 'offer handler: naeste tilbudsnummer + action-markoer', String(row.offer_number))
    assert(row.converted_case_id === undefined && row.sent_at === undefined, 'offer handler: roerer ikke converted_case_id/sent_at') }
  { // gentaget kald for samme action => genbrug via markoer
    const { admin, inserts } = makeDb(tbl({ offers: [{ id: 'o-mine', offer_number: 'TILBUD-2026-0050', notes: 'x [agent-action:act1]' }] }))
    const r = await execOffer(admin, payload)
    assert(r.ok && r.data?.offer_id === 'o-mine' && r.data?.created === false && inserts.length === 0, 'offer handler: gentaget kald => genbrug, ingen ny insert') }
  { // andet udfoert forslag for samme sag => genbrug
    const { admin, inserts } = makeDb(tbl({ offers: [{ id: 'o-prev', offer_number: 'TILBUD-2026-0051', notes: '' }],
      agent_actions: [{ id: 'act0', capability: 'offer.propose_draft_from_case', status: 'executed', payload: { case_id: 'case1' }, result: { offer_id: 'o-prev' } }] }))
    const r = await execOffer(admin, payload)
    assert(r.ok && r.data?.offer_id === 'o-prev' && inserts.length === 0, 'offer handler: tidligere udfoert forslag for sagen => genbrug') }

  // ================= Opfoelgningsagent =================
  assert(followupBlocker(baseOffer, now, 7) === null, 'followup: sendt for 16 dage siden, gyldigt => opfoelgning')
  assert(!!followupBlocker({ ...baseOffer, sent_at: '2026-09-22T08:00:00Z' }, now, 7), 'followup: sendt for 4 dage siden => ikke endnu')
  assert(!!followupBlocker({ ...baseOffer, status: 'accepted' }, now, 7) && !!followupBlocker({ ...baseOffer, status: 'draft' }, now, 7), 'followup: accepteret/kladde => ingen opfoelgning')
  assert(!!followupBlocker({ ...baseOffer, valid_until: '2026-09-20' }, now, 7), 'followup: udloebet => ingen opfoelgning')
  assert(followupBlocker({ ...baseOffer, status: 'viewed' }, now, 7) === null, 'followup: set men ubesvaret => opfoelgning')
  const draft = buildReminderDraft(baseOffer)
  assert(draft.startsWith('Hej Mette,') && draft.includes('TILBUD-2026-0007') && draft.includes('10.09.2026') && draft.includes('[BRUGER UDFYLDER'),
    'followup: udkast med navn, tilbudsnr., dato og udfyldningsmarkering')
  assert(buildFollowupPayload(baseOffer, now).days_since_sent === 16, 'followup: dage siden afsendelse')

  const draftCap = getCapability('followup.draft_offer_reminder')
  const taskCap = getCapability('followup.create_task')
  assert(draftCap?.sideEffectClass === 'read' && !draftCap.defaultRequiresApproval && !!draftCap.handler, 'followup: udkast er read (materialiseres kun)')
  assert(taskCap?.sideEffectClass === 'create' && !!taskCap.defaultRequiresApproval && !!taskCap.handler, 'followup: opgave er create + approval')
  { const r = await draftCap!.handler!({ run: {} as never, admin: {}, action: { id: 'd1', payload: { draft: 'hej' } } } as never)
    assert(r.ok && r.data?.draft === 'hej' && r.data?.sent === false, 'followup: udkast materialiseres, sendes ikke') }

  const execTask = (admin: unknown, p: Row) => taskCap!.handler!({ run: {} as never, admin, action: { id: 't1', payload: p } } as never)
  const fp = { offer_id: 'off1', customer_id: 'cust1', offer_number: 'TILBUD-2026-0007' }
  const ftbl = (over: Partial<Record<string, Row[]>> = {}) => ({
    offers: [{ ...baseOffer, customers: { company_name: 'Jensen ApS', contact_person: 'Mette Jensen' } }], customer_tasks: [],
    agent_action_approvals: [{ action_id: 't1', decision: 'approved', decided_by: 'approver1' }], ...over,
  } as Record<string, Row[]>)
  { const { admin, inserts } = makeDb(ftbl({ offers: [{ ...baseOffer, status: 'accepted' }] })); const r = await execTask(admin, fp)
    assert(!r.ok && inserts.length === 0, 'followup handler: tilbud accepteret siden forslaget (stale) => afvist') }
  { const { admin, inserts } = makeDb(ftbl({ offers: [{ ...baseOffer, customer_id: 'x' }] })); const r = await execTask(admin, fp)
    assert(!r.ok && inserts.length === 0, 'followup handler: aendret kunde (tamper) => afvist') }
  { const { admin, inserts } = makeDb(ftbl({ customer_tasks: [{ id: 'task-open', offer_id: 'off1', auto_rule: 'agent_followup_offer', status: 'pending' }] }))
    const r = await execTask(admin, fp)
    assert(r.ok && r.data?.task_id === 'task-open' && r.data?.created === false && inserts.length === 0, 'followup handler: aaben opgave findes => genbrug (idempotent)') }
  { const { admin, inserts } = makeDb(ftbl()); const r = await execTask(admin, fp); const row = inserts[0]?.row ?? {}
    assert(r.ok && r.data?.created === true && inserts.length === 1 && inserts[0].table === 'customer_tasks', 'followup handler: opretter praecis én opgave')
    assert(row.offer_id === 'off1' && row.customer_id === 'cust1' && row.auto_rule === 'agent_followup_offer' && row.status === 'pending' && row.assigned_to === 'sales1' && row.created_by === 'approver1',
      'followup handler: opgave paa tilbud/kunde, tildelt saelger, oprettet af godkender') }

  console.log(fails ? `\n❌ ${fails} FEJL` : '\n✅ ALLE FASE 5-TESTS PASS')
  process.exit(fails ? 1 : 0)
}
run().catch((e) => { console.error(e); process.exit(1) })
