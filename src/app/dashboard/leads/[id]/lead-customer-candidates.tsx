'use client'

/**
 * N87 — "Findes kunden allerede?" på et lead der endnu ikke er kunde: kunder med samme telefon/navn (ofte oprettet af
 * mail-automatikken). "Kobl til denne kunde" kobler leadet (og kildemailen) i stedet for at oprette en dublet.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Users } from 'lucide-react'
import { getLeadCustomerCandidatesAction, linkLeadToCustomerAction, type LeadCustomerCandidate } from '@/lib/actions/lead-duplicates'
import { humanizeErrorText } from '@/lib/auth/permission-text'

export function LeadCustomerCandidates({ leadId }: { leadId: string }) {
  const router = useRouter()
  const [items, setItems] = useState<LeadCustomerCandidate[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setItems([])
    setLoadError(null)
    void getLeadCustomerCandidatesAction(leadId).then((r) => {
      if (!alive) return
      if (r.success) setItems(r.data ?? [])
      else setLoadError('Mulige kunder kunne ikke hentes. Det tælles ikke som ingen match.')
    }).catch(() => {
      if (!alive) return
      setLoadError('Mulige kunder kunne ikke hentes. Det tælles ikke som ingen match.')
    })
    return () => { alive = false }
  }, [leadId])

  if (loadError) {
    return <p className="text-xs text-red-700 break-words" data-testid="lead-candidates-load-error">{loadError}</p>
  }
  if (!items.length) return null
  const emailMatch = items.some((c) => c.reason === 'email')
  return (
    <div className={`${emailMatch ? 'bg-amber-50 border-amber-300' : 'bg-blue-50 border-blue-200'} border rounded-lg p-4 space-y-2`} data-testid="lead-customer-candidates">
      <p className="text-sm font-medium text-blue-900 flex items-center gap-2" data-testid={emailMatch ? 'lead-possible-existing' : undefined}>
        <Users className="w-4 h-4" /> {emailMatch ? 'Mulig eksisterende kunde (samme e-mail) — bekræft koblingen' : 'Findes kunden allerede?'}
      </p>
      <ul className="space-y-1.5">
        {items.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
            <Link href={`/dashboard/customers/${c.id}`} className="font-medium text-blue-900 hover:underline">{c.name}</Link>
            <span className="text-xs text-blue-700">{c.customer_number ?? ''} · {c.reason === 'email' ? 'samme e-mail' : c.reason === 'phone' ? 'samme telefon' : 'samme navn'}</span>
            <button
              type="button"
              disabled={!!busy}
              data-testid="lead-link-candidate"
              onClick={async () => {
                setBusy(c.id); setError(null)
                const r = await linkLeadToCustomerAction(leadId, c.id)
                setBusy(null)
                if (!r.success) { setError(humanizeErrorText(r.error) ?? 'Kunne ikke koble'); return }
                router.refresh()
              }}
              className="ml-auto px-2.5 py-1 text-xs rounded border border-blue-300 bg-white text-blue-800 hover:bg-blue-100 disabled:opacity-50"
            >
              {busy === c.id ? 'Kobler…' : 'Kobl til denne kunde'}
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-blue-700">Ellers: &quot;Opret som kunde&quot; opretter en ny kunde.</p>
      {error && <p className="text-xs text-red-700 break-words" data-testid="lead-link-error">{error}</p>}
    </div>
  )
}
