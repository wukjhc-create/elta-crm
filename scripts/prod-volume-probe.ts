/**
 * PRODUCTION read-only (PF2, performance-review 2026-10-17): datamængder der afgør, hvor tæt crons/sider er på
 * grænserne. Kun antal.
 *   npx tsx scripts/prod-volume-probe.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-volume-probe', async (run, masked) => {
  const q = async (label: string, sql: string) => {
    const r = (await run(sql).catch((e) => [{ n: `fejl: ${maskDbError(e)}` }])) as Array<{ n: unknown }>
    return `${label}=${r[0]?.n}`
  }
  const out = [
    await q('bank_tx_total', `SELECT count(*)::int n FROM public.bank_transactions`),
    await q('bank_tx_ikke_matchet_ind', `SELECT count(*)::int n FROM public.bank_transactions WHERE amount > 0 AND matched_invoice_id IS NULL`),
    await q('incoming_emails', `SELECT count(*)::int n FROM public.incoming_emails`),
    await q('mails_72t_med_bilag', `SELECT count(*)::int n FROM public.incoming_emails WHERE has_attachments AND received_at > now() - interval '72 hours'`),
    await q('time_logs', `SELECT count(*)::int n FROM public.time_logs`),
    await q('case_materials_max_pr_sag', `SELECT coalesce(max(c),0)::int n FROM (SELECT count(*) c FROM public.case_materials GROUP BY case_id) x`),
    await q('aktive_tilbud', `SELECT count(*)::int n FROM public.offers WHERE status IN ('draft','sent','viewed')`),
    await q('besigtigelse_opgaver', `SELECT count(*)::int n FROM public.customer_tasks WHERE title ILIKE '%esigtigelse%'`),
    await q('sync_logs_uden_slut', `SELECT count(*)::int n FROM public.supplier_sync_logs WHERE completed_at IS NULL`),
  ]
  console.log(`prod:${masked} ${out.join(' · ')}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
