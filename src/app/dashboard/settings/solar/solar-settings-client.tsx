'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sun,
  Zap,
  Battery,
  Home,
  Calculator,
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  ArrowLeft,
} from 'lucide-react'
import Link from 'next/link'
import { useToast } from '@/components/ui/toast'
import {
  createSolarProduct,
  updateSolarProduct,
  deleteSolarProduct,
  updateSolarAssumptions,
} from '@/lib/actions/solar-products'
import type {
  SolarProductsByType,
  SolarAssumptions,
  SolarProduct,
  SolarProductType,
  CreateSolarProductInput,
  PanelSpecs,
  InverterSpecs,
  BatterySpecs,
  MountingSpecs,
} from '@/types/solar-products.types'

// =====================================================
// Types
// =====================================================

type TabType = 'panels' | 'inverters' | 'batteries' | 'mountings' | 'assumptions'

interface SolarSettingsClientProps {
  initialProducts: SolarProductsByType
  initialAssumptions: SolarAssumptions
}

// =====================================================
// Tab Configuration
// =====================================================

const TABS: { id: TabType; label: string; icon: typeof Sun }[] = [
  { id: 'panels', label: 'Paneler', icon: Sun },
  { id: 'inverters', label: 'Invertere', icon: Zap },
  { id: 'batteries', label: 'Batterier', icon: Battery },
  { id: 'mountings', label: 'Montering', icon: Home },
  { id: 'assumptions', label: 'Beregning', icon: Calculator },
]

// =====================================================
// Main Component
// =====================================================

export function SolarSettingsClient({
  initialProducts,
  initialAssumptions,
}: SolarSettingsClientProps) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()

  const [activeTab, setActiveTab] = useState<TabType>('panels')
  const [products, setProducts] = useState(initialProducts)
  const [assumptions, setAssumptions] = useState(initialAssumptions)

  // Dialog state
  const [showDialog, setShowDialog] = useState(false)
  const [editingProduct, setEditingProduct] = useState<SolarProduct | null>(null)
  const [dialogProductType, setDialogProductType] = useState<SolarProductType>('panel')

  // =====================================================
  // Product CRUD Handlers
  // =====================================================

  const openCreateDialog = (type: SolarProductType) => {
    setEditingProduct(null)
    setDialogProductType(type)
    setShowDialog(true)
  }

  const openEditDialog = (product: SolarProduct) => {
    setEditingProduct(product)
    setDialogProductType(product.product_type)
    setShowDialog(true)
  }

  const handleSaveProduct = async (input: CreateSolarProductInput) => {
    startTransition(async () => {
      if (editingProduct) {
        // Update existing
        const result = await updateSolarProduct(editingProduct.id, {
          name: input.name,
          description: input.description,
          price: input.price,
          specifications: input.specifications,
        })

        if (result.success) {
          toast.success('Produkt opdateret')
          setShowDialog(false)
          router.refresh()
        } else {
          toast.error(result.error || 'Kunne ikke opdatere produkt')
        }
      } else {
        // Create new
        const result = await createSolarProduct(input)

        if (result.success) {
          toast.success('Produkt oprettet')
          setShowDialog(false)
          router.refresh()
        } else {
          toast.error(result.error || 'Kunne ikke oprette produkt')
        }
      }
    })
  }

  const handleDeleteProduct = async (product: SolarProduct) => {
    if (!confirm(`Er du sikker på at du vil slette "${product.name}"?`)) {
      return
    }

    startTransition(async () => {
      const result = await deleteSolarProduct(product.id)

      if (result.success) {
        toast.success('Produkt slettet')
        router.refresh()
      } else {
        toast.error(result.error || 'Kunne ikke slette produkt')
      }
    })
  }

  // =====================================================
  // Assumptions Handler
  // =====================================================

  const handleSaveAssumptions = async () => {
    startTransition(async () => {
      const result = await updateSolarAssumptions(assumptions)

      if (result.success) {
        toast.success('Indstillinger gemt')
      } else {
        toast.error(result.error || 'Kunne ikke gemme indstillinger')
      }
    })
  }

  // =====================================================
  // Render
  // =====================================================

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/settings"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Solcelleindstillinger</h1>
            <p className="text-gray-600 mt-1">
              Administrer produkter og beregningsparametre for solcelleanlæg
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-lg border">
        {activeTab === 'panels' && (
          <ProductList
            title="Solpaneler"
            description="Administrer solpaneler med watt og effektivitet"
            products={products.panels as SolarProduct[]}
            type="panel"
            onAdd={() => openCreateDialog('panel')}
            onEdit={openEditDialog}
            onDelete={handleDeleteProduct}
            isPending={isPending}
            renderSpecs={(p) => {
              const specs = p.specifications as PanelSpecs
              return (
                <>
                  <span className="text-gray-500">{specs.wattage}W</span>
                  <span className="text-gray-400 mx-2">·</span>
                  <span className="text-gray-500">
                    {(specs.efficiency * 100).toFixed(0)}% eff
                  </span>
                </>
              )
            }}
          />
        )}

        {activeTab === 'inverters' && (
          <ProductList
            title="Invertere"
            description="Administrer invertere med kapacitet og type"
            products={products.inverters as SolarProduct[]}
            type="inverter"
            onAdd={() => openCreateDialog('inverter')}
            onEdit={openEditDialog}
            onDelete={handleDeleteProduct}
            isPending={isPending}
            renderSpecs={(p) => {
              const specs = p.specifications as InverterSpecs
              return (
                <>
                  <span className="text-gray-500">{specs.capacity} kW</span>
                  <span className="text-gray-400 mx-2">·</span>
                  <span className="text-gray-500">{(specs.efficiency * 100).toFixed(0)}% eff</span>
                  <span className="text-gray-400 mx-2">·</span>
                  <span className="text-gray-500 capitalize">{specs.inverter_type}</span>
                </>
              )
            }}
          />
        )}

        {activeTab === 'batteries' && (
          <ProductList
            title="Batterier"
            description="Administrer batterier med kapacitet"
            products={products.batteries as SolarProduct[]}
            type="battery"
            onAdd={() => openCreateDialog('battery')}
            onEdit={openEditDialog}
            onDelete={handleDeleteProduct}
            isPending={isPending}
            renderSpecs={(p) => {
              const specs = p.specifications as BatterySpecs
              return (
                <span className="text-gray-500">
                  {specs.capacity} kWh
                </span>
              )
            }}
          />
        )}

        {activeTab === 'mountings' && (
          <ProductList
            title="Monteringstyper"
            description="Administrer monteringstyper med pris og arbejdstid pr. panel"
            products={products.mountings as SolarProduct[]}
            type="mounting"
            onAdd={() => openCreateDialog('mounting')}
            onEdit={openEditDialog}
            onDelete={handleDeleteProduct}
            isPending={isPending}
            renderSpecs={(p) => {
              const specs = p.specifications as MountingSpecs
              return (
                <>
                  <span className="text-gray-500">{specs.price_per_panel} kr/panel</span>
                  <span className="text-gray-400 mx-2">·</span>
                  <span className="text-gray-500">{specs.labor_hours_per_panel} timer/panel</span>
                </>
              )
            }}
          />
        )}

        {activeTab === 'assumptions' && (
          <AssumptionsEditor
            assumptions={assumptions}
            onChange={setAssumptions}
            onSave={handleSaveAssumptions}
            isPending={isPending}
          />
        )}
      </div>

      {/* Product Dialog */}
      {showDialog && (
        <ProductDialog
          type={dialogProductType}
          product={editingProduct}
          onSave={handleSaveProduct}
          onClose={() => setShowDialog(false)}
          isPending={isPending}
        />
      )}
    </div>
  )
}

// =====================================================
// Product List Component
// =====================================================

interface ProductListProps {
  title: string
  description: string
  products: SolarProduct[]
  type: SolarProductType
  onAdd: () => void
  onEdit: (product: SolarProduct) => void
  onDelete: (product: SolarProduct) => void
  isPending: boolean
  renderSpecs: (product: SolarProduct) => React.ReactNode
}

function ProductList({
  title,
  description,
  products,
  onAdd,
  onEdit,
  onDelete,
  isPending,
  renderSpecs,
}: ProductListProps) {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
        <button
          onClick={onAdd}
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          Tilføj
        </button>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          Ingen produkter endnu. Klik &quot;Tilføj&quot; for at oprette det første.
        </div>
      ) : (
        <div className="divide-y">
          {products.map((product) => (
            <div
              key={product.id}
              className="flex items-center justify-between py-4 hover:bg-gray-50 -mx-6 px-6"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-900">{product.name}</span>
                  <span className="text-xs text-gray-400 font-mono">{product.code}</span>
                </div>
                <div className="text-sm mt-1">{renderSpecs(product)}</div>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-medium text-gray-900">
                  {product.price.toLocaleString('da-DK')} kr
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onEdit(product)}
                    disabled={isPending}
                    className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDelete(product)}
                    disabled={isPending}
                    className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// =====================================================
// Assumptions Editor Component
// =====================================================

interface AssumptionsEditorProps {
  assumptions: SolarAssumptions
  onChange: (assumptions: SolarAssumptions) => void
  onSave: () => void
  isPending: boolean
}

function AssumptionsEditor({ assumptions, onChange, onSave, isPending }: AssumptionsEditorProps) {
  const updateValue = (key: keyof SolarAssumptions, value: number) => {
    onChange({ ...assumptions, [key]: value })
  }

  const fields: {
    key: keyof SolarAssumptions
    label: string
    unit: string
    step?: number
    description: string
  }[] = [
    {
      key: 'annualSunHours',
      label: 'Solskinstimer pr. år',
      unit: 'timer',
      step: 10,
      description: 'Gennemsnitlige effektive solskinstimer i Danmark',
    },
    {
      key: 'electricityPrice',
      label: 'Elpris',
      unit: 'kr/kWh',
      step: 0.1,
      description: 'Nuværende elpris pr. kWh',
    },
    {
      key: 'electricityPriceIncrease',
      label: 'Årlig prisstigning',
      unit: '%',
      step: 0.5,
      description: 'Forventet årlig stigning i elpris',
    },
    {
      key: 'feedInTariff',
      label: 'Afregningspris',
      unit: 'kr/kWh',
      step: 0.1,
      description: 'Pris ved salg af overskudsstrøm til nettet',
    },
    {
      key: 'selfConsumptionRatio',
      label: 'Egetforbrug (uden batteri)',
      unit: '%',
      step: 5,
      description: 'Andel af produktion der forbruges direkte',
    },
    {
      key: 'selfConsumptionRatioWithBattery',
      label: 'Egetforbrug (med batteri)',
      unit: '%',
      step: 5,
      description: 'Andel af produktion der forbruges med batteri',
    },
    {
      key: 'annualDegradation',
      label: 'Årlig degradation',
      unit: '%',
      step: 0.1,
      description: 'Årligt effektivitetstab for paneler',
    },
    {
      key: 'laborCostPerHour',
      label: 'Timepris installation',
      unit: 'kr',
      step: 25,
      description: 'Timepris for installationsarbejde',
    },
    {
      key: 'baseInstallationCost',
      label: 'Basis installation',
      unit: 'kr',
      step: 500,
      description: 'Faste installationsomkostninger',
    },
    {
      key: 'systemLifetime',
      label: 'Systemlevetid',
      unit: 'år',
      step: 1,
      description: 'Forventet levetid for beregninger',
    },
    {
      key: 'co2Factor',
      label: 'CO2-faktor',
      unit: 'kg/kWh',
      step: 0.05,
      description: 'CO2 sparet pr. kWh solenergi',
    },
  ]

  // Convert decimal to percentage for display
  const getDisplayValue = (key: keyof SolarAssumptions): number => {
    const value = assumptions[key]
    if (
      key === 'electricityPriceIncrease' ||
      key === 'selfConsumptionRatio' ||
      key === 'selfConsumptionRatioWithBattery' ||
      key === 'annualDegradation'
    ) {
      return value * 100
    }
    return value
  }

  // Convert percentage to decimal for storage
  const setDisplayValue = (key: keyof SolarAssumptions, displayValue: number) => {
    let value = displayValue
    if (
      key === 'electricityPriceIncrease' ||
      key === 'selfConsumptionRatio' ||
      key === 'selfConsumptionRatioWithBattery' ||
      key === 'annualDegradation'
    ) {
      value = displayValue / 100
    }
    updateValue(key, value)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Beregningsparametre</h2>
          <p className="text-sm text-gray-600">
            Globale parametre brugt i alle solcelleberegninger
          </p>
        </div>
        <button
          onClick={onSave}
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          Gem ændringer
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {fields.map((field) => (
          <div key={field.key} className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">{field.label}</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={getDisplayValue(field.key)}
                onChange={(e) => setDisplayValue(field.key, parseFloat(e.target.value) || 0)}
                step={field.step}
                className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <span className="text-sm text-gray-500 w-16">{field.unit}</span>
            </div>
            <p className="text-xs text-gray-500">{field.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// =====================================================
// Product Dialog Component
// =====================================================

interface ProductDialogProps {
  type: SolarProductType
  product: SolarProduct | null
  onSave: (input: CreateSolarProductInput) => void
  onClose: () => void
  isPending: boolean
}

function ProductDialog({ type, product, onSave, onClose, isPending }: ProductDialogProps) {
  const isEditing = !!product

  const [formData, setFormData] = useState<{
    code: string
    name: string
    description: string
    price: number
    // Panel specs
    wattage: number
    panelEfficiency: number
    // Inverter specs
    capacity: number
    inverterEfficiency: number
    inverterType: 'string' | 'hybrid'
    // Battery specs
    batteryCapacity: number
    // Mounting specs
    pricePerPanel: number
    laborHoursPerPanel: number
  }>(() => {
    if (product) {
      const specs = product.specifications as Record<string, unknown>
      return {
        code: product.code,
        name: product.name,
        description: product.description || '',
        price: product.price,
        wattage: (specs.wattage as number) || 400,
        panelEfficiency: ((specs.efficiency as number) || 0.2) * 100,
        capacity: (specs.capacity as number) || 5,
        inverterEfficiency: ((specs.efficiency as number) || 0.97) * 100,
        inverterType: (specs.inverter_type as 'string' | 'hybrid') || 'string',
        batteryCapacity: (specs.capacity as number) || 0,
        pricePerPanel: (specs.price_per_panel as number) || 400,
        laborHoursPerPanel: (specs.labor_hours_per_panel as number) || 0.5,
      }
    }
    return {
      code: '',
      name: '',
      description: '',
      price: 0,
      wattage: 400,
      panelEfficiency: 20,
      capacity: 5,
      inverterEfficiency: 97,
      inverterType: 'string',
      batteryCapacity: 0,
      pricePerPanel: 400,
      laborHoursPerPanel: 0.5,
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    let specifications: Record<string, unknown> = {}

    switch (type) {
      case 'panel':
        specifications = {
          wattage: formData.wattage,
          efficiency: formData.panelEfficiency / 100,
        }
        break
      case 'inverter':
        specifications = {
          capacity: formData.capacity,
          efficiency: formData.inverterEfficiency / 100,
          inverter_type: formData.inverterType,
        }
        break
      case 'battery':
        specifications = {
          capacity: formData.batteryCapacity,
        }
        break
      case 'mounting':
        specifications = {
          price_per_panel: formData.pricePerPanel,
          labor_hours_per_panel: formData.laborHoursPerPanel,
        }
        break
    }

    onSave({
      product_type: type,
      code: formData.code.toUpperCase(),
      name: formData.name,
      description: formData.description || undefined,
      price: formData.price,
      specifications,
    })
  }

  const typeLabels: Record<SolarProductType, string> = {
    panel: 'Solpanel',
    inverter: 'Inverter',
    battery: 'Batteri',
    mounting: 'Monteringstype',
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
          <h2 className="text-xl font-semibold">
            {isEditing ? `Rediger ${typeLabels[type]}` : `Opret ${typeLabels[type]}`}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Common fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kode *</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="F.eks. PANEL-STD"
                disabled={isEditing}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-gray-100"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pris (kr) *</label>
              <input
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                min="0"
                step="100"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Navn *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="F.eks. Standard (400W)"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Beskrivelse</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* Type-specific fields */}
          {type === 'panel' && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Watt *</label>
                <input
                  type="number"
                  value={formData.wattage}
                  onChange={(e) =>
                    setFormData({ ...formData, wattage: parseInt(e.target.value) || 0 })
                  }
                  min="0"
                  step="10"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Effektivitet (%) *
                </label>
                <input
                  type="number"
                  value={formData.panelEfficiency}
                  onChange={(e) =>
                    setFormData({ ...formData, panelEfficiency: parseFloat(e.target.value) || 0 })
                  }
                  min="0"
                  max="100"
                  step="0.5"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                />
              </div>
            </div>
          )}

          {type === 'inverter' && (
            <div className="space-y-4 pt-4 border-t">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Kapacitet (kW) *
                  </label>
                  <input
                    type="number"
                    value={formData.capacity}
                    onChange={(e) =>
                      setFormData({ ...formData, capacity: parseFloat(e.target.value) || 0 })
                    }
                    min="0"
                    step="0.5"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Effektivitet (%) *
                  </label>
                  <input
                    type="number"
                    value={formData.inverterEfficiency}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        inverterEfficiency: parseFloat(e.target.value) || 0,
                      })
                    }
                    min="0"
                    max="100"
                    step="0.5"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                <select
                  value={formData.inverterType}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      inverterType: e.target.value as 'string' | 'hybrid',
                    })
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="string">String Inverter</option>
                  <option value="hybrid">Hybrid Inverter</option>
                </select>
              </div>
            </div>
          )}

          {type === 'battery' && (
            <div className="pt-4 border-t">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Kapacitet (kWh) *
              </label>
              <input
                type="number"
                value={formData.batteryCapacity}
                onChange={(e) =>
                  setFormData({ ...formData, batteryCapacity: parseFloat(e.target.value) || 0 })
                }
                min="0"
                step="1"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                required
              />
            </div>
          )}

          {type === 'mounting' && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pris pr. panel (kr) *
                </label>
                <input
                  type="number"
                  value={formData.pricePerPanel}
                  onChange={(e) =>
                    setFormData({ ...formData, pricePerPanel: parseFloat(e.target.value) || 0 })
                  }
                  min="0"
                  step="25"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Timer pr. panel *
                </label>
                <input
                  type="number"
                  value={formData.laborHoursPerPanel}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      laborHoursPerPanel: parseFloat(e.target.value) || 0,
                    })
                  }
                  min="0"
                  step="0.1"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Annuller
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? 'Gemmer...' : isEditing ? 'Gem ændringer' : 'Opret'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
