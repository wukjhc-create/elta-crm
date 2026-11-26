/**
 * 00255 parter fase B — PRODUCTION READ-ONLY før/efter-tjek (kun SELECT, kun antal/flag; aldrig navne/e-mails/CVR/id'er).
 *   npx tsx scripts/prod-verify-00255.ts pre                    (før: 00254 findes, 00255 ikke anvendt, 0 rækker)
 *   npx tsx scripts/prod-verify-00255.ts post --detect          (KUN diagnose: tilstanden gættes ud fra data — aldrig i drift)
 *   npx tsx scripts/prod-verify-00255.ts post --expect active   (prod fra 2026-11-26: PARTIES_UI_ENABLED=true)
 *   npx tsx scripts/prod-verify-00255.ts post --expect inert    (flag FRA og ingen brug: 0 partsdata)
 *
 * Begge post-tilstande tjekker struktur/RLS/RPC-ACL, offentliggørelser (0, F-1) og portaleksponering. Aktiv tilstand
 * accepterer IKKE et vilkårligt antal rækker: hver part/relation/deltager skal have gyldige referencer, register-konsistens,
 * fuldt audit-spor med kendt aktør og ingen udokumenterede dubletter. Logik + SQL: test-harness/verify-00255-core.ts
 * (fixture-test: scripts/verify-00255-core-test.ts).
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { STATE_00255_SQL, ACL_00255_SQL, detectMode, evaluatePost00255, type State00255, type Acl00255, type Check, type Mode00255 } from './test-harness/verify-00255-core'

const mode = process.argv[2]
const expectArg = (() => { const i = process.argv.indexOf('--expect'); return i > 0 ? process.argv[i + 1] : undefined })()
const detectArg = process.argv.includes('--detect')
if ((mode !== 'pre' && mode !== 'post') || (expectArg !== undefined && expectArg !== 'inert' && expectArg !== 'active') ||
    (mode === 'post' && !expectArg && !detectArg) || (expectArg && detectArg)) {
  // Production-monitorering skal angive tilstanden eksplicit (fra 2026-11-26: --expect active) — ingen tavs gætning
  console.error('brug: pre | post --expect inert|active | post --detect (kun diagnose)'); process.exit(2)
}

withProdReadOnly('prod-verify-00255', async (run) => {
  const st = (await run(STATE_00255_SQL))[0].j as State00255
  const { integrity, portal, audit_by_action, audit_actor_roles, ...flat } = st
  console.log(`INFO  ${JSON.stringify(flat)}`)
  console.log(`INFO  portal ${JSON.stringify(portal)}`)
  let checks: Check[]
  if (mode === 'pre') {
    checks = [
      { id: 'forudsætning: 00254 (parties, party_visible_to_me, case_visible_to_me) findes', ok: st.prereq === true },
      { id: 'ingen rækker i partstabellerne/offentliggørelser', ok: st.parties === 0 && st.rels === 0 && st.participants === 0 && st.pubs === 0 && st.party_audit === 0 },
      { id: 'alle henvendelser stadig unknown/none uden kilde-part', ok: st.conv_unclassified === st.conversations },
      { id: '00255 ikke anvendt (0 funktioner, intet CVR-indeks; 6 skrivepolitikker + direkte grants fra 00254)', ok: st.fns === 0 && st.vat_idx === false && st.vat_chk === 0 && st.write_policies === 6 && st.auth_write === true },
    ]
  } else {
    const acl = (await run(ACL_00255_SQL))[0].j as Acl00255
    const detected = detectMode(st)
    const used: Mode00255 = (expectArg as Mode00255 | undefined) ?? detected
    console.log(`INFO  acl ${JSON.stringify({ auth: acl.auth.length, anon: acl.anon, svc: acl.svc, definer: acl.definer })}`)
    console.log(`INFO  audit ${JSON.stringify(audit_by_action)} · aktør-roller ${JSON.stringify(audit_actor_roles)}`)
    console.log(`INFO  integritet ${JSON.stringify(integrity)}`)
    console.log(`INFO  driftstilstand: detekteret=${detected}${expectArg ? ` · forventet=${expectArg}` : ''}`)
    checks = evaluatePost00255(st, acl, used)
    if (expectArg) checks.unshift({ id: `driftstilstand = forventet (${expectArg})`, ok: detected === expectArg, note: `detekteret=${detected}` })
  }
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.id}${c.note ? ` — ${c.note}` : ''}`)
  const failed = checks.filter((c) => !c.ok).length
  console.log(failed ? `❌ ${failed} af ${checks.length}` : `✅ ${checks.length} tjek — 00255 ${mode}${mode === 'post' ? ` (${expectArg ?? detectMode(st)})` : ''}`)
  process.exitCode = failed ? 1 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
