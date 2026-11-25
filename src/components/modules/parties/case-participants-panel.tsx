'use client'

/**
 * Sag/ordre → "Sagsdeltagere" (fase B). Vises kun når PARTIES_UI_ENABLED er tændt (server-prop). Deltagelse giver INGEN
 * portaladgang. Tilføj/afslut: parties.manage ELLER cases.edit — cases.edit alene kan kun bruge sagens egne kunder/kontakt
 * (databasen håndhæver det) og koble eksisterende parter; ny fri part kræver parties.manage.
 */
import { useCallback, useEffect, useState } from 'react'
import { Plus, Users, X } from 'lucide-react'
import {
  addCaseParticipantAction,
  addCaseParticipantFromRegisterAction,
  endCaseParticipantAction,
  getCaseParticipantsAction,
  searchPartiesAction,
  type CaseParticipantsView,
  type PartyCandidate,
  type PartyRow,
} from '@/lib/actions/parties'
import { CASE_PARTICIPANT_ROLES, type CaseParticipantRole } from '@/lib/parties/audience'
import { PARTICIPANT_ROLE_LABELS, PARTY_INTERNAL_NOTE } from './party-labels'
import { PartyCreateForm } from './party-create-form'

export interface CaseRegisterOption { register: 'customer' | 'customer_contact'; id: string; label: string; defaultRole: CaseParticipantRole }

type Mode = null | 'case' | 'search' | 'new'

export function CaseParticipantsPanel({ caseId, caseOptions }: { caseId: string; caseOptions: CaseRegisterOption[] }) {
  const [view, setView] = useState<CaseParticipantsView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<Mode>(null)
  const [role, setRole] = useState<CaseParticipantRole>('cooperation_partner')
  const [note, setNote] = useState('')
  const [optionKey, setOptionKey] = useState(caseOptions[0] ? `${caseOptions[0].register}:${caseOptions[0].id}` : '')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PartyRow[]>([])

  const load = useCallback(async () => {
    const res = await getCaseParticipantsAction(caseId)
    if (res.success && res.data) { setView(res.data); setError(null) } else setError(res.error ?? 'Kunne ikke hente sagsdeltagere')
  }, [caseId])

  useEffect(() => { void load() }, [load])

  async function done(res: { success: boolean; error?: string; data?: { status: string; warnings?: string[] } }) {
    setBusy(false)
    if (!res.success) { setError(res.error ?? 'Fejl'); return }
    setError(null)
    setNotice(res.data?.status === 'existing' ? 'Parten er allerede deltager med den rolle.' : res.data?.warnings?.includes('same_email_other_customer_party') ? 'Bemærk: en anden kunde med samme e-mail har allerede en part (mulig dublet-kunde).' : null)
    setMode(null)
    setNote('')
    await load()
  }

  async function addFromCase() {
    const opt = caseOptions.find((o) => `${o.register}:${o.id}` === optionKey)
    if (!opt) return
    setBusy(true)
    await done(await addCaseParticipantFromRegisterAction(caseId, opt.register, opt.id, role, note))
  }

  async function addExisting(partyId: string) {
    setBusy(true)
    await done(await addCaseParticipantAction(caseId, partyId, role, note))
  }

  async function useCandidate(c: PartyCandidate) {
    setBusy(true)
    if (c.source === 'party') await done(await addCaseParticipantAction(caseId, c.id, role, note))
    else await done(await addCaseParticipantFromRegisterAction(caseId, c.source, c.id, role, note))
  }

  async function search(q: string) {
    setQuery(q)
    if (q.trim().length < 2) { setResults([]); return }
    const res = await searchPartiesAction(q)
    if (res.success && res.data) setResults(res.data)
  }

  const active = view?.participants.filter((p) => !p.ended_at) ?? []
  const ended = view?.participants.filter((p) => p.ended_at) ?? []

  return (
    <div className="rounded-lg border bg-white p-4" data-testid="case-participants-panel">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4" />Sagsdeltagere</h3>
        {view?.canEdit && mode === null && (
          <div className="flex gap-1">
            {caseOptions.length > 0 && <button type="button" onClick={() => setMode('case')} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs hover:bg-gray-50" data-testid="participant-add-case"><Plus className="h-3 w-3" />Fra sagen</button>}
            <button type="button" onClick={() => setMode('search')} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs hover:bg-gray-50"><Plus className="h-3 w-3" />Eksisterende part</button>
            {view.canManage && <button type="button" onClick={() => setMode('new')} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs hover:bg-gray-50" data-testid="participant-add-new"><Plus className="h-3 w-3" />Ny part</button>}
          </div>
        )}
      </div>
      <p className="mb-3 text-xs text-gray-500">{PARTY_INTERNAL_NOTE}</p>
      {error && <p className="mb-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-2 text-sm text-amber-800">{notice}</p>}

      {mode !== null && (
        <div className="mb-3 space-y-2 rounded-md border bg-gray-50 p-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <label className="text-xs text-gray-600">Rolle
              <select value={role} onChange={(e) => setRole(e.target.value as CaseParticipantRole)} className="ml-1 rounded border px-1 py-0.5 text-sm">
                {CASE_PARTICIPANT_ROLES.map((r) => <option key={r} value={r}>{PARTICIPANT_ROLE_LABELS[r]}</option>)}
              </select>
            </label>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note (valgfri)" className="min-w-[10rem] flex-1 rounded border px-2 py-0.5 text-sm" />
          </div>
          {mode === 'case' && (
            <div className="flex flex-wrap items-center gap-2">
              <select value={optionKey} onChange={(e) => {
                setOptionKey(e.target.value)
                const o = caseOptions.find((x) => `${x.register}:${x.id}` === e.target.value)
                if (o) setRole(o.defaultRole)
              }} className="rounded border px-1 py-0.5 text-sm">
                {caseOptions.map((o) => <option key={`${o.register}:${o.id}`} value={`${o.register}:${o.id}`}>{o.label}</option>)}
              </select>
              <button type="button" disabled={busy} onClick={addFromCase} className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white disabled:opacity-50" data-testid="participant-add-case-submit">Tilføj</button>
            </div>
          )}
          {mode === 'search' && (
            <div>
              <input value={query} onChange={(e) => void search(e.target.value)} placeholder="Søg part (mindst 2 tegn)" className="w-full rounded border px-2 py-0.5 text-sm" />
              <ul className="mt-1 max-h-48 space-y-1 overflow-auto">
                {results.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span>{p.display_name} <span className="text-xs text-gray-500">{p.kind === 'person' ? 'person' : 'organisation'}</span></span>
                    <button type="button" disabled={busy} onClick={() => addExisting(p.id)} className="rounded border bg-white px-2 py-0.5 text-xs hover:bg-gray-100">Tilføj</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {mode === 'new' && (
            <PartyCreateForm onCreated={(id) => addExisting(id)} onUseCandidate={useCandidate} onCancel={() => setMode(null)} />
          )}
          {mode !== 'new' && <button type="button" onClick={() => setMode(null)} className="text-xs text-gray-600 hover:underline">Annuller</button>}
        </div>
      )}

      {!view ? (!error && <p className="text-sm text-gray-500">Henter…</p>) : active.length === 0 ? (
        <p className="text-sm text-gray-500">Ingen registrerede deltagere (Sagspartnere ovenfor er uændrede).</p>
      ) : (
        <ul className="space-y-1 text-sm" data-testid="case-participants-list">
          {active.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <span>
                <span className="font-medium">{p.party?.display_name ?? 'Ukendt part'}</span>{' '}
                <span className="text-xs text-gray-600">· {PARTICIPANT_ROLE_LABELS[p.role]}</span>
                {p.note && <span className="text-xs text-gray-500"> — {p.note}</span>}
              </span>
              {view.canEdit && (
                <button type="button" disabled={busy} onClick={async () => { setBusy(true); const r = await endCaseParticipantAction(p.id); setBusy(false); if (!r.success) setError(r.error ?? 'Fejl'); else await load() }}
                  aria-label="Afslut deltagelse" className="text-gray-400 hover:text-red-700"><X className="h-4 w-4" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      {ended.length > 0 && <p className="mt-2 text-xs text-gray-400">{ended.length} afsluttet deltagelse{ended.length === 1 ? '' : 'r'}</p>}
    </div>
  )
}
