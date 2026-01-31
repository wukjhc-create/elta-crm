'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Clock,
  Zap,
  Plus,
  Pencil,
  Trash2,
  Save,
  Package,
  ChevronDown,
  ChevronUp,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import {
  updateComponent,
  createVariant,
  updateVariant,
  deleteVariant,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  createVariantMaterial,
  deleteVariantMaterial,
  type ComponentWithDetails,
  type ComponentVariant,
  type ComponentMaterial,
  type VariantMaterial,
} from '@/lib/actions/components'

interface ComponentDetailClientProps {
  component: ComponentWithDetails
  variantMaterialsMap: Record<string, VariantMaterial[] | undefined>
}

export default function ComponentDetailClient({
  component,
  variantMaterialsMap,
}: ComponentDetailClientProps) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()

  // Component edit state
  const [isEditingComponent, setIsEditingComponent] = useState(false)
  const [componentForm, setComponentForm] = useState({
    name: component.name,
    description: component.description || '',
    base_time_minutes: component.base_time_minutes,
    default_cost_price: component.default_cost_price || 0,
    default_sale_price: component.default_sale_price || 0,
  })

  // Variant dialog state
  const [showVariantDialog, setShowVariantDialog] = useState(false)
  const [editingVariant, setEditingVariant] = useState<ComponentVariant | null>(null)
  const [variantForm, setVariantForm] = useState({
    name: '',
    code: '',
    time_multiplier: 1.0,
    extra_minutes: 0,
    is_default: false,
    is_active: true,
  })

  // Material dialog state
  const [showMaterialDialog, setShowMaterialDialog] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<ComponentMaterial | null>(null)
  const [materialForm, setMaterialForm] = useState({
    material_name: '',
    quantity: 1,
    unit: 'stk',
    is_optional: false,
    cost_price: 0,
    sale_price: 0,
  })

  // Variant material dialog state
  const [showVariantMaterialDialog, setShowVariantMaterialDialog] = useState(false)
  const [selectedVariantForMaterial, setSelectedVariantForMaterial] = useState<string | null>(null)
  const [variantMaterialForm, setVariantMaterialForm] = useState({
    material_name: '',
    quantity: 1,
    unit: 'stk',
    replaces_base: false,
    cost_price: 0,
    sale_price: 0,
  })

  // Expanded variants
  const [expandedVariants, setExpandedVariants] = useState<Set<string>>(new Set())

  const toggleVariantExpanded = (variantId: string) => {
    const newExpanded = new Set(expandedVariants)
    if (newExpanded.has(variantId)) {
      newExpanded.delete(variantId)
    } else {
      newExpanded.add(variantId)
    }
    setExpandedVariants(newExpanded)
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

  // Save component
  const handleSaveComponent = () => {
    startTransition(async () => {
      const result = await updateComponent(component.id, {
        name: componentForm.name,
        description: componentForm.description || null,
        base_time_minutes: componentForm.base_time_minutes,
        default_cost_price: componentForm.default_cost_price,
        default_sale_price: componentForm.default_sale_price,
      })

      if (result.success) {
        toast.success('Komponent opdateret')
        setIsEditingComponent(false)
        router.refresh()
      } else {
        toast.error(result.error || 'Kunne ikke opdatere komponent')
      }
    })
  }

  // Variant handlers
  const openVariantDialog = (variant?: ComponentVariant) => {
    if (variant) {
      setEditingVariant(variant)
      setVariantForm({
        name: variant.name,
        code: variant.code || '',
        time_multiplier: variant.time_multiplier,
        extra_minutes: variant.extra_minutes,
        is_default: variant.is_default,
        is_active: variant.is_active ?? true,
      })
    } else {
      setEditingVariant(null)
      setVariantForm({
        name: '',
        code: '',
        time_multiplier: 1.0,
        extra_minutes: 0,
        is_default: false,
        is_active: true,
      })
    }
    setShowVariantDialog(true)
  }

  const handleSaveVariant = () => {
    startTransition(async () => {
      if (editingVariant) {
        const result = await updateVariant(editingVariant.id, component.id, variantForm)
        if (result.success) {
          toast.success('Variant opdateret')
          setShowVariantDialog(false)
          router.refresh()
        } else {
          toast.error(result.error || 'Kunne ikke opdatere variant')
        }
      } else {
        const result = await createVariant(component.id, variantForm)
        if (result.success) {
          toast.success('Variant oprettet')
          setShowVariantDialog(false)
          router.refresh()
        } else {
          toast.error(result.error || 'Kunne ikke oprette variant')
        }
      }
    })
  }

  const handleDeleteVariant = (variant: ComponentVariant) => {
    if (!confirm(`Er du sikker på at du vil slette varianten "${variant.name}"?`)) return

    startTransition(async () => {
      const result = await deleteVariant(variant.id, component.id)
      if (result.success) {
        toast.success('Variant slettet')
        router.refresh()
      } else {
        toast.error(result.error || 'Kunne ikke slette variant')
      }
    })
  }

  // Material handlers
  const openMaterialDialog = (material?: ComponentMaterial) => {
    if (material) {
      setEditingMaterial(material)
      setMaterialForm({
        material_name: material.material_name,
        quantity: material.quantity,
        unit: material.unit,
        is_optional: material.is_optional,
        cost_price: material.cost_price ?? 0,
        sale_price: material.sale_price ?? 0,
      })
    } else {
      setEditingMaterial(null)
      setMaterialForm({
        material_name: '',
        quantity: 1,
        unit: 'stk',
        is_optional: false,
        cost_price: 0,
        sale_price: 0,
      })
    }
    setShowMaterialDialog(true)
  }

  const handleSaveMaterial = () => {
    startTransition(async () => {
      if (editingMaterial) {
        const result = await updateMaterial(editingMaterial.id, component.id, materialForm)
        if (result.success) {
          toast.success('Materiale opdateret')
          setShowMaterialDialog(false)
          router.refresh()
        } else {
          toast.error(result.error || 'Kunne ikke opdatere materiale')
        }
      } else {
        const result = await createMaterial(component.id, materialForm)
        if (result.success) {
          toast.success('Materiale oprettet')
          setShowMaterialDialog(false)
          router.refresh()
        } else {
          toast.error(result.error || 'Kunne ikke oprette materiale')
        }
      }
    })
  }

  const handleDeleteMaterial = (material: ComponentMaterial) => {
    if (!confirm(`Er du sikker på at du vil slette "${material.material_name}"?`)) return

    startTransition(async () => {
      const result = await deleteMaterial(material.id, component.id)
      if (result.success) {
        toast.success('Materiale slettet')
        router.refresh()
      } else {
        toast.error(result.error || 'Kunne ikke slette materiale')
      }
    })
  }

  // Variant material handlers
  const openVariantMaterialDialog = (variantId: string) => {
    setSelectedVariantForMaterial(variantId)
    setVariantMaterialForm({
      material_name: '',
      quantity: 1,
      unit: 'stk',
      replaces_base: false,
      cost_price: 0,
      sale_price: 0,
    })
    setShowVariantMaterialDialog(true)
  }

  const handleSaveVariantMaterial = () => {
    if (!selectedVariantForMaterial) return

    startTransition(async () => {
      const result = await createVariantMaterial(
        selectedVariantForMaterial,
        component.id,
        variantMaterialForm
      )
      if (result.success) {
        toast.success('Variant-materiale tilføjet')
        setShowVariantMaterialDialog(false)
        router.refresh()
      } else {
        toast.error(result.error || 'Kunne ikke tilføje materiale')
      }
    })
  }

  const handleDeleteVariantMaterial = (vmId: string) => {
    if (!confirm('Er du sikker på at du vil slette dette materiale?')) return

    startTransition(async () => {
      const result = await deleteVariantMaterial(vmId, component.id)
      if (result.success) {
        toast.success('Materiale slettet')
        router.refresh()
      } else {
        toast.error(result.error || 'Kunne ikke slette materiale')
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/settings/components">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900">{component.name}</h1>
          <div className="flex items-center gap-3 mt-1 text-gray-500">
            {component.code && <Badge variant="outline">{component.code}</Badge>}
            {component.category && <span>{component.category.name}</span>}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Component Details */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Komponent detaljer
              </CardTitle>
              {isEditingComponent ? (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setIsEditingComponent(false)}>
                    Annuller
                  </Button>
                  <Button size="sm" onClick={handleSaveComponent} disabled={isPending}>
                    <Save className="w-4 h-4 mr-2" />
                    Gem
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setIsEditingComponent(true)}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Rediger
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {isEditingComponent ? (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Navn</Label>
                    <Input
                      id="name"
                      value={componentForm.name}
                      onChange={(e) => setComponentForm(f => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Beskrivelse</Label>
                    <Input
                      id="description"
                      value={componentForm.description}
                      onChange={(e) => setComponentForm(f => ({ ...f, description: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="base_time">Basis tid (minutter)</Label>
                      <Input
                        id="base_time"
                        type="number"
                        min="0"
                        value={componentForm.base_time_minutes}
                        onChange={(e) => setComponentForm(f => ({ ...f, base_time_minutes: parseInt(e.target.value) || 0 }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="cost_price">Kostpris</Label>
                      <Input
                        id="cost_price"
                        type="number"
                        min="0"
                        step="0.01"
                        value={componentForm.default_cost_price}
                        onChange={(e) => setComponentForm(f => ({ ...f, default_cost_price: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="sale_price">Salgspris</Label>
                      <Input
                        id="sale_price"
                        type="number"
                        min="0"
                        step="0.01"
                        value={componentForm.default_sale_price}
                        onChange={(e) => setComponentForm(f => ({ ...f, default_sale_price: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-gray-500">Basis tid</span>
                    <p className="font-medium flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      {formatTime(component.base_time_minutes)}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Sværhedsgrad</span>
                    <p className="font-medium">{component.difficulty_level}/5</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Kostpris</span>
                    <p className="font-medium">{formatPrice(component.default_cost_price || 0)}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Salgspris</span>
                    <p className="font-medium">{formatPrice(component.default_sale_price || 0)}</p>
                  </div>
                  {component.description && (
                    <div className="col-span-2">
                      <span className="text-sm text-gray-500">Beskrivelse</span>
                      <p className="font-medium">{component.description}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Variants */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Varianter ({component.variants.length})</CardTitle>
              <Button size="sm" onClick={() => openVariantDialog()}>
                <Plus className="w-4 h-4 mr-2" />
                Tilføj variant
              </Button>
            </CardHeader>
            <CardContent>
              {component.variants.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Ingen varianter</p>
              ) : (
                <div className="space-y-3">
                  {component.variants.map(variant => {
                    const isExpanded = expandedVariants.has(variant.id)
                    const variantMaterials = variantMaterialsMap[variant.id] || []
                    const calculatedTime = Math.round(
                      component.base_time_minutes * variant.time_multiplier + variant.extra_minutes
                    )

                    return (
                      <div key={variant.id} className="border rounded-lg">
                        <div
                          className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                          onClick={() => toggleVariantExpanded(variant.id)}
                        >
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-gray-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-gray-400" />
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{variant.name}</span>
                                {variant.code && (
                                  <Badge variant="outline" className="text-xs">{variant.code}</Badge>
                                )}
                                {variant.is_default && (
                                  <Badge className="text-xs bg-green-100 text-green-700">Standard</Badge>
                                )}
                                {variant.is_active === false && (
                                  <Badge className="text-xs bg-gray-100 text-gray-500">Inaktiv</Badge>
                                )}
                              </div>
                              <div className="text-sm text-gray-500 mt-1">
                                Tid: {formatTime(calculatedTime)}
                                {variant.time_multiplier !== 1 && (
                                  <span className="ml-2">({variant.time_multiplier}x)</span>
                                )}
                                {variant.extra_minutes > 0 && (
                                  <span className="ml-2">(+{variant.extra_minutes} min)</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openVariantDialog(variant)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-500"
                              onClick={() => handleDeleteVariant(variant)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="border-t bg-gray-50 p-4">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-sm font-medium text-gray-700">
                                Ekstra materialer for denne variant
                              </h4>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openVariantMaterialDialog(variant.id)}
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                Tilføj
                              </Button>
                            </div>
                            {variantMaterials.length === 0 ? (
                              <p className="text-sm text-gray-500">Ingen ekstra materialer</p>
                            ) : (
                              <div className="space-y-2">
                                {variantMaterials.map(vm => (
                                  <div
                                    key={vm.id}
                                    className="flex items-center justify-between text-sm bg-white rounded p-2"
                                  >
                                    <div className="flex items-center gap-2">
                                      <Package className="w-4 h-4 text-gray-400" />
                                      <span>{vm.material_name}</span>
                                      <span className="text-gray-500">
                                        {vm.quantity} {vm.unit}
                                      </span>
                                      {vm.replaces_base && (
                                        <Badge variant="outline" className="text-xs">Erstatter basis</Badge>
                                      )}
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-red-500"
                                      onClick={() => handleDeleteVariantMaterial(vm.id)}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Materials */}
        <div>
          <Card className="sticky top-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Basis materialer
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => openMaterialDialog()}>
                <Plus className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {component.materials.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Ingen materialer</p>
              ) : (
                <div className="space-y-3">
                  {component.materials.map(material => (
                    <div
                      key={material.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{material.material_name}</span>
                          {material.is_optional && (
                            <Badge variant="outline" className="text-xs">Valgfri</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <span>{material.quantity} {material.unit}</span>
                          {(material.cost_price > 0 || material.sale_price > 0) && (
                            <span className="text-xs">
                              ({formatPrice(material.cost_price ?? 0)} / {formatPrice(material.sale_price ?? 0)})
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openMaterialDialog(material)}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-500"
                          onClick={() => handleDeleteMaterial(material)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Variant Dialog */}
      <Dialog open={showVariantDialog} onOpenChange={setShowVariantDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingVariant ? 'Rediger variant' : 'Tilføj variant'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="var_name">Navn</Label>
                <Input
                  id="var_name"
                  value={variantForm.name}
                  onChange={(e) => setVariantForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="F.eks. Gipsvæg"
                />
              </div>
              <div>
                <Label htmlFor="var_code">Kode</Label>
                <Input
                  id="var_code"
                  value={variantForm.code}
                  onChange={(e) => setVariantForm(f => ({ ...f, code: e.target.value }))}
                  placeholder="F.eks. GIPS"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="var_mult">Tidsmultiplikator</Label>
                <Input
                  id="var_mult"
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={variantForm.time_multiplier}
                  onChange={(e) => setVariantForm(f => ({ ...f, time_multiplier: parseFloat(e.target.value) || 1 }))}
                />
                <p className="text-xs text-gray-500 mt-1">1.0 = normal tid, 1.5 = 50% ekstra</p>
              </div>
              <div>
                <Label htmlFor="var_extra">Ekstra minutter</Label>
                <Input
                  id="var_extra"
                  type="number"
                  min="0"
                  value={variantForm.extra_minutes}
                  onChange={(e) => setVariantForm(f => ({ ...f, extra_minutes: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="var_default"
                  checked={variantForm.is_default}
                  onChange={(e) => setVariantForm(f => ({ ...f, is_default: e.target.checked }))}
                  className="rounded"
                />
                <Label htmlFor="var_default">Standard variant</Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="var_active"
                  checked={variantForm.is_active}
                  onChange={(e) => setVariantForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="rounded"
                />
                <Label htmlFor="var_active">Aktiv</Label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowVariantDialog(false)}>
                Annuller
              </Button>
              <Button onClick={handleSaveVariant} disabled={isPending || !variantForm.name}>
                {editingVariant ? 'Opdater' : 'Opret'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Material Dialog */}
      <Dialog open={showMaterialDialog} onOpenChange={setShowMaterialDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingMaterial ? 'Rediger materiale' : 'Tilføj materiale'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="mat_name">Materiale navn</Label>
              <Input
                id="mat_name"
                value={materialForm.material_name}
                onChange={(e) => setMaterialForm(f => ({ ...f, material_name: e.target.value }))}
                placeholder="F.eks. Stikkontakt 1-fag"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="mat_qty">Antal</Label>
                <Input
                  id="mat_qty"
                  type="number"
                  step="0.01"
                  min="0"
                  value={materialForm.quantity}
                  onChange={(e) => setMaterialForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label htmlFor="mat_unit">Enhed</Label>
                <Input
                  id="mat_unit"
                  value={materialForm.unit}
                  onChange={(e) => setMaterialForm(f => ({ ...f, unit: e.target.value }))}
                  placeholder="stk, m, kg"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="mat_cost">Kostpris (kr)</Label>
                <Input
                  id="mat_cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={materialForm.cost_price}
                  onChange={(e) => setMaterialForm(f => ({ ...f, cost_price: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label htmlFor="mat_sale">Salgspris (kr)</Label>
                <Input
                  id="mat_sale"
                  type="number"
                  step="0.01"
                  min="0"
                  value={materialForm.sale_price}
                  onChange={(e) => setMaterialForm(f => ({ ...f, sale_price: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="mat_optional"
                checked={materialForm.is_optional}
                onChange={(e) => setMaterialForm(f => ({ ...f, is_optional: e.target.checked }))}
                className="rounded"
              />
              <Label htmlFor="mat_optional">Valgfrit materiale</Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowMaterialDialog(false)}>
                Annuller
              </Button>
              <Button onClick={handleSaveMaterial} disabled={isPending || !materialForm.material_name}>
                {editingMaterial ? 'Opdater' : 'Opret'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Variant Material Dialog */}
      <Dialog open={showVariantMaterialDialog} onOpenChange={setShowVariantMaterialDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tilføj materiale til variant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="vm_name">Materiale navn</Label>
              <Input
                id="vm_name"
                value={variantMaterialForm.material_name}
                onChange={(e) => setVariantMaterialForm(f => ({ ...f, material_name: e.target.value }))}
                placeholder="F.eks. Betonprop"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="vm_qty">Antal</Label>
                <Input
                  id="vm_qty"
                  type="number"
                  step="0.01"
                  min="0"
                  value={variantMaterialForm.quantity}
                  onChange={(e) => setVariantMaterialForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label htmlFor="vm_unit">Enhed</Label>
                <Input
                  id="vm_unit"
                  value={variantMaterialForm.unit}
                  onChange={(e) => setVariantMaterialForm(f => ({ ...f, unit: e.target.value }))}
                  placeholder="stk, m"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="vm_cost">Kostpris (kr)</Label>
                <Input
                  id="vm_cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={variantMaterialForm.cost_price}
                  onChange={(e) => setVariantMaterialForm(f => ({ ...f, cost_price: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label htmlFor="vm_sale">Salgspris (kr)</Label>
                <Input
                  id="vm_sale"
                  type="number"
                  step="0.01"
                  min="0"
                  value={variantMaterialForm.sale_price}
                  onChange={(e) => setVariantMaterialForm(f => ({ ...f, sale_price: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="vm_replaces"
                checked={variantMaterialForm.replaces_base}
                onChange={(e) => setVariantMaterialForm(f => ({ ...f, replaces_base: e.target.checked }))}
                className="rounded"
              />
              <Label htmlFor="vm_replaces">Erstatter basis materiale</Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowVariantMaterialDialog(false)}>
                Annuller
              </Button>
              <Button onClick={handleSaveVariantMaterial} disabled={isPending || !variantMaterialForm.material_name}>
                Tilføj
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
