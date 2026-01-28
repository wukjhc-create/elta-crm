'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Search, Filter, X } from 'lucide-react'
import { getProjects } from '@/lib/actions/projects'
import { ProjectsTable } from './projects-table'
import { ProjectForm } from './project-form'
import { ProjectStatusBadge } from './project-status-badge'
import { Pagination } from '@/components/shared/pagination'
import {
  PROJECT_STATUSES,
  PROJECT_PRIORITIES,
  PROJECT_STATUS_LABELS,
  PROJECT_PRIORITY_LABELS,
  type ProjectWithRelations,
  type ProjectStatus,
  type ProjectPriority,
} from '@/types/projects.types'

interface PaginationData {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
}

export function ProjectsPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [projects, setProjects] = useState<ProjectWithRelations[]>([])
  const [pagination, setPagination] = useState<PaginationData>({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    pageSize: 25,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  // Filter state from URL params
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | ''>(
    (searchParams.get('status') as ProjectStatus) || ''
  )
  const [priorityFilter, setPriorityFilter] = useState<ProjectPriority | ''>(
    (searchParams.get('priority') as ProjectPriority) || ''
  )
  const [currentPage, setCurrentPage] = useState(
    parseInt(searchParams.get('page') || '1', 10)
  )
  const [pageSize, setPageSize] = useState(
    parseInt(searchParams.get('pageSize') || '25', 10)
  )

  const loadProjects = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await getProjects({
        search: search || undefined,
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        page: currentPage,
        pageSize: pageSize,
      })

      if (result.success && result.data) {
        setProjects(result.data.data)
        setPagination({
          currentPage: result.data.page,
          totalPages: result.data.totalPages,
          totalItems: result.data.total,
          pageSize: result.data.pageSize,
        })
      } else {
        setError(result.error || 'Kunne ikke hente projekter')
      }
    } catch (err) {
      console.error('Failed to load projects:', err)
      setError('Der opstod en fejl ved hentning af projekter')
    } finally {
      setIsLoading(false)
    }
  }, [search, statusFilter, priorityFilter, currentPage, pageSize])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  // Update URL params when filters change
  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (statusFilter) params.set('status', statusFilter)
    if (priorityFilter) params.set('priority', priorityFilter)
    if (currentPage > 1) params.set('page', currentPage.toString())
    if (pageSize !== 25) params.set('pageSize', pageSize.toString())

    const newUrl = params.toString() ? `?${params.toString()}` : '/dashboard/projects'
    router.replace(newUrl, { scroll: false })
  }, [search, statusFilter, priorityFilter, currentPage, pageSize, router])

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('')
    setPriorityFilter('')
    setCurrentPage(1)
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handlePageSizeChange = (size: number) => {
    setPageSize(size)
    setCurrentPage(1)
  }

  const handleStatusClick = (status: ProjectStatus) => {
    setStatusFilter(statusFilter === status ? '' : status)
    setCurrentPage(1)
  }

  const hasActiveFilters = search || statusFilter || priorityFilter

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Projekter</h1>
          <p className="text-muted-foreground">
            Administrer projekter, opgaver og tidsregistrering ({pagination.totalItems} projekter)
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          Nyt Projekt
        </button>
      </div>

      {/* Status Summary */}
      <div className="flex flex-wrap gap-2">
        {PROJECT_STATUSES.map((status) => (
          <button
            key={status}
            onClick={() => handleStatusClick(status)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors ${
              statusFilter === status
                ? 'ring-2 ring-primary ring-offset-1'
                : 'hover:opacity-80'
            }`}
          >
            <ProjectStatusBadge status={status} />
          </button>
        ))}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Søg efter projektnummer, navn eller kunde..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setCurrentPage(1)
            }}
            className="w-full pl-10 pr-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-muted ${
            hasActiveFilters ? 'border-primary text-primary' : ''
          }`}
        >
          <Filter className="w-4 h-4" />
          Filtre
          {hasActiveFilters && (
            <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
              {[search, statusFilter, priorityFilter].filter(Boolean).length}
            </span>
          )}
        </button>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-2 px-4 py-2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
            Ryd filtre
          </button>
        )}
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="p-4 bg-muted/50 rounded-lg space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as ProjectStatus | '')
                  setCurrentPage(1)
                }}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Alle statusser</option>
                {PROJECT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {PROJECT_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Prioritet</label>
              <select
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value as ProjectPriority | '')
                  setCurrentPage(1)
                }}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Alle prioriteter</option>
                {PROJECT_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {PROJECT_PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Projects Table */}
      <div className="bg-white border rounded-lg p-4">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            Indlæser projekter...
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={loadProjects}
              className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
            >
              Prøv igen
            </button>
          </div>
        ) : (
          <ProjectsTable projects={projects} onRefresh={loadProjects} />
        )}
      </div>

      {/* Pagination */}
      <div className="bg-white rounded-lg border p-4">
        <Pagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          pageSize={pagination.pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>

      {/* Project Form Modal */}
      {showForm && (
        <ProjectForm
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false)
            loadProjects()
          }}
        />
      )}
    </div>
  )
}
