'use client'

import { FloatingMenu } from '@/components/shared/floating-menu'
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
  searching?: boolean
  onClearSearch?: () => void
  onRefresh?: () => void
  onSelectMessage?: (message: MessageWithRelations) => void
  selectedMessageId?: string
}

export function MessagesList({
  messages,
  folder,
  searching = false,
  onClearSearch,
  onRefresh,
  onSelectMessage,
  selectedMessageId,
}: MessagesListProps) {
  const router = useRouter()
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
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
    const empty = searching
      ? { title: 'Ingen beskeder matcher søgningen.', hint: 'Prøv et andet ord, eller ryd søgningen.' }
      : {
          inbox: { title: 'Ingen beskeder i indbakken.', hint: 'Nye beskeder vises her.' },
          sent: { title: 'Ingen sendte beskeder.', hint: 'Beskeder du sender, vises her.' },
          archived: { title: 'Ingen arkiverede beskeder.', hint: 'Arkiverede beskeder vises her.' },
        }[folder]
    return (
      <div className="bg-white rounded-lg border p-12 text-center text-muted-foreground" data-testid="messages-empty">
        <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">{empty.title}</p>
        <p className="text-sm mt-1">{empty.hint}</p>
        {searching && onClearSearch && (
          <button type="button" onClick={onClearSearch} className="mt-3 text-sm text-blue-700 hover:underline">
            Ryd søgning
          </button>
        )}
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
                    setMenuAnchor(e.currentTarget)
                    setOpenMenuId(openMenuId === message.id ? null : message.id)
                  }}
                  className="p-1 hover:bg-muted rounded"
                  disabled={loadingAction === message.id}
                  aria-label="Flere handlinger"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                {openMenuId === message.id && (
                  // M-8: portal + fixed position; klik i menuen bobler ikke til rækken (onClick stopper propagation)
                  <FloatingMenu anchor={menuAnchor} onClose={() => setOpenMenuId(null)} className="w-48" testId="row-menu">
                    <div onClick={(e) => e.stopPropagation()}>
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
                  </FloatingMenu>
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
