import { Metadata } from 'next'
import Link from 'next/link'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'
import { loadFinanceDesk } from '@/lib/actions/finance-position'
import { formatCurrency } from '@/lib/utils/format'
import type { Money } from '@/lib/finance/position'

export const metadata: Metadata = {
  title: 'Likviditet',
  description: 'Tilgodehavender, leverandørfakturaer og likviditet',
}

export const dynamic = 'force-dynamic'

function moneyText(value: Money): string {
  return value.state === 'known' ? formatCurrency(value.amount, 'DKK', 2) : 'Ukendt'
}

export default async function FinancePage() {
  if (!(await pageHasPermission('economy.view'))) {
    return <NoAccess permission="economy.view" />
  }
  const desk = await loadFinanceDesk()
  if (!desk.ok) {
    return <div className="p-6 text-sm text-red-900">{desk.message}</div>
  }
  const { position } = desk
  const invoiceRows = position.invoices.filter((row) => row.currency === 'DKK' && row.overdueDays != null)

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Likviditet</h1>
        <p className="mt-1 text-sm text-gray-600">
          Tilgodehavender følger den samme åbne saldo som fakturaoversigten. Der skrives ikke til e-conomic, og intet godkendes eller betales her.
        </p>
        {desk.seesInvoices && !desk.scopeAll && (
          <p className="mt-1 text-sm text-gray-600">Du ser kun fakturaer på sager i dit scope. Det er ikke hele firmaets tilgodehavende.</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-md ring-1 ring-gray-200 p-4">
          <h2 className="text-sm font-medium text-gray-800">Tilgodehavender i DKK</h2>
          <p className="mt-2 text-2xl text-gray-900">{desk.seesInvoices ? moneyText(position.receivables) : 'Skjult'}</p>
          {desk.seesInvoices && position.receivables.state === 'known' && (
            <p className="mt-1 text-xs text-gray-500">{position.openCount} åbne fakturaer. Beløb under 0,50 kr tælles med her, men ikke som forfaldne.</p>
          )}
          {desk.seesInvoices && position.receivables.state === 'unknown' && (
            <p className="mt-1 text-xs text-gray-500">Et beløb manglede, eller fakturaerne kunne ikke læses. Totalen er ikke 0.</p>
          )}
          {desk.scopeAll && (
            <Link href="/dashboard/invoices" className="mt-2 inline-block text-sm text-blue-700 hover:underline">Åbn fakturaer</Link>
          )}
        </section>

        <section className="rounded-md ring-1 ring-gray-200 p-4">
          <h2 className="text-sm font-medium text-gray-800">Forfaldne debitorer</h2>
          <p className="mt-2 text-2xl text-gray-900">{desk.seesInvoices ? moneyText(position.overdueAmount) : 'Skjult'}</p>
          {desk.seesInvoices && position.overdueAmount.state === 'known' && (
            <p className="mt-1 text-xs text-gray-500">{position.overdueCount} fakturaer over 0,50 kr med forfald før i dag.</p>
          )}
        </section>

        <section className="rounded-md ring-1 ring-gray-200 p-4">
          <h2 className="text-sm font-medium text-gray-800">Leverandørfakturaer</h2>
          {!desk.seesPayables && <p className="mt-2 text-2xl text-gray-900">Skjult</p>}
          {desk.seesPayables && (
            <>
              <p className="mt-2 text-2xl text-gray-900">{moneyText(position.payableInvoiceTotal)}</p>
              <p className="mt-1 text-xs text-gray-500">
                Godkendte og bogførte fakturaer i DKK. CRM gemmer ikke restbetaling, så tallet er fakturabeløbet og ikke en kendt rest.
              </p>
            </>
          )}
          {desk.seesPayables && (
            <Link href="/dashboard/incoming-invoices" className="mt-2 inline-block text-sm text-blue-700 hover:underline">Åbn leverandørfakturaer</Link>
          )}
        </section>

        <section className="rounded-md ring-1 ring-gray-200 p-4">
          <h2 className="text-sm font-medium text-gray-800">Bank og e-conomic</h2>
          {desk.bank.visible ? (
            <p className="mt-2 text-sm text-gray-800">
              Umatchede bankbevægelser: {desk.bank.unmatched == null ? 'Ukendt' : desk.bank.unmatched}
            </p>
          ) : (
            <p className="mt-2 text-sm text-gray-500">Bank er skjult.</p>
          )}
          <p className="mt-1 text-xs text-gray-500">Banktabellen er bevægelser uden primosaldo. Den er ikke en kassebeholdning.</p>
          {desk.bank.visible && (
            <Link href="/dashboard/bank" className="mt-2 inline-block text-sm text-blue-700 hover:underline">Åbn bankafstemning</Link>
          )}
          {desk.economic.visible && desk.economic.state === 'known' && (
            <p className="mt-3 text-sm text-gray-800">
              e-conomic konto {desk.economic.account}: {formatCurrency(desk.economic.amount, 'DKK', 2)}
            </p>
          )}
          {desk.economic.visible && desk.economic.state !== 'known' && (
            <p className="mt-3 text-sm text-gray-800">{desk.economic.message}</p>
          )}
        </section>
      </div>

      <section>
        <h2 className="text-sm font-medium text-gray-800">Indbetalinger og leverandørfakturaer, 30 / 60 / 90 dage</h2>
        <p className="mt-1 text-xs text-gray-500">Indbetalingen er kendt rest i DKK. Leverandørkolonnen er fakturabeløb uden betalingsstatus. De trækkes ikke fra hinanden.</p>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-1 pr-3 font-medium">Periode</th>
              <th className="py-1 pr-3 font-medium">Indbetaling</th>
              <th className="py-1 font-medium">Leverandørfakturaer</th>
            </tr>
          </thead>
          <tbody>
            {position.forecast.map((window) => (
              <tr key={window.id} className="border-t border-gray-100">
                <td className="py-1 pr-3">{window.label}</td>
                <td className="py-1 pr-3">{desk.seesInvoices ? moneyText(window.inflow) : 'Skjult'}</td>
                <td className="py-1">{desk.seesPayables ? moneyText(window.supplierInvoiceTotal) : 'Skjult'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-sm font-medium text-gray-800">Forfaldne fakturaer</h2>
        {desk.seesInvoices && invoiceRows.length === 0 && position.overdueAmount.state === 'known' && (
          <p className="mt-2 text-sm text-gray-600">Ingen forfaldne DKK-fakturaer over 0,50 kr.</p>
        )}
        {desk.seesInvoices && invoiceRows.length === 0 && position.overdueAmount.state === 'unknown' && (
          <p className="mt-2 text-sm text-gray-600">Forfaldne beløb kunne ikke opgøres.</p>
        )}
        {!desk.seesInvoices && <p className="mt-2 text-sm text-gray-600">Fakturaerne er skjult.</p>}
        {invoiceRows.length > 0 && (
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1 pr-3 font-medium">Faktura</th>
                <th className="py-1 pr-3 font-medium">Kunde</th>
                <th className="py-1 pr-3 font-medium">Forfald</th>
                <th className="py-1 pr-3 font-medium">Dage</th>
                <th className="py-1 font-medium">Åbent</th>
              </tr>
            </thead>
            <tbody>
              {invoiceRows.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="py-1 pr-3">
                    <Link href={`/dashboard/invoices/${row.id}`} className="text-blue-700 hover:underline">{row.invoiceNumber}</Link>
                  </td>
                  <td className="py-1 pr-3">{row.customerName}</td>
                  <td className="py-1 pr-3">{row.dueDate}</td>
                  <td className="py-1 pr-3">{row.overdueDays}</td>
                  <td className="py-1">{Number.isFinite(row.amount) ? formatCurrency(row.amount, 'DKK', 2) : 'Ukendt'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {position.invoicesTruncated && <p className="mt-1 text-xs text-gray-500">Viser 40. Der kan være flere.</p>}
      </section>

      {desk.seesPayables && (
        <section>
          <h2 className="text-sm font-medium text-gray-800">Leverandørfakturaer uden betalingsstatus</h2>
          {position.payables.length === 0 && position.payablesKnown && position.payableInvoiceTotal.state === 'known' && (
            <p className="mt-2 text-sm text-gray-600">Ingen godkendte eller bogførte DKK-fakturaer.</p>
          )}
          {position.payables.length > 0 && (
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-1 pr-3 font-medium">Faktura</th>
                  <th className="py-1 pr-3 font-medium">Leverandør</th>
                  <th className="py-1 pr-3 font-medium">Forfald</th>
                  <th className="py-1 font-medium">Fakturabeløb</th>
                </tr>
              </thead>
              <tbody>
                {position.payables.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="py-1 pr-3">
                      <Link href={`/dashboard/incoming-invoices/${row.id}`} className="text-blue-700 hover:underline">{row.invoiceNumber || 'Uden nummer'}</Link>
                    </td>
                    <td className="py-1 pr-3">{row.supplierName}</td>
                    <td className="py-1 pr-3">{row.dueDate ?? 'Ukendt'}</td>
                    <td className="py-1">{row.amount == null ? 'Ukendt' : formatCurrency(row.amount, 'DKK', 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {position.payablesTruncated && <p className="mt-1 text-xs text-gray-500">Viser 40. Der kan være flere.</p>}
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium text-gray-800">Datakvalitet</h2>
        <ul className="mt-2 text-sm text-gray-700 space-y-1">
          {desk.seesInvoices && position.receivables.state === 'unknown' && <li>Tilgodehavendet kunne ikke opgøres.</li>}
          {desk.seesInvoices && position.otherCurrencyCount > 0 && <li>{position.otherCurrencyCount} åbne fakturaer i anden valuta er ikke lagt sammen med kroner.</li>}
          {desk.seesInvoices && position.unknownAmountCount > 0 && <li>{position.unknownAmountCount} fakturaer mangler et læsbart beløb.</li>}
          {desk.seesInvoices && position.missingDueCount > 0 && <li>{position.missingDueCount} åbne DKK-fakturaer har ingen forfaldsdato og ligger i «Uden forfaldsdato».</li>}
          {desk.seesInvoices && position.unlinkedCreditCount > 0 && <li>{position.unlinkedCreditCount} kreditnotaer peger ikke på en original og er ikke modregnet.</li>}
          {desk.seesInvoices && !desk.customerNamesKnown && <li>Kundenavne kunne ikke læses.</li>}
          {desk.seesPayables && !position.payablesKnown && <li>Leverandørfakturaer kunne ikke læses.</li>}
          {desk.seesPayables && position.awaitingCount > 0 && <li>{position.awaitingCount} leverandørfakturaer afventer behandling og er ikke talt som udbetaling.</li>}
          {desk.seesPayables && position.payableMissingAmount > 0 && <li>{position.payableMissingAmount} godkendte leverandørfakturaer mangler beløb.</li>}
          {desk.seesPayables && position.supplierMissingDue > 0 && <li>{position.supplierMissingDue} godkendte DKK-leverandørfakturaer har ingen forfaldsdato.</li>}
          {desk.seesPayables && position.payableOtherCurrency > 0 && <li>{position.payableOtherCurrency} leverandørfakturaer i anden valuta er ikke lagt sammen med kroner.</li>}
          {desk.seesPayables && position.payableDuplicates > 0 && <li>{position.payableDuplicates} dubletter er holdt ude af beløbet.</li>}
          {desk.bank.visible && desk.bank.unmatched == null && <li>Umatchede bankbevægelser kunne ikke tælles.</li>}
          {desk.economic.visible && (
            <li>
              <Link href="/dashboard/settings/economic" className="text-blue-700 hover:underline">Eksportstatus og uvist bogføring</Link>
              {' '}ligger på den eksisterende e-conomic-side.
            </li>
          )}
        </ul>
      </section>

      <section className="rounded-md ring-1 ring-gray-200 p-4">
        <h2 className="text-sm font-medium text-gray-800">Senere bogføring</h2>
        <p className="mt-1 text-sm text-gray-700">{desk.bookkeeping.text}</p>
      </section>
    </div>
  )
}
