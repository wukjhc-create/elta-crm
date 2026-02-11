'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText,
  User,
  Calendar,
  Loader2,
  X,
  Building2,
  Search,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { formatCurrency } from '@/lib/utils/format'
import { getCustomersForSelect } from '@/lib/actions/offers'
import { createOfferFromCalculation } from '@/lib/actions/kalkia'
import type { CalculationItem } from './CalculationPreview'
import type { CalculationResult } from '@/types/kalkia.types'

interface CustomerOption {
  id: string
  company_name: string
  customer_number: string
}

interface CreateOfferModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  calculationName: string
  items: CalculationItem[]
  result: CalculationResult | null
  settings: {
    hourlyRate: number
    marginPercentage: number
    discountPercentage: number
  }
  onSuccess?: (offerId: string) => void
}

export function CreateOfferModal({
  open,
  onOpenChange,
  calculationName,
  items,
  result,
  settings,
  onSuccess,
}: CreateOfferModalProps) {
  const router = useRouter()
  const toast = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null)
  const [showCustomerList, setShowCustomerList] = useState(false)

  // Form fields
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [termsAndConditions, setTermsAndConditions] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Load customers
  useEffect(() => {
    const loadCustomers = async () => {
      setLoadingCustomers(true)
      try {
        const result = await getCustomersForSelect()
        if (result.success && result.data) {
          setCustomers(result.data)
        }
      } catch {
        toast.error('Kunne ikke hente kunder')
      } finally {
        setLoadingCustomers(false)
      }
    }
    if (open) {
      loadCustomers()
      // Set default title from calculation name
      setTitle(calculationName || 'Nyt tilbud')
      // Set default valid until to 30 days from now
      const defaultDate = new Date()
      defaultDate.setDate(defaultDate.getDate() + 30)
      setValidUntil(defaultDate.toISOString().split('T')[0])
    }
  }, [open, calculationName])

  // Filter customers by search
  const filteredCustomers = customers.filter((c) =>
    c.company_name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.customer_number.toLowerCase().includes(customerSearch.toLowerCase())
  )

  const formatPrice = formatCurrency

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Titel er påkrævet')
      return
    }
    if (!selectedCustomer) {
      setError('Vælg en kunde')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const offerResult = await createOfferFromCalculation({
        title: title.trim(),
        description: description.trim() || null,
        customerId: selectedCustomer.id,
        validUntil: validUntil || null,
        termsAndConditions: termsAndConditions.trim() || null,
        items,
        result,
        settings,
      })

      if (offerResult.success && offerResult.data) {
        onOpenChange(false)
        onSuccess?.(offerResult.data.id)
        router.push(`/dashboard/offers/${offerResult.data.id}`)
      } else {
        setError(offerResult.error || 'Kunne ikke oprette tilbud')
      }
    } catch (err) {
      console.error('Error creating offer:', err)
      setError('Der opstod en uventet fejl')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setError(null)
    setSelectedCustomer(null)
    setCustomerSearch('')
    setTitle('')
    setDescription('')
    setTermsAndConditions('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Opret tilbud fra kalkulation
          </DialogTitle>
          <DialogDescription>
            Opret et tilbud baseret på din kalkulation. Alle komponenter og priser overføres.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Calculation Summary */}
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="text-sm font-medium text-blue-700 mb-2">Kalkulation</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-blue-600">Komponenter:</span>
                <span className="ml-2 font-medium">{items.length}</span>
              </div>
              <div>
                <span className="text-blue-600">Total:</span>
                <span className="ml-2 font-medium">
                  {result ? formatPrice(result.finalAmount) : '-'}
                </span>
              </div>
            </div>
          </div>

          {/* Customer Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Kunde *
            </Label>
            <div className="relative">
              {selectedCustomer ? (
                <div className="flex items-center justify-between p-3 border rounded-lg bg-green-50 border-green-200">
                  <div>
                    <p className="font-medium text-green-800">{selectedCustomer.company_name}</p>
                    <p className="text-xs text-green-600">{selectedCustomer.customer_number}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedCustomer(null)}
                    className="text-green-600 hover:text-green-800"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Søg efter kunde..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      onFocus={() => setShowCustomerList(true)}
                      className="pl-10"
                    />
                  </div>
                  {showCustomerList && (
                    <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {loadingCustomers ? (
                        <div className="p-4 text-center text-gray-500">
                          <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" />
                          Henter kunder...
                        </div>
                      ) : filteredCustomers.length === 0 ? (
                        <div className="p-4 text-center text-gray-500 text-sm">
                          Ingen kunder fundet
                        </div>
                      ) : (
                        filteredCustomers.map((customer) => (
                          <button
                            key={customer.id}
                            type="button"
                            className="w-full p-3 text-left hover:bg-gray-50 flex items-center justify-between border-b last:border-b-0"
                            onClick={() => {
                              setSelectedCustomer(customer)
                              setCustomerSearch('')
                              setShowCustomerList(false)
                            }}
                          >
                            <div>
                              <p className="font-medium">{customer.company_name}</p>
                              <p className="text-xs text-gray-500">{customer.customer_number}</p>
                            </div>
                            <Check className="w-4 h-4 text-transparent" />
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Titel *
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titel på tilbuddet"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Beskrivelse</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Valgfri beskrivelse..."
              rows={2}
            />
          </div>

          {/* Valid Until */}
          <div className="space-y-2">
            <Label htmlFor="validUntil" className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Gyldig til
            </Label>
            <Input
              id="validUntil"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>

          {/* Terms */}
          <div className="space-y-2">
            <Label htmlFor="terms">Vilkår og betingelser</Label>
            <Textarea
              id="terms"
              value={termsAndConditions}
              onChange={(e) => setTermsAndConditions(e.target.value)}
              placeholder="Betalingsbetingelser, leveringsvilkår, etc..."
              rows={3}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Annuller
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Opretter...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 mr-2" />
                Opret tilbud
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
