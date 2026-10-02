'use client'

/**
 * N35 — "Opret lead" fra en ukoblet mail (især webhenvendelser fra kontaktformularen, D37): lead med kontaktdata
 * læst fra mailen, kilde website/email, koblet til mailen (custom_fields.source_email_id). Dublet-værn på mailen.
 */

import { useState } from 'react'
import Link from 'next/link'
import { UserPlus, Loader2 } from 'lucide-react'
import { createLeadFromEmailAction } from '@/lib/actions/incoming-emails'
import { useToast } from '@/components/ui/toast'

export function CreateLeadFromMailButton({ emailId }: { emailId: string }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [leadId, setLeadId] = useState<string | null>(null)

  if (leadId) {
    return (
      <Link href={`/dashboard/leads/${leadId}`} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50" data-testid="mail-lead-open">
        <UserPlus className="w-4 h-4" /> Åbn lead
      </Link>
    )
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        const r = await createLeadFromEmailAction(emailId)
        setBusy(false)
        if (!r.success || !r.data) { toast.error('Kunne ikke oprette lead', r.error); return }
        setLeadId(r.data.leadId)
        toast.success(r.data.existed ? 'Lead fandtes allerede for mailen' : 'Lead oprettet')
      }}
      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
      data-testid="mail-create-lead"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
      Opret lead
    </button>
  )
}
