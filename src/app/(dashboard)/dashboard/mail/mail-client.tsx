'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  RefreshCw,
  Mail,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  ShieldAlert,
} from 'lucide-react'
import { GoldenButton } from './components/golden-button'
import { MailList } from './components/mail-list'
import { MailDetail } from './components/mail-detail'
import type { ReadFilter, SortOrder } from './components/mail-list'
import { useToast } from '@/components/ui/toast'
import {
  getIncomingEmails,
  getIncomingEmailStats,
  markEmailAsRead,
  markEmailAsUnread,
  archiveEmail,
  linkEmailToCustomer,
  ignoreIncomingEmail,
  triggerEmailSync,
  getGraphSyncState,
  testGraphConnection,
  createCustomerFromEmail,
  getLeadsForEmails,
} from '@/lib/actions/incoming-emails'
import type {
  IncomingEmailWithCustomer,
  EmailLinkStatus,
  GraphSyncState,
} from '@/types/mail-bridge.types'

// =====================================================
// Filter tab config
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
// Format date helper
// =====================================================

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000) return 'Lige nu'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} min siden`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}t siden`
  return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// =====================================================
// Main Component
// =====================================================

export function MailClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const toast = useToast()

  // Core state
  const [emails, setEmails] = useState<IncomingEmailWithCustomer[]>([])
  const [selectedEmail, setSelectedEmail] = useState<IncomingEmailWithCustomer | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false)
  const [syncState, setSyncState] = useState<GraphSyncState | null>(null)
  const [stats, setStats] = useState({ total: 0, unread: 0, unidentified: 0, linked: 0 })
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [emailLeadMap, setEmailLeadMap] = useState<Record<string, { leadId: string; status: string }>>({})

  // Search + filter state
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [readFilter, setReadFilter] = useState<ReadFilter>('all')
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')

  // Link modal state
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkSearch, setLinkSearch] = useState('')
  const [customerResults, setCustomerResults] = useState<Array<{ id: string; company_name: string; email: string; customer_number: string }>>([])

  // Graph connection test
  const [graphStatus, setGraphStatus] = useState<{ tested: boolean; success: boolean; error?: string }>({ tested: false, success: false })

  // URL-driven state
  const currentFilter = (searchParams.get('filter') as FilterTab) || 'all'
  const currentPage = parseInt(searchParams.get('page') || '1')

  // =====================================================
  // Data loading
  // =====================================================

  const loadEmails = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [emailResult, statsResult, syncStateResult] = await Promise.all([
        getIncomingEmails({
          filter: currentFilter,
          readFilter,
          sortOrder,
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

      // Check which emails have leads
      const emailIds = emailResult.data.map((e) => e.id)
      if (emailIds.length > 0) {
        const leadMap = await getLeadsForEmails(emailIds)
        setEmailLeadMap(leadMap)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke hente emails')
    } finally {
      setIsLoading(false)
    }
  }, [currentFilter, readFilter, sortOrder, search, currentPage])

  useEffect(() => {
    loadEmails()
  }, [loadEmails])

  // =====================================================
  // Actions
  // =====================================================

  const setFilter = (filter: FilterTab) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('filter', filter)
    params.delete('page')
    router.push(`/dashboard/mail?${params.toString()}`)
  }

  const handleSearchSubmit = () => {
    const params = new URLSearchParams(searchParams.toString())
    if (search) params.set('search', search)
    else params.delete('search')
    params.delete('page')
    router.push(`/dashboard/mail?${params.toString()}`)
  }

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
      setSelectedEmail((prev) => prev?.id === email.id ? { ...prev, is_read: true } : prev)
      setStats((prev) => ({ ...prev, unread: Math.max(0, prev.unread - 1) }))
    }
  }

  const handleToggleReadStatus = async (id: string, currentlyRead: boolean) => {
    if (currentlyRead) {
      await markEmailAsUnread(id)
      setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, is_read: false } : e)))
      setSelectedEmail((prev) => prev?.id === id ? { ...prev, is_read: false } : prev)
      setStats((prev) => ({ ...prev, unread: prev.unread + 1 }))
    } else {
      await markEmailAsRead(id)
      setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, is_read: true } : e)))
      setSelectedEmail((prev) => prev?.id === id ? { ...prev, is_read: true } : prev)
      setStats((prev) => ({ ...prev, unread: Math.max(0, prev.unread - 1) }))
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

  const handlePromoteToLead = async (emailId: string) => {
    if (isCreatingCustomer) return
    setIsCreatingCustomer(true)
    try {
      const result = await createCustomerFromEmail(emailId)
      if (result.success) {
        if (result.isExisting) {
          toast.info('Koblet', `Email koblet til eksisterende kunde: ${result.customerName || 'Ukendt'}`)
        } else {
          toast.success('Lead oprettet', `Ny kunde + lead oprettet fra email${result.customerName ? `: ${result.customerName}` : ''}`)
        }
        await loadEmails()
        if (selectedEmail?.id === emailId) {
          setSelectedEmail((prev) => prev ? { ...prev, link_status: 'linked' as const } : null)
        }
        if (result.leadId) {
          setEmailLeadMap((prev) => ({
            ...prev,
            [emailId]: { leadId: result.leadId!, status: 'new' },
          }))
        }
      } else {
        toast.error('Fejl', result.error || 'Kunne ikke oprette lead')
      }
    } catch {
      toast.error('Fejl', 'Kunne ikke oprette lead')
    } finally {
      setIsCreatingCustomer(false)
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

  // =====================================================
  // Render
  // =====================================================

  return (
    <div className="space-y-6">
      {/* ========== HEADER — same pattern as Leads ========== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Mail</h1>
          <p className="text-gray-600 mt-1">
            Indgående emails fra ordre@eltasolar.dk ({stats.total} emails, {stats.unread} ulæste)
            {syncState?.last_sync_at && (
              <span className="ml-2 text-xs text-gray-400">
                — Seneste sync: {formatDate(syncState.last_sync_at)}
                {syncState.last_sync_status === 'failed' && (
                  <span className="text-red-500 ml-1">(fejlet)</span>
                )}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <GoldenButton selectedEmail={selectedEmail} />
          <button
            onClick={handleTestConnection}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-md hover:bg-gray-50"
          >
            <ShieldAlert className="w-4 h-4" />
            Test
          </button>
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Synkroniserer...' : 'Sync nu'}
          </button>
        </div>
      </div>

      {/* Banners */}
      {graphStatus.tested && (
        <div className={`p-3 rounded-md text-sm ${graphStatus.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {graphStatus.success ? 'Microsoft Graph-forbindelse OK' : `Graph-forbindelse fejlet: ${graphStatus.error}`}
        </div>
      )}
      {error && (
        <div className="p-3 rounded-md text-sm bg-red-50 text-red-800 border border-red-200">{error}</div>
      )}

      {/* ========== LINK STATUS TABS — like Leads filter tabs ========== */}
      <div className="flex gap-1 border-b">
        {FILTER_TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = currentFilter === tab.value
          return (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ========== SPLIT VIEW: LIST (with filter bar) + DETAIL ========== */}
      <div className="flex gap-6 min-h-[650px]">
        {/* Left panel: filter bar + email list */}
        <MailList
          emails={emails}
          selectedEmailId={selectedEmail?.id ?? null}
          isLoading={isLoading}
          search={search}
          readFilter={readFilter}
          sortOrder={sortOrder}
          emailLeadMap={emailLeadMap}
          onSelectEmail={handleSelectEmail}
          onSearchChange={setSearch}
          onSearchSubmit={handleSearchSubmit}
          onReadFilterChange={setReadFilter}
          onSortOrderChange={setSortOrder}
          onToggleReadStatus={handleToggleReadStatus}
        />

        {/* Right panel: email detail */}
        <div className="flex-1 bg-white rounded-lg border overflow-hidden">
          {selectedEmail ? (
            <MailDetail
              key={selectedEmail.id}
              email={selectedEmail}
              onArchive={() => handleArchive(selectedEmail.id)}
              onIgnore={() => handleIgnore(selectedEmail.id)}
              onLink={() => setShowLinkModal(true)}
              onCreateCustomer={() => handlePromoteToLead(selectedEmail.id)}
              onToggleRead={() => handleToggleReadStatus(selectedEmail.id, selectedEmail.is_read)}
              onAttachmentsBackfilled={loadEmails}
              isCreatingCustomer={isCreatingCustomer}
              existingLeadId={emailLeadMap[selectedEmail.id]?.leadId}
              existingLeadStatus={emailLeadMap[selectedEmail.id]?.status}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <Mail className="w-16 h-16 mx-auto mb-3 opacity-20" />
                <p className="text-lg font-medium">Vælg en email</p>
                <p className="text-sm mt-1">Klik på en email i listen til venstre</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalCount > 25 && (
        <div className="bg-white rounded-lg border p-4 flex justify-between items-center text-sm text-gray-500">
          <span>{totalCount} emails i alt</span>
          <div className="flex gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString())
                params.set('page', String(currentPage - 1))
                router.push(`/dashboard/mail?${params.toString()}`)
              }}
              className="px-3 py-1.5 border rounded-md hover:bg-gray-50 disabled:opacity-30"
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
              className="px-3 py-1.5 border rounded-md hover:bg-gray-50 disabled:opacity-30"
            >
              Næste
            </button>
          </div>
        </div>
      )}

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
