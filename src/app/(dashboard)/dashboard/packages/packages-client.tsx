'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Plus,
  Search,
  Package,
  Clock,
  TrendingUp,
  MoreVertical,
  Copy,
  Trash2,
  Pencil,
  Filter,
} from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { Pagination } from '@/components/shared/pagination'
import type { PackageSummary, PackageCategory } from '@/types/packages.types'
import type { PaginatedResponse } from '@/types/common.types'
import { createPackage, deletePackage, copyPackage } from '@/lib/actions/packages'
import { formatCurrency } from '@/lib/utils/format'

interface PackagesClientProps {
  initialPackages: PaginatedResponse<PackageSummary> | null
  categories: PackageCategory[]
  initialFilters: {
    search: string
    category_id: string
  }
}

export default function PackagesClient({
  initialPackages,
  categories,
  initialFilters,
}: PackagesClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { success, error } = useToast()
  const [isPending, startTransition] = useTransition()

  const packages = initialPackages?.data || []
  const total = initialPackages?.total || 0
  const page = initialPackages?.page || 1
  const totalPages = initialPackages?.totalPages || 1
  const pageSize = initialPackages?.pageSize || 24

  const [search, setSearch] = useState(initialFilters.search)
  const [categoryFilter, setCategoryFilter] = useState(initialFilters.category_id)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  const handleSearch = () => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (categoryFilter) params.set('category_id', categoryFilter)
    router.push(`/dashboard/packages?${params.toString()}`)
  }

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString())
    if (newPage > 1) params.set('page', newPage.toString())
    else params.delete('page')
    router.push(`/dashboard/packages?${params.toString()}`)
  }

  const handlePageSizeChange = (newSize: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('pageSize', newSize.toString())
    params.delete('page')
    router.push(`/dashboard/packages?${params.toString()}`)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Er du sikker på at du vil slette pakken "${name}"?`)) return

    startTransition(async () => {
      const result = await deletePackage(id)
      if (result.success) {
        success('Pakke slettet')
        router.refresh()
      } else {
        error(result.error || 'Kunne ikke slette pakke')
      }
    })
  }

  const handleCopy = async (id: string, name: string) => {
    startTransition(async () => {
      const result = await copyPackage(id, `${name} (Kopi)`)
      if (result.success && result.data) {
        success('Pakke kopieret')
        router.push(`/dashboard/packages/${result.data.id}`)
      } else {
        error(result.error || 'Kunne ikke kopiere pakke')
      }
    })
  }

  const formatTime = (minutes: number) => {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h > 0) return `${h}t ${m}m`
    return `${m}m`
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pakker</h1>
          <p className="text-muted-foreground">
            Opret og administrer genanvendelige pakker ({total} pakker)
          </p>
        </div>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          Ny pakke
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Søg efter pakker..."
            className="w-full pl-10 pr-4 py-2 border rounded-md"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value)
            const params = new URLSearchParams()
            if (search) params.set('search', search)
            if (e.target.value) params.set('category_id', e.target.value)
            router.push(`/dashboard/packages?${params.toString()}`)
          }}
          className="px-3 py-2 border rounded-md min-w-[150px]"
        >
          <option value="">Alle kategorier</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80"
        >
          <Filter className="w-4 h-4" />
        </button>
      </div>

      {/* Package Grid */}
      {packages.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/50">
          <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Ingen pakker endnu</h3>
          <p className="text-muted-foreground mb-4">
            Opret din første pakke for at komme i gang
          </p>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Opret pakke
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className="border rounded-lg p-4 hover:border-primary/50 transition-colors bg-white relative group"
            >
              {/* Menu */}
              <div className="absolute top-3 right-3">
                <button
                  onClick={() => setMenuOpen(menuOpen === pkg.id ? null : pkg.id)}
                  className="p-1 hover:bg-muted rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {menuOpen === pkg.id && (
                  <div className="absolute right-0 top-8 bg-white border rounded-md shadow-lg py-1 min-w-[140px] z-10">
                    <Link
                      href={`/dashboard/packages/${pkg.id}`}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-muted text-sm"
                    >
                      <Pencil className="w-4 h-4" />
                      Rediger
                    </Link>
                    <button
                      onClick={() => {
                        setMenuOpen(null)
                        handleCopy(pkg.id, pkg.name)
                      }}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-muted text-sm w-full"
                    >
                      <Copy className="w-4 h-4" />
                      Kopier
                    </button>
                    <button
                      onClick={() => {
                        setMenuOpen(null)
                        handleDelete(pkg.id, pkg.name)
                      }}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-muted text-sm w-full text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                      Slet
                    </button>
                  </div>
                )}
              </div>

              <Link href={`/dashboard/packages/${pkg.id}`}>
                <div className="space-y-3">
                  {/* Header */}
                  <div>
                    {pkg.code && (
                      <span className="text-xs text-muted-foreground font-mono">
                        {pkg.code}
                      </span>
                    )}
                    <h3 className="font-semibold">{pkg.name}</h3>
                    {pkg.category_name && (
                      <span className="text-xs bg-muted px-2 py-0.5 rounded">
                        {pkg.category_name}
                      </span>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Package className="w-4 h-4" />
                      {pkg.item_count} elementer
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      {formatTime(pkg.total_time_minutes)}
                    </div>
                  </div>

                  {/* Financials */}
                  <div className="pt-3 border-t space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Kostpris</span>
                      <span>{formatCurrency(pkg.total_cost_price)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Salgspris</span>
                      <span className="font-medium">{formatCurrency(pkg.total_sale_price)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        DB
                      </span>
                      <span className={pkg.db_percentage >= 30 ? 'text-green-600' : pkg.db_percentage >= 20 ? 'text-amber-600' : 'text-red-600'}>
                        {formatCurrency(pkg.db_amount)} ({pkg.db_percentage.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="bg-white rounded-lg border p-4">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={total}
            pageSize={pageSize}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
      )}

      {/* Create Dialog */}
      {showCreateDialog && (
        <CreatePackageDialog
          categories={categories}
          onClose={() => setShowCreateDialog(false)}
          onCreated={(pkg) => {
            setShowCreateDialog(false)
            router.push(`/dashboard/packages/${pkg.id}`)
          }}
        />
      )}
    </div>
  )
}

// Create Package Dialog Component
function CreatePackageDialog({
  categories,
  onClose,
  onCreated,
}: {
  categories: PackageCategory[]
  onClose: () => void
  onCreated: (pkg: { id: string }) => void
}) {
  const { success, error } = useToast()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [categoryId, setCategoryId] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    startTransition(async () => {
      const result = await createPackage({
        name: name.trim(),
        code: code.trim() || undefined,
        category_id: categoryId || undefined,
      })

      if (result.success && result.data) {
        success('Pakke oprettet')
        onCreated(result.data)
      } else {
        error(result.error || 'Kunne ikke oprette pakke')
      }
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Ny pakke</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Navn *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="F.eks. Stikkontakt installation"
              className="w-full px-3 py-2 border rounded-md"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Kode</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="F.eks. PKG-STIK-001"
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Kategori</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
            >
              <option value="">Vælg kategori...</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-md hover:bg-muted"
              disabled={isPending}
            >
              Annuller
            </button>
            <button
              type="submit"
              disabled={isPending || !name.trim()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? 'Opretter...' : 'Opret pakke'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
