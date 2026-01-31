'use client'

import { useState } from 'react'
import {
  Trash2,
  Clock,
  Package,
  ChevronDown,
  ChevronRight,
  Wrench,
  AlertCircle,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import type { CalculationResult } from '@/types/kalkia.types'

export interface CalculationItem {
  id: string
  componentId: string
  componentName: string
  componentCode: string | null
  variantId: string | null
  variantName?: string
  quantity: number
  // Time transparency
  baseTimeMinutes: number
  variantTimeMultiplier: number
  variantExtraMinutes: number
  complexityFactor: number
  calculatedTimeMinutes: number
  // Pricing
  costPrice: number
  salePrice: number
  // Materials
  materials?: {
    name: string
    quantity: number
    unit: string
    costPrice: number
    salePrice: number
  }[]
}

interface CalculationPreviewProps {
  items: CalculationItem[]
  result?: CalculationResult | null
  onRemoveItem: (itemId: string) => void
  onUpdateQuantity: (itemId: string, quantity: number) => void
  isLoading?: boolean
}

export function CalculationPreview({
  items,
  result,
  onRemoveItem,
  onUpdateQuantity,
  isLoading = false,
}: CalculationPreviewProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  const toggleItem = (itemId: string) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(itemId)) {
        newSet.delete(itemId)
      } else {
        newSet.add(itemId)
      }
      return newSet
    })
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

  const formatPercent = (value: number) => {
    return new Intl.NumberFormat('da-DK', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value / 100)
  }

  // Calculate totals from items
  const totalTime = items.reduce((sum, item) => sum + item.calculatedTimeMinutes, 0)
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)

  if (items.length === 0) {
    return (
      <Card className="h-full">
        <CardContent className="flex flex-col items-center justify-center h-full py-12 text-gray-500">
          <Package className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-lg font-medium">Ingen komponenter valgt</p>
          <p className="text-sm">Søg og tilføj komponenter fra biblioteket</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Items List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {items.map((item) => {
          const isExpanded = expandedItems.has(item.id)
          const hasMaterials = item.materials && item.materials.length > 0
          const hasVariantModifier = item.variantTimeMultiplier !== 1 || item.variantExtraMinutes > 0
          const hasComplexity = item.complexityFactor !== 1

          return (
            <Collapsible
              key={item.id}
              open={isExpanded}
              onOpenChange={() => toggleItem(item.id)}
            >
              <div className="border rounded-lg bg-white">
                <div className="flex items-center gap-3 p-3">
                  <CollapsibleTrigger className="p-1 hover:bg-gray-100 rounded">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </CollapsibleTrigger>

                  <div className="w-8 h-8 rounded flex items-center justify-center bg-yellow-100 text-yellow-600">
                    <Wrench className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{item.componentName}</span>
                      {item.variantName && (
                        <Badge variant="outline" className="text-xs">
                          {item.variantName}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTime(item.calculatedTimeMinutes * item.quantity)}
                      </span>
                      {item.salePrice > 0 && <span>{formatPrice(item.salePrice * item.quantity)}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) =>
                        onUpdateQuantity(item.id, Math.max(1, parseInt(e.target.value) || 1))
                      }
                      className="w-16 h-8 text-center"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveItem(item.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Expanded details */}
                <CollapsibleContent>
                  <div className="px-3 pb-3 ml-10 border-t mt-1 pt-3 space-y-3">
                    {/* Time breakdown */}
                    <div>
                      <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Tidsberegning
                      </p>
                      <div className="bg-gray-50 rounded p-2 text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Basistid:</span>
                          <span className="font-medium">{item.baseTimeMinutes} min</span>
                        </div>
                        {hasVariantModifier && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Variant ({item.variantName}):</span>
                              <span className="font-medium">
                                ×{item.variantTimeMultiplier.toFixed(2)}
                                {item.variantExtraMinutes > 0 && ` +${item.variantExtraMinutes} min`}
                              </span>
                            </div>
                          </>
                        )}
                        {hasComplexity && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Kompleksitet:</span>
                            <span className="font-medium">×{item.complexityFactor.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between border-t pt-1 mt-1">
                          <span className="text-gray-600">Tid pr. stk:</span>
                          <span className="font-semibold text-blue-600">{formatTime(item.calculatedTimeMinutes)}</span>
                        </div>
                        {item.quantity > 1 && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">× {item.quantity} stk =</span>
                            <span className="font-semibold text-blue-600">{formatTime(item.calculatedTimeMinutes * item.quantity)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Materials breakdown */}
                    {hasMaterials && (
                      <div>
                        <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          Materialer
                        </p>
                        <div className="space-y-1">
                          {item.materials!.map((mat, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1"
                            >
                              <span className="text-gray-700">{mat.name}</span>
                              <div className="flex items-center gap-3">
                                <span className="text-gray-500">
                                  {mat.quantity} {mat.unit} × {item.quantity} = {mat.quantity * item.quantity} {mat.unit}
                                </span>
                                {mat.costPrice > 0 && (
                                  <span className="font-medium">
                                    {formatPrice(mat.costPrice * mat.quantity * item.quantity)}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Component info */}
                    {item.componentCode && (
                      <div className="text-xs text-gray-400">
                        Kode: {item.componentCode}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          )
        })}
      </div>

      {/* Summary Section */}
      <div className="border-t bg-gray-50 p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-4 text-gray-500">
            <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full mr-2" />
            Beregner...
          </div>
        ) : result ? (
          <div className="space-y-3">
            {/* Time Summary */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-white rounded p-2">
                <p className="text-gray-500 text-xs">Direkte tid</p>
                <p className="font-semibold">{formatTime(Math.round(result.totalDirectTimeSeconds / 60))}</p>
              </div>
              <div className="bg-white rounded p-2">
                <p className="text-gray-500 text-xs">Total arbejdstid</p>
                <p className="font-semibold text-blue-600">
                  {formatTime(Math.round(result.totalLaborTimeSeconds / 60))}
                </p>
              </div>
            </div>

            {/* Cost Summary */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-white rounded p-2">
                <p className="text-gray-500 text-xs">Materialer</p>
                <p className="font-semibold">{formatPrice(result.totalMaterialCost)}</p>
              </div>
              <div className="bg-white rounded p-2">
                <p className="text-gray-500 text-xs">Arbejdsløn</p>
                <p className="font-semibold">{formatPrice(result.totalLaborCost)}</p>
              </div>
            </div>

            {/* Pricing Summary */}
            <div className="bg-white rounded p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Kostpris</span>
                <span>{formatPrice(result.costPrice)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Overhead</span>
                <span>{formatPrice(result.overheadAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Avance</span>
                <span>{formatPrice(result.marginAmount)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                <span>Pris ekskl. moms</span>
                <span>{formatPrice(result.salePriceExclVat)}</span>
              </div>
              {result.discountAmount > 0 && (
                <div className="flex justify-between text-sm text-red-600">
                  <span>Rabat</span>
                  <span>-{formatPrice(result.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Moms (25%)</span>
                <span>{formatPrice(result.vatAmount)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between text-lg font-bold">
                <span>Total inkl. moms</span>
                <span className="text-green-600">{formatPrice(result.finalAmount)}</span>
              </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Card className="bg-green-50 border-green-200">
                <CardContent className="py-2 px-3">
                  <p className="text-green-700 text-xs">Dækningsbidrag (DB)</p>
                  <p className="font-bold text-green-800">
                    {formatPrice(result.dbAmount)}
                    <span className="text-xs font-normal ml-1">
                      ({formatPercent(result.dbPercentage)})
                    </span>
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="py-2 px-3">
                  <p className="text-blue-700 text-xs">DB pr. time</p>
                  <p className="font-bold text-blue-800">
                    {formatPrice(result.dbPerHour)}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-600 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>{totalItems} komponenter, {formatTime(totalTime)} total tid</span>
          </div>
        )}
      </div>
    </div>
  )
}
