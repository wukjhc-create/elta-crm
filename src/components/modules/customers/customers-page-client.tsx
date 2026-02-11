'use client'

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Search, X } from 'lucide-react'
import { CustomerForm } from './customer-form'
import { CustomersTable } from './customers-table'
import { Pagination } from '@/components/shared/pagination'
import { ExportButton } from '@/components/shared/export-button'
import type { CustomerWithRelations } from '@/types/customers.types'

interface PaginationData {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
}

interface Filters {
  search?: string
  is_active?: boolean
}

interface SortData {
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

interface CustomersPageClientProps {
  customers: CustomerWithRelations[]
  pagination: PaginationData
  filters: Filters
  sort?: SortData
}

export function CustomersPageClient({ customers, pagination, filters, sort }: CustomersPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showForm, setShowForm] = useState(false)
  const [searchInput, setSearchInput] = useState(filters.search || '')

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
      } else if (updates.search !== undefined || updates.is_active !== undefined) {
        params.delete('page')
      }

      router.push(`/dashboard/customers?${params.toString()}`)
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
    updateURL({ is_active: value || undefined })
  }

  const handleSort = (column: string) => {
    const newOrder = sort?.sortBy === column && sort?.sortOrder === 'asc' ? 'desc' : 'asc'
    updateURL({ sortBy: column, sortOrder: newOrder })
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Kunder</h1>
            <p className="text-gray-600 mt-1">
              Administrer din kundebase ({pagination.totalItems} kunder)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ExportButton type="customers" filters={{ search: filters.search, is_active: filters.is_active }} />
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 font-medium"
            >
              <Plus className="w-4 h-4" />
              Ny Kunde
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Søg efter navn, email, kundenummer..."
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
              value={filters.is_active === true ? 'true' : filters.is_active === false ? 'false' : ''}
              onChange={(e) => handleStatusFilter(e.target.value)}
              className="border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Alle statuser</option>
              <option value="true">Aktive</option>
              <option value="false">Inaktive</option>
            </select>
          </div>

          {/* Active filters display */}
          {(filters.search || filters.is_active !== undefined) && (
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
              {filters.is_active !== undefined && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-sm">
                  Status: {filters.is_active ? 'Aktiv' : 'Inaktiv'}
                  <button onClick={() => handleStatusFilter('')} className="hover:text-red-600">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        <CustomersTable
          customers={customers}
          sortBy={sort?.sortBy}
          sortOrder={sort?.sortOrder}
          onSort={handleSort}
          filtered={!!(filters.search || filters.is_active !== undefined)}
          onClearFilters={() => { setSearchInput(''); router.push('/dashboard/customers') }}
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
      </div>

      {showForm && <CustomerForm onClose={() => setShowForm(false)} />}
    </>
  )
}
