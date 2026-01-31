'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  Save,
  Calculator,
  Building2,
  Settings,
  ChevronDown,
  Package,
  Wrench,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ComponentBrowser } from './ComponentBrowser'
import { PackageBrowser } from './PackageBrowser'
import { CalculationPreview, type CalculationItem } from './CalculationPreview'
import { getBuildingProfiles } from '@/lib/actions/kalkia'
import type {
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
  const [activeTab, setActiveTab] = useState<'components' | 'packages'>('components')

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
    const calculate = () => {
      if (items.length === 0) {
        setResult(null)
        return
      }

      setIsCalculating(true)

      // Get building profile multipliers
      const profile = buildingProfiles.find((p) => p.id === selectedProfileId)
      const timeMultiplier = profile?.time_multiplier || 1
      const wasteMultiplier = profile?.material_waste_multiplier || 1
      const overheadMultiplier = profile?.overhead_multiplier || 1

      // Default factors
      const indirectTimeFactor = 0.10 // 10% indirect time
      const personalTimeFactor = 0.05 // 5% personal time
      const overheadFactor = 0.10 * overheadMultiplier // 10% overhead adjusted by profile
      const materialWasteFactor = wasteMultiplier

      // Calculate totals from items (calculatedTimeMinutes is per-item, multiply by quantity)
      const totalDirectTimeMinutes = items.reduce((sum, item) => sum + (item.calculatedTimeMinutes * item.quantity), 0)
      const totalDirectTimeSeconds = Math.round(totalDirectTimeMinutes * 60 * timeMultiplier)

      // Calculate indirect and personal time
      const totalIndirectTimeSeconds = Math.round(totalDirectTimeSeconds * indirectTimeFactor)
      const totalPersonalTimeSeconds = Math.round(totalDirectTimeSeconds * personalTimeFactor)
      const totalLaborTimeSeconds = totalDirectTimeSeconds + totalIndirectTimeSeconds + totalPersonalTimeSeconds
      const totalLaborHours = totalLaborTimeSeconds / 3600

      // Calculate material costs with waste factor
      const baseMaterialCost = items.reduce((sum, item) => {
        const materialCost = item.materials?.reduce((mSum, m) => mSum + (m.costPrice * m.quantity * item.quantity), 0) || 0
        return sum + materialCost
      }, 0)
      const totalMaterialWaste = baseMaterialCost * (materialWasteFactor - 1)
      const totalMaterialCost = baseMaterialCost + totalMaterialWaste

      // Calculate labor cost
      const totalLaborCost = totalLaborHours * hourlyRate
      const totalOtherCosts = 0 // No other costs for now

      // Calculate cost price
      const costPrice = totalMaterialCost + totalLaborCost + totalOtherCosts

      // Overhead and risk
      const overheadAmount = costPrice * overheadFactor
      const riskAmount = costPrice * 0.02 // 2% risk
      const salesBasis = costPrice + overheadAmount + riskAmount

      // Pricing
      const marginAmount = salesBasis * (marginPercentage / 100)
      const salePriceExclVat = salesBasis + marginAmount
      const discountAmount = salePriceExclVat * (discountPercentage / 100)
      const netPrice = salePriceExclVat - discountAmount
      const vatAmount = netPrice * 0.25
      const finalAmount = netPrice + vatAmount

      // Calculate DB (contribution margin)
      const dbAmount = netPrice - totalMaterialCost - totalLaborCost
      const dbPercentage = netPrice > 0 ? (dbAmount / netPrice) * 100 : 0
      const dbPerHour = totalLaborHours > 0 ? dbAmount / totalLaborHours : 0
      const coverageRatio = costPrice > 0 ? netPrice / costPrice : 0

      const calculationResult: CalculationResult = {
        totalDirectTimeSeconds,
        totalIndirectTimeSeconds,
        totalPersonalTimeSeconds,
        totalLaborTimeSeconds,
        totalLaborHours,
        totalMaterialCost,
        totalMaterialWaste,
        totalLaborCost,
        totalOtherCosts,
        costPrice,
        overheadAmount,
        riskAmount,
        salesBasis,
        marginAmount,
        salePriceExclVat,
        discountAmount,
        netPrice,
        vatAmount,
        finalAmount,
        dbAmount,
        dbPercentage,
        dbPerHour,
        coverageRatio,
        factorsUsed: {
          indirectTimeFactor,
          personalTimeFactor,
          overheadFactor,
          materialWasteFactor,
        },
      }

      setResult(calculationResult)
      setIsCalculating(false)
    }

    const debounce = setTimeout(calculate, 300)
    return () => clearTimeout(debounce)
  }, [items, selectedProfileId, buildingProfiles, hourlyRate, marginPercentage, discountPercentage])

  const handleAddItem = useCallback((newItem: CalculationItem) => {
    setItems((prev) => [...prev, newItem])
  }, [])

  const handleAddItems = useCallback((newItems: CalculationItem[]) => {
    setItems((prev) => [...prev, ...newItems])
  }, [])

  const handleRemoveItem = useCallback((itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId))
  }, [])

  const handleUpdateQuantity = useCallback((itemId: string, quantity: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          return {
            ...item,
            quantity,
            // calculatedTimeMinutes is per-item, quantity is handled in display
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

  const existingComponentIds = items.map((item) => item.componentId)
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
        {/* Component/Package Browser - Left Side */}
        <div className="w-1/2 border-r bg-gray-50 flex flex-col">
          {/* Tab Navigation */}
          <div className="border-b bg-white px-2 py-1">
            <div className="inline-flex items-center rounded-md bg-gray-100 p-1">
              <button
                onClick={() => setActiveTab('components')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'components'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Wrench className="w-3.5 h-3.5" />
                Komponenter
              </button>
              <button
                onClick={() => setActiveTab('packages')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'packages'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                Pakker
              </button>
            </div>
          </div>
          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'components' ? (
              <ComponentBrowser onAdd={handleAddItem} existingComponentIds={existingComponentIds} />
            ) : (
              <PackageBrowser onAddItems={handleAddItems} />
            )}
          </div>
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
