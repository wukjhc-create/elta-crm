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
  Zap,
  Users,
  Clock,
  Copy,
  Home,
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
import { QuickJobsPicker } from './QuickJobsPicker'
import { RoomCalculator } from './RoomCalculator'
import { CalibrationPresetPicker } from './CalibrationPresetPicker'
import { CalculationPreview, type CalculationItem } from './CalculationPreview'
import { getBuildingProfiles } from '@/lib/actions/kalkia'
import type { CalibrationPreset } from '@/types/quick-jobs.types'
import type {
  KalkiaBuildingProfile,
  CalculationResult,
} from '@/types/kalkia.types'

// Labor types with different hourly rates
const LABOR_TYPES = [
  { id: 'electrician', name: 'Elektriker', rateMultiplier: 1.0, icon: '⚡' },
  { id: 'master', name: 'Mester', rateMultiplier: 1.25, icon: '👷' },
  { id: 'apprentice', name: 'Lærling', rateMultiplier: 0.65, icon: '🔧' },
  { id: 'helper', name: 'Hjælper', rateMultiplier: 0.5, icon: '🛠️' },
] as const

type LaborTypeId = (typeof LABOR_TYPES)[number]['id']

// Time adjustments for overtime, weekend, etc.
const TIME_ADJUSTMENTS = [
  { id: 'normal', name: 'Normal tid', multiplier: 1.0, description: 'Hverdage 07-17' },
  { id: 'overtime', name: 'Overtid', multiplier: 1.5, description: '+50% efter 17' },
  { id: 'weekend', name: 'Weekend', multiplier: 1.75, description: '+75% lør/søn' },
  { id: 'holiday', name: 'Helligdag', multiplier: 2.0, description: '+100% helligdage' },
  { id: 'night', name: 'Natarbejde', multiplier: 1.3, description: '+30% 22-06' },
] as const

type TimeAdjustmentId = (typeof TIME_ADJUSTMENTS)[number]['id']

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
      laborType: LaborTypeId
      timeAdjustment: TimeAdjustmentId
    }
  }) => Promise<void>
  onClone?: (data: {
    name: string
    description: string
    items: CalculationItem[]
    settings: {
      hourlyRate: number
      marginPercentage: number
      discountPercentage: number
      laborType: LaborTypeId
      timeAdjustment: TimeAdjustmentId
    }
  }) => Promise<void>
  initialName?: string
  initialDescription?: string
}

export function PackageBuilder({
  onSave,
  onClone,
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
  const [activeTab, setActiveTab] = useState<'quickjobs' | 'rooms' | 'components' | 'packages'>('quickjobs')
  const [calibrationPreset, setCalibrationPreset] = useState<CalibrationPreset | null>(null)
  const [laborType, setLaborType] = useState<LaborTypeId>('electrician')
  const [timeAdjustment, setTimeAdjustment] = useState<TimeAdjustmentId>('normal')

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

      // Get labor type and time adjustment multipliers
      const selectedLaborType = LABOR_TYPES.find((lt) => lt.id === laborType)
      const laborRateMultiplier = selectedLaborType?.rateMultiplier || 1
      const selectedTimeAdjustment = TIME_ADJUSTMENTS.find((ta) => ta.id === timeAdjustment)
      const timeAdjustmentMultiplier = selectedTimeAdjustment?.multiplier || 1

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

      // Calculate labor cost with labor type and time adjustment multipliers
      const effectiveHourlyRate = hourlyRate * laborRateMultiplier * timeAdjustmentMultiplier
      const totalLaborCost = totalLaborHours * effectiveHourlyRate
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
  }, [items, selectedProfileId, buildingProfiles, hourlyRate, marginPercentage, discountPercentage, laborType, timeAdjustment])

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
          laborType,
          timeAdjustment,
        },
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleClone = async () => {
    if (!onClone) return

    setIsSaving(true)
    try {
      await onClone({
        name: `${name.trim()} (Kopi)`,
        description: description.trim(),
        items,
        settings: {
          hourlyRate,
          marginPercentage,
          discountPercentage,
          laborType,
          timeAdjustment,
        },
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Apply calibration preset settings
  const handleCalibrationPresetChange = useCallback((preset: CalibrationPreset | null) => {
    setCalibrationPreset(preset)
    if (preset) {
      if (preset.hourly_rate) {
        setHourlyRate(preset.hourly_rate)
      }
      if (preset.margin_percentage) {
        setMarginPercentage(preset.margin_percentage)
      }
      // Find and set building profile if specified
      if (preset.default_building_profile_id) {
        setSelectedProfileId(preset.default_building_profile_id)
      }
    }
  }, [])

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

          {onClone && items.length > 0 && (
            <Button variant="outline" onClick={handleClone} disabled={isSaving}>
              <Copy className="w-4 h-4 mr-2" />
              Klon som skabelon
            </Button>
          )}
          {onSave && (
            <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Gemmer...' : 'Gem kalkulation'}
            </Button>
          )}
        </div>

        {/* Settings Bar */}
        <Collapsible open={showSettings} onOpenChange={setShowSettings}>
          <div className="flex items-center gap-4 flex-wrap">
            {/* Calibration Preset */}
            <CalibrationPresetPicker
              value={calibrationPreset?.id || null}
              onChange={handleCalibrationPresetChange}
            />

            <div className="h-6 w-px bg-gray-200" />

            {/* Building Profile */}
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

            {/* Labor type and time adjustment indicators */}
            {(laborType !== 'electrician' || timeAdjustment !== 'normal') && (
              <div className="flex items-center gap-2">
                {laborType !== 'electrician' && (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                    <Users className="w-3 h-3 mr-1" />
                    {LABOR_TYPES.find((lt) => lt.id === laborType)?.name}
                  </Badge>
                )}
                {timeAdjustment !== 'normal' && (
                  <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                    <Clock className="w-3 h-3 mr-1" />
                    {TIME_ADJUSTMENTS.find((ta) => ta.id === timeAdjustment)?.name}
                  </Badge>
                )}
              </div>
            )}

            <div className="flex-1" />

            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                <Settings className="w-4 h-4 mr-2" />
                Flere indstillinger
                <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent>
            <Card className="mt-4">
              <CardContent className="py-4 space-y-4">
                {/* Basic settings */}
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

                {/* Labor type and time adjustment */}
                <div className="border-t pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Labor Type Selection */}
                    <div>
                      <label className="text-sm font-medium text-gray-700 flex items-center gap-1 mb-2">
                        <Users className="w-4 h-4" />
                        Arbejdstype
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {LABOR_TYPES.map((lt) => (
                          <button
                            key={lt.id}
                            onClick={() => setLaborType(lt.id)}
                            className={`p-2 rounded-lg border text-left transition-colors ${
                              laborType === lt.id
                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span>{lt.icon}</span>
                              <div>
                                <p className="text-sm font-medium">{lt.name}</p>
                                <p className="text-xs text-gray-500">
                                  {lt.rateMultiplier === 1
                                    ? 'Standard'
                                    : lt.rateMultiplier > 1
                                    ? `+${((lt.rateMultiplier - 1) * 100).toFixed(0)}%`
                                    : `-${((1 - lt.rateMultiplier) * 100).toFixed(0)}%`}
                                </p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Time Adjustment Selection */}
                    <div>
                      <label className="text-sm font-medium text-gray-700 flex items-center gap-1 mb-2">
                        <Clock className="w-4 h-4" />
                        Tidstillæg
                      </label>
                      <div className="space-y-1">
                        {TIME_ADJUSTMENTS.map((ta) => (
                          <button
                            key={ta.id}
                            onClick={() => setTimeAdjustment(ta.id)}
                            className={`w-full p-2 rounded-lg border text-left transition-colors flex items-center justify-between ${
                              timeAdjustment === ta.id
                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div>
                              <p className="text-sm font-medium">{ta.name}</p>
                              <p className="text-xs text-gray-500">{ta.description}</p>
                            </div>
                            <Badge
                              variant={ta.multiplier > 1 ? 'default' : 'secondary'}
                              className={ta.multiplier > 1 ? 'bg-orange-100 text-orange-700' : ''}
                            >
                              {ta.multiplier}x
                            </Badge>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Effective rate display */}
                {(laborType !== 'electrician' || timeAdjustment !== 'normal') && (
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between bg-blue-50 rounded-lg p-3">
                      <div>
                        <p className="text-sm font-medium text-blue-700">Effektiv timepris</p>
                        <p className="text-xs text-blue-600">
                          {LABOR_TYPES.find((lt) => lt.id === laborType)?.name} + {TIME_ADJUSTMENTS.find((ta) => ta.id === timeAdjustment)?.name}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-blue-700">
                          {Math.round(
                            hourlyRate *
                              (LABOR_TYPES.find((lt) => lt.id === laborType)?.rateMultiplier || 1) *
                              (TIME_ADJUSTMENTS.find((ta) => ta.id === timeAdjustment)?.multiplier || 1)
                          ).toLocaleString('da-DK')}{' '}
                          kr/t
                        </p>
                        <p className="text-xs text-blue-600">
                          ({hourlyRate} × {LABOR_TYPES.find((lt) => lt.id === laborType)?.rateMultiplier} × {TIME_ADJUSTMENTS.find((ta) => ta.id === timeAdjustment)?.multiplier})
                        </p>
                      </div>
                    </div>
                  </div>
                )}
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
                onClick={() => setActiveTab('quickjobs')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'quickjobs'
                    ? 'bg-yellow-100 text-yellow-800 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                Jobs
              </button>
              <button
                onClick={() => setActiveTab('rooms')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'rooms'
                    ? 'bg-purple-100 text-purple-800 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Home className="w-3.5 h-3.5" />
                Rum
              </button>
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
            {activeTab === 'quickjobs' ? (
              <QuickJobsPicker onAddItems={handleAddItems} />
            ) : activeTab === 'rooms' ? (
              <RoomCalculator onAddItems={handleAddItems} />
            ) : activeTab === 'components' ? (
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
            laborType={LABOR_TYPES.find((lt) => lt.id === laborType) || null}
            timeAdjustment={TIME_ADJUSTMENTS.find((ta) => ta.id === timeAdjustment) || null}
            hourlyRate={hourlyRate}
          />
        </div>
      </div>
    </div>
  )
}
