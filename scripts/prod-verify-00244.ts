/**
 * PRODUCTION read-only (2026-11-02): 00244 (offers.case_type) — kolonne/CHECK + fingeraftryk af ALLE tilbud og sager.
 *   npx tsx scripts/prod-verify-00244.ts pre|post
 * Fingeraftrykket udelader kun den nye kolonne (updated_at er MED: ADD COLUMN må ikke røre en eneste række).
 * Ingen personværdier ud — kun antal, md5 og typefordeling. Exit 2 hvis post-tilstanden afviger fra det forventede.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const mode = process.argv[2] === 'post' ? 'post' : 'pre'

withProdReadOnly(`prod-verify-00244-${mode}`, async (run, ref) => {
  const col = await run(`SELECT data_type, is_nullable, column_default FROM information_schema.columns
    WHERE table_schema='public' AND table_name='offers' AND column_name='case_type'`)
  const chk = await run(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid='public.offers'::regclass AND conname='offers_case_type_check'`)
  const fp = (await run(`SELECT
    (SELECT count(*)::int FROM offers) AS offers,
    (SELECT md5(coalesce(string_agg((to_jsonb(o) - 'case_type')::text, '|' ORDER BY o.id), '')) FROM offers o) AS offers_md5,
    (SELECT count(*)::int FROM offers WHERE ${col.length ? 'case_type IS NOT NULL' : 'false'}) AS offers_with_type,
    (SELECT max(updated_at)::text FROM offers) AS offers_max_updated,
    (SELECT count(*)::int FROM service_cases) AS cases,
    (SELECT md5(coalesce(string_agg(to_jsonb(c)::text, '|' ORDER BY c.id), '')) FROM service_cases c) AS cases_md5,
    (SELECT max(updated_at)::text FROM service_cases) AS cases_max_updated,
    (SELECT json_object_agg(t, n) FROM (SELECT coalesce(type, '(null)') t, count(*)::int n FROM service_cases GROUP BY 1) x) AS case_types`))[0]
  console.log(`prod:${ref} ${mode}`)
  console.log(JSON.stringify({ column: col[0] ?? null, check: chk[0]?.def ?? null, ...fp }, null, 2))

  if (mode === 'post') {
    const problems: string[] = []
    const c = col[0]
    if (!c) problems.push('kolonnen offers.case_type mangler')
    else {
      if (c.data_type !== 'text') problems.push(`data_type=${c.data_type}`)
      if (c.is_nullable !== 'YES') problems.push('ikke nullable')
      if (c.column_default !== null) problems.push('har default')
    }
    const def = String(chk[0]?.def ?? '')
    if (!def.includes("'solar'") || !def.includes("'installation'") || !/IS NULL/i.test(def)) problems.push(`CHECK uventet: ${def || '(mangler)'}`)
    if (fp.offers_with_type !== 0) problems.push(`${fp.offers_with_type} tilbud har fået en type`)
    console.log(problems.length ? `❌ ${problems.join('; ')}` : '✅ skema som forventet; sammenlign fingeraftryk med pre')
    process.exitCode = problems.length ? 2 : 0
  }
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
