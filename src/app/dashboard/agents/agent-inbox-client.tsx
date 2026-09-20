'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import {
  approveAgentActionAction,
  rejectAgentActionAction,
  executeAgentActionAction,
  selectLinkCandidateAction,
  saveDraftAction,
} from '@/lib/actions/agent-inbox'
import type { AgentInboxItem } from '@/types/agent-core.types'
import { reviewPriority, type ConfidenceLevel, type CustomerCandidate } from '@/lib/agents/mail-confidence'

const HARD_BLOCKED = ['send_external', 'push_external', 'finance', 'delete']

function DraftEditor({ actionId, initial }: { actionId: string; initial: string }) {
  const router = useRouter()
  const toast = useToast()
  const [text, setText] = useState(initial)
  const [saving, startSave] = useTransition()
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-blue-600">Vis / rediger udkast</summary>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        className="mt-1 w-full rounded border border-gray-300 p-2 font-mono text-xs text-gray-700"
      />
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            startSave(async () => {
              const r = await saveDraftAction(actionId, text)
              if (r.success) toast.success('Udkast gemt')
              else toast.error('Kunne ikke gemme udkast', r.error)
              router.refresh()
            })
          }
          className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Gemmer…' : 'Gem udkast'}
        </button>
        <span className="text-[10px] text-gray-400">Sendes ikke — gemmes til senere.</span>
      </div>
    </details>
  )
}

function ConfidenceBadge({ level, conflicts }: { level: ConfidenceLevel | null; conflicts: boolean }) {
  if (conflicts) {
    return <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">FLERE MATCH</span>
  }
  if (!level) return null
  const cls =
    level === 'high'
      ? 'bg-green-100 text-green-700'
      : level === 'medium'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-gray-200 text-gray-700'
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{level.toUpperCase()}</span>
}

export function AgentInboxClient({ items }: { items: AgentInboxItem[] }) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [hideCompleted, setHideCompleted] = useState(false)

  const visibleItems = hideCompleted ? items.filter((i) => i.pendingCount > 0) : items
  const totalPending = items.reduce((n, i) => n + i.pendingCount, 0)

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
          Forslag fra agenter, prioriteret efter review-behov. Intet udfoeres uden din
          godkendelse. Hard-blockede handlinger (send/finans/push/slet) kraever altid approval.
        </p>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-sm text-gray-700">{totalPending} handling(er) afventer review</span>
          <label className="inline-flex items-center gap-1.5 text-sm text-gray-600">
            <input type="checkbox" checked={hideCompleted} onChange={(e) => setHideCompleted(e.target.checked)} />
            Skjul færdige
          </label>
        </div>
      </div>

      {visibleItems.length === 0 && (
        <p className="text-sm text-gray-500">
          {items.length === 0 ? 'Ingen agent-forslag endnu.' : 'Ingen forslag afventer review.'}
        </p>
      )}

      {visibleItems.map((item) => (
        <div key={item.run.id} className="rounded-lg border bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-gray-900">{item.run.summary || item.run.agent_type}</p>
              <p className="text-xs text-gray-500">
                {item.run.agent_type} · {item.run.safety_mode} · {item.run.status}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                item.pendingCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {item.pendingCount > 0 ? `${item.pendingCount} afventer` : 'Færdig'}
            </span>
          </div>

          <ul className="mt-3 space-y-2">
            {[...item.actions]
              .sort(
                (x, y) =>
                  reviewPriority((y.payload?.confidence_level as ConfidenceLevel) ?? 'high', !!y.payload?.conflicts) -
                  reviewPriority((x.payload?.confidence_level as ConfidenceLevel) ?? 'high', !!x.payload?.conflicts),
              )
              .map((a) => {
              const hard = HARD_BLOCKED.includes(a.side_effect_class)
              const level = (a.payload?.confidence_level as ConfidenceLevel | undefined) ?? null
              const conflicts = !!a.payload?.conflicts
              const rationale = a.payload?.rationale as string | undefined
              const candidates = (a.payload?.candidates as CustomerCandidate[] | undefined) ?? []
              const needsApproval = a.requires_approval || hard
              const busy = busyId === a.id && isPending
              const terminal = ['executed', 'rejected', 'failed', 'rolled_back'].includes(a.status)
              return (
                <li key={a.id} className="flex items-center justify-between rounded border border-gray-100 bg-gray-50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-gray-800">
                      {a.capability}
                      {hard && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                          HARD-BLOCK
                        </span>
                      )}
                      <ConfidenceBadge level={level} conflicts={conflicts} />
                    </p>
                    <p className="text-xs text-gray-500">
                      {a.side_effect_class} · status: {a.status}
                      {needsApproval ? ` · kraever ${a.min_approvals} approval(s)` : ''}
                    </p>
                    {rationale && <p className="mt-0.5 text-xs italic text-gray-600">{rationale}</p>}
                    {candidates.length > 0 && (() => {
                      const selectable = candidates.length > 1 || conflicts
                      const selectedId = a.payload?.selected_customer_id as string | undefined
                      const busy = busyId === a.id && isPending
                      return (
                        <div className="mt-1 space-y-1">
                          {conflicts && (
                            <p className="text-xs font-semibold text-red-600">
                              ⚠ Flere mulige kunder — vælg den korrekte manuelt (ingen auto-link).
                            </p>
                          )}
                          {selectable && !selectedId && (
                            <p className="text-xs text-amber-700">Vælg en kunde før godkendelse/udførelse.</p>
                          )}
                          {candidates.map((c) => {
                            const isSelected = selectedId === c.id
                            const rowCls = `w-full rounded border px-2 py-1 text-left text-xs ${
                              isSelected ? 'border-green-500 bg-green-50 ring-1 ring-green-400' : 'border-gray-200 bg-white'
                            }`
                            const content = (
                              <>
                                <span className="font-medium text-gray-800">{c.company_name}</span>
                                {c.customer_number && <span className="text-gray-500"> · {c.customer_number}</span>}
                                {c.email && <span className="text-gray-500"> · {c.email}</span>}
                                {c.phone && <span className="text-gray-500"> · {c.phone}</span>}
                                <span className="ml-1 text-gray-400">
                                  [{c.signals.map((s) => (s.strong ? s.kind + '✓' : s.kind)).join(', ')}]
                                </span>
                                {isSelected && <span className="ml-2 font-semibold text-green-700">✓ valgt</span>}
                              </>
                            )
                            return selectable ? (
                              <button
                                key={c.id}
                                type="button"
                                disabled={busy}
                                onClick={() => run(a.id, () => selectLinkCandidateAction(a.id, c.id), 'Kunde valgt')}
                                className={`${rowCls} hover:bg-gray-50 disabled:opacity-50`}
                              >
                                {content}
                              </button>
                            ) : (
                              <div key={c.id} className={rowCls}>{content}</div>
                            )
                          })}
                        </div>
                      )
                    })()}
                    {a.capability === 'mail.draft_reply' && !terminal && typeof a.payload?.draft === 'string' && (
                      <DraftEditor actionId={a.id} initial={a.payload.draft as string} />
                    )}
                    {a.status === 'executed' && typeof a.result?.draft === 'string' && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-green-700">✓ Materialiseret udkast (ikke sendt)</summary>
                        <pre className="mt-1 whitespace-pre-wrap rounded bg-white p-2 text-xs text-gray-700">{a.result.draft as string}</pre>
                      </details>
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
