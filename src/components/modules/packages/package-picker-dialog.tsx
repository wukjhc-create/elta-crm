'use client'

import { useState, useEffect } from 'react'
import {
  Search,
  Loader2,
  Package,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { getPackages } from '@/lib/actions/packages'
import type { PackageSummary } from '@/types/packages.types'

interface PackagePickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (packageId: string, packageName: string) => void
}

export function PackagePickerDialog({
  open,
  onOpenChange,
  onSelect,
}: PackagePickerDialogProps) {
  const [packages, setPackages] = useState<PackageSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (open) {
      loadPackages()
    }
  }, [open])

  const loadPackages = async (searchTerm?: string) => {
    setIsLoading(true)
    try {
      const result = await getPackages({
        is_active: true,
        search: searchTerm,
      })
      if (result.success && result.data) {
        setPackages(result.data.data)
      }
    } catch {
      // Failed to load
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearch = () => {
    loadPackages(search || undefined)
  }

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0 && mins > 0) return `${hours}t ${mins}m`
    if (hours > 0) return `${hours}t`
    return `${mins}m`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Vælg pakke
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Søg efter pakke..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button variant="outline" onClick={handleSearch} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </Button>
        </div>

        <div className="max-h-[400px] overflow-y-auto space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : packages.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              Ingen pakker fundet
            </p>
          ) : (
            packages.map(pkg => (
              <button
                key={pkg.id}
                onClick={() => onSelect(pkg.id, pkg.name)}
                className="w-full text-left border rounded-lg p-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-sm">{pkg.name}</p>
                    {pkg.code && (
                      <p className="text-xs text-gray-400">{pkg.code}</p>
                    )}
                    {pkg.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{pkg.description}</p>
                    )}
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {pkg.item_count} elementer
                      </Badge>
                      {pkg.category_name && (
                        <Badge variant="secondary" className="text-xs">
                          {pkg.category_name}
                        </Badge>
                      )}
                      {pkg.total_time_minutes > 0 && (
                        <span className="text-xs text-gray-400 flex items-center gap-0.5">
                          <Clock className="w-3 h-3" />
                          {formatTime(pkg.total_time_minutes)}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="font-medium text-sm">
                    {formatPrice(pkg.total_sale_price)}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
