/**
 * PRODUCTION read-only: persona-verifikation efter 00185 (N2). Kører som hver aktiv rolle (jwt-claims + role
 * authenticated, samme metode som prod-rls-effective) og verificerer, at
 *   - rollen kan LÆSE time_logs inkl. de nye godkendelseskolonner (SELECT-policy uændret — ingen fejl for nogen rolle)
 *   - guard-funktionen ikke kan kaldes direkte af rollen (kun som trigger)
 *   - antal timer der afventer godkendelse (det N28-cockpittet viser for time_logs.approve)
 * Skrivning kan ikke prøves i en read-only transaktion; skrivebeskyttelsen (montør kan ikke godkende egne timer,
 * insert → pending, rettelse → pending) er bevist på staging (harness rls-read L13, UI U62).
 *   npx tsx scripts/prod-verify-00185-personas.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

async function main() {
  const personas = await withProdReadOnly('00185-personas', async (run) =>
    (await run(`SELECT DISTINCT ON (role) id, role::text role FROM profiles WHERE coalesce(is_active,true) ORDER BY role, created_at`)) as Array<{ id: string; role: string }>)
  const fails: string[] = []
  for (const pr of personas) {
    const res = await withProdReadOnly(`00185-${pr.role}`, async (run) => {
      await run(`SELECT set_config('request.jwt.claims', '${JSON.stringify({ sub: pr.id, role: 'authenticated' })}', true)`)
      await run(`SELECT set_config('role', 'authenticated', true)`)
      const row = (await run(`SELECT count(*)::int total,
          count(*) FILTER (WHERE approval_status = 'pending' AND end_time IS NOT NULL)::int pending,
          count(*) FILTER (WHERE approval_status = 'approved')::int approved,
          has_function_privilege('public.time_logs_approval_guard()', 'EXECUTE') can_exec_guard
        FROM public.time_logs`))[0] as { total: number; pending: number; approved: number; can_exec_guard: boolean }
      return row
    }).catch((e) => ({ error: maskDbError(e) }))
    if ('error' in res) { fails.push(`${pr.role}: læsning fejlede (${res.error})`); console.log(`${pr.role.padEnd(12)} FEJL ${res.error}`); continue }
    if (res.can_exec_guard) fails.push(`${pr.role}: kan kalde guard-funktionen direkte`)
    console.log(`${pr.role.padEnd(12)} ser ${res.total} registreringer · afventer ${res.pending} · godkendt ${res.approved} · guard direkte=${res.can_exec_guard ? 'JA' : 'nej'}`)
  }
  if (fails.length) { console.log(`❌ ${fails.length} afvigelse(r)\n  - ${fails.join('\n  - ')}`); process.exitCode = 1 }
  else console.log('✅ personas: alle roller læser time_logs med godkendelseskolonner; guard kun som trigger')
}

main().catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
