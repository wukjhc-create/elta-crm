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

// Mock admin: modellerer incoming_emails med nuvaerende customer_id, saa den BETINGEDE update (.is('customer_id',
// null)) opfoerer sig som i Postgres: raekken opdateres kun hvis den stadig er ukoblet. `calls` = gennemfoerte updates.
function makeMockAdmin(current: Record<string, string | null> = {}) {
  const calls: Array<{ table: string; vals: Record<string, unknown>; id: string }> = []
  const rows = { ...current }
  const admin = {
    from(table: string) {
      return {
        update(vals: Record<string, unknown>) {
          let id = ''
          const chain = {
            eq(_col: string, v: string) { id = v; return chain },
            is(_col: string, _v: null) { return chain },
            select() {
              const existing = id in rows ? rows[id] : null
              if (existing !== null && existing !== undefined) return { data: [], error: null }
              rows[id] = vals.customer_id as string
              calls.push({ table, vals, id })
              return { data: [{ id }], error: null }
            },
          }
          return chain
        },
        select() {
          let id = ''
          const chain = {
            eq(_col: string, v: string) { id = v; return chain },
            maybeSingle() { return { data: { customer_id: rows[id] ?? null }, error: null } },
          }
          return chain
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

  // 6) flere kandidater + gyldigt valg => link til det valgte
  {
    const { admin, calls } = makeMockAdmin()
    const r = await cap.handler({ ...base, admin, action: { payload: { email_id: 'e9', conflicts: true, candidates: [{ id: 'a' }, { id: 'b' }], selected_customer_id: 'b' } } } as never)
    assert(r.ok && calls.length === 1 && calls[0].vals.customer_id === 'b', 'flere kandidater + gyldigt valg => link til valgt (b)')
  }
  // 7) flere kandidater + manipuleret valg (ikke i listen) => refuser
  {
    const { admin, calls } = makeMockAdmin()
    const r = await cap.handler({ ...base, admin, action: { payload: { email_id: 'e9', conflicts: true, candidates: [{ id: 'a' }, { id: 'b' }], selected_customer_id: 'zzz' } } } as never)
    assert(!r.ok && calls.length === 0, 'manipuleret valg (ikke i kandidater) => refuser uden update')
  }

  // 8) STALE: mailen er koblet til en ANDEN kunde imens => ingen overskrivning (P2 #12)
  {
    const { admin, calls } = makeMockAdmin({ e9: 'human-choice' })
    const r = await cap.handler({ ...base, admin, action: { payload: { email_id: 'e9', candidates: [{ id: 'cust-9' }] } } } as never)
    assert(!r.ok && calls.length === 0 && /allerede koblet/.test(r.error ?? ''), 'stale: allerede koblet til anden kunde => refuser uden overskrivning', r.error)
  }
  // 9) Allerede koblet til SAMME kunde => idempotent ok, ingen ny update
  {
    const { admin, calls } = makeMockAdmin({ e9: 'cust-9' })
    const r = await cap.handler({ ...base, admin, action: { payload: { email_id: 'e9', candidates: [{ id: 'cust-9' }] } } } as never)
    assert(r.ok && calls.length === 0 && r.data?.already_linked === true, 'allerede koblet til samme kunde => ok (idempotent) uden update')
  }

  console.log(`\n${fails === 0 ? '✅ ALLE LINK_CUSTOMER-TESTS PASS' : `❌ ${fails} FEJL`}`)
  process.exit(fails === 0 ? 0 : 1)
}
run()
