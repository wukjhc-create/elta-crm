/**
 * Unit-test af mail.link_customer-handleren med MOCKET admin-klient (ingen DB/prod).
 *   npx tsx scripts/agent-linkcustomer-test.ts
 *
 * Verificerer: ingen auto-link ved conflicts/0/flere kandidater; link kun ved
 * praecis én kandidat, med korrekte felter (customer_id, link_status, linked_by).
 */
import { getCapability } from '../src/lib/agents/capability-registry'

let fails = 0
const assert = (cond: boolean, label: string, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) fails++ }

// Mock admin: registrerer om update blev kaldt + med hvilke vaerdier.
function makeMockAdmin() {
  const calls: Array<{ table: string; vals: Record<string, unknown>; id: string }> = []
  const admin = {
    from(table: string) {
      return {
        update(vals: Record<string, unknown>) {
          return {
            eq(_col: string, id: string) {
              calls.push({ table, vals, id })
              return { error: null }
            },
          }
        },
      }
    },
  }
  return { admin, calls }
}

async function run() {
  const cap = getCapability('mail.link_customer')
  assert(!!cap && !!cap.handler, 'mail.link_customer har en handler')
  if (!cap?.handler) { console.log('❌ ingen handler'); process.exit(1) }

  const base = { run: {} as never }

  // 1) conflicts => refuser, ingen update
  {
    const { admin, calls } = makeMockAdmin()
    const r = await cap.handler({ ...base, admin, action: { payload: { email_id: 'e1', conflicts: true, candidates: [{ id: 'c1' }] } } } as never)
    assert(!r.ok && calls.length === 0, 'conflicts => refuser uden update')
  }
  // 2) 0 kandidater => refuser
  {
    const { admin, calls } = makeMockAdmin()
    const r = await cap.handler({ ...base, admin, action: { payload: { email_id: 'e1', candidates: [] } } } as never)
    assert(!r.ok && calls.length === 0, 'ingen kandidat => refuser uden update')
  }
  // 3) flere kandidater => refuser
  {
    const { admin, calls } = makeMockAdmin()
    const r = await cap.handler({ ...base, admin, action: { payload: { email_id: 'e1', candidates: [{ id: 'c1' }, { id: 'c2' }] } } } as never)
    assert(!r.ok && calls.length === 0, 'flere kandidater => refuser uden update')
  }
  // 4) manglende email_id => refuser
  {
    const { admin, calls } = makeMockAdmin()
    const r = await cap.handler({ ...base, admin, action: { payload: { candidates: [{ id: 'c1' }] } } } as never)
    assert(!r.ok && calls.length === 0, 'manglende email_id => refuser')
  }
  // 5) præcis én kandidat, ingen conflicts => link med korrekte felter
  {
    const { admin, calls } = makeMockAdmin()
    const r = await cap.handler({ ...base, admin, action: { payload: { email_id: 'e9', conflicts: false, candidates: [{ id: 'cust-9' }] } } } as never)
    const ok = r.ok && calls.length === 1 &&
      calls[0].table === 'incoming_emails' &&
      calls[0].id === 'e9' &&
      calls[0].vals.customer_id === 'cust-9' &&
      calls[0].vals.link_status === 'linked' &&
      calls[0].vals.linked_by === 'agent'
    assert(ok, 'én kandidat => link med customer_id/link_status/linked_by', JSON.stringify(calls[0]?.vals))
  }

  console.log(`\n${fails === 0 ? '✅ ALLE LINK_CUSTOMER-TESTS PASS' : `❌ ${fails} FEJL`}`)
  process.exit(fails === 0 ? 0 : 1)
}
run()
