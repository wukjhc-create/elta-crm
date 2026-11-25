/**
 * 00255 parter fase B — PRODUCTION PRÆFLIGHT, ROLLBACK-ONLY (ÉN transaktion, REPEATABLE READ, ALTID ROLLBACK).
 *   npx tsx scripts/prod-00255-dryrun.ts
 *
 * Ikke-destruktiv rollback-verifikation (Henrik 2026-11-25: prod må ikke reelt rulles tilbage som test):
 * før-struktur/-data → PRÆCIS migrationskrop (md5 vises) → SAVEPOINT tests: den SAMME 50-tjeks SQL-prøve som på staging
 * (party-00255-probe) mod syntetiske [PROBE]-rækker med rigtige prod-profiler; prod har kun admin-/montørprofiler, så
 * serviceleder/salg/bogholderi skabes INDE i transaktionen (basisrolle ændres; rulles tilbage) → ROLLBACK TO tests →
 * rollback-SQL (docs/runbooks/sql/00255_rollback.sql) → struktur (hele public) og data = før. Til sidst ROLLBACK af alt.
 *
 * Låse: DROP POLICY/ALTER TABLE på parties/party_relationships/case_participants (0 rækker, ingen app-brug) holdes under
 * transaktionen. lock_timeout 3 s; starter ikke hvis mail-sync-lease'en er holdt. Kun PASS/FAIL + antal/fejlkoder ud.
 */
import { readFileSync } from 'fs'
import { createHash } from 'crypto'
import { withProdRollbackProbe, runMain } from './prod-rollback-probe'
import { STRUCT_MD5 } from './test-harness/reception-00249-probe'
import { STATE_00255_SQL, STRUCT_00255_SQL, migration00255Body, probe00255Sql, evaluateProbe255, rollback00255Statements } from './test-harness/party-00255-probe'

const MIG = 'supabase/migrations/00255_party_write_rpcs.sql'
const RB = 'docs/runbooks/sql/00255_rollback.sql'
const md5 = (s: string) => createHash('md5').update(s).digest('hex')
const BODY = migration00255Body()
const RB_SECTION = rollback00255Statements()
const rbFile = readFileSync(RB, 'utf8').replace(/\r\n/g, '\n').split('\n').filter((l) => l && !l.startsWith('--') && !/^(BEGIN|COMMIT);$/.test(l) && !/^NOTIFY /.test(l)).join('\n')
const FP_TABLES = ['parties', 'party_relationships', 'case_participants', 'external_publications', 'customers', 'customer_contacts', 'suppliers', 'leads',
  'profiles', 'service_cases', 'customer_documents', 'conversations', 'incoming_emails', 'portal_messages', 'permission_catalog', 'role_permission_defaults',
  'user_permission_overrides', 'audit_logs', 'sync_leases']
const FP = `SELECT ${FP_TABLES.map((t) => `(SELECT count(*)::int || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY to_jsonb(x)::text), '')) FROM public.${t} x) AS "${t}"`).join(', ')}`

runMain(() => withProdRollbackProbe('00255-dryrun', async ({ q: q0, add }) => {
  let lastSql = ''
  const q = (sql: string, params: unknown[] = []) => { lastSql = sql.replace(/\s+/g, ' ').slice(0, 90); return q0(sql, params) }
  const one = async (sql: string, params: unknown[] = []) => (await q(sql, params))[0]
  try {
    const t0 = Date.now()
    await q(`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`)
    await q(`SET LOCAL lock_timeout = '3s'`)
    if (/\bcommit\b/i.test(BODY) || /\bcommit\b/i.test(RB_SECTION)) throw new Error('transaktionskontrol i kroppen')
    console.log(`  migrationsfil md5=${md5(readFileSync(MIG, 'utf8'))} · krop md5=${md5(BODY)} (${BODY.split('\n').length} linjer, uændret tekst mellem BEGIN; og COMMIT;)`)
    add('NY', 'rollback-filen = migrationens kommenterede ROLLBACK-sektion (linje for linje)', rbFile === RB_SECTION.trim(), `${rbFile.split('\n').length} vs ${RB_SECTION.trim().split('\n').length} linjer`)
    const lease = (await q(`SELECT count(*)::int n FROM public.sync_leases WHERE expires_at > now()`))[0].n as number
    if (lease > 0) throw new Error('mail-sync-lease er holdt lige nu — prøv igen om et par minutter (prøven må ikke blokere Stage A)')

    // ---------- FØR
    const struct0 = (await one(`SELECT ${STRUCT_MD5} s`)).s as string
    const narrow0 = (await one(`SELECT (${STRUCT_00255_SQL}) h`)).h as string
    const fp0 = await one(FP)
    const st0 = (await one(STATE_00255_SQL)).f
    add('UÆNDRET', 'før: 00255 ikke anvendt (ingen RPC\'er/CVR-indeks; 6 skrivepolitikker + INSERT-grant fra 00254)', st0.applied === false && st0.vat_idx === false && st0.write_policies === 6 && st0.auth_ins === true, JSON.stringify(st0))
    add('UÆNDRET', 'før: 0 parter/relationer/deltagere/offentliggørelser', st0.parties === 0 && st0.rels === 0 && st0.participants === 0 && st0.pubs === 0, JSON.stringify(st0))
    console.log(`  før: struktur ${struct0.slice(0, 8)}… · 00255-område ${narrow0.slice(0, 8)}…`)

    // ---------- MIGRATION (præcis krop)
    try { await q(BODY) } catch (e) { add('NY', 'migrationskroppen kører rent på prod-skemaet', false, (e as { code?: string }).code ?? 'fejl'); return }
    add('NY', 'migrationskroppen kører rent på prod-skemaet (præcis tekst)', true, '')
    const st1 = (await one(STATE_00255_SQL)).f
    add('NY', 'anvendt: RPC\'er + CVR-indeks; 0 skrivepolitikker; authenticated uden INSERT', st1.applied === true && st1.vat_idx === true && st1.write_policies === 0 && st1.auth_ins === false, JSON.stringify(st1))
    const fp1 = await one(FP)
    add('NY', `anvendt: alle ${FP_TABLES.length} data-fingeraftryk uændrede (migrationen ændrer ingen rækker)`, FP_TABLES.every((k) => fp0[k] === fp1[k]), FP_TABLES.filter((k) => fp0[k] !== fp1[k]).join(','))

    // ================= TESTS (rulles tilbage til savepoint 'tests' før rollback-SQL'en)
    await q('SAVEPOINT tests')
    const profs = (await q(`SELECT id, role::text role, is_active FROM public.profiles ORDER BY created_at`)) as Array<{ id: string; role: string; is_active: boolean }>
    const admins = profs.filter((p) => p.role === 'admin' && p.is_active), monts = profs.filter((p) => p.role === 'montør')
    const montActive = monts.find((p) => p.is_active), montSpare = monts.find((p) => p !== montActive)
    const ovCount = (await one(`SELECT count(*)::int n FROM public.user_permission_overrides`)).n
    add('UÆNDRET', `personaer: admin(${admins.length}) + montør(${monts.length}); serviceleder/salg/bogholderi skabes i transaktionen; ${ovCount} overrides i prod`,
      admins.length >= 3 && !!montActive && !!montSpare && ovCount === 0, '')
    if (admins.length < 3 || !montActive || !montSpare) return
    await q(`UPDATE public.profiles SET role = 'serviceleder' WHERE id = $1`, [admins[1].id])
    await q(`UPDATE public.profiles SET role = 'salg' WHERE id = $1`, [admins[2].id])
    await q(`UPDATE public.profiles SET role = 'bogholderi', is_active = true WHERE id = $1`, [montSpare.id])
    // Andre admin-profiler (hvis flere end 3) påvirker ikke prøven: den vælger ældste profil pr. rolle
    await q('SAVEPOINT probe')
    let json: unknown = null
    try {
      await q(probe00255Sql(false))
      add('NY', 'SQL-prøven afsluttede med sit resultat', false, 'ingen RAISE')
    } catch (e) {
      const msg = (e as Error).message ?? ''
      const i = msg.indexOf('P255RESULT'), j = msg.indexOf('P255END')
      if (i < 0 || j < i) add('NY', 'SQL-prøven afsluttede med sit resultat', false, `${(e as { code?: string }).code ?? ''} ${msg.slice(0, 160)}`)
      else json = JSON.parse(msg.slice(i + 'P255RESULT'.length, j))
    }
    await q('ROLLBACK TO SAVEPOINT probe')
    if (json) for (const c of evaluateProbe255(json)) add('NY', `prøve: ${c.id}`, c.ok, c.note.slice(0, 300))

    // ================= rul testdata tilbage (migrationen bliver) → rollback-SQL → før
    await q('ROLLBACK TO SAVEPOINT tests')
    const fp2 = await one(FP)
    add('NY', 'testdata væk efter savepoint-rollback (alle data-fingeraftryk = før)', FP_TABLES.every((k) => fp0[k] === fp2[k]), FP_TABLES.filter((k) => fp0[k] !== fp2[k]).join(','))
    try { await q(RB_SECTION) } catch (e) { add('NY', 'rollback-SQL kører rent', false, (e as { code?: string }).code ?? 'fejl'); return }
    const st3 = (await one(STATE_00255_SQL)).f
    const struct3 = (await one(`SELECT ${STRUCT_MD5} s`)).s as string
    const narrow3 = (await one(`SELECT (${STRUCT_00255_SQL}) h`)).h as string
    const fp3 = await one(FP)
    add('NY', 'rollback: RPC\'er/indeks væk; 6 skrivepolitikker + grants genskabt', st3.applied === false && st3.vat_idx === false && st3.write_policies === 6 && st3.auth_ins === true, JSON.stringify(st3))
    add('NY', 'rollback: struktur-md5 af hele public-skemaet = før (bit-for-bit)', struct3 === struct0, `${struct3.slice(0, 8)}… vs ${struct0.slice(0, 8)}…`)
    add('NY', 'rollback: 00255-områdets fingeraftryk (funktioner inkl. ACL, politikker, grants, indeks, constraints) = før', narrow3 === narrow0, `${narrow3.slice(0, 8)}… vs ${narrow0.slice(0, 8)}…`)
    add('NY', `rollback: alle ${FP_TABLES.length} data-fingeraftryk = før`, FP_TABLES.every((k) => fp0[k] === fp3[k]), FP_TABLES.filter((k) => fp0[k] !== fp3[k]).join(','))
    console.log(`  varighed: ${((Date.now() - t0) / 1000).toFixed(1)} s (låse holdt i denne periode; alt rulles nu tilbage)`)
  } catch (e) {
    add('NY', `ABORT — prøven stoppede (transaktionen rulles tilbage) ved: ${lastSql}`, false, `${(e as { code?: string }).code ?? ''} ${(e as Error).message?.slice(0, 120) ?? ''}`)
  }
}))
