'use client'

import { useState, useMemo } from 'react'
import {
  Package,
  Download,
  Copy,
  Check,
  Search,
  SortAsc,
  SortDesc,
  FileSpreadsheet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { CalculationItem } from './CalculationPreview'
import { formatCurrency } from '@/lib/utils/format'
import { calculateDBAmount, calculateDBPercentage } from '@/lib/logic/pricing'

interface MaterialSummaryProps {
  items: CalculationItem[]
  className?: string
}

interface ConsolidatedMaterial {
  name: string
  totalQuantity: number
  unit: string
  costPrice: number
  salePrice: number
  totalCost: number
  totalSale: number
  usedIn: string[]
}

type SortField = 'name' | 'quantity' | 'cost' | 'margin'
type SortDirection = 'asc' | 'desc'

export function MaterialSummary({ items, className = '' }: MaterialSummaryProps) {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [copied, setCopied] = useState(false)

  // Consolidate materials from all items
  const consolidatedMaterials = useMemo(() => {
    const materialMap = new Map<string, ConsolidatedMaterial>()

    items.forEach((item) => {
      if (item.materials && item.materials.length > 0) {
        item.materials.forEach((mat) => {
          const key = `${mat.name}-${mat.unit}`
          const existing = materialMap.get(key)
          const quantity = mat.quantity * item.quantity

          if (existing) {
            existing.totalQuantity += quantity
            existing.totalCost += mat.costPrice * quantity
            existing.totalSale += mat.salePrice * quantity
            if (!existing.usedIn.includes(item.componentName)) {
              existing.usedIn.push(item.componentName)
            }
          } else {
            materialMap.set(key, {
              name: mat.name,
              totalQuantity: quantity,
              unit: mat.unit,
              costPrice: mat.costPrice,
              salePrice: mat.salePrice,
              totalCost: mat.costPrice * quantity,
              totalSale: mat.salePrice * quantity,
              usedIn: [item.componentName],
            })
          }
        })
      }
    })

    return Array.from(materialMap.values())
  }, [items])

  // Filter and sort materials
  const filteredMaterials = useMemo(() => {
    let filtered = consolidatedMaterials

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(
        (mat) =>
          mat.name.toLowerCase().includes(searchLower) ||
          mat.usedIn.some((c) => c.toLowerCase().includes(searchLower))
      )
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'quantity':
          comparison = a.totalQuantity - b.totalQuantity
          break
        case 'cost':
          comparison = a.totalCost - b.totalCost
          break
        case 'margin':
          const marginA = calculateDBPercentage(a.totalCost, a.totalSale)
          const marginB = calculateDBPercentage(b.totalCost, b.totalSale)
          comparison = marginA - marginB
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return filtered
  }, [consolidatedMaterials, search, sortField, sortDirection])

  // Calculate totals
  const totals = useMemo(() => {
    return filteredMaterials.reduce(
      (acc, mat) => ({
        totalCost: acc.totalCost + mat.totalCost,
        totalSale: acc.totalSale + mat.totalSale,
        itemCount: acc.itemCount + 1,
      }),
      { totalCost: 0, totalSale: 0, itemCount: 0 }
    )
  }, [filteredMaterials])


  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const SortIcon = sortDirection === 'asc' ? SortAsc : SortDesc

  // Copy to clipboard as text
  const handleCopyToClipboard = () => {
    const text = filteredMaterials
      .map((mat) => `${mat.name}\t${mat.totalQuantity}\t${mat.unit}\t${mat.totalCost.toFixed(2)}`)
      .join('\n')

    const header = 'Materiale\tAntal\tEnhed\tKostpris\n'
    navigator.clipboard.writeText(header + text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Export as CSV
  const handleExportCSV = () => {
    const header = 'Materiale,Antal,Enhed,Kostpris pr. stk,Salgspris pr. stk,Total kostpris,Total salgspris,Brugt i\n'
    const rows = filteredMaterials
      .map(
        (mat) =>
          `"${mat.name}",${mat.totalQuantity},"${mat.unit}",${mat.costPrice.toFixed(2)},${mat.salePrice.toFixed(2)},${mat.totalCost.toFixed(2)},${mat.totalSale.toFixed(2)},"${mat.usedIn.join(', ')}"`
      )
      .join('\n')

    const totalRow = `\n"TOTAL",,,,,${totals.totalCost.toFixed(2)},${totals.totalSale.toFixed(2)},`

    const blob = new Blob([header + rows + totalRow], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `materialer-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  if (consolidatedMaterials.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="flex flex-col items-center justify-center py-12 text-gray-500">
          <Package className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-lg font-medium">Ingen materialer</p>
          <p className="text-sm">Tilføj komponenter med materialer for at se oversigt</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="p-4 border-b bg-white space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-orange-500" />
            <h3 className="font-semibold">Materialeoversigt</h3>
            <Badge variant="secondary">{consolidatedMaterials.length} typer</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyToClipboard}
              className="text-xs"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 mr-1 text-green-500" />
                  Kopieret
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 mr-1" />
                  Kopier
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="text-xs"
            >
              <FileSpreadsheet className="w-3 h-3 mr-1" />
              Eksporter CSV
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Søg i materialer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 border-b text-xs font-medium text-gray-600">
        <button
          className="col-span-5 flex items-center gap-1 text-left hover:text-gray-900"
          onClick={() => toggleSort('name')}
        >
          Materiale
          {sortField === 'name' && <SortIcon className="w-3 h-3" />}
        </button>
        <button
          className="col-span-2 flex items-center gap-1 text-right justify-end hover:text-gray-900"
          onClick={() => toggleSort('quantity')}
        >
          Antal
          {sortField === 'quantity' && <SortIcon className="w-3 h-3" />}
        </button>
        <button
          className="col-span-2 flex items-center gap-1 text-right justify-end hover:text-gray-900"
          onClick={() => toggleSort('cost')}
        >
          Kostpris
          {sortField === 'cost' && <SortIcon className="w-3 h-3" />}
        </button>
        <button
          className="col-span-3 flex items-center gap-1 text-right justify-end hover:text-gray-900"
          onClick={() => toggleSort('margin')}
        >
          DB
          {sortField === 'margin' && <SortIcon className="w-3 h-3" />}
        </button>
      </div>

      {/* Materials List */}
      <div className="flex-1 overflow-y-auto">
        {filteredMaterials.map((mat, idx) => {
          const margin = calculateDBAmount(mat.totalCost, mat.totalSale)
          const marginPercent = calculateDBPercentage(mat.totalCost, mat.totalSale)

          return (
            <div
              key={`${mat.name}-${mat.unit}-${idx}`}
              className="grid grid-cols-12 gap-2 px-4 py-3 border-b hover:bg-gray-50 items-center"
            >
              <div className="col-span-5">
                <p className="font-medium text-sm truncate">{mat.name}</p>
                <p className="text-xs text-gray-500 truncate">
                  {mat.usedIn.length === 1 ? mat.usedIn[0] : `${mat.usedIn.length} komponenter`}
                </p>
              </div>
              <div className="col-span-2 text-right text-sm">
                <span className="font-medium">{mat.totalQuantity}</span>
                <span className="text-gray-500 ml-1">{mat.unit}</span>
              </div>
              <div className="col-span-2 text-right text-sm font-medium">
                {formatCurrency(mat.totalCost)}
              </div>
              <div className="col-span-3 text-right">
                <span className={`text-sm font-medium ${margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(margin)}
                </span>
                <span className="text-xs text-gray-500 ml-1">
                  ({marginPercent.toFixed(1)}%)
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Totals Footer */}
      <div className="border-t bg-gray-50 p-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-gray-500">Total kostpris</p>
            <p className="text-lg font-semibold">{formatCurrency(totals.totalCost)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total salgspris</p>
            <p className="text-lg font-semibold">{formatCurrency(totals.totalSale)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total DB</p>
            <p className={`text-lg font-semibold ${totals.totalSale - totals.totalCost >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(totals.totalSale - totals.totalCost)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
