/**
 * PRODUCTION read-only: verifikation af 00180 (GO-LIVE G10 — mail-scope for montør + serviceleder ser medarbejdere).
 *   npx tsx scripts/prod-verify-00180.ts pre   — forventet før: incoming_emails_select = true, employees admin-or-self, ingen funktion
 *   npx tsx scripts/prod-verify-00180.ts post  — forventet efter: præcis de nye policies + definer-funktion uden anon/PUBLIC-EXECUTE
 * Én SELECT pr. kald (withProdReadOnly). Afviger noget -> exitCode 1.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const phase = process.argv[2]
if (phase !== 'pre' && phase !== 'post') { console.error('brug: pre|post'); process.exit(2) }

withProdReadOnly(`prod-verify-00180 ${phase}`, async (run) => {
  const row = (await run(`SELECT json_build_object(
    'mail_select', (SELECT json_agg(json_build_object('name', policyname, 'qual', qual, 'roles', roles::text)) FROM pg_policies WHERE schemaname='public' AND tablename='incoming_emails' AND cmd='SELECT'),
    'emp_select', (SELECT json_agg(json_build_object('name', policyname, 'qual', qual)) FROM pg_policies WHERE schemaname='public' AND tablename='employees' AND cmd='SELECT'),
    'fn', (SELECT json_build_object('definer', p.prosecdef, 'config', p.proconfig::text,
             'anon_exec', has_function_privilege('anon', p.oid, 'EXECUTE'),
             'auth_exec', has_function_privilege('authenticated', p.oid, 'EXECUTE'))
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname='user_can_see_case'),
    'montoer_mails_paa_sager', (SELECT count(*)::int FROM incoming_emails WHERE service_case_id IS NOT NULL),
    'mails_i_alt', (SELECT count(*)::int FROM incoming_emails)
  ) r`))[0].r as Record<string, any>

  const fails: string[] = []
  const mail = (row.mail_select ?? []) as Array<{ name: string; qual: string; roles: string }>
  const emp = (row.emp_select ?? []) as Array<{ name: string; qual: string }>
  const norm = (q: string) => (q ?? '').replace(/\s+/g, ' ')
  if (phase === 'pre') {
    if (mail.length !== 1 || mail[0].name !== 'incoming_emails_select' || norm(mail[0].qual) !== 'true') fails.push(`mail-SELECT ikke som forventet før: ${JSON.stringify(mail)}`)
    if (emp.length !== 1 || emp[0].name !== 'employees_select_admin_or_self' || !/'admin'::text/.test(emp[0].qual) || /serviceleder/.test(emp[0].qual)) fails.push(`employees-SELECT ikke som forventet før: ${JSON.stringify(emp)}`)
    if (row.fn) fails.push('user_can_see_case findes allerede')
  } else {
    if (mail.length !== 1 || mail[0].name !== 'incoming_emails_select') fails.push(`mail: forventede præcis én SELECT-policy: ${JSON.stringify(mail.map((m) => m.name))}`)
    const mq = norm(mail[0]?.qual ?? '')
    for (const need of ["'admin'", "'serviceleder'", "'salg'", "'bogholderi'", "'montør'", 'user_can_see_case(service_case_id)', 'service_case_id IS NOT NULL']) if (!mq.includes(need)) fails.push(`mail-policy mangler ${need}`)
    if (/^true$/.test(mq)) fails.push('mail-policy er stadig true')
    if (emp.length !== 1 || !/serviceleder/.test(emp[0]?.qual ?? '') || !/profile_id = auth\.uid\(\)/.test(norm(emp[0]?.qual ?? ''))) fails.push(`employees-policy: ${JSON.stringify(emp)}`)
    if (!row.fn) fails.push('user_can_see_case mangler')
    else {
      if (!row.fn.definer) fails.push('user_can_see_case er ikke SECURITY DEFINER')
      if (!/search_path/.test(row.fn.config ?? '')) fails.push('user_can_see_case mangler search_path')
      if (row.fn.anon_exec) fails.push('anon kan kalde user_can_see_case')
      if (!row.fn.auth_exec) fails.push('authenticated kan ikke kalde user_can_see_case (policy ville fejle)')
    }
  }
  console.log(JSON.stringify({ phase, mail_policies: mail.map((m) => m.name), emp_policies: emp.map((e) => e.name), fn: row.fn, mails_i_alt: row.mails_i_alt, mails_paa_sager: row.montoer_mails_paa_sager }))
  if (fails.length) { console.log(`❌ ${phase}: ${fails.length} afvigelse(r)\n  - ${fails.join('\n  - ')}`); process.exitCode = 1 }
  else console.log(`✅ ${phase}: som forventet`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
