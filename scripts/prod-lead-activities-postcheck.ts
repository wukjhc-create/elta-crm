/**
 * PRODUCTION read-only post-check for 00234: synlige lead_activities pr. rolle, evalueret i en READ ONLY persona-session
 * (jwt-claims + role authenticated, som prod-rls-effective.ts). Kun antal — ingen indhold eller id'er ud.
 * Prod har kun de roller, der faktisk findes som profiler; manglende roller rapporteres som "ingen profil".
 *   npx tsx scripts/prod-lead-activities-postcheck.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const ALLOWED = new Set(['admin', 'serviceleder', 'salg'])

async function main() {
  const personas = await withProdReadOnly('la-post-personas', async (run) =>
    (await run(`SELECT DISTINCT ON (role) id, role::text role FROM profiles WHERE is_active ORDER BY role, created_at`)) as Array<{ id: string; role: string }>)
  const total = await withProdReadOnly('la-post-total', async (run) => Number((await run(`SELECT count(*)::int n FROM public.lead_activities`))[0].n))
  console.log(`lead_activities i alt (postgres): ${total}`)
  let bad = 0
  for (const role of ['admin', 'serviceleder', 'salg', 'bogholderi', 'montør']) {
    const pr = personas.find((x) => x.role === role)
    if (!pr) { console.log(`  ${role.padEnd(13)} ingen profil i prod (kan ikke prøves her — dækket på staging)`); continue }
    const visible = await withProdReadOnly(`la-post-${role}`, async (run) => {
      await run(`SELECT set_config('request.jwt.claims', '${JSON.stringify({ sub: pr.id, role: 'authenticated' })}', true)`)
      await run(`SELECT set_config('role', 'authenticated', true)`)
      return Number((await run(`SELECT count(*)::int n FROM public.lead_activities`))[0].n)
    })
    const want = ALLOWED.has(role) ? total : 0
    const ok = visible === want
    if (!ok) bad++
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${role.padEnd(13)} ser ${visible} (forventet ${want})`)
  }
  process.exitCode = bad ? 2 : 0
}
main().catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
