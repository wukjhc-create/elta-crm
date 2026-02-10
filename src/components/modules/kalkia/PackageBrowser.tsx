'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Clock,
  Package,
  Plus,
  FolderTree,
  TrendingUp,
  DollarSign,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { v4 as uuidv4 } from 'uuid'
import {
  getPackages,
  getPackageWithItems,
  getPackageCategories,
} from '@/lib/actions/packages'
import {
  getCalcComponentForCalculation,
} from '@/lib/actions/components'
import type { PackageCategory, PackageSummary } from '@/types/packages.types'
import type { CalculationItem } from './CalculationPreview'

interface PackageBrowserProps {
  onAddItems: (items: CalculationItem[]) => void
  className?: string
}

export function PackageBrowser({
  onAddItems,
  className = '',
}: PackageBrowserProps) {
  const [search, setSearch] = useState('')
  const [packages, setPackages] = useState<PackageSummary[]>([])
  const [categories, setCategories] = useState<PackageCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingPackage, setLoadingPackage] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  // Load packages and categories
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      const [packagesResult, categoriesResult] = await Promise.all([
        getPackages({ is_active: true }),
        getPackageCategories(),
      ])

      if (packagesResult.success && packagesResult.data) {
        setPackages(packagesResult.data as unknown as PackageSummary[])
      }
      if (categoriesResult.success && categoriesResult.data) {
        setCategories(categoriesResult.data)
      }
      setLoading(false)
    }
    loadData()
  }, [])

  // Filter packages
  const filteredPackages = packages.filter((pkg) => {
    const matchesSearch = !search ||
      pkg.name.toLowerCase().includes(search.toLowerCase()) ||
      pkg.code?.toLowerCase().includes(search.toLowerCase()) ||
      pkg.description?.toLowerCase().includes(search.toLowerCase())

    const matchesCategory = categoryFilter === 'all' ||
      categories.find(c => c.id === categoryFilter)?.name === pkg.category_name

    return matchesSearch && matchesCategory
  })

  // Group by category
  const groupedPackages = filteredPackages.reduce((acc, pkg) => {
    const category = pkg.category_name || 'Uden kategori'
    if (!acc[category]) acc[category] = []
    acc[category].push(pkg)
    return acc
  }, {} as Record<string, PackageSummary[]>)

  // Add package - converts package items to calculation items
  const handleAddPackage = useCallback(async (pkg: PackageSummary) => {
    setLoadingPackage(true)

    try {
      const result = await getPackageWithItems(pkg.id)
      if (!result.success || !result.data) {
        setLoadingPackage(false)
        return
      }

      const packageWithItems = result.data
      const calculationItems: CalculationItem[] = []

      // Batch-fetch all component details in parallel (avoid N+1)
      const componentItems = packageWithItems.items.filter(
        (item) => item.item_type === 'component' && item.component_id
      )
      const componentResults = await Promise.all(
        componentItems.map((item) => getCalcComponentForCalculation(item.component_id!))
      )
      const componentMap = new Map(
        componentItems.map((item, i) => [item.component_id!, componentResults[i]])
      )

      // Process each package item using pre-fetched data
      for (const item of packageWithItems.items) {
        if (item.item_type === 'component' && item.component_id) {
          const compResult = componentMap.get(item.component_id)
          if (compResult?.success && compResult.data) {
            const component = compResult.data

            const activeVariants = component.variants?.filter((v) => v.is_active !== false) || []
            const variant = item.component_variant_code
              ? activeVariants.find(v => v.code === item.component_variant_code)
              : activeVariants.find(v => v.is_default) || activeVariants[0]

            const timeMultiplier = variant?.time_multiplier || 1
            const extraMinutes = variant?.extra_minutes || 0
            const complexityFactor = component.complexity_factor || 1

            let calculatedTime = component.base_time_minutes
            calculatedTime = Math.round(calculatedTime * timeMultiplier) + extraMinutes
            calculatedTime = Math.round(calculatedTime * complexityFactor)

            const materials = component.materials?.map((m) => ({
              name: m.material_name,
              quantity: m.quantity,
              unit: m.unit,
              costPrice: m.cost_price ?? 0,
              salePrice: m.sale_price ?? 0,
            })) || []

            calculationItems.push({
              id: uuidv4(),
              componentId: component.id,
              componentName: component.name,
              componentCode: component.code,
              variantId: variant?.id || null,
              variantName: variant?.name,
              quantity: item.quantity,
              baseTimeMinutes: component.base_time_minutes,
              variantTimeMultiplier: timeMultiplier,
              variantExtraMinutes: extraMinutes,
              complexityFactor,
              calculatedTimeMinutes: calculatedTime,
              costPrice: item.cost_price || component.default_cost_price || 0,
              salePrice: item.sale_price || component.default_sale_price || 0,
              materials,
            })
          }
        } else if (item.item_type === 'manual' || item.item_type === 'time') {
          calculationItems.push({
            id: uuidv4(),
            componentId: '',
            componentName: item.description,
            componentCode: null,
            variantId: null,
            variantName: undefined,
            quantity: item.quantity,
            baseTimeMinutes: item.time_minutes || 0,
            variantTimeMultiplier: 1,
            variantExtraMinutes: 0,
            complexityFactor: 1,
            calculatedTimeMinutes: item.time_minutes || 0,
            costPrice: item.cost_price || 0,
            salePrice: item.sale_price || 0,
            materials: [],
          })
        }
      }

      if (calculationItems.length > 0) {
        onAddItems(calculationItems)
      }
    } catch (err) {
      console.error('Error adding package:', err)
    }

    setLoadingPackage(false)
  }, [onAddItems])

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}t ${mins}m` : `${hours}t`
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
      minimumFractionDigits: 0,
    }).format(price)
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Search and Filters */}
      <div className="space-y-3 p-4 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Søg i pakker..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex gap-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Alle kategorier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle kategorier</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Badge variant="secondary" className="px-3">
            {filteredPackages.length} pakker
          </Badge>
        </div>
      </div>

      {/* Package List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-500">
            <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
            Henter pakker...
          </div>
        ) : filteredPackages.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Ingen pakker fundet</p>
            <p className="text-sm mt-2">Prøv at ændre søgning eller filter</p>
          </div>
        ) : (
          <div className="divide-y">
            {Object.entries(groupedPackages).map(([category, pkgs]) => (
              <div key={category}>
                <div className="px-3 py-2 bg-gray-50 text-sm font-medium text-gray-600 flex items-center gap-2">
                  <FolderTree className="w-4 h-4" />
                  {category}
                  <Badge variant="secondary" className="text-xs">
                    {pkgs.length}
                  </Badge>
                </div>
                {pkgs.map((pkg) => (
                  <div
                    key={pkg.id}
                    className="w-full p-3 hover:bg-gray-50 transition-colors flex items-center gap-3"
                  >
                    <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center flex-shrink-0">
                      <Package className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{pkg.name}</span>
                        {pkg.code && (
                          <Badge variant="outline" className="text-xs flex-shrink-0">
                            {pkg.code}
                          </Badge>
                        )}
                        {pkg.is_template && (
                          <Badge className="text-xs bg-green-100 text-green-700 flex-shrink-0">
                            Skabelon
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTime(pkg.total_time_minutes)}
                        </span>
                        <span>{pkg.item_count} linjer</span>
                        {pkg.total_cost_price > 0 && (
                          <span className="text-gray-400">
                            <DollarSign className="w-3 h-3 inline" />
                            {formatPrice(pkg.total_cost_price)}
                          </span>
                        )}
                        {pkg.total_sale_price > 0 && (
                          <span className="font-medium">{formatPrice(pkg.total_sale_price)}</span>
                        )}
                        {pkg.db_percentage > 0 && (
                          <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                            <TrendingUp className="w-3 h-3 mr-0.5" />
                            {pkg.db_percentage.toFixed(1)}% DB
                          </Badge>
                        )}
                      </div>
                      {pkg.description && (
                        <p className="text-xs text-gray-400 mt-1 truncate">
                          {pkg.description}
                        </p>
                      )}
                    </div>

                    <Button
                      size="sm"
                      onClick={() => handleAddPackage(pkg)}
                      disabled={loadingPackage}
                      className="flex-shrink-0"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Tilføj
                    </Button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
