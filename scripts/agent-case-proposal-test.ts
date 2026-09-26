/**
 * Unit-test af case.propose_from_email (Fase 4) med MOCKET admin-klient (ingen DB/prod).
 *   npx tsx scripts/agent-case-proposal-test.ts
 *
 * Verificerer: forslag kun for kundekoblet mail uden sag; handler afviser manglende payload,
 * ukendt mail og aendret kundekobling uden at skrive; eksisterende sag => ingen ny insert;
 * ny sag => praecis én insert som forslag (is_proposal, source_email_id, kunde, status new).
 */
import { getCapability } from '../src/lib/agents/capability-registry'
import { buildCaseProposal } from '../src/lib/agents/case-proposal'

let fails = 0
const assert = (cond: boolean, label: string, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) fails++ }

interface Mail { id: string; subject: string | null; body_text: string | null; body_preview: string | null; customer_id: string | null }

/** Kaedbar mock af de supabase-kald handleren og createCaseFromEmail bruger. */
function makeMockAdmin(mails: Mail[], cases: Array<{ id: string; source_email_id: string }>) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = []
  const admin = {
    from(table: string) {
      const filters: Record<string, unknown> = {}
      const rows = (): Record<string, unknown>[] =>
        table === 'incoming_emails' ? (mails as unknown as Record<string, unknown>[])
          : table === 'service_cases' ? cases
            : table === 'profiles' ? [{ id: 'admin-1', role: 'admin' }] : []
      const match = () => rows().filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v))
      const q = {
        select() { return q },
        eq(col: string, val: unknown) { filters[col] = val; return q },
        limit() { return q },
        async maybeSingle() { return { data: match()[0] ?? null, error: null } },
        insert(row: Record<string, unknown>) {
          inserts.push({ table, row })
          return { select() { return { async single() { return { data: { id: 'case-new' }, error: null } } } } }
        },
      }
      return q
    },
  }
  return { admin, inserts }
}

async function run() {
  // --- buildCaseProposal (ren) ---
  const linked: Mail = { id: 'e1', subject: 'Akut fejl i eltavle', body_text: 'Relæet slår fra, haster', body_preview: null, customer_id: 'c1' }
  assert(buildCaseProposal({ ...linked, customer_id: null }, false) === null, 'forslag: ukoblet mail => intet sagsforslag')
  assert(buildCaseProposal(linked, true) === null, 'forslag: sag findes allerede => intet sagsforslag')
  const p = buildCaseProposal(linked, false)
  assert(!!p && p.customer_id === 'c1' && p.email_id === 'e1' && p.proposed_title === 'Akut fejl i eltavle', 'forslag: korrekt kunde/mail/titel')
  assert(p?.intent === 'service' && p?.priority === 'urgent', 'forslag: intent/prioritet fra eksisterende detektor', `${p?.intent}/${p?.priority}`)

  const cap = getCapability('case.propose_from_email')
  assert(!!cap?.handler && cap.sideEffectClass === 'create' && cap.defaultRequiresApproval, 'capability: create, approval kraevet, handler wired')
  if (!cap?.handler) { console.log('❌ ingen handler'); process.exit(1) }
  const exec = (admin: unknown, payload: Record<string, unknown>) => cap.handler!({ run: {} as never, admin, action: { payload } } as never)

  // --- handler: afvisninger uden skrivning ---
  {
    const { admin, inserts } = makeMockAdmin([linked], [])
    const r = await exec(admin, { email_id: 'e1' })
    assert(!r.ok && inserts.length === 0, 'handler: manglende customer_id => afvist, ingen insert')
  }
  {
    const { admin, inserts } = makeMockAdmin([], [])
    const r = await exec(admin, { email_id: 'e1', customer_id: 'c1' })
    assert(!r.ok && inserts.length === 0, 'handler: ukendt mail => afvist, ingen insert')
  }
  {
    const { admin, inserts } = makeMockAdmin([{ ...linked, customer_id: 'c2' }], [])
    const r = await exec(admin, { email_id: 'e1', customer_id: 'c1' })
    assert(!r.ok && inserts.length === 0 && /kundekobling/.test(r.error ?? ''), 'handler: aendret kundekobling (tamper/stale) => afvist, ingen insert')
  }
  {
    const { admin, inserts } = makeMockAdmin([{ ...linked, customer_id: null }], [])
    const r = await exec(admin, { email_id: 'e1', customer_id: 'c1' })
    assert(!r.ok && inserts.length === 0, 'handler: mail ikke laengere koblet => afvist, ingen insert')
  }
  // --- idempotens ---
  {
    const { admin, inserts } = makeMockAdmin([linked], [{ id: 'case-old', source_email_id: 'e1' }])
    const r = await exec(admin, { email_id: 'e1', customer_id: 'c1' })
    assert(r.ok && r.data?.case_id === 'case-old' && r.data?.created === false && inserts.length === 0, 'handler: sag findes => genbrug, ingen ny insert')
  }
  // --- oprettelse ---
  {
    const { admin, inserts } = makeMockAdmin([linked], [])
    const r = await exec(admin, { email_id: 'e1', customer_id: 'c1', intent: 'service', priority: 'urgent' })
    const row = inserts[0]?.row ?? {}
    assert(r.ok && r.data?.case_id === 'case-new' && r.data?.created === true, 'handler: ny sag oprettet')
    assert(inserts.length === 1 && inserts[0].table === 'service_cases', 'handler: praecis én insert i service_cases')
    assert(row.is_proposal === true && row.source_email_id === 'e1' && row.customer_id === 'c1' && row.status === 'new' && row.source === 'email',
      'handler: oprettet som forslag (is_proposal, source_email_id, kunde, status new, source email)')
    assert(row.priority === 'urgent', 'handler: prioritet fra forslaget bevares')
  }

  console.log(fails ? `\n❌ ${fails} FEJL` : '\n✅ ALLE CASE-PROPOSAL-TESTS PASS')
  process.exit(fails ? 1 : 0)
}
run().catch((e) => { console.error(e); process.exit(1) })
