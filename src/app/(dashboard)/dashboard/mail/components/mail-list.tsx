'use client'

import {
  Search,
  X,
  Mail,
  MailOpen,
  Paperclip,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react'
import type { IncomingEmailWithCustomer, EmailLinkStatus } from '@/types/mail-bridge.types'

// =====================================================
// Types
// =====================================================

export type ReadFilter = 'all' | 'read' | 'unread'
export type SortOrder = 'newest' | 'oldest'

// =====================================================
// Props
// =====================================================

interface MailListProps {
  emails: IncomingEmailWithCustomer[]
  selectedEmailId: string | null
  isLoading: boolean
  search: string
  readFilter: ReadFilter
  sortOrder: SortOrder
  emailLeadMap: Record<string, { leadId: string; status: string }>
  onSelectEmail: (email: IncomingEmailWithCustomer) => void
  onSearchChange: (value: string) => void
  onSearchSubmit: () => void
  onReadFilterChange: (filter: ReadFilter) => void
  onSortOrderChange: (order: SortOrder) => void
  onToggleReadStatus: (id: string, currentlyRead: boolean) => void
}

// =====================================================
// Helpers
// =====================================================

function statusBadge(status: EmailLinkStatus) {
  const map: Record<EmailLinkStatus, { icon: typeof Mail; label: string; cls: string }> = {
    linked: { icon: CheckCircle2, label: 'Koblet', cls: 'bg-green-100 text-green-800' },
    unidentified: { icon: AlertCircle, label: 'Uidentificeret', cls: 'bg-amber-100 text-amber-800' },
    pending: { icon: Clock, label: 'Afventer', cls: 'bg-gray-100 text-gray-600' },
    ignored: { icon: XCircle, label: 'Ignoreret', cls: 'bg-gray-100 text-gray-400' },
  }
  const c = map[status]
  if (!c) return null
  const Icon = c.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.cls}`}>
      <Icon className="w-3 h-3" /> {c.label}
    </span>
  )
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000) return 'Lige nu'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} min`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}t`
  return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })
}

// =====================================================
// Component — matches Leads page filter-bar pattern
// =====================================================

export function MailList({
  emails,
  selectedEmailId,
  isLoading,
  search,
  readFilter,
  sortOrder,
  emailLeadMap,
  onSelectEmail,
  onSearchChange,
  onSearchSubmit,
  onReadFilterChange,
  onSortOrderChange,
  onToggleReadStatus,
}: MailListProps) {
  const hasActiveFilters = readFilter !== 'all' || sortOrder !== 'newest' || search.length > 0

  return (
    <div className="w-2/5 flex flex-col gap-3">
      {/* ============================================= */}
      {/* FILTER BAR — same style as Leads page         */}
      {/* bg-white rounded-lg border p-4                */}
      {/* ============================================= */}
      <div className="bg-white rounded-lg border p-4 space-y-3">
        {/* Row 1: Search + Søg button */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSearchSubmit() }}
              placeholder="Søg i emne, afsender..."
              className="w-full pl-10 pr-10 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {search && (
              <button
                onClick={() => { onSearchChange(''); onSearchSubmit() }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={onSearchSubmit}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium"
          >
            Søg
          </button>
        </div>

        {/* Row 2: Sortér dropdown + Læst/ulæst dropdown */}
        <div className="flex gap-3">
          {/* Sort dropdown — exactly like Leads status filter */}
          <select
            value={sortOrder}
            onChange={(e) => onSortOrderChange(e.target.value as SortOrder)}
            className="border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="newest">Nyeste først</option>
            <option value="oldest">Ældste først</option>
          </select>

          {/* Read filter dropdown — exactly like Leads source filter */}
          <select
            value={readFilter}
            onChange={(e) => onReadFilterChange(e.target.value as ReadFilter)}
            className="border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">Alle emails</option>
            <option value="unread">Kun ulæste</option>
            <option value="read">Kun læste</option>
          </select>
        </div>

        {/* Active filters display — same pattern as Leads */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 pt-3 border-t">
            <span className="text-sm text-gray-500">Aktive filtre:</span>
            {search && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-sm">
                Søgning: {search}
                <button onClick={() => { onSearchChange(''); onSearchSubmit() }} className="hover:text-red-600">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {readFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-sm">
                {readFilter === 'unread' ? 'Ulæste' : 'Læste'}
                <button onClick={() => onReadFilterChange('all')} className="hover:text-red-600">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {sortOrder !== 'newest' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-sm">
                Ældste først
                <button onClick={() => onSortOrderChange('newest')} className="hover:text-red-600">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            <button
              onClick={() => {
                onSearchChange('')
                onReadFilterChange('all')
                onSortOrderChange('newest')
                onSearchSubmit()
              }}
              className="text-sm text-red-600 hover:text-red-800 ml-2"
            >
              Ryd alle
            </button>
          </div>
        )}
      </div>

      {/* ============================================= */}
      {/* EMAIL LIST — bg-white rounded-lg border       */}
      {/* ============================================= */}
      <div className="bg-white rounded-lg border overflow-hidden flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto max-h-[550px]">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400">
              <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mb-2" />
              <p className="text-sm">Indlæser emails...</p>
            </div>
          ) : emails.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <Mail className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="font-medium">Ingen emails fundet</p>
              {readFilter !== 'all' && (
                <button
                  onClick={() => onReadFilterChange('all')}
                  className="mt-2 text-sm text-blue-600 hover:underline"
                >
                  Vis alle emails
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {emails.map((email) => {
                const isSelected = selectedEmailId === email.id
                const isUnread = !email.is_read
                return (
                  <div
                    key={email.id}
                    onClick={() => onSelectEmail(email)}
                    className={`p-3 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-50 border-l-4 border-l-blue-600'
                        : 'border-l-4 border-l-transparent hover:bg-gray-50'
                    } ${isUnread && !isSelected ? 'bg-blue-50/30' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      {/* Unread dot */}
                      <div className="pt-1.5 w-3 shrink-0">
                        {isUnread && (
                          <div className="w-2.5 h-2.5 rounded-full bg-blue-600 ring-2 ring-blue-200" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm truncate ${isUnread ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
                            {email.sender_name || email.sender_email}
                          </span>
                          <span className={`text-xs shrink-0 ${isUnread ? 'font-semibold text-blue-600' : 'text-gray-400'}`}>
                            {formatDate(email.received_at)}
                          </span>
                        </div>
                        <p className={`text-sm truncate ${isUnread ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                          {email.subject}
                        </p>
                        <p className="text-xs text-gray-400 truncate mt-0.5">
                          {email.body_preview}
                        </p>
                        {/* Bottom row: badges + icons */}
                        <div className="flex items-center gap-1.5 mt-1.5">
                          {statusBadge(email.link_status)}
                          {emailLeadMap[email.id] && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
                              Lead
                            </span>
                          )}
                          <div className="ml-auto flex items-center gap-1">
                            {email.has_attachments && (
                              <Paperclip className="w-3.5 h-3.5 text-gray-400" />
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                onToggleReadStatus(email.id, email.is_read)
                              }}
                              className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-blue-600 transition-colors"
                              title={email.is_read ? 'Markér ulæst' : 'Markér læst'}
                            >
                              {email.is_read ? <Mail className="w-3.5 h-3.5" /> : <MailOpen className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
