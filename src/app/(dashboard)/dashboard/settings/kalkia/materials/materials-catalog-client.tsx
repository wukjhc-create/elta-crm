'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Package,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Search,
  History,
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  Box,
  Tag,
  Building2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  createMaterial,
  updateMaterial,
  deleteMaterial,
  getMaterialPriceHistory,
  updateMaterialPrice,
} from '@/lib/actions/component-intelligence'
import type { Material, MaterialPriceHistory } from '@/types/component-intelligence.types'
import { useToast } from '@/components/ui/toast'

interface MaterialsCatalogClientProps {
  initialMaterials: Material[]
}

interface MaterialFormData {
  sku: string
  name: string
  description: string
  unit: string
  cost_price: number
  sale_price: number
  category: string
  brand: string
  supplier_sku: string
  reorder_level: number
  is_active: boolean
}

const unitOptions = ['stk', 'm', 'm²', 'm³', 'kg', 'l', 'rulle', 'pakke', 'sæt']

export function MaterialsCatalogClient({ initialMaterials }: MaterialsCatalogClientProps) {
  const toast = useToast()
  const [materials, setMaterials] = useState<Material[]>(initialMaterials)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterActive, setFilterActive] = useState<boolean | null>(null)
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null)
  const [priceHistory, setPriceHistory] = useState<MaterialPriceHistory[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const [formData, setFormData] = useState<Partial<MaterialFormData>>({
    sku: '',
    name: '',
    description: '',
    unit: 'stk',
    cost_price: 0,
    sale_price: 0,
    category: 'general',
    brand: '',
    supplier_sku: '',
    reorder_level: 0,
    is_active: true,
  })

  const resetForm = () => {
    setFormData({
      sku: '',
      name: '',
      description: '',
      unit: 'stk',
      cost_price: 0,
      sale_price: 0,
      category: 'general',
      brand: '',
      supplier_sku: '',
      reorder_level: 0,
      is_active: true,
    })
    setShowCreateForm(false)
    setEditingId(null)
  }

  const handleCreate = async () => {
    if (!formData.sku || !formData.name) {
      toast?.error('SKU og navn er påkrævet')
      return
    }

    setSaving(true)
    const result = await createMaterial(formData as { name: string; category: string; cost_price: number; sale_price: number; sku?: string; description?: string; unit?: string; brand?: string; supplier_sku?: string; reorder_level?: number })
    setSaving(false)

    if (result.success && result.data) {
      setMaterials([...materials, result.data])
      resetForm()
      toast?.success('Materiale oprettet')
    } else {
      toast?.error(result.error || 'Kunne ikke oprette materiale')
    }
  }

  const handleUpdate = async (id: string) => {
    setSaving(true)
    const result = await updateMaterial({ id, ...formData } as { id: string; name?: string; description?: string; cost_price?: number; sale_price?: number })
    setSaving(false)

    if (result.success && result.data) {
      setMaterials(materials.map((m) => (m.id === id ? result.data! : m)))
      resetForm()
      toast?.success('Materiale opdateret')
    } else {
      toast?.error(result.error || 'Kunne ikke opdatere materiale')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Er du sikker på du vil slette dette materiale?')) return

    const result = await deleteMaterial(id)
    if (result.success) {
      setMaterials(materials.filter((m) => m.id !== id))
      toast?.success('Materiale slettet')
    } else {
      toast?.error(result.error || 'Kunne ikke slette materiale')
    }
  }

  const handlePriceUpdate = async (material: Material) => {
    const newCostPrice = prompt('Ny kostpris:', material.cost_price.toString())
    if (newCostPrice === null) return

    const newSalePrice = prompt('Ny salgspris:', material.sale_price.toString())
    if (newSalePrice === null) return

    const reason = prompt('Årsag til prisændring (valgfrit):')

    setSaving(true)
    const result = await updateMaterialPrice(material.id, {
      cost_price: parseFloat(newCostPrice),
      sale_price: parseFloat(newSalePrice),
      change_reason: reason || undefined,
    })
    setSaving(false)

    if (result.success && result.data) {
      setMaterials(materials.map((m) => (m.id === material.id ? result.data! : m)))
      toast?.success('Priser opdateret')
    } else {
      toast?.error(result.error || 'Kunne ikke opdatere priser')
    }
  }

  const loadPriceHistory = async (materialId: string) => {
    if (expandedHistory === materialId) {
      setExpandedHistory(null)
      return
    }

    setLoadingHistory(true)
    const result = await getMaterialPriceHistory(materialId)
    setLoadingHistory(false)

    if (result.success && result.data) {
      setPriceHistory(result.data)
      setExpandedHistory(materialId)
    } else {
      toast?.error('Kunne ikke hente prishistorik')
    }
  }

  const startEdit = (material: Material) => {
    setEditingId(material.id)
    setFormData({
      sku: material.sku || '',
      name: material.name,
      description: material.description || '',
      unit: material.unit,
      cost_price: material.cost_price,
      sale_price: material.sale_price,
      category: material.category || 'general',
      brand: material.brand || '',
      supplier_sku: material.supplier_sku || '',
      reorder_level: material.reorder_level || 0,
      is_active: material.is_active,
    })
    setShowCreateForm(false)
  }

  const filteredMaterials = materials.filter((m) => {
    const matchesSearch =
      searchQuery === '' ||
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.brand?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = filterActive === null || m.is_active === filterActive
    return matchesSearch && matchesFilter
  })

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
      minimumFractionDigits: 2,
    }).format(price)
  }

  const calculateMargin = (cost: number, sale: number) => {
    if (sale === 0) return 0
    return ((sale - cost) / sale) * 100
  }

  const MaterialForm = ({ isNew }: { isNew: boolean }) => (
    <Card className="border-2 border-dashed border-orange-300 bg-orange-50">
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700">SKU *</label>
            <Input
              value={formData.sku || ''}
              onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
              placeholder="MAT-001"
              disabled={!isNew}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-gray-700">Navn *</label>
            <Input
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Stikkontakt enkelt"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Enhed</label>
            <Select
              value={formData.unit || 'stk'}
              onValueChange={(value) => setFormData({ ...formData, unit: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {unitOptions.map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Beskrivelse</label>
          <Input
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Schneider Exxact enkelt stikkontakt med jord"
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Kostpris (DKK)</label>
            <Input
              type="number"
              step="0.01"
              value={formData.cost_price || 0}
              onChange={(e) => setFormData({ ...formData, cost_price: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Salgspris (DKK)</label>
            <Input
              type="number"
              step="0.01"
              value={formData.sale_price || 0}
              onChange={(e) => setFormData({ ...formData, sale_price: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Mærke</label>
            <Input
              value={formData.brand || ''}
              onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
              placeholder="Schneider"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Leverandør SKU</label>
            <Input
              value={formData.supplier_sku || ''}
              onChange={(e) => setFormData({ ...formData, supplier_sku: e.target.value })}
              placeholder="SCH-1234"
            />
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex-1">
            <label className="text-sm font-medium text-gray-700">Genbestillingsniveau</label>
            <Input
              type="number"
              value={formData.reorder_level || 0}
              onChange={(e) => setFormData({ ...formData, reorder_level: parseInt(e.target.value) || 0 })}
              className="w-24"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_active !== false}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300"
            />
            <span className="text-sm font-medium text-gray-700">Aktiv</span>
          </label>
        </div>

        {formData.cost_price && formData.sale_price && (
          <div className="p-3 bg-white rounded-lg border">
            <span className="text-sm text-gray-600">Avance: </span>
            <span className="font-bold">
              {calculateMargin(formData.cost_price || 0, formData.sale_price || 0).toFixed(1)}%
            </span>
            <span className="text-sm text-gray-500 ml-2">
              ({formatPrice((formData.sale_price || 0) - (formData.cost_price || 0))} per {formData.unit})
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={resetForm} disabled={saving}>
            <X className="w-4 h-4 mr-2" />
            Annuller
          </Button>
          <Button
            onClick={() => (isNew ? handleCreate() : handleUpdate(editingId!))}
            disabled={saving}
            className="bg-orange-600 hover:bg-orange-700"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Gemmer...' : isNew ? 'Opret materiale' : 'Gem ændringer'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/settings/kalkia">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Tilbage
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
              <Package className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Materialekatalog</h1>
              <p className="text-sm text-gray-500">
                Centraliseret materialehåndtering med prishistorik
              </p>
            </div>
          </div>
        </div>

        {!showCreateForm && !editingId && (
          <Button
            onClick={() => {
              resetForm()
              setShowCreateForm(true)
            }}
            className="bg-orange-600 hover:bg-orange-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nyt materiale
          </Button>
        )}
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Søg efter navn, kode eller leverandør..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={filterActive === null ? 'all' : filterActive ? 'active' : 'inactive'}
              onValueChange={(v) => setFilterActive(v === 'all' ? null : v === 'active')}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="active">Aktive</SelectItem>
                <SelectItem value="inactive">Inaktive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Box className="w-8 h-8 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{materials.length}</p>
                <p className="text-sm text-gray-500">Materialer</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Tag className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{materials.filter((m) => m.is_active).length}</p>
                <p className="text-sm text-gray-500">Aktive</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">
                  {new Set(materials.map((m) => m.brand).filter(Boolean)).size}
                </p>
                <p className="text-sm text-gray-500">Mærker</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">
                  {(
                    materials.reduce((sum, m) => sum + calculateMargin(m.cost_price, m.sale_price), 0) /
                    (materials.length || 1)
                  ).toFixed(0)}
                  %
                </p>
                <p className="text-sm text-gray-500">Gns. avance</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create Form */}
      {showCreateForm && <MaterialForm isNew={true} />}

      {/* Materials List */}
      <div className="space-y-3">
        {filteredMaterials.map((material) => {
          const isEditing = editingId === material.id
          const margin = calculateMargin(material.cost_price, material.sale_price)
          const isExpanded = expandedHistory === material.id

          if (isEditing) {
            return <MaterialForm key={material.id} isNew={false} />
          }

          return (
            <Card key={material.id} className={`transition-shadow ${!material.is_active ? 'opacity-60' : 'hover:shadow-md'}`}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                      <Package className="w-5 h-5 text-orange-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{material.name}</h3>
                        <Badge variant="outline" className="text-xs">
                          {material.sku || material.id.slice(0, 8)}
                        </Badge>
                        {!material.is_active && (
                          <Badge variant="secondary" className="text-xs">Inaktiv</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                        {material.brand && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {material.brand}
                          </span>
                        )}
                        <span>Enhed: {material.unit}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-sm text-gray-500">Kostpris</div>
                      <div className="font-medium">{formatPrice(material.cost_price)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">Salgspris</div>
                      <div className="font-medium">{formatPrice(material.sale_price)}</div>
                    </div>
                    <div className="text-right min-w-[60px]">
                      <div className="text-sm text-gray-500">Avance</div>
                      <div className={`font-bold ${margin >= 30 ? 'text-green-600' : margin >= 15 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {margin.toFixed(0)}%
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => loadPriceHistory(material.id)}
                        title="Prishistorik"
                      >
                        <History className="w-4 h-4" />
                        {isExpanded ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePriceUpdate(material)}
                        title="Opdater priser"
                      >
                        <DollarSign className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => startEdit(material)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDelete(material.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Price History */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t">
                    <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <History className="w-4 h-4" />
                      Prishistorik
                    </h4>
                    {loadingHistory ? (
                      <div className="text-center py-4 text-gray-500">
                        <div className="animate-spin w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full mx-auto mb-2" />
                        Henter historik...
                      </div>
                    ) : priceHistory.length === 0 ? (
                      <p className="text-sm text-gray-500">Ingen prisændringer registreret</p>
                    ) : (
                      <div className="space-y-2">
                        {priceHistory.map((history, index) => {
                          const prevHistory = priceHistory[index + 1]
                          const costChange = prevHistory ? history.cost_price - prevHistory.cost_price : 0
                          const saleChange = prevHistory ? history.sale_price - prevHistory.sale_price : 0
                          return (
                            <div
                              key={history.id}
                              className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
                            >
                              <div className="flex items-center gap-4">
                                <span className="text-gray-500">
                                  {new Date(history.effective_from).toLocaleDateString('da-DK')}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span>Kost:</span>
                                  <span className={costChange > 0 ? 'text-red-600' : costChange < 0 ? 'text-green-600' : ''}>
                                    {formatPrice(history.cost_price)}
                                    {costChange !== 0 && (
                                      costChange > 0 ? <TrendingUp className="w-3 h-3 inline ml-1" /> : <TrendingDown className="w-3 h-3 inline ml-1" />
                                    )}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span>Salg:</span>
                                  <span className={saleChange > 0 ? 'text-green-600' : saleChange < 0 ? 'text-red-600' : ''}>
                                    {formatPrice(history.sale_price)}
                                  </span>
                                </div>
                              </div>
                              {history.change_reason && (
                                <span className="text-gray-500 italic">{history.change_reason}</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}

        {filteredMaterials.length === 0 && !showCreateForm && (
          <Card className="py-12 text-center text-gray-500">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>{searchQuery ? 'Ingen materialer matcher søgningen' : 'Ingen materialer i kataloget'}</p>
            <p className="text-sm mt-2">
              {searchQuery ? 'Prøv en anden søgning' : 'Opret materialer for at bruge dem i komponenter'}
            </p>
          </Card>
        )}
      </div>
    </div>
  )
}
