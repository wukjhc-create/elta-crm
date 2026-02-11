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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import {
  getSyncJobs,
  createSyncJob,
  updateSyncJob,
  deleteSyncJob,
  getSyncLogs,
} from '@/lib/actions/sync'
import type {
  SupplierSyncJobWithSupplier,
  SupplierSyncLog,
  SyncJobType,
  CreateSyncJobData,
} from '@/types/suppliers.types'

interface SyncJobsManagerProps {
  supplierId: string
  supplierName: string
}

const JOB_TYPE_LABELS: Record<SyncJobType, string> = {
  full_catalog: 'Fuld katalog',
  price_update: 'Prisopdatering',
  availability_check: 'Tilgængelighed',
  custom: 'Tilpasset',
}

const STATUS_CONFIG = {
  success: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50', label: 'Succes' },
  failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', label: 'Fejlet' },
  partial: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50', label: 'Delvis' },
  started: { icon: RefreshCw, color: 'text-blue-500', bg: 'bg-blue-50', label: 'Startet' },
  running: { icon: RefreshCw, color: 'text-blue-500', bg: 'bg-blue-50', label: 'Kører' },
  completed: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50', label: 'Færdig' },
  cancelled: { icon: XCircle, color: 'text-gray-500', bg: 'bg-gray-50', label: 'Annulleret' },
}

import { formatDateTimeDK, formatDurationMs } from '@/lib/utils/format'

function formatDuration(ms: number | null): string {
  return formatDurationMs(ms)
}

export function SyncJobsManager({ supplierId, supplierName }: SyncJobsManagerProps) {
  const toast = useToast()
  const [jobs, setJobs] = useState<SupplierSyncJobWithSupplier[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingJob, setEditingJob] = useState<SupplierSyncJobWithSupplier | null>(null)
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)
  const [jobLogs, setJobLogs] = useState<Record<string, SupplierSyncLog[]>>({})

  const loadJobs = useCallback(async () => {
    setIsLoading(true)
    const result = await getSyncJobs(supplierId)
    if (result.success && result.data) setJobs(result.data)
    setIsLoading(false)
  }, [supplierId])

  useEffect(() => {
    loadJobs()
  }, [loadJobs])

  const loadLogs = async (jobId: string) => {
    if (jobLogs[jobId]) return // Already loaded
    const result = await getSyncLogs({ sync_job_id: jobId, pageSize: 10 })
    if (result.success && result.data) {
      setJobLogs(prev => ({ ...prev, [jobId]: result.data!.data }))
    }
  }

  const handleToggleExpand = (jobId: string) => {
    if (expandedJobId === jobId) {
      setExpandedJobId(null)
    } else {
      setExpandedJobId(jobId)
      loadLogs(jobId)
    }
  }

  const handleToggleActive = async (job: SupplierSyncJobWithSupplier) => {
    const result = await updateSyncJob(job.id, { is_active: !job.is_active })
    if (result.success) {
      toast.success(job.is_active ? 'Job deaktiveret' : 'Job aktiveret')
      loadJobs()
    } else {
      toast.error('Fejl', result.error)
    }
  }

  const handleDelete = async (job: SupplierSyncJobWithSupplier) => {
    if (!confirm(`Er du sikker på at du vil slette sync job "${job.name}"?`)) return
    const result = await deleteSyncJob(job.id)
    if (result.success) {
      toast.success('Job slettet')
      loadJobs()
    } else {
      toast.error('Fejl', result.error)
    }
  }

  const handleFormSuccess = () => {
    setShowForm(false)
    setEditingJob(null)
    loadJobs()
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Sync Jobs for {supplierName}</h3>
        <Button onClick={() => { setEditingJob(null); setShowForm(true) }}>
          <Plus className="w-4 h-4 mr-2" />
          Opret job
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <SyncJobForm
          supplierId={supplierId}
          editingJob={editingJob}
          onSuccess={handleFormSuccess}
          onCancel={() => { setShowForm(false); setEditingJob(null) }}
        />
      )}

      {/* Jobs list */}
      {jobs.length === 0 ? (
        <div className="bg-white border rounded-lg p-12 text-center">
          <RefreshCw className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900">Ingen sync jobs</h3>
          <p className="text-sm text-gray-500 mt-1">
            Opret et sync job for at automatisere produkt- og prisopdateringer fra {supplierName}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => {
            const statusConfig = job.last_status ? STATUS_CONFIG[job.last_status] : null
            const isExpanded = expandedJobId === job.id
            const logs = jobLogs[job.id] || []

            return (
              <div key={job.id} className="bg-white border rounded-lg overflow-hidden">
                {/* Job Header */}
                <div className={`p-4 ${!job.is_active ? 'opacity-60' : ''}`}>
                  <div className="flex items-center gap-3">
                    {/* Expand toggle */}
                    <button
                      onClick={() => handleToggleExpand(job.id)}
                      className="shrink-0 text-gray-400 hover:text-gray-600"
                    >
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4" />
                        : <ChevronRight className="h-4 w-4" />
                      }
                    </button>

                    {/* Status indicator */}
                    {statusConfig && (
                      <div className={`p-1.5 rounded ${statusConfig.bg}`}>
                        <statusConfig.icon className={`h-4 w-4 ${statusConfig.color}`} />
                      </div>
                    )}

                    {/* Job info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{job.name}</span>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {JOB_TYPE_LABELS[job.job_type]}
                        </span>
                        {!job.is_active && (
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                            Inaktiv
                          </span>
                        )}
                      </div>
                      {job.description && (
                        <p className="text-sm text-gray-500 mt-0.5 truncate">{job.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-gray-400 mt-1">
                        {job.schedule_cron && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {job.schedule_cron}
                          </span>
                        )}
                        <span>Kørsler: {job.total_runs}</span>
                        {job.last_run_at && (
                          <span>Sidst: {formatDateTimeDK(job.last_run_at) || '\u2014'}</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleToggleActive(job)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                        title={job.is_active ? 'Deaktiver' : 'Aktiver'}
                      >
                        {job.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => { setEditingJob(job); setShowForm(true) }}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                        title="Rediger"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(job)}
                        className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"
                        title="Slet"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded: Sync Logs */}
                {isExpanded && (
                  <div className="border-t bg-gray-50 p-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Seneste kørsler</h4>
                    {logs.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-3">Ingen kørsler endnu</p>
                    ) : (
                      <div className="space-y-2">
                        {logs.map(log => {
                          const logStatus = STATUS_CONFIG[log.status] || STATUS_CONFIG.started
                          return (
                            <div key={log.id} className="bg-white border rounded p-3">
                              <div className="flex items-center gap-3">
                                <logStatus.icon className={`h-4 w-4 shrink-0 ${logStatus.color}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 text-sm">
                                    <span className="font-medium">{logStatus.label}</span>
                                    <span className="text-gray-400">|</span>
                                    <span className="text-gray-500">{formatDateTimeDK(log.started_at) || '\u2014'}</span>
                                    <span className="text-gray-400">|</span>
                                    <span className="text-gray-500">{formatDuration(log.duration_ms)}</span>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                                    <span>{log.processed_items}/{log.total_items} behandlet</span>
                                    {log.new_items > 0 && <span className="text-green-600">+{log.new_items} nye</span>}
                                    {log.updated_items > 0 && <span className="text-blue-600">{log.updated_items} opdateret</span>}
                                    {log.failed_items > 0 && <span className="text-red-600">{log.failed_items} fejlet</span>}
                                    {log.price_changes_count > 0 && <span className="text-amber-600">{log.price_changes_count} prisændringer</span>}
                                  </div>
                                  {log.error_message && (
                                    <p className="text-xs text-red-500 mt-1">{log.error_message}</p>
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
// Sync Job Form
// =====================================================

interface SyncJobFormProps {
  supplierId: string
  editingJob: SupplierSyncJobWithSupplier | null
  onSuccess: () => void
  onCancel: () => void
}

function SyncJobForm({ supplierId, editingJob, onSuccess, onCancel }: SyncJobFormProps) {
  const toast = useToast()
  const [isSaving, setIsSaving] = useState(false)

  const [name, setName] = useState(editingJob?.name || '')
  const [description, setDescription] = useState(editingJob?.description || '')
  const [jobType, setJobType] = useState<SyncJobType>(editingJob?.job_type || 'price_update')
  const [scheduleCron, setScheduleCron] = useState(editingJob?.schedule_cron || '')
  const [maxRetries, setMaxRetries] = useState(editingJob?.max_retries?.toString() || '3')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('Navn er påkrævet')
      return
    }

    setIsSaving(true)

    if (editingJob) {
      const result = await updateSyncJob(editingJob.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        schedule_cron: scheduleCron.trim() || undefined,
        max_retries: Number(maxRetries) || 3,
      })

      if (result.success) {
        toast.success('Job opdateret')
        onSuccess()
      } else {
        toast.error('Fejl', result.error)
      }
    } else {
      const data: CreateSyncJobData = {
        supplier_id: supplierId,
        job_type: jobType,
        name: name.trim(),
        description: description.trim() || undefined,
        schedule_cron: scheduleCron.trim() || undefined,
        is_active: true,
        max_retries: Number(maxRetries) || 3,
      }

      const result = await createSyncJob(data)

      if (result.success) {
        toast.success('Job oprettet')
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
        <h4 className="font-semibold">{editingJob ? 'Rediger sync job' : 'Opret nyt sync job'}</h4>
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
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="f.eks. Nattelig prisopdatering"
            required
          />
        </div>

        {/* Job Type */}
        {!editingJob && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={jobType}
              onChange={(e) => setJobType(e.target.value as SyncJobType)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {(Object.entries(JOB_TYPE_LABELS) as [SyncJobType, string][]).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Schedule Cron */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cron-udtryk</label>
          <input
            type="text"
            value={scheduleCron}
            onChange={(e) => setScheduleCron(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
            placeholder="0 2 * * *"
          />
          <p className="text-xs text-gray-500 mt-1">f.eks. &quot;0 2 * * *&quot; = kl. 02:00 hver nat</p>
        </div>

        {/* Max Retries */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Maks genforsøg</label>
          <input
            type="number"
            value={maxRetries}
            onChange={(e) => setMaxRetries(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            min="0"
            max="10"
          />
        </div>

        {/* Description */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Beskrivelse</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="Valgfri beskrivelse"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuller
        </Button>
        <Button type="submit" disabled={isSaving}>
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? 'Gemmer...' : editingJob ? 'Opdater' : 'Opret'}
        </Button>
      </div>
    </form>
  )
}
