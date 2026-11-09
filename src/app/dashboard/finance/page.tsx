import { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'
import { loadFinanceDesk } from '@/lib/actions/finance-position'
import { formatQualifiedKr, type CashHorizon, type FinanceQueueItem, type QualifiedAmount } from '@/lib/finance/cash-position'
import { formatCurrency, formatDateTimeDK } from '@/lib/utils/format'
import type { Money } from '@/lib/finance/position'

export const metadata: Metadata = {
  title: 'Likviditet',
  description: 'Bogført saldo, tilgodehavender og forventet likviditet',
}

export const dynamic = 'force-dynamic'

function moneyText(value: Money): string {
  return value.state === 'known' ? formatCurrency(value.amount, 'DKK', 2) : 'Ukendt'
}

function sourceLabel(source: QualifiedAmount['source']): string {
  switch (source) {
    case 'economic_ledger': return 'e-conomic, bogført konto'
    case 'economic_open_items': return 'e-conomic, åbne kreditorposter'
    case 'crm_open_items': return 'CRM, åbne fakturaer'
    case 'configuration_required': return 'Ikke konfigureret'
    case 'error': return 'Fejl'
    default: return 'Ikke tilgængelig'
  }
}

function figureQuality(value: QualifiedAmount): string {
  if ((value.source === 'crm_open_items' || value.source === 'economic_open_items' || value.source === 'economic_ledger') && value.amount != null) return 'OK'
  return sourceLabel(value.source)
}

function shownAmount(value: QualifiedAmount, hidden: boolean): string {
  return hidden ? 'Skjult' : formatQualifiedKr(value)
}

function QueueTable({ rows, empty }: { rows: FinanceQueueItem[]; empty: string }) {
  if (!rows.length) return <p className="mt-2 text-sm text-gray-600">{empty}</p>
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="py-1 pr-3 font-medium">Dokument</th>
            <th className="py-1 pr-3 font-medium">Part</th>
            <th className="py-1 pr-3 font-medium">Forfald</th>
            <th className="py-1 font-medium">Beløb</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-gray-100">
              <td className="py-1 pr-3">{row.documentHref ? <Link href={row.documentHref} className="text-blue-700 hover:underline">{row.label}</Link> : row.label}</td>
              <td className="py-1 pr-3">{row.partyHref ? <Link href={row.partyHref} className="text-blue-700 hover:underline">{row.party}</Link> : row.party}</td>
              <td className="py-1 pr-3">{row.dueDate ?? 'Ukendt'}</td>
              <td className="py-1">{row.amount == null ? 'Ukendt' : `${formatCurrency(row.amount, row.currency ?? 'DKK', 2)} (${row.amountLabel})`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AmountCard({ title, value, hidden, note }: { title: string; value: QualifiedAmount; hidden?: boolean; note?: ReactNode }) {
  const text = shownAmount(value, !!hidden)
  const unknown = !hidden && (text === 'Ukendt' || text === 'Ikke konfigureret')
  return (
    <section className="rounded-md ring-1 ring-gray-200 p-4">
      <h2 className="text-sm font-medium text-gray-800">{title}</h2>
      <p className={`mt-2 text-2xl ${unknown ? 'text-amber-900' : 'text-gray-900'}`}>{text}</p>
      <p className="mt-1 text-xs text-gray-500">{hidden ? 'Skjult for denne adgang.' : sourceLabel(value.source)}</p>
      {!hidden && <p className="mt-1 text-xs text-gray-600">{value.detail}</p>}
      {note}
    </section>
  )
}

function HorizonBlock({ horizon, hideIncoming, hideOutgoing }: { horizon: CashHorizon; hideIncoming: boolean; hideOutgoing: boolean }) {
  const rows: Array<{ label: string; text: string }> = [
    { label: 'Åbningskasse, bogført', text: formatQualifiedKr(horizon.openingCash) },
    { label: 'Forventet indbetaling', text: shownAmount(horizon.expectedIncoming, hideIncoming) },
    { label: 'Forventet udbetaling', text: shownAmount(horizon.expectedOutgoing, hideOutgoing) },
    { label: 'Forventet likviditet', text: shownAmount(horizon.projectedCash, hideIncoming || hideOutgoing) },
    { label: 'Debitorer uden forfald', text: shownAmount(horizon.unscheduledReceivables, hideIncoming) },
    { label: 'Kreditorer uden forfald', text: shownAmount(horizon.unscheduledPayables, hideOutgoing) },
    { label: 'Datakvalitet', text: sourceLabel(horizon.quality) },
  ]
  return (
    <section className="rounded-md ring-1 ring-gray-200 p-4">
      <h3 className="text-sm font-medium text-gray-800">+{horizon.days} dage</h3>
      <dl className="mt-2 space-y-1 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-gray-600">{row.label}</dt>
            <dd className={row.text === 'Ukendt' || row.text === 'Ikke konfigureret' ? 'text-amber-900' : 'text-gray-900'}>{row.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export default async function FinancePage() {
  if (!(await pageHasPermission('economy.view'))) {
    return <NoAccess permission="economy.view" />
  }
  const desk = await loadFinanceDesk()
  if (!desk.ok) {
    return <div className="p-6 text-sm text-red-900">{desk.message}</div>
  }
  const { cash, position } = desk
  const hideIncoming = !desk.seesInvoices
  const hideOutgoing = !desk.seesPayables

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Likviditet</h1>
        <p className="mt-1 text-sm text-gray-600">
          Åbningskassen er den bogførte saldo på den konto, der er valgt som bankkonto i e-conomic-opsætningen. Det er regnskabstal, ikke en faktisk banksaldo. Der skrives ikke til e-conomic, og intet godkendes eller betales her.
        </p>
        {desk.seesInvoices && !desk.scopeAll && (
          <p className="mt-1 text-sm text-gray-600">Du ser kun fakturaer på sager i dit scope. Det er ikke hele firmaets tilgodehavende.</p>
        )}
      </div>

      {cash.alerts.length > 0 && (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-medium text-amber-950">Likviditetsadvarsler</h2>
          <ul className="mt-2 space-y-1 text-sm text-amber-950">
            {cash.alerts.map((alert) => <li key={alert.code}>{alert.text}</li>)}
          </ul>
          <p className="mt-2 text-xs text-amber-900">Læs kun. Der sendes ingen SMS, mail eller Telegram.</p>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <AmountCard title="Bogført saldo (regnskab)" value={cash.bookedBankBalance} />
        <AmountCard title="Faktisk banksaldo" value={cash.actualBankBalance} />
        <AmountCard
          title="Tilgodehavender"
          value={cash.openReceivables}
          hidden={hideIncoming}
          note={desk.seesInvoices && cash.openReceivables.source === 'crm_open_items' ? (
            <p className="mt-1 text-xs text-gray-500">{position.openCount} åbne fakturaer. Beløb under 0,50 kr tælles med her, men ikke som forfaldne.</p>
          ) : undefined}
        />
        <AmountCard
          title="Forfaldne tilgodehavender"
          value={cash.overdueReceivables}
          hidden={hideIncoming}
          note={desk.seesInvoices && cash.overdueReceivables.source === 'crm_open_items' ? (
            <p className="mt-1 text-xs text-gray-500">{position.overdueCount} fakturaer over 0,50 kr med forfald før i dag.</p>
          ) : undefined}
        />
        <AmountCard title="Kreditorer" value={cash.openPayables} hidden={hideOutgoing} />
        <AmountCard title="Forfaldne kreditorer" value={cash.overduePayables} hidden={hideOutgoing} />
        <AmountCard title="Forventet likviditet +30 dage" value={cash.forecast30.projectedCash} hidden={hideIncoming || hideOutgoing} />
        <AmountCard title="Forventet likviditet +60 dage" value={cash.forecast60.projectedCash} hidden={hideIncoming || hideOutgoing} />
        <AmountCard title="Forventet likviditet +90 dage" value={cash.forecast90.projectedCash} hidden={hideIncoming || hideOutgoing} />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-800">30 / 60 / 90 dage</h2>
        <p className="text-xs text-gray-500">
          Hver horisont er åbningskassen plus åbne kundefakturaer med forfald senest den dag, inklusive allerede forfaldne, minus åbne kreditorrester. Uden forfaldsdato ligger for sig og trækkes ikke ind i horisonten. Et manglende tal bliver ikke 0. Horisonten bliver først et beløb, når kreditorresten er læst komplet og kun i kroner.
        </p>
        <div className="grid gap-3 lg:grid-cols-3">
          <HorizonBlock horizon={cash.forecast30} hideIncoming={hideIncoming} hideOutgoing={hideOutgoing} />
          <HorizonBlock horizon={cash.forecast60} hideIncoming={hideIncoming} hideOutgoing={hideOutgoing} />
          <HorizonBlock horizon={cash.forecast90} hideIncoming={hideIncoming} hideOutgoing={hideOutgoing} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-gray-800">Datakvalitet</h2>
        <ul className="mt-2 text-sm text-gray-700 space-y-1">
          <li>Bogført saldo: {sourceLabel(cash.bookedBankBalance.source)}</li>
          <li>Tilgodehavender: {hideIncoming ? 'Skjult' : figureQuality(cash.openReceivables)}</li>
          <li>Kreditorer: {hideOutgoing ? 'Skjult' : figureQuality(cash.openPayables)}</li>
          <li>Læst fra e-conomic ved denne visning: {cash.economicReadAt ? formatDateTimeDK(cash.economicReadAt) : 'Nej'}</li>
          <li>Beregnet: {formatDateTimeDK(cash.calculatedAt)}</li>
          {desk.seesInvoices && position.otherCurrencyCount > 0 && <li>{position.otherCurrencyCount} åbne fakturaer i anden valuta er ikke lagt sammen med kroner.</li>}
          {desk.seesInvoices && position.unknownAmountCount > 0 && <li>{position.unknownAmountCount} fakturaer mangler et læsbart beløb.</li>}
          {desk.seesInvoices && position.missingDueCount > 0 && <li>{position.missingDueCount} åbne DKK-fakturaer har ingen forfaldsdato og ligger uden for 30, 60 og 90 dage.</li>}
          {desk.seesInvoices && position.unlinkedCreditCount > 0 && <li>{position.unlinkedCreditCount} kreditnotaer peger ikke på en original og er ikke modregnet.</li>}
          {desk.seesInvoices && !desk.customerNamesKnown && <li>Kundenavne kunne ikke læses.</li>}
          {desk.seesPayables && !position.payablesKnown && <li>Leverandørfakturaer kunne ikke læses. Gælden er ikke 0.</li>}
          {desk.seesPayables && position.awaitingCount > 0 && <li>{position.awaitingCount} leverandørfakturaer afventer behandling og er ikke talt som udbetaling.</li>}
          {desk.seesPayables && position.payableMissingAmount > 0 && <li>{position.payableMissingAmount} godkendte leverandørfakturaer mangler beløb.</li>}
          {desk.seesPayables && position.supplierMissingDue > 0 && <li>{position.supplierMissingDue} godkendte DKK-leverandørfakturaer har ingen forfaldsdato.</li>}
          {desk.seesPayables && position.payableOtherCurrency > 0 && <li>{position.payableOtherCurrency} leverandørfakturaer i anden valuta er ikke lagt sammen med kroner.</li>}
          {desk.seesPayables && position.payableDuplicates > 0 && <li>{position.payableDuplicates} dubletter er holdt ude af beløbet.</li>}
          {desk.bank.visible && (
            <li>Umatchede bankbevægelser: {desk.bank.unmatched == null ? 'Ukendt' : desk.bank.unmatched}. Det er ikke en kassebeholdning.</li>
          )}
          {desk.seesEconomic && (
            <li>
              <Link href="/dashboard/settings/economic" className="text-blue-700 hover:underline">Eksportstatus og uvist bogføring</Link>
              {' '}ligger på den eksisterende e-conomic-side.
            </li>
          )}
        </ul>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          {desk.scopeAll && <Link href="/dashboard/invoices" className="text-blue-700 hover:underline">Åbn fakturaer</Link>}
          {desk.seesPayables && <Link href="/dashboard/incoming-invoices" className="text-blue-700 hover:underline">Åbn leverandørfakturaer</Link>}
          {desk.bank.visible && <Link href="/dashboard/bank" className="text-blue-700 hover:underline">Åbn bankafstemning</Link>}
        </div>
      </section>

      {desk.seesInvoices && (
        <section>
          <h2 className="text-sm font-medium text-gray-800">Forfaldne kundefakturaer</h2>
          <QueueTable
            rows={cash.overdueCustomerInvoices}
            empty={cash.overdueReceivables.source === 'crm_open_items' ? 'Ingen forfaldne DKK-fakturaer over 0,50 kr.' : 'Forfaldne beløb kunne ikke opgøres.'}
          />
          {position.invoicesTruncated && <p className="mt-1 text-xs text-gray-500">Viser 40. Der kan være flere.</p>}
        </section>
      )}

      {desk.seesInvoices && (
        <section>
          <h2 className="text-sm font-medium text-gray-800">Kommende kundefakturaer</h2>
          <p className="mt-1 text-xs text-gray-500">Forfald i dag og de næste 30 dage. Allerede forfaldne står ovenfor.</p>
          <QueueTable
            rows={cash.upcomingCustomerInvoices}
            empty={cash.openReceivables.source === 'error' ? 'Kommende fakturaer kunne ikke opgøres.' : 'Ingen åbne DKK-fakturaer med forfald i de næste 30 dage.'}
          />
          {position.upcomingTruncated && <p className="mt-1 text-xs text-gray-500">Viser 40. Der kan være flere.</p>}
        </section>
      )}

      {desk.seesPayables && desk.seesEconomic && (
        <section>
          <h2 className="text-sm font-medium text-gray-800">Åbne kreditorposter i e-conomic</h2>
          <p className="mt-1 text-xs text-gray-500">
            Rest på bogførte poster, i postens valuta. En anden valuta omregnes ikke. Fakturatotalen længere nede er et andet tal og trækkes ikke fra likviditeten.
          </p>
          {cash.creditorCurrencies.length > 0 && (
            <ul className="mt-2 text-sm text-gray-700 space-y-1">
              {cash.creditorCurrencies.map((row) => (
                <li key={row.currency}>
                  {row.currency}: rest {formatCurrency(row.remainder, row.currency, 2)}. At betale {formatCurrency(row.toPay, row.currency, 2)}.
                </li>
              ))}
            </ul>
          )}
          {!desk.creditorSuppliersKnown && (
            <p className="mt-1 text-xs text-gray-600">Leverandørlisten kunne ikke læses. Restbeløbet er uændret, og ingen leverandør er koblet.</p>
          )}
          {!desk.creditorInvoicesKnown && (
            <p className="mt-1 text-xs text-gray-600">Indgående fakturaer kunne ikke kobles. Restbeløbet er uændret.</p>
          )}
          <QueueTable
            rows={cash.openCreditorEntries}
            empty={
              cash.openPayables.source === 'economic_open_items'
                ? 'Ingen åbne kreditorrester.'
                : cash.openPayables.source === 'error'
                  ? 'Kreditorresterne kunne ikke læses. De vises ikke som 0.'
                  : 'Kreditorresterne er ikke bekræftet. Summen vises ikke som 0.'
            }
          />
          {cash.creditorEntriesTruncated && <p className="mt-1 text-xs text-gray-500">Viser 40. Der kan være flere. Summen bruger alle poster.</p>}
        </section>
      )}

      {desk.seesPayables && (
        <section>
          <h2 className="text-sm font-medium text-gray-800">Forfaldne leverandørfakturaer</h2>
          <p className="mt-1 text-xs text-gray-500">Fakturabeløb. Resten er ukendt, og beløbet trækkes ikke fra likviditeten.</p>
          <QueueTable
            rows={cash.overdueSupplierInvoices}
            empty={position.payablesKnown ? 'Ingen godkendte eller bogførte DKK-fakturaer med forfald før i dag.' : 'Leverandørfakturaerne kunne ikke læses.'}
          />
          {position.overduePayablesTruncated && <p className="mt-1 text-xs text-gray-500">Viser 40. Der kan være flere.</p>}
        </section>
      )}

      {desk.seesPayables && (
        <section>
          <h2 className="text-sm font-medium text-gray-800">Kommende leverandørfakturaer</h2>
          <p className="mt-1 text-xs text-gray-500">Fakturabeløb med forfald i dag og de næste 30 dage. Resten er ukendt.</p>
          <QueueTable
            rows={cash.upcomingSupplierInvoices}
            empty={position.payablesKnown ? 'Ingen godkendte eller bogførte DKK-fakturaer med forfald i de næste 30 dage.' : 'Leverandørfakturaerne kunne ikke læses.'}
          />
          {position.upcomingPayablesTruncated && <p className="mt-1 text-xs text-gray-500">Viser 40. Der kan være flere.</p>}
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium text-gray-800">Opdeling, ikke en kasseprognose</h2>
        <p className="mt-1 text-xs text-gray-500">
          Indbetalingen er kendt rest i DKK. Leverandørkolonnen er fakturabeløb uden betalingsstatus. De trækkes ikke fra hinanden og indgår ikke i forventet likviditet. Forventet likviditet bruger kun den læste kreditorrest, når den læsning er komplet og kun i kroner.
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1 pr-3 font-medium">Periode</th>
                <th className="py-1 pr-3 font-medium">Indbetaling</th>
                <th className="py-1 font-medium">Leverandørfakturabeløb</th>
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
        </div>
        {desk.seesPayables && (
          <p className="mt-2 text-sm text-gray-700">
            Godkendte og bogførte fakturaer i DKK, i alt: {moneyText(position.payableInvoiceTotal)}. Tallet er fakturabeløbet, ikke en kendt rest.
          </p>
        )}
      </section>

      <section className="rounded-md ring-1 ring-gray-200 p-4">
        <h2 className="text-sm font-medium text-gray-800">Senere bogføring</h2>
        <p className="mt-1 text-sm text-gray-700">{desk.bookkeeping.text}</p>
        <p className="mt-1 text-sm text-gray-700">Løn beregnes ikke her, og der oprettes ingen bogføringspost.</p>
      </section>
    </div>
  )
}
