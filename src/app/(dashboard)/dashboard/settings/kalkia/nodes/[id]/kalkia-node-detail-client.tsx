'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Clock,
  FolderTree,
  Wrench,
  Layers,
  Package,
  Settings,
  ChevronDown,
  ChevronRight,
  Link2,
  Unlink,
  RefreshCw,
  Search,
  Star,
  Loader2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { KalkiaNodeWithRelations, KalkiaNodeType, KalkiaVariantMaterial } from '@/types/kalkia.types'
import { KALKIA_NODE_TYPE_LABELS } from '@/types/kalkia.types'
import {
  linkMaterialToSupplierProduct,
  unlinkMaterialFromSupplierProduct,
  getSupplierOptionsForMaterial,
  syncMaterialPricesFromSupplier,
} from '@/lib/actions/kalkia'
import { formatTimeSeconds, formatCurrency } from '@/lib/utils/format'

// Extended variant type with materials from server
interface VariantWithMaterials {
  id: string
  node_id: string
  code: string
  name: string
  description: string | null
  base_time_seconds: number
  time_multiplier: number
  extra_time_seconds: number
  price_multiplier: number
  cost_multiplier: number
  waste_percentage: number
  is_default: boolean
  sort_order: number
  created_at: string
  updated_at: string
  materials?: KalkiaVariantMaterial[]
}

interface ComponentCategory {
  id: string
  name: string
  slug: string
}

interface KalkiaNodeDetailClientProps {
  node: KalkiaNodeWithRelations
  categories: ComponentCategory[]
}

const nodeTypeIcons: Record<KalkiaNodeType, React.ElementType> = {
  group: FolderTree,
  operation: Wrench,
  composite: Layers,
}

const nodeTypeColors: Record<KalkiaNodeType, string> = {
  group: 'bg-blue-100 text-blue-600',
  operation: 'bg-yellow-100 text-yellow-600',
  composite: 'bg-purple-100 text-purple-600',
}

interface SupplierOption {
  supplier_product_id: string
  supplier_id: string
  supplier_name: string
  supplier_code: string | null
  supplier_sku: string
  product_name: string
  cost_price: number
  list_price: number | null
  is_preferred: boolean
  is_available: boolean
}

export default function KalkiaNodeDetailClient({ node, categories }: KalkiaNodeDetailClientProps) {
  const [expandedVariants, setExpandedVariants] = useState<Set<string>>(new Set())
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [selectedMaterial, setSelectedMaterial] = useState<KalkiaVariantMaterial | null>(null)
  const [supplierOptions, setSupplierOptions] = useState<SupplierOption[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [linking, setLinking] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const Icon = nodeTypeIcons[node.node_type]
  const colorClass = nodeTypeColors[node.node_type]


  const toggleVariant = (variantId: string) => {
    const newExpanded = new Set(expandedVariants)
    if (newExpanded.has(variantId)) {
      newExpanded.delete(variantId)
    } else {
      newExpanded.add(variantId)
    }
    setExpandedVariants(newExpanded)
  }

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    setActionMessage({ type, text })
    setTimeout(() => setActionMessage(null), 3000)
  }, [])

  const handleOpenLinkDialog = useCallback(async (material: KalkiaVariantMaterial) => {
    setSelectedMaterial(material)
    setSearchQuery(material.material_name)
    setLinkDialogOpen(true)
    setSearching(true)
    const result = await getSupplierOptionsForMaterial(material.material_name)
    if (result.success && result.data) {
      setSupplierOptions(result.data)
    } else {
      setSupplierOptions([])
    }
    setSearching(false)
  }, [])

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query)
    if (query.length < 2) {
      setSupplierOptions([])
      return
    }
    setSearching(true)
    const result = await getSupplierOptionsForMaterial(query)
    if (result.success && result.data) {
      setSupplierOptions(result.data)
    }
    setSearching(false)
  }, [])

  const handleLinkProduct = useCallback(async (supplierProductId: string, autoUpdate: boolean) => {
    if (!selectedMaterial) return
    setLinking(supplierProductId)
    const result = await linkMaterialToSupplierProduct(selectedMaterial.id, supplierProductId, autoUpdate)
    if (result.success) {
      showMessage('success', 'Materiale linket til leverandørprodukt')
      setLinkDialogOpen(false)
      setSelectedMaterial(null)
    } else {
      showMessage('error', result.error || 'Kunne ikke linke')
    }
    setLinking(null)
  }, [selectedMaterial, showMessage])

  const handleUnlink = useCallback(async (materialId: string) => {
    setLinking(materialId)
    const result = await unlinkMaterialFromSupplierProduct(materialId)
    if (result.success) {
      showMessage('success', 'Link fjernet')
    } else {
      showMessage('error', result.error || 'Kunne ikke fjerne link')
    }
    setLinking(null)
  }, [showMessage])

  const handleSyncVariant = useCallback(async (variantId: string) => {
    setSyncing(variantId)
    const result = await syncMaterialPricesFromSupplier(variantId)
    if (result.success && result.data) {
      showMessage('success', `Synkroniseret: ${result.data.updated} opdateret, ${result.data.skipped} sprunget over`)
    } else {
      showMessage('error', result.error || 'Synkronisering fejlede')
    }
    setSyncing(null)
  }, [showMessage])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/settings/kalkia/nodes">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Tilbage
            </Button>
          </Link>
          <div className={`w-12 h-12 rounded-lg ${colorClass} flex items-center justify-center`}>
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold text-gray-900">{node.name}</h1>
              <Badge variant="outline">{node.code}</Badge>
            </div>
            <p className="text-gray-600 mt-1">{node.description || 'Ingen beskrivelse'}</p>
          </div>
        </div>
      </div>

      {/* Node Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Type</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={colorClass}>{KALKIA_NODE_TYPE_LABELS[node.node_type]}</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Basistid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-xl font-bold">{formatTimeSeconds(node.base_time_seconds)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Kostpris</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xl font-bold">{formatCurrency(node.default_cost_price, 'DKK', 2)}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Salgspris</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xl font-bold">{formatCurrency(node.default_sale_price, 'DKK', 2)}</span>
          </CardContent>
        </Card>
      </div>

      {/* Path & Category */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Detaljer</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-gray-500">Sti</dt>
              <dd className="mt-1 font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                {node.path}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Niveau</dt>
              <dd className="mt-1">{node.depth}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Kategori</dt>
              <dd className="mt-1">
                {node.category ? (
                  <Badge variant="outline">{node.category.name}</Badge>
                ) : (
                  <span className="text-gray-400">Ingen</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Svaerhedsgrad</dt>
              <dd className="mt-1">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className={`w-4 h-4 rounded ${
                        level <= node.difficulty_level
                          ? 'bg-yellow-400'
                          : 'bg-gray-200'
                      }`}
                    />
                  ))}
                  <span className="ml-2 text-sm text-gray-500">
                    ({node.difficulty_level}/5)
                  </span>
                </div>
              </dd>
            </div>
            {node.parent && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Overordnet node</dt>
                <dd className="mt-1">
                  <Link
                    href={`/dashboard/settings/kalkia/nodes/${node.parent.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {node.parent.name} ({node.parent.code})
                  </Link>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-sm font-medium text-gray-500">Status</dt>
              <dd className="mt-1">
                <Badge variant={node.is_active ? 'default' : 'secondary'}>
                  {node.is_active ? 'Aktiv' : 'Inaktiv'}
                </Badge>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Variants */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Varianter
            <Badge variant="secondary">{node.variants?.length || 0}</Badge>
          </CardTitle>
          <CardDescription>
            Varianter med tidsmultiplikatorer og materialelister
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!node.variants || node.variants.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Ingen varianter</p>
          ) : (
            <div className="space-y-2">
              {node.variants.map((variant) => (
                <Collapsible
                  key={variant.id}
                  open={expandedVariants.has(variant.id)}
                  onOpenChange={() => toggleVariant(variant.id)}
                >
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                      <div className="flex items-center gap-3">
                        {expandedVariants.has(variant.id) ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{variant.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {variant.code}
                            </Badge>
                            {variant.is_default && (
                              <Badge variant="default" className="text-xs">
                                Standard
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                            <span>
                              Tidsmultiplikator: {variant.time_multiplier}x
                            </span>
                            {variant.extra_time_seconds > 0 && (
                              <span>+{formatTimeSeconds(variant.extra_time_seconds)}</span>
                            )}
                            <span>
                              Prismultiplikator: {variant.price_multiplier}x
                            </span>
                            {variant.waste_percentage > 0 && (
                              <span>Spild: {variant.waste_percentage}%</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 ml-7 p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-sm text-gray-700 flex items-center gap-2">
                          <Package className="w-4 h-4" />
                          Materialer
                        </h4>
                        {(variant as VariantWithMaterials).materials?.some(m => m.supplier_product_id) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSyncVariant(variant.id)}
                            disabled={syncing === variant.id}
                          >
                            {syncing === variant.id ? (
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3 h-3 mr-1" />
                            )}
                            Synk priser
                          </Button>
                        )}
                      </div>
                      {(variant as VariantWithMaterials).materials && (variant as VariantWithMaterials).materials!.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Materiale</TableHead>
                              <TableHead className="text-right">Antal</TableHead>
                              <TableHead>Enhed</TableHead>
                              <TableHead className="text-right">Kostpris</TableHead>
                              <TableHead className="text-right">Salgspris</TableHead>
                              <TableHead>Leverandør</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(variant as VariantWithMaterials).materials!.map((material) => (
                              <TableRow key={material.id}>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    {material.material_name}
                                    {material.is_optional && (
                                      <Badge variant="outline" className="text-xs">
                                        Valgfrit
                                      </Badge>
                                    )}
                                  </div>
                                  {material.product && (
                                    <span className="text-xs text-gray-500">
                                      {material.product.sku}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {material.quantity}
                                </TableCell>
                                <TableCell>{material.unit}</TableCell>
                                <TableCell className="text-right">
                                  {material.cost_price
                                    ? formatCurrency(material.cost_price, 'DKK', 2)
                                    : '-'}
                                </TableCell>
                                <TableCell className="text-right">
                                  {material.sale_price
                                    ? formatCurrency(material.sale_price, 'DKK', 2)
                                    : '-'}
                                </TableCell>
                                <TableCell>
                                  {material.supplier_product ? (
                                    <div className="flex items-center gap-1">
                                      <div className="text-xs">
                                        <div className="font-medium text-green-700 flex items-center gap-1">
                                          <Link2 className="w-3 h-3" />
                                          {material.supplier_product.supplier.name}
                                        </div>
                                        <div className="text-gray-500">
                                          {material.supplier_product.supplier_sku}
                                          {material.auto_update_price && (
                                            <Badge variant="outline" className="text-[10px] ml-1 px-1 py-0">
                                              Auto
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
                                        onClick={() => handleUnlink(material.id)}
                                        disabled={linking === material.id}
                                        title="Fjern link"
                                      >
                                        {linking === material.id ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <Unlink className="w-3 h-3" />
                                        )}
                                      </Button>
                                    </div>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs text-blue-600 hover:text-blue-800"
                                      onClick={() => handleOpenLinkDialog(material)}
                                    >
                                      <Search className="w-3 h-3 mr-1" />
                                      Link
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-gray-500 text-sm">
                          Ingen materialer defineret
                        </p>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rules */}
      {node.rules && node.rules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Regler</CardTitle>
            <CardDescription>
              Betingede justeringer baseret pa forhold
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Navn</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Betingelse</TableHead>
                  <TableHead className="text-right">Tidsmultiplikator</TableHead>
                  <TableHead className="text-right">Ekstra tid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {node.rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.rule_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{rule.rule_type}</Badge>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                        {JSON.stringify(rule.condition)}
                      </code>
                    </TableCell>
                    <TableCell className="text-right">
                      {rule.time_multiplier}x
                    </TableCell>
                    <TableCell className="text-right">
                      {rule.extra_time_seconds > 0
                        ? formatTimeSeconds(rule.extra_time_seconds)
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* AI Tags */}
      {node.ai_tags && node.ai_tags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">AI Tags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {node.ai_tags.map((tag, index) => (
                <Badge key={index} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {node.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Noter</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 whitespace-pre-wrap">{node.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Supplier Link Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link til leverandørprodukt</DialogTitle>
            <DialogDescription>
              Søg efter leverandørprodukter til &quot;{selectedMaterial?.material_name}&quot;
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Søg efter produkt..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-9"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
              )}
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {supplierOptions.length === 0 && !searching && searchQuery.length >= 2 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  Ingen leverandørprodukter fundet
                </p>
              )}
              {supplierOptions.map((option) => (
                <div
                  key={option.supplier_product_id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {option.supplier_name}
                      </span>
                      {option.is_preferred && (
                        <Star className="w-3 h-3 text-yellow-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{option.supplier_code || 'Leverandør'}</span>
                      <span>·</span>
                      <span className="font-mono">{option.supplier_sku}</span>
                    </div>
                    <div className="text-xs mt-1">
                      <span className="text-gray-600">
                        Kost: {formatCurrency(option.cost_price, 'DKK', 2)}
                      </span>
                      {option.list_price && (
                        <span className="text-gray-500 ml-2">
                          Liste: {formatCurrency(option.list_price, 'DKK', 2)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => handleLinkProduct(option.supplier_product_id, false)}
                      disabled={linking !== null}
                    >
                      {linking === option.supplier_product_id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        'Link'
                      )}
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      className="text-xs"
                      onClick={() => handleLinkProduct(option.supplier_product_id, true)}
                      disabled={linking !== null}
                      title="Link og opdater priser automatisk"
                    >
                      {linking === option.supplier_product_id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Link + Auto
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Action message toast */}
      {actionMessage && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2 ${
          actionMessage.type === 'success'
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          <span className="text-sm">{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="p-0.5 hover:opacity-70">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  )
}
