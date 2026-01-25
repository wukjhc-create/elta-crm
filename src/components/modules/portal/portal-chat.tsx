'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X, Send, User } from 'lucide-react'
import { sendPortalMessage, markPortalMessagesAsRead } from '@/lib/actions/portal'
import type { PortalSession, PortalMessageWithRelations } from '@/types/portal.types'

interface PortalChatProps {
  token: string
  session: PortalSession
  messages: PortalMessageWithRelations[]
  offerId?: string
  onClose: () => void
}

export function PortalChat({
  token,
  session,
  messages,
  offerId,
  onClose,
}: PortalChatProps) {
  const router = useRouter()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [newMessage, setNewMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Scroll to bottom on mount and when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Mark unread messages as read
  useEffect(() => {
    const unreadIds = messages
      .filter((m) => m.sender_type === 'employee' && !m.read_at)
      .map((m) => m.id)

    if (unreadIds.length > 0) {
      markPortalMessagesAsRead(token, unreadIds)
    }
  }, [messages, token])

  const handleSend = async () => {
    if (!newMessage.trim()) return

    setIsSending(true)
    setError(null)

    try {
      const result = await sendPortalMessage(token, {
        customer_id: session.customer_id,
        offer_id: offerId,
        message: newMessage.trim(),
        sender_type: 'customer',
        sender_name: session.customer.contact_person,
      })

      if (!result.success) {
        setError(result.error || 'Kunne ikke sende besked')
        return
      }

      setNewMessage('')
      router.refresh()
    } catch (err) {
      setError('Der opstod en fejl')
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()

    if (isToday) {
      return date.toLocaleTimeString('da-DK', {
        hour: '2-digit',
        minute: '2-digit',
      })
    }

    return date.toLocaleDateString('da-DK', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center md:items-end md:justify-end md:p-6">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md h-full md:h-[600px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="font-semibold">Beskeder</h2>
            <p className="text-sm text-gray-500">
              Chat med din sælger
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <User className="w-12 h-12 mb-2 opacity-50" />
              <p className="text-center">
                Ingen beskeder endnu.<br />
                Skriv en besked for at starte samtalen.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.sender_type === 'customer'
                    ? 'justify-end'
                    : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-2 ${
                    message.sender_type === 'customer'
                      ? 'bg-primary text-white rounded-br-none'
                      : 'bg-gray-100 text-gray-900 rounded-bl-none'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium opacity-75">
                      {message.sender_type === 'customer'
                        ? 'Dig'
                        : message.sender_name || 'Sælger'}
                    </span>
                    <span className="text-xs opacity-50">
                      {formatTime(message.created_at)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap break-words">
                    {message.message}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-2 bg-red-50 border-t border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Skriv en besked..."
              rows={1}
              className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              disabled={isSending}
            />
            <button
              onClick={handleSend}
              disabled={isSending || !newMessage.trim()}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Tryk Enter for at sende, Shift+Enter for ny linje
          </p>
        </div>
      </div>
    </div>
  )
}
