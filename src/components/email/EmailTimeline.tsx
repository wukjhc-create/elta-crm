'use client'

/**
 * EMAIL TIMELINE
 *
 * Displays chronological email communication for an offer
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { EmailStatusBadge } from './EmailStatusBadge'
import { getEmailThreads, getEmailMessages } from '@/lib/actions/email'
import type { EmailThreadWithRelations, EmailMessage } from '@/types/email.types'
import {
  Mail,
  Send,
  Inbox,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  MousePointer,
  RefreshCw,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { da } from 'date-fns/locale'

interface EmailTimelineProps {
  offerId: string
  onSendEmail?: () => void
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('da-DK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelative(date: string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: da })
}

function EmailMessageCard({
  message,
  isExpanded,
  onToggle,
}: {
  message: EmailMessage
  isExpanded: boolean
  onToggle: () => void
}) {
  const isOutbound = message.direction === 'outbound'

  return (
    <div className={`relative pl-6 pb-4 ${isOutbound ? '' : 'bg-blue-50/50 -mx-4 px-4 py-2 rounded-lg'}`}>
      {/* Timeline line */}
      <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />

      {/* Timeline dot */}
      <div className={`absolute left-0 top-1 w-2 h-2 rounded-full -translate-x-1/2 ${
        isOutbound ? 'bg-blue-500' : 'bg-green-500'
      }`} />

      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <button className="w-full text-left">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                {isOutbound ? (
                  <Send className="h-4 w-4 text-blue-500" />
                ) : (
                  <Inbox className="h-4 w-4 text-green-500" />
                )}
                <div>
                  <p className="font-medium text-sm">{message.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {isOutbound ? `Til: ${message.to_email}` : `Fra: ${message.from_email}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <EmailStatusBadge status={message.status} type="message" size="sm" />
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-3 space-y-3">
            {/* Stats */}
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {message.sent_at ? formatDate(message.sent_at) : formatDate(message.created_at)}
              </span>
              {message.opened_at && (
                <span className="flex items-center gap-1 text-green-600">
                  <Eye className="h-3 w-3" />
                  Åbnet {formatRelative(message.opened_at)}
                  {message.open_count > 1 && ` (${message.open_count}x)`}
                </span>
              )}
              {message.clicked_at && (
                <span className="flex items-center gap-1 text-emerald-600">
                  <MousePointer className="h-3 w-3" />
                  Klikket {formatRelative(message.clicked_at)}
                </span>
              )}
            </div>

            {/* Email body preview */}
            {message.body_text && (
              <div className="bg-white border rounded-lg p-3 text-sm max-h-40 overflow-y-auto">
                <pre className="whitespace-pre-wrap font-sans text-muted-foreground">
                  {message.body_text.slice(0, 500)}
                  {message.body_text.length > 500 && '...'}
                </pre>
              </div>
            )}

            {/* Error message */}
            {message.error_message && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-sm text-red-600">
                Fejl: {message.error_message}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

export function EmailTimeline({ offerId, onSendEmail }: EmailTimelineProps) {
  const [threads, setThreads] = useState<EmailThreadWithRelations[]>([])
  const [messages, setMessages] = useState<EmailMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set())

  const loadData = async () => {
    setIsLoading(true)
    try {
      const threadData = await getEmailThreads({ offer_id: offerId })
      setThreads(threadData)

      // Load messages from all threads
      const allMessages: EmailMessage[] = []
      for (const thread of threadData) {
        const threadMessages = await getEmailMessages(thread.id)
        allMessages.push(...threadMessages)
      }

      // Sort by date
      allMessages.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      setMessages(allMessages)

      // Expand first message by default
      if (allMessages.length > 0) {
        setExpandedMessages(new Set([allMessages[0].id]))
      }
    } catch (error) {
      console.error('Error loading email data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [offerId])

  const toggleMessage = (id: string) => {
    setExpandedMessages(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" />
              E-mail historik
            </CardTitle>
            <CardDescription>
              {messages.length === 0
                ? 'Ingen e-mails sendt endnu'
                : `${messages.length} besked${messages.length !== 1 ? 'er' : ''}`}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={loadData} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            {onSendEmail && (
              <Button size="sm" onClick={onSendEmail}>
                <Send className="h-4 w-4 mr-1" />
                Send e-mail
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Henter e-mails...
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Mail className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>Ingen e-mails sendt til denne kunde endnu.</p>
            {onSendEmail && (
              <Button variant="outline" size="sm" className="mt-3" onClick={onSendEmail}>
                <Send className="h-4 w-4 mr-1" />
                Send første e-mail
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((message) => (
              <EmailMessageCard
                key={message.id}
                message={message}
                isExpanded={expandedMessages.has(message.id)}
                onToggle={() => toggleMessage(message.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
