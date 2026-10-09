/**
 * PRODUCTION read-only: rolle-tjek for 00209 SOM rigtige prod-brugere (SET LOCAL ROLE authenticated + JWT, READ ONLY,
 * rulles tilbage). Ingen rolle må se objekter i attachments / service-case-files / portal-attachments via
 * storage.objects (det storage-API'et bruger), og ingen authenticated-politik på storage.objects må give INSERT/UPDATE
 * på de tre buckets. Kun antal.   npx tsx scripts/prod-role-check-00209.ts [pre|post]
 */
import { withProdReadOnlyRoleProbe, maskDbError } from './prod-readonly'

const mode = process.argv[2] === 'pre' ? 'pre' : 'post'
const BUCKETS = ['attachments', 'service-case-files', 'portal-attachments']

withProdReadOnlyRoleProbe('prod-role-check-00209', async (probe, run) => {
  const users = await run(`SELECT p.role, (array_agg(p.id ORDER BY p.created_at))[1]::text AS id FROM profiles p
    WHERE p.is_active AND p.role IN ('admin', 'montør', 'salg', 'serviceleder', 'bogholderi') GROUP BY p.role ORDER BY p.role`)
  const total = await run(`SELECT bucket_id, count(*)::int n FROM storage.objects WHERE bucket_id IN ('${BUCKETS.join("','")}') GROUP BY 1 ORDER BY 1`)
  console.log(`objekter i alt (service): ${JSON.stringify(total)}`)
  const res: Array<[string, boolean, string]> = []
  for (const u of users as Array<{ role: string; id: string }>) {
    const sel = await probe(u.id, `SELECT bucket_id, count(*)::int n FROM storage.objects WHERE bucket_id IN ('${BUCKETS.join("','")}') GROUP BY 1`)
    const seen = sel.ok ? (sel.rows as Array<{ bucket_id: string; n: number }>).reduce((a, r) => a + r.n, 0) : -1
    // pre: forventet at ALLE kan se (fundet); post: ingen
    const ok = sel.ok && (mode === 'pre' ? seen > 0 : seen === 0)
    res.push([`${u.role}: synlige storage-objekter i de tre buckets ${mode === 'pre' ? '(pre: forventet > 0 — fundet)' : '(post: forventet 0)'}`, ok, sel.ok ? `${seen}` : (sel as { code: string }).code])
  }
  const pols = await run(`SELECT policyname, cmd FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
    AND ('authenticated' = ANY (roles) OR 'public' = ANY (roles))
    AND (coalesce(qual, '') ~ '(attachments|service-case-files|portal-attachments)' OR coalesce(with_check, '') ~ '(attachments|service-case-files|portal-attachments)')`)
  const n = (pols as unknown[]).length
  res.push([`authenticated-politikker på de tre buckets ${mode === 'pre' ? '(pre: 7 forventet)' : '(post: 0 forventet)'}`, mode === 'pre' ? n === 7 : n === 0, `${n}: ${(pols as Array<{ policyname: string }>).map((p) => p.policyname).join(', ')}`])
  for (const [k, v, note] of res) console.log(`${v ? 'OK  ' : 'AFV '} ${k}  (${note})`)
  const bad = res.filter(([, v]) => !v).length
  console.log(bad ? `❌ ${bad} afvigelse(r)` : `✅ ${res.length} tjek som forventet (${mode})`)
  process.exitCode = bad ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
