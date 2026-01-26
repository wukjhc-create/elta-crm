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
import { createCalculation, updateCalculation } from '@/lib/actions/calculations'
import { getCustomersForSelect } from '@/lib/actions/offers'
import {
  CALCULATION_TYPE_LABELS,
  type Calculation,
  type CalculationType,
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
            defaultValue={calculation?.tax_percentage || 25}
          />
        </div>
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
