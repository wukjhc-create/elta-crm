'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Trash2,
  Pencil,
  Play,
  Pause,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Save,
  X,
  Calendar,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import {
  getSupplierSyncSchedules,
  createSyncSchedule,
  updateSyncSchedule,
  deleteSyncSchedule,
  toggleSyncSchedule,
  runSyncNow,
  getSyncHistory,
} from '@/lib/actions/sync-schedules'
import type {
  SupplierSyncSchedule,
  SyncType,
  ScheduleRunStatus,
} from '@/types/suppliers.types'

const COMMON_CRON_EXPRESSIONS = [
  { label: 'Hver nat kl. 03:00', value: '0 3 * * *' },
  { label: 'Hver nat kl. 02:00', value: '0 2 * * *' },
  { label: 'Hver morgen kl. 06:00', value: '0 6 * * *' },
  { label: 'Hver time', value: '0 * * * *' },
  { label: 'Hver 6. time', value: '0 */6 * * *' },
  { label: 'Hver mandag kl. 03:00', value: '0 3 * * 1' },
  { label: 'Hver dag kl. 12:00', value: '0 12 * * *' },
]

const SYNC_TYPE_LABELS: Record<SyncType, string> = {
  full_catalog: 'Fuld katalog',
  price_update: 'Prisopdatering',
  availability: 'Lagerstatus',
  incremental: 'Inkrementel',
}

const STATUS_LABELS: Record<ScheduleRunStatus, string> = {
  success: 'Gennemført',
  failed: 'Fejlet',
  partial: 'Delvist',
  skipped: 'Sprunget over',
  running: 'Kører',
}

interface SyncSchedulesManagerProps {
  supplierId: string
  supplierName: string
}

const STATUS_CONFIG: Record<ScheduleRunStatus, { icon: typeof CheckCircle; color: string; bg: string }> = {
  success: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50' },
  failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
  partial: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
  skipped: { icon: XCircle, color: 'text-gray-400', bg: 'bg-gray-50' },
  running: { icon: RefreshCw, color: 'text-blue-500', bg: 'bg-blue-50' },
}

interface SyncHistoryEntry {
  id: string
  sync_type: string
  status: string
  trigger_type: string
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  processed_items: number
  price_changes_count: number
  error_message: string | null
}

function formatDuration(ms: number | null): string {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '—'
  return new Date(dateString).toLocaleDateString('da-DK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelativeDate(dateString: string | null): string {
  if (!dateString) return '—'
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffHours = Math.round(diffMs / (1000 * 60 * 60))
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffMs < 0) return 'Overskredet'
  if (diffHours < 1) return 'Snart'
  if (diffHours < 24) return `Om ${diffHours} timer`
  if (diffDays === 1) return 'I morgen'
  return `Om ${diffDays} dage`
}

export function SyncSchedulesManager({ supplierId, supplierName }: SyncSchedulesManagerProps) {
  const toast = useToast()
  const [schedules, setSchedules] = useState<SupplierSyncSchedule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<SupplierSyncSchedule | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [history, setHistory] = useState<SyncHistoryEntry[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [runningScheduleId, setRunningScheduleId] = useState<string | null>(null)

  const loadSchedules = useCallback(async () => {
    setIsLoading(true)
    const result = await getSupplierSyncSchedules(supplierId)
    if (result.success && result.data) setSchedules(result.data)
    setIsLoading(false)
  }, [supplierId])

  useEffect(() => {
    loadSchedules()
  }, [loadSchedules])

  const loadHistory = async () => {
    if (historyLoaded) return
    const result = await getSyncHistory(supplierId, { limit: 20 })
    if (result.success && result.data) {
      setHistory(result.data)
    }
    setHistoryLoaded(true)
  }

  const handleToggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
    } else {
      setExpandedId(id)
      loadHistory()
    }
  }

  const handleToggle = async (schedule: SupplierSyncSchedule) => {
    const result = await toggleSyncSchedule(schedule.id)
    if (result.success) {
      toast.success(schedule.is_enabled ? 'Plan deaktiveret' : 'Plan aktiveret')
      loadSchedules()
    } else {
      toast.error('Fejl', result.error)
    }
  }

  const handleRunNow = async (schedule: SupplierSyncSchedule) => {
    setRunningScheduleId(schedule.id)
    const result = await runSyncNow(schedule.id)
    if (result.success) {
      toast.success('Synkronisering gennemført', result.data?.message)
      setHistoryLoaded(false)
      loadSchedules()
    } else {
      toast.error('Synkroniseringsfejl', result.error)
    }
    setRunningScheduleId(null)
  }

  const handleDelete = async (schedule: SupplierSyncSchedule) => {
    if (!confirm(`Er du sikker på at du vil slette planen "${schedule.schedule_name}"?`)) return
    const result = await deleteSyncSchedule(schedule.id)
    if (result.success) {
      toast.success('Plan slettet')
      loadSchedules()
    } else {
      toast.error('Fejl', result.error)
    }
  }

  const handleFormSuccess = () => {
    setShowForm(false)
    setEditingSchedule(null)
    loadSchedules()
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-8 bg-gray-200 rounded w-1/3" />
        <div className="h-24 bg-gray-200 rounded" />
        <div className="h-24 bg-gray-200 rounded" />
      </div>
    )
  }

  // Summary stats
  const activeCount = schedules.filter(s => s.is_enabled).length
  const nextRun = schedules
    .filter(s => s.is_enabled && s.next_run_at)
    .sort((a, b) => new Date(a.next_run_at!).getTime() - new Date(b.next_run_at!).getTime())[0]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Synkroniseringsplaner for {supplierName}</h3>
        <Button onClick={() => { setEditingSchedule(null); setShowForm(true) }}>
          <Plus className="w-4 h-4 mr-2" />
          Opret plan
        </Button>
      </div>

      {/* Summary */}
      {schedules.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border rounded-lg p-4">
            <div className="text-sm text-gray-500">Planer i alt</div>
            <div className="text-2xl font-bold mt-1">{schedules.length}</div>
            <div className="text-xs text-gray-400 mt-1">{activeCount} aktive</div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-sm text-gray-500">Næste kørsel</div>
            <div className="text-2xl font-bold mt-1">
              {nextRun ? formatRelativeDate(nextRun.next_run_at) : '—'}
            </div>
            {nextRun && (
              <div className="text-xs text-gray-400 mt-1">{formatDate(nextRun.next_run_at)}</div>
            )}
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-sm text-gray-500">Seneste status</div>
            {(() => {
              const lastRun = schedules.find(s => s.last_run_status)
              if (!lastRun?.last_run_status) return <div className="text-2xl font-bold mt-1">—</div>
              const config = STATUS_CONFIG[lastRun.last_run_status]
              return (
                <div className="flex items-center gap-2 mt-1">
                  <config.icon className={`h-5 w-5 ${config.color}`} />
                  <span className="text-lg font-semibold">
                    {STATUS_LABELS[lastRun.last_run_status]}
                  </span>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <SyncScheduleForm
          supplierId={supplierId}
          editingSchedule={editingSchedule}
          onSuccess={handleFormSuccess}
          onCancel={() => { setShowForm(false); setEditingSchedule(null) }}
        />
      )}

      {/* Schedules list */}
      {schedules.length === 0 ? (
        <div className="bg-white border rounded-lg p-12 text-center">
          <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900">Ingen synkroniseringsplaner</h3>
          <p className="text-sm text-gray-500 mt-1">
            Opret en plan for at automatisere prissynkronisering fra {supplierName}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map(schedule => {
            const statusConfig = schedule.last_run_status ? STATUS_CONFIG[schedule.last_run_status] : null
            const isExpanded = expandedId === schedule.id
            const isRunning = runningScheduleId === schedule.id

            return (
              <div key={schedule.id} className="bg-white border rounded-lg overflow-hidden">
                {/* Schedule Header */}
                <div className={`p-4 ${!schedule.is_enabled ? 'opacity-60' : ''}`}>
                  <div className="flex items-center gap-3">
                    {/* Expand toggle */}
                    <button
                      onClick={() => handleToggleExpand(schedule.id)}
                      className="shrink-0 text-gray-400 hover:text-gray-600"
                    >
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4" />
                        : <ChevronRight className="h-4 w-4" />
                      }
                    </button>

                    {/* Status indicator */}
                    {statusConfig ? (
                      <div className={`p-1.5 rounded ${statusConfig.bg}`}>
                        <statusConfig.icon className={`h-4 w-4 ${statusConfig.color}`} />
                      </div>
                    ) : (
                      <div className="p-1.5 rounded bg-gray-50">
                        <Clock className="h-4 w-4 text-gray-400" />
                      </div>
                    )}

                    {/* Schedule info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{schedule.schedule_name}</span>
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                          {SYNC_TYPE_LABELS[schedule.sync_type as SyncType] || schedule.sync_type}
                        </span>
                        {!schedule.is_enabled && (
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                            Deaktiveret
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-400 mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {schedule.cron_expression}
                        </span>
                        {schedule.next_run_at && schedule.is_enabled && (
                          <span>Næste: {formatRelativeDate(schedule.next_run_at)}</span>
                        )}
                        {schedule.last_run_at && (
                          <span>Sidst: {formatDate(schedule.last_run_at)}</span>
                        )}
                        {schedule.last_run_duration_ms && (
                          <span>Varighed: {formatDuration(schedule.last_run_duration_ms)}</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleRunNow(schedule)}
                        disabled={isRunning}
                        className="p-1.5 rounded hover:bg-green-50 text-gray-400 hover:text-green-600 disabled:opacity-50"
                        title="Kør nu"
                      >
                        <Play className={`h-4 w-4 ${isRunning ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        onClick={() => handleToggle(schedule)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                        title={schedule.is_enabled ? 'Deaktiver' : 'Aktiver'}
                      >
                        {schedule.is_enabled ? <Pause className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => { setEditingSchedule(schedule); setShowForm(true) }}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                        title="Rediger"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(schedule)}
                        className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"
                        title="Slet"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Retry & notification info */}
                  {schedule.is_enabled && (
                    <div className="flex items-center gap-4 text-xs text-gray-400 mt-2 ml-12">
                      {schedule.retry_on_failure && (
                        <span>Genforsøg: {schedule.max_retries}x ({schedule.retry_delay_minutes} min interval)</span>
                      )}
                      <span>Maks varighed: {schedule.max_duration_minutes} min</span>
                      {schedule.notify_on_failure && (
                        <span>Notifikation ved fejl{schedule.notify_email ? `: ${schedule.notify_email}` : ''}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Expanded: History */}
                {isExpanded && (
                  <div className="border-t bg-gray-50 p-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Synkroniseringshistorik</h4>
                    {history.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-3">Ingen kørsler endnu</p>
                    ) : (
                      <div className="space-y-2">
                        {history.slice(0, 10).map(entry => {
                          const entryStatus = STATUS_CONFIG[entry.status as ScheduleRunStatus]
                          const StatusIcon = entryStatus?.icon || Clock
                          const statusColor = entryStatus?.color || 'text-gray-400'
                          return (
                            <div key={entry.id} className="bg-white border rounded p-3">
                              <div className="flex items-center gap-3">
                                <StatusIcon className={`h-4 w-4 shrink-0 ${statusColor}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 text-sm">
                                    <span className="font-medium">
                                      {STATUS_LABELS[entry.status as ScheduleRunStatus] || entry.status}
                                    </span>
                                    <span className="text-gray-400">|</span>
                                    <span className="text-gray-500">{formatDate(entry.started_at)}</span>
                                    <span className="text-gray-400">|</span>
                                    <span className="text-gray-500">{formatDuration(entry.duration_ms)}</span>
                                    <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">
                                      {entry.trigger_type}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                                    <span>{entry.processed_items} behandlet</span>
                                    {entry.price_changes_count > 0 && (
                                      <span className="text-amber-600">{entry.price_changes_count} prisændringer</span>
                                    )}
                                  </div>
                                  {entry.error_message && (
                                    <p className="text-xs text-red-500 mt-1">{entry.error_message}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// =====================================================
// Sync Schedule Form
// =====================================================

interface SyncScheduleFormProps {
  supplierId: string
  editingSchedule: SupplierSyncSchedule | null
  onSuccess: () => void
  onCancel: () => void
}

function SyncScheduleForm({ supplierId, editingSchedule, onSuccess, onCancel }: SyncScheduleFormProps) {
  const toast = useToast()
  const [isSaving, setIsSaving] = useState(false)

  const [scheduleName, setScheduleName] = useState(editingSchedule?.schedule_name || '')
  const [syncType, setSyncType] = useState<SyncType>(editingSchedule?.sync_type as SyncType || 'price_update')
  const [cronExpression, setCronExpression] = useState(editingSchedule?.cron_expression || '0 3 * * *')
  const [cronPreset, setCronPreset] = useState(() => {
    const match = COMMON_CRON_EXPRESSIONS.find(c => c.value === (editingSchedule?.cron_expression || '0 3 * * *'))
    return match ? match.value : 'custom'
  })
  const [maxDuration, setMaxDuration] = useState(String(editingSchedule?.max_duration_minutes || 60))
  const [retryOnFailure, setRetryOnFailure] = useState(editingSchedule?.retry_on_failure ?? true)
  const [maxRetries, setMaxRetries] = useState(String(editingSchedule?.max_retries || 3))
  const [retryDelay, setRetryDelay] = useState(String(editingSchedule?.retry_delay_minutes || 15))
  const [notifyOnFailure, setNotifyOnFailure] = useState(editingSchedule?.notify_on_failure ?? true)
  const [notifyEmail, setNotifyEmail] = useState(editingSchedule?.notify_email || '')

  const handleCronPresetChange = (value: string) => {
    setCronPreset(value)
    if (value !== 'custom') {
      setCronExpression(value)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!scheduleName.trim()) {
      toast.error('Navn er påkrævet')
      return
    }
    if (!cronExpression.trim()) {
      toast.error('Cron-udtryk er påkrævet')
      return
    }

    setIsSaving(true)

    if (editingSchedule) {
      const result = await updateSyncSchedule(editingSchedule.id, {
        schedule_name: scheduleName.trim(),
        cron_expression: cronExpression.trim(),
        max_duration_minutes: Number(maxDuration) || 60,
        retry_on_failure: retryOnFailure,
        max_retries: Number(maxRetries) || 3,
        retry_delay_minutes: Number(retryDelay) || 15,
        notify_on_failure: notifyOnFailure,
        notify_email: notifyEmail.trim() || '',
      })

      if (result.success) {
        toast.success('Plan opdateret')
        onSuccess()
      } else {
        toast.error('Fejl', result.error)
      }
    } else {
      const result = await createSyncSchedule({
        supplier_id: supplierId,
        schedule_name: scheduleName.trim(),
        sync_type: syncType,
        cron_expression: cronExpression.trim(),
        max_duration_minutes: Number(maxDuration) || 60,
        retry_on_failure: retryOnFailure,
        max_retries: Number(maxRetries) || 3,
        retry_delay_minutes: Number(retryDelay) || 15,
        notify_on_failure: notifyOnFailure,
        notify_email: notifyEmail.trim() || undefined,
      })

      if (result.success) {
        toast.success('Plan oprettet')
        onSuccess()
      } else {
        toast.error('Fejl', result.error)
      }
    }

    setIsSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">{editingSchedule ? 'Rediger synkroniseringsplan' : 'Opret ny synkroniseringsplan'}</h4>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Navn <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={scheduleName}
            onChange={(e) => setScheduleName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="f.eks. Nattelig prisopdatering"
            required
          />
        </div>

        {/* Sync Type */}
        {!editingSchedule && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={syncType}
              onChange={(e) => setSyncType(e.target.value as SyncType)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {(Object.entries(SYNC_TYPE_LABELS) as [SyncType, string][]).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Cron Preset */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tidsplan</label>
          <select
            value={cronPreset}
            onChange={(e) => handleCronPresetChange(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {COMMON_CRON_EXPRESSIONS.map((expr) => (
              <option key={expr.value} value={expr.value}>{expr.label}</option>
            ))}
            <option value="custom">Brugerdefineret...</option>
          </select>
        </div>

        {/* Custom Cron */}
        {cronPreset === 'custom' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cron-udtryk</label>
            <input
              type="text"
              value={cronExpression}
              onChange={(e) => setCronExpression(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
              placeholder="0 3 * * *"
            />
            <p className="text-xs text-gray-500 mt-1">minut time dag måned ugedag</p>
          </div>
        )}

        {/* Max Duration */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Maks varighed (min)</label>
          <input
            type="number"
            value={maxDuration}
            onChange={(e) => setMaxDuration(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            min="1"
            max="480"
          />
        </div>
      </div>

      {/* Retry settings */}
      <div className="border-t pt-4">
        <h5 className="text-sm font-medium text-gray-700 mb-3">Genforsøg</h5>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="retryOnFailure"
              checked={retryOnFailure}
              onChange={(e) => setRetryOnFailure(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="retryOnFailure" className="text-sm text-gray-700">Genforsøg ved fejl</label>
          </div>
          {retryOnFailure && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Antal forsøg</label>
                <input
                  type="number"
                  value={maxRetries}
                  onChange={(e) => setMaxRetries(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  min="1"
                  max="10"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Interval (min)</label>
                <input
                  type="number"
                  value={retryDelay}
                  onChange={(e) => setRetryDelay(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  min="1"
                  max="120"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Notification settings */}
      <div className="border-t pt-4">
        <h5 className="text-sm font-medium text-gray-700 mb-3">Notifikationer</h5>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="notifyOnFailure"
              checked={notifyOnFailure}
              onChange={(e) => setNotifyOnFailure(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="notifyOnFailure" className="text-sm text-gray-700">Notificer ved fejl</label>
          </div>
          {notifyOnFailure && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email (valgfri)</label>
              <input
                type="email"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="admin@firma.dk"
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuller
        </Button>
        <Button type="submit" disabled={isSaving}>
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? 'Gemmer...' : editingSchedule ? 'Opdater' : 'Opret'}
        </Button>
      </div>
    </form>
  )
}
