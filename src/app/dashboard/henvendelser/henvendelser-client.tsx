'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  assignHenvendelse, confirmHenvendelseCase, confirmHenvendelseCustomer, createTaskFromHenvendelse, createUploadLinkForHenvendelse,
  decideHenvendelseAction, getHenvendelseDetail, listAssignableProfiles, markHenvendelseHandled, rejectHenvendelseCustomer,
  revokeUploadLink, simulateReception, syncHenvendelserFromSources,
  type HenvendelseDetail, type HenvendelseFilter, type HenvendelseRow,
} from '@/lib/actions/henvendelser'
import { searchCustomersForPickerAction } from '@/lib/actions/customers'

const CHANNEL: Record<string, string> = { phone: 'Telefon', email: 'Mail', sms: 'SMS', web_chat: 'Web', portal: 'Portal', upload_link: 'Upload' }
const URGENCY: Record<string, { label: string; cls: string }> = {
  emergency: { label: 'NØD', cls: 'bg-red-600 text-white' }, high: { label: 'Høj', cls: 'bg-orange-100 text-orange-800' },
  normal: { label: 'Normal', cls: 'bg-gray-100 text-gray-700' }, low: { label: 'Lav', cls: 'bg-gray-50 text-gray-500' },
}
const STATUS: Record<string, string> = { new: 'Ny', open: 'Åben', awaiting_customer: 'Afventer kunde', handoff: 'Kræver medarbejder', handled: 'Afsluttet', spam: 'Spam' }
const MATCH: Record<string, string> = { unique_match: 'Kandidat', ambiguous: 'Flere mulige kunder', no_match: 'Ukendt afsender', insufficient_information: 'Ingen oplysninger', read_error: 'Opslag fejlede', confirmed: 'Bekræftet', rejected: 'Kandidat afvist' }
const CASE: Record<string, string> = { exact: 'Kandidat-sag', several_open: 'Flere åbne sager', no_open_case: 'Ingen åben sag', none: '—', read_error: 'Sager kunne ikke læses', confirmed: 'Bekræftet', not_applicable: '—' }
const TEAM: Record<string, string> = { kontor: 'Kontor', service: 'Service', salg: 'Salg', bogholderi: 'Bogholderi', montor: 'Montør' }
const OUTCOME: Record<string, string> = { auto: 'Automatisk', proposal: 'Forslag', handoff: 'Kræver medarbejder', forbidden: 'Forbudt for AI' }
const ACTION_LABEL: Record<string, string> = {
  find_customer: 'Find kunde', find_contact: 'Find kontakt', find_case: 'Find sag', append_communication: 'Registrér kommunikation',
  create_task: 'Opret opgave', create_callback: 'Ring tilbage', create_planning_request: 'Planlægning', request_documents: 'Bed om billeder/dokumenter',
  create_customer_proposal: 'Ny kunde (forslag)', create_case_proposal: 'Ny sag (forslag)', mark_handled: 'Afslut henvendelse',
}
const ASTATE: Record<string, string> = { proposed: 'Afventer godkendelse', approved: 'Godkendt', executed: 'Udført', rejected: 'Afvist', failed: 'Fejlede', blocked: 'Blokeret' }
const FILTERS: Array<{ key: HenvendelseFilter; label: string }> = [
  { key: 'new', label: 'Nye/ubehandlede' }, { key: 'urgent', label: 'Haster' }, { key: 'handoff', label: 'Kræver medarbejder' },
  { key: 'phone', label: 'Telefon' }, { key: 'email', label: 'Mail' }, { key: 'sms', label: 'SMS' }, { key: 'portal_chat', label: 'Portal/chat' },
  { key: 'mine', label: 'Tildelt mig' }, { key: 'team', label: 'Mit team' }, { key: 'all', label: 'Alle' },
]
const fmt = (iso: string) => new Date(iso).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen', dateStyle: 'short', timeStyle: 'short' })

const URGENCY_RANK: Record<string, number> = { emergency: 0, high: 1, normal: 2, low: 3 }
const isUnhandled = (r: HenvendelseRow) => r.status === 'new' || r.status === 'handoff' || r.status === 'open'
/** Akutte og ubehandlede øverst; ellers serverens rækkefølge (seneste først) */
function sortRows(rows: HenvendelseRow[]): HenvendelseRow[] {
  return rows.map((r, i) => ({ r, i })).sort((a, b) => {
    const ua = a.r.status === 'handled' ? 9 : URGENCY_RANK[a.r.urgency] ?? 2, ub = b.r.status === 'handled' ? 9 : URGENCY_RANK[b.r.urgency] ?? 2
    if (ua !== ub) return ua - ub
    const ha = isUnhandled(a.r) ? 0 : 1, hb = isUnhandled(b.r) ? 0 : 1
    return ha !== hb ? ha - hb : a.i - b.i
  }).map((x) => x.r)
}
const rowAccent = (r: HenvendelseRow) => r.status === 'handled' ? 'border-l-transparent text-gray-500'
  : r.urgency === 'emergency' ? 'border-l-red-600 bg-red-50' : r.urgency === 'high' ? 'border-l-orange-500' : isUnhandled(r) ? 'border-l-blue-500' : 'border-l-transparent'

function UrgencyBadge({ urgency }: { urgency: string }) {
  const u = URGENCY[urgency]
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${u?.cls ?? ''}`} data-testid="urgency-badge">{u?.label ?? urgency}</span>
}

/** Kunde: Bekræftet (grøn ✓) / Kandidat — ikke bekræftet (gul) / ukendt / læsefejl (rød) — kan ikke forveksles */
function CustomerMatch({ row }: { row: HenvendelseRow }) {
  if (row.customer) return <div className="truncate text-green-800" title={row.customer.name} data-testid="match-customer" data-state="confirmed">✓ {row.customer.name}</div>
  if (row.candidate) return <div className="truncate text-amber-800" title={`Kandidat — ikke bekræftet: ${row.candidate.name}`} data-testid="match-customer" data-state="candidate"><span className="rounded bg-amber-100 px-1 text-xs font-semibold">Kandidat?</span> {row.candidate.name}</div>
  const err = row.customerState === 'read_error'
  return <div className={`truncate text-xs ${err ? 'font-semibold text-red-700' : 'text-gray-500'}`} data-testid="match-customer" data-state={row.customerState}>{MATCH[row.customerState] ?? row.customerState}{row.candidateHidden ? ' (skjult)' : ''}</div>
}

function CaseMatch({ row }: { row: HenvendelseRow }) {
  if (row.caseRef) return <div className="truncate text-xs text-green-800" data-testid="match-case" data-state="confirmed">✓ Sag {row.caseRef.number ?? ''}</div>
  if (row.caseCandidate) return <div className="truncate text-xs text-amber-800" data-testid="match-case" data-state="candidate">Sag? {row.caseCandidate.number}</div>
  return <div className="truncate text-xs text-gray-400" data-testid="match-case" data-state={row.caseState}>{CASE[row.caseState] ?? row.caseState}</div>
}

const ACTION_GROUPS: Array<{ key: string; title: string; states: string[]; cls: string }> = [
  { key: 'pending', title: 'Afventer din godkendelse (AI-forslag)', states: ['proposed'], cls: 'border-amber-300 bg-amber-50' },
  { key: 'approved', title: 'Godkendt — venter på udførelse', states: ['approved'], cls: 'border-blue-300 bg-blue-50' },
  { key: 'done', title: 'Udført', states: ['executed'], cls: 'border-green-300 bg-green-50' },
  { key: 'closed', title: 'Afvist / blokeret / fejlet', states: ['rejected', 'blocked', 'failed'], cls: 'border-gray-200 bg-gray-50 text-gray-600' },
]

export function HenvendelserClient(props: { filter: HenvendelseFilter; rows: HenvendelseRow[]; error: string | null; canManage: boolean; canSimulate: boolean; uploadLinks: boolean }) {
  const router = useRouter()
  const [openId, setOpenId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const open = props.rows.find((r) => r.id === openId) ?? null

  async function sync() {
    setBusy(true); setMsg(null)
    const r = await syncHenvendelserFromSources()
    setBusy(false)
    setMsg(r.success ? `Indtaget: ${r.data.created} nye, ${r.data.duplicates} kendte, ${r.data.failed} fejlede, ${r.data.skipped} sprunget over.` : r.error)
    router.refresh()
  }

  return (
    <div className="p-6 space-y-4 max-w-7xl" data-testid="henvendelser-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Henvendelser</h1>
          <p className="text-sm text-gray-600">Alle kanaler ét sted. Kunde og sag er forslag, indtil de er bekræftet. Der sendes intet herfra.</p>
        </div>
        {props.canManage && (
          <button onClick={sync} disabled={busy} className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50" data-testid="henvendelser-sync">
            Hent nye fra mail/portal
          </button>
        )}
      </div>
      <nav className="flex flex-wrap gap-2" aria-label="Filtre">
        {FILTERS.map((f) => (
          <Link key={f.key} href={`/dashboard/henvendelser?filter=${f.key}`} data-testid={`filter-${f.key}`}
            className={`rounded-full border px-3 py-1 text-sm ${props.filter === f.key ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-50'}`}>
            {f.label}
          </Link>
        ))}
      </nav>
      {msg && <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900" role="status">{msg}</p>}
      {props.error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert" data-testid="henvendelser-error">{props.error}</p>}
      {props.canSimulate && <Simulator onSaved={() => router.refresh()} />}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="rounded-lg border bg-white">
          <table className="w-full table-fixed text-sm" data-testid="henvendelser-table">
            <colgroup><col className="w-24" /><col className="w-28" /><col className="w-48" /><col /><col className="w-28" /></colgroup>
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2">Haster</th><th className="px-3 py-2">Kanal · tid</th><th className="px-3 py-2">Kunde · sag</th>
                <th className="px-3 py-2">Resumé · næste skridt</th><th className="px-3 py-2">Ansvarlig</th>
              </tr>
            </thead>
            <tbody>
              {!props.error && props.rows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Ingen henvendelser i dette filter.</td></tr>}
              {sortRows(props.rows).map((r) => (
                <tr key={r.id} onClick={() => setOpenId(r.id)}
                  className={`cursor-pointer border-t border-l-4 align-top hover:bg-blue-50 ${rowAccent(r)} ${openId === r.id ? 'bg-blue-50' : ''}`}
                  data-testid="henvendelse-row" data-urgency={r.urgency} data-unhandled={isUnhandled(r) ? 'true' : 'false'}>
                  <td className="px-3 py-2 space-y-1">
                    <UrgencyBadge urgency={r.urgency} />
                    <div className={`text-xs ${isUnhandled(r) ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{isUnhandled(r) ? '● ' : ''}{STATUS[r.status] ?? r.status}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700">
                    <div className="font-medium text-gray-900">{CHANNEL[r.channel] ?? r.channel}{r.intakeActor === 'ai_receptionist' ? ' · AI' : ''}</div>
                    <div>{fmt(r.lastAt)}</div>
                  </td>
                  <td className="px-3 py-2 space-y-1 min-w-0">
                    <CustomerMatch row={r} />
                    <CaseMatch row={r} />
                  </td>
                  <td className="px-3 py-2 min-w-0">
                    <div className="truncate" title={r.aiSummary ?? r.title}>{r.aiSummary ?? r.title}</div>
                    {r.nextAction && <div className="truncate text-xs text-gray-600" title={r.nextAction}>→ {r.nextAction}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs truncate">{r.assignedName ?? (r.assignedTeam ? `Team ${TEAM[r.assignedTeam]}` : <span className="text-red-700">Ingen</span>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {open ? <DetailPanel key={open.id} row={open} canManage={props.canManage} uploadLinks={props.uploadLinks} onChanged={() => router.refresh()} />
          : <div className="hidden xl:block rounded-lg border border-dashed p-6 text-sm text-gray-500">Vælg en henvendelse for at se hele konteksten.</div>}
      </div>
    </div>
  )
}

function DetailPanel({ row, canManage, uploadLinks, onChanged }: { row: HenvendelseRow; canManage: boolean; uploadLinks: boolean; onChanged: () => void }) {
  const [detail, setDetail] = useState<HenvendelseDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [search, setSearch] = useState('')
  const [hits, setHits] = useState<Array<{ id: string; name: string }>>([])
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>([])
  const [link, setLink] = useState<string | null>(null)

  const load = () => getHenvendelseDetail(row.id).then((r) => (r.success ? (setDetail(r.data), setErr(null)) : setErr(r.error)))
  useEffect(() => { load() }, [row.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (canManage) listAssignableProfiles().then((r) => r.success && setPeople(r.data)) }, [canManage])

  async function run(fn: () => Promise<{ success: boolean; error?: string; data?: unknown }>, ok: string) {
    setBusy(true); setMsg(null)
    const r = await fn()
    setBusy(false)
    if (r.success) { setMsg(ok); await load(); onChanged() } else setMsg(r.error ?? 'Fejl')
  }

  async function doSearch(q: string) {
    setSearch(q)
    if (q.trim().length < 2) { setHits([]); return }
    const r = await searchCustomersForPickerAction(q)
    if (r.success && r.data) setHits(r.data.map((c) => ({ id: c.id, name: `${c.company_name}${c.customer_number ? ` (${c.customer_number})` : ''}` })))
  }

  return (
    <aside className="rounded-lg border bg-white p-4 space-y-4 text-sm" data-testid="henvendelse-detail">
      <div>
        <div className="text-xs text-gray-500">{CHANNEL[row.channel] ?? row.channel} · {fmt(row.lastAt)} · {STATUS[row.status] ?? row.status}</div>
        <h2 className="font-semibold text-gray-900">{row.title}</h2>
        {row.aiSummary && <p className="mt-1 text-gray-700">{row.aiSummary}</p>}
        {row.handoffReasons.length > 0 && <p className="mt-2 rounded bg-amber-50 p-2 text-amber-900" data-testid="handoff-reasons">Kræver medarbejder: {row.handoffReasons.join(', ')}</p>}
      </div>
      {msg && <p className="rounded border border-blue-200 bg-blue-50 p-2 text-blue-900" role="status">{msg}</p>}
      {err && <p className="rounded border border-red-200 bg-red-50 p-2 text-red-800" role="alert">{err}</p>}

      <section className="space-y-2">
        <h3 className="font-medium">Kunde</h3>
        {row.customer ? (
          <p className="rounded border border-green-300 bg-green-50 p-2" data-testid="detail-customer-confirmed">✓ Bekræftet kunde: <Link className="font-medium text-blue-700 hover:underline" href={`/dashboard/customers/${row.customer.id}`}>{row.customer.name}</Link></p>
        ) : (
          <>
            <p className={`rounded border p-2 ${row.candidate ? 'border-amber-300 bg-amber-50 text-amber-900' : row.customerState === 'read_error' ? 'border-red-300 bg-red-50 text-red-800' : 'border-gray-200 bg-gray-50 text-gray-700'}`} data-testid="detail-customer-unconfirmed">
              {row.candidate ? `IKKE BEKRÆFTET — kandidat: ${row.candidate.name}` : (MATCH[row.customerState] ?? row.customerState)}{row.candidateHidden ? ' (kandidaten er skjult for dig)' : ''}
            </p>
            {canManage && row.candidate && (
              <div className="flex gap-2">
                <button disabled={busy} data-testid="confirm-candidate" className="rounded bg-blue-600 px-2 py-1 text-white disabled:opacity-50" onClick={() => run(() => confirmHenvendelseCustomer(row.id, row.candidate!.id, row.matchVersion), 'Kunden er bekræftet.')}>Bekræft kandidat</button>
                <button disabled={busy} className="rounded border px-2 py-1 disabled:opacity-50" onClick={() => run(() => rejectHenvendelseCustomer(row.id, row.matchVersion), 'Kandidaten er afvist.')}>Forkert kunde</button>
              </div>
            )}
          </>
        )}
        {canManage && (
          <div>
            <input value={search} onChange={(e) => doSearch(e.target.value)} placeholder="Vælg en anden kunde (søg)" className="w-full rounded border px-2 py-1" data-testid="customer-search" />
            {hits.length > 0 && (
              <ul className="mt-1 max-h-40 overflow-auto rounded border">
                {hits.map((h) => (
                  <li key={h.id}><button disabled={busy} className="w-full px-2 py-1 text-left hover:bg-gray-50" onClick={() => run(() => confirmHenvendelseCustomer(row.id, h.id, row.matchVersion), 'Kunden er bekræftet.')}>{h.name}</button></li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Sag</h3>
        {row.caseRef ? <p className="rounded border border-green-300 bg-green-50 p-2">✓ Bekræftet sag: <Link className="font-medium text-blue-700 hover:underline" href={`/dashboard/orders/${row.caseRef.id}`}>{row.caseRef.number ?? 'Sag'}</Link></p>
          : <p className="text-gray-700">{CASE[row.caseState] ?? row.caseState}{row.caseCandidate ? `: ${row.caseCandidate.number}` : ''}</p>}
        {canManage && row.customer && detail && detail.openCases.length > 0 && !row.caseRef && (
          <select disabled={busy} defaultValue="" data-testid="case-select" className="w-full rounded border px-2 py-1"
            onChange={(e) => e.target.value && run(() => confirmHenvendelseCase(row.id, e.target.value, row.matchVersion), 'Sagen er bekræftet.')}>
            <option value="">Vælg sag …</option>
            {detail.openCases.map((c) => <option key={c.id} value={c.id}>{c.number ?? ''} {c.title}</option>)}
          </select>
        )}
      </section>

      {canManage && (
        <section className="space-y-2">
          <h3 className="font-medium">Handlinger</h3>
          <div className="flex gap-2">
            <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Opgavetitel" className="flex-1 rounded border px-2 py-1" />
            <button disabled={busy || !taskTitle.trim()} className="rounded border px-2 py-1 disabled:opacity-50" onClick={() => run(() => createTaskFromHenvendelse(row.id, taskTitle), 'Opgaven er oprettet.')}>Opret opgave</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <select disabled={busy} defaultValue="" className="rounded border px-2 py-1" data-testid="assign-select"
              onChange={(e) => { const v = e.target.value; if (!v) return; const [kind, id] = v.split(':'); run(() => assignHenvendelse(row.id, kind === 'p' ? { profileId: id, team: row.assignedTeam } : { profileId: null, team: id }), 'Tildelt.') }}>
              <option value="">Tildel / overdrag …</option>
              {Object.entries(TEAM).map(([k, v]) => <option key={k} value={`t:${k}`}>Team: {v}</option>)}
              {people.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.name}</option>)}
            </select>
            {row.status !== 'handled' && <button disabled={busy} data-testid="mark-handled" className="rounded border px-2 py-1 disabled:opacity-50" onClick={() => run(() => markHenvendelseHandled(row.id), 'Henvendelsen er afsluttet.')}>Markér som håndteret</button>}
            {uploadLinks && row.customer && (
              <button disabled={busy} className="rounded border px-2 py-1 disabled:opacity-50" onClick={async () => { setBusy(true); const r = await createUploadLinkForHenvendelse(row.id); setBusy(false); if (r.success) { setLink(r.data.url); await load() } else setMsg(r.error) }}>Opret upload-link</button>
            )}
          </div>
          {link && <p className="break-all rounded bg-gray-50 p-2" data-testid="upload-link">Del selv dette link med kunden (vises kun nu, sendes ikke): {link}</p>}
        </section>
      )}

      {detail && (
        <>
          <section className="space-y-1">
            <h3 className="font-medium">AI-forslag og handlinger</h3>
            {detail.actions.length === 0 && <p className="text-gray-500">Ingen.</p>}
            <div className="space-y-2" data-testid="action-list">
              {ACTION_GROUPS.map((g) => {
                const list = detail.actions.filter((a) => g.states.includes(a.state))
                if (!list.length) return null
                return (
                  <div key={g.key} className={`rounded border p-2 ${g.cls}`} data-testid={`action-group-${g.key}`}>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide">{g.title} ({list.length})</div>
                    <ul className="space-y-1">
                      {list.map((a) => (
                        <li key={a.id} className="rounded bg-white/70 p-2" data-testid="action-item" data-state={a.state}>
                          <div className="flex items-center justify-between gap-2">
                            <span>{ACTION_LABEL[a.type] ?? a.type} · <span className="text-gray-600">{OUTCOME[a.outcome] ?? a.outcome}</span> · <strong>{ASTATE[a.state] ?? a.state}</strong>{a.actor === 'user' ? ' · medarbejder' : ' · AI'}</span>
                            {canManage && a.state === 'proposed' && a.outcome !== 'forbidden' && (
                              <span className="flex gap-1">
                                <button disabled={busy} className="rounded bg-blue-600 px-2 py-0.5 text-white disabled:opacity-50" onClick={() => run(async () => { const r = await decideHenvendelseAction(a.id, 'approve'); if (r.success && r.data.hint) setTimeout(() => setMsg(r.data.hint), 0); return r }, 'Godkendt.')}>Godkend</button>
                                <button disabled={busy} className="rounded border bg-white px-2 py-0.5 disabled:opacity-50" onClick={() => run(() => decideHenvendelseAction(a.id, 'reject'), 'Afvist.')}>Afvis</button>
                              </span>
                            )}
                          </div>
                          {a.reasons.length > 0 && <div className="text-xs text-gray-500">{a.reasons.join(' · ')}</div>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </section>
          <section className="space-y-1">
            <h3 className="font-medium">Kommunikation</h3>
            <ul className="space-y-1">
              {detail.items.map((i) => (
                <li key={i.id} className="rounded bg-gray-50 p-2">
                  <div className="text-xs text-gray-500">{CHANNEL[i.channel] ?? i.channel} · {i.direction === 'inbound' ? 'ind' : i.direction === 'outbound' ? 'ud' : 'intern'} · {fmt(i.occurredAt)}{i.sender ? ` · ${i.sender}` : ''}{i.attachments ? ` · ${i.attachments} fil(er)` : ''}{i.transcript === 'unavailable' ? ' · transskription mangler' : ''}</div>
                  <div>{i.title}</div>
                  {i.preview && <div className="text-gray-700">{i.preview}</div>}
                </li>
              ))}
            </ul>
          </section>
          {detail.uploadLinks.length > 0 && (
            <section className="space-y-1">
              <h3 className="font-medium">Upload-links</h3>
              {detail.uploadLinks.map((l) => (
                <div key={l.id} className="flex items-center justify-between rounded border p-2">
                  <span>{l.filesUploaded}/{l.maxFiles} filer · udløber {fmt(l.expiresAt)}{l.revoked ? ' · lukket' : ''}</span>
                  {canManage && !l.revoked && <button disabled={busy} className="rounded border px-2 py-0.5" onClick={() => run(() => revokeUploadLink(l.id), 'Linket er lukket.')}>Luk</button>}
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </aside>
  )
}

function Simulator({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ text: '', phone: '', email: '', customerNumber: '', postalCode: '', streetName: '', caseNumber: '' })
  const [res, setRes] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function go(persist: boolean) {
    setBusy(true)
    const r = await simulateReception({ ...f, persist })
    setBusy(false)
    if (!r.success) { setRes(r.error); return }
    const t = r.data.turn
    setRes([
      `Identitet: ${t.identity.state} · niveau L${t.level} · intent: ${t.intent} (${Math.round(t.confidence * 100)}%) · haster: ${t.urgency}`,
      `Sag: ${t.caseMatch.state} · handoff: ${t.handoff ? `${t.handoff.reasons.join(', ')} → ${t.handoff.team}` : 'nej'}`,
      `Handlinger: ${t.actions.map((a) => `${a.type}=${a.outcome}`).join(', ')}`,
      `Afvist som tilsagn: ${t.commitmentsRefused.join(', ') || '—'}`,
      `Svar til kunden: ${t.reply}`,
      ...(r.data.conversationId ? [`Gemt som henvendelse. Udfaldet: ${r.data.actions.map((a) => `${a.type}=${a.state}`).join(', ')}`] : []),
      ...t.notes.map((n) => `Note: ${n}`),
    ].join('\n'))
    if (persist) onSaved()
  }
  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="rounded-lg border bg-white p-3" data-testid="simulator">
      <summary className="cursor-pointer text-sm font-medium">Test-simulator (tekst, før stemme) — sender intet</summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
        <textarea value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="Fx: Mit batteri går offline." className="sm:col-span-2 rounded border px-2 py-1" rows={2} data-testid="sim-text" />
        <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Opkalds-nummer" className="rounded border px-2 py-1" data-testid="sim-phone" />
        <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="E-mail" className="rounded border px-2 py-1" />
        <input value={f.postalCode} onChange={(e) => setF({ ...f, postalCode: e.target.value })} placeholder="Oplyst postnr." className="rounded border px-2 py-1" />
        <input value={f.streetName} onChange={(e) => setF({ ...f, streetName: e.target.value })} placeholder="Oplyst vejnavn" className="rounded border px-2 py-1" />
        <input value={f.caseNumber} onChange={(e) => setF({ ...f, caseNumber: e.target.value })} placeholder="Oplyst sagsnummer" className="rounded border px-2 py-1" />
        <input value={f.customerNumber} onChange={(e) => setF({ ...f, customerNumber: e.target.value })} placeholder="Oplyst kundenummer" className="rounded border px-2 py-1" />
        <div className="sm:col-span-2 flex gap-2">
          <button disabled={busy} onClick={() => go(false)} className="rounded border px-3 py-1 disabled:opacity-50" data-testid="sim-run">Kør (gem intet)</button>
          <button disabled={busy} onClick={() => go(true)} className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50" data-testid="sim-save">Kør og gem som henvendelse</button>
        </div>
        {res && <pre className="sm:col-span-2 whitespace-pre-wrap rounded bg-gray-50 p-2" data-testid="sim-result">{res}</pre>}
      </div>
    </details>
  )
}
