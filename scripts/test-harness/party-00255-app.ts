/**
 * 00255 via PostgREST (rigtige klienter, rigtige logins) — STAGING. Opretter fixtures ([PROBE]-kunde + 2 sager) og parter via
 * RPC'erne, måler pr. rolle og RYDDER OP (service_role sletter parter → relationer/deltagere kaskaderer; sager/kunde slettes).
 *   npx tsx scripts/test-harness/cli.ts party-00255-app
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginPersonas } from './role-matrix'

type Log = (s: string) => void

export async function runParty00255App(admin: SupabaseClient, runtime: { url: string; anonKey: string }, log: Log): Promise<number> {
  const checks: Array<{ id: string; ok: boolean; note: string }> = []
  const add = (id: string, ok: boolean, note = '') => checks.push({ id, ok, note: ok ? '' : note })
  const stamp = Math.random().toString(36).slice(2, 10)
  const p = await loginPersonas({ url: runtime.url, anonKey: runtime.anonKey, admin })
  const sl = p.get('serviceleder')!, salg = p.get('salg')!, bog = p.get('bogholderi')!, mont = p.get('montør')!, adm = p.get('admin')!
  const uid = async (c: SupabaseClient) => (await c.auth.getUser()).data.user!.id
  const [slId, montId] = [await uid(sl), await uid(mont)]
  const partyIds = new Set<string>()
  let customerId: string | null = null
  const caseIds: string[] = []
  try {
    const { data: cust, error: cErr } = await admin.from('customers').insert({ customer_number: `P255APP-${stamp}`, company_name: `[PROBE] App-kunde ${stamp}`, contact_person: 'Probe', email: `p255app-${stamp}@harness.test`, created_by: slId }).select('id').single()
    if (cErr || !cust) throw new Error(`fixture kunde: ${cErr?.message}`)
    customerId = cust.id as string
    const { data: cases, error: sErr } = await admin.from('service_cases').insert([
      { title: `[PROBE] 00255 app ${stamp}`, customer_id: customerId, created_by: slId },
      { title: `[PROBE] 00255 montør ${stamp}`, customer_id: customerId, created_by: slId, assigned_to: montId },
    ]).select('id, assigned_to')
    if (sErr || !cases) throw new Error(`fixture sager: ${sErr?.message}`)
    const caseA = (cases.find((c) => !c.assigned_to) as { id: string }).id
    const caseM = (cases.find((c) => c.assigned_to) as { id: string }).id
    caseIds.push(caseA, caseM)

    // F-6 via PostgREST: direkte .insert().select() afvises for ALLE; RPC'en returnerer id'et; rækken læses bagefter
    for (const [name, c] of [['admin', adm], ['serviceleder', sl], ['salg', salg], ['bogholderi', bog], ['montør', mont]] as const) {
      const r = await c.from('parties').insert({ kind: 'person', display_name: `Direkte ${stamp}` }).select('id')
      add(`F-6/D-1 ${name}: .from('parties').insert().select() afvist`, !!r.error && (r.data ?? []).length === 0, r.error?.code ?? 'ingen fejl')
      const u = await c.from('case_participants').update({ note: 'x' }).eq('service_case_id', caseA)
      add(`D-1 ${name}: direkte UPDATE på case_participants afvist`, !!u.error, u.error?.code ?? 'ingen fejl')
    }
    const ens = await sl.rpc('ensure_register_party', { p_register: 'customer', p_register_id: customerId })
    const custParty = (ens.data as { party_id?: string } | null)?.party_id
    if (custParty) partyIds.add(custParty)
    const back = custParty ? await sl.from('parties').select('id').eq('id', custParty) : null
    add('F-6 serviceleder: ensure_register_party → id som returværdi; næste SELECT ser rækken', !ens.error && !!custParty && (back?.data ?? []).length === 1, `${ens.error?.code ?? ''} ${JSON.stringify(ens.data)}`)

    // Samtidige oprettelser med samme navn → præcis én part
    const name = `Probe Samtidig ${stamp} ApS`
    const args = { p_kind: 'organisation', p_display_name: name, p_organisation_party_id: null, p_verified_emails: [], p_verified_domains: [], p_vat_number: null, p_relationship: 'cooperation_partner', p_confirm_new_reason: null }
    const [r1, r2, r3] = await Promise.all([sl.rpc('create_party', args), adm.rpc('create_party', args), sl.rpc('create_party', { ...args, p_display_name: `PROBE samtidig ${stamp} A/S` })])
    const statuses = [r1, r2, r3].map((r) => (r.data as { status?: string } | null)?.status ?? r.error?.code)
    for (const r of [r1, r2, r3]) { const id = (r.data as { party_id?: string } | null)?.party_id; if (id) partyIds.add(id) }
    const { count: sameName } = await admin.from('parties').select('id', { count: 'exact', head: true }).ilike('display_name', `%samtidig ${stamp}%`)
    add('dublet: 3 samtidige create_party (samme normaliserede navn, 2 brugere) → præcis 1 oprettet, 2 kandidat-svar',
      statuses.filter((s) => s === 'created').length === 1 && statuses.filter((s) => s === 'duplicate_candidates').length === 2 && sameName === 1, `${JSON.stringify(statuses)} n=${sameName}`)
    const partner = [...partyIds].find((id) => id !== custParty)!

    // Sagsdeltagere via RPC (serviceleder) + idempotens
    const a1 = await sl.rpc('add_case_participant_for_register', { p_case_id: caseA, p_register: 'customer', p_register_id: customerId, p_role: 'customer', p_note: null })
    const a2 = await sl.rpc('add_case_participant', { p_case_id: caseA, p_party_id: partner, p_role: 'cooperation_partner', p_note: 'probe' })
    const a3 = await sl.rpc('add_case_participant', { p_case_id: caseA, p_party_id: partner, p_role: 'cooperation_partner', p_note: null })
    add('serviceleder: deltager fra sagens kunde + eksisterende part; gentagelse = existing',
      (a1.data as { status?: string })?.status === 'created' && (a2.data as { status?: string })?.status === 'created' && (a3.data as { status?: string })?.status === 'existing',
      `${JSON.stringify(a1.data ?? a1.error?.code)} ${JSON.stringify(a2.data ?? a2.error?.code)} ${JSON.stringify(a3.data ?? a3.error?.code)}`)

    // D-1: salg/bogholderi læser alt, skriver intet
    for (const [nm, c] of [['salg', salg], ['bogholderi', bog]] as const) {
      const { data: seen } = await c.from('parties').select('id').in('id', [custParty, partner])
      const w = await Promise.all([
        c.rpc('create_party', { ...args, p_display_name: `Ikke tilladt ${stamp}` }),
        c.rpc('ensure_register_party', { p_register: 'customer', p_register_id: customerId }),
        c.rpc('add_case_participant', { p_case_id: caseA, p_party_id: partner, p_role: 'supplier', p_note: null }),
        c.rpc('set_party_relationship', { p_party_id: partner, p_relationship: 'subcontractor', p_evidence: [] }),
      ])
      add(`D-1 ${nm}: ser begge parter; create/ensure/add/relation afvist (42501)`, (seen ?? []).length === 2 && w.every((r) => r.error?.code === '42501'), `seen=${(seen ?? []).length} ${w.map((r) => r.error?.code ?? 'ok').join('/')}`)
    }

    // Montør: kun parter på egen sag
    const before = await mont.from('parties').select('id').in('id', [custParty, partner])
    await sl.rpc('add_case_participant', { p_case_id: caseM, p_party_id: partner, p_role: 'cooperation_partner', p_note: null })
    const after = await mont.from('parties').select('id').in('id', [custParty, partner])
    const mcp = await mont.from('case_participants').select('id, service_case_id').in('service_case_id', [caseA, caseM])
    const mw = await mont.rpc('add_case_participant', { p_case_id: caseM, p_party_id: partner, p_role: 'site_contact', p_note: null })
    // Montørens sag har testkunden → kundens part er synlig via kundescope; partneren først når den deltager på montørens sag
    const ids = (d: Array<{ id: string }> | null) => JSON.stringify((d ?? []).map((r) => r.id).sort())
    add('montør: egen sags kunde-part + partneren først efter deltagelse på egen sag; kun egen sags deltagere; kan ikke tilføje',
      ids(before.data) === JSON.stringify([custParty]) && ids(after.data) === JSON.stringify([custParty, partner].sort())
        && (mcp.data ?? []).length === 1 && (mcp.data ?? [])[0]?.service_case_id === caseM && mw.error?.code === '42501',
      `før=${(before.data ?? []).length} efter=${JSON.stringify(after.data)} cp=${JSON.stringify(mcp.data)} w=${mw.error?.code}`)

    // anon / service_role (baggrund/AI) kan ikke kalde RPC'erne
    const anon = createClient(runtime.url, runtime.anonKey, { auth: { persistSession: false } })
    const an = await anon.rpc('create_party', args)
    const sv = await admin.rpc('create_party', args)
    add('anon og service_role kan ikke kalde create_party', !!an.error && !!sv.error, `${an.error?.code}/${sv.error?.code}`)

    // Afslut deltager
    const cpId = (a2.data as { participant_id?: string })?.participant_id
    const end = await sl.rpc('end_case_participant', { p_participant_id: cpId })
    const { data: ended } = await sl.from('case_participants').select('ended_at').eq('id', cpId!).single()
    add('serviceleder: afslut deltager', !end.error && !!ended?.ended_at, `${end.error?.code} ${JSON.stringify(ended)}`)

    // F-1: ingen offentliggørelser
    const { count: pubs } = await admin.from('external_publications').select('id', { count: 'exact', head: true }).in('audience_party_id', [...partyIds])
    add('F-1: ingen offentliggørelser til testparterne', pubs === 0, String(pubs))
  } finally {
    // Oprydning (service_role har fortsat sine 00254-grants; kun testens egne rækker)
    if (partyIds.size) {
      await admin.from('audit_logs').delete().in('entity_id', [...partyIds])
      await admin.from('parties').delete().in('id', [...partyIds])
    }
    if (caseIds.length) {
      await admin.from('audit_logs').delete().eq('entity_type', 'case_participant').contains('metadata', { service_case_id: caseIds[0] })
      await admin.from('audit_logs').delete().eq('entity_type', 'case_participant').contains('metadata', { service_case_id: caseIds[1] })
      await admin.from('service_cases').delete().in('id', caseIds)
    }
    if (customerId) await admin.from('customers').delete().eq('id', customerId)
    const { count: left } = await admin.from('parties').select('id', { count: 'exact', head: true }).ilike('display_name', `%${stamp}%`)
    add('oprydning: ingen testparter tilbage', left === 0, String(left))
  }
  for (const c of checks) log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.id}${!c.ok && c.note ? ` (${c.note})` : ''}`)
  const failed = checks.filter((c) => !c.ok).length
  log(failed ? `❌ ${failed} af ${checks.length}` : `✅ ${checks.length} tjek — 00255 via PostgREST (staging)`)
  return failed ? 2 : 0
}
