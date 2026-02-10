'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatSmartDate } from '@/lib/utils/format'
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  Mail,
  Phone,
  Loader2,
} from 'lucide-react'
import { LeadStatusBadge } from './lead-status-badge'
import { LeadForm } from './lead-form'
import { SortableHeader } from '@/components/shared/sortable-header'
import { EmptyState } from '@/components/shared/empty-state'
import { useConfirm } from '@/components/shared/confirm-dialog'
import { deleteLead, updateLeadStatus } from '@/lib/actions/leads'
import { useToast } from '@/components/ui/toast'
import { LEAD_SOURCE_LABELS, LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadWithRelations, type LeadStatus } from '@/types/leads.types'

interface LeadsTableProps {
  leads: LeadWithRelations[]
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  onSort?: (column: string) => void
  filtered?: boolean
  onClearFilters?: () => void
}

export function LeadsTable({ leads, sortBy, sortOrder, onSort, filtered, onClearFilters }: LeadsTableProps) {
  const router = useRouter()
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [editingLead, setEditingLead] = useState<LeadWithRelations | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBulkActing, setIsBulkActing] = useState(false)

  const allSelected = leads.length > 0 && selectedIds.size === leads.length
  const someSelected = selectedIds.size > 0

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(leads.map((l) => l.id)))
    }
  }

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleBulkDelete = async () => {
    const ok = await confirm({
      title: 'Slet leads',
      description: `Er du sikker på, at du vil slette ${selectedIds.size} leads? Dette kan ikke fortrydes.`,
      confirmLabel: 'Slet alle',
    })
    if (!ok) return
    setIsBulkActing(true)
    await Promise.allSettled(Array.from(selectedIds).map((id) => deleteLead(id)))
    toast.success(`${selectedIds.size} leads slettet`)
    setSelectedIds(new Set())
    setIsBulkActing(false)
    router.refresh()
  }

  const handleBulkStatusChange = async (status: LeadStatus) => {
    setIsBulkActing(true)
    await Promise.allSettled(Array.from(selectedIds).map((id) => updateLeadStatus(id, status)))
    toast.success(`${selectedIds.size} leads opdateret til ${LEAD_STATUS_LABELS[status]}`)
    setSelectedIds(new Set())
    setIsBulkActing(false)
    router.refresh()
  }

  const handleStatusChange = async (id: string, status: LeadStatus) => {
    const result = await updateLeadStatus(id, status)
    if (result.success) {
      toast.success(`Status ændret til ${LEAD_STATUS_LABELS[status]}`)
    } else {
      toast.error('Kunne ikke ændre status', result.error)
    }
    router.refresh()
  }

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Slet lead',
      description: 'Er du sikker på, at du vil slette denne lead? Dette kan ikke fortrydes.',
      confirmLabel: 'Slet',
    })
    if (!ok) return

    setDeletingId(id)
    const result = await deleteLead(id)

    if (result.success) {
      toast.success('Lead slettet')
    } else {
      toast.error('Kunne ikke slette lead', result.error)
    }

    setDeletingId(null)
    setOpenMenuId(null)
    router.refresh()
  }

  const formatValue = (value: number | null) => {
    if (value === null) return '-'
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
      maximumFractionDigits: 0,
    }).format(value)
  }

  if (leads.length === 0) {
    return (
      <EmptyState
        icon={Mail}
        title={filtered ? 'Ingen leads fundet' : 'Ingen leads endnu'}
        description={filtered ? 'Prøv at ændre dine søgekriterier.' : 'Kom i gang ved at oprette din første lead.'}
        filtered={filtered}
        onClearFilters={onClearFilters}
      />
    )
  }

  return (
    <>
      {/* Bulk Action Bar */}
      {someSelected && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-2 mb-2 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-primary flex items-center gap-2">
            {isBulkActing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {selectedIds.size} valgt
          </span>
          <div className="h-4 w-px bg-gray-300" />
          <select
            onChange={(e) => {
              if (e.target.value) handleBulkStatusChange(e.target.value as LeadStatus)
              e.target.value = ''
            }}
            disabled={isBulkActing}
            className="text-sm border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary"
            defaultValue=""
          >
            <option value="" disabled>Skift status...</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>
            ))}
          </select>
          <button
            onClick={handleBulkDelete}
            disabled={isBulkActing}
            className="text-sm text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
          >
            Slet valgte
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-gray-500 hover:text-gray-700 ml-auto"
          >
            Ryd valg
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="pl-4 pr-2 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                    aria-label="Vælg alle"
                  />
                </th>
                <SortableHeader label="Firma / Kontakt" column="company_name" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort || (() => {})} />
                <SortableHeader label="Status" column="status" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort || (() => {})} />
                <SortableHeader label="Kilde" column="source" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort || (() => {})} className="hidden md:table-cell" />
                <SortableHeader label="Værdi" column="value" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort || (() => {})} />
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                  Tildelt
                </th>
                <SortableHeader label="Oprettet" column="created_at" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort || (() => {})} className="hidden lg:table-cell" />
                <th className="relative px-6 py-3">
                  <span className="sr-only">Handlinger</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('input, button, a, [role="menu"]')) return
                    router.push(`/dashboard/leads/${lead.id}`)
                  }}
                  className={`hover:bg-gray-50 transition-colors cursor-pointer ${selectedIds.has(lead.id) ? 'bg-primary/5' : ''}`}
                >
                  <td className="pl-4 pr-2 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(lead.id)}
                      onChange={() => toggleOne(lead.id)}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                      aria-label={`Vælg ${lead.company_name}`}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <Link
                        href={`/dashboard/leads/${lead.id}`}
                        className="font-medium text-gray-900 hover:text-primary"
                      >
                        {lead.company_name}
                      </Link>
                      <div className="text-sm text-gray-500">
                        {lead.contact_person}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {lead.email}
                        </span>
                        {lead.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {lead.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <LeadStatusBadge
                      status={lead.status}
                      onStatusChange={(newStatus) => handleStatusChange(lead.id, newStatus)}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden md:table-cell">
                    {LEAD_SOURCE_LABELS[lead.source]}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {formatValue(lead.value)}
                    </div>
                    {lead.probability !== null && (
                      <div className="text-xs text-gray-500">
                        {lead.probability}% sandsynlighed
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden lg:table-cell">
                    {lead.assigned_to_profile?.full_name ||
                      lead.assigned_to_profile?.email ||
                      '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden lg:table-cell">
                    {formatSmartDate(lead.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="relative">
                      <button
                        onClick={() =>
                          setOpenMenuId(openMenuId === lead.id ? null : lead.id)
                        }
                        className="p-1 hover:bg-gray-100 rounded-full"
                        aria-label="Flere handlinger"
                      >
                        <MoreHorizontal className="w-5 h-5 text-gray-400" />
                      </button>

                      {openMenuId === lead.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setOpenMenuId(null)}
                          />
                          <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg border z-20">
                            <div className="py-1">
                              <Link
                                href={`/dashboard/leads/${lead.id}`}
                                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                onClick={() => setOpenMenuId(null)}
                              >
                                <Eye className="w-4 h-4" />
                                Se detaljer
                              </Link>
                              <button
                                onClick={() => {
                                  setEditingLead(lead)
                                  setOpenMenuId(null)
                                }}
                                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <Pencil className="w-4 h-4" />
                                Rediger
                              </button>
                              <button
                                onClick={() => handleDelete(lead.id)}
                                disabled={deletingId === lead.id}
                                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                              >
                                <Trash2 className="w-4 h-4" />
                                {deletingId === lead.id
                                  ? 'Sletter...'
                                  : 'Slet'}
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingLead && (
        <LeadForm
          lead={editingLead}
          onClose={() => setEditingLead(null)}
          onSuccess={() => router.refresh()}
        />
      )}
      {ConfirmDialog}
    </>
  )
}
