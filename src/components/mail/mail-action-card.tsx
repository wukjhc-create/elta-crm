'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { buildMailActionCard, mailNameCandidates, type MailActionCard, type MailCaseRef, type MailCustomerRef, type MailSuggestion } from '@/lib/mail/action-card'
import { confirmMailCardAction } from '@/lib/actions/mail-card-actions'
import { getCustomerServiceCasesResult } from '@/lib/actions/service-cases'
import { searchCustomersForPickerAction } from '@/lib/actions/customers'
import { getCustomerNotesAvailability } from '@/lib/actions/customer-notes'
import type { IncomingEmailWithCustomer } from '@/types/mail-bridge.types'

const CONFIRMABLE = new Set<MailSuggestion['id']>(['attach_mail', 'create_task', 'add_note'])

/**
 * Handlingskort på mailen. Forslagene udfører ingenting.
 * Sager hentes med den eksisterende, scope-begrænsede læsning.
 */
export function MailActionCardView({ email }: { email: IncomingEmailWithCustomer }) {
  const [dismissed, setDismissed] = useState(false)
  const [cases, setCases] = useState<MailCaseRef[]>([])
  const [casesStatus, setCasesStatus] = useState<'ok' | 'unavailable' | 'not_loaded'>(
    email.customer_id || mailNameCandidates(email.subject, email.original_sender_name || email.sender_name).length ? 'not_loaded' : 'ok',
  )
  const [found, setFound] = useState<MailCustomerRef[]>([])
  const [customerSearch, setCustomerSearch] = useState<'ok' | 'failed' | 'skipped'>(email.customer_id ? 'skipped' : 'ok')
  const [pending, setPending] = useState<MailSuggestion['id'] | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  // Note-forslaget vises kun, når kundenoter findes og må skrives (customer_notes er valgfri)
  const [customerNotes, setCustomerNotes] = useState<'available' | 'unavailable' | 'error' | 'not_loaded'>('not_loaded')

  useEffect(() => {
    let alive = true
    getCustomerNotesAvailability()
      .then((r) => { if (alive) setCustomerNotes(r.state === 'available' && !r.canWrite ? 'unavailable' : r.state) })
      .catch(() => { if (alive) setCustomerNotes('error') })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    let alive = true
    if (email.customer_id) return
    const names = mailNameCandidates(email.subject, email.original_sender_name || email.sender_name)
    if (!names.length) return
    Promise.all(names.map((name) => searchCustomersForPickerAction(name))).then((results) => {
      if (!alive) return
      if (results.some((r) => !r.success)) {
        setCustomerSearch('failed')
        setCasesStatus('ok')
        return
      }
      const rows = results.flatMap((r) => r.data ?? [])
      const unique = [...new Map(rows.map((r) => [r.id, r])).values()]
      if (unique.length !== 1) setCasesStatus('ok')
      setFound(unique.map((r) => {
        const query = names.find((n) => (r.contact_person ?? '').toLocaleLowerCase('da').includes(n.toLocaleLowerCase('da')))
        return {
          id: r.id,
          name: query && r.contact_person ? r.contact_person : r.company_name,
          customerNumber: r.customer_number,
          email: r.email,
          address: null,
          postalCode: null,
          city: null,
        }
      }))
      setCustomerSearch('ok')
    }).catch(() => { if (alive) { setCustomerSearch('failed'); setCasesStatus('ok') } })
    return () => { alive = false }
  }, [email.customer_id, email.subject, email.sender_name, email.original_sender_name])

  useEffect(() => {
    let alive = true
    const customerId = email.customer_id || (found.length === 1 ? found[0].id : null)
    if (!customerId) return
    getCustomerServiceCasesResult(customerId).then((res) => {
      if (!alive) return
      if (!res.ok) {
        setCasesStatus('unavailable')
        return
      }
      setCases(res.cases.map((c) => ({
        id: c.id,
        caseNumber: c.case_number,
        title: c.title,
        status: c.status,
        customerId: c.customer_id,
        address: c.address,
        postalCode: c.postal_code,
        city: c.city,
      })))
      setCasesStatus('ok')
    }).catch(() => { if (alive) setCasesStatus('unavailable') })
    return () => { alive = false }
  }, [email.customer_id, found])

  if (dismissed) return null
  const linked = email.customers
  const card: MailActionCard = buildMailActionCard({
    subject: email.subject,
    bodyText: email.body_text,
    bodyPreview: email.body_preview,
    bodyHtml: email.body_html,
    senderEmail: email.original_sender_email || email.sender_email,
    senderName: email.original_sender_name || email.sender_name,
    attachmentNames: (email.attachment_urls ?? []).map((a) => a.filename).filter(Boolean),
    linkedCustomerId: email.customer_id,
    linkedCaseId: email.service_case_id ?? null,
    customerNotes,
    customers: linked ? [{
      id: linked.id,
      name: linked.company_name,
      customerNumber: linked.customer_number,
      email: linked.email,
      address: null,
      postalCode: null,
      city: null,
    }] : found,
    customerSearch,
    cases,
    casesStatus,
  })

  return (
    <section className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm" data-testid="mail-action-card">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-gray-900">Forslag til mailen</h3>
        <span className="text-xs uppercase tracking-wide text-gray-500">{card.confidence === 'high' ? 'høj' : card.confidence === 'medium' ? 'middel' : 'lav'} sikkerhed</span>
      </div>
      <dl className="mt-2 space-y-1 text-gray-700">
        <div><dt className="inline font-medium">Kunde: </dt><dd className="inline">{card.customer ? `${card.customer.name}${card.customer.customerNumber ? ` (${card.customer.customerNumber})` : ''}` : 'Ikke matchet'}</dd></div>
        <div><dt className="inline text-gray-500"> </dt><dd className="inline text-gray-500">{card.customerReason}</dd></div>
        {card.address && (
          <div><dt className="inline font-medium">Adresse i mailen: </dt><dd className="inline">{[card.address.street, card.address.postalCode, card.address.city].filter(Boolean).join(', ')}</dd></div>
        )}
        <div>
          <dt className="inline font-medium">Sag: </dt>
          <dd className="inline">{card.likelyCase ? `${card.likelyCase.caseNumber ?? 'Sag'} — ${card.likelyCase.title}` : card.caseStatus === 'unavailable' ? 'Kunne ikke læses' : card.caseStatus === 'ambiguous' ? 'Flere mulige' : 'Ingen oplagt sag'}</dd>
        </div>
        <div><dt className="inline text-gray-500"> </dt><dd className="inline text-gray-500">{card.caseReason}</dd></div>
        {card.attachments.length > 0 && (
          <div><dt className="inline font-medium">Vedhæftninger: </dt><dd className="inline">{card.attachments.map((a) => `${a.filename} (${a.kind === 'unknown' ? 'ukendt' : a.reason})`).join(', ')}</dd></div>
        )}
        <div><dt className="inline font-medium">Hensigt: </dt><dd className="inline">{card.intentReason}</dd></div>
      </dl>
      <ul className="mt-3 space-y-2">
        {card.suggestions.map((s) => {
          const canConfirm = CONFIRMABLE.has(s.id) && !!card.customer && (s.id !== 'attach_mail' || !!card.likelyCase)
          return (
            <li key={s.id} className="flex flex-wrap items-baseline gap-x-2">
              {s.href ? (
                <Link href={s.href} className="text-blue-700 hover:underline">{s.label}</Link>
              ) : s.id === 'do_nothing' ? (
                <button type="button" className="text-left text-gray-700 hover:underline" onClick={() => setDismissed(true)}>{s.label}</button>
              ) : (
                <span className="text-gray-800">{s.label}</span>
              )}
              {canConfirm && (
                <button
                  type="button"
                  disabled={busy}
                  className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-gray-800 disabled:opacity-50"
                  onClick={() => {
                    if (pending !== s.id) {
                      setPending(s.id)
                      setResult(null)
                      return
                    }
                    const command = s.id
                    if (command !== 'attach_mail' && command !== 'create_task' && command !== 'add_note') return
                    setBusy(true)
                    void confirmMailCardAction({
                      confirmed: true,
                      command,
                      emailId: email.id,
                      customerId: card.customer?.id ?? null,
                      caseId: card.likelyCase?.id ?? null,
                    }).then((res) => {
                      setResult(res.message)
                      setPending(null)
                    }).catch(() => {
                      setResult('Handlingen kunne ikke udføres. Intet videre er ændret.')
                      setPending(null)
                    }).finally(() => setBusy(false))
                  }}
                >
                  {pending === s.id ? 'Bekræft og udfør' : 'Bekræft'}
                </button>
              )}
              <span className="text-gray-500">{s.reason}</span>
            </li>
          )
        })}
      </ul>
      {result && <p className="mt-2 text-sm text-gray-800" data-testid="mail-action-result">{result}</p>}
    </section>
  )
}
