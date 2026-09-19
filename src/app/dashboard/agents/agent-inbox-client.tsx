'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import {
  approveAgentActionAction,
  rejectAgentActionAction,
  executeAgentActionAction,
} from '@/lib/actions/agent-inbox'
import type { AgentInboxItem } from '@/types/agent-core.types'

const HARD_BLOCKED = ['send_external', 'push_external', 'finance', 'delete']

export function AgentInboxClient({ items }: { items: AgentInboxItem[] }) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)

  const run = (actionId: string, fn: () => Promise<{ success: boolean; error?: string }>, okMsg: string) => {
    setBusyId(actionId)
    startTransition(async () => {
      const res = await fn()
      if (res.success) toast.success(okMsg)
      else toast.error('Handling fejlede', res.error)
      setBusyId(null)
      router.refresh()
    })
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Agent Inbox</h1>
        <p className="text-sm text-gray-500">
          Forslag fra agenter. Intet udfoeres uden din godkendelse. Hard-blockede
          handlinger (send/finans/push/slet) kraever altid approval.
        </p>
      </div>

      {items.length === 0 && (
        <p className="text-sm text-gray-500">Ingen agent-forslag endnu.</p>
      )}

      {items.map((item) => (
        <div key={item.run.id} className="rounded-lg border bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">{item.run.summary || item.run.agent_type}</p>
              <p className="text-xs text-gray-500">
                {item.run.agent_type} · {item.run.safety_mode} · {item.run.status}
              </p>
            </div>
          </div>

          <ul className="mt-3 space-y-2">
            {item.actions.map((a) => {
              const hard = HARD_BLOCKED.includes(a.side_effect_class)
              const needsApproval = a.requires_approval || hard
              const busy = busyId === a.id && isPending
              const terminal = ['executed', 'rejected', 'failed', 'rolled_back'].includes(a.status)
              return (
                <li key={a.id} className="flex items-center justify-between rounded border border-gray-100 bg-gray-50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">
                      {a.capability}
                      {hard && (
                        <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                          HARD-BLOCK
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      {a.side_effect_class} · status: {a.status}
                      {needsApproval ? ` · kraever ${a.min_approvals} approval(s)` : ''}
                    </p>
                    {typeof a.payload?.draft === 'string' && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-blue-600">Vis forslag</summary>
                        <pre className="mt-1 whitespace-pre-wrap rounded bg-white p-2 text-xs text-gray-700">{a.payload.draft as string}</pre>
                      </details>
                    )}
                    {a.status === 'executed' && typeof a.result?.draft === 'string' && (
                      <p className="mt-1 text-xs text-green-700">✓ Udkast materialiseret internt (ikke sendt).</p>
                    )}
                  </div>
                  {!terminal && (
                    <div className="flex flex-shrink-0 gap-2">
                      {needsApproval && (
                        <>
                          <button
                            disabled={busy}
                            onClick={() => run(a.id, () => approveAgentActionAction(a.id), 'Godkendt')}
                            className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            Godkend
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => run(a.id, () => rejectAgentActionAction(a.id), 'Afvist')}
                            className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            Afvis
                          </button>
                        </>
                      )}
                      <button
                        disabled={busy}
                        onClick={() => run(a.id, () => executeAgentActionAction(a.id), 'Udfoert')}
                        className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Udfoer
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
