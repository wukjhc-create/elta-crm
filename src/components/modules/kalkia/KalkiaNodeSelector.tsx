'use client'

import { useState, useEffect } from 'react'
import {
  Search,
  Plus,
  X,
  Clock,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { searchKalkiaNodes } from '@/lib/actions/kalkia'
import type { KalkiaNodeSummary, KalkiaCalculationItemInput } from '@/types/kalkia.types'

interface KalkiaNodeSelectorProps {
  onAdd: (item: KalkiaCalculationItemInput) => void
  existingNodeIds?: string[]
}

export function KalkiaNodeSelector({ onAdd, existingNodeIds = [] }: KalkiaNodeSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<KalkiaNodeSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedNode, setSelectedNode] = useState<KalkiaNodeSummary | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [variantId, setVariantId] = useState<string>('')

  useEffect(() => {
    const searchNodes = async () => {
      if (search.length < 2) {
        setResults([])
        return
      }

      setLoading(true)
      const result = await searchKalkiaNodes(search, 20)
      if (result.success && result.data) {
        // Filter out already added nodes
        setResults(result.data.filter((n) => !existingNodeIds.includes(n.id)))
      }
      setLoading(false)
    }

    const debounce = setTimeout(searchNodes, 300)
    return () => clearTimeout(debounce)
  }, [search, existingNodeIds])

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} min`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}t ${mins}m` : `${hours}t`
  }

  const handleAdd = () => {
    if (!selectedNode) return

    const item: KalkiaCalculationItemInput = {
      nodeId: selectedNode.id,
      variantId: variantId || null,
      quantity,
    }

    onAdd(item)
    setSelectedNode(null)
    setQuantity(1)
    setVariantId('')
    setSearch('')
    setOpen(false)
  }

  const handleSelectNode = (node: KalkiaNodeSummary) => {
    setSelectedNode(node)
    setVariantId('')
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4 mr-2" />
        Tilfoej komponent
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Tilfoej komponent til kalkulation</DialogTitle>
          <DialogDescription>
            Sog efter komponenter og vaelg antal
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Sog efter komponenter..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Search Results */}
          {!selectedNode && (
            <div className="max-h-[300px] overflow-y-auto border rounded-lg">
              {loading ? (
                <div className="p-4 text-center text-gray-500">Soger...</div>
              ) : results.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  {search.length < 2
                    ? 'Indtast mindst 2 tegn for at soge'
                    : 'Ingen resultater fundet'}
                </div>
              ) : (
                <div className="divide-y">
                  {results.map((node) => (
                    <button
                      key={node.id}
                      className="w-full p-3 text-left hover:bg-gray-50 transition-colors"
                      onClick={() => handleSelectNode(node)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-yellow-100 flex items-center justify-center">
                            <Wrench className="w-4 h-4 text-yellow-600" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{node.name}</span>
                              <Badge variant="outline" className="text-xs">
                                {node.code}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                              {node.category_name && (
                                <span>{node.category_name}</span>
                              )}
                              {node.base_time_seconds > 0 && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatTime(node.base_time_seconds)}
                                </span>
                              )}
                              {node.variant_count > 0 && (
                                <span>{node.variant_count} varianter</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Selected Node */}
          {selectedNode && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded bg-yellow-100 flex items-center justify-center">
                    <Wrench className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{selectedNode.name}</span>
                      <Badge variant="outline">{selectedNode.code}</Badge>
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {selectedNode.base_time_seconds > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTime(selectedNode.base_time_seconds)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedNode(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Variant Selector (placeholder - would need variants loaded) */}
                {selectedNode.variant_count > 0 && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">
                      Variant
                    </label>
                    <Select value={variantId} onValueChange={setVariantId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Vaelg variant (valgfrit)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Standard</SelectItem>
                        {/* Variants would be loaded here */}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Quantity */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    Antal
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setSelectedNode(null)}>
                  Annuller
                </Button>
                <Button onClick={handleAdd}>
                  <Plus className="w-4 h-4 mr-2" />
                  Tilfoej
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
      </Dialog>
    </>
  )
}
