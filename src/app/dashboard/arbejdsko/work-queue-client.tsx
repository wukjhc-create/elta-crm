'use client'

/**
 * C7 arbejdskø — liste (venstre) + detalje (højre). Tællere pr. kategori, filtre, søgning, prioritet, ansvarlig,
 * behandlingsstatus. Detaljen er den samme CoordinatorPanel som i mailvisningen (forslag, kunde, sager, afslut).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, RefreshCw, UserPlus, CheckCheck } from 'lucide-react'
import { completeLowRiskBatchAction, listWorkQueueAction } from '@/lib/actions/coordinator'
import { assignHenvendelse, listAssignableProfiles } from '@/lib/actions/henvendelser'
import type { QueueItem, QueueResult } from '@/lib/coordinator/queue'
import { CATEGORY_LABELS, PRIORITY_LABELS, QUEUE_CATEGORIES, SUGGESTION_LABELS, type QueueCategory } from '@/lib/coordinator/suggestions'
import { CoordinatorPanel, LevelBadge } from '@/components/coordinator/coordinator-panel'

type Filter = 'all' | 'mine' | 'unassigned' | 'approval' | 'answered'
const FILTERS: Array<[Filter, string]> = [['all', 'Alle åbne'], ['approval', 'Kræver godkendelse'], ['mine', 'Mine'], ['unassigned', 'Ikke tildelt'], ['answered', 'Besvaret — mangler afslutning']]
const PRIO_STYLE: Record<string, string> = { urgent: 'border-l-red-600', high: 'border-l-amber-500', normal: 'border-l-blue-300', low: 'border-l-gray-200' }
const PRIO_BADGE: Record<string, string> = { urgent: 'bg-red-100 text-red-800', high: 'bg-amber-100 text-amber-800', normal: 'bg-blue-50 text-blue-800', low: 'bg-gray-100 text-gray-600' }
const CHANNEL: Record<string, string> = { email: 'Mail', web_chat: 'Web-chat', phone: 'Telefon', sms: 'SMS', portal: 'Portal', upload_link: 'Upload' }
const fmt = (s: string) => new Date(s).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Copenhagen' })

export function WorkQueueClient({ canAssign }: { canAssign: boolean }) {
  const [data, setData] = useState<(QueueResult & { canManageConversations: boolean; canRemember: boolean; userId: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [category, setCategory] = useState<QueueCategory | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<Array<{ id: string; name: string }>>([])
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async (q: string) => {
    setLoading(true)
    const r = await listWorkQueueAction(q || null)
    setLoading(false)
    if (r.success) { setData(r.data); setError(null) } else setError(r.error)
  }, [])
  useEffect(() => { void load(appliedSearch) }, [load, appliedSearch])
  useEffect(() => { if (canAssign) void listAssignableProfiles().then((r) => { if (r.success) setProfiles(r.data) }) }, [canAssign])

  const userId = data?.userId ?? null
  const items = useMemo(() => (data?.items ?? []).filter((i) =>
    (!category || i.category === category)
    && (filter === 'all' || (filter === 'mine' && !!userId && i.assignedProfileId === userId) || (filter === 'unassigned' && !i.assignedProfileId)
      || (filter === 'approval' && i.needsApproval) || (filter === 'answered' && !!i.answeredAt))), [data, category, filter, userId])
  const open = items.find((i) => i.key === openKey) ?? (data?.items ?? []).find((i) => i.key === openKey) ?? null
  const batchIds = items.filter((i) => i.batchSafe && i.emailId).map((i) => i.emailId as string)
  const nameOf = (id: string | null) => (id ? profiles.find((p) => p.id === id)?.name ?? 'Medarbejder' : null)

  async function assignToMe(it: QueueItem) {
    if (!it.conversationId || !userId) return
    const r = await assignHenvendelse(it.conversationId, { profileId: userId, team: null })
    if (!r.success) { setMsg(r.error); return }
    await load(appliedSearch)
  }
  async function batchComplete() {
    const r = await completeLowRiskBatchAction(batchIds)
    setMsg(r.success ? `${r.data.completed} automatiske/interne mails afsluttet${r.data.skipped ? ` · ${r.data.skipped} sprunget over (ikke lavrisiko)` : ''}.` : r.error)
    await load(appliedSearch)
  }

  return (
    <div className="max-w-[1600px] space-y-4 p-6" data-testid="work-queue-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Arbejdskø</h1>
          <p className="text-sm text-gray-600">Alle åbne henvendelser ét sted — med forslag til kunde, sag og næste skridt. Intet sker uden dit klik.</p>
        </div>
        <div className="flex items-center gap-2">
          <form onSubmit={(e) => { e.preventDefault(); setAppliedSearch(search.trim()) }} className="relative">
            <Search className="absolute left-2 top-2 h-4 w-4 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Søg emne eller afsender" className="w-64 rounded-md border py-1.5 pl-8 pr-2 text-sm" data-testid="queue-search" />
          </form>
          <button onClick={() => void load(appliedSearch)} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50" data-testid="queue-refresh"><RefreshCw className="h-4 w-4" />Opdatér</button>
        </div>
      </div>

      {/* Tællere pr. kategori */}
      <div className="flex flex-wrap gap-2" data-testid="queue-counters">
        <button onClick={() => setCategory(null)} className={`rounded-lg border px-3 py-2 text-left ${!category ? 'border-blue-600 bg-blue-50' : 'bg-white hover:bg-gray-50'}`} data-testid="queue-count-total">
          <div className="text-xs text-gray-500">Åbne i alt</div><div className="text-lg font-semibold" data-testid="queue-total">{data?.counts.total ?? '–'}</div>
        </button>
        {QUEUE_CATEGORIES.map((c) => (
          <button key={c} onClick={() => setCategory(category === c ? null : c)} data-testid={`queue-count-${c}`}
            className={`rounded-lg border px-3 py-2 text-left ${category === c ? 'border-blue-600 bg-blue-50' : 'bg-white hover:bg-gray-50'} ${(data?.counts.byCategory[c] ?? 0) === 0 ? 'opacity-60' : ''}`}>
            <div className="text-xs text-gray-500">{CATEGORY_LABELS[c]}</div><div className="text-lg font-semibold">{data?.counts.byCategory[c] ?? '–'}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex flex-wrap gap-2" aria-label="Filter">
          {FILTERS.map(([f, label]) => (
            <button key={f} onClick={() => setFilter(f)} data-testid={`queue-filter-${f}`}
              className={`rounded-full border px-3 py-1 text-sm ${filter === f ? 'border-blue-600 bg-blue-600 text-white' : 'hover:bg-gray-50'}`}>
              {label}{f === 'approval' && data ? ` (${data.counts.needsApproval})` : f === 'answered' && data ? ` (${data.counts.answered})` : f === 'unassigned' && data ? ` (${data.counts.unassigned})` : ''}
            </button>
          ))}
        </nav>
        {batchIds.length > 0 && (
          <button onClick={() => void batchComplete()} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50" data-testid="queue-batch-complete" title="Kun automatiske systemmails og interne mails uden handling">
            <CheckCheck className="h-4 w-4" />Afslut {batchIds.length} automatiske/interne
          </button>
        )}
      </div>

      {msg && <p className="rounded-md border border-blue-200 bg-blue-50 p-2 text-sm text-blue-900" role="status" data-testid="queue-msg">{msg}</p>}
      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert" data-testid="queue-error">{error}</p>}
      {data?.truncated && <p className="text-xs text-gray-500">Viser de nyeste {data.items.length} — brug søgning for ældre.</p>}
      {!!data?.backlog && !appliedSearch && (
        <p className="text-xs text-gray-500" data-testid="queue-backlog">Køen viser de seneste {data.windowDays} dage. {data.backlog} ældre åbne mails ligger som efterslæb — find dem med søgning eller i Mail.</p>
      )}

      <div className={`grid gap-4 ${open ? 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]' : ''}`}>
        <div className="overflow-hidden rounded-lg border bg-white">
          {loading && !data && <p className="p-6 text-center text-sm text-gray-500" data-testid="queue-loading">Henter arbejdskøen …</p>}
          {data && items.length === 0 && <p className="p-6 text-center text-sm text-gray-500" data-testid="queue-empty">Ingen åbne henvendelser i denne visning. 🎉</p>}
          <ul className="divide-y" data-testid="queue-list">
            {items.map((i) => (
              <li key={i.key} onClick={() => setOpenKey(i.key)} data-testid="queue-item" data-email-id={i.emailId ?? ''} data-category={i.category} data-priority={i.priority}
                className={`cursor-pointer border-l-4 px-3 py-2 hover:bg-blue-50 ${PRIO_STYLE[i.priority]} ${openKey === i.key ? 'bg-blue-50' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${PRIO_BADGE[i.priority]}`}>{PRIORITY_LABELS[i.priority]}</span>
                    <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700">{CATEGORY_LABELS[i.category]}</span>
                    <span className={`truncate text-sm ${i.read ? 'text-gray-800' : 'font-semibold text-gray-900'}`} title={i.subject}>{i.subject}</span>
                  </div>
                  <span className="shrink-0 text-xs text-gray-500">{fmt(i.receivedAt)}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-600">
                  <span className="truncate">{CHANNEL[i.channel] ?? i.channel} · {i.senderLabel}</span>
                  {i.identity && i.identity.kind !== 'unknown' && <span className="inline-flex items-center gap-1">{i.identity.label ?? ''} <LevelBadge level={i.identity.level} /></span>}
                  {i.customerName && <span className="text-emerald-700">✓ {i.customerName}</span>}
                  {i.suggestion && <span data-testid="queue-item-suggestion"><span className="text-gray-400">Forslag:</span> {SUGGESTION_LABELS[i.suggestion.kind]}</span>}
                  {i.answeredAt && <span className="text-emerald-700" data-testid="queue-item-answered">Besvaret {fmt(i.answeredAt)}</span>}
                  <span className="ml-auto">{nameOf(i.assignedProfileId) ?? (i.conversationId ? <span className="text-red-700">Ikke tildelt</span> : null)}</span>
                  {canAssign && i.conversationId && !i.assignedProfileId && userId && (
                    <button onClick={(e) => { e.stopPropagation(); void assignToMe(i) }} className="inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 hover:bg-white" data-testid="queue-assign-me"><UserPlus className="h-3 w-3" />Tag den</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
        {open && open.emailId && (
          <div className="xl:sticky xl:top-4 xl:self-start" data-testid="queue-detail">
            <CoordinatorPanel key={open.emailId} emailId={open.emailId} canManageConversations={!!data?.canManageConversations} canRemember={!!data?.canRemember} onChanged={() => void load(appliedSearch)} />
          </div>
        )}
        {open && !open.emailId && (
          <div className="rounded-lg border bg-white p-4 text-sm" data-testid="queue-detail-conversation">
            <h2 className="font-semibold">{open.subject}</h2>
            <p className="text-gray-600">{CHANNEL[open.channel] ?? open.channel}-henvendelse · {fmt(open.receivedAt)}</p>
            <a href="/dashboard/henvendelser" className="mt-2 inline-block text-blue-700 hover:underline">Behandl i Henvendelser</a>
          </div>
        )}
      </div>
    </div>
  )
}
