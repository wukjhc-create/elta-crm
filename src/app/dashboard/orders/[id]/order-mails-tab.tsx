'use client'

/**
 * Sprint 8D-1: Mails-tab på orders/[id]-detalje.
 *
 * Viser alle incoming_emails koblet til denne service_case (via
 * service_case_id). Read-only liste — klik åbner mail i /dashboard/mail.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Mail, Paperclip, AlertCircle, CheckCircle2, Clock, XCircle, Loader2, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import { getEmailsForCase, type CaseEmail } from '@/lib/actions/service-cases'

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: typeof Mail }> = {
  linked:       { label: 'Koblet',        cls: 'bg-green-100 text-green-800',  icon: CheckCircle2 },
  unidentified: { label: 'Uidentificeret', cls: 'bg-amber-100 text-amber-800', icon: AlertCircle },
  pending:      { label: 'Afventer',       cls: 'bg-gray-100 text-gray-600',   icon: Clock },
  ignored:      { label: 'Ignoreret',      cls: 'bg-gray-100 text-gray-400',   icon: XCircle },
}

export function OrderMailsTab({ caseId }: { caseId: string }) {
  const [emails, setEmails] = useState<CaseEmail[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    getEmailsForCase(caseId)
      .then((data) => {
        if (!cancelled) setEmails(data)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [caseId])

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border p-12 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (emails.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-12 text-center text-gray-500">
        <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Ingen mails koblet til denne sag</p>
        <p className="text-sm mt-1">
          Mails kobles til sagen via &quot;Vælg sag&quot;-dropdown i mail-detail på{' '}
          <Link href="/dashboard/mail" className="text-blue-600 hover:underline">/dashboard/mail</Link>.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border">
      <div className="p-4 border-b flex items-center gap-2">
        <Mail className="w-4 h-4 text-blue-600" />
        <h3 className="font-semibold text-sm">Mails</h3>
        <span className="text-xs text-gray-400 ml-1">({emails.length})</span>
      </div>
      <div className="divide-y">
        {emails.map((email) => {
          const status = STATUS_CONFIG[email.link_status] || STATUS_CONFIG.pending
          const StatusIcon = status.icon
          return (
            <Link
              key={email.id}
              href={`/dashboard/mail?emailId=${email.id}`}
              className="flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors group"
            >
              <div className="pt-1 w-8 shrink-0">
                {!email.is_read && (
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-600 ring-2 ring-blue-200" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className={`text-sm truncate ${!email.is_read ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
                    {email.sender_name || email.sender_email}
                  </span>
                  <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">
                    {format(new Date(email.received_at), 'd. MMM yyyy HH:mm', { locale: da })}
                  </span>
                </div>
                <p className={`text-sm truncate ${!email.is_read ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                  {email.subject || '(Intet emne)'}
                </p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.cls}`}>
                    <StatusIcon className="w-3 h-3" />
                    {status.label}
                  </span>
                  {email.has_attachments && (
                    <Paperclip className="w-3.5 h-3.5 text-gray-400" />
                  )}
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity self-center shrink-0" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
