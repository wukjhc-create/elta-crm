'use client'

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Search, X, LayoutGrid, List } from 'lucide-react'
import { LeadForm } from './lead-form'
import { LeadsTable } from './leads-table'
import { LeadsKanban } from './leads-kanban'
import { Pagination } from '@/components/shared/pagination'
import { ExportButton } from '@/components/shared/export-button'
import type { LeadWithRelations, LeadStatus, LeadSource } from '@/types/leads.types'
import { LEAD_STATUS_LABELS, LEAD_STATUSES, LEAD_SOURCE_LABELS, LEAD_SOURCES } from '@/types/leads.types'

interface PaginationData {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
}

interface Filters {
  search?: string
  status?: LeadStatus
  source?: LeadSource
}

interface SortData {
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

interface LeadsPageClientProps {
  leads: LeadWithRelations[]
  pagination: PaginationData
  filters: Filters
  sort?: SortData
  initialView?: 'table' | 'kanban'
}

export function LeadsPageClient({ leads, pagination, filters, sort, initialView }: LeadsPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showForm, setShowForm] = useState(false)
  const [searchInput, setSearchInput] = useState(filters.search || '')
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>(initialView || 'table')

  const switchView = (mode: 'table' | 'kanban') => {
    setViewMode(mode)
    updateURL({ view: mode === 'kanban' ? 'kanban' : undefined, page: undefined })
  }

  const updateURL = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString())

      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === '') {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      })

      // Reset to page 1 when filters change (except when changing page)
      if (!updates.page && !params.has('page')) {
        params.delete('page')
      } else if (updates.search !== undefined || updates.status !== undefined || updates.source !== undefined) {
        params.delete('page')
      }

      router.push(`/dashboard/leads?${params.toString()}`)
    },
    [router, searchParams]
  )

  const handleSearch = () => {
    updateURL({ search: searchInput || undefined })
  }

  const handleClearSearch = () => {
    setSearchInput('')
    updateURL({ search: undefined })
  }

  const handlePageChange = (page: number) => {
    updateURL({ page: page.toString() })
  }

  const handlePageSizeChange = (pageSize: number) => {
    updateURL({ pageSize: pageSize.toString(), page: '1' })
  }

  const handleStatusFilter = (value: string) => {
    updateURL({ status: value || undefined })
  }

  const handleSourceFilter = (value: string) => {
    updateURL({ source: value || undefined })
  }

  const handleSort = (column: string) => {
    const newOrder = sort?.sortBy === column && sort?.sortOrder === 'asc' ? 'desc' : 'asc'
    updateURL({ sortBy: column, sortOrder: newOrder })
  }

  const clearAllFilters = () => {
    setSearchInput('')
    router.push('/dashboard/leads')
  }

  const hasActiveFilters = filters.search || filters.status || filters.source

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Leads</h1>
            <p className="text-gray-600 mt-1">
              Administrer og følg dine salgsmuligheder ({pagination.totalItems} leads)
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="inline-flex border rounded-md overflow-hidden">
              <button
                onClick={() => switchView('table')}
                className={`p-2 ${viewMode === 'table' ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                aria-label="Tabelvisning"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => switchView('kanban')}
                className={`p-2 ${viewMode === 'kanban' ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                aria-label="Kanban-visning"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
            <ExportButton type="leads" filters={{ search: filters.search, status: filters.status, source: filters.source }} />
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 font-medium"
            >
              <Plus className="w-4 h-4" />
              Ny Lead
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Søg efter firma, kontaktperson, email..."
                  className="w-full pl-10 pr-10 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {searchInput && (
                  <button
                    onClick={handleClearSearch}
                    aria-label="Ryd søgning"
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                Søg
              </button>
            </div>

            {/* Status filter */}
            <select
              value={filters.status || ''}
              onChange={(e) => handleStatusFilter(e.target.value)}
              className="border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Alle statuser</option>
              {LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {LEAD_STATUS_LABELS[status]}
                </option>
              ))}
            </select>

            {/* Source filter */}
            <select
              value={filters.source || ''}
              onChange={(e) => handleSourceFilter(e.target.value)}
              className="border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Alle kilder</option>
              {LEAD_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {LEAD_SOURCE_LABELS[source]}
                </option>
              ))}
            </select>
          </div>

          {/* Active filters display */}
          {hasActiveFilters && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t">
              <span className="text-sm text-gray-500">Aktive filtre:</span>
              {filters.search && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-sm">
                  Søgning: {filters.search}
                  <button onClick={handleClearSearch} aria-label="Ryd søgefilter" className="hover:text-red-600">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {filters.status && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-sm">
                  Status: {LEAD_STATUS_LABELS[filters.status]}
                  <button onClick={() => handleStatusFilter('')} className="hover:text-red-600">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {filters.source && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-sm">
                  Kilde: {LEAD_SOURCE_LABELS[filters.source]}
                  <button onClick={() => handleSourceFilter('')} className="hover:text-red-600">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              <button
                onClick={clearAllFilters}
                className="text-sm text-red-600 hover:text-red-800 ml-2"
              >
                Ryd alle
              </button>
            </div>
          )}
        </div>

        {viewMode === 'table' ? (
          <>
            <LeadsTable
              leads={leads}
              sortBy={sort?.sortBy}
              sortOrder={sort?.sortOrder}
              onSort={handleSort}
              filtered={!!hasActiveFilters}
              onClearFilters={clearAllFilters}
            />

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
          </>
        ) : (
          <LeadsKanban leads={leads} />
        )}
      </div>

      {showForm && <LeadForm onClose={() => setShowForm(false)} />}
    </>
  )
}
