'use client'

import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import {
  Mail,
  MailOpen,
  Paperclip,
  Loader2,
  Send,
  Reply,
  ArrowDownLeft,
  ArrowUpRight,
  X,
  PenSquare,
  ChevronDown,
  ChevronUp,
  Inbox,
} from 'lucide-react'
import {
  getCustomerMailbox,
  markCustomerEmailRead,
  replyToCustomerEmail,
  sendEmailToCustomer,
  type CustomerMailboxEmail,
  type CustomerConversation,
} from '@/lib/actions/customer-mailbox'
import { useToast } from '@/components/ui/toast'

interface CustomerEmailTimelineProps {
  customerId: string
  customerEmail: string
}

export function CustomerEmailTimeline({ customerId, customerEmail }: CustomerEmailTimelineProps) {
  const toast = useToast()
  const [emails, setEmails] = useState<CustomerMailboxEmail[]>([])
  const [conversations, setConversations] = useState<CustomerConversation[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [viewMode, setViewMode] = useState<'threads' | 'flat'>('threads')

  // Viewing state
  const [viewingId, setViewingId] = useState<string | null>(null)

  // Reply state
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  // Compose state
  const [showCompose, setShowCompose] = useState(false)
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [composeSending, setComposeSending] = useState(false)

  const composeRef = useRef<HTMLTextAreaElement>(null)
  const replyRef = useRef<HTMLTextAreaElement>(null)

  const load = async () => {
    setLoading(true)
    const result = await getCustomerMailbox(customerId, customerEmail)
    setEmails(result.emails)
    setConversations(result.conversations || [])
    setUnreadCount(result.unreadCount)
    setLoading(false)
  }

  useEffect(() => { load() }, [customerId, customerEmail])

  const handleView = async (email: CustomerMailboxEmail) => {
    if (viewingId === email.id) {
      setViewingId(null)
      return
    }
    setViewingId(email.id)
    setReplyingToId(null)
    // Mark as read if unread incoming
    if (!email.is_read && email.direction === 'incoming') {
      await markCustomerEmailRead(email.id)
      setEmails((prev) => prev.map((e) => e.id === email.id ? { ...e, is_read: true } : e))
      setUnreadCount((prev) => Math.max(0, prev - 1))
    }
  }

  const handleReply = async (emailId: string) => {
    if (!replyText.trim()) return
    setSending(true)
    const result = await replyToCustomerEmail(emailId, replyText)
    setSending(false)
    if (result.success) {
      toast.success('Svar sendt')
      setReplyText('')
      setReplyingToId(null)
      load() // Refresh
    } else {
      toast.error(result.error || 'Kunne ikke sende svar')
    }
  }

  const handleCompose = async () => {
    if (!composeSubject.trim() || !composeBody.trim()) return
    setComposeSending(true)
    const result = await sendEmailToCustomer(customerEmail, composeSubject, composeBody)
    setComposeSending(false)
    if (result.success) {
      toast.success('Email sendt til ' + customerEmail)
      setComposeSubject('')
      setComposeBody('')
      setShowCompose(false)
      load()
    } else {
      toast.error(result.error || 'Kunne ikke sende email')
    }
  }

  const viewingEmail = viewingId ? emails.find((e) => e.id === viewingId) : null
  const visibleEmails = expanded ? emails : emails.slice(0, 8)

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Mail className="w-5 h-5" />
          Kundens Indbakke
        </h2>
        <div className="flex items-center justify-center py-8 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Henter emails...
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Kundens Indbakke
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-blue-500 text-white rounded-full">
                {unreadCount}
              </span>
            )}
            <span className="text-sm font-normal text-gray-400">
              ({viewMode === 'threads' ? `${conversations.length} tråde` : `${emails.length} emails`})
            </span>
          </h2>
          <div className="flex items-center gap-2">
            {/* Thread/Flat toggle */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('threads')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'threads' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Tråde
              </button>
              <button
                onClick={() => setViewMode('flat')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'flat' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Alle
              </button>
            </div>
            <button
              onClick={() => { setShowCompose(true); setTimeout(() => composeRef.current?.focus(), 100) }}
              className="inline-flex items-center gap-1.5 px-4 min-h-[44px] bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium active:scale-95 transition-transform touch-manipulation"
            >
              <PenSquare className="w-4 h-4" />
              Ny Mail
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Kun mails til/fra {customerEmail}
        </p>
      </div>

      {/* Compose new email */}
      {showCompose && (
        <div className="p-4 sm:p-6 border-b bg-green-50/50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Ny email til {customerEmail}</h3>
            <button onClick={() => setShowCompose(false)} className="p-1 hover:bg-gray-200 rounded">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <input
            type="text"
            value={composeSubject}
            onChange={(e) => setComposeSubject(e.target.value)}
            placeholder="Emne..."
            className="w-full px-3 py-2 border rounded-lg text-sm mb-2 focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
          />
          <textarea
            ref={composeRef}
            value={composeBody}
            onChange={(e) => setComposeBody(e.target.value)}
            placeholder="Skriv din besked..."
            className="w-full px-3 py-2 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
            rows={5}
          />
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-gray-400">Sendes fra CRM-postkasse</p>
            <button
              onClick={handleCompose}
              disabled={composeSending || !composeSubject.trim() || !composeBody.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
            >
              {composeSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send
            </button>
          </div>
        </div>
      )}

      {/* Email list */}
      {emails.length === 0 ? (
        <div className="p-8 text-center">
          <Inbox className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium">Ingen emails med denne kunde</p>
          <p className="text-sm text-gray-400 mt-1">Send den første email med knappen ovenfor</p>
        </div>
      ) : viewMode === 'threads' && conversations.length > 0 ? (
        /* ========== THREADED VIEW ========== */
        <div className="divide-y">
          {(expanded ? conversations : conversations.slice(0, 8)).map((conv) => {
            const isExpanded = viewingId === conv.conversationId
            const latestMsg = conv.messages[conv.messages.length - 1]
            const latestIsIncoming = latestMsg.direction === 'incoming'

            return (
              <div key={conv.conversationId}>
                {/* Conversation header row */}
                <button
                  onClick={() => setViewingId(isExpanded ? null : conv.conversationId)}
                  className={`w-full text-left p-3 sm:p-4 hover:bg-gray-50 transition-colors ${
                    isExpanded ? 'bg-blue-50/50' : ''
                  } ${conv.hasUnread ? 'bg-blue-50/30' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${
                      latestIsIncoming ? 'bg-blue-100' : 'bg-gray-100'
                    }`}>
                      {latestIsIncoming ? (
                        <ArrowDownLeft className="w-4 h-4 text-blue-600" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 text-gray-500" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {conv.messageCount > 1 && (
                          <span className="text-[10px] font-semibold bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                            {conv.messageCount}
                          </span>
                        )}
                        {conv.hasUnread && (
                          <span className="w-2 h-2 bg-blue-500 rounded-full" />
                        )}
                        <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">
                          {format(new Date(conv.latestAt), 'd. MMM yyyy HH:mm', { locale: da })}
                        </span>
                      </div>

                      <p className={`text-sm mt-1 truncate ${conv.hasUnread ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                        {conv.subject}
                      </p>

                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {latestIsIncoming
                          ? `Fra: ${latestMsg.sender_name || latestMsg.sender_email}`
                          : `Til: ${latestMsg.to_email || customerEmail}`}
                      </p>

                      {!isExpanded && latestMsg.body_preview && (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-1">{latestMsg.body_preview}</p>
                      )}
                    </div>
                  </div>
                </button>

                {/* Expanded conversation — all messages in thread */}
                {isExpanded && (
                  <div className="border-t bg-gray-50/50">
                    {conv.messages.map((msg) => {
                      const msgIsIncoming = msg.direction === 'incoming'
                      const isReplying = replyingToId === msg.id
                      const isViewingMsg = viewingId === conv.conversationId

                      return (
                        <div key={msg.id} className="border-b last:border-b-0">
                          <div className="p-4 sm:p-5">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                  msgIsIncoming ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                                }`}>
                                  {msgIsIncoming ? 'Indgående' : 'Udgående'}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {msgIsIncoming ? msg.sender_name || msg.sender_email : `Til: ${msg.to_email || customerEmail}`}
                                </span>
                                <span className="text-xs text-gray-400">
                                  {format(new Date(msg.received_at), 'd. MMM yyyy HH:mm', { locale: da })}
                                </span>
                              </div>
                              {msgIsIncoming && (
                                <button
                                  onClick={() => {
                                    setReplyingToId(isReplying ? null : msg.id)
                                    setTimeout(() => replyRef.current?.focus(), 100)
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 font-medium"
                                >
                                  <Reply className="w-3 h-3" />
                                  Besvar
                                </button>
                              )}
                            </div>

                            {/* Email body */}
                            {msg.body_html ? (
                              <div
                                className="prose prose-sm max-w-none text-gray-700 overflow-auto max-h-[400px] border rounded-lg p-3 bg-white"
                                dangerouslySetInnerHTML={{ __html: msg.body_html }}
                              />
                            ) : msg.body_text ? (
                              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans border rounded-lg p-3 bg-white overflow-auto max-h-[400px]">
                                {msg.body_text}
                              </pre>
                            ) : (
                              <p className="text-sm text-gray-400 italic">Ingen indhold</p>
                            )}
                          </div>

                          {/* Inline reply form */}
                          {isReplying && (
                            <div className="px-4 pb-4 sm:px-5 sm:pb-5">
                              <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3">
                                <textarea
                                  ref={replyRef}
                                  value={replyText}
                                  onChange={(e) => setReplyText(e.target.value)}
                                  placeholder="Skriv dit svar..."
                                  className="w-full px-3 py-2 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                  rows={4}
                                />
                                <div className="flex items-center justify-between mt-2">
                                  <p className="text-xs text-gray-400">
                                    Til: {msg.reply_to || msg.sender_email}
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => { setReplyingToId(null); setReplyText('') }} className="text-sm text-gray-500 hover:text-gray-700">Annuller</button>
                                    <button
                                      onClick={() => handleReply(msg.id)}
                                      disabled={sending || !replyText.trim()}
                                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                                    >
                                      {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                      Send
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* ========== FLAT VIEW (original) ========== */
        <div className="divide-y">
          {visibleEmails.map((email) => {
            const isViewing = viewingId === email.id
            const isReplying = replyingToId === email.id
            const isIncoming = email.direction === 'incoming'

            return (
              <div key={email.id}>
                {/* Email row */}
                <button
                  onClick={() => handleView(email)}
                  className={`w-full text-left p-3 sm:p-4 hover:bg-gray-50 transition-colors ${
                    isViewing ? 'bg-blue-50/50' : ''
                  } ${!email.is_read && isIncoming ? 'bg-blue-50/30' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Direction indicator */}
                    <div className={`mt-0.5 w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${
                      isIncoming
                        ? 'bg-blue-100'
                        : 'bg-gray-100'
                    }`}>
                      {isIncoming ? (
                        <ArrowDownLeft className="w-4 h-4 text-blue-600" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 text-gray-500" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {/* Direction label */}
                        <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          isIncoming
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {isIncoming ? 'Indgående' : 'Udgående'}
                        </span>
                        {!email.is_read && isIncoming && (
                          <span className="w-2 h-2 bg-blue-500 rounded-full" />
                        )}
                        {email.has_attachments && (
                          <Paperclip className="w-3 h-3 text-gray-400" />
                        )}
                        <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">
                          {format(new Date(email.received_at), 'd. MMM yyyy HH:mm', { locale: da })}
                        </span>
                      </div>

                      <p className={`text-sm mt-1 truncate ${
                        !email.is_read && isIncoming ? 'font-semibold text-gray-900' : 'text-gray-700'
                      }`}>
                        {email.subject || '(Intet emne)'}
                      </p>

                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {isIncoming
                          ? `Fra: ${email.sender_name || email.sender_email}`
                          : `Til: ${email.to_email || customerEmail}`}
                      </p>

                      {!isViewing && email.body_preview && (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-1">{email.body_preview}</p>
                      )}
                    </div>
                  </div>
                </button>

                {/* Expanded email view */}
                {isViewing && viewingEmail && (
                  <div className="border-t bg-white">
                    {/* Email body */}
                    <div className="p-4 sm:p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="font-semibold text-gray-900">{viewingEmail.subject || '(Intet emne)'}</h3>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {isIncoming ? 'Fra' : 'Til'}: {viewingEmail.sender_name || viewingEmail.sender_email}
                            {' — '}
                            {format(new Date(viewingEmail.received_at), 'd. MMMM yyyy HH:mm', { locale: da })}
                          </p>
                        </div>
                        {isIncoming && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setReplyingToId(isReplying ? null : email.id)
                              setTimeout(() => replyRef.current?.focus(), 100)
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium active:scale-95 transition-transform"
                          >
                            <Reply className="w-3.5 h-3.5" />
                            Besvar
                          </button>
                        )}
                      </div>

                      {/* HTML body */}
                      {viewingEmail.body_html ? (
                        <div
                          className="prose prose-sm max-w-none text-gray-700 overflow-auto max-h-[500px] border rounded-lg p-4 bg-gray-50/50"
                          dangerouslySetInnerHTML={{ __html: viewingEmail.body_html }}
                        />
                      ) : viewingEmail.body_text ? (
                        <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans border rounded-lg p-4 bg-gray-50/50 overflow-auto max-h-[500px]">
                          {viewingEmail.body_text}
                        </pre>
                      ) : (
                        <p className="text-sm text-gray-400 italic">Ingen indhold</p>
                      )}
                    </div>

                    {/* Reply form */}
                    {isReplying && (
                      <div className="p-4 sm:p-6 border-t bg-blue-50/30">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">
                          Svar til {viewingEmail.sender_name || viewingEmail.sender_email}
                        </h4>
                        <textarea
                          ref={replyRef}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Skriv dit svar..."
                          className="w-full px-3 py-2 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          rows={5}
                        />
                        <div className="flex items-center justify-between mt-2">
                          <p className="text-xs text-gray-400">
                            Sendes fra CRM-postkasse til {viewingEmail.reply_to || viewingEmail.sender_email}
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => { setReplyingToId(null); setReplyText('') }}
                              className="text-sm text-gray-500 hover:text-gray-700"
                            >
                              Annuller
                            </button>
                            <button
                              onClick={() => handleReply(email.id)}
                              disabled={sending || !replyText.trim()}
                              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                            >
                              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                              Send svar
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Show more / less */}
      {(viewMode === 'threads' ? conversations.length : emails.length) > 8 && (
        <div className="border-t">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1 text-sm text-gray-500 hover:text-gray-700 py-3"
          >
            {expanded ? (
              <><ChevronUp className="w-4 h-4" /> Vis færre</>
            ) : (
              <><ChevronDown className="w-4 h-4" /> Vis alle {viewMode === 'threads' ? conversations.length : emails.length} {viewMode === 'threads' ? 'tråde' : 'emails'}</>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
