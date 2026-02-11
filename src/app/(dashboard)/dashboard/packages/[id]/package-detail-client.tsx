'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  GripVertical,
  Package,
  Clock,
  TrendingUp,
  CircuitBoard,
  Box,
  FileText,
  Timer,
  ChevronDown,
  ChevronUp,
  Settings2,
} from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import type {
  Package as PackageType,
  PackageItem,
  PackageCategory,
  PackageItemType,
} from '@/types/packages.types'
import {
  updatePackage,
  createPackageItem,
  updatePackageItem,
  deletePackageItem,
  reorderPackageItems,
} from '@/lib/actions/packages'
import { calculateFinancialSummary } from '@/lib/utils/packages'
import { formatCurrency } from '@/lib/utils/format'

interface PackageDetailClientProps {
  initialPackage: PackageType & { items: PackageItem[] }
  categories: PackageCategory[]
  components: {
    id: string
    code: string
    name: string
    base_time_minutes: number
    category_name: string
    variants: { code: string; name: string }[]
  }[]
  products: {
    id: string
    sku: string | null
    name: string
    cost_price: number | null
    list_price: number
    category_name: string
  }[]
}

export default function PackageDetailClient({
  initialPackage,
  categories,
  components,
  products,
}: PackageDetailClientProps) {
  const router = useRouter()
  const { success, error: showError } = useToast()
  const [isPending, startTransition] = useTransition()

  const [pkg, setPkg] = useState(initialPackage)
  const [items, setItems] = useState(initialPackage.items)
  const [showSettings, setShowSettings] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)
  const [editingItem, setEditingItem] = useState<PackageItem | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Calculate financial summary
  const summary = calculateFinancialSummary(items)

  const formatTime = (minutes: number) => {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h > 0) return `${h}t ${m}m`
    return `${m}m`
  }

  const handleSavePackage = async () => {
    startTransition(async () => {
      const result = await updatePackage({
        id: pkg.id,
        name: pkg.name,
        code: pkg.code,
        description: pkg.description,
        category_id: pkg.category_id,
        is_active: pkg.is_active,
      })

      if (result.success) {
        success('Pakke gemt')
        setHasUnsavedChanges(false)
      } else {
        showError(result.error || 'Kunne ikke gemme')
      }
    })
  }

  const handleAddItem = async (item: Partial<PackageItem>) => {
    startTransition(async () => {
      const result = await createPackageItem({
        package_id: pkg.id,
        item_type: item.item_type || 'manual',
        component_id: item.component_id,
        component_variant_code: item.component_variant_code,
        product_id: item.product_id,
        description: item.description || '',
        quantity: item.quantity || 1,
        unit: item.unit || 'stk',
        cost_price: item.cost_price || 0,
        sale_price: item.sale_price || 0,
        time_minutes: item.time_minutes || 0,
        sort_order: item.sort_order || 0,
        show_on_offer: item.show_on_offer ?? true,
      })

      if (result.success && result.data) {
        setItems([...items, result.data])
        success('Element tilføjet')
        setShowAddItem(false)
      } else {
        showError(result.error || 'Kunne ikke tilføje')
      }
    })
  }

  const handleUpdateItem = async (item: PackageItem) => {
    startTransition(async () => {
      const result = await updatePackageItem({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        cost_price: item.cost_price,
        sale_price: item.sale_price,
        time_minutes: item.time_minutes,
        show_on_offer: item.show_on_offer,
      })

      if (result.success && result.data) {
        setItems(items.map((i) => (i.id === item.id ? result.data! : i)))
        success('Element opdateret')
        setEditingItem(null)
      } else {
        showError(result.error || 'Kunne ikke opdatere')
      }
    })
  }

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Er du sikker på at du vil slette dette element?')) return

    startTransition(async () => {
      const result = await deletePackageItem(id)
      if (result.success) {
        setItems(items.filter((i) => i.id !== id))
        success('Element slettet')
      } else {
        showError(result.error || 'Kunne ikke slette')
      }
    })
  }

  const getItemIcon = (type: PackageItemType) => {
    switch (type) {
      case 'component':
        return <CircuitBoard className="w-4 h-4" />
      case 'product':
        return <Box className="w-4 h-4" />
      case 'time':
        return <Timer className="w-4 h-4" />
      default:
        return <FileText className="w-4 h-4" />
    }
  }

  const getItemTypeBadge = (type: PackageItemType) => {
    const colors: Record<PackageItemType, string> = {
      component: 'bg-blue-100 text-blue-700',
      product: 'bg-green-100 text-green-700',
      manual: 'bg-gray-100 text-gray-700',
      time: 'bg-purple-100 text-purple-700',
    }
    const labels: Record<PackageItemType, string> = {
      component: 'Komponent',
      product: 'Produkt',
      manual: 'Manuel',
      time: 'Tid',
    }
    return (
      <span className={`text-xs px-2 py-0.5 rounded ${colors[type]}`}>
        {labels[type]}
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/packages"
                className="p-2 hover:bg-muted rounded-md"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={pkg.name}
                    onChange={(e) => {
                      setPkg({ ...pkg, name: e.target.value })
                      setHasUnsavedChanges(true)
                    }}
                    className="text-xl font-bold border-0 bg-transparent focus:outline-none focus:ring-2 focus:ring-primary rounded px-1"
                  />
                  {pkg.code && (
                    <span className="text-sm text-muted-foreground font-mono">
                      ({pkg.code})
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {items.length} elementer
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 hover:bg-muted rounded-md"
              >
                <Settings2 className="w-5 h-5" />
              </button>
              <button
                onClick={handleSavePackage}
                disabled={isPending || !hasUnsavedChanges}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                Gem
              </button>
            </div>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="mt-4 p-4 bg-muted/50 rounded-lg grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Kode</label>
                <input
                  type="text"
                  value={pkg.code || ''}
                  onChange={(e) => {
                    setPkg({ ...pkg, code: e.target.value })
                    setHasUnsavedChanges(true)
                  }}
                  placeholder="PKG-XXX-001"
                  className="w-full px-3 py-2 border rounded-md text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Kategori</label>
                <select
                  value={pkg.category_id || ''}
                  onChange={(e) => {
                    setPkg({ ...pkg, category_id: e.target.value || null })
                    setHasUnsavedChanges(true)
                  }}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                >
                  <option value="">Ingen kategori</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Status</label>
                <select
                  value={pkg.is_active ? 'active' : 'inactive'}
                  onChange={(e) => {
                    setPkg({ ...pkg, is_active: e.target.value === 'active' })
                    setHasUnsavedChanges(true)
                  }}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                >
                  <option value="active">Aktiv</option>
                  <option value="inactive">Inaktiv</option>
                </select>
              </div>
              <div className="col-span-3 space-y-1">
                <label className="text-sm font-medium">Beskrivelse</label>
                <textarea
                  value={pkg.description || ''}
                  onChange={(e) => {
                    setPkg({ ...pkg, description: e.target.value })
                    setHasUnsavedChanges(true)
                  }}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-md text-sm resize-none"
                  placeholder="Valgfri beskrivelse af pakken..."
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex">
        {/* Main Content - Items Table */}
        <div className="flex-1 p-6">
          <div className="bg-white rounded-lg border overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-muted/50 text-sm font-medium border-b">
              <div className="col-span-1"></div>
              <div className="col-span-4">Beskrivelse</div>
              <div className="col-span-1 text-right">Antal</div>
              <div className="col-span-1 text-center">Enhed</div>
              <div className="col-span-1 text-right">Kostpris</div>
              <div className="col-span-1 text-right">Salgspris</div>
              <div className="col-span-1 text-right">Tid</div>
              <div className="col-span-1 text-right">Total</div>
              <div className="col-span-1"></div>
            </div>

            {/* Items */}
            {items.length === 0 ? (
              <div className="p-8 text-center">
                <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  Ingen elementer endnu. Tilføj komponenter, produkter eller manuelle linjer.
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {items.map((item, index) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-muted/30 group"
                  >
                    <div className="col-span-1 flex items-center gap-2">
                      <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab opacity-0 group-hover:opacity-100" />
                      {getItemIcon(item.item_type)}
                    </div>
                    <div className="col-span-4">
                      <div className="flex items-center gap-2">
                        {editingItem?.id === item.id ? (
                          <input
                            type="text"
                            value={editingItem.description}
                            onChange={(e) =>
                              setEditingItem({ ...editingItem, description: e.target.value })
                            }
                            className="w-full px-2 py-1 border rounded text-sm"
                          />
                        ) : (
                          <span
                            className="cursor-pointer hover:text-primary"
                            onClick={() => setEditingItem(item)}
                          >
                            {item.description}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {getItemTypeBadge(item.item_type)}
                        {item.component && (
                          <span className="text-xs text-muted-foreground">
                            {item.component.code}
                          </span>
                        )}
                        {item.product?.sku && (
                          <span className="text-xs text-muted-foreground">
                            {item.product.sku}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="col-span-1 text-right">
                      {editingItem?.id === item.id ? (
                        <input
                          type="number"
                          value={editingItem.quantity}
                          onChange={(e) =>
                            setEditingItem({
                              ...editingItem,
                              quantity: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-16 px-2 py-1 border rounded text-sm text-right"
                          min="0"
                          step="0.01"
                        />
                      ) : (
                        <span
                          className="cursor-pointer hover:text-primary"
                          onClick={() => setEditingItem(item)}
                        >
                          {item.quantity}
                        </span>
                      )}
                    </div>
                    <div className="col-span-1 text-center text-sm text-muted-foreground">
                      {item.unit}
                    </div>
                    <div className="col-span-1 text-right">
                      {editingItem?.id === item.id ? (
                        <input
                          type="number"
                          value={editingItem.cost_price}
                          onChange={(e) =>
                            setEditingItem({
                              ...editingItem,
                              cost_price: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-20 px-2 py-1 border rounded text-sm text-right"
                          min="0"
                        />
                      ) : (
                        <span
                          className="cursor-pointer hover:text-primary text-sm"
                          onClick={() => setEditingItem(item)}
                        >
                          {formatCurrency(item.cost_price)}
                        </span>
                      )}
                    </div>
                    <div className="col-span-1 text-right">
                      {editingItem?.id === item.id ? (
                        <input
                          type="number"
                          value={editingItem.sale_price}
                          onChange={(e) =>
                            setEditingItem({
                              ...editingItem,
                              sale_price: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-20 px-2 py-1 border rounded text-sm text-right"
                          min="0"
                        />
                      ) : (
                        <span
                          className="cursor-pointer hover:text-primary text-sm"
                          onClick={() => setEditingItem(item)}
                        >
                          {formatCurrency(item.sale_price)}
                        </span>
                      )}
                    </div>
                    <div className="col-span-1 text-right text-sm text-muted-foreground">
                      {formatTime(item.total_time)}
                    </div>
                    <div className="col-span-1 text-right font-medium">
                      {formatCurrency(item.total_sale)}
                    </div>
                    <div className="col-span-1 flex justify-end gap-1">
                      {editingItem?.id === item.id ? (
                        <>
                          <button
                            onClick={() => handleUpdateItem(editingItem)}
                            disabled={isPending}
                            className="p-1 text-green-600 hover:bg-green-50 rounded"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingItem(null)}
                            className="p-1 text-muted-foreground hover:bg-muted rounded"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          disabled={isPending}
                          className="p-1 text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Item Button */}
            <div className="p-4 border-t">
              <button
                onClick={() => setShowAddItem(true)}
                className="flex items-center gap-2 px-4 py-2 text-primary hover:bg-primary/5 rounded-md w-full justify-center"
              >
                <Plus className="w-4 h-4" />
                Tilføj element
              </button>
            </div>
          </div>
        </div>

        {/* Right Sidebar - Financial Summary */}
        <div className="w-80 p-6 border-l bg-white">
          <h3 className="font-semibold mb-4">Overblik</h3>

          <div className="space-y-6">
            {/* Time */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-4 h-4" />
                Total tid
              </div>
              <span className="font-medium">{summary.totalTimeFormatted}</span>
            </div>

            {/* Cost breakdown */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Kostpris</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Komponenter</span>
                  <span>{formatCurrency(summary.componentsCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Produkter</span>
                  <span>{formatCurrency(summary.productsCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Manuel</span>
                  <span>{formatCurrency(summary.manualCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Arbejdsløn</span>
                  <span>{formatCurrency(summary.laborCost)}</span>
                </div>
                <div className="flex justify-between font-medium pt-1 border-t">
                  <span>Total kostpris</span>
                  <span>{formatCurrency(summary.totalCost)}</span>
                </div>
              </div>
            </div>

            {/* Sale breakdown */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Salgspris</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Komponenter</span>
                  <span>{formatCurrency(summary.componentsSale)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Produkter</span>
                  <span>{formatCurrency(summary.productsSale)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Manuel</span>
                  <span>{formatCurrency(summary.manualSale)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Arbejdsløn</span>
                  <span>{formatCurrency(summary.laborSale)}</span>
                </div>
                <div className="flex justify-between font-medium pt-1 border-t">
                  <span>Total salgspris</span>
                  <span>{formatCurrency(summary.totalSale)}</span>
                </div>
              </div>
            </div>

            {/* DB */}
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4" />
                <span className="font-medium">Dækningsbidrag</span>
              </div>
              <div className="text-2xl font-bold">
                {formatCurrency(summary.dbAmount)}
              </div>
              <div
                className={`text-sm ${
                  summary.dbPercentage >= 30
                    ? 'text-green-600'
                    : summary.dbPercentage >= 20
                    ? 'text-amber-600'
                    : 'text-red-600'
                }`}
              >
                {summary.dbPercentage.toFixed(1)}% DB
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Item Dialog */}
      {showAddItem && (
        <AddItemDialog
          components={components}
          products={products}
          onClose={() => setShowAddItem(false)}
          onAdd={handleAddItem}
        />
      )}
    </div>
  )
}

// Add Item Dialog Component
function AddItemDialog({
  components,
  products,
  onClose,
  onAdd,
}: {
  components: PackageDetailClientProps['components']
  products: PackageDetailClientProps['products']
  onClose: () => void
  onAdd: (item: Partial<PackageItem>) => void
}) {
  const [tab, setTab] = useState<PackageItemType>('component')
  const [selectedComponent, setSelectedComponent] = useState('')
  const [selectedVariant, setSelectedVariant] = useState('')
  const [selectedProduct, setSelectedProduct] = useState('')
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [unit, setUnit] = useState('stk')
  const [costPrice, setCostPrice] = useState(0)
  const [salePrice, setSalePrice] = useState(0)
  const [timeMinutes, setTimeMinutes] = useState(0)

  const selectedComp = components.find((c) => c.id === selectedComponent)
  const selectedProd = products.find((p) => p.id === selectedProduct)

  const handleAdd = () => {
    if (tab === 'component' && selectedComponent) {
      onAdd({
        item_type: 'component',
        component_id: selectedComponent,
        component_variant_code: selectedVariant || undefined,
        description: selectedComp?.name || description,
        quantity,
        unit: 'stk',
        cost_price: costPrice,
        sale_price: salePrice,
      })
    } else if (tab === 'product' && selectedProduct) {
      onAdd({
        item_type: 'product',
        product_id: selectedProduct,
        description: selectedProd?.name || description,
        quantity,
        unit: 'stk',
        cost_price: selectedProd?.cost_price || costPrice,
        sale_price: selectedProd?.list_price || salePrice,
      })
    } else if (tab === 'time') {
      onAdd({
        item_type: 'time',
        description: description || 'Arbejdsløn',
        quantity,
        unit: 'timer',
        cost_price: 0,
        sale_price: salePrice,
      })
    } else {
      onAdd({
        item_type: 'manual',
        description,
        quantity,
        unit,
        cost_price: costPrice,
        sale_price: salePrice,
        time_minutes: timeMinutes,
      })
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Tilføj element</h2>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          {(['component', 'product', 'manual', 'time'] as PackageItemType[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 px-4 py-3 text-sm font-medium ${
                tab === t
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'component' && 'Komponent'}
              {t === 'product' && 'Produkt'}
              {t === 'manual' && 'Manuel'}
              {t === 'time' && 'Tid'}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Component Tab */}
          {tab === 'component' && (
            <>
              <div className="space-y-1">
                <label className="text-sm font-medium">Komponent *</label>
                <select
                  value={selectedComponent}
                  onChange={(e) => {
                    setSelectedComponent(e.target.value)
                    setSelectedVariant('')
                    const comp = components.find((c) => c.id === e.target.value)
                    if (comp) {
                      setDescription(comp.name)
                    }
                  }}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="">Vælg komponent...</option>
                  {components.map((comp) => (
                    <option key={comp.id} value={comp.id}>
                      {comp.code} - {comp.name} ({comp.base_time_minutes} min)
                    </option>
                  ))}
                </select>
              </div>
              {selectedComp && selectedComp.variants.length > 0 && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Variant</label>
                  <select
                    value={selectedVariant}
                    onChange={(e) => setSelectedVariant(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="">Standard</option>
                    {selectedComp.variants.map((v) => (
                      <option key={v.code} value={v.code}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          {/* Product Tab */}
          {tab === 'product' && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Produkt *</label>
              <select
                value={selectedProduct}
                onChange={(e) => {
                  setSelectedProduct(e.target.value)
                  const prod = products.find((p) => p.id === e.target.value)
                  if (prod) {
                    setDescription(prod.name)
                    setCostPrice(prod.cost_price || 0)
                    setSalePrice(prod.list_price)
                  }
                }}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">Vælg produkt...</option>
                {products.map((prod) => (
                  <option key={prod.id} value={prod.id}>
                    {prod.sku ? `${prod.sku} - ` : ''}{prod.name} ({prod.list_price} kr)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Manual Tab */}
          {tab === 'manual' && (
            <>
              <div className="space-y-1">
                <label className="text-sm font-medium">Beskrivelse *</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="F.eks. Kabel 3G2.5"
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Kostpris</label>
                  <input
                    type="number"
                    value={costPrice}
                    onChange={(e) => setCostPrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border rounded-md"
                    min="0"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Salgspris</label>
                  <input
                    type="number"
                    value={salePrice}
                    onChange={(e) => setSalePrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border rounded-md"
                    min="0"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Tid (minutter)</label>
                <input
                  type="number"
                  value={timeMinutes}
                  onChange={(e) => setTimeMinutes(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border rounded-md"
                  min="0"
                />
              </div>
            </>
          )}

          {/* Time Tab */}
          {tab === 'time' && (
            <>
              <div className="space-y-1">
                <label className="text-sm font-medium">Beskrivelse</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Arbejdsløn"
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Timepris (kr/time)</label>
                <input
                  type="number"
                  value={salePrice}
                  onChange={(e) => setSalePrice(parseFloat(e.target.value) || 0)}
                  placeholder="450"
                  className="w-full px-3 py-2 border rounded-md"
                  min="0"
                />
              </div>
            </>
          )}

          {/* Common: Quantity and Unit */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">
                {tab === 'time' ? 'Timer' : 'Antal'}
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border rounded-md"
                min="0.01"
                step="0.01"
              />
            </div>
            {tab !== 'time' && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Enhed</label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="stk">stk</option>
                  <option value="m">meter</option>
                  <option value="m2">m²</option>
                  <option value="kg">kg</option>
                  <option value="timer">timer</option>
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 p-4 border-t bg-muted/50">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-md hover:bg-muted"
          >
            Annuller
          </button>
          <button
            onClick={handleAdd}
            disabled={
              (tab === 'component' && !selectedComponent) ||
              (tab === 'product' && !selectedProduct) ||
              (tab === 'manual' && !description) ||
              (tab === 'time' && !salePrice)
            }
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            Tilføj
          </button>
        </div>
      </div>
    </div>
  )
}
