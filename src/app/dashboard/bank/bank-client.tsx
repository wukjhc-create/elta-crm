'use client'

import { useState, useTransition } from 'react'
import {
  importBankCsvAction,
  manualMatchAction,
  runAutoMatchAction,
  searchInvoicesForMatchAction,
  type BankTxListRow,
} from '@/lib/actions/bank-payments'
import { Button } from '@/components/ui/button'

type InvoiceCandidate = {
  id: string
  invoice_number: string
  final_amount: number
  currency: string
  payment_status: string
  status: string
  due_date: string | null
}

const fmtAmount = (n: number, currency = 'DKK') =>
  new Intl.NumberFormat('da-DK', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n)

export function BankTransactionsClient({ initialRows }: { initialRows: BankTxListRow[] }) {
  const [rows, setRows] = useState<BankTxListRow[]>(initialRows)
  const [busy, startTransition] = useTransition()
  const [csvOpen, setCsvOpen] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [matchMsg, setMatchMsg] = useState<string | null>(null)

  const refresh = async () => {
    const { listUnmatchedBankTransactions } = await import('@/lib/actions/bank-payments')
    const next = await listUnmatchedBankTransactions(200)
    setRows(next)
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Bankafstemning</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCsvOpen((o) => !o)}>
            Importér CSV
          </Button>
          <Button
            onClick={() =>
              startTransition(async () => {
                const summary = await runAutoMatchAction()
                setMatchMsg(
                  `Scannede ${summary.scanned} · matched ${summary.matched} · partial ${summary.partial} · over ${summary.overpayment} · ambiguous ${summary.ambiguous} · unmatched ${summary.unmatched}`
                )
                await refresh()
              })
            }
            disabled={busy}
          >
            Kør auto-match
          </Button>
        </div>
      </div>

      {csvOpen && (
        <div className="border rounded p-3 space-y-2 bg-gray-50">
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={6}
            className="w-full border rounded p-2 font-mono text-xs"
            placeholder="date;amount;reference_text;sender_name&#10;2026-04-29;312,50;F-2026-0001;Eksempel ApS"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCsvOpen(false)}>Annullér</Button>
            <Button
              disabled={busy || !csvText.trim()}
              onClick={() =>
                startTransition(async () => {
                  const r = await importBankCsvAction(csvText)
                  setImportMsg(`Importeret: ${r.inserted} · duplikater: ${r.duplicates} · ugyldige: ${r.invalid}`)
                  setCsvText('')
                  setCsvOpen(false)
                  await refresh()
                })
              }
            >
              Importér
            </Button>
          </div>
        </div>
      )}

      {importMsg && <div className="text-sm text-gray-700">{importMsg}</div>}
      {matchMsg && <div className="text-sm text-gray-700">{matchMsg}</div>}

      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="px-3 py-2">Dato</th>
              <th className="px-3 py-2">Beløb</th>
              <th className="px-3 py-2">Reference</th>
              <th className="px-3 py-2">Afsender</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Manuel match</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">Ingen umatchede transaktioner.</td></tr>
            )}
            {rows.map((r) => (
              <BankTxRow key={r.id} row={r} onMatched={refresh} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BankTxRow({ row, onMatched }: { row: BankTxListRow; onMatched: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<InvoiceCandidate[]>([])
  const [, startTransition] = useTransition()

  const search = (q: string) => {
    setQuery(q)
    startTransition(async () => {
      const data = await searchInvoicesForMatchAction(q, 20)
      setResults(data as InvoiceCandidate[])
    })
  }

  const apply = (invoiceId: string) => {
    startTransition(async () => {
      await manualMatchAction(row.id, invoiceId)
      setOpen(false)
      await onMatched()
    })
  }

  return (
    <>
      <tr className="border-t">
        <td className="px-3 py-2 whitespace-nowrap">{row.date}</td>
        <td className="px-3 py-2 whitespace-nowrap font-medium">{fmtAmount(Number(row.amount))}</td>
        <td className="px-3 py-2">{row.reference_text || <span className="text-gray-400">—</span>}</td>
        <td className="px-3 py-2">{row.sender_name || <span className="text-gray-400">—</span>}</td>
        <td className="px-3 py-2">
          <StatusBadge status={row.match_status} />
          {row.candidate_invoice_ids && row.candidate_invoice_ids.length > 0 && (
            <span className="ml-2 text-xs text-gray-500">{row.candidate_invoice_ids.length} kandidater</span>
          )}
        </td>
        <td className="px-3 py-2">
          <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
            {open ? 'Luk' : 'Find faktura'}
          </Button>
        </td>
      </tr>
      {open && (
        <tr className="bg-gray-50 border-t">
          <td colSpan={6} className="px-3 py-3">
            <div className="flex gap-2 mb-2">
              <input
                value={query}
                onChange={(e) => search(e.target.value)}
                className="border rounded px-2 py-1 text-sm w-64"
                placeholder="Søg fakturanummer (F-2026-…)"
                autoFocus
              />
            </div>
            <div className="space-y-1 max-h-64 overflow-auto">
              {results.length === 0 && <div className="text-xs text-gray-500">Ingen kandidater.</div>}
              {results.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between border rounded px-2 py-1 bg-white text-xs">
                  <div>
                    <span className="font-medium">{inv.invoice_number}</span>
                    <span className="ml-2 text-gray-500">
                      {fmtAmount(Number(inv.final_amount), inv.currency)} · {inv.status} / {inv.payment_status}
                    </span>
                  </div>
                  <Button size="sm" onClick={() => apply(inv.id)}>Match</Button>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'unmatched'
      ? 'bg-gray-100 text-gray-700'
      : status === 'ambiguous'
      ? 'bg-amber-100 text-amber-800'
      : status === 'partial'
      ? 'bg-blue-100 text-blue-800'
      : status === 'overpayment'
      ? 'bg-purple-100 text-purple-800'
      : 'bg-emerald-100 text-emerald-800'
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{status}</span>
}
