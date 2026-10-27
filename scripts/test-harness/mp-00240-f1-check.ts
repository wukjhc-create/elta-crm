/**
 * MP-00240 F1/O4/L1 (staging, app-laget) — faktura-scope + dokument-læseregel (Henrik 2026-10-27):
 *   F  invoices.view.all → alt; invoices.view.own_cases → kun fakturaer på sager i EFFEKTIVT sags-scope (D4 inkl.);
 *      sagsløse fakturaer kun ved view.all; montør (ingen fakturanøgle) → intet. RLS (can_view_case_finance) skærer i dag
 *      salg ned til created_by — derfor læses efter scope-tjekket med admin-klienten (dokumenteres her).
 *   L  customerDocumentReadDenied: sag i scope / CU-1 for sagsløse / mail-vedhæftning kræver customers.emails.view
 * Genbruger setup240-fixtures; rydder alt op.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeEffectivePermissions } from '../../src/lib/auth/effective-permissions'
import type { Permission } from '../../src/lib/auth/permissions'
import { setup240, type M240Check } from './mp-00240-scope-check'

export async function runMp00240F1Check(c: { admin: SupabaseClient; url: string; anonKey: string }): Promise<M240Check[]> {
  const out: M240Check[] = []
  const add = (id: string, ok: boolean, note = '') => out.push({ id, ok, note })
  const { invoiceCaseScope, canViewCaseInvoices, invoiceInScope } = await import('../../src/lib/invoices/invoice-scope')
  const { customerDocumentReadDenied } = await import('../../src/lib/documents/document-read-access')
  const { fx, cleanup } = await setup240(c)
  const invoices: string[] = []
  const ctxFor = (role: string, uid: string, cl: SupabaseClient, perms: ReadonlySet<Permission>) =>
    ({ role: role as never, userId: uid, supabase: cl, hasPermission: (p: Permission) => perms.has(p) })
  try {
    const mkInv = async (caseId: string | null, n: number) => {
      const { data, error } = await c.admin.from('invoices').insert({ invoice_number: `HARN-F1-${fx.stamp}-${n}`, case_id: caseId, customer_id: fx.cust.salgCase, status: 'sent', total_amount: 100, tax_amount: 25, final_amount: 125 }).select('id').single()
      if (error) throw new Error(`invoice: ${error.message}`)
      invoices.push(data.id); return data.id as string
    }
    const invD4 = await mkInv(fx.cases.salgD4, 1)
    await mkInv(fx.cases.hidden, 2)
    await mkInv(null, 3)

    // ---- F: salg
    const salg = ctxFor('salg', fx.s.uid, fx.s.cl, computeEffectivePermissions('salg', []))
    const sc = await invoiceCaseScope(salg)
    add('F salg: faktura-scope = sager i effektivt scope (ikke all)', sc.type === 'cases' && sc.caseIds.includes(fx.cases.salgD4) && !sc.caseIds.includes(fx.cases.hidden), sc.type)
    add('F salg: D4-sag (konverteret fra eget tilbud) → fakturaer synlige', await canViewCaseInvoices(fx.cases.salgD4, salg))
    add('F salg: urelateret sag → ingen fakturaer', !(await canViewCaseInvoices(fx.cases.hidden, salg)))
    add('F salg: sagsløs faktura uden for scope', !invoiceInScope(sc, null))
    {
      const { data: viaRls } = await fx.s.cl.from('invoices').select('id').eq('id', invD4).maybeSingle()
      add('F (dokumentation) RLS i dag skjuler D4-fakturaen for salg → admin-læsning efter scope-tjek er nødvendig', !viaRls)
    }
    // salg uden own_cases (REVOKE) → intet
    {
      const rev = ctxFor('salg', fx.s.uid, fx.s.cl, computeEffectivePermissions('salg', [{ permission: 'invoices.view.own_cases', effect: 'revoke' }]))
      add('F salg med REVOKE invoices.view.own_cases → ingen fakturaer', (await invoiceCaseScope(rev)).type === 'none' && !(await canViewCaseInvoices(fx.cases.salgD4, rev)))
    }
    // ---- F: montør / bogholderi / admin
    const montor = ctxFor('montør', fx.m.uid, fx.m.cl, computeEffectivePermissions('montør', []))
    add('F montør: ingen fakturanøgle → scope none, heller ikke egne sager', (await invoiceCaseScope(montor)).type === 'none' && !(await canViewCaseInvoices(fx.cases.wo, montor)))
    const bog = ctxFor('bogholderi', fx.m.uid, fx.m.cl, computeEffectivePermissions('bogholderi', []))
    add('F bogholderi: all (inkl. sagsløse)', (await invoiceCaseScope(bog)).type === 'all' && invoiceInScope({ type: 'all' }, null))
    {
      const g = ctxFor('montør', fx.m.uid, fx.m.cl, computeEffectivePermissions('montør', [{ permission: 'invoices.view.own_cases', effect: 'grant' }]))
      const s2 = await invoiceCaseScope(g)
      add('F montør + GRANT own_cases: kun egne/relaterede sager (ikke salgs D4, ikke urelateret)', s2.type === 'cases' && s2.caseIds.includes(fx.cases.wo) && !s2.caseIds.includes(fx.cases.salgD4) && !s2.caseIds.includes(fx.cases.hidden))
    }

    // ---- L: dokument-læseregel
    add('L montør: dokument på sag i scope → tilladt', (await customerDocumentReadDenied({ service_case_id: fx.cases.wo, customer_id: fx.cust.caseCust }, montor)) === null)
    add('L montør: dokument på anden sag (samme kunde-id ligegyldigt) → afvist', (await customerDocumentReadDenied({ service_case_id: fx.cases.hidden, customer_id: fx.cust.caseCust }, montor)) !== null)
    add('L montør: sagsløst dokument, kunden har sag i scope (CU-1) → tilladt', (await customerDocumentReadDenied({ service_case_id: null, customer_id: fx.cust.caseCust }, montor)) === null)
    add('L montør: sagsløst dokument på urelateret kunde → afvist', (await customerDocumentReadDenied({ service_case_id: null, customer_id: fx.cust.hidden }, montor)) !== null)
    add('L montør: sagsløst dokument uden kunde → afvist (fail-closed)', (await customerDocumentReadDenied({ service_case_id: null, customer_id: null }, montor)) !== null)
    add('L montør: mail-vedhæftning → afvist (kræver customers.emails.view)', (await customerDocumentReadDenied({ service_case_id: fx.cases.wo, customer_id: fx.cust.caseCust, source_email_id: '00000000-0000-0000-0000-000000000001' }, montor)) !== null)
    add('L salg: sagsløst dokument (customers.edit) → tilladt; sagsdokument uden for scope → afvist',
      (await customerDocumentReadDenied({ service_case_id: null, customer_id: fx.cust.hidden }, salg)) === null
      && (await customerDocumentReadDenied({ service_case_id: fx.cases.hidden, customer_id: fx.cust.hidden }, salg)) !== null)
  } catch (e) {
    add('kørsel uden undtagelse', false, e instanceof Error ? e.message : String(e))
  } finally {
    if (invoices.length) await c.admin.from('invoices').delete().in('id', invoices)
    const { count: invLeft } = await c.admin.from('invoices').select('id', { count: 'exact', head: true }).like('invoice_number', `HARN-F1-${fx.stamp}-%`)
    const left = await cleanup()
    out.push({ id: 'oprydning: ingen testfakturaer/-kunder tilbage', ok: left === 0 && (invLeft ?? 0) === 0, note: `kunder=${left} fakturaer=${invLeft}` })
  }
  return out
}
