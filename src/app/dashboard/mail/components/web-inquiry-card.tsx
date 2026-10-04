'use client'

/**
 * N81 — webhenvendelse (hjemmesidens formular via FormSubmit): kontaktkort øverst i mailen med de felter, som
 * "Opret lead" også læser (samme parser) — navn, telefon (ring op), e-mail, adresse. Før stod de kun i FormSubmits
 * rå tabel længere nede. Ren visning; intet gemmes.
 */
import { useMemo } from 'react'
import { MapPin, Phone, Mail, User } from 'lucide-react'
import { isWebsiteInquiry } from '@/lib/mail/website-inquiry'
import { parseCustomerFromEmail } from '@/lib/utils/email-parser'

export function WebInquiryCard({ email }: { email: { sender_email: string | null; subject: string | null; body_text: string | null; body_html: string | null; customer_id?: string | null } }) {
  const web = isWebsiteInquiry({ senderEmail: email.sender_email, subject: email.subject })
  const parsed = useMemo(() => {
    // N88: også ukoblede mails (fx privatpersoner der skriver direkte) — kun når der findes telefon eller adresse
    if (!web && email.customer_id) return null
    return parseCustomerFromEmail(email.body_text, email.body_html, web ? null : email.sender_email)
  }, [web, email.customer_id, email.sender_email, email.body_text, email.body_html])
  if (!parsed || (!parsed.name && !parsed.phone && !parsed.email && !parsed.address)) return null
  if (!web && !parsed.phone && !parsed.address) return null
  const addr = [parsed.address, [parsed.postalCode, parsed.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return (
    <div className="rounded-lg ring-1 ring-emerald-200 bg-emerald-50/60 p-3 text-sm grid gap-1.5 sm:grid-cols-2" data-testid="web-inquiry-card">
      <p className="sm:col-span-2 text-xs font-semibold text-emerald-900 uppercase tracking-wide">{web ? 'Henvendelse fra hjemmesiden' : 'Kontaktdata i mailen'}</p>
      {parsed.name && <p className="flex items-center gap-2"><User className="w-4 h-4 text-emerald-700" />{parsed.name}</p>}
      {parsed.phone && (
        <a href={`tel:${parsed.phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-2 text-emerald-800 hover:underline" data-testid="web-inquiry-phone">
          <Phone className="w-4 h-4" />{parsed.phone}
        </a>
      )}
      {parsed.email && (
        <a href={`mailto:${parsed.email}`} className="flex items-center gap-2 text-emerald-800 hover:underline"><Mail className="w-4 h-4" />{parsed.email}</a>
      )}
      {addr && <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-emerald-700" />{addr}</p>}
    </div>
  )
}
