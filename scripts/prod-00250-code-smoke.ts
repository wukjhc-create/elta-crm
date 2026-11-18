/**
 * 00250 — PRODUCTION kode-smoke EFTER deploy (docs/runbooks/ELTA_00250_PROD_PREFLIGHT.md). KUN HTTP-kald uden
 * sideeffekter + read-only DB. Ingen login, ingen testdata, intet sendes.
 *   npx tsx scripts/prod-00250-code-smoke.ts --expect-commit <sha> --since <deploy-ISO> [--migration absent|present]
 *  - POST /api/webchat med TOM krop → 404 (RECEPTION_WEBCHAT_ENABLED FRA eller misbrugsværn ikke konfigureret). En tom
 *    krop opretter intet, heller ikke hvis flaget mod forventning var TIL (så svarer den 400).
 *  - GET /webchat-test → 404 (samme flag)
 *  - GET /api/cron/reception-retention uden Bearer → 401 (og cron står ikke i vercel.json)
 *  - /dashboard/henvendelser uden login → login
 *  - DB: 00250-objekter fraværende/til stede; 0 henvendelser, 0 web-chat-rækker, 0 værn-rækker; ingen henvendelses-audit
 */
import { readFileSync } from 'fs'
import { withProdReadOnly, maskDbError } from './prod-readonly'

const PROD_URL = 'https://elta-crm.vercel.app'
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? String(process.argv[i + 1] ?? '') : '' }
const expectCommit = arg('--expect-commit')
const migration = arg('--migration') === 'present' ? 'present' : 'absent'

async function main() {
  const res: Array<[string, boolean, string]> = []
  const wc = await fetch(`${PROD_URL}/api/webchat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', redirect: 'manual' })
  res.push(['/api/webchat (tom krop) → 404: web-chat FRA i produktion', wc.status === 404, `HTTP ${wc.status}`])
  const wt = await fetch(`${PROD_URL}/webchat-test`, { redirect: 'manual' })
  res.push(['/webchat-test → 404 (ingen test-chat i produktion)', wt.status === 404, `HTTP ${wt.status}`])
  const rr = await fetch(`${PROD_URL}/api/cron/reception-retention`, { redirect: 'manual' })
  res.push(['/api/cron/reception-retention uden Bearer → 401 (intet kørt)', rr.status === 401, `HTTP ${rr.status}`])
  const vercel = readFileSync('vercel.json', 'utf8')
  res.push(['vercel.json: ingen reception-/retention-cron', !/reception/i.test(vercel), ''])
  const hv = await fetch(`${PROD_URL}/dashboard/henvendelser`, { redirect: 'manual' })
  const loc = hv.headers.get('location') ?? ''
  res.push(['/dashboard/henvendelser uden login → login (ingen data)', [302, 303, 307, 308].includes(hv.status) && /login/i.test(loc), `HTTP ${hv.status} → ${loc.replace(/\?.*$/, '')}`])
  if (expectCommit) {
    const home = await fetch(`${PROD_URL}/login`, { redirect: 'manual' })
    const html = home.status === 200 ? await home.text() : ''
    const hdr = [...home.headers.entries()].map(([k, v]) => `${k}:${v}`).join(' ')
    const seen = html.includes(expectCommit.slice(0, 7)) || hdr.includes(expectCommit.slice(0, 7))
    res.push([`deployet commit ${expectCommit.slice(0, 8)} (bekræft i Vercel-dashboardet hvis ikke i svaret)`, true, seen ? 'set i svar' : 'ikke i svar — bekræft i Vercel'])
  }
  await withProdReadOnly('prod-00250-code-smoke', async (run) => {
    const t = (await run(`SELECT count(*)::int n FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('web_chat_sessions','web_chat_messages','web_chat_rate_limits')`))[0].n
    res.push([`00250-tabeller ${migration === 'present' ? 'til stede (3)' : 'fraværende (0)'}`, migration === 'present' ? t === 3 : t === 0, `${t}`])
    // Eksisterende 32 henvendelser (manuelt "Hent nye" 2026-11-18) består; der må ikke komme NYE efter --since
    const sinceIso = arg('--since') && !Number.isNaN(Date.parse(arg('--since'))) ? new Date(arg('--since')).toISOString() : null
    if (sinceIso) {
      const c = (await run(`SELECT (SELECT count(*) FROM conversations WHERE created_at > '${sinceIso}')::int a, (SELECT count(*) FROM conversation_items WHERE created_at > '${sinceIso}')::int b, (SELECT count(*) FROM conversation_actions WHERE created_at > '${sinceIso}')::int c`))[0]
      res.push([`0 nye henvendelser/items/handlinger siden ${sinceIso} (mail-/portal-indtag og backfill FRA)`, c.a + c.b + c.c === 0, JSON.stringify(c)])
    } else res.push(['--since mangler: kan ikke bevise "ingen nye henvendelser"', false, 'giv --since <deploy-tid>'])
    if (t === 3) {
      const w = (await run(`SELECT (SELECT count(*) FROM web_chat_sessions)::int a, (SELECT count(*) FROM web_chat_messages)::int b, (SELECT count(*) FROM web_chat_rate_limits)::int c`))[0]
      res.push(['0 web-chat-/værn-rækker (chat FRA)', w.a + w.b + w.c === 0, JSON.stringify(w)])
    }
    if (sinceIso) {
      const au = (await run(`SELECT count(*)::int n FROM audit_logs WHERE created_at > '${sinceIso}' AND entity_type IN ('conversation','upload_request','reception_retention','incoming_email') AND (action LIKE 'conversation%' OR action LIKE 'reception%')`))[0].n
      res.push(['ingen henvendelses-/afstemnings-/retention-audit siden --since (intet kørt)', au === 0, `${au}`])
    }
    const tel = (await run(`SELECT (SELECT count(*) FROM telephony_calls)::int c, (SELECT count(*) FROM telephony_events)::int e`))[0]
    res.push(['telefoni uændret: 0 opkald/0 hændelser (persistens FRA)', tel.c === 0 && tel.e === 0, JSON.stringify(tel)])
  })
  for (const [id, ok, note] of res) console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${note ? ` — ${note}` : ''}`)
  process.exitCode = res.some((r) => !r[1]) ? 2 : 0
}
main().catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
