'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Pencil,
  Trash2,
  Calculator,
  GripVertical,
  Package,
  Settings,
  Copy,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  deleteCalculation,
  deleteCalculationRow,
  duplicateCalculation,
  addProductToCalculation,
} from '@/lib/actions/calculations'
import CalculationForm from '@/components/modules/calculations/calculation-form'
import CalculationRowForm from '@/components/modules/calculations/calculation-row-form'
import ProductPickerDialog from '@/components/modules/calculations/product-picker-dialog'
import {
  CALCULATION_TYPE_LABELS,
  CALCULATION_ROW_TYPE_LABELS,
  type CalculationWithRelations,
  type CalculationRowWithRelations,
  type CalculationType,
  type CalculationRowType,
} from '@/types/calculations.types'
import type { ProductCategory } from '@/types/products.types'

interface CalculationDetailClientProps {
  calculation: CalculationWithRelations
  categories: ProductCategory[]
  products: { id: string; name: string; sku: string | null; list_price: number }[]
}

export default function CalculationDetailClient({
  calculation,
  categories,
  products,
}: CalculationDetailClientProps) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showRowDialog, setShowRowDialog] = useState(false)
  const [editingRow, setEditingRow] = useState<CalculationRowWithRelations | null>(null)
  const [showProductPicker, setShowProductPicker] = useState(false)

  const rows = calculation.rows || []

  const handleDelete = async () => {
    if (!confirm(`Er du sikker på at du vil slette "${calculation.name}"?`)) {
      return
    }

    const result = await deleteCalculation(calculation.id)
    if (result.success) {
      toast.success('Kalkulation slettet')
      router.push('/dashboard/calculations')
    } else {
      toast.error(result.error || 'Kunne ikke slette kalkulation')
    }
  }

  const handleDuplicate = async () => {
    const result = await duplicateCalculation(calculation.id)
    if (result.success && result.data) {
      toast.success('Kalkulation duplikeret')
      router.push(`/dashboard/calculations/${result.data.id}`)
    } else {
      toast.error(result.error || 'Kunne ikke duplikere kalkulation')
    }
  }

  const handleDeleteRow = async (row: CalculationRowWithRelations) => {
    if (!confirm('Er du sikker på at du vil slette denne linje?')) {
      return
    }

    const result = await deleteCalculationRow(row.id, calculation.id)
    if (result.success) {
      toast.success('Linje slettet')
      router.refresh()
    } else {
      toast.error(result.error || 'Kunne ikke slette linje')
    }
  }

  const handleAddProduct = async (productId: string) => {
    startTransition(async () => {
      const result = await addProductToCalculation(calculation.id, productId, 1)
      if (result.success) {
        toast.success('Produkt tilføjet')
        router.refresh()
      } else {
        toast.error(result.error || 'Kunne ikke tilføje produkt')
      }
    })
    setShowProductPicker(false)
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
    }).format(price)
  }

  const nextPosition = rows.length > 0 ? Math.max(...rows.map((r) => r.position)) + 1 : 0

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" onClick={() => setShowEditDialog(true)}>
          <Settings className="w-4 h-4 mr-2" />
          Indstillinger
        </Button>
        <Button variant="outline" onClick={handleDuplicate}>
          <Copy className="w-4 h-4 mr-2" />
          Dupliker
        </Button>
        <Button variant="outline" onClick={handleDelete} className="text-red-600">
          <Trash2 className="w-4 h-4 mr-2" />
          Slet
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Rows */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calculator className="w-5 h-5" />
                Linjer ({rows.length})
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowProductPicker(true)}
                >
                  <Package className="w-4 h-4 mr-2" />
                  Fra produkt
                </Button>
                <Button size="sm" onClick={() => setShowRowDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Tilføj linje
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>Ingen linjer endnu</p>
                  <p className="text-sm">Tilføj linjer manuelt eller fra produktkataloget</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[30px]"></TableHead>
                      <TableHead>Beskrivelse</TableHead>
                      <TableHead className="text-right">Antal</TableHead>
                      <TableHead className="text-right">Pris</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <GripVertical className="w-4 h-4 text-gray-400" />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{row.description}</div>
                          <div className="flex gap-1 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {CALCULATION_ROW_TYPE_LABELS[row.row_type as CalculationRowType]}
                            </Badge>
                            {row.section && (
                              <Badge variant="secondary" className="text-xs">
                                {row.section}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {row.quantity} {row.unit}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatPrice(row.sale_price)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatPrice(row.total)}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingRow(row)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteRow(row)}
                              className="text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Summary */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Opsummering</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span>{formatPrice(calculation.subtotal)}</span>
              </div>

              {calculation.margin_percentage > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">
                    Avance ({calculation.margin_percentage}%)
                  </span>
                  <span className="text-green-600">
                    +{formatPrice(calculation.margin_amount)}
                  </span>
                </div>
              )}

              {calculation.discount_percentage > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">
                    Rabat ({calculation.discount_percentage}%)
                  </span>
                  <span className="text-red-600">
                    -{formatPrice(calculation.discount_amount)}
                  </span>
                </div>
              )}

              <div className="flex justify-between border-t pt-2">
                <span className="text-gray-500">
                  Moms ({calculation.tax_percentage}%)
                </span>
                <span>{formatPrice(calculation.tax_amount)}</span>
              </div>

              <div className="flex justify-between border-t pt-2 text-lg font-bold">
                <span>Total inkl. moms</span>
                <span>{formatPrice(calculation.final_amount)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Type</span>
                <Badge variant="outline">
                  {CALCULATION_TYPE_LABELS[calculation.calculation_type as CalculationType]}
                </Badge>
              </div>

              {calculation.is_template && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Status</span>
                  <Badge variant="secondary">Skabelon</Badge>
                </div>
              )}

              {calculation.customer && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Kunde</span>
                  <span>{calculation.customer.company_name}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Calculation Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Rediger kalkulation</DialogTitle>
          </DialogHeader>
          <CalculationForm
            calculation={calculation}
            onSuccess={() => {
              setShowEditDialog(false)
              router.refresh()
            }}
            onCancel={() => setShowEditDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Add Row Dialog */}
      <Dialog open={showRowDialog} onOpenChange={setShowRowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Tilføj linje</DialogTitle>
          </DialogHeader>
          <CalculationRowForm
            calculationId={calculation.id}
            position={nextPosition}
            onSuccess={() => {
              setShowRowDialog(false)
              router.refresh()
            }}
            onCancel={() => setShowRowDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Row Dialog */}
      <Dialog open={!!editingRow} onOpenChange={() => setEditingRow(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Rediger linje</DialogTitle>
          </DialogHeader>
          {editingRow && (
            <CalculationRowForm
              calculationId={calculation.id}
              row={editingRow}
              position={editingRow.position}
              onSuccess={() => {
                setEditingRow(null)
                router.refresh()
              }}
              onCancel={() => setEditingRow(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Product Picker Dialog */}
      <ProductPickerDialog
        open={showProductPicker}
        onOpenChange={setShowProductPicker}
        products={products}
        onSelect={handleAddProduct}
      />
    </div>
  )
}
