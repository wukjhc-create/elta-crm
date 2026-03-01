'use client'

import { useState, useTransition, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { CALC_DEFAULTS, DEFAULT_TAX_RATE } from '@/lib/constants'
import { createCalculation, updateCalculation } from '@/lib/actions/calculations'
import { getCustomersForSelect } from '@/lib/actions/offers'
import CalculationModeSelector from './calculation-mode-selector'
import {
  CALCULATION_TYPE_LABELS,
  type Calculation,
  type CalculationType,
  type CalculationMode,
} from '@/types/calculations.types'

interface CalculationFormProps {
  calculation?: Calculation
  onSuccess: (calculation: Calculation) => void
  onCancel: () => void
}

export default function CalculationForm({
  calculation,
  onSuccess,
  onCancel,
}: CalculationFormProps) {
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [isTemplate, setIsTemplate] = useState(calculation?.is_template ?? false)
  const [customers, setCustomers] = useState<{ id: string; company_name: string }[]>([])
  const [calculationMode, setCalculationMode] = useState<CalculationMode>(
    calculation?.calculation_mode || 'standard'
  )
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    async function loadCustomers() {
      const result = await getCustomersForSelect()
      if (result.success && result.data) {
        setCustomers(result.data)
      }
    }
    loadCustomers()
  }, [])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set('is_template', isTemplate.toString())
    formData.set('calculation_mode', calculationMode)

    startTransition(async () => {
      const result = calculation
        ? await updateCalculation(formData)
        : await createCalculation(formData)

      if (result.success && result.data) {
        toast.success(calculation ? 'Kalkulation opdateret' : 'Kalkulation oprettet')
        onSuccess(result.data)
      } else {
        toast.error(result.error || 'Der opstod en fejl')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {calculation && <input type="hidden" name="id" value={calculation.id} />}

      {/* Calculation Mode Selector */}
      <div>
        <Label className="mb-2 block">Kalkulationstilstand</Label>
        <CalculationModeSelector
          value={calculationMode}
          onChange={setCalculationMode}
          disabled={isPending}
        />
      </div>

      <div>
        <Label htmlFor="name">Navn *</Label>
        <Input
          id="name"
          name="name"
          defaultValue={calculation?.name}
          required
          placeholder="F.eks. Solcelleanlæg 10 kWp"
        />
      </div>

      <div>
        <Label htmlFor="description">Beskrivelse</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={calculation?.description || ''}
          placeholder="Kort beskrivelse af kalkulationen..."
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="calculation_type">Type</Label>
          <Select
            name="calculation_type"
            defaultValue={calculation?.calculation_type || 'custom'}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CALCULATION_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="customer_id">Kunde</Label>
          <Select name="customer_id" defaultValue={calculation?.customer_id || ''}>
            <SelectTrigger>
              <SelectValue placeholder="Vælg kunde (valgfri)" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customer.company_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="margin_percentage">Avance %</Label>
          <Input
            id="margin_percentage"
            name="margin_percentage"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue={calculation?.margin_percentage || 0}
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
            defaultValue={calculation?.discount_percentage || 0}
          />
        </div>

        <div>
          <Label htmlFor="tax_percentage">Moms %</Label>
          <Input
            id="tax_percentage"
            name="tax_percentage"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue={calculation?.tax_percentage || DEFAULT_TAX_RATE}
          />
        </div>
      </div>

      {/* Electrician-specific fields */}
      {calculationMode === 'electrician' && (
        <div className="border rounded-lg p-4 bg-gray-50 space-y-4">
          <h4 className="font-medium text-gray-700">El-arbejde indstillinger</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="default_hourly_rate">Standard timepris (DKK)</Label>
              <Input
                id="default_hourly_rate"
                name="default_hourly_rate"
                type="number"
                step="1"
                min="0"
                defaultValue={calculation?.default_hourly_rate || CALC_DEFAULTS.HOURLY_RATES.ELECTRICIAN}
              />
            </div>
            <div>
              <Label htmlFor="materials_markup_percentage">Materialemarkup %</Label>
              <Input
                id="materials_markup_percentage"
                name="materials_markup_percentage"
                type="number"
                step="0.01"
                min="0"
                max="100"
                defaultValue={calculation?.materials_markup_percentage || CALC_DEFAULTS.MARGINS.MATERIALS}
              />
            </div>
          </div>
        </div>
      )}

      {/* Advanced Options */}
      <div className="border-t pt-4">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          {showAdvanced ? 'Skjul avancerede indstillinger' : 'Vis avancerede indstillinger'}
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="show_cost_breakdown"
                name="show_cost_breakdown"
                value="true"
                defaultChecked={calculation?.show_cost_breakdown ?? false}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="show_cost_breakdown">Vis omkostningsfordeling på tilbud</Label>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="group_by_section"
                name="group_by_section"
                value="true"
                defaultChecked={calculation?.group_by_section ?? true}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="group_by_section">Gruppér linjer efter sektion</Label>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="is_template"
          checked={isTemplate}
          onCheckedChange={setIsTemplate}
        />
        <Label htmlFor="is_template">Gem som skabelon</Label>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuller
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Gemmer...' : calculation ? 'Opdater' : 'Opret'}
        </Button>
      </div>
    </form>
  )
}
