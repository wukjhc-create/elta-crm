/**
 * PRODUCTION smoke efter 00247 (telefoni-persistens, alle flag FRA) — READ ONLY. Ingen testdata, ingen skrivning.
 *   npx tsx scripts/prod-smoke-00247.ts --since ISO
 * Kører som rigtige brugere (RLS/kolonne-grants via role-probe; aktive admin/montør, og salg/serviceleder hvis de findes):
 *  - de 14 direkte kolonner kan læses; skjulte kolonner, SELECT *, hel-række, filter, sortering og join afvises (42501)
 *  - hændelser/koblinger og funktioner afvises; anon har intet; effektive calls.*-rettigheder pr. rolle
 *  - 0 telefoni-rækker og ingen telefoni-audit; ingen opgaver/tilbageringninger/påmindelser eller udgående rækker siden --since
 *  - webhooken er inaktiv (POST uden hemmelighed → 404 = RELATEL_ENABLED er ikke tændt; alle øvrige flag kræver master-flaget)
 *  - oprydnings-ruten kræver cron-token og står ikke i vercel.json
 * Ingen personværdier ud — kun antal og tjek-resultater.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { withProdReadOnlyRoleProbe, maskDbError } from './prod-readonly'

const PROD_URL = 'https://elta-crm.vercel.app'
const sinceIdx = process.argv.indexOf('--since')
const since = sinceIdx > 0 ? String(process.argv[sinceIdx + 1]) : ''
if (Number.isNaN(Date.parse(since))) throw new Error('kræver --since ISO')

const DIRECT = ['id', 'direction', 'external_number_normalized', 'started_at', 'answered_at', 'ended_at', 'duration_seconds', 'status', 'missed', 'has_voicemail', 'voicemail_duration_seconds', 'employee_profile_id', 'customer_id', 'match_version']
const HIDDEN = ['suggested_customer_id', 'provider_call_id', 'provider_employee_id', 'provider_voicemail_id', 'service_case_id', 'match_status', 'candidate_count', 'match_source', 'matched_by', 'matched_at', 'from_number_normalized', 'to_number_normalized', 'provider', 'created_at', 'updated_at']
const REFUSED: Array<[string, string]> = [
  ...HIDDEN.map((c): [string, string] => [c, `SELECT ${c} FROM telephony_calls`]),
  ['SELECT *', `SELECT * FROM telephony_calls`],
  ['hel række', `SELECT to_jsonb(x) FROM telephony_calls x`],
  ['filter på forslag', `SELECT id FROM telephony_calls WHERE suggested_customer_id IS NOT NULL`],
  ['filter på status', `SELECT id FROM telephony_calls WHERE match_status = 'suggested'`],
  ['sortering på udbyder-id', `SELECT id FROM telephony_calls ORDER BY provider_call_id`],
  ['join via forslag', `SELECT t.id FROM telephony_calls t JOIN customers c ON c.id = t.suggested_customer_id`],
  ['join via sag', `SELECT t.id FROM telephony_calls t JOIN service_cases s ON s.id = t.service_case_id`],
  ['hændelser', `SELECT id FROM telephony_events`],
  ['koblinger', `SELECT provider_employee_id FROM telephony_employee_links`],
  ['ingest-funktion', `SELECT * FROM telephony_ingest_event('relatel', 'smoke', 'smoke', 'call.started', 'canonical', now(), 'inbound', '4511111111', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`],
  ['match-funktion', `SELECT * FROM telephony_set_call_match(gen_random_uuid(), 0, 'reject', NULL, NULL, gen_random_uuid())`],
  ['oprydnings-funktion', `SELECT telephony_purge_unconfirmed()`],
]
// Standardrettigheder (00247). Overrides kan ændre det for enkelte; prod har kun overrides de steder Henrik har sat.
const WANT: Record<string, [boolean, boolean, boolean]> = {
  admin: [true, true, true], serviceleder: [true, true, true], salg: [true, false, true], bogholderi: [false, false, false], 'montør': [false, false, false],
}

withProdReadOnlyRoleProbe('prod-smoke-00247', async (probe, run) => {
  const res: Array<[string, boolean, string]> = []
  const users = await run(`SELECT role, (array_agg(p.id ORDER BY p.created_at))[1]::text AS id FROM profiles p
    WHERE p.is_active AND p.role IN ('admin', 'serviceleder', 'salg', 'bogholderi', 'montør')
      AND NOT EXISTS (SELECT 1 FROM user_permission_overrides o WHERE o.profile_id = p.id AND o.permission LIKE 'calls.%')
    GROUP BY role ORDER BY role`)
  res.push(['aktive admin og montør fundet', users.some((u) => u.role === 'admin') && users.some((u) => u.role === 'montør'), users.map((u) => u.role).join(',')])
  for (const u of users) {
    const direct = await probe(u.id, `SELECT ${DIRECT.join(', ')} FROM telephony_calls LIMIT 1`)
    res.push([`${u.role}: de ${DIRECT.length} direkte kolonner kan læses`, direct.ok, direct.ok ? `${direct.rows.length} rækker` : direct.code])
    const wrong: string[] = []
    for (const [label, sql] of REFUSED) {
      const r = await probe(u.id, sql)
      if (r.ok || r.code !== '42501') wrong.push(`${label}: ${r.ok ? 'TILLADT' : r.code}`)
    }
    res.push([`${u.role}: ${REFUSED.length} skjulte kolonner/filtre/joins/tabeller/funktioner → 42501`, wrong.length === 0, wrong.join('; ')])
    const eff = await probe(u.id, `SELECT public.user_has_permission('calls.view') v, public.user_has_permission('calls.view_unmatched') u, public.user_has_permission('calls.match') m`)
    const want = WANT[String(u.role)]
    res.push([`${u.role}: effektive calls.view/view_unmatched/match = ${want.join('/')}`, eff.ok && eff.rows[0].v === want[0] && eff.rows[0].u === want[1] && eff.rows[0].m === want[2], eff.ok ? `${eff.rows[0].v}/${eff.rows[0].u}/${eff.rows[0].m}` : eff.code])
  }

  const anon = (await run(`SELECT
    has_table_privilege('anon', 'public.telephony_calls', 'SELECT') OR has_any_column_privilege('anon', 'public.telephony_calls', 'SELECT') OR has_any_column_privilege('anon', 'public.telephony_events', 'SELECT') OR has_any_column_privilege('anon', 'public.telephony_employee_links', 'SELECT') a,
    has_any_column_privilege('authenticated', 'public.telephony_events', 'SELECT') OR has_any_column_privilege('authenticated', 'public.telephony_employee_links', 'SELECT') e,
    has_any_column_privilege('authenticated', 'public.telephony_calls', 'INSERT, UPDATE, REFERENCES') w`))[0]
  res.push(['anon: ingen adgang til nogen telefoni-tabel', anon.a === false, ''])
  res.push(['authenticated: intet på hændelser/koblinger; ingen skrive-/reference-kolonner på opkald', anon.e === false && anon.w === false, ''])

  const rows = (await run(`SELECT (SELECT count(*)::int FROM telephony_calls) c, (SELECT count(*)::int FROM telephony_events) e, (SELECT count(*)::int FROM telephony_employee_links) l,
    (SELECT count(*)::int FROM audit_logs WHERE entity_type IN ('telephony_call', 'telephony_employee_link')) a`))[0]
  res.push(['0 opkald, 0 hændelser, 0 koblinger, 0 telefoni-audit', rows.c === 0 && rows.e === 0 && rows.l === 0 && rows.a === 0, JSON.stringify(rows)])
  console.log(`INFO  telephony_calls=${rows.c} telephony_events=${rows.e} telephony_employee_links=${rows.l}`)

  const asst = (await run(`SELECT count(*)::int n, count(*) FILTER (WHERE reminder_at IS NOT NULL)::int r FROM customer_tasks WHERE auto_rule LIKE 'assistant_%' AND created_at >= '${since}'::timestamptz`))[0]
  res.push(['ingen tilbageringnings-/assistentopgaver eller påmindelser siden --since', asst.n === 0 && asst.r === 0, JSON.stringify(asst)])
  // Telefoni-tabellerne er tjekket ovenfor. Øvrige tabeller kan have normal drift: antal vises og vurderes mod normalen.
  const tables = await run(`SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='created_at'
    AND table_name ILIKE ANY (ARRAY['%sms%','%telegram%','%outbox%','%webhook%','%sent_email%','%email_log%','email_messages','email_events','sent_quotes','portal_messages','messages'])
    ORDER BY 1`)
  const fresh: string[] = []
  for (const t of tables) {
    const n = (await run(`SELECT count(*)::int n FROM public."${String(t.table_name).replace(/"/g, '')}" WHERE created_at >= '${since}'::timestamptz`))[0].n as number
    if (n > 0) fresh.push(`${t.table_name}=${n}`)
  }
  res.push([`ingen rækker i ${tables.length} SMS-/Telegram-/udbakke-/webhook-/mail-/portal-/besked-tabeller siden --since`, fresh.length === 0, fresh.join(', ')])

  const post = await fetch(`${PROD_URL}/api/integrations/relatel/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  res.push(['webhook inaktiv: POST uden hemmelighed → 404 (RELATEL_ENABLED ikke tændt; lagring, match, opkald og SMS kræver alle master-flaget)', post.status === 404, `${post.status}`])
  const cron = await fetch(`${PROD_URL}/api/cron/telephony-retention`)
  res.push(['oprydnings-ruten kører ikke uden cron-token (401)', cron.status === 401, `${cron.status}`])
  const vercel = readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')
  res.push(['ingen telefoni-/Relatel-cron i vercel.json', !/telephony|relatel/i.test(vercel), ''])

  for (const [k, ok, note] of res) console.log(`${ok ? 'PASS' : 'FAIL'}  ${k}${note ? ` (${note})` : ''}`)
  const bad = res.filter(([, ok]) => !ok).length
  console.log(bad ? `❌ ${bad} afvigelse(r)` : `✅ ${res.length} smoke-tjek som forventet — read-only`)
  process.exitCode = bad ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
