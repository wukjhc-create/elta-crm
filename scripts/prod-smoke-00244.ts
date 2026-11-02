/**
 * PRODUCTION smoke efter 00244 + deploy (2026-11-02) — READ ONLY (én READ ONLY-transaktion, rulles altid tilbage).
 *   npx tsx scripts/prod-smoke-00244.ts [--since ISO]
 * Tjekker det de nye kodestier læser, som rigtige brugere (RLS via role-probe), uden at oprette eller ændre noget:
 *   tilbudslisten/-detaljen kan læse case_type for admin og salg · historiske tilbud er NULL → sagstype installation og
 *   forhåndsvisning "ikke valgt" · PostgREST genindlæser skemaet ved DDL · ingen nye rækker i mail-/e-conomic-/sync-/
 *   webhook-/notifikationstabeller siden --since (default: lige før prod-migrationen).
 * Ingen personværdier ud — kun antal og tjek-resultater.
 */
import { withProdReadOnlyRoleProbe, maskDbError } from './prod-readonly'
import { serviceCaseTypeForOffer, offerCaseTypePreviewLabel } from '../src/lib/offers/case-type'

const sinceIdx = process.argv.indexOf('--since')
const since = sinceIdx > 0 ? String(process.argv[sinceIdx + 1]) : '2026-11-02T05:30:00+01:00'
if (Number.isNaN(Date.parse(since))) throw new Error('ugyldig --since')

withProdReadOnlyRoleProbe('prod-smoke-00244', async (probe, run) => {
  const res: Array<[string, boolean, string]> = []
  const users = await run(`SELECT role, (array_agg(id ORDER BY created_at))[1]::text AS id FROM profiles
    WHERE is_active AND role IN ('admin', 'salg') GROUP BY role`)
  const total = (await run(`SELECT count(*)::int n FROM offers`))[0].n as number
  for (const u of users) {
    // samme kolonner som tilbudslisten/-detaljen (select * inkl. case_type) og tilbud→sag-forhåndsvisningen
    const r = await probe(u.id, `SELECT id, status, case_type, converted_case_id FROM offers`)
    if (!r.ok) { res.push([`${u.role}: læs offers inkl. case_type`, false, r.code]); continue }
    res.push([`${u.role}: læs offers inkl. case_type (RLS)`, r.rows.length > 0, `${r.rows.length}/${total} synlige`])
    res.push([`${u.role}: alle synlige tilbud har case_type NULL`, r.rows.every((o) => o.case_type === null), ''])
  }
  const nulls = await run(`SELECT case_type FROM offers WHERE case_type IS NULL`)
  const mapped = nulls.map((o) => serviceCaseTypeForOffer(o.case_type))
  res.push(['historiske tilbud (NULL) → sag installation', nulls.length === total && mapped.every((t) => t === 'installation'), `${nulls.length}`])
  res.push(['forhåndsvisning for NULL siger "ikke valgt"', /ikke valgt/.test(offerCaseTypePreviewLabel(null)), offerCaseTypePreviewLabel(null)])
  const evt = await run(`SELECT evtname FROM pg_event_trigger WHERE evtname ILIKE 'pgrst%' AND evtenabled <> 'D'`)
  res.push(['PostgREST skema-genindlæsning ved DDL aktiv', evt.length > 0, evt.map((e) => e.evtname).join(',')])

  const tables = await run(`SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='created_at'
    AND table_name ILIKE ANY (ARRAY['%email%','%mail%','%economic%','%sms%','%outbox%','%notification%','%sync%','%webhook%','%portal_message%','service_cases','offers','customers'])
    ORDER BY 1`)
  const fresh: string[] = []
  for (const t of tables) {
    const n = (await run(`SELECT count(*)::int n FROM public."${String(t.table_name).replace(/"/g, '')}" WHERE created_at >= '${since}'::timestamptz`))[0].n as number
    if (n > 0) fresh.push(`${t.table_name}=${n}`)
  }
  res.push([`ingen nye rækker i ${tables.length} mail-/e-conomic-/sync-/kunde-/tilbud-/sagstabeller siden ${since}`, fresh.length === 0, fresh.join(', ')])

  for (const [k, ok, note] of res) console.log(`${ok ? 'PASS' : 'FAIL'}  ${k}${note ? ` (${note})` : ''}`)
  const bad = res.filter(([, ok]) => !ok).length
  console.log(bad ? `❌ ${bad} afvigelse(r)` : `✅ ${res.length} smoke-tjek som forventet — read-only`)
  process.exitCode = bad ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
