'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  Calendar,
  Clock,
  User,
  Building2,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { deleteProject } from '@/lib/actions/projects'
import { ProjectStatusBadge, ProjectPriorityBadge } from './project-status-badge'
import { SortableHeader } from '@/components/shared/sortable-header'
import { ProjectForm } from './project-form'
import { useToast } from '@/components/ui/toast'
import type { ProjectWithRelations } from '@/types/projects.types'

interface ProjectsTableProps {
  projects: ProjectWithRelations[]
  onRefresh?: () => void
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  onSort?: (column: string) => void
}

export function ProjectsTable({ projects, onRefresh, sortBy, sortOrder, onSort }: ProjectsTableProps) {
  const toast = useToast()
  const [editingProject, setEditingProject] = useState<ProjectWithRelations | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (!confirm('Er du sikker på at du vil slette dette projekt? Alle opgaver og tidsregistreringer slettes også.')) {
      return
    }

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
      <div className="text-center py-12 text-muted-foreground">
        <p>Ingen projekter fundet.</p>
        <p className="text-sm mt-1">Opret dit første projekt for at komme i gang.</p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b text-left text-sm text-muted-foreground">
              <SortableHeader label="Projekt" column="project_number" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort || (() => {})} className="pb-3 font-medium text-sm text-muted-foreground normal-case tracking-normal" />
              <SortableHeader label="Kunde" column="customer_id" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort || (() => {})} className="pb-3 font-medium text-sm text-muted-foreground normal-case tracking-normal" />
              <SortableHeader label="Status" column="status" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort || (() => {})} className="pb-3 font-medium text-sm text-muted-foreground normal-case tracking-normal" />
              <SortableHeader label="Prioritet" column="priority" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort || (() => {})} className="pb-3 font-medium text-sm text-muted-foreground normal-case tracking-normal" />
              <SortableHeader label="Tidsplan" column="start_date" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort || (() => {})} className="pb-3 font-medium text-sm text-muted-foreground normal-case tracking-normal" />
              <SortableHeader label="Timer" column="actual_hours" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort || (() => {})} className="pb-3 font-medium text-sm text-muted-foreground normal-case tracking-normal" />
              <SortableHeader label="Budget" column="budget" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort || (() => {})} className="pb-3 font-medium text-sm text-muted-foreground normal-case tracking-normal" />
              <th className="pb-3 font-medium">Projektleder</th>
              <th className="pb-3 font-medium w-10"></th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => {
              const progress = calculateProgress(project.actual_hours, project.estimated_hours)
              const isOverBudget = project.budget && project.actual_cost > project.budget
              const isOverTime = progress !== null && progress > 100

              return (
                <tr key={project.id} className="border-b hover:bg-muted/50">
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
                    <ProjectStatusBadge status={project.status} />
                  </td>
                  <td className="py-3">
                    <ProjectPriorityBadge priority={project.priority} />
                  </td>
                  <td className="py-3">
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
                  <td className="py-3">
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
                  <td className="py-3">
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
                  <td className="py-3">
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
    </>
  )
}
