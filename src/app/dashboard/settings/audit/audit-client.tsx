'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  FileText,
  Settings,
  Package,
  Users,
  FolderKanban,
  Calculator,
  Mail,
  TrendingUp,
  Eye,
  Plus,
  Pencil,
  Trash2,
  ArrowRightLeft,
  Download,
  Upload,
  Send,
  CheckCircle,
  XCircle,
  Archive,
  RotateCcw,
} from 'lucide-react'
import { getAuditLogs } from '@/lib/actions/audit'
import type { AuditLogEntry, AuditLogFilters, AuditEntityType, AuditAction } from '@/types/audit.types'
import { formatDateTimeDK, formatTimeAgo } from '@/lib/utils/format'

const ENTITY_TYPE_OPTIONS: { value: AuditEntityType; label: string }[] = [
  { value: 'customer', label: 'Kunde' },
  { value: 'lead', label: 'Lead' },
  { value: 'offer', label: 'Tilbud' },
  { value: 'project', label: 'Projekt' },
  { value: 'calculation', label: 'Kalkulation' },
  { value: 'product', label: 'Produkt' },
  { value: 'package', label: 'Pakke' },
  { value: 'message', label: 'Besked' },
  { value: 'settings', label: 'Indstillinger' },
  { value: 'user', label: 'Bruger' },
]

const ACTION_OPTIONS: { value: AuditAction; label: string }[] = [
  { value: 'create', label: 'Oprettet' },
  { value: 'update', label: 'Opdateret' },
  { value: 'delete', label: 'Slettet' },
  { value: 'status_change', label: 'Statusændring' },
  { value: 'view', label: 'Vist' },
  { value: 'export', label: 'Eksporteret' },
  { value: 'import', label: 'Importeret' },
  { value: 'send', label: 'Sendt' },
  { value: 'accept', label: 'Accepteret' },
  { value: 'reject', label: 'Afvist' },
  { value: 'archive', label: 'Arkiveret' },
  { value: 'restore', label: 'Gendannet' },
]

function getEntityIcon(entityType: AuditEntityType) {
  switch (entityType) {
    case 'customer': return <Users className="h-4 w-4" />
    case 'lead': return <TrendingUp className="h-4 w-4" />
    case 'offer': return <FileText className="h-4 w-4" />
    case 'project': return <FolderKanban className="h-4 w-4" />
    case 'calculation': return <Calculator className="h-4 w-4" />
    case 'product': return <Package className="h-4 w-4" />
    case 'package': return <Package className="h-4 w-4" />
    case 'message': return <Mail className="h-4 w-4" />
    case 'settings': return <Settings className="h-4 w-4" />
    case 'user': return <User className="h-4 w-4" />
    default: return <FileText className="h-4 w-4" />
  }
}

function getActionIcon(action: AuditAction) {
  switch (action) {
    case 'create': return <Plus className="h-3.5 w-3.5 text-green-500" />
    case 'update': return <Pencil className="h-3.5 w-3.5 text-blue-500" />
    case 'delete': return <Trash2 className="h-3.5 w-3.5 text-red-500" />
    case 'status_change': return <ArrowRightLeft className="h-3.5 w-3.5 text-purple-500" />
    case 'view': return <Eye className="h-3.5 w-3.5 text-gray-500" />
    case 'export': return <Download className="h-3.5 w-3.5 text-cyan-500" />
    case 'import': return <Upload className="h-3.5 w-3.5 text-orange-500" />
    case 'send': return <Send className="h-3.5 w-3.5 text-blue-500" />
    case 'accept': return <CheckCircle className="h-3.5 w-3.5 text-green-500" />
    case 'reject': return <XCircle className="h-3.5 w-3.5 text-red-500" />
    case 'archive': return <Archive className="h-3.5 w-3.5 text-gray-500" />
    case 'restore': return <RotateCcw className="h-3.5 w-3.5 text-teal-500" />
    default: return <Clock className="h-3.5 w-3.5 text-gray-400" />
  }
}

function getActionColor(action: AuditAction): string {
  switch (action) {
    case 'create': return 'bg-green-50 text-green-700 border-green-200'
    case 'update': return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'delete': return 'bg-red-50 text-red-700 border-red-200'
    case 'status_change': return 'bg-purple-50 text-purple-700 border-purple-200'
    case 'view': return 'bg-gray-50 text-gray-700 border-gray-200'
    case 'export': return 'bg-cyan-50 text-cyan-700 border-cyan-200'
    case 'import': return 'bg-orange-50 text-orange-700 border-orange-200'
    case 'send': return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'accept': return 'bg-green-50 text-green-700 border-green-200'
    case 'reject': return 'bg-red-50 text-red-700 border-red-200'
    case 'archive': return 'bg-gray-50 text-gray-700 border-gray-200'
    case 'restore': return 'bg-teal-50 text-teal-700 border-teal-200'
    default: return 'bg-gray-50 text-gray-700 border-gray-200'
  }
}

function getEntityLabel(type: AuditEntityType): string {
  return ENTITY_TYPE_OPTIONS.find(o => o.value === type)?.label || type
}

function getActionLabel(action: AuditAction): string {
  return ACTION_OPTIONS.find(o => o.value === action)?.label || action
}

function formatRelativeTime(dateString: string): string {
  return formatTimeAgo(dateString) || formatDateTimeDK(dateString)
}

export function AuditLogClient() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  const [filters, setFilters] = useState<AuditLogFilters>({
    page: 1,
    pageSize: 25,
  })

  const loadData = useCallback(async () => {
    setIsLoading(true)
    const result = await getAuditLogs(filters)
    if (result.success && result.data) {
      setEntries(result.data.data)
      setTotal(result.data.total)
      setTotalPages(result.data.totalPages)
    }
    setIsLoading(false)
  }, [filters])

  useEffect(() => {
    loadData()
  }, [loadData])

  function updateFilter(key: keyof AuditLogFilters, value: string | number | undefined) {
    setFilters(prev => ({
      ...prev,
      [key]: value || undefined,
      page: key === 'page' ? (value as number) : 1,
    }))
  }

  function clearFilters() {
    setFilters({ page: 1, pageSize: 25 })
  }

  const hasActiveFilters = filters.entity_type || filters.action || filters.from_date || filters.to_date

  return (
    <div className="space-y-4">
      {/* Search and Filter Bar */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              hasActiveFilters
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Filter className="h-4 w-4" />
            Filtre
            {hasActiveFilters && (
              <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                {[filters.entity_type, filters.action, filters.from_date, filters.to_date].filter(Boolean).length}
              </span>
            )}
          </button>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Ryd filtre
            </button>
          )}

          <div className="ml-auto text-sm text-gray-500">
            {total} {total === 1 ? 'post' : 'poster'} fundet
          </div>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Entitetstype</label>
              <select
                value={filters.entity_type || ''}
                onChange={(e) => updateFilter('entity_type', e.target.value as AuditEntityType)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Alle typer</option>
                {ENTITY_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Handling</label>
              <select
                value={filters.action || ''}
                onChange={(e) => updateFilter('action', e.target.value as AuditAction)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Alle handlinger</option>
                {ACTION_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Fra dato</label>
              <input
                type="date"
                value={filters.from_date || ''}
                onChange={(e) => updateFilter('from_date', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Til dato</label>
              <input
                type="date"
                value={filters.to_date || ''}
                onChange={(e) => updateFilter('to_date', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto" />
            <p className="text-sm text-gray-500 mt-3">Henter audit log...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="p-12 text-center">
            <Clock className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900">Ingen poster fundet</h3>
            <p className="text-sm text-gray-500 mt-1">
              {hasActiveFilters
                ? 'Prøv at justere dine filtre'
                : 'Der er endnu ingen audit log poster'}
            </p>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-3 bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase">
              <div className="col-span-3">Handling</div>
              <div className="col-span-3">Entitet</div>
              <div className="col-span-2">Bruger</div>
              <div className="col-span-2">Tidspunkt</div>
              <div className="col-span-2">Detaljer</div>
            </div>

            {/* Rows */}
            <div className="divide-y">
              {entries.map((entry) => (
                <div key={entry.id}>
                  {/* Main Row */}
                  <div
                    className="grid grid-cols-1 md:grid-cols-12 gap-2 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  >
                    {/* Action */}
                    <div className="col-span-3 flex items-center gap-2">
                      {getActionIcon(entry.action)}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getActionColor(entry.action)}`}>
                        {getActionLabel(entry.action)}
                      </span>
                      {entry.action_description && (
                        <span className="text-xs text-gray-500 truncate hidden lg:inline">
                          {entry.action_description.length > 40
                            ? entry.action_description.slice(0, 40) + '...'
                            : entry.action_description}
                        </span>
                      )}
                    </div>

                    {/* Entity */}
                    <div className="col-span-3 flex items-center gap-2 min-w-0">
                      <span className="text-gray-400 shrink-0">
                        {getEntityIcon(entry.entity_type)}
                      </span>
                      <div className="min-w-0">
                        <span className="text-xs text-gray-500">{getEntityLabel(entry.entity_type)}</span>
                        {entry.entity_name && (
                          <p className="text-sm font-medium text-gray-900 truncate">{entry.entity_name}</p>
                        )}
                      </div>
                    </div>

                    {/* User */}
                    <div className="col-span-2 flex items-center gap-2 min-w-0">
                      <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <span className="text-sm text-gray-700 truncate">
                        {entry.user_name || entry.user_email || 'System'}
                      </span>
                    </div>

                    {/* Time */}
                    <div className="col-span-2 flex items-center text-sm text-gray-500" title={formatDateTimeDK(entry.created_at)}>
                      {formatRelativeTime(entry.created_at)}
                    </div>

                    {/* Details indicator */}
                    <div className="col-span-2 flex items-center justify-end gap-2">
                      {entry.changes && Object.keys(entry.changes).length > 0 && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          {Object.keys(entry.changes).length} felt
                        </span>
                      )}
                      <ChevronRight
                        className={`h-4 w-4 text-gray-400 transition-transform ${
                          expandedId === entry.id ? 'rotate-90' : ''
                        }`}
                      />
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedId === entry.id && (
                    <div className="px-4 py-4 bg-gray-50 border-t space-y-4">
                      {/* Description */}
                      {entry.action_description && (
                        <div>
                          <h4 className="text-xs font-medium text-gray-500 mb-1">Beskrivelse</h4>
                          <p className="text-sm text-gray-700">{entry.action_description}</p>
                        </div>
                      )}

                      {/* Changes */}
                      {entry.changes && Object.keys(entry.changes).length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-gray-500 mb-2">Ændringer</h4>
                          <div className="rounded border overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-100">
                                  <th className="text-left px-3 py-1.5 text-xs font-medium text-gray-500">Felt</th>
                                  <th className="text-left px-3 py-1.5 text-xs font-medium text-gray-500">Før</th>
                                  <th className="text-left px-3 py-1.5 text-xs font-medium text-gray-500">Efter</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y bg-white">
                                {Object.entries(entry.changes).map(([field, change]) => (
                                  <tr key={field}>
                                    <td className="px-3 py-1.5 font-medium text-gray-900">{field}</td>
                                    <td className="px-3 py-1.5 text-red-600">
                                      <code className="bg-red-50 px-1 py-0.5 rounded text-xs">
                                        {String(change.old ?? '—')}
                                      </code>
                                    </td>
                                    <td className="px-3 py-1.5 text-green-600">
                                      <code className="bg-green-50 px-1 py-0.5 rounded text-xs">
                                        {String(change.new ?? '—')}
                                      </code>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Metadata */}
                      {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-gray-500 mb-1">Metadata</h4>
                          <pre className="text-xs bg-white border rounded p-2 overflow-x-auto text-gray-700">
                            {JSON.stringify(entry.metadata, null, 2)}
                          </pre>
                        </div>
                      )}

                      {/* Technical Info */}
                      <div className="flex flex-wrap gap-4 text-xs text-gray-400 pt-2 border-t">
                        <span>ID: {entry.id}</span>
                        {entry.entity_id && <span>Entitet ID: {entry.entity_id}</span>}
                        {entry.user_id && <span>Bruger ID: {entry.user_id}</span>}
                        {entry.ip_address && <span>IP: {entry.ip_address}</span>}
                        <span>{formatDateTimeDK(entry.created_at)}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
                <div className="text-sm text-gray-500">
                  Side {filters.page} af {totalPages} ({total} poster)
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateFilter('page', Math.max(1, (filters.page || 1) - 1))}
                    disabled={filters.page === 1}
                    className="p-1.5 rounded border bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  {/* Page numbers */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const currentPage = filters.page || 1
                    let pageNum: number
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (currentPage <= 3) {
                      pageNum = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = currentPage - 2 + i
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => updateFilter('page', pageNum)}
                        className={`px-3 py-1.5 rounded border text-sm ${
                          pageNum === currentPage
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  })}

                  <button
                    onClick={() => updateFilter('page', Math.min(totalPages, (filters.page || 1) + 1))}
                    disabled={filters.page === totalPages}
                    className="p-1.5 rounded border bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
