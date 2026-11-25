'use client'

/**
 * Opret fri part (partner/producent/underleverandør/person) med dublet-værn. Kun for parties.manage (serveren og databasen
 * afviser alle andre). Kandidater → intet oprettes; brugeren vælger en eksisterende eller opretter bevidst med begrundelse.
 * Samme CVR oprettes aldrig to gange.
 */
import { useState } from 'react'
import { createPartyAction, type PartyCandidate, type PartyKind } from '@/lib/actions/parties'
import type { PartyRelationship } from '@/lib/parties/audience'
import { MANUAL_RELATIONSHIPS, MATCH_LABELS, RELATIONSHIP_LABELS } from './party-labels'

const splitList = (s: string) => s.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)

export function PartyCreateForm({
  defaultRelationship = 'cooperation_partner',
  onCreated,
  onUseCandidate,
  onCancel,
}: {
  defaultRelationship?: PartyRelationship | ''
  onCreated: (partyId: string) => void | Promise<void>
  onUseCandidate?: (candidate: PartyCandidate) => void | Promise<void>
  onCancel: () => void
}) {
  const [kind, setKind] = useState<PartyKind>('organisation')
  const [name, setName] = useState('')
  const [emails, setEmails] = useState('')
  const [domains, setDomains] = useState('')
  const [vat, setVat] = useState('')
  const [relationship, setRelationship] = useState<PartyRelationship | ''>(defaultRelationship)
  const [candidates, setCandidates] = useState<PartyCandidate[] | null>(null)
  const [vatBlocked, setVatBlocked] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(withReason: boolean) {
    setBusy(true)
    setError(null)
    const res = await createPartyAction({
      kind,
      displayName: name,
      verifiedEmails: splitList(emails),
      verifiedDomains: splitList(domains),
      vatNumber: vat || null,
      relationship: relationship || null,
      confirmNewReason: withReason ? reason : null,
    })
    setBusy(false)
    if (!res.success || !res.data) { setError(res.error ?? 'Fejl'); return }
    if (res.data.status === 'created') { await onCreated(res.data.partyId); return }
    setCandidates(res.data.candidates)
    setVatBlocked(res.data.status === 'duplicate_vat')
  }

  return (
    <div className="space-y-3 rounded-md border bg-gray-50 p-3" data-testid="party-create-form">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-xs text-gray-600">Type
          <select value={kind} onChange={(e) => setKind(e.target.value as PartyKind)} className="mt-1 w-full rounded border px-2 py-1 text-sm">
            <option value="organisation">Organisation</option>
            <option value="person">Person</option>
          </select>
        </label>
        <label className="text-xs text-gray-600">Navn
          <input value={name} onChange={(e) => { setName(e.target.value); setCandidates(null) }} maxLength={200} className="mt-1 w-full rounded border px-2 py-1 text-sm" data-testid="party-create-name" />
        </label>
        <label className="text-xs text-gray-600">Relation
          <select value={relationship} onChange={(e) => setRelationship(e.target.value as PartyRelationship | '')} className="mt-1 w-full rounded border px-2 py-1 text-sm">
            <option value="">Ingen</option>
            {MANUAL_RELATIONSHIPS.map((r) => <option key={r} value={r}>{RELATIONSHIP_LABELS[r]}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-600">CVR (valgfri)
          <input value={vat} onChange={(e) => { setVat(e.target.value); setCandidates(null) }} maxLength={20} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
        </label>
        <label className="text-xs text-gray-600">Verificerede e-mails (valgfri, komma-adskilt)
          <input value={emails} onChange={(e) => { setEmails(e.target.value); setCandidates(null) }} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
        </label>
        <label className="text-xs text-gray-600">Verificerede domæner (valgfri — ikke gmail.com o.l.)
          <input value={domains} onChange={(e) => { setDomains(e.target.value); setCandidates(null) }} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
        </label>
      </div>

      {candidates && (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm" data-testid="party-duplicate-candidates">
          <p className="font-medium text-amber-900">
            {vatBlocked ? 'CVR-nummeret findes allerede — der kan ikke oprettes en ny part med samme CVR.' : 'Mulige dubletter — brug en eksisterende, eller opret bevidst med begrundelse.'}
          </p>
          <ul className="mt-1 space-y-1">
            {candidates.map((c) => (
              <li key={`${c.source}:${c.id}`} className="flex items-center justify-between gap-2">
                <span>
                  {c.display_name}{' '}
                  <span className="text-xs text-amber-800">({c.source === 'party' ? 'part' : c.source === 'customer' ? 'kunde' : 'leverandør'} · {c.match.map((m) => MATCH_LABELS[m] ?? m).join(', ')})</span>
                </span>
                {onUseCandidate && (
                  <button type="button" disabled={busy} onClick={() => onUseCandidate(c)} className="rounded border bg-white px-2 py-0.5 text-xs hover:bg-gray-100">Brug denne</button>
                )}
              </li>
            ))}
          </ul>
          {!vatBlocked && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Begrundelse for ny part (mindst 5 tegn)" maxLength={500} className="min-w-[14rem] flex-1 rounded border px-2 py-1 text-sm" />
              <button type="button" disabled={busy || reason.trim().length < 5} onClick={() => submit(true)} className="rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">Opret alligevel</button>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy || name.trim().length === 0 || !!candidates} onClick={() => submit(false)} className="rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-50" data-testid="party-create-submit">Opret part</button>
        <button type="button" onClick={onCancel} className="rounded border px-3 py-1 text-sm">Annuller</button>
      </div>
    </div>
  )
}
