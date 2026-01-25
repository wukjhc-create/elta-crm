'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  X,
  Reply,
  Archive,
  ArchiveRestore,
  Trash2,
  User,
  Building2,
  Folder,
  Calendar,
  Mail,
  MailOpen,
} from 'lucide-react'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import {
  markAsRead,
  markAsUnread,
  archiveMessage,
  unarchiveMessage,
  deleteMessage,
} from '@/lib/actions/messages'
import { MessageTypeBadge } from './message-badges'
import { MessageForm } from './message-form'
import type { MessageWithRelations, InboxFolder } from '@/types/messages.types'

interface MessageThreadProps {
  message: MessageWithRelations
  folder: InboxFolder
  onClose: () => void
  onRefresh?: () => void
}

export function MessageThread({
  message,
  folder,
  onClose,
  onRefresh,
}: MessageThreadProps) {
  const router = useRouter()
  const [showReplyForm, setShowReplyForm] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleMarkAsRead = async () => {
    setIsLoading(true)
    await markAsRead(message.id)
    router.refresh()
    onRefresh?.()
    setIsLoading(false)
  }

  const handleMarkAsUnread = async () => {
    setIsLoading(true)
    await markAsUnread(message.id)
    router.refresh()
    onRefresh?.()
    setIsLoading(false)
  }

  const handleArchive = async () => {
    setIsLoading(true)
    await archiveMessage(message.id)
    router.refresh()
    onRefresh?.()
    onClose()
    setIsLoading(false)
  }

  const handleUnarchive = async () => {
    setIsLoading(true)
    await unarchiveMessage(message.id)
    router.refresh()
    onRefresh?.()
    setIsLoading(false)
  }

  const handleDelete = async () => {
    if (!confirm('Er du sikker på at du vil slette denne besked?')) return
    setIsLoading(true)
    await deleteMessage(message.id)
    router.refresh()
    onRefresh?.()
    onClose()
    setIsLoading(false)
  }

  const isUnread = message.status === 'unread'
  const isSentFolder = folder === 'sent'

  return (
    <div className="h-full flex flex-col bg-white border-l">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold truncate flex-1">{message.subject}</h2>
        <div className="flex items-center gap-1 flex-shrink-0">
          {folder === 'inbox' && (
            <button
              onClick={() => setShowReplyForm(true)}
              className="p-2 hover:bg-muted rounded-md"
              title="Svar"
            >
              <Reply className="w-4 h-4" />
            </button>
          )}
          {folder === 'inbox' && (
            <>
              {isUnread ? (
                <button
                  onClick={handleMarkAsRead}
                  className="p-2 hover:bg-muted rounded-md"
                  title="Markér som læst"
                  disabled={isLoading}
                >
                  <MailOpen className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleMarkAsUnread}
                  className="p-2 hover:bg-muted rounded-md"
                  title="Markér som ulæst"
                  disabled={isLoading}
                >
                  <Mail className="w-4 h-4" />
                </button>
              )}
            </>
          )}
          {folder === 'inbox' && (
            <button
              onClick={handleArchive}
              className="p-2 hover:bg-muted rounded-md"
              title="Arkivér"
              disabled={isLoading}
            >
              <Archive className="w-4 h-4" />
            </button>
          )}
          {folder === 'archived' && (
            <button
              onClick={handleUnarchive}
              className="p-2 hover:bg-muted rounded-md"
              title="Gendan"
              disabled={isLoading}
            >
              <ArchiveRestore className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleDelete}
            className="p-2 hover:bg-red-50 text-red-600 rounded-md"
            title="Slet"
            disabled={isLoading}
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-md ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Message Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Original message being replied to */}
        {message.reply_to_message && (
          <div className="p-3 bg-muted/50 rounded-lg border-l-4 border-muted-foreground/30">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Reply className="w-4 h-4" />
              <span>Svar på besked fra </span>
              <span className="font-medium">
                {(message.reply_to_message as MessageWithRelations).from_user?.full_name ||
                  'Ukendt'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-3">
              {message.reply_to_message.body}
            </p>
          </div>
        )}

        {/* Main message */}
        <div className="space-y-4">
          {/* From/To info */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {isSentFolder ? 'Til: ' : 'Fra: '}
                    {isSentFolder
                      ? message.to_user?.full_name || message.to_user?.email
                      : message.from_user?.full_name ||
                        message.from_name ||
                        message.from_email}
                  </p>
                  {!isSentFolder && message.from_user?.email && (
                    <p className="text-sm text-muted-foreground">
                      {message.from_user.email}
                    </p>
                  )}
                </div>
                <MessageTypeBadge type={message.message_type} />
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                <Calendar className="w-4 h-4" />
                {format(new Date(message.created_at), 'PPPp', { locale: da })}
              </div>
            </div>
          </div>

          {/* Related entities */}
          {(message.lead || message.customer || message.project) && (
            <div className="flex flex-wrap gap-2 pl-[52px]">
              {message.lead && (
                <Link
                  href={`/dashboard/leads/${message.lead.id}`}
                  className="inline-flex items-center gap-1 text-sm bg-orange-50 text-orange-700 px-2 py-1 rounded hover:bg-orange-100"
                >
                  <User className="w-4 h-4" />
                  {message.lead.name}
                </Link>
              )}
              {message.customer && (
                <Link
                  href={`/dashboard/customers/${message.customer.id}`}
                  className="inline-flex items-center gap-1 text-sm bg-green-50 text-green-700 px-2 py-1 rounded hover:bg-green-100"
                >
                  <Building2 className="w-4 h-4" />
                  {message.customer.company_name}
                </Link>
              )}
              {message.project && (
                <Link
                  href={`/dashboard/projects/${message.project.id}`}
                  className="inline-flex items-center gap-1 text-sm bg-purple-50 text-purple-700 px-2 py-1 rounded hover:bg-purple-100"
                >
                  <Folder className="w-4 h-4" />
                  {message.project.project_number}
                </Link>
              )}
            </div>
          )}

          {/* Message body */}
          <div className="pl-[52px]">
            <div className="prose prose-sm max-w-none">
              <p className="whitespace-pre-wrap">{message.body}</p>
            </div>
          </div>
        </div>

        {/* Replies */}
        {message.replies && message.replies.length > 0 && (
          <div className="border-t pt-4 space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              Svar ({message.replies.length})
            </h3>
            {message.replies.map((reply) => {
              const replyWithRelations = reply as MessageWithRelations
              return (
                <div key={reply.id} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 bg-muted/30 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">
                        {replyWithRelations.from_user?.full_name || 'Ukendt'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(reply.created_at), 'Pp', { locale: da })}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{reply.body}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Quick Reply */}
      {folder === 'inbox' && (
        <div className="p-4 border-t">
          <button
            onClick={() => setShowReplyForm(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            <Reply className="w-4 h-4" />
            Svar
          </button>
        </div>
      )}

      {/* Reply Modal */}
      {showReplyForm && (
        <MessageForm
          replyTo={message}
          onClose={() => setShowReplyForm(false)}
          onSuccess={() => {
            setShowReplyForm(false)
            onRefresh?.()
          }}
        />
      )}
    </div>
  )
}
