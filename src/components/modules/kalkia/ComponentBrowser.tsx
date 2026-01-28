'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Clock,
  Plus,
  FolderTree,
  Wrench,
  Layers,
  ChevronRight,
  ChevronDown,
  Package,
  X,
  Filter,
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
import { searchKalkiaNodes, getKalkiaNode } from '@/lib/actions/kalkia'
import type {
  KalkiaNodeSummary,
  KalkiaNodeWithRelations,
  KalkiaNodeType,
  KalkiaVariant,
  KalkiaCalculationItemInput,
} from '@/types/kalkia.types'

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

interface SelectedComponent {
  node: KalkiaNodeWithRelations
  variantId: string | null
  quantity: number
}

interface ComponentBrowserProps {
  onAdd: (item: KalkiaCalculationItemInput, nodeName: string, variantName?: string) => void
  existingNodeIds?: string[]
  className?: string
}

export function ComponentBrowser({
  onAdd,
  existingNodeIds = [],
  className = '',
}: ComponentBrowserProps) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<KalkiaNodeSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedNode, setSelectedNode] = useState<KalkiaNodeWithRelations | null>(null)
  const [loadingNode, setLoadingNode] = useState(false)
  const [selectedVariantId, setSelectedVariantId] = useState<string>('')
  const [quantity, setQuantity] = useState(1)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Debounced search
  useEffect(() => {
    const searchNodes = async () => {
      if (search.length < 2) {
        setResults([])
        return
      }

      setLoading(true)
      const result = await searchKalkiaNodes(search, 30)
      if (result.success && result.data) {
        let filtered = result.data.filter((n) => !existingNodeIds.includes(n.id))
        if (typeFilter !== 'all') {
          filtered = filtered.filter((n) => n.node_type === typeFilter)
        }
        setResults(filtered)
      }
      setLoading(false)
    }

    const debounce = setTimeout(searchNodes, 300)
    return () => clearTimeout(debounce)
  }, [search, existingNodeIds, typeFilter])

  const handleSelectNode = useCallback(async (summary: KalkiaNodeSummary) => {
    if (summary.node_type === 'group') {
      // Toggle group expansion
      setExpandedGroups((prev) => {
        const newSet = new Set(prev)
        if (newSet.has(summary.id)) {
          newSet.delete(summary.id)
        } else {
          newSet.add(summary.id)
        }
        return newSet
      })
      return
    }

    setLoadingNode(true)
    const result = await getKalkiaNode(summary.id)
    if (result.success && result.data) {
      setSelectedNode(result.data)
      // Select default variant
      const defaultVariant = result.data.variants?.find((v) => v.is_default) || result.data.variants?.[0]
      setSelectedVariantId(defaultVariant?.id || '')
      setQuantity(1)
    }
    setLoadingNode(false)
  }, [])

  const handleAdd = () => {
    if (!selectedNode) return

    const item: KalkiaCalculationItemInput = {
      nodeId: selectedNode.id,
      variantId: selectedVariantId || null,
      quantity,
    }

    const variant = selectedNode.variants?.find((v) => v.id === selectedVariantId)
    onAdd(item, selectedNode.name, variant?.name)

    // Reset selection
    setSelectedNode(null)
    setSelectedVariantId('')
    setQuantity(1)
  }

  const handleClearSelection = () => {
    setSelectedNode(null)
    setSelectedVariantId('')
    setQuantity(1)
  }

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
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

  const getCalculatedTime = (): number => {
    if (!selectedNode) return 0
    let baseTime = selectedNode.base_time_seconds

    if (selectedVariantId) {
      const variant = selectedNode.variants?.find((v) => v.id === selectedVariantId)
      if (variant) {
        baseTime = Math.round(baseTime * variant.time_multiplier) + variant.extra_time_seconds
      }
    }

    return baseTime * quantity
  }

  // Group results by path prefix
  const groupedResults = results.reduce((acc, node) => {
    const rootPath = node.path.split('.')[0]
    if (!acc[rootPath]) acc[rootPath] = []
    acc[rootPath].push(node)
    return acc
  }, {} as Record<string, KalkiaNodeSummary[]>)

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Search and Filters */}
      <div className="space-y-3 p-4 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Søg komponenter (min. 2 tegn)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle typer</SelectItem>
              <SelectItem value="operation">Operationer</SelectItem>
              <SelectItem value="composite">Pakker</SelectItem>
              <SelectItem value="group">Grupper</SelectItem>
            </SelectContent>
          </Select>

          {search && (
            <Badge variant="secondary" className="px-3">
              {results.length} resultater
            </Badge>
          )}
        </div>
      </div>

      {/* Results / Selection area */}
      <div className="flex-1 overflow-hidden flex">
        {/* Search Results */}
        <div className={`flex-1 overflow-y-auto border-r ${selectedNode ? 'w-1/2' : 'w-full'}`}>
          {loading ? (
            <div className="p-8 text-center text-gray-500">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
              Søger...
            </div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {search.length < 2 ? (
                <>
                  <Search className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>Indtast mindst 2 tegn for at søge</p>
                  <p className="text-sm mt-2">Fx: &quot;stik&quot;, &quot;spot&quot;, &quot;tavle&quot;</p>
                </>
              ) : (
                <>
                  <Package className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>Ingen komponenter fundet</p>
                </>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {Object.entries(groupedResults).map(([rootPath, nodes]) => (
                <div key={rootPath}>
                  <div className="px-3 py-2 bg-gray-50 text-sm font-medium text-gray-600 flex items-center gap-2">
                    <FolderTree className="w-4 h-4" />
                    {rootPath}
                    <Badge variant="secondary" className="text-xs">
                      {nodes.length}
                    </Badge>
                  </div>
                  {nodes.map((node) => {
                    const Icon = nodeTypeIcons[node.node_type]
                    const colorClass = nodeTypeColors[node.node_type]
                    const isGroup = node.node_type === 'group'
                    const isExpanded = expandedGroups.has(node.id)

                    return (
                      <button
                        key={node.id}
                        className={`w-full p-3 text-left hover:bg-gray-50 transition-colors flex items-center gap-3 ${
                          selectedNode?.id === node.id ? 'bg-blue-50' : ''
                        }`}
                        onClick={() => handleSelectNode(node)}
                        disabled={loadingNode}
                        style={{ paddingLeft: `${12 + node.depth * 16}px` }}
                      >
                        {isGroup ? (
                          isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          )
                        ) : null}

                        <div className={`w-8 h-8 rounded-lg ${colorClass} flex items-center justify-center flex-shrink-0`}>
                          <Icon className="w-4 h-4" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{node.name}</span>
                            <Badge variant="outline" className="text-xs flex-shrink-0">
                              {node.code}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                            {node.base_time_seconds > 0 && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatTime(node.base_time_seconds)}
                              </span>
                            )}
                            {node.default_sale_price > 0 && (
                              <span>{formatPrice(node.default_sale_price)}</span>
                            )}
                            {node.variant_count > 0 && (
                              <span>{node.variant_count} varianter</span>
                            )}
                          </div>
                        </div>

                        {!isGroup && (
                          <Plus className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected Node Detail */}
        {selectedNode && (
          <div className="w-1/2 p-4 overflow-y-auto bg-gray-50">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${nodeTypeColors[selectedNode.node_type]} flex items-center justify-center`}>
                  {selectedNode.node_type === 'composite' ? (
                    <Layers className="w-5 h-5" />
                  ) : (
                    <Wrench className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold">{selectedNode.name}</h3>
                  <Badge variant="outline" className="text-xs">{selectedNode.code}</Badge>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={handleClearSelection}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {selectedNode.description && (
              <p className="text-sm text-gray-600 mb-4">{selectedNode.description}</p>
            )}

            {/* Variant Selection */}
            {selectedNode.variants && selectedNode.variants.length > 0 && (
              <div className="mb-4">
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Vægtype / Variant
                </label>
                <Select value={selectedVariantId} onValueChange={setSelectedVariantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Vælg variant" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedNode.variants.map((variant: KalkiaVariant) => (
                      <SelectItem key={variant.id} value={variant.id}>
                        <div className="flex items-center justify-between w-full">
                          <span>{variant.name}</span>
                          {variant.is_default && (
                            <Badge variant="secondary" className="ml-2 text-xs">Standard</Badge>
                          )}
                          {variant.time_multiplier !== 1 && (
                            <span className="text-xs text-gray-500 ml-2">
                              ({variant.time_multiplier}x tid)
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedVariantId && (
                  <div className="mt-2 text-xs text-gray-500">
                    {selectedNode.variants.find((v) => v.id === selectedVariantId)?.description}
                  </div>
                )}
              </div>
            )}

            {/* Quantity */}
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Antal
              </label>
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-24"
              />
            </div>

            {/* Summary Card */}
            <Card className="mb-4">
              <CardContent className="py-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">Basistid:</span>
                    <span className="ml-2 font-medium">
                      {formatTime(selectedNode.base_time_seconds)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Total tid:</span>
                    <span className="ml-2 font-medium text-blue-600">
                      {formatTime(getCalculatedTime())}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Salgspris:</span>
                    <span className="ml-2 font-medium">
                      {formatPrice(selectedNode.default_sale_price)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Sværhedsgrad:</span>
                    <span className="ml-2">
                      {'★'.repeat(selectedNode.difficulty_level)}
                      {'☆'.repeat(5 - selectedNode.difficulty_level)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Materials Preview */}
            {selectedVariantId && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Materialer</h4>
                {(() => {
                  const variant = selectedNode.variants?.find((v) => v.id === selectedVariantId)
                  const materials = (variant as { materials?: Array<{ id: string; material_name: string; quantity: number; unit: string; cost_price?: number }> })?.materials
                  if (!materials || materials.length === 0) {
                    return <p className="text-sm text-gray-500">Ingen materialer defineret</p>
                  }
                  return (
                    <div className="space-y-1">
                      {materials.map((mat) => (
                        <div key={mat.id} className="flex items-center justify-between text-sm bg-white rounded p-2">
                          <span>{mat.material_name}</span>
                          <span className="text-gray-500">
                            {mat.quantity * quantity} {mat.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Add Button */}
            <Button onClick={handleAdd} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Tilføj til kalkulation
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
