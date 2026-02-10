'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Search, X } from 'lucide-react'
import { OfferForm } from './offer-form'
import { OffersTable } from './offers-table'
import { Pagination } from '@/components/shared/pagination'
import { ExportButton } from '@/components/shared/export-button'
import type { OfferWithRelations, OfferStatus } from '@/types/offers.types'
import { OFFER_STATUS_LABELS, OFFER_STATUSES } from '@/types/offers.types'
import type { CompanySettings } from '@/types/company-settings.types'

interface CalculatorData {
  systemSize?: number
  panelCount?: number
  totalPrice?: number
}

interface PaginationData {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
}

interface Filters {
  search?: string
  status?: OfferStatus
}

interface SortData {
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

interface OffersPageClientProps {
  offers: OfferWithRelations[]
  pagination: PaginationData
  filters: Filters
  sort?: SortData
  companySettings?: CompanySettings | null
}

export function OffersPageClient({ offers, pagination, filters, sort, companySettings }: OffersPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showForm, setShowForm] = useState(false)
  const [searchInput, setSearchInput] = useState(filters.search || '')
  const [calculatorData, setCalculatorData] = useState<CalculatorData | null>(null)

  // Check for create=true from calculator redirect
  useEffect(() => {
    const createParam = searchParams.get('create')
    if (createParam === 'true') {
      // Parse calculator data from URL
      const systemSize = searchParams.get('systemSize')
      const panelCount = searchParams.get('panelCount')
      const totalPrice = searchParams.get('totalPrice')

      if (systemSize || panelCount || totalPrice) {
        setCalculatorData({
          systemSize: systemSize ? parseFloat(systemSize) : undefined,
          panelCount: panelCount ? parseInt(panelCount, 10) : undefined,
          totalPrice: totalPrice ? parseFloat(totalPrice) : undefined,
        })
      }

      setShowForm(true)

      // Clean up URL to remove create params
      const params = new URLSearchParams(searchParams.toString())
      params.delete('create')
      params.delete('systemSize')
      params.delete('panelCount')
      params.delete('totalPrice')
      const newUrl = params.toString() ? `/dashboard/offers?${params.toString()}` : '/dashboard/offers'
      router.replace(newUrl)
    }
  }, [searchParams, router])

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

      // Reset to page 1 when filters change
      if (updates.search !== undefined || updates.status !== undefined) {
        params.delete('page')
      }

      router.push(`/dashboard/offers?${params.toString()}`)
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

  const handleSort = (column: string) => {
    const newOrder = sort?.sortBy === column && sort?.sortOrder === 'asc' ? 'desc' : 'asc'
    updateURL({ sortBy: column, sortOrder: newOrder })
  }

  const clearAllFilters = () => {
    setSearchInput('')
    router.push('/dashboard/offers')
  }

  const hasActiveFilters = filters.search || filters.status

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Tilbud</h1>
            <p className="text-gray-600 mt-1">
              Opret og administrer salgstilbud ({pagination.totalItems} tilbud)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ExportButton type="offers" filters={{ search: filters.search, status: filters.status }} />
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 font-medium"
            >
              <Plus className="w-4 h-4" />
              Nyt Tilbud
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
                  placeholder="Søg efter titel, tilbudsnummer..."
                  className="w-full pl-10 pr-10 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {searchInput && (
                  <button
                    onClick={handleClearSearch}
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
              {OFFER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {OFFER_STATUS_LABELS[status]}
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
                  <button onClick={handleClearSearch} className="hover:text-red-600">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {filters.status && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-sm">
                  Status: {OFFER_STATUS_LABELS[filters.status]}
                  <button onClick={() => handleStatusFilter('')} className="hover:text-red-600">
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

        <OffersTable offers={offers} companySettings={companySettings} sortBy={sort?.sortBy} sortOrder={sort?.sortOrder} onSort={handleSort} />

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

      {showForm && (
        <OfferForm
          companySettings={companySettings}
          calculatorData={calculatorData}
          onClose={() => {
            setShowForm(false)
            setCalculatorData(null)
          }}
        />
      )}
    </>
  )
}
