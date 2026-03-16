'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import { Mail, MailOpen, Paperclip, ChevronDown, ChevronUp, Loader2, Send } from 'lucide-react'
import { getCustomerEmails, type CustomerEmail } from '@/lib/actions/customer-relations'
import { sendQuickReply } from '@/lib/actions/incoming-emails'

interface CustomerEmailTimelineProps {
  customerId: string
  customerEmail: string
}

export function CustomerEmailTimeline({ customerId, customerEmail }: CustomerEmailTimelineProps) {
  const [emails, setEmails] = useState<CustomerEmail[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ success: boolean; error?: string } | null>(null)

  useEffect(() => {
    let mounted = true
    getCustomerEmails(customerId).then((data) => {
      if (mounted) {
        setEmails(data)
        setLoading(false)
      }
    })
    return () => { mounted = false }
  }, [customerId])

  const handleSendReply = async (emailId: string) => {
    if (!replyText.trim()) return
    setSending(true)
    setSendResult(null)
    const result = await sendQuickReply(emailId, replyText)
    setSending(false)
    setSendResult(result)
    if (result.success) {
      setReplyText('')
      setReplyingTo(null)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Mail className="w-5 h-5" />
          Email-historik
        </h2>
        <div className="flex items-center justify-center py-8 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Henter emails...
        </div>
      </div>
    )
  }

  if (emails.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Mail className="w-5 h-5" />
          Email-historik
        </h2>
        <p className="text-gray-500 text-center py-4">Ingen emails tilknyttet denne kunde endnu.</p>
      </div>
    )
  }

  const visibleEmails = expanded ? emails : emails.slice(0, 5)

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Mail className="w-5 h-5" />
          Email-historik
          <span className="text-sm font-normal text-gray-500">({emails.length})</span>
        </h2>
        <Link
          href="/dashboard/mail"
          className="text-sm text-primary hover:underline"
        >
          Gå til indbakke
        </Link>
      </div>

      <div className="space-y-3">
        {visibleEmails.map((email) => (
          <div key={email.id} className="group">
            <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
              <div className="mt-0.5">
                {email.is_read ? (
                  <MailOpen className="w-4 h-4 text-gray-400" />
                ) : (
                  <Mail className="w-4 h-4 text-blue-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm truncate ${!email.is_read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                    {email.subject || '(Intet emne)'}
                  </p>
                  {email.has_attachments && (
                    <Paperclip className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-gray-500 truncate">
                    {email.sender_name || email.sender_email}
                  </p>
                  <span className="text-xs text-gray-400">
                    {format(new Date(email.received_at), 'd. MMM yyyy HH:mm', { locale: da })}
                  </span>
                </div>
                {email.body_preview && (
                  <p className="text-xs text-gray-400 mt-1 line-clamp-1">{email.body_preview}</p>
                )}
              </div>
              <button
                onClick={() => setReplyingTo(replyingTo === email.id ? null : email.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-gray-200 rounded"
                title="Svar"
              >
                <Send className="w-3.5 h-3.5 text-gray-500" />
              </button>
            </div>

            {/* Inline reply */}
            {replyingTo === email.id && (
              <div className="ml-10 mt-1 mb-2 p-3 bg-gray-50 rounded-lg border">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Skriv dit svar..."
                  className="w-full text-sm border rounded-md p-2 resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  rows={3}
                />
                <div className="flex items-center justify-between mt-2">
                  <div className="text-xs text-gray-500">
                    Sendes fra ordre@eltasolar.dk til {email.sender_email}
                  </div>
                  <div className="flex items-center gap-2">
                    {sendResult && !sendResult.success && (
                      <span className="text-xs text-red-500">{sendResult.error}</span>
                    )}
                    {sendResult?.success && (
                      <span className="text-xs text-green-600">Sendt!</span>
                    )}
                    <button
                      onClick={() => { setReplyingTo(null); setReplyText(''); setSendResult(null) }}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Annuller
                    </button>
                    <button
                      onClick={() => handleSendReply(email.id)}
                      disabled={sending || !replyText.trim()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs rounded-md hover:bg-primary/90 disabled:opacity-50"
                    >
                      {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      Send svar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {emails.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 w-full flex items-center justify-center gap-1 text-sm text-gray-500 hover:text-gray-700 py-2"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Vis færre
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              Vis alle {emails.length} emails
            </>
          )}
        </button>
      )}
    </div>
  )
}
