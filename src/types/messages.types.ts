// Message status enum
export const MESSAGE_STATUSES = ['unread', 'read', 'archived'] as const

export type MessageStatus = (typeof MESSAGE_STATUSES)[number]

// Message type enum
export const MESSAGE_TYPES = ['email', 'sms', 'internal', 'note'] as const

export type MessageType = (typeof MESSAGE_TYPES)[number]

// Status labels in Danish
export const MESSAGE_STATUS_LABELS: Record<MessageStatus, string> = {
  unread: 'Ulæst',
  read: 'Læst',
  archived: 'Arkiveret',
}

// Type labels in Danish
export const MESSAGE_TYPE_LABELS: Record<MessageType, string> = {
  email: 'E-mail',
  sms: 'SMS',
  internal: 'Intern',
  note: 'Note',
}

// Status colors
export const MESSAGE_STATUS_COLORS: Record<MessageStatus, string> = {
  unread: 'bg-blue-100 text-blue-800',
  read: 'bg-gray-100 text-gray-800',
  archived: 'bg-gray-100 text-gray-600',
}

// Type colors
export const MESSAGE_TYPE_COLORS: Record<MessageType, string> = {
  email: 'bg-purple-100 text-purple-800',
  sms: 'bg-green-100 text-green-800',
  internal: 'bg-blue-100 text-blue-800',
  note: 'bg-yellow-100 text-yellow-800',
}

// Attachment type
export interface MessageAttachment {
  name: string
  url: string
  size?: number
  type?: string
}

// Message database type
export interface Message {
  id: string
  subject: string
  body: string
  message_type: MessageType
  status: MessageStatus
  from_user_id: string | null
  from_email: string | null
  from_name: string | null
  to_user_id: string
  to_email: string | null
  cc: string[]
  bcc: string[]
  reply_to: string | null
  lead_id: string | null
  customer_id: string | null
  project_id: string | null
  attachments: MessageAttachment[]
  read_at: string | null
  archived_at: string | null
  created_at: string
}

// Message with relations
export interface MessageWithRelations extends Message {
  from_user?: {
    id: string
    full_name: string | null
    email: string
  } | null
  to_user?: {
    id: string
    full_name: string | null
    email: string
  } | null
  lead?: {
    id: string
    contact_person: string
    company_name: string
  } | null
  customer?: {
    id: string
    company_name: string
    customer_number: string
  } | null
  project?: {
    id: string
    project_number: string
    name: string
  } | null
  reply_to_message?: Message | null
  replies?: Message[]
}

// Create message input
export interface CreateMessageInput {
  subject: string
  body: string
  message_type?: MessageType
  to_user_id: string
  to_email?: string | null
  cc?: string[]
  bcc?: string[]
  reply_to?: string | null
  lead_id?: string | null
  customer_id?: string | null
  project_id?: string | null
}

// Message filter input
export interface MessageFilterInput {
  status?: MessageStatus
  message_type?: MessageType
  search?: string
  lead_id?: string
  customer_id?: string
  project_id?: string
}

// Inbox folder types
export const INBOX_FOLDERS = ['inbox', 'sent', 'archived'] as const

export type InboxFolder = (typeof INBOX_FOLDERS)[number]

// Folder labels in Danish
export const INBOX_FOLDER_LABELS: Record<InboxFolder, string> = {
  inbox: 'Indbakke',
  sent: 'Sendt',
  archived: 'Arkiv',
}
