'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Clock,
  Plus,
  FolderTree,
  Wrench,
  Package,
  X,
  Filter,
  DollarSign,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { v4 as uuidv4 } from 'uuid'
import {
  searchCalcComponents,
  getCalcComponentsBrowse,
  getCalcComponentForCalculation,
  type ComponentSummary,
  type ComponentForCalculation,
  type ComponentVariant,
} from '@/lib/actions/components'
import type { CalculationItem } from './CalculationPreview'

// Component item for calculation - matches what PackageBuilder expects
export interface CalcComponentInput {
  componentId: string
  variantId: string | null
  quantity: number
}

interface ComponentBrowserProps {
  onAdd: (item: CalculationItem) => void
  existingComponentIds?: string[]
  className?: string
}

export function ComponentBrowser({
  onAdd,
  existingComponentIds = [],
  className = '',
}: ComponentBrowserProps) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<ComponentSummary[]>([])
  const [browseComponents, setBrowseComponents] = useState<ComponentSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [selectedComponent, setSelectedComponent] = useState<ComponentForCalculation | null>(null)
  const [loadingComponent, setLoadingComponent] = useState(false)
  const [selectedVariantId, setSelectedVariantId] = useState<string>('')
  const [quantity, setQuantity] = useState(1)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  // Load initial components on mount
  useEffect(() => {
    const loadBrowseComponents = async () => {
      setInitialLoading(true)
      const result = await getCalcComponentsBrowse(50)
      if (result.success && result.data) {
        setBrowseComponents(result.data)
      }
      setInitialLoading(false)
    }
    loadBrowseComponents()
  }, [])

  // Debounced search
  useEffect(() => {
    const searchComponents = async () => {
      if (search.length < 2) {
        setResults([])
        return
      }

      setLoading(true)
      const result = await searchCalcComponents(search, 30)
      if (result.success && result.data) {
        let filtered = result.data.filter((c) => !existingComponentIds.includes(c.id))
        if (categoryFilter !== 'all') {
          filtered = filtered.filter((c) => c.category_slug === categoryFilter)
        }
        setResults(filtered)
      }
      setLoading(false)
    }

    const debounce = setTimeout(searchComponents, 300)
    return () => clearTimeout(debounce)
  }, [search, existingComponentIds, categoryFilter])

  // Determine which components to display
  const displayComponents = search.length >= 2 ? results : browseComponents.filter((c) => {
    if (existingComponentIds.includes(c.id)) return false
    if (categoryFilter !== 'all' && c.category_slug !== categoryFilter) return false
    return true
  })
  const isSearchMode = search.length >= 2

  // Get unique categories for filter
  const categories = Array.from(new Set(browseComponents.map((c) => c.category_slug).filter(Boolean))) as string[]

  // Quick-add: single click adds component with default variant
  const handleQuickAdd = useCallback(async (summary: ComponentSummary) => {
    setLoadingComponent(true)
    const result = await getCalcComponentForCalculation(summary.id)

    if (result.success && result.data) {
      const component = result.data
      // Filter to only active variants
      const activeVariants = component.variants?.filter((v) => v.is_active !== false) || []
      const variant = activeVariants.find((v) => v.is_default) || activeVariants[0] || null

      // Calculate time with variant and complexity
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

      const calcItem: CalculationItem = {
        id: uuidv4(),
        componentId: component.id,
        componentName: component.name,
        componentCode: component.code,
        variantId: variant?.id || null,
        variantName: variant?.name,
        quantity: 1,
        baseTimeMinutes: component.base_time_minutes,
        variantTimeMultiplier: timeMultiplier,
        variantExtraMinutes: extraMinutes,
        complexityFactor: complexityFactor,
        calculatedTimeMinutes: calculatedTime,
        costPrice: component.default_cost_price || 0,
        salePrice: component.default_sale_price || 0,
        materials,
      }

      onAdd(calcItem)
    }

    setLoadingComponent(false)
  }, [onAdd])

  // Detail view: click to see details, then add with custom quantity/variant
  const handleSelectComponent = useCallback(async (summary: ComponentSummary) => {
    setLoadingComponent(true)
    const result = await getCalcComponentForCalculation(summary.id)
    if (result.success && result.data) {
      setSelectedComponent(result.data)
      // Filter to only active variants
      const activeVariants = result.data.variants?.filter((v) => v.is_active !== false) || []
      const defaultVariant = activeVariants.find((v) => v.is_default) || activeVariants[0]
      setSelectedVariantId(defaultVariant?.id || '')
      setQuantity(1)
    }
    setLoadingComponent(false)
  }, [])

  const handleAdd = () => {
    if (!selectedComponent) return

    // Filter to only active variants
    const activeVariants = selectedComponent.variants?.filter((v) => v.is_active !== false) || []
    const variant = activeVariants.find((v) => v.id === selectedVariantId)

    // Calculate time with variant and complexity
    const timeMultiplier = variant?.time_multiplier || 1
    const extraMinutes = variant?.extra_minutes || 0
    const complexityFactor = selectedComponent.complexity_factor || 1

    let calculatedTime = selectedComponent.base_time_minutes
    calculatedTime = Math.round(calculatedTime * timeMultiplier) + extraMinutes
    calculatedTime = Math.round(calculatedTime * complexityFactor)

    // Build materials list with prices
    const materials = selectedComponent.materials?.map((m) => ({
      name: m.material_name,
      quantity: m.quantity,
      unit: m.unit,
      costPrice: m.cost_price ?? 0,
      salePrice: m.sale_price ?? 0,
    })) || []

    // Create full calculation item with transparency data
    const calcItem: CalculationItem = {
      id: uuidv4(),
      componentId: selectedComponent.id,
      componentName: selectedComponent.name,
      componentCode: selectedComponent.code,
      variantId: variant?.id || null,
      variantName: variant?.name,
      quantity,
      baseTimeMinutes: selectedComponent.base_time_minutes,
      variantTimeMultiplier: timeMultiplier,
      variantExtraMinutes: extraMinutes,
      complexityFactor: complexityFactor,
      calculatedTimeMinutes: calculatedTime,
      costPrice: selectedComponent.default_cost_price || 0,
      salePrice: selectedComponent.default_sale_price || 0,
      materials,
    }

    onAdd(calcItem)

    // Reset selection
    setSelectedComponent(null)
    setSelectedVariantId('')
    setQuantity(1)
  }

  const handleClearSelection = () => {
    setSelectedComponent(null)
    setSelectedVariantId('')
    setQuantity(1)
  }

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

  const getCalculatedTime = (): number => {
    if (!selectedComponent) return 0
    let baseTime = selectedComponent.base_time_minutes

    if (selectedVariantId) {
      const variant = selectedComponent.variants?.find((v) => v.id === selectedVariantId)
      if (variant) {
        baseTime = Math.round(baseTime * variant.time_multiplier) + variant.extra_minutes
      }
    }

    return baseTime * quantity
  }

  // Group components by category
  const groupedComponents = displayComponents.reduce((acc, comp) => {
    const category = comp.category_name || 'Uden kategori'
    if (!acc[category]) acc[category] = []
    acc[category].push(comp)
    return acc
  }, {} as Record<string, ComponentSummary[]>)

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Search and Filters */}
      <div className="space-y-3 p-4 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Søg i komponenter..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex gap-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[160px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Kategori" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle kategorier</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {browseComponents.find((c) => c.category_slug === cat)?.category_name || cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Badge variant="secondary" className="px-3">
            {isSearchMode ? `${results.length} resultater` : `${displayComponents.length} komponenter`}
          </Badge>
        </div>
      </div>

      {/* Results / Selection area */}
      <div className="flex-1 overflow-hidden flex">
        {/* Component List */}
        <div className={`flex-1 overflow-y-auto border-r ${selectedComponent ? 'w-1/2' : 'w-full'}`}>
          {(loading || initialLoading) ? (
            <div className="p-8 text-center text-gray-500">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
              {isSearchMode ? 'Søger...' : 'Henter komponenter...'}
            </div>
          ) : displayComponents.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {isSearchMode ? (
                <>
                  <Package className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>Ingen komponenter fundet for &quot;{search}&quot;</p>
                  <p className="text-sm mt-2">Prøv et andet søgeord</p>
                </>
              ) : (
                <>
                  <Package className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>Ingen komponenter tilgængelige</p>
                  <p className="text-sm mt-2">Kontakt administrator for at tilføje komponenter</p>
                </>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {Object.entries(groupedComponents).map(([category, components]) => (
                <div key={category}>
                  <div className="px-3 py-2 bg-gray-50 text-sm font-medium text-gray-600 flex items-center gap-2">
                    <FolderTree className="w-4 h-4" />
                    {category}
                    <Badge variant="secondary" className="text-xs">
                      {components.length}
                    </Badge>
                  </div>
                  {components.map((comp) => (
                    <div
                      key={comp.id}
                      className={`w-full p-3 text-left hover:bg-gray-50 transition-colors flex items-center gap-3 ${
                        selectedComponent?.id === comp.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-yellow-100 text-yellow-600 flex items-center justify-center flex-shrink-0">
                        <Wrench className="w-4 h-4" />
                      </div>

                      <button
                        type="button"
                        className="flex-1 min-w-0 text-left cursor-pointer hover:text-blue-600"
                        onClick={() => handleSelectComponent(comp)}
                        disabled={loadingComponent}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{comp.name}</span>
                          {comp.code && (
                            <Badge variant="outline" className="text-xs flex-shrink-0">
                              {comp.code}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                          {comp.base_time_minutes > 0 && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatTime(comp.base_time_minutes)}
                            </span>
                          )}
                          {comp.variant_count > 0 && (
                            <span>{comp.variant_count} varianter</span>
                          )}
                          {comp.difficulty_level > 1 && (
                            <span>{'★'.repeat(comp.difficulty_level)}</span>
                          )}
                        </div>
                      </button>

                      <button
                        type="button"
                        className="p-2 rounded-full hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0"
                        onClick={() => handleQuickAdd(comp)}
                        disabled={loadingComponent}
                        title="Tilføj til kalkulation"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected Component Detail */}
        {selectedComponent && (
          <div className="w-1/2 p-4 overflow-y-auto bg-gray-50">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-yellow-100 text-yellow-600 flex items-center justify-center">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold">{selectedComponent.name}</h3>
                  {selectedComponent.code && (
                    <Badge variant="outline" className="text-xs">{selectedComponent.code}</Badge>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={handleClearSelection}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {selectedComponent.description && (
              <p className="text-sm text-gray-600 mb-4">{selectedComponent.description}</p>
            )}

            {/* Variant Selection - only show active variants */}
            {(() => {
              const activeVariants = selectedComponent.variants?.filter((v) => v.is_active !== false) || []
              if (activeVariants.length === 0) return null
              return (
                <div className="mb-4">
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Vægtype / Variant
                  </label>
                  <Select value={selectedVariantId} onValueChange={setSelectedVariantId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Vælg variant" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeVariants.map((variant: ComponentVariant) => (
                        <SelectItem key={variant.id} value={variant.id}>
                          <div className="flex items-center justify-between w-full">
                            <span>{variant.name}</span>
                            {variant.is_default && (
                              <Badge variant="secondary" className="ml-2 text-xs">Standard</Badge>
                            )}
                            {variant.time_multiplier !== 1 && (
                              <span className="text-xs text-gray-500 ml-2">
                                ({variant.time_multiplier}x tid)
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedVariantId && (
                    <div className="mt-2 text-xs text-gray-500">
                      {activeVariants.find((v) => v.id === selectedVariantId)?.description}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Quantity */}
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Antal
              </label>
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-24"
              />
            </div>

            {/* Summary Card */}
            <Card className="mb-4">
              <CardContent className="py-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">Basistid:</span>
                    <span className="ml-2 font-medium">
                      {formatTime(selectedComponent.base_time_minutes)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Total tid:</span>
                    <span className="ml-2 font-medium text-blue-600">
                      {formatTime(getCalculatedTime())}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Sværhedsgrad:</span>
                    <span className="ml-2">
                      {'★'.repeat(selectedComponent.difficulty_level)}
                      {'☆'.repeat(5 - selectedComponent.difficulty_level)}
                    </span>
                  </div>
                  {selectedComponent.default_cost_price > 0 && (
                    <div>
                      <span className="text-gray-500">Kostpris:</span>
                      <span className="ml-2 font-medium text-gray-600">
                        {formatPrice(selectedComponent.default_cost_price)}
                      </span>
                    </div>
                  )}
                  {selectedComponent.default_sale_price > 0 && (
                    <div>
                      <span className="text-gray-500">Salgspris:</span>
                      <span className="ml-2 font-medium text-green-600">
                        {formatPrice(selectedComponent.default_sale_price)}
                      </span>
                    </div>
                  )}
                  {selectedComponent.default_sale_price > 0 && selectedComponent.default_cost_price > 0 && (
                    <div className="col-span-2 pt-2 border-t mt-2">
                      <span className="text-gray-500">Est. DB:</span>
                      <span className="ml-2 font-semibold text-green-600">
                        {formatPrice(selectedComponent.default_sale_price - selectedComponent.default_cost_price)}
                        <span className="text-xs font-normal ml-1">
                          ({((selectedComponent.default_sale_price - selectedComponent.default_cost_price) / selectedComponent.default_sale_price * 100).toFixed(1)}%)
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Materials Preview */}
            {selectedComponent.materials && selectedComponent.materials.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Materialer</h4>
                <div className="space-y-1">
                  {selectedComponent.materials.map((mat) => (
                    <div key={mat.id} className="flex items-center justify-between text-sm bg-white rounded p-2">
                      <span>{mat.material_name}</span>
                      <span className="text-gray-500">
                        {mat.quantity * quantity} {mat.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add Button */}
            <Button onClick={handleAdd} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Tilføj til kalkulation
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
