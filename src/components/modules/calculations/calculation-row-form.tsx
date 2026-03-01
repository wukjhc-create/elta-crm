'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import {
  createCalculationRow,
  updateCalculationRow,
} from '@/lib/actions/calculations'
import { PRODUCT_UNITS } from '@/types/products.types'
import {
  CALCULATION_ROW_TYPES,
  CALCULATION_ROW_TYPE_LABELS,
  CALCULATION_SECTIONS,
  ENHANCED_SECTIONS,
  COST_CATEGORIES,
  COST_CATEGORY_LABELS,
  type CalculationRow,
  type CalculationRowType,
  type CostCategory,
} from '@/types/calculations.types'
import { formatCurrency } from '@/lib/utils/format'
import { calculateLineTotal } from '@/lib/logic/pricing'
import { CALC_DEFAULTS } from '@/lib/constants'

interface CalculationRowFormProps {
  calculationId: string
  row?: CalculationRow
  position: number
  defaultHourlyRate?: number
  isLaborMode?: boolean
  onSuccess: () => void
  onCancel: () => void
}

export default function CalculationRowForm({
  calculationId,
  row,
  position,
  defaultHourlyRate = CALC_DEFAULTS.HOURLY_RATES.ELECTRICIAN,
  isLaborMode = false,
  onSuccess,
  onCancel,
}: CalculationRowFormProps) {
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [showOnOffer, setShowOnOffer] = useState(row?.show_on_offer ?? true)
  const [quantity, setQuantity] = useState(row?.quantity?.toString() || '1')
  const [salePrice, setSalePrice] = useState(row?.sale_price?.toString() || '')
  const [discountPercentage, setDiscountPercentage] = useState(
    row?.discount_percentage?.toString() || '0'
  )
  const [selectedSection, setSelectedSection] = useState(row?.section || '')
  const [costCategory, setCostCategory] = useState<CostCategory>(row?.cost_category || 'variable')
  const [hours, setHours] = useState(row?.hours?.toString() || '')
  const [hourlyRate, setHourlyRate] = useState(
    row?.hourly_rate?.toString() || defaultHourlyRate.toString()
  )

  // Auto-set cost category based on section
  const handleSectionChange = (section: string) => {
    setSelectedSection(section)
    const sectionDef = ENHANCED_SECTIONS.find((s) => s.key === section)
    if (sectionDef) {
      setCostCategory(sectionDef.costCategory)
    }
  }

  // Check if this is a labor row (for showing hours input)
  const isLaborSection = selectedSection === 'Arbejdsløn' || selectedSection === 'Arbejdslon'

  // Calculate total for preview
  const calculateTotal = () => {
    // If hours are set, use hours * hourly rate
    if (hours && parseFloat(hours) > 0) {
      return calculateLineTotal(parseFloat(hours) || 0, parseFloat(hourlyRate) || 0, parseFloat(discountPercentage) || 0)
    }
    // Otherwise use quantity * price
    return calculateLineTotal(parseFloat(quantity) || 0, parseFloat(salePrice) || 0, parseFloat(discountPercentage) || 0)
  }


  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set('show_on_offer', showOnOffer.toString())
    formData.set('calculation_id', calculationId)
    formData.set('cost_category', costCategory)
    formData.set('section', selectedSection)
    if (hours) formData.set('hours', hours)
    if (hourlyRate) formData.set('hourly_rate', hourlyRate)

    startTransition(async () => {
      const result = row
        ? await updateCalculationRow(formData)
        : await createCalculationRow(formData)

      if (result.success) {
        toast.success(row ? 'Linje opdateret' : 'Linje oprettet')
        onSuccess()
      } else {
        toast.error(result.error || 'Der opstod en fejl')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {row && <input type="hidden" name="id" value={row.id} />}
      <input type="hidden" name="position" value={position} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="row_type">Type</Label>
          <Select name="row_type" defaultValue={row?.row_type || 'manual'}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CALCULATION_ROW_TYPES.filter((t) => t !== 'product' && t !== 'supplier_product').map(
                (type) => (
                  <SelectItem key={type} value={type}>
                    {CALCULATION_ROW_TYPE_LABELS[type as CalculationRowType]}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="section">Sektion</Label>
          <Select value={selectedSection} onValueChange={handleSectionChange}>
            <SelectTrigger>
              <SelectValue placeholder="Vælg sektion (valgfri)" />
            </SelectTrigger>
            <SelectContent>
              {ENHANCED_SECTIONS.map((section) => (
                <SelectItem key={section.key} value={section.key}>
                  {section.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="description">Beskrivelse *</Label>
        <Input
          id="description"
          name="description"
          defaultValue={row?.description}
          required
          placeholder="F.eks. Installation af solceller"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="quantity">Antal *</Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            step="0.01"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </div>

        <div>
          <Label htmlFor="unit">Enhed</Label>
          <Select name="unit" defaultValue={row?.unit || 'stk'}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRODUCT_UNITS.map((unit) => (
                <SelectItem key={unit.value} value={unit.value}>
                  {unit.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="sale_price">Salgspris *</Label>
          <Input
            id="sale_price"
            name="sale_price"
            type="number"
            step="0.01"
            min="0"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
            required
            placeholder="0,00"
          />
        </div>
      </div>

      {/* Labor-specific fields */}
      {(isLaborSection || isLaborMode) && (
        <div className="border rounded-lg p-4 bg-blue-50 space-y-4">
          <h4 className="font-medium text-blue-700 text-sm">Arbejdstid</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="hours">Timer</Label>
              <Input
                id="hours"
                name="hours"
                type="number"
                step="0.5"
                min="0"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="f.eks. 8"
              />
            </div>
            <div>
              <Label htmlFor="hourly_rate">Timepris (DKK)</Label>
              <Input
                id="hourly_rate"
                name="hourly_rate"
                type="number"
                step="1"
                min="0"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="f.eks. 450"
              />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="cost_price">Kostpris</Label>
          <Input
            id="cost_price"
            name="cost_price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={row?.cost_price || ''}
            placeholder="0,00"
          />
        </div>

        <div>
          <Label htmlFor="discount_percentage">Rabat %</Label>
          <Input
            id="discount_percentage"
            name="discount_percentage"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={discountPercentage}
            onChange={(e) => setDiscountPercentage(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="cost_category">Omkostningstype</Label>
          <Select value={costCategory} onValueChange={(v) => setCostCategory(v as CostCategory)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COST_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {COST_CATEGORY_LABELS[cat]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Total Preview */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Total</span>
          <span className="text-xl font-bold">{formatCurrency(calculateTotal())}</span>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="show_on_offer"
          checked={showOnOffer}
          onCheckedChange={setShowOnOffer}
        />
        <Label htmlFor="show_on_offer">Vis på tilbud</Label>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuller
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Gemmer...' : row ? 'Opdater' : 'Tilføj'}
        </Button>
      </div>
    </form>
  )
}
