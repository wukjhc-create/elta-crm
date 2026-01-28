'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Plus,
  Search,
  Inbox,
  Send,
  Archive,
  Mail,
  RefreshCw,
} from 'lucide-react'
import { getMessages, getUnreadCount, getMessage } from '@/lib/actions/messages'
import { MessagesList } from './messages-list'
import { MessageThread } from './message-thread'
import { MessageForm } from './message-form'
import {
  INBOX_FOLDERS,
  INBOX_FOLDER_LABELS,
  type MessageWithRelations,
  type InboxFolder,
} from '@/types/messages.types'

const FOLDER_ICONS: Record<InboxFolder, typeof Inbox> = {
  inbox: Inbox,
  sent: Send,
  archived: Archive,
}

export function MessagesPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [messages, setMessages] = useState<MessageWithRelations[]>([])
  const [selectedMessage, setSelectedMessage] = useState<MessageWithRelations | null>(
    null
  )
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showComposeForm, setShowComposeForm] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  // Current folder
  const currentFolder = (searchParams.get('folder') as InboxFolder) || 'inbox'
  const [search, setSearch] = useState(searchParams.get('search') || '')

  const loadMessages = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [messagesResult, unreadResult] = await Promise.all([
        getMessages(currentFolder, { search: search || undefined }),
        getUnreadCount(),
      ])

      if (messagesResult.success && messagesResult.data) {
        setMessages(messagesResult.data)
      } else if (!messagesResult.success) {
        setError(messagesResult.error || 'Kunne ikke hente beskeder')
      }
      if (unreadResult.success && typeof unreadResult.data === 'number') {
        setUnreadCount(unreadResult.data)
      }
    } catch (err) {
      console.error('Failed to load messages:', err)
      setError('Der opstod en fejl ved hentning af beskeder')
    } finally {
      setIsLoading(false)
    }
  }, [currentFolder, search])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  // Update URL when folder changes
  const setFolder = (folder: InboxFolder) => {
    setSelectedMessage(null)
    const params = new URLSearchParams()
    params.set('folder', folder)
    if (search) params.set('search', search)
    router.push(`/dashboard/inbox?${params.toString()}`)
  }

  // Load full message when selected
  const handleSelectMessage = async (message: MessageWithRelations) => {
    const result = await getMessage(message.id)
    if (result.success && result.data) {
      setSelectedMessage(result.data)
    }
  }

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Beskeder</h1>
          <p className="text-muted-foreground">Intern kommunikation</p>
        </div>
        <button
          onClick={() => setShowComposeForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          Ny Besked
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex bg-white border rounded-lg overflow-hidden">
        {/* Sidebar */}
        <div className="w-56 border-r flex flex-col">
          {/* Folders */}
          <nav className="p-2 space-y-1">
            {INBOX_FOLDERS.map((folder) => {
              const Icon = FOLDER_ICONS[folder]
              const isActive = currentFolder === folder
              return (
                <button
                  key={folder}
                  onClick={() => setFolder(folder)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    {INBOX_FOLDER_LABELS[folder]}
                  </span>
                  {folder === 'inbox' && unreadCount > 0 && (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full ${
                        isActive
                          ? 'bg-primary-foreground/20 text-primary-foreground'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {unreadCount}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          {/* Refresh */}
          <div className="mt-auto p-2 border-t">
            <button
              onClick={loadMessages}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Opdater
            </button>
          </div>
        </div>

        {/* Message List */}
        <div className={`flex-1 flex flex-col ${selectedMessage ? 'w-1/2' : ''}`}>
          {/* Search */}
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Søg i beskeder..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    loadMessages()
                  }
                }}
                className="w-full pl-10 pr-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                Indlæser beskeder...
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-full">
                <p className="text-red-600 mb-4">{error}</p>
                <button
                  onClick={loadMessages}
                  className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
                >
                  Prøv igen
                </button>
              </div>
            ) : (
              <MessagesList
                messages={messages}
                folder={currentFolder}
                onRefresh={loadMessages}
                onSelectMessage={handleSelectMessage}
                selectedMessageId={selectedMessage?.id}
              />
            )}
          </div>
        </div>

        {/* Message Detail */}
        {selectedMessage && (
          <div className="w-1/2 border-l">
            <MessageThread
              message={selectedMessage}
              folder={currentFolder}
              onClose={() => setSelectedMessage(null)}
              onRefresh={loadMessages}
            />
          </div>
        )}
      </div>

      {/* Compose Form */}
      {showComposeForm && (
        <MessageForm
          onClose={() => setShowComposeForm(false)}
          onSuccess={() => {
            setShowComposeForm(false)
            loadMessages()
          }}
        />
      )}
    </div>
  )
}
