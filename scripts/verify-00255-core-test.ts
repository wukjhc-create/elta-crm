/**
 * Fixture-test af prod-verify-00255-evalueringen (ingen database). Beviser at BEGGE driftstilstande evalueres korrekt,
 * og at aktiv tilstand ikke accepterer vilkårlige rækker: hver integritets-/sikkerhedsfejl giver FAIL.
 *   npx tsx scripts/verify-00255-core-test.ts
 */
import { detectMode, evaluatePost00255, RPCS_00255, type State00255, type Acl00255, type Mode00255 } from './test-harness/verify-00255-core'

const INTEGRITY_KEYS = ['orphan_rel_party', 'orphan_cp_party', 'orphan_cp_case', 'orphan_org_party', 'orphan_party_creator', 'orphan_audit_entity',
  'register_rel_mismatch', 'register_party_without_register', 'rel_invalid', 'rel_open_dup', 'cp_invalid', 'cp_dup', 'cp_creator_missing',
  'vat_dup', 'vat_invalid', 'name_dup_groups', 'name_dup_undocumented', 'party_no_audit', 'rel_no_audit', 'rel_ended_no_audit', 'cp_no_audit',
  'cp_ended_no_audit', 'audit_no_actor', 'audit_actor_mismatch']

const base = (): State00255 => ({
  prereq: true, fns: 16, vat_idx: true, vat_chk: 1, write_policies: 0, select_policies: 3, select_policies_non_auth: 0,
  auth_write: false, auth_select: true, anon_any: false, rls_off: 0,
  parties: 0, rels: 0, participants: 0, rels_active: 0, participants_active: 0, pubs: 0, pub_audit: 0,
  conversations: 47, conv_unclassified: 47, party_audit: 0, audit_by_action: {}, audit_actor_roles: {},
  integrity: Object.fromEntries(INTEGRITY_KEYS.map((k) => [k, 0])),
  portal: { customer_portal_docs: 15, customer_portal_docs_mail_attachment: 0, partner_portal_docs: 3, f1_shared_flag_cross_exposure: 0, portal_tasks_customer_visible: 0 },
})
const active = (): State00255 => ({ ...base(), parties: 1, rels: 1, participants: 1, rels_active: 1, participants_active: 1, party_audit: 2,
  audit_by_action: { party_created: 1, case_participant_added: 1 }, audit_actor_roles: { admin: 2 } })
const acl = (): Acl00255 => ({ auth: [...RPCS_00255].sort(), anon: 0, svc: 0, definer: true })

let pass = 0, fail = 0
const expect = (name: string, cond: boolean) => { if (cond) pass++; else fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`) }
const allOk = (st: State00255, m: Mode00255, a = acl()) => evaluatePost00255(st, a, m).every((c) => c.ok)
const failsOn = (st: State00255, m: Mode00255, needle: string, a = acl()) => {
  const bad = evaluatePost00255(st, a, m).filter((c) => !c.ok)
  return bad.length > 0 && bad.every((c) => c.id.includes(needle))
}

// 1. Tilstandsdetektion
expect('detectMode: 0 data → inert', detectMode(base()) === 'inert')
expect('detectMode: data → active', detectMode(active()) === 'active')
expect('detectMode: kun audit-rækker (data slettet) → active (så integritet tjekkes)', detectMode({ ...base(), party_audit: 1 }) === 'active')

// 2. Grønne tilstande
expect('inert: ren 00255-tilstand uden data → alle PASS', allOk(base(), 'inert'))
expect('active: gyldige testdata (1/1/1, 2 audit) → alle PASS', allOk(active(), 'active'))
expect('inert-forventning afviser aktive data', failsOn(active(), 'inert', 'inert:'))
expect('active-forventning afviser tom tilstand', failsOn(base(), 'active', 'aktiv:'))

// 3. Aktiv tilstand: hver integritetsfejl giver FAIL (ingen accept af vilkårlige rækker)
for (const k of INTEGRITY_KEYS.filter((x) => x !== 'name_dup_groups')) {
  const st = active(); st.integrity[k] = 1
  expect(`active: ${k}=1 → FAIL`, !allOk(st, 'active'))
}
{ const st = active(); st.integrity.name_dup_groups = 1
  expect('active: navne-dublet MED dokumenteret tilsidesættelse (kun name_dup_groups) → PASS', allOk(st, 'active')) }
{ const st = active(); st.audit_by_action = { ...st.audit_by_action, party_deleted: 1 }
  expect('active: ukendt audit-handling → FAIL', failsOn(st, 'active', 'audit-handlinger')) }

// 4. Sikkerhed/struktur: FAIL i begge tilstande
const security: Array<[string, (s: State00255) => void, string]> = [
  ['skrivepolitik genindført', (s) => { s.write_policies = 1 }, 'ingen direkte skrivning'],
  ['authenticated har direkte INSERT', (s) => { s.auth_write = true }, 'ingen direkte skrivning'],
  ['SELECT-politik til anon/public', (s) => { s.select_policies_non_auth = 1 }, 'ingen direkte skrivning'],
  ['anon-grant', (s) => { s.anon_any = true }, 'anon'],
  ['RLS slået fra', (s) => { s.rls_off = 1 }, 'RLS'],
  ['offentliggørelse findes', (s) => { s.pubs = 1 }, 'offentliggørelser'],
  ['publicerings-audit findes', (s) => { s.pub_audit = 1 }, 'offentliggørelser'],
  ['F-1-krydseksponering', (s) => { s.portal.f1_shared_flag_cross_exposure = 1 }, 'portaleksponering'],
  ['mail-vedhæftning i kundeportal', (s) => { s.portal.customer_portal_docs_mail_attachment = 1 }, 'portaleksponering'],
  ['henvendelse klassificeret (fase C)', (s) => { s.conv_unclassified = 46 }, 'henvendelser'],
  ['funktion mangler', (s) => { s.fns = 15 }, 'struktur'],
]
for (const m of ['inert', 'active'] as Mode00255[]) {
  for (const [name, mut, needle] of security) {
    const st = m === 'inert' ? base() : active(); mut(st)
    expect(`${m}: ${name} → FAIL (${needle})`, failsOn(st, m, needle))
  }
  expect(`${m}: service_role-EXECUTE → FAIL`, failsOn(m === 'inert' ? base() : active(), m, 'funktions-ACL', { ...acl(), svc: 1 }))
  expect(`${m}: ekstra authenticated-funktion → FAIL`, failsOn(m === 'inert' ? base() : active(), m, 'funktions-ACL', { ...acl(), auth: [...acl().auth, '_party_require_user'].sort() }))
  expect(`${m}: ikke SECURITY DEFINER/search_path → FAIL`, failsOn(m === 'inert' ? base() : active(), m, 'SECURITY DEFINER', { ...acl(), definer: false }))
}

console.log(fail ? `❌ ${fail} af ${pass + fail}` : `✅ ${pass} tjek — verify-00255-core`)
process.exitCode = fail ? 1 : 0
