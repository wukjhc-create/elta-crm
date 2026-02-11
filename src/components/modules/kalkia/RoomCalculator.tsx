'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bed,
  Sofa,
  ChefHat,
  Bath,
  DoorOpen,
  Monitor,
  Car,
  Warehouse,
  Sun,
  Square,
  Plus,
  Calculator,
  Zap,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { getRoomTypes, getRoomComponentSuggestions } from '@/lib/actions/component-intelligence'
import { getCalcComponentForCalculation } from '@/lib/actions/components'
import { v4 as uuidv4 } from 'uuid'
import type { RoomType, RoomComponentSuggestion } from '@/types/component-intelligence.types'
import { formatTimeMinutes } from '@/lib/utils/format'
import type { CalculationItem } from './CalculationPreview'

interface RoomCalculatorProps {
  onAddItems: (items: CalculationItem[]) => void
  className?: string
}

// Icon mapping
const roomIcons: Record<string, React.ElementType> = {
  Bed: Bed,
  Sofa: Sofa,
  ChefHat: ChefHat,
  Bath: Bath,
  DoorOpen: DoorOpen,
  Monitor: Monitor,
  Car: Car,
  Warehouse: Warehouse,
  Sun: Sun,
  Square: Square,
}

const roomColors: Record<string, string> = {
  indigo: 'bg-indigo-100 text-indigo-600 border-indigo-200',
  amber: 'bg-amber-100 text-amber-600 border-amber-200',
  orange: 'bg-orange-100 text-orange-600 border-orange-200',
  cyan: 'bg-cyan-100 text-cyan-600 border-cyan-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  blue: 'bg-blue-100 text-blue-600 border-blue-200',
  gray: 'bg-gray-100 text-gray-600 border-gray-200',
  zinc: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  stone: 'bg-stone-100 text-stone-600 border-stone-200',
  green: 'bg-green-100 text-green-600 border-green-200',
}

export function RoomCalculator({ onAddItems, className = '' }: RoomCalculatorProps) {
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [selectedRoomType, setSelectedRoomType] = useState<RoomType | null>(null)
  const [roomSize, setRoomSize] = useState<number>(15)
  const [suggestions, setSuggestions] = useState<RoomComponentSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [addingToCalc, setAddingToCalc] = useState(false)

  // Load room types
  useEffect(() => {
    const loadRoomTypes = async () => {
      setLoading(true)
      const result = await getRoomTypes()
      if (result.success && result.data) {
        setRoomTypes(result.data)
      }
      setLoading(false)
    }
    loadRoomTypes()
  }, [])

  // Get suggestions when room type or size changes
  useEffect(() => {
    if (!selectedRoomType) {
      setSuggestions([])
      return
    }

    const getSuggestions = async () => {
      setLoadingSuggestions(true)
      const result = await getRoomComponentSuggestions(selectedRoomType.code, roomSize)
      if (result.success && result.data) {
        setSuggestions(result.data)
      }
      setLoadingSuggestions(false)
    }

    const debounce = setTimeout(getSuggestions, 300)
    return () => clearTimeout(debounce)
  }, [selectedRoomType, roomSize])

  // Add all suggestions to calculation
  const handleAddAll = useCallback(async () => {
    if (suggestions.length === 0) return

    setAddingToCalc(true)

    // Filter suggestions with quantity > 0
    const validSuggestions = suggestions.filter((s) => s.suggested_quantity > 0)

    // Batch-fetch all components in parallel (avoid N+1)
    const compResults = await Promise.all(
      validSuggestions.map((s) => getCalcComponentForCalculation(undefined, s.component_code))
    )

    const items: CalculationItem[] = []

    for (let i = 0; i < validSuggestions.length; i++) {
      const suggestion = validSuggestions[i]
      const compResult = compResults[i]

      if (compResult.success && compResult.data) {
        const component = compResult.data
        const activeVariants = component.variants?.filter((v) => v.is_active !== false) || []
        const variant = activeVariants.find((v) => v.is_default) || activeVariants[0]

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

        items.push({
          id: uuidv4(),
          componentId: component.id,
          componentName: component.name,
          componentCode: component.code,
          variantId: variant?.id || null,
          variantName: variant?.name,
          quantity: suggestion.suggested_quantity,
          baseTimeMinutes: component.base_time_minutes,
          variantTimeMultiplier: timeMultiplier,
          variantExtraMinutes: extraMinutes,
          complexityFactor,
          calculatedTimeMinutes: calculatedTime,
          costPrice: component.default_cost_price || 0,
          salePrice: component.default_sale_price || 0,
          materials,
        })
      }
    }

    if (items.length > 0) {
      onAddItems(items)
    }

    setAddingToCalc(false)
  }, [suggestions, onAddItems])

  const handleRoomTypeSelect = (roomTypeId: string) => {
    const roomType = roomTypes.find((rt) => rt.id === roomTypeId)
    setSelectedRoomType(roomType || null)

    // Set default room size based on typical size
    if (roomType?.typical_size_m2) {
      setRoomSize(roomType.typical_size_m2)
    }
  }

  // Calculate estimated total time from suggestions
  const estimatedTotalTime = suggestions.reduce((sum, s) => {
    // Rough estimate: 15 min per component
    return sum + s.suggested_quantity * 15
  }, 0)

  if (loading) {
    return (
      <div className={`p-8 text-center text-gray-500 ${className}`}>
        <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
        Henter rumtyper...
      </div>
    )
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="p-4 border-b space-y-4">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-purple-500" />
          <h3 className="font-semibold">Rum-baseret beregning</h3>
        </div>

        {/* Room Type Selection */}
        <div className="grid grid-cols-5 gap-2">
          {roomTypes.slice(0, 10).map((roomType) => {
            const Icon = roomIcons[roomType.icon] || Square
            const colorClasses = roomColors[roomType.color] || roomColors.gray
            const isSelected = selectedRoomType?.id === roomType.id

            return (
              <button
                key={roomType.id}
                onClick={() => handleRoomTypeSelect(roomType.id)}
                className={`flex flex-col items-center p-2 rounded-lg border transition-all ${
                  isSelected
                    ? `${colorClasses} ring-2 ring-offset-1 ring-current`
                    : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-5 h-5 mb-1" />
                <span className="text-xs font-medium truncate w-full text-center">
                  {roomType.name}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Room Configuration */}
      {selectedRoomType && (
        <div className="p-4 border-b bg-gray-50 space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700 block mb-2">
                Rumstørrelse (m²)
              </label>
              <div className="flex items-center gap-4">
                <Slider
                  value={[roomSize]}
                  onValueChange={([value]) => setRoomSize(value)}
                  min={selectedRoomType.min_size_m2 || 3}
                  max={selectedRoomType.max_size_m2 || 100}
                  step={1}
                  className="flex-1"
                />
                <Input
                  type="number"
                  value={roomSize}
                  onChange={(e) => setRoomSize(Number(e.target.value))}
                  className="w-20"
                  min={selectedRoomType.min_size_m2 || 3}
                  max={selectedRoomType.max_size_m2 || 100}
                />
              </div>
            </div>
          </div>

          {/* Room Info */}
          <div className="flex items-center gap-3 text-sm">
            {selectedRoomType.ip_rating_required !== 'IP20' && (
              <Badge variant="outline" className="bg-cyan-50 text-cyan-700 border-cyan-200">
                {selectedRoomType.ip_rating_required} påkrævet
              </Badge>
            )}
            {selectedRoomType.requires_rcd && (
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                <AlertTriangle className="w-3 h-3 mr-1" />
                HPFI påkrævet
              </Badge>
            )}
            {selectedRoomType.typical_circuits > 1 && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                <Zap className="w-3 h-3 mr-1" />
                {selectedRoomType.typical_circuits} kredsløb
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Suggestions List */}
      <div className="flex-1 overflow-y-auto">
        {!selectedRoomType ? (
          <div className="p-8 text-center text-gray-500">
            <Calculator className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Vælg en rumtype ovenfor</p>
            <p className="text-sm mt-2">Få automatiske komponentforslag baseret på rumstørrelse</p>
          </div>
        ) : loadingSuggestions ? (
          <div className="p-8 text-center text-gray-500">
            <div className="animate-spin w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-2" />
            Beregner forslag...
          </div>
        ) : suggestions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>Ingen komponentforslag for dette rum</p>
          </div>
        ) : (
          <div className="divide-y">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.component_code}
                className="p-3 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-purple-100 text-purple-600 flex items-center justify-center">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{suggestion.component_code}</p>
                    <p className="text-xs text-gray-500">
                      Min: {suggestion.min_quantity} / Max: {suggestion.max_quantity}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge
                    variant="secondary"
                    className="bg-purple-100 text-purple-700 text-lg font-bold px-3"
                  >
                    {suggestion.suggested_quantity} stk
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer with Add Button */}
      {selectedRoomType && suggestions.length > 0 && (
        <div className="border-t p-4 bg-white">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-gray-600">
              <span className="font-medium">{suggestions.length}</span> komponenter
              <span className="mx-2">•</span>
              <span className="font-medium">~{formatTimeMinutes(estimatedTotalTime)}</span> estimeret
            </div>
          </div>

          <Button
            className="w-full bg-purple-600 hover:bg-purple-700"
            onClick={handleAddAll}
            disabled={addingToCalc}
          >
            {addingToCalc ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                Tilføjer...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Tilføj alle til kalkulation
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
