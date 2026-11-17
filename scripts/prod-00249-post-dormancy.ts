/**
 * 00249 — read-only dormancy-tjek EFTER permanent anvendelse. Kun tællinger ud (ingen id'er/indhold).
 *   npx tsx scripts/prod-00249-post-dormancy.ts --since ISO
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const i = process.argv.indexOf('--since')
const since = i > 0 ? String(process.argv[i + 1]) : ''
if (Number.isNaN(Date.parse(since))) throw new Error('kræver --since ISO')
const iso = new Date(since).toISOString()
const T = `('conversations','conversation_items','conversation_actions','upload_requests')`

withProdReadOnly('prod-00249-post-dormancy', async (run) => {
  const r = (await run(`SELECT
    (SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename IN ${T}) pol,
    (SELECT count(*)::int FROM pg_indexes WHERE schemaname='public' AND tablename IN ${T}) idx,
    (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace='public'::regnamespace AND c.relname IN ${T}) trg,
    (SELECT count(*)::int FROM role_permission_defaults WHERE role='montør' AND permission LIKE 'conversations.%') montor_defaults,
    (SELECT count(*)::int FROM customers WHERE created_at > '${iso}'::timestamptz) new_customers,
    (SELECT count(*)::int FROM service_cases WHERE created_at > '${iso}'::timestamptz) new_cases,
    (SELECT count(*)::int FROM customer_tasks WHERE created_at > '${iso}'::timestamptz) new_tasks,
    (SELECT count(*)::int FROM sms_messages WHERE created_at > '${iso}'::timestamptz) new_sms,
    (SELECT count(*)::int FROM audit_logs WHERE created_at > '${iso}'::timestamptz AND (entity_type IN ('conversation','upload_request','conversation_action') OR action ILIKE '%receptionist%' OR action ILIKE 'reception%')) recep_audit`))[0]
  const res: Array<[string, boolean, string]> = [
    ['politikker/indeks/triggere på de 4 tabeller findes', r.pol > 0 && r.idx > 0 && r.trg > 0, `pol=${r.pol} idx=${r.idx} trg=${r.trg}`],
    ['ingen montør-standard for conversations.*', r.montor_defaults === 0, `${r.montor_defaults}`],
    ['ingen kunder oprettet siden deploy', r.new_customers === 0, `${r.new_customers}`],
    ['ingen sager oprettet siden deploy', r.new_cases === 0, `${r.new_cases}`],
    ['ingen opgaver oprettet siden deploy', r.new_tasks === 0, `${r.new_tasks}`],
    ['ingen SMS-rækker siden deploy', r.new_sms === 0, `${r.new_sms}`],
    ['ingen receptionist-/henvendelses-audit siden deploy', r.recep_audit === 0, `${r.recep_audit}`],
  ]
  for (const [id, ok, note] of res) console.log(`${ok ? 'PASS' : 'FAIL'}  ${id} — ${note}`)
  process.exitCode = res.some((x) => !x[1]) ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
