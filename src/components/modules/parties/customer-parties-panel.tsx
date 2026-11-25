'use client'

/**
 * Kundekort → "Parter & relationer" (fase B). Vises kun når PARTIES_UI_ENABLED er tændt (server-prop). Internt overblik:
 * kundens part + relationer, kontaktpersonernes parter og sagsdeltagelser. Skrivning (opret part, relationer) kun for
 * parties.manage; salg/bogholderi ser alt read-only (D-1). Intet her er synligt for eksterne parter.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Network, Plus, X } from 'lucide-react'
import {
  endPartyRelationshipAction,
  ensureRegisterPartyAction,
  getCustomerPartiesAction,
  setPartyRelationshipAction,
  type CustomerPartiesView,
  type PartyRow,
} from '@/lib/actions/parties'
import type { PartyRelationship } from '@/lib/parties/audience'
import { MANUAL_RELATIONSHIPS, PARTICIPANT_ROLE_LABELS, PARTY_INTERNAL_NOTE, RELATIONSHIP_LABELS } from './party-labels'

function RelationshipBadges({ party, canManage, busy, onEnd }: { party: PartyRow; canManage: boolean; busy: boolean; onEnd: (id: string) => void }) {
  if (party.relationships.length === 0) return <span className="text-xs text-gray-400">Ingen relationer</span>
  return (
    <span className="flex flex-wrap gap-1">
      {party.relationships.map((r) => (
        <span key={r.id} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${r.status === 'proposed' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
          {RELATIONSHIP_LABELS[r.relationship]}{r.status === 'proposed' ? ' (forslag)' : ''}
          {canManage && r.source !== 'register' && (
            <button type="button" disabled={busy} onClick={() => onEnd(r.id)} aria-label="Afslut relation" className="hover:text-red-700"><X className="h-3 w-3" /></button>
          )}
        </span>
      ))}
    </span>
  )
}

export function CustomerPartiesPanel({ customerId }: { customerId: string }) {
  const [view, setView] = useState<CustomerPartiesView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [newRel, setNewRel] = useState<PartyRelationship>('cooperation_partner')

  const load = useCallback(async () => {
    const res = await getCustomerPartiesAction(customerId)
    if (res.success && res.data) { setView(res.data); setError(null) } else setError(res.error ?? 'Kunne ikke hente parter')
  }, [customerId])

  useEffect(() => { void load() }, [load])

  async function run(fn: () => Promise<{ success: boolean; error?: string }>, ok?: string) {
    setBusy(true)
    setNotice(null)
    const res = await fn()
    setBusy(false)
    if (!res.success) { setError(res.error ?? 'Fejl'); return }
    setError(null)
    if (ok) setNotice(ok)
    await load()
  }

  async function ensure(register: 'customer' | 'customer_contact', id: string) {
    setBusy(true)
    const res = await ensureRegisterPartyAction(register, id)
    setBusy(false)
    if (!res.success) { setError(res.error ?? 'Fejl'); return }
    setNotice(res.data?.warnings.includes('same_email_other_customer_party') ? 'Bemærk: en anden kunde med samme e-mail har allerede en part (mulig dublet-kunde — intet er lagt sammen).' : null)
    await load()
  }

  const canManage = view?.canManage ?? false
  const cp = view?.customerParty ?? null

  return (
    <div className="bg-white rounded-lg border p-6" data-testid="customer-parties-panel">
      <div className="mb-1 flex items-center gap-2">
        <Network className="h-5 w-5 text-gray-600" />
        <h2 className="text-lg font-semibold">Parter &amp; relationer</h2>
        {!canManage && view && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600" data-testid="parties-readonly">Kun læsning</span>}
      </div>
      <p className="mb-4 text-xs text-gray-500">{PARTY_INTERNAL_NOTE}</p>
      {error && <p className="mb-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-2 text-sm text-amber-800">{notice}</p>}
      {!view ? (
        !error && <p className="text-sm text-gray-500">Henter…</p>
      ) : (
        <div className="space-y-4 text-sm">
          <div>
            <p className="mb-1 text-xs font-medium uppercase text-gray-500">Kunden som part</p>
            {cp ? (
              <div className="flex flex-wrap items-center gap-2" data-testid="customer-party">
                <span className="font-medium">{cp.display_name}</span>
                <span className="text-xs text-gray-500">{cp.kind === 'person' ? 'Person' : 'Organisation'}</span>
                <RelationshipBadges party={cp} canManage={canManage} busy={busy} onEnd={(id) => run(() => endPartyRelationshipAction(id, 'ended'))} />
                {canManage && (
                  <span className="flex items-center gap-1">
                    <select value={newRel} onChange={(e) => setNewRel(e.target.value as PartyRelationship)} className="rounded border px-1 py-0.5 text-xs">
                      {MANUAL_RELATIONSHIPS.map((r) => <option key={r} value={r}>{RELATIONSHIP_LABELS[r]}</option>)}
                    </select>
                    <button type="button" disabled={busy} onClick={() => run(() => setPartyRelationshipAction(cp.id, newRel))} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs hover:bg-gray-50">
                      <Plus className="h-3 w-3" />Relation
                    </button>
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Kunden er ikke registreret som part endnu.</span>
                {canManage && (
                  <button type="button" disabled={busy} onClick={() => ensure('customer', customerId)} className="rounded border px-2 py-0.5 text-xs hover:bg-gray-50" data-testid="ensure-customer-party">Registrér som part</button>
                )}
              </div>
            )}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase text-gray-500">Kontaktpersoner som parter</p>
            {view.contacts.length === 0 ? <p className="text-gray-500">Ingen kontaktpersoner</p> : (
              <ul className="space-y-1">
                {view.contacts.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <span>{c.name}</span>
                    {c.party ? <span className="text-xs text-emerald-700">part</span> : canManage ? (
                      <button type="button" disabled={busy} onClick={() => ensure('customer_contact', c.id)} className="rounded border px-1.5 py-0.5 text-xs hover:bg-gray-50">Registrér som part</button>
                    ) : <span className="text-xs text-gray-400">ikke part</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase text-gray-500">Deltager i sager</p>
            {view.participations.length === 0 ? <p className="text-gray-500">Ingen registrerede sagsdeltagelser</p> : (
              <ul className="space-y-1">
                {view.participations.map((p) => (
                  <li key={p.id} className={p.ended_at ? 'text-gray-400' : ''}>
                    <Link href={`/dashboard/orders/${p.service_case_id}`} className="text-emerald-700 hover:underline">{p.case_number ?? 'Sag'}</Link>
                    {p.case_title ? ` — ${p.case_title}` : ''} · {PARTICIPANT_ROLE_LABELS[p.role]}{p.ended_at ? ' (afsluttet)' : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
