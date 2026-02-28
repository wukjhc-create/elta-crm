'use client'

import React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  RefreshCw,
  Search,
  Link2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Mail,
  Archive,
  EyeOff,
  ExternalLink,
  XCircle,
  X,
  UserPlus,
  ShieldAlert,
  Paperclip,
  Download,
  FileText,
  Image,
  ZoomIn,
  MessageCircle,
} from 'lucide-react'
import { GoldenButton } from './components/golden-button'
import { checkCustomerPortalAccess } from '@/lib/actions/quote-actions'
import {
  getIncomingEmails,
  getIncomingEmailStats,
  markEmailAsRead,
  archiveEmail,
  linkEmailToCustomer,
  ignoreIncomingEmail,
  triggerEmailSync,
  getGraphSyncState,
  testGraphConnection,
  createCustomerFromEmail,
} from '@/lib/actions/incoming-emails'
import type {
  IncomingEmailWithCustomer,
  EmailLinkStatus,
  GraphSyncState,
} from '@/types/mail-bridge.types'

// =====================================================
// Filter tabs (AO removed)
// =====================================================

type FilterTab = 'all' | EmailLinkStatus

const FILTER_TABS: { value: FilterTab; label: string; icon: typeof Mail }[] = [
  { value: 'all', label: 'Alle', icon: Mail },
  { value: 'unidentified', label: 'Uidentificerede', icon: AlertCircle },
  { value: 'linked', label: 'Koblede', icon: CheckCircle2 },
  { value: 'pending', label: 'Afventer', icon: Clock },
  { value: 'ignored', label: 'Ignorerede', icon: XCircle },
]

// =====================================================
// Main Component
// =====================================================

export function MailClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // State
  const [emails, setEmails] = useState<IncomingEmailWithCustomer[]>([])
  const [selectedEmail, setSelectedEmail] = useState<IncomingEmailWithCustomer | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncState, setSyncState] = useState<GraphSyncState | null>(null)
  const [stats, setStats] = useState({ total: 0, unread: 0, unidentified: 0, linked: 0 })
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkSearch, setLinkSearch] = useState('')
  const [customerResults, setCustomerResults] = useState<Array<{ id: string; company_name: string; email: string; customer_number: string }>>([])
  const [graphStatus, setGraphStatus] = useState<{ tested: boolean; success: boolean; error?: string }>({ tested: false, success: false })

  const currentFilter = (searchParams.get('filter') as FilterTab) || 'all'
  const currentPage = parseInt(searchParams.get('page') || '1')

  // Load emails
  const loadEmails = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [emailResult, statsResult, syncStateResult] = await Promise.all([
        getIncomingEmails({
          filter: currentFilter,
          search: search || undefined,
          page: currentPage,
          pageSize: 25,
        }),
        getIncomingEmailStats(),
        getGraphSyncState(),
      ])
      setEmails(emailResult.data)
      setTotalCount(emailResult.count)
      setStats({
        total: statsResult.total,
        unread: statsResult.unread,
        unidentified: statsResult.unidentified,
        linked: statsResult.linked,
      })
      setSyncState(syncStateResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke hente emails')
    } finally {
      setIsLoading(false)
    }
  }, [currentFilter, search, currentPage])

  useEffect(() => {
    loadEmails()
  }, [loadEmails])

  // Navigation helpers
  const setFilter = (filter: FilterTab) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('filter', filter)
    params.delete('page')
    router.push(`/dashboard/mail?${params.toString()}`)
  }

  // Actions
  const handleSync = async () => {
    setIsSyncing(true)
    try {
      const result = await triggerEmailSync()
      if (!result.success && result.errors.length > 0) {
        setError(result.errors[0])
      }
      await loadEmails()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync fejlede')
    } finally {
      setIsSyncing(false)
    }
  }

  const handleTestConnection = async () => {
    const result = await testGraphConnection()
    setGraphStatus({ tested: true, success: result.success, error: result.error })
  }

  const handleSelectEmail = async (email: IncomingEmailWithCustomer) => {
    setSelectedEmail(email)
    if (!email.is_read) {
      await markEmailAsRead(email.id)
      setEmails((prev) =>
        prev.map((e) => (e.id === email.id ? { ...e, is_read: true } : e))
      )
    }
  }

  const handleArchive = async (id: string) => {
    await archiveEmail(id)
    setEmails((prev) => prev.filter((e) => e.id !== id))
    if (selectedEmail?.id === id) setSelectedEmail(null)
  }

  const handleIgnore = async (id: string) => {
    await ignoreIncomingEmail(id)
    await loadEmails()
    if (selectedEmail?.id === id) setSelectedEmail(null)
  }

  const handleManualLink = async (emailId: string, customerId: string) => {
    await linkEmailToCustomer(emailId, customerId)
    setShowLinkModal(false)
    await loadEmails()
  }

  const handleCreateCustomer = async (emailId: string) => {
    try {
      const result = await createCustomerFromEmail(emailId)
      if (result.success) {
        if (result.isExisting) {
          alert('Email koblet til eksisterende kunde')
        } else {
          alert('Ny kunde oprettet og email koblet')
        }
        await loadEmails()
        // Update selected email
        if (selectedEmail?.id === emailId) {
          const updated = emails.find((e) => e.id === emailId)
          if (updated) setSelectedEmail({ ...updated, link_status: 'linked' as const })
        }
      } else {
        alert(`Fejl: ${result.error}`)
      }
    } catch (err) {
      alert('Kunne ikke oprette kunde')
    }
  }

  const searchCustomers = async (term: string) => {
    setLinkSearch(term)
    if (term.length < 2) {
      setCustomerResults([])
      return
    }
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data } = await supabase
      .from('customers')
      .select('id, company_name, email, customer_number')
      .or(`company_name.ilike.%${term}%,email.ilike.%${term}%,contact_person.ilike.%${term}%`)
      .limit(8)
    setCustomerResults(data || [])
  }

  // Format helpers
  const formatDate = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 60_000) return 'Lige nu'
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)} min siden`
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}t siden`
    return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const statusBadge = (status: EmailLinkStatus) => {
    switch (status) {
      case 'linked':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle2 className="w-3 h-3" /> Koblet</span>
      case 'unidentified':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800"><AlertCircle className="w-3 h-3" /> Uidentificeret</span>
      case 'pending':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"><Clock className="w-3 h-3" /> Afventer</span>
      case 'ignored':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-400"><XCircle className="w-3 h-3" /> Ignoreret</span>
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mail</h1>
          <p className="text-gray-500">
            Indgående emails fra CRM-postkassen
            {syncState?.last_sync_at && (
              <span className="ml-2 text-xs">
                Seneste sync: {formatDate(syncState.last_sync_at)}
                {syncState.last_sync_status === 'failed' && (
                  <span className="text-red-500 ml-1">(fejlet)</span>
                )}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <GoldenButton selectedEmail={selectedEmail} />
          <button
            onClick={handleTestConnection}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-md hover:bg-gray-50"
          >
            <ShieldAlert className="w-4 h-4" />
            Test forbindelse
          </button>
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Synkroniserer...' : 'Sync nu'}
          </button>
        </div>
      </div>

      {/* Graph status banner */}
      {graphStatus.tested && (
        <div className={`p-3 rounded-md text-sm ${graphStatus.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {graphStatus.success
            ? 'Microsoft Graph-forbindelse OK'
            : `Graph-forbindelse fejlet: ${graphStatus.error}`
          }
        </div>
      )}

      {error && (
        <div className="p-3 rounded-md text-sm bg-red-50 text-red-800 border border-red-200">
          {error}
        </div>
      )}

      {/* Stats bar — 4 cards (AO removed) */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Samlet', value: stats.total, color: 'bg-gray-100 text-gray-800' },
          { label: 'Ulæste', value: stats.unread, color: 'bg-blue-100 text-blue-800' },
          { label: 'Uidentificerede', value: stats.unidentified, color: 'bg-amber-100 text-amber-800' },
          { label: 'Koblede', value: stats.linked, color: 'bg-green-100 text-green-800' },
        ].map((stat) => (
          <div key={stat.label} className={`rounded-lg p-3 ${stat.color}`}>
            <div className="text-2xl font-bold">{stat.value}</div>
            <div className="text-xs">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b">
        {FILTER_TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = currentFilter === tab.value
          return (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const params = new URLSearchParams(searchParams.toString())
              if (search) params.set('search', search)
              else params.delete('search')
              params.delete('page')
              router.push(`/dashboard/mail?${params.toString()}`)
            }
          }}
          placeholder="Søg i emne, afsender..."
          className="w-full pl-10 pr-4 py-2 border rounded-md text-sm"
        />
      </div>

      {/* Main content: split view */}
      <div className="flex gap-4 min-h-[600px]">
        {/* Email list */}
        <div className="w-2/5 border rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400">Indlæser...</div>
          ) : emails.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <Mail className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>Ingen emails fundet</p>
            </div>
          ) : (
            <div className="divide-y overflow-y-auto max-h-[600px]">
              {emails.map((email) => (
                <button
                  key={email.id}
                  onClick={() => handleSelectEmail(email)}
                  className={`w-full text-left p-3 hover:bg-gray-50 transition-colors ${
                    selectedEmail?.id === email.id ? 'bg-blue-50' : ''
                  } ${!email.is_read ? 'bg-blue-50/30' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {!email.is_read && <div className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />}
                        <span className={`text-sm truncate ${!email.is_read ? 'font-semibold' : ''}`}>
                          {email.sender_name || email.sender_email}
                        </span>
                      </div>
                      <p className={`text-sm truncate mt-0.5 ${!email.is_read ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                        {email.subject}
                      </p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {email.body_preview}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs text-gray-400">{formatDate(email.received_at)}</div>
                      <div className="mt-1">{statusBadge(email.link_status)}</div>
                      {email.has_attachments && (
                        <span className="inline-flex items-center mt-1 text-gray-400" title="Vedhæftede filer">
                          <Paperclip className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalCount > 25 && (
            <div className="border-t p-2 flex justify-between items-center text-xs text-gray-500">
              <span>{totalCount} emails</span>
              <div className="flex gap-1">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => {
                    const params = new URLSearchParams(searchParams.toString())
                    params.set('page', String(currentPage - 1))
                    router.push(`/dashboard/mail?${params.toString()}`)
                  }}
                  className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-30"
                >
                  Forrige
                </button>
                <button
                  disabled={currentPage * 25 >= totalCount}
                  onClick={() => {
                    const params = new URLSearchParams(searchParams.toString())
                    params.set('page', String(currentPage + 1))
                    router.push(`/dashboard/mail?${params.toString()}`)
                  }}
                  className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-30"
                >
                  Næste
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Email detail */}
        <div className="flex-1 border rounded-lg overflow-hidden">
          {selectedEmail ? (
            <EmailDetail
              email={selectedEmail}
              onArchive={() => handleArchive(selectedEmail.id)}
              onIgnore={() => handleIgnore(selectedEmail.id)}
              onLink={() => setShowLinkModal(true)}
              onCreateCustomer={() => handleCreateCustomer(selectedEmail.id)}
              formatDate={formatDate}
              statusBadge={statusBadge}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <Mail className="w-16 h-16 mx-auto mb-3 opacity-20" />
                <p>Vælg en email for at se detaljer</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Manual Link Modal */}
      {showLinkModal && selectedEmail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">Kobl til kunde</h3>
            <p className="text-sm text-gray-500 mb-3">
              Søg efter kunden for at koble denne email manuelt.
            </p>
            <input
              type="text"
              value={linkSearch}
              onChange={(e) => searchCustomers(e.target.value)}
              placeholder="Søg firmanavn, email..."
              className="w-full px-3 py-2 border rounded-md text-sm mb-3"
              autoFocus
            />
            {customerResults.length > 0 && (
              <div className="border rounded-md divide-y max-h-60 overflow-y-auto mb-3">
                {customerResults.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleManualLink(selectedEmail.id, c.id)}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm"
                  >
                    <div className="font-medium">{c.company_name}</div>
                    <div className="text-xs text-gray-500">{c.customer_number} - {c.email}</div>
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowLinkModal(false); setLinkSearch(''); setCustomerResults([]) }}
                className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50"
              >
                Annuller
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =====================================================
// Email Detail Component
// =====================================================

function isImageFile(contentType?: string, filename?: string): boolean {
  if (contentType?.startsWith('image/')) return true
  if (!filename) return false
  return /\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(filename)
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

function EmailDetail({
  email,
  onArchive,
  onIgnore,
  onLink,
  onCreateCustomer,
  formatDate,
  statusBadge,
}: {
  email: IncomingEmailWithCustomer
  onArchive: () => void
  onIgnore: () => void
  onLink: () => void
  onCreateCustomer: () => void
  formatDate: (iso: string) => string
  statusBadge: (status: EmailLinkStatus) => React.ReactNode
}) {
  const attachments = email.attachment_urls || []
  const imageAttachments = attachments.filter((a) => isImageFile(a.contentType, a.filename))
  const fileAttachments = attachments.filter((a) => !isImageFile(a.contentType, a.filename))
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [lightboxName, setLightboxName] = useState('')
  const [portalAccess, setPortalAccess] = useState<{ hasPortal: boolean } | null>(null)

  // Check if linked customer has active portal
  useEffect(() => {
    setPortalAccess(null)
    if (email.link_status === 'linked' && email.customer_id) {
      checkCustomerPortalAccess(email.customer_id).then((res) => {
        if (res.success && res.data) {
          setPortalAccess(res.data)
        }
      })
    }
  }, [email.id, email.link_status, email.customer_id])

  return (
    <div className="flex flex-col h-full">
      {/* Email header */}
      <div className="border-b p-4 space-y-2">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">{email.subject}</h2>
          <div className="flex items-center gap-1.5 shrink-0">
            {statusBadge(email.link_status)}
          </div>
        </div>

        <div className="flex items-center justify-between text-sm text-gray-500">
          <div>
            <span className="font-medium text-gray-700">{email.sender_name || email.sender_email}</span>
            {email.sender_name && <span className="ml-1">&lt;{email.sender_email}&gt;</span>}
            {email.is_forwarded && email.original_sender_email && (
              <span className="ml-2 text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                Videresendt fra: {email.original_sender_name || email.original_sender_email}
              </span>
            )}
          </div>
          <span className="text-xs">{formatDate(email.received_at)}</span>
        </div>

        {/* Customer link info */}
        {email.link_status === 'linked' && email.customers && (
          <div className="flex items-center gap-2 text-sm bg-green-50 p-2 rounded">
            <Link2 className="w-4 h-4 text-green-600" />
            <span>Koblet til: <strong>{email.customers.company_name}</strong> ({email.customers.customer_number})</span>
            <a href={`/dashboard/customers/${email.customers.id}`} className="ml-auto text-blue-600 hover:underline inline-flex items-center gap-1 text-xs">
              Åbn kunde <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {/* Portal chat notification */}
        {portalAccess?.hasPortal && email.customers && (
          <div className="flex items-center gap-2 text-sm bg-purple-50 p-2 rounded">
            <MessageCircle className="w-4 h-4 text-purple-600" />
            <span className="text-purple-700">Kunden har en aktiv portal</span>
            <a
              href={`/dashboard/customers/${email.customers.id}#chat`}
              className="ml-auto text-purple-600 hover:underline inline-flex items-center gap-1 text-xs font-medium"
            >
              Hop til Chat <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          {email.link_status !== 'linked' && (
            <>
              <button onClick={onLink} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700">
                <UserPlus className="w-3.5 h-3.5" /> Kobl til kunde
              </button>
              <button onClick={onCreateCustomer} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700">
                <UserPlus className="w-3.5 h-3.5" /> Opret som Kunde
              </button>
            </>
          )}
          <button onClick={onArchive} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded hover:bg-gray-50">
            <Archive className="w-3.5 h-3.5" /> Arkivér
          </button>
          {email.link_status === 'unidentified' && (
            <button onClick={onIgnore} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded hover:bg-gray-50 text-gray-500">
              <EyeOff className="w-3.5 h-3.5" /> Ignorér
            </button>
          )}
        </div>
      </div>

      {/* Email body */}
      <div className="flex-1 overflow-y-auto p-4">
        {email.body_html ? (
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: email.body_html }}
          />
        ) : (
          <pre className="whitespace-pre-wrap text-sm text-gray-700">
            {email.body_text || email.body_preview || '(Tom email)'}
          </pre>
        )}
      </div>

      {/* Attachments — Gallery + file list */}
      {email.has_attachments && (
        <div className="border-t p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Paperclip className="w-4 h-4 text-gray-500" />
            <p className="text-sm font-medium text-gray-600">
              Vedhæftede filer ({attachments.length})
            </p>
          </div>

          {attachments.length > 0 ? (
            <div className="space-y-3">
              {/* Image gallery grid */}
              {imageAttachments.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {imageAttachments.map((att, i) => (
                    <button
                      key={`img-${i}`}
                      onClick={() => {
                        setLightboxUrl(att.url)
                        setLightboxName(att.filename)
                      }}
                      className="group relative aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all bg-gray-100"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={att.url}
                        alt={att.filename}
                        className="w-full h-full object-cover"
                      />
                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center gap-1">
                          <ZoomIn className="w-6 h-6 text-white drop-shadow-lg" />
                        </div>
                      </div>
                      {/* Filename label */}
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
                        <p className="text-[11px] text-white truncate">{att.filename}</p>
                        <p className="text-[10px] text-white/70">{formatFileSize(att.size)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Non-image files — compact list */}
              {fileAttachments.length > 0 && (
                <div className="space-y-1.5">
                  {fileAttachments.map((att, i) => {
                    const isPdf = att.contentType === 'application/pdf'
                    const AttIcon = isPdf ? FileText : Paperclip
                    return (
                      <a
                        key={`file-${i}`}
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-2 px-3 py-2 border rounded-md text-sm bg-gray-50 hover:bg-blue-50 hover:border-blue-200 transition-colors"
                      >
                        <AttIcon className="w-4 h-4 text-gray-400 group-hover:text-blue-500 shrink-0" />
                        <span className="truncate flex-1 text-gray-700 group-hover:text-blue-700">
                          {att.filename}
                        </span>
                        <span className="text-xs text-gray-400 shrink-0">
                          {formatFileSize(att.size)}
                        </span>
                        <Download className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-500 shrink-0" />
                      </a>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">Vedhæftninger endnu ikke downloadet</p>
          )}
        </div>
      )}

      {/* Lightbox modal */}
      <AnimatePresence>
        {lightboxUrl && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/70"
              onClick={() => setLightboxUrl(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            {/* Image container */}
            <motion.div
              className="relative z-10 max-w-[90vw] max-h-[90vh] flex flex-col items-center"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              {/* Top bar */}
              <div className="flex items-center justify-between w-full mb-2 px-1">
                <span className="text-sm text-white/80 truncate max-w-[60%]">{lightboxName}</span>
                <div className="flex items-center gap-2">
                  <a
                    href={lightboxUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                    title="Download"
                  >
                    <Download className="w-4 h-4 text-white" />
                  </a>
                  <button
                    onClick={() => setLightboxUrl(null)}
                    className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                    title="Luk"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>

              {/* Image */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxUrl}
                alt={lightboxName}
                className="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
