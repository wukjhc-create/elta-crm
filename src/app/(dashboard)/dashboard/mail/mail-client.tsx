'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  RefreshCw,
  Mail,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  ShieldAlert,
  Bug,
  Loader2,
  ChevronDown,
  ChevronUp,
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
  unlinkEmailFromCustomer,
  ignoreIncomingEmail,
  triggerEmailSync,
  getGraphSyncState,
  getAllGraphSyncStates,
  testGraphConnection,
  checkGraphEnvVars,
  createCustomerFromEmail,
  getLeadsForEmails,
  runSyncDiagnostic,
  runSyncAndDiagnose,
  resetDeltaLink,
  fastForwardAllMailboxes,
  type SyncDiagnostic,
} from '@/lib/actions/incoming-emails'
import { createServiceCaseFromEmail } from '@/lib/actions/service-cases'
import { useRealtimeTable } from '@/lib/hooks/use-realtime'
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
  const [allSyncStates, setAllSyncStates] = useState<GraphSyncState[]>([])
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
  const [graphStatus, setGraphStatus] = useState<{ tested: boolean; success: boolean; error?: string; mailbox?: string }>({ tested: false, success: false })
  const [graphDiag, setGraphDiag] = useState<{ configured: boolean; vars: Record<string, boolean>; mailbox: string; mailboxes?: string[] } | null>(null)

  // Debug diagnostic panel
  const [showDebug, setShowDebug] = useState(false)
  const [diagnostic, setDiagnostic] = useState<SyncDiagnostic | null>(null)
  const [isRunningDiag, setIsRunningDiag] = useState(false)
  const [isRunningFixSync, setIsRunningFixSync] = useState(false)
  const [isFastForwarding, setIsFastForwarding] = useState(false)

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
      const [emailResult, statsResult, syncStateResult, allStatesResult] = await Promise.all([
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
        getAllGraphSyncStates(),
      ])
      setEmails(emailResult.data)
      setTotalCount(emailResult.count)
      setStats({
        total: statsResult.total,
        unread: statsResult.unread,
        unidentified: statsResult.unidentified,
        linked: statsResult.linked,
      })
      setAllSyncStates(allStatesResult)
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
  // Realtime + Background sync
  // =====================================================

  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [lastRefreshLabel, setLastRefreshLabel] = useState('Lige nu')
  const isBgSyncing = useRef(false)

  // Silent background refresh — no loading spinners, no UI flash
  const backgroundRefresh = useCallback(async () => {
    if (isBgSyncing.current || isSyncing) return
    isBgSyncing.current = true
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
      setLastRefresh(new Date())

      const emailIds = emailResult.data.map((e) => e.id)
      if (emailIds.length > 0) {
        const leadMap = await getLeadsForEmails(emailIds)
        setEmailLeadMap(leadMap)
      }
    } catch {
      // Silent fail — don't show error for background refresh
    } finally {
      isBgSyncing.current = false
    }
  }, [currentFilter, readFilter, sortOrder, search, currentPage, isSyncing])

  // Realtime: incoming_emails table changes → instant refresh
  useRealtimeTable('incoming_emails', backgroundRefresh)

  // Background Graph sync every 90s — triggers server-side email fetch
  useEffect(() => {
    const interval = setInterval(async () => {
      if (isBgSyncing.current || isSyncing) return
      try {
        await triggerEmailSync()
        // Realtime subscription will pick up new rows automatically
      } catch {
        // Silent fail
      }
    }, 90_000)
    return () => clearInterval(interval)
  }, [isSyncing])

  // Update "last refreshed" label every 10 seconds
  useEffect(() => {
    const updateLabel = () => {
      const diff = Date.now() - lastRefresh.getTime()
      if (diff < 10_000) setLastRefreshLabel('Lige nu')
      else if (diff < 60_000) setLastRefreshLabel(`${Math.floor(diff / 1000)}s siden`)
      else setLastRefreshLabel(`${Math.floor(diff / 60_000)} min siden`)
    }
    updateLabel()
    const interval = setInterval(updateLabel, 10_000)
    return () => clearInterval(interval)
  }, [lastRefresh])

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
    console.log('SYNC CLICKED')
    setIsSyncing(true)
    setError(null)

    try {
      const res = await fetch('/api/email/sync', { method: 'POST' })
      console.log('SYNC RESPONSE STATUS:', res.status)
      const data = await res.json()
      console.log('SYNC RESULT:', data)

      // Show result
      if (data.success) {
        const mbResults = data.mailboxResults || []
        if (mbResults.length > 0) {
          const detail = mbResults.map((m: { mailbox: string; inserted?: number; status: string; error?: string }) =>
            `${m.mailbox.split('@')[0]}: ${m.status === 'success' ? `${m.inserted ?? 0} nye` : `FEJL: ${m.error || 'ukendt'}`}`
          ).join(' | ')
          toast.success('Sync fuldført', detail)
        } else {
          toast.success('Sync fuldført', `${data.emailsInserted ?? 0} nye emails`)
        }
      } else {
        setError(data.errors?.join('; ') || 'Sync fejlede')
      }

      await loadEmails()
      setLastRefresh(new Date())
    } catch (err) {
      console.error('SYNC FETCH ERROR:', err)
      setError(err instanceof Error ? err.message : 'Sync fejlede')
    } finally {
      setIsSyncing(false)
    }
  }

  const handleTestConnection = async () => {
    const { testAllMailboxes } = await import('@/lib/actions/incoming-emails')
    const [result, diag, mbResults] = await Promise.all([
      testGraphConnection(),
      checkGraphEnvVars(),
      testAllMailboxes(),
    ])
    // Show per-mailbox results if available
    const allOk = mbResults.every(r => r.success)
    const failedMbs = mbResults.filter(r => !r.success)
    const errorSummary = failedMbs.length > 0
      ? failedMbs.map(r => `${r.mailbox}: ${r.error}`).join(' | ')
      : undefined

    setGraphStatus({
      tested: true,
      success: allOk,
      error: errorSummary || result.error,
      mailbox: mbResults.map(r => `${r.mailbox.split('@')[0]}:${r.success ? 'OK' : 'FEJL'}`).join(', '),
    })
    setGraphDiag(diag)
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
    // Optimistic: update UI first
    const newRead = !currentlyRead
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, is_read: newRead } : e)))
    setSelectedEmail((prev) => prev?.id === id ? { ...prev, is_read: newRead } : prev)
    setStats((prev) => ({ ...prev, unread: newRead ? Math.max(0, prev.unread - 1) : prev.unread + 1 }))
    // Fire and forget
    if (newRead) markEmailAsRead(id).catch(() => {})
    else markEmailAsUnread(id).catch(() => {})
  }

  const handleArchive = async (id: string) => {
    // Optimistic: remove from list immediately
    setEmails((prev) => prev.filter((e) => e.id !== id))
    if (selectedEmail?.id === id) setSelectedEmail(null)
    archiveEmail(id).catch(() => {})
  }

  const handleIgnore = async (id: string) => {
    // Optimistic: update status immediately
    setEmails((prev) => prev.map((e) => e.id === id ? { ...e, link_status: 'ignored' as const } : e))
    if (selectedEmail?.id === id) setSelectedEmail(null)
    ignoreIncomingEmail(id).catch(() => {})
  }

  const handleManualLink = async (emailId: string, customerId: string) => {
    await linkEmailToCustomer(emailId, customerId)
    setShowLinkModal(false)
    setLinkSearch('')
    setCustomerResults([])
    // Reload everything to get fresh customer join data
    await loadEmails()
    // Re-select the email to get updated customer data
    if (selectedEmail?.id === emailId) {
      const { data: freshEmails } = await getIncomingEmails({
        filter: currentFilter,
        readFilter,
        sortOrder,
        search: search || undefined,
        page: currentPage,
        pageSize: 25,
      })
      const updated = freshEmails.find((e) => e.id === emailId)
      if (updated) {
        setSelectedEmail(updated)
      }
    }
    toast.success('Kunde tildelt', 'Mailen er nu koblet')
  }

  const handleUnlinkEmail = async (emailId: string) => {
    try {
      await unlinkEmailFromCustomer(emailId)
      toast.success('Kobling fjernet', 'Mailen er nu uidentificeret')
      // Update UI immediately
      setEmails((prev) =>
        prev.map((e) => e.id === emailId ? { ...e, link_status: 'unidentified' as const, customer_id: null, customers: null } : e)
      )
      if (selectedEmail?.id === emailId) {
        setSelectedEmail((prev) => prev ? { ...prev, link_status: 'unidentified' as const, customer_id: null, customers: null } : null)
      }
      // Refresh lead map
      setEmailLeadMap((prev) => {
        const next = { ...prev }
        delete next[emailId]
        return next
      })
    } catch {
      toast.error('Fejl', 'Kunne ikke fjerne kobling')
    }
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

  // Service case from email
  const [isCreatingServiceCase, setIsCreatingServiceCase] = useState(false)
  const handleCreateServiceCase = async (emailId: string) => {
    if (isCreatingServiceCase) return
    setIsCreatingServiceCase(true)
    try {
      const result = await createServiceCaseFromEmail(emailId)
      if (result.success && result.data) {
        toast.success('Serviceopgave oprettet', `${result.data.case_number}: ${result.data.title}`)
        router.push(`/dashboard/service-cases`)
      } else {
        toast.error('Fejl', result.error || 'Kunne ikke oprette serviceopgave')
      }
    } catch {
      toast.error('Fejl', 'Kunne ikke oprette serviceopgave')
    } finally {
      setIsCreatingServiceCase(false)
    }
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
          <p className="text-gray-600 mt-1 flex items-center gap-2 flex-wrap">
            <span>Samlet indbakke ({stats.total} emails, {stats.unread} ulæste)</span>
            {graphDiag && (
              <span className="inline-flex items-center gap-1 text-xs">
                {(graphDiag.mailboxes || [graphDiag.mailbox]).map(mb => {
                  const prefix = mb.split('@')[0]
                  const color = prefix === 'ordre' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                  return <span key={mb} className={`px-1.5 py-0.5 rounded font-medium ${color}`}>{mb}</span>
                })}
              </span>
            )}
          </p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {allSyncStates.length > 0 ? (
              allSyncStates.map(ss => {
                const prefix = ss.mailbox.split('@')[0]
                const color = prefix === 'ordre' ? 'text-orange-600' : 'text-blue-600'
                const statusColor = ss.last_sync_status === 'failed' ? 'text-red-500' : 'text-gray-400'
                return (
                  <span key={ss.mailbox} className={`text-xs ${statusColor} flex items-center gap-1`}>
                    <span className={`font-medium ${color}`}>{prefix}</span>
                    {ss.last_sync_at ? formatDate(ss.last_sync_at) : 'aldrig'}
                    {ss.last_sync_status === 'failed' && <span className="text-red-500">(fejl)</span>}
                  </span>
                )
              })
            ) : syncState?.last_sync_at ? (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Mail className="w-3 h-3" />
                Sync: {formatDate(syncState.last_sync_at)}
              </span>
            ) : null}
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <RefreshCw className="w-3 h-3" />
              {lastRefreshLabel}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-green-600">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Auto-sync
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <GoldenButton selectedEmail={selectedEmail} />
          <button
            onClick={async () => {
              setShowDebug(!showDebug)
              if (!diagnostic && !isRunningDiag) {
                setIsRunningDiag(true)
                try { setDiagnostic(await runSyncDiagnostic()) } catch { /* */ }
                setIsRunningDiag(false)
              }
            }}
            className={`inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-md hover:bg-gray-50 ${showDebug ? 'bg-amber-50 border-amber-300' : ''}`}
          >
            <Bug className="w-4 h-4" />
            Debug
          </button>
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

      {/* Debug/Status Panel */}
      {graphStatus.tested && (
        <div className={`rounded-lg border text-sm ${graphStatus.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="p-3 flex items-center gap-2">
            {graphStatus.success ? (
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span className={graphStatus.success ? 'text-green-800' : 'text-red-800'}>
              {graphStatus.success
                ? `Graph OK — ${graphStatus.mailbox || '?'}`
                : `Graph: ${graphStatus.mailbox || '?'}`
              }
            </span>
            {!graphStatus.success && graphStatus.error && (
              <span className="text-red-700 text-xs block mt-1 break-words max-w-[600px]">{graphStatus.error}</span>
            )}
          </div>
          {graphDiag && (
            <div className="px-3 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="bg-white/60 rounded px-2 py-1.5 border border-white/80">
                <span className="text-gray-500">Postkasse</span>
                <p className="font-mono font-medium text-gray-800 truncate">{graphDiag.mailbox}</p>
              </div>
              <div className="bg-white/60 rounded px-2 py-1.5 border border-white/80">
                <span className="text-gray-500">Sidste inbox-sync</span>
                <p className="font-medium text-gray-800">{syncState?.last_sync_at ? formatDate(syncState.last_sync_at) : 'Aldrig'}</p>
              </div>
              <div className="bg-white/60 rounded px-2 py-1.5 border border-white/80">
                <span className="text-gray-500">Sync status</span>
                <p className={`font-medium ${syncState?.last_sync_status === 'success' ? 'text-green-700' : syncState?.last_sync_status === 'failed' ? 'text-red-700' : 'text-gray-800'}`}>
                  {syncState?.last_sync_status === 'success' ? 'OK' : syncState?.last_sync_status || '—'}
                </p>
              </div>
              <div className="bg-white/60 rounded px-2 py-1.5 border border-white/80">
                <span className="text-gray-500">Emails synkroniseret</span>
                <p className="font-medium text-gray-800">{syncState?.emails_synced_total ?? '—'}</p>
              </div>
            </div>
          )}
        </div>
      )}
      {error && (
        <div className="p-3 rounded-md text-sm bg-red-50 text-red-800 border border-red-200">{error}</div>
      )}

      {/* ========== SYNC DEBUG PANEL ========== */}
      {showDebug && (
        <div className="bg-gray-900 text-gray-100 rounded-lg border border-gray-700 text-xs font-mono overflow-hidden">
          <div className="p-3 border-b border-gray-700 flex items-center justify-between">
            <span className="text-amber-400 font-bold text-sm">Sync Diagnostic</span>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  setIsRunningDiag(true)
                  try { setDiagnostic(await runSyncDiagnostic()) } catch { /* */ }
                  setIsRunningDiag(false)
                }}
                disabled={isRunningDiag}
                className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 disabled:opacity-50"
              >
                {isRunningDiag ? <Loader2 className="w-3 h-3 animate-spin inline" /> : '↻'} Diagnose
              </button>
              <button
                onClick={async () => {
                  setIsRunningFixSync(true)
                  try {
                    const result = await runSyncAndDiagnose()
                    setDiagnostic(result)
                    if (result.syncTestResult?.inserted) {
                      toast.success('Sync OK', `${result.syncTestResult.inserted} nye emails`)
                    }
                    await loadEmails()
                  } catch { /* */ }
                  setIsRunningFixSync(false)
                }}
                disabled={isRunningFixSync}
                className="px-2 py-1 bg-amber-700 hover:bg-amber-600 rounded text-white disabled:opacity-50"
              >
                {isRunningFixSync ? <Loader2 className="w-3 h-3 animate-spin inline" /> : '⚡'} Reset Delta + Sync
              </button>
              <button
                onClick={async () => {
                  setIsFastForwarding(true)
                  try {
                    const r = await fastForwardAllMailboxes()
                    const total = r.results.reduce((s, x) => s + x.messagesScanned, 0)
                    const saved = r.results.filter(x => x.deltaLinkSaved).length
                    toast.success('Fast-forward OK', `${saved}/${r.results.length} postkasser — ${total} historiske beskeder sprunget over. Kun nye emails synces fra nu af.`)
                    setDiagnostic(await runSyncDiagnostic())
                  } catch (e) {
                    toast.error('Fast-forward fejlede', e instanceof Error ? e.message : 'Ukendt fejl')
                  }
                  setIsFastForwarding(false)
                }}
                disabled={isFastForwarding}
                className="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-white disabled:opacity-50"
                title="Spring eksisterende emails over og synkroniser kun nye fremadrettet"
              >
                {isFastForwarding ? <Loader2 className="w-3 h-3 animate-spin inline" /> : '⏭'} Spring til nye
              </button>
            </div>
          </div>

          {isRunningDiag && !diagnostic && (
            <div className="p-4 text-center text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Kører diagnostic...</div>
          )}

          {diagnostic && (
            <div className="p-3 space-y-3 max-h-[600px] overflow-y-auto">
              {/* Identity */}
              <div>
                <div className="text-gray-400 mb-1">1. MAILBOX CONFIG</div>
                <div className="pl-3 space-y-0.5">
                  <div>Send-fra: <span className="text-green-400 font-bold">{diagnostic.mailbox}</span></div>
                  <div>Alle postkasser: <span className="text-cyan-400">{(diagnostic.allMailboxes || [diagnostic.mailbox]).join(', ')}</span></div>
                  <div>Env konfigureret: <span className={diagnostic.envConfigured ? 'text-green-400' : 'text-red-400'}>{diagnostic.envConfigured ? 'JA' : 'NEJ'}</span></div>
                </div>
              </div>

              {/* Per-mailbox diagnostics */}
              {(diagnostic.mailboxDiagnostics || []).map((mbd, idx) => {
                const prefix = mbd.mailbox.split('@')[0]
                const tagColor = prefix === 'ordre' ? 'text-orange-400' : 'text-blue-400'
                return (
                  <div key={mbd.mailbox}>
                    <div className="text-gray-400 mb-1">
                      {idx + 2}. <span className={`font-bold ${tagColor}`}>{mbd.mailbox}</span> ({mbd.type})
                    </div>
                    <div className="pl-3 space-y-0.5">
                      {/* Connection */}
                      <div>
                        Forbindelse:{' '}
                        {mbd.connectionOk
                          ? <span className="text-green-400 font-bold">OK ({mbd.totalItems} emails, {mbd.unreadItems} ulæste)</span>
                          : <span className="text-red-400 font-bold">FEJLET</span>
                        }
                      </div>
                      {mbd.connectionError && (
                        <div className="text-red-400 text-[11px] break-words">{mbd.connectionError}</div>
                      )}

                      {/* Sync state */}
                      {mbd.syncState ? (
                        <>
                          <div>Sync: <span className={mbd.syncState.lastSyncStatus === 'success' ? 'text-green-400' : 'text-red-400'}>{mbd.syncState.lastSyncStatus || '—'}</span> — {mbd.syncState.lastSyncAt || 'Aldrig'}</div>
                          {mbd.syncState.lastSyncError && <div className="text-red-400 text-[11px]">Fejl: {mbd.syncState.lastSyncError}</div>}
                          <div>Delta: {mbd.syncState.deltaLinkExists ? <span className="text-yellow-400">Aktiv</span> : <span className="text-gray-500">Ingen</span>} — Synced: {mbd.syncState.emailsSyncedTotal ?? 0}</div>
                        </>
                      ) : (
                        <div className="text-yellow-400">Ingen sync state — aldrig synkroniseret</div>
                      )}

                      {/* Latest messages */}
                      {mbd.inboxMessages.length > 0 && (
                        <div className="mt-1">
                          <div className="text-gray-500 text-[10px] uppercase">Seneste {mbd.inboxMessages.length} i indbakke:</div>
                          {mbd.inboxMessages.map((m, i) => (
                            <div key={i} className="text-gray-300 truncate text-[11px]">
                              <span className="text-gray-500">{new Date(m.receivedDateTime).toLocaleString('da-DK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                              {' '}<span className="text-cyan-300">{m.from}</span>
                              {' '}{m.subject}
                              {m.isRead ? '' : ' 🔵'}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Missing from DB */}
              <div>
                <div className="text-gray-400 mb-1">4. MISSING FROM DB</div>
                <div className="pl-3 space-y-0.5">
                  {diagnostic.missingFromDb.length === 0 ? (
                    <div className="text-green-400">Alle Graph-emails er i DB ✓</div>
                  ) : (
                    <>
                      <div className="text-red-400 font-bold">{diagnostic.missingFromDb.length} emails i Graph men IKKE i DB:</div>
                      {diagnostic.missingFromDb.map((m, i) => (
                        <div key={i} className="text-red-300 truncate">
                          • <span className="text-cyan-300">{m.from}</span> — {m.subject} ({m.reason})
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {/* DB emails */}
              <div>
                <div className="text-gray-400 mb-1">5. DB EMAILS ({diagnostic.dbEmailCount} total)</div>
                <div className="pl-3 space-y-0.5">
                  {diagnostic.recentDbEmails.slice(0, 8).map((e, i) => (
                    <div key={i} className="text-gray-300 truncate">
                      <span className={e.link_status === 'linked' ? 'text-green-400' : e.link_status === 'pending' ? 'text-yellow-400' : 'text-gray-500'}>[{e.link_status}]</span>
                      {' '}<span className="text-cyan-300">{e.sender_email}</span>
                      {' '}{e.subject}
                    </div>
                  ))}
                </div>
              </div>

              {/* Sync test result */}
              {diagnostic.syncTestResult && (
                <div>
                  <div className="text-gray-400 mb-1">6. SYNC TEST RESULT</div>
                  <div className="pl-3 space-y-0.5">
                    <div>Success: <span className={diagnostic.syncTestResult.success ? 'text-green-400' : 'text-red-400'}>{diagnostic.syncTestResult.success ? 'JA' : 'NEJ'}</span></div>
                    <div>Fetched: {diagnostic.syncTestResult.fetched} | Inserted: {diagnostic.syncTestResult.inserted} | Skipped: {diagnostic.syncTestResult.skipped} | Linked: {diagnostic.syncTestResult.linked}</div>
                    <div>Tid: {diagnostic.syncTestResult.durationMs}ms</div>
                    {diagnostic.syncTestResult.errors.length > 0 && (
                      <div className="text-red-400">Fejl: {diagnostic.syncTestResult.errors.join('; ')}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
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
              onToggleRead={() => handleToggleReadStatus(selectedEmail.id, selectedEmail.is_read)}
              onAttachmentsBackfilled={loadEmails}
              onLinkToCustomer={async (customerId) => {
                await handleManualLink(selectedEmail.id, customerId)
              }}
              onCreateServiceCase={() => handleCreateServiceCase(selectedEmail.id)}
              onNavigateToCustomer={(customerId) => router.push(`/dashboard/customers/${customerId}`)}
              onUnlinkCustomer={() => handleUnlinkEmail(selectedEmail.id)}
              isCreatingServiceCase={isCreatingServiceCase}
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
