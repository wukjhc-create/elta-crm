'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { Bot, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { useUserRole } from '@/lib/hooks/use-user-role'
import { runOfferAgentAction } from '@/lib/actions/agent-inbox'

/**
 * Admin-only: bed tilbudsagenten foreslå et tomt tilbudsudkast for sagen. Opretter KUN et forslag i Agent Inbox;
 * udkastet oprettes først efter godkendelse via Executor (og kun med aktiveret agent). Intet sendes.
 */
export function OfferAgentButton({ caseId }: { caseId: string }) {
  const { role, loading } = useUserRole()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  if (loading || role !== 'admin') return null

  const onClick = () =>
    startTransition(async () => {
      const res = await runOfferAgentAction(caseId)
      if (!res.success) toast.error('Tilbudsagent fejlede', res.error)
      else if (res.data?.proposals) toast.success('Tilbudsforslag oprettet i Agent Inbox')
      else toast.info('Intet forslag oprettet', res.data?.reason)
    })

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
        Foreslå tilbud (agent)
      </button>
      <Link href="/dashboard/agents" className="text-[11px] text-blue-600 hover:underline">
        Agent Inbox →
      </Link>
    </div>
  )
}
