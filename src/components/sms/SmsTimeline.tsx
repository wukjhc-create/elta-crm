'use client'

/**
 * SMS TIMELINE
 *
 * Display SMS history for an offer or customer
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SmsStatusBadge } from './SmsStatusBadge'
import { getSmsMessages } from '@/lib/actions/sms'
import type { SmsMessage } from '@/types/sms.types'
import {
  MessageSquare,
  Phone,
  Clock,
  CheckCircle,
  User,
  Loader2,
} from 'lucide-react'
import { formatDateTimeDK } from '@/lib/utils/format'

interface SmsTimelineProps {
  offerId?: string
  customerId?: string
  limit?: number
}

export function SmsTimeline({ offerId, customerId, limit = 10 }: SmsTimelineProps) {
  const [messages, setMessages] = useState<SmsMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadMessages()
  }, [offerId, customerId])

  const loadMessages = async () => {
    setIsLoading(true)
    try {
      const data = await getSmsMessages({
        offer_id: offerId,
        customer_id: customerId,
        limit,
      })
      setMessages(data)
    } catch (error) {
      console.error('Error loading SMS messages:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            SMS historik
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Indlæser...
          </div>
        </CardContent>
      </Card>
    )
  }

  if (messages.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            SMS historik
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Ingen SMS beskeder endnu</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          SMS historik
          <Badge variant="secondary" className="ml-auto">
            {messages.length} {messages.length === 1 ? 'besked' : 'beskeder'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {messages.map((message) => (
          <SmsMessageCard key={message.id} message={message} />
        ))}
      </CardContent>
    </Card>
  )
}

function SmsMessageCard({ message }: { message: SmsMessage }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div
      className="border rounded-lg p-3 hover:bg-muted/50 cursor-pointer transition-colors"
      onClick={() => setIsExpanded(!isExpanded)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="bg-blue-100 text-blue-700 rounded-full p-1.5 flex-shrink-0">
            <Phone className="h-3 w-3" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">
              {message.to_name || 'Ukendt'}
            </p>
            <p className="text-xs text-muted-foreground">
              {message.to_phone}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <SmsStatusBadge status={message.status} size="sm" />
        </div>
      </div>

      {/* Message preview */}
      <div className="mt-2 pl-8">
        <p className={`text-sm text-muted-foreground ${isExpanded ? '' : 'line-clamp-2'}`}>
          {message.message}
        </p>
      </div>

      {/* Timestamps & details (expanded) */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t pl-8 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              Oprettet: {formatDateTimeDK(message.created_at)}
            </div>

            {message.sent_at && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <CheckCircle className="h-3 w-3" />
                Sendt: {formatDateTimeDK(message.sent_at)}
              </div>
            )}

            {message.delivered_at && (
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle className="h-3 w-3" />
                Leveret: {formatDateTimeDK(message.delivered_at)}
              </div>
            )}

            {message.failed_at && (
              <div className="flex items-center gap-1 text-red-600">
                Fejlet: {formatDateTimeDK(message.failed_at)}
              </div>
            )}
          </div>

          {/* Additional info */}
          <div className="flex flex-wrap gap-2 text-xs">
            {message.parts_count > 1 && (
              <Badge variant="outline" className="text-xs">
                {message.parts_count} SMS dele
              </Badge>
            )}

            {message.cost && (
              <Badge variant="outline" className="text-xs">
                {(message.cost / 100).toFixed(2)} DKK
              </Badge>
            )}

            {message.from_name && (
              <Badge variant="outline" className="text-xs">
                Fra: {message.from_name}
              </Badge>
            )}
          </div>

          {/* Error message */}
          {message.error_message && (
            <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
              <strong>Fejl:</strong> {message.error_message}
              {message.error_code && ` (${message.error_code})`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Compact SMS list for sidebars
 */
export function SmsListCompact({ offerId, customerId }: { offerId?: string; customerId?: string }) {
  const [messages, setMessages] = useState<SmsMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadMessages()
  }, [offerId, customerId])

  const loadMessages = async () => {
    setIsLoading(true)
    try {
      const data = await getSmsMessages({
        offer_id: offerId,
        customer_id: customerId,
        limit: 5,
      })
      setMessages(data)
    } catch (error) {
      console.error('Error loading SMS messages:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Indlæser...
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground text-sm">
        Ingen SMS beskeder
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {messages.map((message) => (
        <div key={message.id} className="flex items-center gap-2 text-sm">
          <SmsStatusBadge status={message.status} size="sm" showIcon={false} />
          <span className="truncate flex-1">{message.to_phone}</span>
          <span className="text-xs text-muted-foreground">
            {formatDateTimeDK(message.sent_at || message.created_at)}
          </span>
        </div>
      ))}
    </div>
  )
}
