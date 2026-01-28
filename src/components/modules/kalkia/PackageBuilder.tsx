'use client'

import { useState, useCallback, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import {
  Save,
  FileText,
  Calculator,
  Building2,
  Settings,
  ChevronDown,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ComponentBrowser } from './ComponentBrowser'
import { CalculationPreview, type CalculationItem } from './CalculationPreview'
import { calculateFromNodes, getBuildingProfiles, getKalkiaNode } from '@/lib/actions/kalkia'
import type {
  KalkiaCalculationItemInput,
  KalkiaBuildingProfile,
  CalculationResult,
} from '@/types/kalkia.types'

interface PackageBuilderProps {
  onSave?: (data: {
    name: string
    description: string
    items: CalculationItem[]
    result: CalculationResult | null
    buildingProfileId: string | null
    settings: {
      hourlyRate: number
      marginPercentage: number
      discountPercentage: number
    }
  }) => Promise<void>
  initialName?: string
  initialDescription?: string
}

export function PackageBuilder({
  onSave,
  initialName = '',
  initialDescription = '',
}: PackageBuilderProps) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [items, setItems] = useState<CalculationItem[]>([])
  const [result, setResult] = useState<CalculationResult | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Settings
  const [buildingProfiles, setBuildingProfiles] = useState<KalkiaBuildingProfile[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState<string>('')
  const [showSettings, setShowSettings] = useState(false)
  const [hourlyRate, setHourlyRate] = useState(495)
  const [marginPercentage, setMarginPercentage] = useState(15)
  const [discountPercentage, setDiscountPercentage] = useState(0)

  // Load building profiles
  useEffect(() => {
    const loadProfiles = async () => {
      const result = await getBuildingProfiles()
      if (result.success && result.data) {
        setBuildingProfiles(result.data)
        // Select first active profile as default
        const defaultProfile = result.data.find((p) => p.code === 'HOUSE') || result.data[0]
        if (defaultProfile) {
          setSelectedProfileId(defaultProfile.id)
        }
      }
    }
    loadProfiles()
  }, [])

  // Recalculate when items or settings change
  useEffect(() => {
    const calculate = async () => {
      if (items.length === 0) {
        setResult(null)
        return
      }

      setIsCalculating(true)

      const inputs: KalkiaCalculationItemInput[] = items.map((item) => ({
        nodeId: item.nodeId,
        variantId: item.variantId,
        quantity: item.quantity,
      }))

      const calcResult = await calculateFromNodes(
        inputs,
        selectedProfileId || null,
        hourlyRate,
        marginPercentage,
        discountPercentage
      )

      if (calcResult.success && calcResult.data) {
        setResult(calcResult.data.result)

        // Update item time values from calculation
        const calculatedItems = calcResult.data.items as Array<{
          nodeId: string
          directTimeSeconds: number
          totalLaborTimeSeconds: number
          materialCost: number
          laborCost: number
        }>

        setItems((prev) =>
          prev.map((item) => {
            const calcItem = calculatedItems.find((c) => c.nodeId === item.nodeId)
            if (calcItem) {
              return {
                ...item,
                calculatedTimeSeconds: calcItem.directTimeSeconds,
                costPrice: calcItem.materialCost + calcItem.laborCost,
                salePrice: item.salePrice, // Keep original sale price
              }
            }
            return item
          })
        )
      }

      setIsCalculating(false)
    }

    const debounce = setTimeout(calculate, 500)
    return () => clearTimeout(debounce)
  }, [items, selectedProfileId, hourlyRate, marginPercentage, discountPercentage])

  const handleAddItem = useCallback(
    async (input: KalkiaCalculationItemInput, nodeName: string, variantName?: string) => {
      // Fetch full node data for materials
      const nodeResult = await getKalkiaNode(input.nodeId)
      if (!nodeResult.success || !nodeResult.data) return

      const node = nodeResult.data
      const variant = input.variantId
        ? node.variants?.find((v) => v.id === input.variantId)
        : node.variants?.find((v) => v.is_default) || node.variants?.[0]

      let baseTime = node.base_time_seconds
      if (variant) {
        baseTime = Math.round(baseTime * variant.time_multiplier) + variant.extra_time_seconds
      }

      // Get materials from variant
      const materials = (variant as { materials?: Array<{ material_name: string; quantity: number; unit: string; cost_price?: number; sale_price?: number }> })?.materials?.map((m) => ({
        name: m.material_name,
        quantity: m.quantity,
        unit: m.unit,
        costPrice: m.cost_price || 0,
        salePrice: m.sale_price || 0,
      })) || []

      const newItem: CalculationItem = {
        id: uuidv4(),
        nodeId: node.id,
        nodeName,
        nodeCode: node.code,
        nodeType: node.node_type as 'operation' | 'composite' | 'group',
        variantId: variant?.id || null,
        variantName: variantName || variant?.name,
        quantity: input.quantity,
        baseTimeSeconds: node.base_time_seconds,
        calculatedTimeSeconds: baseTime * input.quantity,
        costPrice: node.default_cost_price,
        salePrice: node.default_sale_price,
        materials,
      }

      setItems((prev) => [...prev, newItem])
    },
    []
  )

  const handleRemoveItem = useCallback((itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId))
  }, [])

  const handleUpdateQuantity = useCallback((itemId: string, quantity: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const baseTime = item.baseTimeSeconds
          return {
            ...item,
            quantity,
            calculatedTimeSeconds: baseTime * quantity,
          }
        }
        return item
      })
    )
  }, [])

  const handleSave = async () => {
    if (!onSave || !name.trim()) return

    setIsSaving(true)
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        items,
        result,
        buildingProfileId: selectedProfileId || null,
        settings: {
          hourlyRate,
          marginPercentage,
          discountPercentage,
        },
      })
    } finally {
      setIsSaving(false)
    }
  }

  const existingNodeIds = items.map((item) => item.nodeId)
  const selectedProfile = buildingProfiles.find((p) => p.id === selectedProfileId)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-white p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4 flex-1">
            <Calculator className="w-8 h-8 text-blue-600" />
            <div className="flex-1">
              <Input
                placeholder="Navn på kalkulation..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-xl font-semibold border-none p-0 h-auto focus-visible:ring-0"
              />
              <Input
                placeholder="Beskrivelse (valgfrit)..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="text-sm text-gray-500 border-none p-0 h-auto mt-1 focus-visible:ring-0"
              />
            </div>
          </div>

          {onSave && (
            <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Gemmer...' : 'Gem kalkulation'}
            </Button>
          )}
        </div>

        {/* Settings Bar */}
        <Collapsible open={showSettings} onOpenChange={setShowSettings}>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-400" />
              <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Bygningstype" />
                </SelectTrigger>
                <SelectContent>
                  {buildingProfiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedProfile && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Badge variant="outline">Tid: {selectedProfile.time_multiplier}x</Badge>
                <Badge variant="outline">Spild: {selectedProfile.material_waste_multiplier}x</Badge>
              </div>
            )}

            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                <Settings className="w-4 h-4 mr-2" />
                Indstillinger
                <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent>
            <Card className="mt-4">
              <CardContent className="py-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Timepris</label>
                    <div className="flex items-center mt-1">
                      <Input
                        type="number"
                        value={hourlyRate}
                        onChange={(e) => setHourlyRate(Number(e.target.value))}
                        className="w-24"
                      />
                      <span className="ml-2 text-sm text-gray-500">kr/time</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Avance</label>
                    <div className="flex items-center mt-1">
                      <Input
                        type="number"
                        value={marginPercentage}
                        onChange={(e) => setMarginPercentage(Number(e.target.value))}
                        className="w-24"
                      />
                      <span className="ml-2 text-sm text-gray-500">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Rabat</label>
                    <div className="flex items-center mt-1">
                      <Input
                        type="number"
                        value={discountPercentage}
                        onChange={(e) => setDiscountPercentage(Number(e.target.value))}
                        className="w-24"
                      />
                      <span className="ml-2 text-sm text-gray-500">%</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Component Browser - Left Side */}
        <div className="w-1/2 border-r bg-gray-50">
          <ComponentBrowser onAdd={handleAddItem} existingNodeIds={existingNodeIds} />
        </div>

        {/* Calculation Preview - Right Side */}
        <div className="w-1/2 bg-white">
          <CalculationPreview
            items={items}
            result={result}
            onRemoveItem={handleRemoveItem}
            onUpdateQuantity={handleUpdateQuantity}
            isLoading={isCalculating}
          />
        </div>
      </div>
    </div>
  )
}
