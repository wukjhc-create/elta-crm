/**
 * PRODUCTION read-only: er prod klar til N11-flaget MONTOR_START_JOB_ENABLED (montør starter eget job)?
 *   npx tsx scripts/prod-verify-montor-start-job.ts
 * Krav: RLS 00181 — work_orders UPDATE-policy tillader montør status in_progress/done på egne (tildelte) arbejdsordrer,
 * og ingen gammel bred policy (work_orders_all_auth) ligger tilbage. Ændrer intet; flaget sættes i Vercel af Henrik.
 * Én SELECT (withProdReadOnly). Afviger noget -> exitCode 1.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-verify-montor-start-job', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'policies', (SELECT json_agg(json_build_object('name', policyname, 'cmd', cmd, 'qual', qual, 'check', with_check) ORDER BY policyname)
                 FROM pg_policies WHERE schemaname='public' AND tablename='work_orders'),
    'montoerer_med_profil', (SELECT count(*)::int FROM employees e JOIN profiles p ON p.id = e.profile_id WHERE p.role = 'montør' AND e.active),
    'planlagte_job', (SELECT count(*)::int FROM work_orders WHERE status = 'planned' AND assigned_employee_id IS NOT NULL)
  ) r`))[0].r as Record<string, any>
  const pol = (row.policies ?? []) as Array<{ name: string; cmd: string; qual: string | null; check: string | null }>
  const norm = (q: string | null) => (q ?? '').replace(/\s+/g, ' ')
  const fails: string[] = []
  if (pol.some((p) => p.name === 'work_orders_all_auth')) fails.push('gammel bred policy work_orders_all_auth findes stadig')
  const upd = pol.filter((p) => p.cmd === 'UPDATE')
  if (upd.length !== 1 || upd[0].name !== 'work_orders_update_role') fails.push(`forventede præcis work_orders_update_role som UPDATE-policy: ${JSON.stringify(upd.map((p) => p.name))}`)
  const chk = norm(upd[0]?.check ?? null), qual = norm(upd[0]?.qual ?? null)
  if (!/montør/.test(chk) || !/in_progress/.test(chk) || !/'done'/.test(chk)) fails.push('UPDATE WITH CHECK tillader ikke montør in_progress/done')
  if (!/auth\.uid\(\)/.test(qual) || !/assigned_employee_id/.test(qual)) fails.push('UPDATE USING begrænser ikke montør til egne arbejdsordrer')
  console.log(JSON.stringify({ policies: pol.map((p) => `${p.cmd}:${p.name}`), montoerer_med_profil: row.montoerer_med_profil, planlagte_job: row.planlagte_job }))
  if (fails.length) { console.log(`❌ ikke klar: ${fails.length} afvigelse(r)\n  - ${fails.join('\n  - ')}`); process.exitCode = 1 }
  else console.log('✅ prod-RLS klar til MONTOR_START_JOB_ENABLED=true (sættes i Vercel; flaget er OFF indtil da)')
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
