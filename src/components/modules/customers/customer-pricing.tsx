'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Trash2,
  Pencil,
  Save,
  X,
  Percent,
  DollarSign,
  Building2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import {
  getCustomerSupplierPrices,
  upsertCustomerSupplierPrice,
  deleteCustomerSupplierPrice,
} from '@/lib/actions/customer-pricing'
import { getSuppliersForSelect } from '@/lib/actions/products'
import type { CustomerSupplierPrice, CreateCustomerSupplierPriceData } from '@/types/suppliers.types'

interface CustomerPricingProps {
  customerId: string
  customerName: string
}

export function CustomerPricing({ customerId, customerName }: CustomerPricingProps) {
  const toast = useToast()
  const [agreements, setAgreements] = useState<CustomerSupplierPrice[]>([])
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; code: string | null }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingAgreement, setEditingAgreement] = useState<CustomerSupplierPrice | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    const [agreementsResult, suppliersResult] = await Promise.all([
      getCustomerSupplierPrices(customerId),
      getSuppliersForSelect(),
    ])

    if (agreementsResult.success && agreementsResult.data) setAgreements(agreementsResult.data)
    if (suppliersResult.success && suppliersResult.data) setSuppliers(suppliersResult.data)
    setIsLoading(false)
  }, [customerId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleDelete = async (agreement: CustomerSupplierPrice) => {
    if (!confirm('Er du sikker på at du vil slette denne prisaftale?')) return

    const result = await deleteCustomerSupplierPrice(agreement.id)
    if (result.success) {
      toast.success('Prisaftale slettet')
      loadData()
    } else {
      toast.error('Fejl', result.error)
    }
  }

  const handleFormSuccess = () => {
    setShowForm(false)
    setEditingAgreement(null)
    loadData()
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-8 bg-gray-200 rounded w-1/3" />
        <div className="h-20 bg-gray-200 rounded" />
      </div>
    )
  }

  // Get supplier name by ID
  const getSupplierName = (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId)
    return supplier?.name || 'Ukendt leverandør'
  }

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Percent className="w-5 h-5" />
          Leverandørpriser
        </h2>
        <button
          onClick={() => { setEditingAgreement(null); setShowForm(true) }}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <Plus className="w-4 h-4" />
          Tilføj aftale
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <PriceAgreementForm
          customerId={customerId}
          suppliers={suppliers}
          editingAgreement={editingAgreement}
          existingSupplierIds={agreements.map(a => a.supplier_id)}
          onSuccess={handleFormSuccess}
          onCancel={() => { setShowForm(false); setEditingAgreement(null) }}
        />
      )}

      {/* Agreements List */}
      {agreements.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">
          Ingen kundespecifikke prisaftaler
        </p>
      ) : (
        <div className="space-y-3 mt-4">
          {agreements.map(agreement => (
            <div
              key={agreement.id}
              className={`border rounded-lg p-4 ${!agreement.is_active ? 'opacity-50' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Building2 className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium">{getSupplierName(agreement.supplier_id)}</p>
                    <div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Percent className="w-3 h-3" />
                        {agreement.discount_percentage}% rabat
                      </span>
                      {agreement.custom_margin_percentage != null && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />
                          {agreement.custom_margin_percentage}% margin
                        </span>
                      )}
                      {agreement.price_list_code && (
                        <span>Prisliste: {agreement.price_list_code}</span>
                      )}
                    </div>
                    {agreement.notes && (
                      <p className="text-xs text-gray-400 mt-1 italic">{agreement.notes}</p>
                    )}
                    {(agreement.valid_from || agreement.valid_to) && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {agreement.valid_from && `Fra: ${new Date(agreement.valid_from).toLocaleDateString('da-DK')}`}
                        {agreement.valid_from && agreement.valid_to && ' — '}
                        {agreement.valid_to && `Til: ${new Date(agreement.valid_to).toLocaleDateString('da-DK')}`}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setEditingAgreement(agreement); setShowForm(true) }}
                    className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                    title="Rediger"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(agreement)}
                    className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"
                    title="Slet"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// =====================================================
// Price Agreement Form
// =====================================================

interface PriceAgreementFormProps {
  customerId: string
  suppliers: { id: string; name: string; code: string | null }[]
  editingAgreement: CustomerSupplierPrice | null
  existingSupplierIds: string[]
  onSuccess: () => void
  onCancel: () => void
}

function PriceAgreementForm({
  customerId,
  suppliers,
  editingAgreement,
  existingSupplierIds,
  onSuccess,
  onCancel,
}: PriceAgreementFormProps) {
  const toast = useToast()
  const [isSaving, setIsSaving] = useState(false)

  const [supplierId, setSupplierId] = useState(editingAgreement?.supplier_id || '')
  const [discount, setDiscount] = useState(editingAgreement?.discount_percentage?.toString() || '0')
  const [margin, setMargin] = useState(editingAgreement?.custom_margin_percentage?.toString() || '')
  const [priceListCode, setPriceListCode] = useState(editingAgreement?.price_list_code || '')
  const [notes, setNotes] = useState(editingAgreement?.notes || '')
  const [validFrom, setValidFrom] = useState(editingAgreement?.valid_from || '')
  const [validTo, setValidTo] = useState(editingAgreement?.valid_to || '')

  // Filter out suppliers that already have agreements (unless editing)
  const availableSuppliers = suppliers.filter(
    s => !existingSupplierIds.includes(s.id) || s.id === editingAgreement?.supplier_id
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!supplierId) {
      toast.error('Vælg en leverandør')
      return
    }

    setIsSaving(true)

    const data: CreateCustomerSupplierPriceData = {
      customer_id: customerId,
      supplier_id: supplierId,
      discount_percentage: Number(discount) || 0,
      custom_margin_percentage: margin ? Number(margin) : undefined,
      price_list_code: priceListCode || undefined,
      notes: notes || undefined,
      valid_from: validFrom || undefined,
      valid_to: validTo || undefined,
      is_active: true,
    }

    const result = await upsertCustomerSupplierPrice(data)

    if (result.success) {
      toast.success(editingAgreement ? 'Aftale opdateret' : 'Aftale oprettet')
      onSuccess()
    } else {
      toast.error('Fejl', result.error)
    }

    setIsSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-4 bg-gray-50 space-y-3 mb-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">
          {editingAgreement ? 'Rediger prisaftale' : 'Ny prisaftale'}
        </h4>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Supplier */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Leverandør <span className="text-red-500">*</span>
          </label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            disabled={!!editingAgreement}
            required
          >
            <option value="">Vælg leverandør...</option>
            {availableSuppliers.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} {s.code ? `(${s.code})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Discount */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Rabat (%)</label>
          <input
            type="number"
            step="0.1"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            placeholder="0"
          />
        </div>

        {/* Custom Margin */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Avance (%)</label>
          <input
            type="number"
            step="0.1"
            value={margin}
            onChange={(e) => setMargin(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            placeholder="Standard"
          />
        </div>

        {/* Price List Code */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Prisliste-kode</label>
          <input
            type="text"
            value={priceListCode}
            onChange={(e) => setPriceListCode(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            placeholder="Valgfri"
          />
        </div>

        {/* Valid From */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Gyldig fra</label>
          <input
            type="date"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>

        {/* Valid To */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Gyldig til</label>
          <input
            type="date"
            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>

        {/* Notes */}
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Noter</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            placeholder="Valgfri noter"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Annuller
        </Button>
        <Button type="submit" size="sm" disabled={isSaving}>
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {isSaving ? 'Gemmer...' : editingAgreement ? 'Opdater' : 'Opret'}
        </Button>
      </div>
    </form>
  )
}
