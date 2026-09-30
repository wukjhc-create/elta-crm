/**
 * PRODUCTION read-only pre-/post-check for 00169 (samlet afvisning af kundens egne mails i leverandoerfaktura-koeen, IC13).
 *   npx tsx scripts/prod-precheck-00169.ts pre|post
 * pre:  triggere (sideeffekter) + praecis de 18 forventede raekker matcher reglen.
 * post: de 18 er rejected med IC13-grund + audit; mails/vedhaeftninger urorte; ingen andre fakturaer aendret.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { PREVIEW_SQL } from './prod-preview-customer-mail-invoices'
import { IC13_REJECT_IDS } from './ic13-reject-ids'

const mode = process.argv[2] === 'post' ? 'post' : 'pre'
const problems: string[] = []
const expect = (cond: boolean, label: string) => { console.log(`  ${cond ? '✓' : '❌'} ${label}`); if (!cond) problems.push(label) }
const idList = IC13_REJECT_IDS.map((id) => `'${id}'`).join(',')

withProdReadOnly('prod-check-00169', async (run, masked) => {
  console.log(`--- 00169 ${mode} @ prod:${masked} ---`)
  if (mode === 'pre') {
    const trg = (await run(`SELECT tgname FROM pg_trigger WHERE tgrelid='public.incoming_invoices'::regclass AND NOT tgisinternal`)) as Array<{ tgname: string }>
    expect(trg.length === 1 && trg[0].tgname === 'trg_incoming_invoices_updated_at', `kun updated_at-trigger (ingen sideeffekter): ${trg.map((t) => t.tgname).join(', ')}`)
    const rows = (await run(PREVIEW_SQL)) as Array<{ id: string; intern_afsender: boolean; linjer: number }>
    const target = rows.filter((r) => !r.intern_afsender).map((r) => r.id).sort()
    const expected = [...IC13_REJECT_IDS].sort()
    expect(target.length === 18 && target.every((id, i) => id === expected[i]), `præcis de 18 preview-rækker matcher reglen (${target.length})`)
    expect(rows.filter((r) => !r.intern_afsender).every((r) => r.linjer === 0), 'målrækker har 0 fakturalinjer')
  } else {
    const r = (await run(`SELECT count(*) FILTER (WHERE status='rejected' AND rejected_reason LIKE 'IC13:%' AND rejected_at IS NOT NULL)::int afvist,
        count(*)::int i_alt FROM incoming_invoices WHERE id IN (${idList})`))[0]
    expect(r.afvist === 18 && r.i_alt === 18, `18/18 afvist med IC13-grund (${r.afvist}/${r.i_alt})`)
    const a = (await run(`SELECT count(DISTINCT incoming_invoice_id)::int n FROM incoming_invoice_audit_log WHERE action='rejected' AND message LIKE 'IC13:%' AND incoming_invoice_id IN (${idList})`))[0].n
    expect(a === 18, `audit-spor for alle 18 (${a})`)
    const mails = (await run(`SELECT count(*)::int n FROM incoming_emails e JOIN incoming_invoices i ON i.source_email_id = e.id WHERE i.id IN (${idList})`))[0].n
    expect(mails === 18, `originale mails bevaret (${mails}/18)`)
    const raw = (await run(`SELECT count(*)::int n FROM incoming_invoices WHERE id IN (${idList}) AND raw_text IS NOT NULL`))[0].n
    expect(raw === 18, `rå tekst/dokumentation bevaret (${raw}/18)`)
    const others = (await run(`SELECT count(*)::int n FROM incoming_invoices WHERE rejected_reason LIKE 'IC13:%' AND id NOT IN (${idList})`))[0].n
    expect(others === 0, `ingen andre fakturaer ramt (${others})`)
    const fin = (await run(`SELECT count(*) FILTER (WHERE status='posted')::int posted, count(*) FILTER (WHERE external_invoice_id IS NOT NULL)::int ekstern FROM incoming_invoices`))[0]
    expect(fin.posted === 0 && fin.ekstern === 0, `ingen e-conomic-bogføring (${JSON.stringify(fin)})`)
    console.log('  kø nu:', JSON.stringify(await run(`SELECT status, parse_status, count(*)::int n FROM incoming_invoices WHERE source='email' GROUP BY 1,2 ORDER BY 1,2`)))
  }
}).then(() => {
  console.log(problems.length ? `\n❌ ${problems.length} afvigelse(r) — STOP` : '\n✅ som forventet')
  process.exitCode = problems.length ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
