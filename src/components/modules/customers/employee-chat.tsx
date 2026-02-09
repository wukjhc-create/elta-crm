'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  X,
  Send,
  User,
  Paperclip,
  File,
  Image,
  FileText,
  Loader2,
  Download,
  MessageSquare,
  RefreshCw,
} from 'lucide-react'
import {
  sendEmployeeMessage,
  markCustomerMessagesAsRead,
  uploadEmployeeAttachment,
  getCustomerPortalMessages,
} from '@/lib/actions/portal'
import type { PortalMessageWithRelations, PortalAttachment } from '@/types/portal.types'

interface EmployeeChatProps {
  customerId: string
  customerName: string
  offerId?: string
  onClose?: () => void
  isModal?: boolean
}

// Max file size in bytes (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024

// Allowed file types
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
]

export function EmployeeChat({
  customerId,
  customerName,
  offerId,
  onClose,
  isModal = false,
}: EmployeeChatProps) {
  const router = useRouter()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [messages, setMessages] = useState<PortalMessageWithRelations[]>([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(true)
  const [newMessage, setNewMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingAttachments, setPendingAttachments] = useState<PortalAttachment[]>([])

  // Load messages
  const loadMessages = async () => {
    setIsLoadingMessages(true)
    try {
      const result = await getCustomerPortalMessages(customerId, offerId)
      if (result.success && result.data) {
        setMessages(result.data)

        // Mark unread customer messages as read
        const unreadIds = result.data
          .filter((m) => m.sender_type === 'customer' && !m.read_at)
          .map((m) => m.id)

        if (unreadIds.length > 0) {
          await markCustomerMessagesAsRead(unreadIds)
        }
      }
    } catch (err) {
      console.error('Error loading messages:', err)
    } finally {
      setIsLoadingMessages(false)
    }
  }

  useEffect(() => {
    loadMessages()
  }, [customerId, offerId])

  // Scroll to bottom on mount and when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setError(null)
    setIsUploading(true)

    try {
      for (const file of Array.from(files)) {
        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          setError(`Filen "${file.name}" er for stor (max 10MB)`)
          continue
        }

        // Validate file type
        if (!ALLOWED_TYPES.includes(file.type)) {
          setError(`Filtypen for "${file.name}" er ikke tilladt`)
          continue
        }

        // Upload file
        const formData = new FormData()
        formData.append('file', file)

        const result = await uploadEmployeeAttachment(customerId, formData)

        if (result.success && result.data) {
          setPendingAttachments((prev) => [
            ...prev,
            {
              name: result.data!.name,
              url: result.data!.url,
              size: result.data!.size,
              type: result.data!.type,
            },
          ])
        } else {
          setError(result.error || 'Kunne ikke uploade fil')
        }
      }
    } catch (err) {
      setError('Der opstod en fejl ved upload')
    } finally {
      setIsUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const removeAttachment = (index: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSend = async () => {
    if (!newMessage.trim() && pendingAttachments.length === 0) return

    setIsSending(true)
    setError(null)

    try {
      const result = await sendEmployeeMessage(
        customerId,
        newMessage.trim() || (pendingAttachments.length > 0 ? `Vedhæftet ${pendingAttachments.length} fil(er)` : ''),
        offerId,
        pendingAttachments
      )

      if (!result.success) {
        setError(result.error || 'Kunne ikke sende besked')
        return
      }

      setNewMessage('')
      setPendingAttachments([])
      await loadMessages()
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

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image className="w-4 h-4" />
    if (type === 'application/pdf') return <FileText className="w-4 h-4" />
    return <File className="w-4 h-4" />
  }

  const chatContent = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold">Chat med {customerName}</h2>
            <p className="text-sm text-gray-500">Portal beskeder</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadMessages}
            disabled={isLoadingMessages}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Opdater beskeder"
            aria-label="Opdater beskeder"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingMessages ? 'animate-spin' : ''}`} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg"
              aria-label="Luk chat"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoadingMessages ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
            <p>Indlæser beskeder...</p>
          </div>
        ) : messages.length === 0 ? (
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
                message.sender_type === 'employee'
                  ? 'justify-end'
                  : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[80%] rounded-xl px-4 py-2 ${
                  message.sender_type === 'employee'
                    ? 'bg-primary text-white rounded-br-none'
                    : 'bg-gray-100 text-gray-900 rounded-bl-none'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium opacity-75">
                    {message.sender_type === 'employee'
                      ? message.sender_name || 'Dig'
                      : message.sender_name || customerName}
                  </span>
                  <span className="text-xs opacity-50">
                    {formatTime(message.created_at)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words">
                  {message.message}
                </p>

                {/* Attachments */}
                {message.attachments && message.attachments.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {message.attachments.map((attachment, idx) => (
                      <AttachmentDisplay
                        key={idx}
                        attachment={attachment}
                        isEmployee={message.sender_type === 'employee'}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending attachments preview */}
      {pendingAttachments.length > 0 && (
        <div className="px-4 py-2 border-t bg-gray-50">
          <p className="text-xs text-gray-500 mb-2">Vedhæftede filer:</p>
          <div className="flex flex-wrap gap-2">
            {pendingAttachments.map((attachment, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 bg-white border rounded-lg px-2 py-1 text-sm"
              >
                {getFileIcon(attachment.type)}
                <span className="truncate max-w-[120px]">{attachment.name}</span>
                <span className="text-xs text-gray-400">
                  ({formatFileSize(attachment.size)})
                </span>
                <button
                  onClick={() => removeAttachment(idx)}
                  className="text-gray-400 hover:text-red-500"
                  aria-label="Fjern vedhæftet fil"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          {/* File upload button */}
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            accept={ALLOWED_TYPES.join(',')}
            multiple
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isSending}
            className="px-3 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Vedhæft fil"
            aria-label="Vedhæft fil"
          >
            {isUploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Paperclip className="w-5 h-5" />
            )}
          </button>

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
            disabled={isSending || (!newMessage.trim() && pendingAttachments.length === 0)}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Tryk Enter for at sende, Shift+Enter for ny linje
        </p>
      </div>
    </>
  )

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center md:items-end md:justify-end md:p-6">
        <div
          className="absolute inset-0 bg-black/50"
          onClick={onClose}
        />
        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md h-full md:h-[600px] flex flex-col">
          {chatContent}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border h-[500px] flex flex-col">
      {chatContent}
    </div>
  )
}

// Attachment display component
function AttachmentDisplay({
  attachment,
  isEmployee,
}: {
  attachment: PortalAttachment
  isEmployee: boolean
}) {
  const isImage = attachment.type.startsWith('image/')

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (isImage) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <img
          src={attachment.url}
          alt={attachment.name}
          className="max-w-full rounded-lg max-h-48 object-cover"
        />
      </a>
    )
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-2 p-2 rounded-lg ${
        isEmployee
          ? 'bg-white/20 hover:bg-white/30'
          : 'bg-gray-200 hover:bg-gray-300'
      }`}
    >
      <File className="w-5 h-5 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{attachment.name}</p>
        <p className={`text-xs ${isEmployee ? 'text-white/70' : 'text-gray-500'}`}>
          {formatFileSize(attachment.size)}
        </p>
      </div>
      <Download className="w-4 h-4 flex-shrink-0" />
    </a>
  )
}
