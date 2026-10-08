'use client'

/**
 * N95 — webhenvendelse fra en person der allerede er kunde (samme e-mail): "Kobl til kunde" kobler mailen til kunden
 * (samme manuelle kobling som i mailen; inbox.view) i stedet for at oprette et lead.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Link2, Loader2 } from 'lucide-react'
import { linkEmailToCustomer } from '@/lib/actions/incoming-emails'

export function CockpitLinkCustomerButton({ emailId, customerId }: { emailId: string; customerId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      disabled={busy}
      data-testid="cockpit-link-customer"
      onClick={async () => {
        setBusy(true)
        await linkEmailToCustomer(emailId, customerId).catch(() => {})
        setBusy(false)
        router.refresh()
      }}
      className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-blue-600 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
      Kobl til kunde
    </button>
  )
}
