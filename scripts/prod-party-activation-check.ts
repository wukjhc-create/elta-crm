/**
 * Parter fase B — aktiverings-smoke i PRODUCTION. Kun SELECT (read-only) eller rollback-only. Ingen personværdier ud
 * (kun id'er, sagsnumre, roller, handlingstyper, antal/hashes).
 *
 *   npx tsx scripts/prod-party-activation-check.ts snapshot <kundenr> <sagsnr>   før admin-UI-testen (read-only; gemmer
 *                                                                                 hashes af eksisterende rækker lokalt)
 *   npx tsx scripts/prod-party-activation-check.ts verify   <kundenr> <sagsnr> [--expect P,R,C,A]
 *                                                                                 efter testen (read-only): nye rækker,
 *                                                                                 audit, dubletter, ændrede eksisterende rækker
 *   npx tsx scripts/prod-party-activation-check.ts montor   <kundenr> <sagsnr>   ROLLBACK-ONLY: montør-synlighed + alle 8
 *                                                                                 skrive-RPC'er afvist; ingen profil ændres
 *
 * verify kræver altid: alle nye parter/relationer/deltagere/audit-rækker ligger på testkunden/-sagen, audit har kendt
 * aktør og kun kendte handlinger, ingen ny udokumenteret navne-dublet, 0 offentliggørelser, ingen eksisterende rækker
 * ændret/slettet. --expect P,R,C,A låser desuden antal nye parter, relationer, deltagere og party-audit-rækker (første
 * aktivering 2026-11-26: 1,1,1,2). Snapshot ligger i %TEMP%/elta-party-activation (kun hashes). Testdata
 * C000008 / SVC-01006 beholdes som interne smoke-testdata. Runbook: docs/runbooks/PARTY_PHASE_B_PROD_SMOKE.md
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { withProdRollbackProbe, runMain } from './prod-rollback-probe'

const [mode, custNo, caseNo] = process.argv.slice(2)
const expIdx = process.argv.indexOf('--expect')
const EXPECT = expIdx > 0 ? process.argv[expIdx + 1]?.split(',').map(Number) : undefined
if (!['snapshot', 'verify', 'montor'].includes(mode ?? '') || !custNo || !caseNo || custNo.startsWith('--') || caseNo.startsWith('--')
  || (expIdx > 0 && (!EXPECT || EXPECT.length !== 4 || EXPECT.some((n) => !Number.isInteger(n) || n < 0)))) {
  console.error('brug: snapshot|verify|montor <kundenr> <sagsnr> [--expect P,R,C,A]'); process.exit(2)
}
const KNOWN_AUDIT = ['party_created', 'party_updated', 'party_relationship_set', 'party_relationship_ended', 'case_participant_added', 'case_participant_ended']
const SNAP = join(tmpdir(), 'elta-party-activation', `snapshot-${custNo}-${caseNo}.json`)
// Eksisterende rækker der IKKE må ændres af testen (hash pr. række-id; nye rækker fra normal drift ignoreres)
const WATCH = ['customers', 'customer_contacts', 'service_cases', 'conversations', 'customer_documents', 'portal_access_tokens',
  'partner_access_tokens', 'profiles', 'user_permission_overrides', 'external_publications', 'parties', 'party_relationships', 'case_participants']
/** Read-only-runneren tager ingen parametre → validerede literaler (kun kunde-/sagsnumre, uuid'er og ISO-tidsstempler) */
const lit = (sql: string, params: unknown[]) => sql.replace(/\$(\d+)/g, (_m, i) => {
  const v = String(params[Number(i) - 1])
  if (!/^[A-Za-z0-9:.+\-TZ ]{1,64}$/.test(v)) throw new Error('ugyldig parameter')
  return `'${v}'`
})
const rowKey = (t: string) => (t === 'user_permission_overrides' ? `x.profile_id::text || ':' || x.permission` : 'x.id::text')
const rowHashes = (t: string) => `SELECT coalesce(json_object_agg(${rowKey(t)}, md5(to_jsonb(x)::text)), '{}') h FROM public.${t} x`

async function ids(run: (s: string, p?: unknown[]) => Promise<any[]>) {
  const [r] = await run(`SELECT (SELECT id::text FROM customers WHERE customer_number = $1) c, (SELECT id::text FROM service_cases WHERE case_number = $2) s,
    (SELECT customer_id::text FROM service_cases WHERE case_number = $2) sc`, [custNo, caseNo])
  if (!r.c || !r.s) throw new Error('kunde eller sag findes ikke')
  if (r.sc !== r.c) throw new Error('sagen tilhører ikke kunden')
  return { c: r.c as string, s: r.s as string }
}

const STATUS = `SELECT json_build_object(
  'parties', (SELECT count(*) FROM parties), 'rels', (SELECT count(*) FROM party_relationships), 'participants', (SELECT count(*) FROM case_participants),
  'pubs', (SELECT count(*) FROM external_publications), 'party_audit', (SELECT count(*) FROM audit_logs WHERE action LIKE 'party%' OR action LIKE 'case_participant%'),
  'conv_unclassified', (SELECT count(*) FROM conversations WHERE communication_class = 'unknown' AND communication_class_source = 'none' AND source_party_id IS NULL),
  'conversations', (SELECT count(*) FROM conversations)) j`

if (mode === 'montor') {
  runMain(() => withProdRollbackProbe('party-activation-montor', async ({ q, as, add }) => {
    const { c, s } = await ids((sql, p) => q(sql, p ?? []))
    const monts = (await q(`SELECT id::text FROM profiles WHERE role = 'montør' AND is_active ORDER BY created_at`)) as Array<{ id: string }>
    if (!monts.length) { add('NY', 'aktiv montørprofil findes', false, '0'); return }
    const u = { uid: monts[0].id }
    const inScope = await as(u, `SELECT ($1::uuid = ANY (public.my_case_scope_ids())) v, ($2::uuid = ANY (public.my_customer_scope_ids())) w`, [s, c])
    const seesParty = await as(u, `SELECT id FROM public.parties WHERE customer_id = $1`, [c])
    const seesCp = await as(u, `SELECT id FROM public.case_participants WHERE service_case_id = $1`, [s])
    const seesAll = await as(u, `SELECT count(*)::int n FROM public.parties`)
    const scope = inScope.ok ? inScope.rows[0] : { v: null, w: null }
    const expectVisible = scope.v === true || scope.w === true
    add('NY', `montør: sag i scope=${scope.v} kunde i scope=${scope.w} → ser kundens part=${seesParty.ok ? seesParty.rows.length : seesParty.code}, sagens deltagere=${seesCp.ok ? seesCp.rows.length : seesCp.code}`,
      seesParty.ok && seesCp.ok && (expectVisible || (seesParty.rows.length === 0 && seesCp.rows.length === 0)), '')
    add('NY', `montør: ser i alt ${seesAll.ok ? seesAll.rows[0].n : seesAll.code} parter (kun egne sager/kundescope; intet register)`, seesAll.ok, '')
    const pid = (await q(`SELECT id::text FROM parties WHERE customer_id = $1`, [c]))[0]?.id ?? '00000000-0000-4000-8000-000000000000'
    const calls: Array<[string, string, unknown[]]> = [
      ['create_party', `SELECT public.create_party('person', 'Montør-prøve', NULL, NULL, NULL, NULL, NULL, NULL)`, []],
      ['update_party', `SELECT public.update_party($1::uuid, 'X', NULL, NULL, NULL, NULL)`, [pid]],
      ['ensure_register_party', `SELECT public.ensure_register_party('customer', $1::uuid)`, [c]],
      ['set_party_relationship', `SELECT public.set_party_relationship($1::uuid, 'subcontractor', NULL)`, [pid]],
      ['end_party_relationship', `SELECT public.end_party_relationship((SELECT id FROM public.party_relationships WHERE party_id = $1::uuid LIMIT 1), 'ended')`, [pid]],
      ['add_case_participant', `SELECT public.add_case_participant($1::uuid, $2::uuid, 'site_contact', NULL)`, [s, pid]],
      ['add_case_participant_for_register', `SELECT public.add_case_participant_for_register($1::uuid, 'customer', $2::uuid, 'payer', NULL)`, [s, c]],
      ['end_case_participant', `SELECT public.end_case_participant((SELECT id FROM public.case_participants WHERE service_case_id = $1::uuid LIMIT 1))`, [s]],
    ]
    const res: string[] = []
    for (const [n, sql, p] of calls) { const r = await as(u, sql, p); res.push(`${n}=${r.ok ? 'ok' : r.code}`) }
    add('NY', 'montør: alle 8 skrive-RPC\'er afvist (42501)', res.every((x) => x.endsWith('=42501')), res.join(' '))
    const direct = await as(u, `INSERT INTO public.parties (kind, display_name) VALUES ('person', 'X') RETURNING id`)
    add('NY', 'montør: direkte INSERT afvist', !direct.ok, direct.ok ? 'ok' : direct.code)
  }))
} else {
  withProdReadOnly(`party-activation-${mode}`, async (run0) => {
    const run = (sql: string, params: unknown[] = []) => run0(lit(sql, params))
    const { c, s } = await ids(run)
    const st = (await run(STATUS))[0].j
    console.log(`INFO  status ${JSON.stringify(st)}`)
    if (mode === 'snapshot') {
      const snap: Record<string, unknown> = { at: new Date().toISOString(), status: st, hashes: {} }
      for (const t of WATCH) (snap.hashes as Record<string, unknown>)[t] = (await run(rowHashes(t)))[0].h
      const [mx] = await run(`SELECT max(created_at) m FROM audit_logs`)
      snap.audit_max = mx.m
      mkdirSync(join(tmpdir(), 'elta-party-activation'), { recursive: true })
      writeFileSync(SNAP, JSON.stringify(snap))
      console.log(`OK    snapshot gemt lokalt (${WATCH.length} tabeller, kun hashes) — kunde/sag fundet`)
      return
    }
    const snap = JSON.parse(readFileSync(SNAP, 'utf8')) as { at: string; status: Record<string, number>; hashes: Record<string, Record<string, string>>; audit_max: string }
    const checks: Array<[string, boolean, string]> = []
    const changed: string[] = []
    for (const t of WATCH) {
      const now = (await run(rowHashes(t)))[0].h as Record<string, string>
      const before = snap.hashes[t] ?? {}
      const mod = Object.keys(before).filter((id) => id in now && now[id] !== before[id])
      const del = Object.keys(before).filter((id) => !(id in now))
      const added = Object.keys(now).filter((id) => !(id in before)).length
      if (mod.length || del.length) changed.push(`${t}: ændret=${mod.length}${mod.includes(c) || mod.includes(s) ? ' (inkl. testkunde/-sag)' : ''} slettet=${del.length}`)
      console.log(`INFO  ${t}: nye=${added} ændrede=${mod.length} slettede=${del.length}`)
    }
    const parties = await run(`SELECT p.id::text, p.kind, (p.customer_id = $1) is_test_customer, p.customer_contact_id IS NOT NULL is_contact, p.supplier_id IS NOT NULL is_supplier,
        (SELECT role::text FROM profiles WHERE id = p.created_by) creator_role FROM parties p WHERE p.created_at > $2 ORDER BY p.created_at`, [c, snap.at])
    const rels = await run(`SELECT r.id::text, r.relationship, r.source, r.status, (SELECT customer_id = $1 FROM parties WHERE id = r.party_id) on_test_customer FROM party_relationships r WHERE r.created_at > $2`, [c, snap.at])
    const cps = await run(`SELECT cp.id::text, cp.role, (cp.service_case_id = $1) on_test_case, (SELECT customer_id = $2 FROM parties WHERE id = cp.party_id) party_is_test_customer, cp.ended_at IS NOT NULL ended FROM case_participants cp WHERE cp.created_at > $3`, [s, c, snap.at])
    const audit = await run(`SELECT a.action, a.entity_type, (SELECT role::text FROM profiles WHERE id = a.user_id) actor_role, a.user_id IS NOT NULL has_actor,
        (a.entity_id IN (SELECT id FROM parties WHERE customer_id = $1) OR a.entity_id IN (SELECT id FROM case_participants WHERE service_case_id = $2)) on_test
      FROM audit_logs a WHERE (a.action LIKE 'party%' OR a.action LIKE 'case_participant%') AND a.created_at > $3 ORDER BY a.created_at`, [c, s, snap.at])
    console.log(`INFO  nye parter: ${JSON.stringify(parties)}`)
    console.log(`INFO  nye relationer: ${JSON.stringify(rels)}`)
    console.log(`INFO  nye deltagere: ${JSON.stringify(cps)}`)
    console.log(`INFO  nye party-audit: ${JSON.stringify(audit)}`)
    // Ny navne-dublet: part oprettet efter snapshot med samme normaliserede navn som en anden part, uden bevidst
    // tilsidesættelse (duplicate_override) i sin party_created-audit
    const [dup] = await run(`SELECT count(*)::int n FROM parties p WHERE p.created_at > $1
        AND EXISTS (SELECT 1 FROM parties o WHERE o.id <> p.id AND public.party_normalize_name(o.display_name) = public.party_normalize_name(p.display_name))
        AND NOT EXISTS (SELECT 1 FROM audit_logs a WHERE a.entity_type = 'party' AND a.entity_id = p.id AND a.action = 'party_created' AND (a.metadata->>'duplicate_override')::boolean IS TRUE)`, [snap.at])
    const counts = [parties.length, rels.length, cps.length, audit.length]
    console.log(`INFO  nye rækker P,R,C,A = ${counts.join(',')}${EXPECT ? ` · forventet ${EXPECT.join(',')}` : ''}`)
    if (EXPECT) checks.push(['antal nye parter/relationer/deltagere/audit = forventet', counts.join(',') === EXPECT.join(','), counts.join(',')])
    checks.push(['alle nye parter er testkundens og oprettet af en kendt profil', parties.every((p) => p.is_test_customer === true && p.creator_role !== null), `${parties.length}`])
    checks.push(['alle nye relationer ligger på testkunden', rels.every((r) => r.on_test_customer === true), `${rels.length}`])
    checks.push(['alle nye deltagere er testkunden på testsagen', cps.every((x) => x.on_test_case === true && x.party_is_test_customer === true), `${cps.length}`])
    checks.push(['audit: kendt aktør, kun kendte handlinger, alle på testdata', audit.every((a) => a.has_actor && a.actor_role !== null && a.on_test && KNOWN_AUDIT.includes(a.action)), `${audit.length}`])
    checks.push(['ingen ny udokumenteret navne-dublet (dublet-forsøg uden "Opret alligevel" opretter intet)', dup.n === 0, `${dup.n}`])
    checks.push(['0 offentliggørelser; henvendelser stadig unknown/none', st.pubs === 0 && st.conv_unclassified === st.conversations, JSON.stringify(st)])
    checks.push(['ingen eksisterende rækker ændret/slettet i de overvågede tabeller', changed.length === 0, changed.join(' · ')])
    for (const [id, ok, note] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${ok ? '' : ` (${note})`}`)
    const failed = checks.filter(([, ok]) => !ok).length
    console.log(failed ? `❌ ${failed} af ${checks.length}` : `✅ ${checks.length} tjek — aktiverings-smoke (read-only)`)
    process.exitCode = failed ? 1 : 0
  }).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
}
