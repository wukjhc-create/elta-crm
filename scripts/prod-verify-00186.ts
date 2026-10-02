/**
 * PRODUCTION read-only: verifikation af 00186 (D28 — bogholderi kun kunde-/fakturamails).
 *   npx tsx scripts/prod-verify-00186.ts pre   — forventet før: 00180-policyen (bogholderi i rollelisten = alle mails)
 *   npx tsx scripts/prod-verify-00186.ts post  — forventet efter: bogholderi-klausul (customer_id / incoming_invoices)
 * Kræver at 00180 er kørt først. Viser også hvor mange mails bogholderi ser før/efter. Én SELECT pr. kald.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const phase = process.argv[2]
if (phase !== 'pre' && phase !== 'post') { console.error('brug: pre|post'); process.exit(2) }

withProdReadOnly(`prod-verify-00186 ${phase}`, async (run) => {
  const row = (await run(`SELECT json_build_object(
    'mail_select', (SELECT json_agg(json_build_object('name', policyname, 'qual', qual)) FROM pg_policies WHERE schemaname='public' AND tablename='incoming_emails' AND cmd='SELECT'),
    'mails_i_alt', (SELECT count(*)::int FROM incoming_emails),
    'kunde_koblede', (SELECT count(*)::int FROM incoming_emails WHERE customer_id IS NOT NULL),
    'fakturakilder', (SELECT count(*)::int FROM incoming_emails e WHERE e.customer_id IS NULL AND EXISTS (SELECT 1 FROM incoming_invoices ii WHERE ii.source_email_id = e.id))
  ) r`))[0].r as Record<string, any>

  const fails: string[] = []
  const mail = (row.mail_select ?? []) as Array<{ name: string; qual: string }>
  const q = (mail[0]?.qual ?? '').replace(/\s+/g, ' ')
  if (mail.length !== 1 || mail[0].name !== 'incoming_emails_select') fails.push(`forventede præcis én SELECT-policy: ${JSON.stringify(mail.map((m) => m.name))}`)
  if (phase === 'pre') {
    if (q === 'true') fails.push('00180 er ikke kørt endnu (policy = true) — kør 00180 først')
    else if (!q.includes("'bogholderi'") || q.includes('incoming_invoices')) fails.push(`policy er ikke 00180-versionen: ${q.slice(0, 200)}`)
  } else {
    for (const need of ["'admin'", "'serviceleder'", "'salg'", "'bogholderi'", 'customer_id IS NOT NULL', 'incoming_invoices', 'source_email_id', 'user_can_see_case(service_case_id)']) {
      if (!q.includes(need)) fails.push(`policy mangler ${need}`)
    }
    // bogholderi må ikke længere stå i den ubetingede rolleliste
    const unconditional = /user_role\(\)\s*=\s*ANY\s*\(ARRAY\[([^\]]*)\]/.exec(q)?.[1] ?? ''
    if (unconditional.includes('bogholderi')) fails.push('bogholderi står stadig i den ubetingede rolleliste')
  }
  const after = Number(row.kunde_koblede) + Number(row.fakturakilder)
  console.log(JSON.stringify({ phase, policy: mail.map((m) => m.name), mails_i_alt: row.mails_i_alt, bogholderi_efter_00186: after, kunde_koblede: row.kunde_koblede, fakturakilder: row.fakturakilder }))
  if (fails.length) { console.log(`❌ ${phase}: ${fails.length} afvigelse(r)\n  - ${fails.join('\n  - ')}`); process.exitCode = 1 }
  else console.log(`✅ ${phase}: som forventet`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
