/** PRODUCTION read-only (P1): rollefordeling for ikke-inviterede brugere uden medarbejderkobling. Kun antal pr. rolle. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-selfsignup-roles', async (run) => {
  const rows = await run(`SELECT coalesce(p.role, '?') rolle, count(*)::int n, min(u.created_at)::date::text foerste, max(u.created_at)::date::text seneste
    FROM auth.users u LEFT JOIN profiles p ON p.id = u.id
    WHERE u.invited_at IS NULL AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.profile_id = u.id) GROUP BY 1 ORDER BY 1`)
  for (const r of rows) console.log(`${r.rolle}: ${r.n} (oprettet ${r.foerste} – ${r.seneste})`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
