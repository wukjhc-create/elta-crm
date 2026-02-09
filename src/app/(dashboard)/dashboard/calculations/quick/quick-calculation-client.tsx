'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  ChevronRight,
  Home,
  Plus,
  Minus,
  Trash2,
  Calculator,
  Check,
  Zap,
  Clock,
  Package,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { createQuickCalculation } from '@/lib/actions/calculations'
import type { ProjectTemplate, RoomType, CalculationSettings } from '@/types/calculation-settings.types'

interface ComponentWithPricing {
  id: string
  code: string
  name: string
  description: string | null
  base_time_minutes: number
  default_cost_price: number
  default_sale_price: number
  complexity_factor: number
  category_name: string
  variants: { code: string; name: string; time_multiplier: number; extra_minutes: number }[]
}

interface QuickCalculationClientProps {
  templates: ProjectTemplate[]
  roomTypes: RoomType[]
  components: ComponentWithPricing[]
  settings: CalculationSettings | null
}

interface RoomConfig {
  id: string
  roomTypeCode: string
  roomTypeName: string
  name: string
  components: ComponentConfig[]
}

interface ComponentConfig {
  id: string
  componentCode: string
  componentName: string
  variantCode?: string
  quantity: number
  timeMinutes: number
  costPrice: number
  salePrice: number
}

const STEPS = [
  { id: 'template', title: 'Projekttype', description: 'Vælg projekttype' },
  { id: 'rooms', title: 'Rum', description: 'Konfigurer rum' },
  { id: 'review', title: 'Oversigt', description: 'Gennemgå og opret' },
]

export default function QuickCalculationClient({
  templates,
  roomTypes,
  components,
  settings,
}: QuickCalculationClientProps) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()

  const [currentStep, setCurrentStep] = useState(0)
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null)
  const [projectName, setProjectName] = useState('')
  const [rooms, setRooms] = useState<RoomConfig[]>([])

  // Get room type by code
  const getRoomType = (code: string) => roomTypes.find(rt => rt.code === code)

  // Get component by code
  const getComponent = (code: string) => components.find(c => c.code === code)

  // Initialize rooms from template
  const initializeFromTemplate = (template: ProjectTemplate) => {
    setSelectedTemplate(template)
    setProjectName(template.name)

    const initialRooms: RoomConfig[] = []

    for (const defaultRoom of template.default_rooms || []) {
      const roomType = getRoomType(defaultRoom.room_type)
      if (!roomType) continue

      for (let i = 0; i < (defaultRoom.count || 1); i++) {
        const roomComponents: ComponentConfig[] = []

        for (const dc of roomType.default_components || []) {
          const comp = getComponent(dc.component_code)
          if (!comp) continue

          roomComponents.push({
            id: `${Date.now()}-${Math.random()}`,
            componentCode: dc.component_code,
            componentName: comp.name,
            variantCode: dc.variant,
            quantity: dc.quantity || 1,
            timeMinutes: comp.base_time_minutes * (dc.quantity || 1),
            costPrice: comp.default_cost_price,
            salePrice: comp.default_sale_price,
          })
        }

        initialRooms.push({
          id: `${Date.now()}-${Math.random()}-${i}`,
          roomTypeCode: roomType.code,
          roomTypeName: roomType.name,
          name: defaultRoom.count > 1
            ? `${defaultRoom.name || roomType.name} ${i + 1}`
            : defaultRoom.name || roomType.name,
          components: roomComponents,
        })
      }
    }

    setRooms(initialRooms)
  }

  // Add a room
  const addRoom = (roomTypeCode: string) => {
    const roomType = getRoomType(roomTypeCode)
    if (!roomType) return

    const roomComponents: ComponentConfig[] = []

    for (const dc of roomType.default_components || []) {
      const comp = getComponent(dc.component_code)
      if (!comp) continue

      roomComponents.push({
        id: `${Date.now()}-${Math.random()}`,
        componentCode: dc.component_code,
        componentName: comp.name,
        variantCode: dc.variant,
        quantity: dc.quantity || 1,
        timeMinutes: comp.base_time_minutes * (dc.quantity || 1),
        costPrice: comp.default_cost_price,
        salePrice: comp.default_sale_price,
      })
    }

    const existingCount = rooms.filter(r => r.roomTypeCode === roomTypeCode).length

    setRooms(prev => [...prev, {
      id: `${Date.now()}-${Math.random()}`,
      roomTypeCode: roomType.code,
      roomTypeName: roomType.name,
      name: `${roomType.name} ${existingCount + 1}`,
      components: roomComponents,
    }])
  }

  // Remove a room
  const removeRoom = (roomId: string) => {
    setRooms(prev => prev.filter(r => r.id !== roomId))
  }

  // Update component quantity
  const updateComponentQuantity = (roomId: string, componentId: string, delta: number) => {
    setRooms(prev => prev.map(room => {
      if (room.id !== roomId) return room
      return {
        ...room,
        components: room.components.map(comp => {
          if (comp.id !== componentId) return comp
          const newQty = Math.max(0, comp.quantity + delta)
          const baseComp = getComponent(comp.componentCode)
          return {
            ...comp,
            quantity: newQty,
            timeMinutes: (baseComp?.base_time_minutes || 0) * newQty,
          }
        }).filter(comp => comp.quantity > 0),
      }
    }))
  }

  // Add component to room
  const addComponentToRoom = (roomId: string, componentCode: string) => {
    const comp = getComponent(componentCode)
    if (!comp) return

    setRooms(prev => prev.map(room => {
      if (room.id !== roomId) return room

      // Check if component already exists
      const existing = room.components.find(c => c.componentCode === componentCode)
      if (existing) {
        return {
          ...room,
          components: room.components.map(c => {
            if (c.componentCode !== componentCode) return c
            return {
              ...c,
              quantity: c.quantity + 1,
              timeMinutes: comp.base_time_minutes * (c.quantity + 1),
            }
          }),
        }
      }

      return {
        ...room,
        components: [...room.components, {
          id: `${Date.now()}-${Math.random()}`,
          componentCode: comp.code,
          componentName: comp.name,
          quantity: 1,
          timeMinutes: comp.base_time_minutes,
          costPrice: comp.default_cost_price,
          salePrice: comp.default_sale_price,
        }],
      }
    }))
  }

  // Calculate totals
  const totals = {
    totalTimeMinutes: rooms.reduce((sum, room) =>
      sum + room.components.reduce((s, c) => s + c.timeMinutes, 0), 0),
    totalCostPrice: rooms.reduce((sum, room) =>
      sum + room.components.reduce((s, c) => s + c.costPrice * c.quantity, 0), 0),
    totalSalePrice: rooms.reduce((sum, room) =>
      sum + room.components.reduce((s, c) => s + c.salePrice * c.quantity, 0), 0),
    totalComponents: rooms.reduce((sum, room) =>
      sum + room.components.reduce((s, c) => s + c.quantity, 0), 0),
  }

  // Add labor cost based on settings
  const hourlyRate = settings?.hourly_rates?.electrician || 495
  const laborHours = totals.totalTimeMinutes / 60
  const laborCost = laborHours * hourlyRate

  const grandTotal = totals.totalSalePrice + laborCost
  const totalCostWithLabor = totals.totalCostPrice + (laborHours * (settings?.hourly_rates?.apprentice || 295))
  const dbAmount = grandTotal - totalCostWithLabor
  const dbPercentage = grandTotal > 0 ? (dbAmount / grandTotal) * 100 : 0

  // Format time
  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0 ? `${hours}t ${mins}m` : `${mins}m`
  }

  // Format price
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price)
  }

  // Create calculation
  const handleCreate = () => {
    if (!projectName.trim()) {
      toast.error('Angiv venligst et projektnavn')
      return
    }

    startTransition(async () => {
      const result = await createQuickCalculation({
        name: projectName,
        calculationMode: 'electrician',
        projectType: selectedTemplate?.project_type || 'residential',
        rooms: rooms.map(room => ({
          roomTypeCode: room.roomTypeCode,
          name: room.name,
          components: room.components.map(comp => ({
            componentCode: comp.componentCode,
            variantCode: comp.variantCode,
            quantity: comp.quantity,
          })),
        })),
        hourlyRate,
      })

      if (result.success && result.data) {
        toast.success('Kalkulation oprettet')
        router.push(`/dashboard/calculations/${result.data.id}`)
      } else {
        toast.error(result.error || 'Kunne ikke oprette kalkulation')
      }
    })
  }

  // Navigation
  const canGoNext = () => {
    if (currentStep === 0) return selectedTemplate !== null
    if (currentStep === 1) return rooms.length > 0 && rooms.some(r => r.components.length > 0)
    return true
  }

  const goNext = () => {
    if (currentStep < STEPS.length - 1 && canGoNext()) {
      setCurrentStep(prev => prev + 1)
    }
  }

  const goBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Hurtig Kalkulation</h1>
        <p className="text-gray-600 mt-1">
          Opret hurtigt en kalkulation baseret på projekttype og rum
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-4">
        {STEPS.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => index < currentStep && setCurrentStep(index)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors',
                index === currentStep
                  ? 'bg-primary text-primary-foreground'
                  : index < currentStep
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-400'
              )}
              disabled={index > currentStep}
            >
              {index < currentStep ? (
                <Check className="w-4 h-4" />
              ) : (
                <span className="w-5 h-5 flex items-center justify-center rounded-full bg-current/10 text-sm">
                  {index + 1}
                </span>
              )}
              <span className="font-medium">{step.title}</span>
            </button>
            {index < STEPS.length - 1 && (
              <ChevronRight className="w-5 h-5 mx-2 text-gray-300" />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="min-h-[500px]">
        {/* Step 1: Select Template */}
        {currentStep === 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Vælg projekttype</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map(template => (
                <Card
                  key={template.id}
                  className={cn(
                    'cursor-pointer transition-all hover:shadow-md',
                    selectedTemplate?.id === template.id && 'ring-2 ring-primary'
                  )}
                  onClick={() => initializeFromTemplate(template)}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Home className="w-5 h-5" />
                      {template.name}
                    </CardTitle>
                    {template.description && (
                      <CardDescription>{template.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <Badge variant="secondary">
                      {template.project_type === 'residential' && 'Bolig'}
                      {template.project_type === 'commercial' && 'Erhverv'}
                      {template.project_type === 'industrial' && 'Industri'}
                      {template.project_type === 'solar' && 'Solcelle'}
                    </Badge>
                    {template.default_rooms && template.default_rooms.length > 0 && (
                      <p className="text-sm text-gray-500 mt-2">
                        {template.default_rooms.reduce((sum, r) => sum + (r.count || 1), 0)} rum inkluderet
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Configure Rooms */}
        {currentStep === 1 && (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Konfigurer rum</h2>
                <div className="flex gap-2">
                  {roomTypes.slice(0, 4).map(rt => (
                    <Button
                      key={rt.code}
                      variant="outline"
                      size="sm"
                      onClick={() => addRoom(rt.code)}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      {rt.name}
                    </Button>
                  ))}
                </div>
              </div>

              {rooms.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-gray-500">
                    <Home className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Ingen rum tilføjet endnu</p>
                    <p className="text-sm">Tilføj rum med knapperne ovenfor</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {rooms.map(room => (
                    <Card key={room.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Home className="w-5 h-5 text-gray-500" />
                            <Input
                              value={room.name}
                              onChange={(e) => setRooms(prev => prev.map(r =>
                                r.id === room.id ? { ...r, name: e.target.value } : r
                              ))}
                              className="font-medium h-8 w-48"
                            />
                            <Badge variant="outline">{room.roomTypeName}</Badge>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Fjern rum"
                            onClick={() => removeRoom(room.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {room.components.map(comp => (
                            <div
                              key={comp.id}
                              className="flex items-center justify-between py-2 border-b last:border-0"
                            >
                              <div className="flex items-center gap-2">
                                <Zap className="w-4 h-4 text-yellow-500" />
                                <span>{comp.componentName}</span>
                                {comp.variantCode && (
                                  <Badge variant="secondary" className="text-xs">
                                    {comp.variantCode}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-4">
                                <span className="text-sm text-gray-500">
                                  <Clock className="w-3 h-3 inline mr-1" />
                                  {formatTime(comp.timeMinutes)}
                                </span>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    aria-label="Minus"
                                    onClick={() => updateComponentQuantity(room.id, comp.id, -1)}
                                  >
                                    <Minus className="w-3 h-3" />
                                  </Button>
                                  <span className="w-8 text-center font-medium">{comp.quantity}</span>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    aria-label="Plus"
                                    onClick={() => updateComponentQuantity(room.id, comp.id, 1)}
                                  >
                                    <Plus className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}

                          {/* Add component dropdown */}
                          <div className="pt-2">
                            <select
                              className="w-full p-2 border rounded text-sm"
                              value=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  addComponentToRoom(room.id, e.target.value)
                                }
                              }}
                            >
                              <option value="">+ Tilføj komponent...</option>
                              {components.map(comp => (
                                <option key={comp.code} value={comp.code}>
                                  {comp.name} ({formatTime(comp.base_time_minutes)})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Summary sidebar */}
            <div className="space-y-4">
              <Card className="sticky top-6">
                <CardHeader>
                  <CardTitle>Opsummering</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Rum</span>
                      <span className="font-medium">{rooms.length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Komponenter</span>
                      <span className="font-medium">{totals.totalComponents}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Samlet tid</span>
                      <span className="font-medium">{formatTime(totals.totalTimeMinutes)}</span>
                    </div>
                  </div>

                  <div className="border-t pt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Materialer</span>
                      <span>{formatPrice(totals.totalSalePrice)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">
                        Arbejdsløn ({laborHours.toFixed(1)}t × {formatPrice(hourlyRate)})
                      </span>
                      <span>{formatPrice(laborCost)}</span>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between font-bold text-lg">
                      <span>Subtotal</span>
                      <span>{formatPrice(grandTotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-green-600 mt-2">
                      <span>DB</span>
                      <span>{formatPrice(dbAmount)} ({dbPercentage.toFixed(1)}%)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {currentStep === 2 && (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-xl font-semibold">Gennemgå og opret</h2>

              <Card>
                <CardHeader>
                  <CardTitle>Projektoplysninger</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="projectName">Projektnavn</Label>
                    <Input
                      id="projectName"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      placeholder="F.eks. El-installation - Hansen"
                    />
                  </div>

                  {selectedTemplate && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Home className="w-4 h-4" />
                      <span>Baseret på: {selectedTemplate.name}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Rum og komponenter</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {rooms.map(room => (
                      <div key={room.id} className="border-b pb-4 last:border-0">
                        <div className="flex items-center gap-2 font-medium mb-2">
                          <Home className="w-4 h-4" />
                          {room.name}
                        </div>
                        <div className="grid grid-cols-2 gap-2 pl-6 text-sm">
                          {room.components.map(comp => (
                            <div key={comp.id} className="flex justify-between">
                              <span className="text-gray-600">{comp.componentName}</span>
                              <span>× {comp.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Final summary */}
            <div>
              <Card className="sticky top-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="w-5 h-5" />
                    Endelig oversigt
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Rum</span>
                      <span className="font-medium">{rooms.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Komponenter</span>
                      <span className="font-medium">{totals.totalComponents}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Samlet arbejdstid</span>
                      <span className="font-medium">{formatTime(totals.totalTimeMinutes)}</span>
                    </div>
                  </div>

                  <div className="border-t pt-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="flex items-center gap-1 text-gray-500">
                        <Package className="w-4 h-4" />
                        Materialer
                      </span>
                      <span>{formatPrice(totals.totalSalePrice)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="flex items-center gap-1 text-gray-500">
                        <Clock className="w-4 h-4" />
                        Arbejdsløn
                      </span>
                      <span>{formatPrice(laborCost)}</span>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between text-lg font-bold">
                      <span>Subtotal</span>
                      <span>{formatPrice(grandTotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-500 mt-1">
                      <span>+ moms (25%)</span>
                      <span>{formatPrice(grandTotal * 0.25)}</span>
                    </div>
                    <div className="flex justify-between text-xl font-bold mt-2 pt-2 border-t">
                      <span>Total inkl. moms</span>
                      <span>{formatPrice(grandTotal * 1.25)}</span>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between text-green-600">
                      <span>Dækningsbidrag</span>
                      <span className="font-medium">
                        {formatPrice(dbAmount)} ({dbPercentage.toFixed(1)}%)
                      </span>
                    </div>
                  </div>

                  <Button
                    className="w-full mt-4"
                    size="lg"
                    onClick={handleCreate}
                    disabled={isPending || !projectName.trim()}
                  >
                    {isPending ? (
                      'Opretter...'
                    ) : (
                      <>
                        <Calculator className="w-5 h-5 mr-2" />
                        Opret kalkulation
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4 border-t">
        <Button
          variant="outline"
          onClick={goBack}
          disabled={currentStep === 0}
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Tilbage
        </Button>

        {currentStep < STEPS.length - 1 && (
          <Button
            onClick={goNext}
            disabled={!canGoNext()}
          >
            Næste
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  )
}
