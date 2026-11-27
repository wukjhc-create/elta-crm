'use client'

/**
 * C2/C3 — afsender, forslag og kunde-/sagsoverblik for én mail. Bruges i arbejdskøen (C7) og i mailvisningen.
 * Medarbejderen godkender, vælger et alternativ eller afviser; serveren udfører via eksisterende koblingsstier.
 * Ingen tekniske regel-id'er i den almindelige visning — de ligger under "Tekniske detaljer" (kun admin).
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, X, UserCheck, Archive, RotateCcw, ExternalLink, ChevronDown, ChevronRight, Mail, Phone, MapPin, Briefcase } from 'lucide-react'
import {
  completeQueueItemAction, decideCoordinatorSuggestionAction, getCoordinatorViewAction, rememberSenderAction, reopenQueueItemAction,
} from '@/lib/actions/coordinator'
import type { CoordinatorView } from '@/lib/coordinator/view'
import { SUGGESTION_LABELS, CATEGORY_LABELS, PRIORITY_LABELS, type Suggestion } from '@/lib/coordinator/suggestions'
import { CustomerCreateWithDuplicateCheck } from './customer-create-dedupe'

const LEVEL_STYLE: Record<string, string> = {
  verified: 'bg-emerald-100 text-emerald-800 border-emerald-200', probable: 'bg-blue-100 text-blue-800 border-blue-200',
  uncertain: 'bg-amber-100 text-amber-800 border-amber-200', unknown: 'bg-gray-100 text-gray-700 border-gray-200',
}
const LEVEL_TEXT: Record<string, string> = { verified: 'Verificeret', probable: 'Sandsynlig', uncertain: 'Usikker', unknown: 'Ukendt' }
const KIND_TEXT: Record<string, string> = {
  customer: 'Eksisterende kunde', contact: 'Kontaktperson', prospect: 'Potentiel kunde', supplier: 'Leverandør', partner: 'Samarbejdspartner',
  employee: 'Medarbejder', automated: 'Automatisk afsender', unknown: 'Ukendt afsender',
}
const STATUS_TEXT: Record<string, string> = { new: 'Ny', in_progress: 'I gang', pending: 'Afventer', closed: 'Lukket', converted: 'Konverteret' }
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Copenhagen' }) : '')

export function LevelBadge({ level }: { level: string }) {
  return <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${LEVEL_STYLE[level] ?? LEVEL_STYLE.unknown}`} data-testid="level-badge" data-level={level}>{LEVEL_TEXT[level] ?? level}</span>
}

export function CoordinatorPanel({ emailId, canManageConversations, canRemember, onChanged, compact = false }: {
  emailId: string; canManageConversations: boolean; canRemember: boolean; onChanged?: () => void; compact?: boolean
}) {
  const [view, setView] = useState<CoordinatorView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [showAlt, setShowAlt] = useState(false)
  const [showTech, setShowTech] = useState(false)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const r = await getCoordinatorViewAction(emailId)
    if (r.success) { setView(r.data); setError(null) } else setError(r.error)
  }, [emailId])
  useEffect(() => { setView(null); setMsg(null); setShowAlt(false); void load() }, [load])

  async function decide(s: Suggestion, decision: 'accept' | 'change' | 'reject') {
    if (!view) return
    setBusy(true); setMsg(null)
    const p = view.suggestions.primary
    const r = await decideCoordinatorSuggestionAction({ emailId, decision, kind: s.kind, customerId: s.customerId, caseId: s.caseId,
      suggested: { kind: p.kind, level: p.level, customerId: p.customerId, caseId: p.caseId } })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    setMsg(decision === 'reject' ? 'Forslaget er afvist — intet er ændret.' : r.data.result === 'unchanged' ? 'Allerede udført — intet ændret.' : 'Udført.')
    await load(); onChanged?.()
  }
  async function complete(reason: 'handled' | 'answered_outlook' | 'not_relevant') {
    setBusy(true); setMsg(null)
    const r = await completeQueueItemAction(emailId, { reason })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    setMsg(r.data.conversationClosed ? 'Afsluttet — henvendelsen er lukket og mailen arkiveret.' : 'Afsluttet — mailen er arkiveret.')
    await load(); onChanged?.()
  }
  async function reopen() {
    setBusy(true); const r = await reopenQueueItemAction(emailId); setBusy(false)
    if (!r.success) { setError(r.error); return }
    setMsg('Genåbnet.'); await load(); onChanged?.()
  }
  async function remember(customerId: string, scope: 'email' | 'domain') {
    setBusy(true); const r = await rememberSenderAction({ emailId, customerId, scope }); setBusy(false)
    if (!r.success) { setError(r.error); return }
    setMsg(r.data.added ? 'Afsenderen huskes fremover.' : 'Afsenderen var allerede husket.'); await load()
  }

  if (error && !view) return <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert" data-testid="coordinator-error">{error}</p>
  if (!view) return <p className="p-3 text-sm text-gray-500" data-testid="coordinator-loading">Finder afsender og forslag …</p>

  const s = view.suggestions
  const done = view.status.archived || view.status.handled || view.status.ignored
  const linkedCustomer = view.linked.customerId ? view.customers[view.linked.customerId] : null
  const focusCustomerId = view.linked.customerId ?? s.primary.customerId ?? null
  const focusCustomer = focusCustomerId ? view.customers[focusCustomerId] : null
  const openCases = view.cases.filter((c) => c.open && (!focusCustomerId || c.customerId === focusCustomerId))
  const executable = ['link_customer', 'link_case', 'create_service_case', 'create_lead'].includes(s.primary.kind)
  const customerAlts = s.alternatives.filter((a) => a.kind === 'link_customer')
  const otherAlts = s.alternatives.filter((a) => a.kind !== 'link_customer')

  return (
    <div className={`space-y-3 text-sm ${compact ? '' : 'rounded-lg border bg-white p-4'}`} data-testid="coordinator-panel" data-category={s.category} data-suggestion={s.primary.kind}>
      {!compact && (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-gray-900" title={view.subject ?? ''}>{view.subject ?? '(intet emne)'}</h2>
            <p className="text-xs text-gray-500">{view.sender.name ? `${view.sender.name} · ` : ''}{view.sender.email ?? 'ukendt afsender'} · {fmt(view.receivedAt)}</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded bg-gray-100 px-1.5 py-0.5" data-testid="coordinator-category">{CATEGORY_LABELS[s.category]}</span>
            <span className="rounded bg-gray-100 px-1.5 py-0.5">{PRIORITY_LABELS[s.priority]}</span>
            <Link href={`/dashboard/mail?emailId=${view.emailId}`} className="inline-flex items-center gap-1 text-blue-700 hover:underline" data-testid="coordinator-open-mail"><ExternalLink className="h-3 w-3" />Åbn mail</Link>
          </div>
        </div>
      )}

      {/* Afsender */}
      <section className="rounded-md border border-gray-200 p-3" data-testid="coordinator-identity" data-kind={view.identity.kind} data-level={view.identity.level}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-gray-900">{KIND_TEXT[view.identity.kind]}</span>
          <LevelBadge level={view.identity.level} />
          {view.identity.primaryLabel && <span className="text-gray-700" data-testid="coordinator-identity-label">{view.identity.primaryLabel}</span>}
          {view.sender.forwardedBy && <span className="text-xs text-gray-500">videresendt</span>}
        </div>
        <ul className="mt-1 space-y-0.5 text-xs text-gray-600" data-testid="coordinator-reasons">
          {view.identity.explanation.slice(1, 6).map((l, i) => <li key={i}>• {l}</li>)}
        </ul>
        {canRemember && focusCustomer && view.identity.level !== 'verified' && !done && view.sender.email && view.identity.kind !== 'supplier' && (
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <button disabled={busy} onClick={() => void remember(focusCustomer.id, 'email')} className="rounded border px-2 py-0.5 hover:bg-gray-50" data-testid="coordinator-remember-email">Husk afsender for {focusCustomer.name}</button>
          </div>
        )}
      </section>

      {/* Forslag */}
      {!done && (
        <section className="rounded-md border border-blue-200 bg-blue-50/50 p-3" data-testid="coordinator-suggestion">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-blue-800">Forslag</span>
            <span className="font-medium text-gray-900" data-testid="coordinator-suggestion-kind">{SUGGESTION_LABELS[s.primary.kind]}</span>
            <LevelBadge level={s.primary.level} />
          </div>
          <ul className="mt-1 space-y-0.5 text-gray-700" data-testid="coordinator-suggestion-reasons">{s.primary.reasons.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}</ul>
          <div className="mt-2 flex flex-wrap gap-2">
            {executable && !s.alreadyDone && (
              <button disabled={busy} onClick={() => void decide(s.primary, 'accept')} className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50" data-testid="coordinator-accept">
                <Check className="h-4 w-4" />Godkend
              </button>
            )}
            {(s.primary.kind === 'create_customer' || s.primary.kind === 'identify_sender' || s.primary.kind === 'choose_between') && (
              <button disabled={busy} onClick={() => setCreating(true)} className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-white px-3 py-1.5 hover:bg-blue-50" data-testid="coordinator-create-customer">
                <UserCheck className="h-4 w-4" />Opret ny kunde
              </button>
            )}
            {!s.alreadyDone && s.primary.kind !== 'no_action' && (
              <button disabled={busy} onClick={() => void decide(s.primary, 'reject')} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 hover:bg-white" data-testid="coordinator-reject">
                <X className="h-4 w-4" />Afvis
              </button>
            )}
            {(customerAlts.length > 0 || otherAlts.length > 0) && (
              <button onClick={() => setShowAlt((x) => !x)} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 hover:bg-white" data-testid="coordinator-show-alternatives">
                {showAlt ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}Andre muligheder ({customerAlts.length + otherAlts.length})
              </button>
            )}
          </div>
          {(showAlt || s.primary.kind === 'choose_between') && (customerAlts.length > 0 || otherAlts.length > 0) && (
            <ul className="mt-2 divide-y rounded border bg-white" data-testid="coordinator-alternatives">
              {[...customerAlts, ...otherAlts].map((a, i) => {
                const c = a.customerId ? view.customers[a.customerId] : null
                return (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5" data-testid="coordinator-alternative" data-kind={a.kind}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><span className="truncate">{a.reasons[0]}</span><LevelBadge level={a.level} /></div>
                      {c && <div className="text-xs text-gray-500">{c.customerNumber ? `${c.customerNumber} · ` : ''}{c.phone ?? ''}{c.address ? ` · ${c.address}` : ''}{c.autoCreated ? ' · automatisk oprettet' : ''}</div>}
                    </div>
                    {['link_customer', 'link_case', 'create_service_case', 'create_lead'].includes(a.kind) && (
                      <button disabled={busy} onClick={() => void decide(a, 'change')} className="rounded border px-2 py-0.5 text-xs hover:bg-gray-50" data-testid="coordinator-choose">Vælg</button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {creating && (
        <CustomerCreateWithDuplicateCheck emailId={emailId} onClose={() => setCreating(false)} onDone={async (m) => { setCreating(false); setMsg(m); await load(); onChanged?.() }} />
      )}

      {/* Kunde og sager */}
      {(focusCustomer || openCases.length > 0) && (
        <section className="grid gap-3 md:grid-cols-2" data-testid="coordinator-context">
          {focusCustomer && (
            <div className="rounded-md border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <Link href={`/dashboard/customers/${focusCustomer.id}`} className="font-medium text-blue-700 hover:underline" data-testid="coordinator-customer-link">{focusCustomer.name}</Link>
                <span className="text-xs text-gray-500">{focusCustomer.customerNumber}</span>
              </div>
              <div className="mt-1 space-y-0.5 text-xs text-gray-600">
                {focusCustomer.email && <div className="flex items-center gap-1"><Mail className="h-3 w-3" />{focusCustomer.email}</div>}
                {focusCustomer.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{focusCustomer.phone}</div>}
                {focusCustomer.address && <div className="flex items-center gap-1"><MapPin className="h-3 w-3" />{focusCustomer.address}</div>}
                {linkedCustomer && <div className="text-emerald-700">{view.linked.human ? 'Koblet af medarbejder' : 'Koblet automatisk — bekræft gerne'}</div>}
              </div>
            </div>
          )}
          <div className="rounded-md border border-gray-200 p-3">
            <div className="mb-1 flex items-center gap-1 font-medium text-gray-900"><Briefcase className="h-4 w-4" />Åbne sager</div>
            {openCases.length === 0 ? <p className="text-xs text-gray-500">Ingen åbne sager</p> : (
              <ul className="space-y-1 text-xs" data-testid="coordinator-cases">
                {openCases.slice(0, 5).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <Link href={`/dashboard/orders/${c.id}`} className="truncate text-blue-700 hover:underline">{c.caseNumber} · {c.title ?? ''}</Link>
                    <span className="shrink-0 text-gray-500">{STATUS_TEXT[c.status] ?? c.status}{view.linked.serviceCaseId === c.id ? ' · koblet' : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* Behandlingsstatus (D2/D3) */}
      <section className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 p-3" data-testid="coordinator-status" data-done={done ? 'true' : 'false'}>
        <div className="text-xs text-gray-700">
          {done ? <span className="font-medium text-emerald-700">✓ Færdigbehandlet{view.status.handled ? ' (henvendelsen er lukket)' : ''}</span>
            : view.status.answeredAt ? <span data-testid="coordinator-answered">Besvaret fra ELTA {fmt(view.status.answeredAt)} (Outlook eller CRM) — afslut hvis sagen er klaret</span>
            : <span className="text-gray-500" data-testid="coordinator-no-signal">Ingen registreret behandling endnu (at mailen er læst i Outlook tæller ikke)</span>}
          {view.conversation && view.conversation.noiseActions > 0 && <span className="ml-2 text-gray-400">· {view.conversation.noiseActions} logposter skjult</span>}
        </div>
        <div className="flex gap-2">
          {!done && (
            <>
              <button disabled={busy || (!!view.conversation && !canManageConversations)} onClick={() => void complete(view.status.answeredAt ? 'answered_outlook' : 'handled')}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50" data-testid="coordinator-complete">
                <Archive className="h-4 w-4" />Afslut
              </button>
              <button disabled={busy || (!!view.conversation && !canManageConversations)} onClick={() => void complete('not_relevant')} className="rounded-md border px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50" data-testid="coordinator-not-relevant">Ikke relevant</button>
            </>
          )}
          {done && view.status.archived && (
            <button disabled={busy} onClick={() => void reopen()} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 hover:bg-gray-50" data-testid="coordinator-reopen"><RotateCcw className="h-4 w-4" />Genåbn</button>
          )}
        </div>
      </section>

      {msg && <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900" role="status" data-testid="coordinator-msg">{msg}</p>}
      {error && view && <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800" role="alert" data-testid="coordinator-action-error">{error}</p>}

      {view.technical && (
        <div className="text-xs text-gray-500">
          <button onClick={() => setShowTech((x) => !x)} className="inline-flex items-center gap-1 hover:underline" data-testid="coordinator-technical-toggle">
            {showTech ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}Tekniske detaljer (admin)
          </button>
          {showTech && <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 font-mono text-[11px]" data-testid="coordinator-technical">{JSON.stringify(view.technical, null, 2)}</pre>}
        </div>
      )}
    </div>
  )
}
