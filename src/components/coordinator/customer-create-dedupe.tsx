'use client'

/**
 * C4 — opret kunde fra mail med dubletkontrol. Viser mulige eksisterende kunder (med matchgrundlag) FØR oprettelse;
 * "Brug denne" kobler mailen til den eksisterende kunde (registreres som undgået dublet). Ny kunde trods stærke
 * kandidater kræver en kort begrundelse.
 */
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import {
  checkCustomerDuplicatesAction, chooseExistingCustomerForMailAction, createCustomerFromMailCheckedAction, prepareCustomerFromMailAction,
  type CustomerDraft, type DupCandidateView,
} from '@/lib/actions/customer-dedupe'
import { BASIS_LABELS } from '@/lib/coordinator/duplicates'

const STRENGTH: Record<string, string> = { strong: 'Stærkt match', medium: 'Muligt match', weak: 'Svagt match' }

export function CustomerCreateWithDuplicateCheck({ emailId, onClose, onDone }: { emailId: string; onClose: () => void; onDone: (msg: string) => void }) {
  const [draft, setDraft] = useState<CustomerDraft | null>(null)
  const [cands, setCands] = useState<DupCandidateView[]>([])
  const [hidden, setHidden] = useState(0)
  const [reason, setReason] = useState('')
  const [needsReason, setNeedsReason] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const r = await prepareCustomerFromMailAction(emailId)
      if (r.success) { setDraft(r.data.draft); setCands(r.data.candidates); setHidden(r.data.hidden) } else setError(r.error)
    })()
  }, [emailId])

  async function recheck(d: CustomerDraft) {
    const r = await checkCustomerDuplicatesAction({ name: d.name, contactPerson: d.contactPerson, email: d.email, phone: d.phone, vat: d.vat, address: d.address, postalCode: d.postalCode })
    if (r.success) { setCands(r.data.candidates); setHidden(r.data.hidden) }
  }
  async function useExisting(id: string) {
    setBusy(true); setError(null)
    const r = await chooseExistingCustomerForMailAction({ emailId, customerId: id, candidatesShown: cands.length })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    onDone('Mailen er koblet til den eksisterende kunde — ingen dublet oprettet.')
  }
  async function create() {
    if (!draft) return
    setBusy(true); setError(null)
    const r = await createCustomerFromMailCheckedAction({ emailId, draft, reason: reason || null })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    if ('needsReason' in r.data) { setNeedsReason(true); setCands(r.data.candidates); return }
    onDone('Ny kunde oprettet og mailen koblet.')
  }

  const field = (k: keyof CustomerDraft, label: string, type = 'text') => draft && (
    <label className="block text-xs">
      <span className="text-gray-600">{label}</span>
      <input type={type} value={String(draft[k] ?? '')} data-testid={`dedupe-field-${k}`}
        onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} onBlur={() => draft && void recheck(draft)}
        className="mt-0.5 w-full rounded border px-2 py-1 text-sm" />
    </label>
  )

  return (
    <div className="rounded-md border border-gray-300 bg-white p-3" data-testid="customer-dedupe">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-medium text-gray-900">Opret kunde — kontrol for dubletter</h3>
        <button onClick={onClose} aria-label="Luk" className="rounded p-1 hover:bg-gray-100"><X className="h-4 w-4" /></button>
      </div>
      {!draft && !error && <p className="text-sm text-gray-500">Søger efter eksisterende kunder …</p>}
      {error && <p className="mb-2 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800" role="alert" data-testid="dedupe-error">{error}</p>}
      {draft && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="flex gap-3 text-xs">
              {(['private', 'business'] as const).map((t) => (
                <label key={t} className="inline-flex items-center gap-1"><input type="radio" checked={draft.customerType === t} onChange={() => setDraft({ ...draft, customerType: t })} />{t === 'private' ? 'Privat' : 'Erhverv'}</label>
              ))}
            </div>
            {field('name', draft.customerType === 'business' ? 'Firmanavn' : 'Navn')}
            {draft.customerType === 'business' && field('contactPerson', 'Kontaktperson')}
            {field('email', 'E-mail', 'email')}
            {field('phone', 'Telefon')}
            {field('address', 'Adresse')}
            <div className="grid grid-cols-[100px_1fr] gap-2">{field('postalCode', 'Postnr.')}{field('city', 'By')}</div>
            {draft.customerType === 'business' && field('vat', 'CVR')}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-gray-700" data-testid="dedupe-count">{cands.length ? `${cands.length} mulige eksisterende kunder` : 'Ingen mulige dubletter fundet'}{hidden ? ` (+${hidden} du ikke har adgang til)` : ''}</p>
            <ul className="space-y-1" data-testid="dedupe-candidates">
              {cands.map((c) => (
                <li key={c.id} className="rounded border p-2 text-xs" data-testid="dedupe-candidate" data-strength={c.strength}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-900">{c.name}{c.customerNumber ? ` · ${c.customerNumber}` : ''}</span>
                    <button disabled={busy} onClick={() => void useExisting(c.id)} className="rounded bg-blue-600 px-2 py-0.5 text-white hover:bg-blue-700 disabled:opacity-50" data-testid="dedupe-use-existing">Brug denne</button>
                  </div>
                  <div className="text-gray-600">{[c.email, c.phone, c.address].filter(Boolean).join(' · ')}</div>
                  <div className={c.strength === 'strong' ? 'text-red-700' : 'text-amber-700'}>{STRENGTH[c.strength]}: {c.basis.map((b) => BASIS_LABELS[b]).join(', ')}{c.autoCreated ? ' · automatisk oprettet' : ''}</div>
                </li>
              ))}
            </ul>
            {needsReason && (
              <label className="mt-2 block text-xs" data-testid="dedupe-reason-box">
                <span className="text-red-700">Der findes stærke match. Skriv kort hvorfor en ny kunde alligevel er nødvendig:</span>
                <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="mt-0.5 w-full rounded border px-2 py-1 text-sm" data-testid="dedupe-reason" />
              </label>
            )}
            <button disabled={busy || (needsReason && !reason.trim())} onClick={() => void create()} className="mt-3 rounded-md border border-gray-400 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50" data-testid="dedupe-create">
              Opret ny kunde
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
