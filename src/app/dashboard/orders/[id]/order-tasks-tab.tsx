'use client'

/**
 * Sprint Ø7.5 — Opgaver-fane på sagsdetaljen.
 *
 * Viser sagens opgaver fra customer_tasks (genbruger den eksisterende
 * opgavemotor — ingen ny task-arkitektur), inkl. opstartstjeklisten oprettet
 * ved konvertering fra tilbud. Read + markér-udført (completeCustomerTask).
 * Intern — ingen portal/kundevendt. Cost-free.
 */

import { useEffect, useState, useTransition } from 'react'
import { CheckCircle2, Circle, Loader2, ListChecks, Sparkles } from 'lucide-react'
import { getServiceCaseTasks, completeCustomerTask } from '@/lib/actions/customer-tasks'
import { TASK_STATUS_CONFIG, TASK_PRIORITY_CONFIG, type CustomerTaskWithRelations } from '@/types/customer-tasks.types'

export function OrderTasksTab({ caseId, canComplete = false }: { caseId: string; canComplete?: boolean }) {
  const [tasks, setTasks] = useState<CustomerTaskWithRelations[] | null>(null)
  const [namesFailed, setNamesFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, startBusy] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = () => {
    getServiceCaseTasks(caseId)
      .then((result) => { setError(null); setTasks(result.tasks); setNamesFailed(result.names_failed) })
      .catch(() => { setError('Kunne ikke hente opgaver. Det tælles ikke som ingen opgaver.') })
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [caseId])

  const handleComplete = (taskId: string) => {
    if (busy) return
    setBusyId(taskId)
    startBusy(async () => {
      const res = await completeCustomerTask(taskId)
      if (res.success) {
        setTasks((prev) => (prev ?? []).map((t) => (t.id === taskId ? { ...t, status: 'done' } : t)))
      } else {
        setError(res.error || 'Kunne ikke markere som udført')
      }
      setBusyId(null)
    })
  }

  if (tasks === null && !error) return <div className="text-sm text-gray-500 py-6 text-center">Henter opgaver…</div>
  if (tasks === null) return <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900 break-words min-w-0" data-testid="case-tasks-load-error">{error}</div>
  if (error && tasks.length === 0) return <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900 break-words min-w-0" data-testid="case-tasks-load-error">{error}</div>
  if (tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <ListChecks className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <h3 className="text-base font-medium text-gray-700 break-words min-w-0" data-testid="case-tasks-empty-title">Ingen opgaver endnu</h3>
        <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto break-words min-w-0" data-testid="case-tasks-empty-hint">
          Når en sag oprettes fra et tilbud, får den automatisk en opstartstjekliste her.
        </p>
      </div>
    )
  }

  const openCount = tasks.filter((t) => t.status !== 'done').length

  return (
    <div className="space-y-2">
      {namesFailed && (
        <p className="text-sm text-red-700 break-words min-w-0" data-testid="case-task-assignee-names-error">
          Ansvarlige kunne ikke hentes. Det tælles ikke som ikke tildelt.
        </p>
      )}
      {error && <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900">{error}</div>}
      <div className="text-xs text-gray-500 mb-1 break-words min-w-0" data-testid="case-tasks-open-count">{openCount} af {tasks.length} udestår</div>
      {tasks.map((t) => {
        const status = TASK_STATUS_CONFIG[t.status] ?? TASK_STATUS_CONFIG.pending
        const prio = TASK_PRIORITY_CONFIG[t.priority] ?? TASK_PRIORITY_CONFIG.normal
        const done = t.status === 'done'
        return (
          <div key={t.id} className="bg-gray-50 rounded ring-1 ring-gray-200 p-3 flex items-start gap-3">
            {canComplete && !done ? (
              <button
                type="button"
                onClick={() => handleComplete(t.id)}
                disabled={busy}
                title={`Markér ${t.title} som udført`}
                aria-label={`Markér ${t.title} som udført`}
                className="mt-0.5 inline-flex items-center justify-center min-h-[44px] min-w-[44px] -my-2 text-gray-300 hover:text-emerald-600 disabled:opacity-50"
              >
                {busy && busyId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Circle className="w-4 h-4" />}
              </button>
            ) : (
              <CheckCircle2 className={`w-4 h-4 mt-0.5 shrink-0 ${done ? 'text-emerald-600' : 'text-gray-300'}`} />
            )}
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium break-words ${done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                {t.title}
                {t.auto_generated && (
                  <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-blue-600 align-middle">
                    <Sparkles className="w-3 h-3" /> opstart
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${status.bgColor} ${status.color}`}>{status.label}</span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${prio.bgColor} ${prio.color}`}>{prio.label}</span>
                {t.assigned_profile?.full_name && <span className="text-xs text-gray-500 break-words">· {t.assigned_profile.full_name}</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
