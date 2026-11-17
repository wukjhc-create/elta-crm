/**
 * 00249 — PRODUCTION kode-smoke EFTER deploy (trin 3/4/9 i docs/runbooks/ELTA_00249_PROD_PREFLIGHT.md). KUN HTTP GET +
 * read-only DB. Ingen login, ingen skrivning, ingen testdata, intet sendes.
 *   npx tsx scripts/prod-00249-code-smoke.ts --expect-commit <sha> [--migration absent|present]
 *  - /upload/<ugyldigt token> svarer med "ikke slået til" (RECEPTION_UPLOAD_LINKS_ENABLED er FRA) og viser ingen kundedata
 *  - /dashboard/henvendelser uden login → login (ingen data)
 *  - deployet commit (Vercel-headere/HTML) = forventet, hvis det kan aflæses
 *  - DB: 00249-tabeller fraværende/til stede som forventet; 0 rækker; ingen conversation-audit; telefoni 0 rækker
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const PROD_URL = 'https://elta-crm.vercel.app'
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? String(process.argv[i + 1] ?? '') : '' }
const expectCommit = arg('--expect-commit')
const migration = arg('--migration') === 'present' ? 'present' : 'absent'

async function main() {
  const res: Array<[string, boolean, string]> = []
  const bad = 'x'.repeat(43)
  const up = await fetch(`${PROD_URL}/upload/${bad}`, { redirect: 'manual' })
  const upText = up.status === 200 ? await up.text() : ''
  res.push(['/upload/<ugyldigt token>: 200 + "Upload via link er ikke slået til" (flag FRA)', up.status === 200 && upText.includes('Upload via link er ikke slået til'), `HTTP ${up.status}`])
  res.push(['/upload: ingen formular når flaget er FRA', !upText.includes('data-testid="upload-input"'), ''])
  const hv = await fetch(`${PROD_URL}/dashboard/henvendelser`, { redirect: 'manual' })
  const loc = hv.headers.get('location') ?? ''
  res.push(['/dashboard/henvendelser uden login → omdirigering til login (ingen data)', [302, 303, 307, 308].includes(hv.status) && /login/i.test(loc), `HTTP ${hv.status} → ${loc.replace(/\?.*$/, '')}`])
  if (expectCommit) {
    const home = await fetch(`${PROD_URL}/login`, { redirect: 'manual' })
    const html = home.status === 200 ? await home.text() : ''
    const hdr = [...home.headers.entries()].map(([k, v]) => `${k}:${v}`).join(' ')
    const seen = html.includes(expectCommit.slice(0, 7)) || hdr.includes(expectCommit.slice(0, 7))
    res.push([`deployet commit ${expectCommit.slice(0, 8)} kan aflæses (ellers bekræft i Vercel-dashboardet)`, true, seen ? 'set i svar' : 'ikke i svar — bekræft i Vercel'])
  }
  await withProdReadOnly('prod-00249-code-smoke', async (run) => {
    const t = (await run(`SELECT count(*)::int n FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN ('conversations','conversation_items','conversation_actions','upload_requests')`))[0].n
    res.push([`00249-tabeller ${migration === 'present' ? 'til stede (4)' : 'fraværende (0)'}`, migration === 'present' ? t === 4 : t === 0, `${t}`])
    if (t === 4) {
      const n = (await run(`SELECT (SELECT count(*) FROM conversations)::int + (SELECT count(*) FROM conversation_items)::int + (SELECT count(*) FROM conversation_actions)::int + (SELECT count(*) FROM upload_requests)::int n`))[0].n
      res.push(['0 rækker i 00249-tabellerne (ingen automatik har kørt)', n === 0, `${n}`])
    }
    const au = (await run(`SELECT count(*)::int n FROM audit_logs WHERE entity_type IN ('conversation','upload_request') OR action LIKE 'ai_receptionist.%'`))[0].n
    res.push(['ingen henvendelses-/upload-/AI-receptionist-audit (intet er kørt automatisk)', au === 0, `${au}`])
    const tel = (await run(`SELECT (SELECT count(*) FROM telephony_calls)::int c, (SELECT count(*) FROM telephony_events)::int e`))[0]
    res.push(['telefoni uændret: 0 opkald/0 hændelser (persistens FRA)', tel.c === 0 && tel.e === 0, JSON.stringify(tel)])
  })
  for (const [id, ok, note] of res) console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${note ? ` — ${note}` : ''}`)
  process.exitCode = res.some((r) => !r[1]) ? 2 : 0
}
main().catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
