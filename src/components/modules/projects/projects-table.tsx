'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  Calendar,
  Clock,
  User,
  Building2,
  Loader2,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { deleteProject, updateProjectStatus } from '@/lib/actions/projects'
import { ProjectStatusBadge, ProjectPriorityBadge } from './project-status-badge'
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, type ProjectStatus } from '@/types/projects.types'
import { SortableHeader } from '@/components/shared/sortable-header'
import { EmptyState } from '@/components/shared/empty-state'
import { useConfirm } from '@/components/shared/confirm-dialog'
import { ProjectForm } from './project-form'
import { useToast } from '@/components/ui/toast'
import type { ProjectWithRelations } from '@/types/projects.types'

interface ProjectsTableProps {
  projects: ProjectWithRelations[]
  onRefresh?: () => void
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  onSort?: (column: string) => void
  filtered?: boolean
  onClearFilters?: () => void
}

export function ProjectsTable({ projects, onRefresh, sortBy, sortOrder, onSort, filtered, onClearFilters }: ProjectsTableProps) {
  const router = useRouter()
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [editingProject, setEditingProject] = useState<ProjectWithRelations | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBulkActing, setIsBulkActing] = useState(false)

  const allSelected = projects.length > 0 && selectedIds.size === projects.length
  const someSelected = selectedIds.size > 0

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(projects.map((p) => p.id)))
  }

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkDelete = async () => {
    const ok = await confirm({
      title: 'Slet projekter',
      description: `Er du sikker på, at du vil slette ${selectedIds.size} projekter? Alle opgaver og tidsregistreringer slettes også.`,
      confirmLabel: 'Slet alle',
    })
    if (!ok) return
    setIsBulkActing(true)
    await Promise.allSettled(Array.from(selectedIds).map((id) => deleteProject(id)))
    toast.success(`${selectedIds.size} projekter slettet`)
    setSelectedIds(new Set())
    setIsBulkActing(false)
    onRefresh?.()
  }

  const handleBulkStatusChange = async (status: ProjectStatus) => {
    setIsBulkActing(true)
    await Promise.allSettled(Array.from(selectedIds).map((id) => updateProjectStatus(id, status)))
    toast.success(`${selectedIds.size} projekter opdateret til ${PROJECT_STATUS_LABELS[status]}`)
    setSelectedIds(new Set())
    setIsBulkActing(false)
    onRefresh?.()
  }

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Slet projekt',
      description: 'Er du sikker på at du vil slette dette projekt? Alle opgaver og tidsregistreringer slettes også.',
      confirmLabel: 'Slet',
    })
    if (!ok) return

    setDeletingId(id)
    try {
      const result = await deleteProject(id)
      if (result.success) {
        toast.success('Projekt slettet')
      } else {
        toast.error('Kunne ikke slette projekt', result.error)
      }
      onRefresh?.()
    } catch (error) {
      console.error('Delete error:', error)
      toast.error('Der opstod en fejl ved sletning')
    } finally {
      setDeletingId(null)
    }
  }

  const handleStatusChange = async (id: string, status: ProjectStatus) => {
    const result = await updateProjectStatus(id, status)
    if (result.success) {
      toast.success(`Status ændret til ${PROJECT_STATUS_LABELS[status]}`)
    } else {
      toast.error('Kunne ikke ændre status', result.error)
    }
    onRefresh?.()
  }

  const formatHours = (hours: number | null) => {
    if (hours === null || hours === undefined) return '-'
    return `${hours}t`
  }

  const formatBudget = (amount: number | null) => {
    if (amount === null || amount === undefined) return '-'
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const calculateProgress = (actual: number, estimated: number | null) => {
    if (!estimated || estimated === 0) return null
    return Math.round((actual / estimated) * 100)
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title={filtered ? 'Ingen projekter fundet' : 'Ingen projekter endnu'}
        description={filtered ? 'Prøv at ændre dine søgekriterier.' : 'Opret dit første projekt for at komme i gang.'}
        filtered={filtered}
        onClearFilters={onClearFilters}
      />
    )
  }

  return (
    <>
      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg mb-4">
          <span className="text-sm font-medium text-blue-800 flex items-center gap-2">
            {isBulkActing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {selectedIds.size} valgt
          </span>
          <div className="flex gap-2 ml-auto">
            {PROJECT_STATUSES.map((status) => (
              <button
                key={status}
                onClick={() => handleBulkStatusChange(status)}
                disabled={isBulkActing}
                className="px-3 py-1 text-xs font-medium border rounded-md hover:bg-white disabled:opacity-50"
              >
                {PROJECT_STATUS_LABELS[status]}
              </button>
            ))}
            <button
              onClick={handleBulkDelete}
              disabled={isBulkActing}
              className="px-3 py-1 text-xs font-medium text-red-600 border border-red-300 rounded-md hover:bg-red-50 disabled:opacity-50"
            >
              Slet
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr className="border-b text-left text-sm text-muted-foreground">
              <th className="pb-3 w-10 pl-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-gray-300"
                  aria-label="Vælg alle"
                />
              </th>
              <SortableHeader label="Projekt" column="project_number" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort || (() => {})} className="pb-3 font-medium text-sm text-muted-foreground normal-case tracking-normal" />
              <SortableHeader label="Kunde" column="customer_id" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort || (() => {})} className="pb-3 font-medium text-sm text-muted-foreground normal-case tracking-normal" />
              <SortableHeader label="Status" column="status" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort || (() => {})} className="pb-3 font-medium text-sm text-muted-foreground normal-case tracking-normal" />
              <SortableHeader label="Prioritet" column="priority" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort || (() => {})} className="pb-3 font-medium text-sm text-muted-foreground normal-case tracking-normal hidden md:table-cell" />
              <SortableHeader label="Tidsplan" column="start_date" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort || (() => {})} className="pb-3 font-medium text-sm text-muted-foreground normal-case tracking-normal hidden lg:table-cell" />
              <SortableHeader label="Timer" column="actual_hours" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort || (() => {})} className="pb-3 font-medium text-sm text-muted-foreground normal-case tracking-normal hidden lg:table-cell" />
              <SortableHeader label="Budget" column="budget" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort || (() => {})} className="pb-3 font-medium text-sm text-muted-foreground normal-case tracking-normal hidden lg:table-cell" />
              <th className="pb-3 font-medium hidden xl:table-cell">Projektleder</th>
              <th className="pb-3 font-medium w-10"></th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => {
              const progress = calculateProgress(project.actual_hours, project.estimated_hours)
              const isOverBudget = project.budget && project.actual_cost > project.budget
              const isOverTime = progress !== null && progress > 100

              return (
                <tr
                  key={project.id}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('input, button, a, [role="menu"]')) return
                    router.push(`/dashboard/projects/${project.id}`)
                  }}
                  className="border-b hover:bg-muted/50 cursor-pointer"
                >
                  <td className="py-3 pl-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(project.id)}
                      onChange={() => toggleOne(project.id)}
                      className="rounded border-gray-300"
                      aria-label={`Vælg ${project.name}`}
                    />
                  </td>
                  <td className="py-3">
                    <Link
                      href={`/dashboard/projects/${project.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {project.project_number}
                    </Link>
                    <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                      {project.name}
                    </p>
                  </td>
                  <td className="py-3">
                    {project.customer ? (
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <Link
                            href={`/dashboard/customers/${project.customer.id}`}
                            className="text-sm hover:underline"
                          >
                            {project.customer.company_name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {project.customer.customer_number}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="py-3">
                    <ProjectStatusBadge
                      status={project.status}
                      onStatusChange={(newStatus) => handleStatusChange(project.id, newStatus)}
                    />
                  </td>
                  <td className="py-3 hidden md:table-cell">
                    <ProjectPriorityBadge priority={project.priority} />
                  </td>
                  <td className="py-3 hidden lg:table-cell">
                    <div className="flex items-center gap-1 text-sm">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span>
                        {project.start_date ? formatDate(project.start_date) : '-'}
                        {project.end_date && (
                          <>
                            {' → '}
                            {formatDate(project.end_date)}
                          </>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 hidden lg:table-cell">
                    <div className="flex items-center gap-1 text-sm">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className={isOverTime ? 'text-red-600 font-medium' : ''}>
                        {formatHours(project.actual_hours)}
                        {project.estimated_hours && (
                          <span className="text-muted-foreground">
                            {' / '}
                            {formatHours(project.estimated_hours)}
                          </span>
                        )}
                      </span>
                      {progress !== null && (
                        <span
                          className={`text-xs ml-1 ${
                            isOverTime ? 'text-red-600' : 'text-muted-foreground'
                          }`}
                        >
                          ({progress}%)
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 hidden lg:table-cell">
                    <div className="text-sm">
                      <span className={isOverBudget ? 'text-red-600 font-medium' : ''}>
                        {formatBudget(project.actual_cost)}
                      </span>
                      {project.budget && (
                        <span className="text-muted-foreground">
                          {' / '}
                          {formatBudget(project.budget)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 hidden xl:table-cell">
                    {project.project_manager ? (
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">
                          {project.project_manager.full_name || project.project_manager.email}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="py-3">
                    <div className="relative">
                      <button
                        onClick={() => setOpenMenuId(openMenuId === project.id ? null : project.id)}
                        className="p-1 hover:bg-muted rounded"
                        disabled={deletingId === project.id}
                        aria-label="Flere handlinger"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>

                      {openMenuId === project.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setOpenMenuId(null)}
                          />
                          <div className="absolute right-0 mt-1 w-48 bg-white border rounded-md shadow-lg z-20">
                            <Link
                              href={`/dashboard/projects/${project.id}`}
                              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                              onClick={() => setOpenMenuId(null)}
                            >
                              <Eye className="w-4 h-4" />
                              Se detaljer
                            </Link>
                            <button
                              onClick={() => {
                                setEditingProject(project)
                                setOpenMenuId(null)
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                            >
                              <Pencil className="w-4 h-4" />
                              Rediger
                            </button>
                            <button
                              onClick={() => {
                                handleDelete(project.id)
                                setOpenMenuId(null)
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                              disabled={deletingId === project.id}
                            >
                              <Trash2 className="w-4 h-4" />
                              {deletingId === project.id ? 'Sletter...' : 'Slet'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {editingProject && (
        <ProjectForm
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onSuccess={() => {
            setEditingProject(null)
            onRefresh?.()
          }}
        />
      )}
      {ConfirmDialog}
    </>
  )
}
