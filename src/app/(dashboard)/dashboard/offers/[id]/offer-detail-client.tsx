'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Plus,
  FileText,
  Send,
  CheckCircle,
  XCircle,
  Calendar,
  Building,
  User,
  Printer,
  Download,
  Loader2,
  Mail,
  Package,
  Calculator,
} from 'lucide-react'
import { OfferStatusBadge } from '@/components/modules/offers/offer-status-badge'
import { OfferForm } from '@/components/modules/offers/offer-form'
import { LineItemForm } from '@/components/modules/offers/line-item-form'
import { OfferActivityTimeline } from '@/components/modules/offers/offer-activity-timeline'
import {
  deleteOffer,
  updateOfferStatus,
  deleteLineItem,
  sendOffer,
  addProductToOffer,
  importCalculationToOffer,
} from '@/lib/actions/offers'
import { getProductsForSelect } from '@/lib/actions/products'
import { getCalculationsForSelect } from '@/lib/actions/calculations'
import { getOfferActivities } from '@/lib/actions/offer-activities'
import { useToast } from '@/components/ui/toast'
import {
  OFFER_STATUSES,
  OFFER_STATUS_LABELS,
  type OfferWithRelations,
  type OfferLineItem,
  type OfferStatus,
} from '@/types/offers.types'
import type { OfferActivityWithPerformer } from '@/types/offer-activities.types'
import type { CompanySettings } from '@/types/company-settings.types'

interface OfferDetailClientProps {
  offer: OfferWithRelations
  companySettings: CompanySettings | null
}

export function OfferDetailClient({ offer, companySettings }: OfferDetailClientProps) {
  const router = useRouter()
  const toast = useToast()
  const [showEditForm, setShowEditForm] = useState(false)
  const [showLineItemForm, setShowLineItemForm] = useState(false)
  const [editingLineItem, setEditingLineItem] = useState<OfferLineItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deletingLineItemId, setDeletingLineItemId] = useState<string | null>(null)
  const [showPdfPreview, setShowPdfPreview] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false)
  const [activities, setActivities] = useState<OfferActivityWithPerformer[]>([])
  const [isLoadingActivities, setIsLoadingActivities] = useState(true)
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [showCalculationPicker, setShowCalculationPicker] = useState(false)
  const [products, setProducts] = useState<{ id: string; name: string; sku: string | null; list_price: number }[]>([])
  const [calculations, setCalculations] = useState<{ id: string; name: string; final_amount: number }[]>([])
  const [isAddingProduct, setIsAddingProduct] = useState(false)
  const [isImportingCalculation, setIsImportingCalculation] = useState(false)

  // Load activities on mount
  useEffect(() => {
    async function loadActivities() {
      const result = await getOfferActivities(offer.id)
      if (result.success && result.data) {
        setActivities(result.data)
      }
      setIsLoadingActivities(false)
    }
    loadActivities()
  }, [offer.id])

  const handleDelete = async () => {
    if (!confirm('Er du sikker på, at du vil slette dette tilbud?')) {
      return
    }

    setIsDeleting(true)
    const result = await deleteOffer(offer.id)

    if (result.success) {
      toast.success('Tilbud slettet')
      router.push('/dashboard/offers')
    } else {
      toast.error('Kunne ikke slette tilbud', result.error)
      setIsDeleting(false)
    }
  }

  const handleStatusChange = async (newStatus: OfferStatus) => {
    const result = await updateOfferStatus(offer.id, newStatus)

    if (result.success) {
      toast.success('Status opdateret')
    } else {
      toast.error('Kunne ikke opdatere status', result.error)
    }

    router.refresh()
  }

  const handleOpenProductPicker = async () => {
    const result = await getProductsForSelect()
    if (result.success && result.data) {
      setProducts(result.data)
    }
    setShowProductPicker(true)
  }

  const handleOpenCalculationPicker = async () => {
    const result = await getCalculationsForSelect()
    if (result.success && result.data) {
      setCalculations(result.data)
    }
    setShowCalculationPicker(true)
  }

  const handleAddProduct = async (productId: string) => {
    setIsAddingProduct(true)
    const result = await addProductToOffer(offer.id, productId, 1)
    if (result.success) {
      toast.success('Produkt tilføjet')
      router.refresh()
    } else {
      toast.error('Kunne ikke tilføje produkt', result.error)
    }
    setIsAddingProduct(false)
    setShowProductPicker(false)
  }

  const handleImportCalculation = async (calculationId: string) => {
    setIsImportingCalculation(true)
    const result = await importCalculationToOffer(offer.id, calculationId)
    if (result.success && result.data) {
      toast.success('Kalkulation importeret', `${result.data.importedCount} linjer tilføjet`)
      router.refresh()
    } else {
      toast.error('Kunne ikke importere kalkulation', result.error)
    }
    setIsImportingCalculation(false)
    setShowCalculationPicker(false)
  }

  const handleDeleteLineItem = async (lineItemId: string) => {
    if (!confirm('Er du sikker på, at du vil slette denne linje?')) {
      return
    }

    setDeletingLineItemId(lineItemId)
    const result = await deleteLineItem(lineItemId, offer.id)

    if (result.success) {
      toast.success('Linje slettet')
    } else {
      toast.error('Kunne ikke slette linje', result.error)
    }

    setDeletingLineItemId(null)
    router.refresh()
  }

  const currency = companySettings?.default_currency || 'DKK'
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const lineItems = offer.line_items || []
  const nextPosition = lineItems.length > 0
    ? Math.max(...lineItems.map((li) => li.position)) + 1
    : 1

  const handlePrint = () => {
    setShowPdfPreview(true)
    setTimeout(() => {
      window.print()
    }, 100)
  }

  const handleDownloadPdf = async () => {
    setIsDownloadingPdf(true)
    try {
      const response = await fetch(`/api/offers/${offer.id}/pdf`)
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Kunne ikke hente PDF')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${offer.offer_number}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      // Refresh activities to show PDF generation
      const activitiesResult = await getOfferActivities(offer.id)
      if (activitiesResult.success && activitiesResult.data) {
        setActivities(activitiesResult.data)
      }
    } catch (error) {
      toast.error('Kunne ikke downloade PDF', error instanceof Error ? error.message : undefined)
    } finally {
      setIsDownloadingPdf(false)
    }
  }

  const handleSendOffer = async () => {
    if (!offer.customer) {
      toast.warning('Tilbuddet skal have en tilknyttet kunde før det kan sendes')
      return
    }

    if (!offer.customer.email) {
      toast.warning('Kunden har ingen email-adresse')
      return
    }

    const lineItems = offer.line_items || []
    if (lineItems.length === 0) {
      if (!confirm('Tilbuddet har ingen linjer. Vil du stadig sende det?')) {
        return
      }
    }

    if (!confirm(`Er du sikker på, at du vil sende tilbuddet til ${offer.customer.email}?`)) {
      return
    }

    setIsSending(true)
    const result = await sendOffer(offer.id)

    if (result.success) {
      // Refresh activities
      const activitiesResult = await getOfferActivities(offer.id)
      if (activitiesResult.success && activitiesResult.data) {
        setActivities(activitiesResult.data)
      }
      router.refresh()
      toast.success('Tilbud sendt', `Email sendt til ${offer.customer?.email}`)
    } else {
      toast.error('Kunne ikke sende tilbud', result.error)
    }

    setIsSending(false)
  }

  if (showPdfPreview) {
    return (
      <OfferPdfView
        offer={offer}
        companySettings={companySettings}
        onClose={() => setShowPdfPreview(false)}
      />
    )
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/offers"
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-gray-900">
                  {offer.title}
                </h1>
                <OfferStatusBadge status={offer.status} />
              </div>
              <p className="text-gray-600 mt-1 font-mono">
                {offer.offer_number}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Send button - only show for draft/viewed with customer */}
            {(offer.status === 'draft' || offer.status === 'viewed') && offer.customer && (
              <button
                onClick={handleSendOffer}
                disabled={isSending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4" />
                )}
                {isSending ? 'Sender...' : 'Send Tilbud'}
              </button>
            )}
            <button
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              className="inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              {isDownloadingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              PDF
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-gray-50"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button
              onClick={() => setShowEditForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-gray-50"
            >
              <Pencil className="w-4 h-4" />
              Rediger
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="inline-flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-md hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {isDeleting ? 'Sletter...' : 'Slet'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Status selector */}
            <div className="bg-white rounded-lg border p-4">
              <h3 className="text-sm font-medium text-gray-500 mb-3">
                Opdater status
              </h3>
              <div className="flex flex-wrap gap-2">
                {OFFER_STATUSES.map((status) => (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(status)}
                    disabled={offer.status === status}
                    className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                      offer.status === status
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'hover:bg-gray-50 disabled:opacity-50'
                    }`}
                  >
                    {OFFER_STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            {offer.description && (
              <div className="bg-white rounded-lg border p-6">
                <h2 className="text-lg font-semibold mb-4">Beskrivelse</h2>
                <p className="text-gray-700 whitespace-pre-wrap">
                  {offer.description}
                </p>
              </div>
            )}

            {/* Line items */}
            <div className="bg-white rounded-lg border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Linjer</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleOpenProductPicker}
                    className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-primary border rounded px-2 py-1"
                  >
                    <Package className="w-4 h-4" />
                    Fra produkt
                  </button>
                  <button
                    onClick={handleOpenCalculationPicker}
                    className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-primary border rounded px-2 py-1"
                  >
                    <Calculator className="w-4 h-4" />
                    Fra kalkulation
                  </button>
                  <button
                    onClick={() => setShowLineItemForm(true)}
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <Plus className="w-4 h-4" />
                    Tilføj linje
                  </button>
                </div>
              </div>

              {lineItems.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>Ingen linjer endnu</p>
                  <button
                    onClick={() => setShowLineItemForm(true)}
                    className="mt-2 text-primary hover:underline"
                  >
                    Tilføj første linje
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 text-sm font-medium text-gray-500">
                          #
                        </th>
                        <th className="text-left py-2 text-sm font-medium text-gray-500">
                          Beskrivelse
                        </th>
                        <th className="text-right py-2 text-sm font-medium text-gray-500">
                          Antal
                        </th>
                        <th className="text-right py-2 text-sm font-medium text-gray-500">
                          Enhedspris
                        </th>
                        <th className="text-right py-2 text-sm font-medium text-gray-500">
                          Rabat
                        </th>
                        <th className="text-right py-2 text-sm font-medium text-gray-500">
                          Total
                        </th>
                        <th className="w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((item) => (
                        <tr key={item.id} className="border-b hover:bg-gray-50">
                          <td className="py-3 text-sm text-gray-500">
                            {item.position}
                          </td>
                          <td className="py-3">{item.description}</td>
                          <td className="py-3 text-right">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="py-3 text-right">
                            {formatCurrency(item.unit_price)}
                          </td>
                          <td className="py-3 text-right">
                            {item.discount_percentage > 0
                              ? `${item.discount_percentage}%`
                              : '-'}
                          </td>
                          <td className="py-3 text-right font-medium">
                            {formatCurrency(item.total)}
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setEditingLineItem(item)}
                                className="p-1 hover:bg-gray-200 rounded"
                              >
                                <Pencil className="w-4 h-4 text-gray-500" />
                              </button>
                              <button
                                onClick={() => handleDeleteLineItem(item.id)}
                                disabled={deletingLineItemId === item.id}
                                className="p-1 hover:bg-red-100 rounded disabled:opacity-50"
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Totals */}
              {lineItems.length > 0 && (
                <div className="mt-4 pt-4 border-t space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Subtotal:</span>
                    <span>{formatCurrency(offer.total_amount)}</span>
                  </div>
                  {offer.discount_percentage > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">
                        Rabat ({offer.discount_percentage}%):
                      </span>
                      <span className="text-red-600">
                        -{formatCurrency(offer.discount_amount)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">
                      Moms ({offer.tax_percentage}%):
                    </span>
                    <span>{formatCurrency(offer.tax_amount)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-semibold pt-2 border-t">
                    <span>Total:</span>
                    <span>{formatCurrency(offer.final_amount)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Terms */}
            {offer.terms_and_conditions && (
              <div className="bg-white rounded-lg border p-6">
                <h2 className="text-lg font-semibold mb-4">Betingelser</h2>
                <p className="text-gray-700 whitespace-pre-wrap">
                  {offer.terms_and_conditions}
                </p>
              </div>
            )}

            {/* Notes */}
            {offer.notes && (
              <div className="bg-white rounded-lg border p-6">
                <h2 className="text-lg font-semibold mb-4">Interne noter</h2>
                <p className="text-gray-700 whitespace-pre-wrap">
                  {offer.notes}
                </p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Customer/Lead info */}
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Modtager</h2>
              {offer.customer ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <Building className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Kunde</p>
                      <Link
                        href={`/dashboard/customers/${offer.customer.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {offer.customer.company_name}
                      </Link>
                      <p className="text-sm text-gray-500 font-mono">
                        {offer.customer.customer_number}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <User className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Kontakt</p>
                      <p className="font-medium">
                        {offer.customer.contact_person}
                      </p>
                      <p className="text-sm text-gray-500">
                        {offer.customer.email}
                      </p>
                    </div>
                  </div>
                </div>
              ) : offer.lead ? (
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Building className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Lead</p>
                    <Link
                      href={`/dashboard/leads/${offer.lead.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {offer.lead.company_name}
                    </Link>
                    <p className="text-sm text-gray-500">
                      {offer.lead.contact_person}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500">Ingen modtager valgt</p>
              )}
            </div>

            {/* Validity */}
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Gyldighed</h2>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <Calendar className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Gyldig til</p>
                  <p className="font-medium">
                    {offer.valid_until
                      ? format(new Date(offer.valid_until), 'd. MMMM yyyy', {
                          locale: da,
                        })
                      : 'Ikke angivet'}
                  </p>
                </div>
              </div>
            </div>

            {/* Timestamps */}
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Tidsstempler</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Oprettet</span>
                  <span>
                    {format(new Date(offer.created_at), 'd. MMM yyyy HH:mm', {
                      locale: da,
                    })}
                  </span>
                </div>
                {offer.sent_at && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Sendt</span>
                    <span>
                      {format(new Date(offer.sent_at), 'd. MMM yyyy HH:mm', {
                        locale: da,
                      })}
                    </span>
                  </div>
                )}
                {offer.viewed_at && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Set</span>
                    <span>
                      {format(new Date(offer.viewed_at), 'd. MMM yyyy HH:mm', {
                        locale: da,
                      })}
                    </span>
                  </div>
                )}
                {offer.accepted_at && (
                  <div className="flex justify-between text-green-600">
                    <span>Accepteret</span>
                    <span>
                      {format(new Date(offer.accepted_at), 'd. MMM yyyy HH:mm', {
                        locale: da,
                      })}
                    </span>
                  </div>
                )}
                {offer.rejected_at && (
                  <div className="flex justify-between text-red-600">
                    <span>Afvist</span>
                    <span>
                      {format(new Date(offer.rejected_at), 'd. MMM yyyy HH:mm', {
                        locale: da,
                      })}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Activity Timeline */}
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Aktivitet</h2>
              {isLoadingActivities ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : (
                <OfferActivityTimeline activities={activities} />
              )}
            </div>
          </div>
        </div>
      </div>

      {showEditForm && (
        <OfferForm
          offer={offer}
          companySettings={companySettings}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => router.refresh()}
        />
      )}

      {showLineItemForm && (
        <LineItemForm
          offerId={offer.id}
          nextPosition={nextPosition}
          companySettings={companySettings}
          onClose={() => setShowLineItemForm(false)}
          onSuccess={() => router.refresh()}
        />
      )}

      {editingLineItem && (
        <LineItemForm
          offerId={offer.id}
          lineItem={editingLineItem}
          nextPosition={nextPosition}
          companySettings={companySettings}
          onClose={() => setEditingLineItem(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      {/* Product Picker Dialog */}
      {showProductPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Vælg produkt</h2>
              <button
                onClick={() => setShowProductPicker(false)}
                className="p-1 hover:bg-gray-100 rounded-full"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {products.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p>Ingen produkter fundet</p>
                </div>
              ) : (
                products.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => handleAddProduct(product.id)}
                    disabled={isAddingProduct}
                    className="w-full p-3 text-left border rounded-lg hover:bg-gray-50 transition-colors flex justify-between items-center disabled:opacity-50"
                  >
                    <div>
                      <div className="font-medium">{product.name}</div>
                      {product.sku && (
                        <div className="text-sm text-gray-500">SKU: {product.sku}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{formatCurrency(product.list_price)}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="flex justify-end p-4 border-t">
              <button
                onClick={() => setShowProductPicker(false)}
                className="px-4 py-2 border rounded-md hover:bg-gray-50"
              >
                Annuller
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Calculation Picker Dialog */}
      {showCalculationPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Importer fra kalkulation</h2>
              <button
                onClick={() => setShowCalculationPicker(false)}
                className="p-1 hover:bg-gray-100 rounded-full"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {calculations.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Calculator className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p>Ingen kalkulationer fundet</p>
                </div>
              ) : (
                calculations.map((calc) => (
                  <button
                    key={calc.id}
                    onClick={() => handleImportCalculation(calc.id)}
                    disabled={isImportingCalculation}
                    className="w-full p-3 text-left border rounded-lg hover:bg-gray-50 transition-colors flex justify-between items-center disabled:opacity-50"
                  >
                    <div>
                      <div className="font-medium">{calc.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{formatCurrency(calc.final_amount)}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="flex justify-end p-4 border-t">
              <button
                onClick={() => setShowCalculationPicker(false)}
                className="px-4 py-2 border rounded-md hover:bg-gray-50"
              >
                Annuller
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// PDF Preview Component
function OfferPdfView({
  offer,
  companySettings,
  onClose,
}: {
  offer: OfferWithRelations
  companySettings: CompanySettings | null
  onClose: () => void
}) {
  const currency = companySettings?.default_currency || 'DKK'
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const lineItems = offer.line_items || []

  // Company info with fallbacks
  const companyName = companySettings?.company_name || 'Virksomhed'
  const companyVat = companySettings?.company_vat_number
  const companyEmail = companySettings?.company_email
  const companyPhone = companySettings?.company_phone
  const companyWebsite = companySettings?.company_website
  const companyAddress = companySettings?.company_address
  const companyPostalCode = companySettings?.company_postal_code
  const companyCity = companySettings?.company_city

  return (
    <>
      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #offer-pdf-content,
          #offer-pdf-content * {
            visibility: visible;
          }
          #offer-pdf-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Close button (hidden on print) */}
      <div className="no-print fixed top-4 right-4 z-50">
        <button
          onClick={onClose}
          className="bg-white px-4 py-2 rounded-md shadow-lg border hover:bg-gray-50"
        >
          Luk forhåndsvisning
        </button>
      </div>

      {/* PDF Content */}
      <div id="offer-pdf-content" className="max-w-4xl mx-auto p-8 bg-white min-h-screen">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">TILBUD</h1>
            <p className="text-gray-600 mt-1">{offer.offer_number}</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold text-gray-900">{companyName}</h2>
            {companyVat && <p className="text-gray-600">CVR: {companyVat}</p>}
            {companyAddress && <p className="text-gray-600">{companyAddress}</p>}
            {(companyPostalCode || companyCity) && (
              <p className="text-gray-600">{companyPostalCode} {companyCity}</p>
            )}
            {companyEmail && <p className="text-gray-600">{companyEmail}</p>}
            {companyPhone && <p className="text-gray-600">{companyPhone}</p>}
          </div>
        </div>

        {/* Customer info */}
        {offer.customer && (
          <div className="mb-8 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold text-gray-700 mb-2">Til:</h3>
            <p className="font-medium">{offer.customer.company_name}</p>
            <p>{offer.customer.contact_person}</p>
            {offer.customer.billing_address && (
              <>
                <p>{offer.customer.billing_address}</p>
                <p>
                  {offer.customer.billing_postal_code} {offer.customer.billing_city}
                </p>
              </>
            )}
            <p>{offer.customer.email}</p>
          </div>
        )}

        {/* Offer details */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">{offer.title}</h2>
          {offer.description && (
            <p className="text-gray-700 whitespace-pre-wrap">{offer.description}</p>
          )}
        </div>

        {/* Dates */}
        <div className="flex gap-8 mb-6 text-sm">
          <div>
            <span className="text-gray-500">Dato: </span>
            <span>{format(new Date(offer.created_at), 'd. MMMM yyyy', { locale: da })}</span>
          </div>
          {offer.valid_until && (
            <div>
              <span className="text-gray-500">Gyldig til: </span>
              <span>{format(new Date(offer.valid_until), 'd. MMMM yyyy', { locale: da })}</span>
            </div>
          )}
        </div>

        {/* Line items table */}
        {lineItems.length > 0 && (
          <table className="w-full mb-6">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="text-left py-2">#</th>
                <th className="text-left py-2">Beskrivelse</th>
                <th className="text-right py-2">Antal</th>
                <th className="text-right py-2">Enhedspris</th>
                <th className="text-right py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item) => (
                <tr key={item.id} className="border-b">
                  <td className="py-2">{item.position}</td>
                  <td className="py-2">{item.description}</td>
                  <td className="py-2 text-right">
                    {item.quantity} {item.unit}
                  </td>
                  <td className="py-2 text-right">{formatCurrency(item.unit_price)}</td>
                  <td className="py-2 text-right">{formatCurrency(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Totals */}
        <div className="flex justify-end mb-8">
          <div className="w-64 space-y-2">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatCurrency(offer.total_amount)}</span>
            </div>
            {offer.discount_percentage > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Rabat ({offer.discount_percentage}%):</span>
                <span>-{formatCurrency(offer.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Moms ({offer.tax_percentage}%):</span>
              <span>{formatCurrency(offer.tax_amount)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t-2">
              <span>Total:</span>
              <span>{formatCurrency(offer.final_amount)}</span>
            </div>
          </div>
        </div>

        {/* Terms */}
        {offer.terms_and_conditions && (
          <div className="mb-8">
            <h3 className="font-semibold text-gray-700 mb-2">Betingelser:</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">
              {offer.terms_and_conditions}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 pt-4 border-t text-center text-sm text-gray-500">
          <p>
            {companyName}
            {companyWebsite && ` • ${companyWebsite}`}
            {companyEmail && ` • ${companyEmail}`}
          </p>
        </div>
      </div>
    </>
  )
}
