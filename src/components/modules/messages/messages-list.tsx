'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Mail,
  MailOpen,
  Archive,
  ArchiveRestore,
  Trash2,
  MoreHorizontal,
  User,
  Building2,
  Folder,
  Reply,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
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

interface MessagesListProps {
  messages: MessageWithRelations[]
  folder: InboxFolder
  onRefresh?: () => void
  onSelectMessage?: (message: MessageWithRelations) => void
  selectedMessageId?: string
}

export function MessagesList({
  messages,
  folder,
  onRefresh,
  onSelectMessage,
  selectedMessageId,
}: MessagesListProps) {
  const router = useRouter()
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [replyingTo, setReplyingTo] = useState<MessageWithRelations | null>(null)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)

  const handleMarkAsRead = async (id: string) => {
    setLoadingAction(id)
    await markAsRead(id)
    router.refresh()
    onRefresh?.()
    setLoadingAction(null)
  }

  const handleMarkAsUnread = async (id: string) => {
    setLoadingAction(id)
    await markAsUnread(id)
    router.refresh()
    onRefresh?.()
    setLoadingAction(null)
  }

  const handleArchive = async (id: string) => {
    setLoadingAction(id)
    await archiveMessage(id)
    router.refresh()
    onRefresh?.()
    setLoadingAction(null)
  }

  const handleUnarchive = async (id: string) => {
    setLoadingAction(id)
    await unarchiveMessage(id)
    router.refresh()
    onRefresh?.()
    setLoadingAction(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Er du sikker på at du vil slette denne besked?')) return
    setLoadingAction(id)
    await deleteMessage(id)
    router.refresh()
    onRefresh?.()
    setLoadingAction(null)
  }

  if (messages.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Mail className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>Ingen beskeder i denne mappe.</p>
      </div>
    )
  }

  return (
    <>
      <div className="divide-y">
        {messages.map((message) => {
          const isUnread = message.status === 'unread'
          const isSelected = selectedMessageId === message.id
          const isSentFolder = folder === 'sent'

          return (
            <div
              key={message.id}
              className={`flex items-start gap-3 p-4 hover:bg-muted/50 cursor-pointer transition-colors ${
                isUnread ? 'bg-blue-50/50' : ''
              } ${isSelected ? 'bg-muted' : ''}`}
              onClick={() => {
                if (isUnread && folder === 'inbox') {
                  handleMarkAsRead(message.id)
                }
                onSelectMessage?.(message)
              }}
            >
              {/* Unread indicator */}
              <div className="pt-1">
                {isUnread ? (
                  <div className="w-2 h-2 bg-blue-500 rounded-full" />
                ) : (
                  <div className="w-2 h-2" />
                )}
              </div>

              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-muted-foreground" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`truncate ${isUnread ? 'font-semibold' : 'font-medium'}`}
                    >
                      {isSentFolder
                        ? message.to_user?.full_name || message.to_user?.email || 'Ukendt'
                        : message.from_user?.full_name ||
                          message.from_name ||
                          message.from_email ||
                          'Ukendt'}
                    </span>
                    <MessageTypeBadge type={message.message_type} />
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {formatDistanceToNow(new Date(message.created_at), {
                      addSuffix: true,
                      locale: da,
                    })}
                  </span>
                </div>

                <p className={`text-sm truncate ${isUnread ? 'font-medium' : ''}`}>
                  {message.subject}
                </p>

                <p className="text-sm text-muted-foreground truncate">
                  {message.body.substring(0, 100)}...
                </p>

                {/* Related entities */}
                {(message.lead || message.customer || message.project) && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {message.lead && (
                      <span className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded">
                        <User className="w-3 h-3" />
                        {message.lead.contact_person}
                      </span>
                    )}
                    {message.customer && (
                      <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">
                        <Building2 className="w-3 h-3" />
                        {message.customer.company_name}
                      </span>
                    )}
                    {message.project && (
                      <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
                        <Folder className="w-3 h-3" />
                        {message.project.project_number}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="relative flex-shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpenMenuId(openMenuId === message.id ? null : message.id)
                  }}
                  className="p-1 hover:bg-muted rounded"
                  disabled={loadingAction === message.id}
                  aria-label="Flere handlinger"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                {openMenuId === message.id && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenMenuId(null)
                      }}
                    />
                    <div className="absolute right-0 mt-1 w-48 bg-white border rounded-md shadow-lg z-20">
                      {folder === 'inbox' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setReplyingTo(message)
                            setOpenMenuId(null)
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                        >
                          <Reply className="w-4 h-4" />
                          Svar
                        </button>
                      )}
                      {folder === 'inbox' && (
                        <>
                          {isUnread ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleMarkAsRead(message.id)
                                setOpenMenuId(null)
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                            >
                              <MailOpen className="w-4 h-4" />
                              Markér som læst
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleMarkAsUnread(message.id)
                                setOpenMenuId(null)
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                            >
                              <Mail className="w-4 h-4" />
                              Markér som ulæst
                            </button>
                          )}
                        </>
                      )}
                      {folder === 'inbox' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleArchive(message.id)
                            setOpenMenuId(null)
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                        >
                          <Archive className="w-4 h-4" />
                          Arkivér
                        </button>
                      )}
                      {folder === 'archived' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleUnarchive(message.id)
                            setOpenMenuId(null)
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                        >
                          <ArchiveRestore className="w-4 h-4" />
                          Gendan
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(message.id)
                          setOpenMenuId(null)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        Slet
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Reply Modal */}
      {replyingTo && (
        <MessageForm
          replyTo={replyingTo}
          onClose={() => setReplyingTo(null)}
          onSuccess={() => {
            setReplyingTo(null)
            onRefresh?.()
          }}
        />
      )}
    </>
  )
}
