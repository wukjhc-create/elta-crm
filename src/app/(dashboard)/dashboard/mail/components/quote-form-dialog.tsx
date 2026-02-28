'use client'

import { useState, useEffect } from 'react'
import { X, ChevronRight, ChevronLeft, Send, Download, CheckCircle2, Loader2, Share2 } from 'lucide-react'
import type {
  QuoteTemplateType,
  GenerateQuoteInput,
  QuoteCustomerData,
  QuoteLineItem,
  SalesOfferData,
} from '@/types/quote-templates.types'
import type { IncomingEmailWithCustomer } from '@/types/mail-bridge.types'
import { sendQuoteAction, getCustomerForQuote, shareQuoteToPortal, getCurrentUserName, getCustomerQuoteHistory } from '@/lib/actions/quote-actions'
import { formatCurrency } from '@/lib/utils/format'
import { QuoteLineItemsEditor } from './quote-line-items-editor'

interface QuoteFormDialogProps {
  templateType: QuoteTemplateType
  selectedEmail: IncomingEmailWithCustomer | null
  onClose: () => void
}

const STEPS = [
  'Kundeinformation',
  'Tilbudslinjer',
  'Detaljer',
  'Opsummering & Send',
]

export function QuoteFormDialog({ templateType, selectedEmail, onClose }: QuoteFormDialogProps) {
  const [step, setStep] = useState(0)
  const [isSending, setIsSending] = useState(false)
  const [result, setResult] = useState<{ quoteReference: string; pdfUrl: string; sentQuoteId?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [sharedToPortal, setSharedToPortal] = useState(false)

  // Form state
  const [customer, setCustomer] = useState<QuoteCustomerData>({
    companyName: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    postalCode: '',
  })

  const [lineItems, setLineItems] = useState<QuoteLineItem[]>([
    { id: crypto.randomUUID(), description: '', quantity: 1, unit: 'stk', unitPrice: 0 },
  ])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [validityDays, setValidityDays] = useState(30)
  const [taxPercentage, setTaxPercentage] = useState(25)
  const [discountPercentage, setDiscountPercentage] = useState(0)
  const [senderName, setSenderName] = useState('')

  // Solar data (only for sales)
  const [solarData, setSolarData] = useState<SalesOfferData>({
    systemSizeKwp: 0,
    estimatedAnnualProductionKwh: 0,
    panelType: '',
    inverterType: '',
    batteryType: '',
    roofType: '',
    estimatedSavingsPerYear: undefined,
  })

  // Auto-fill sender name from logged-in user profile (once on mount)
  useEffect(() => {
    getCurrentUserName().then((res) => {
      if (res.success && res.data) {
        setSenderName(res.data)
      }
    })
  }, [])

  // Pre-fill from selected email + customer history
  useEffect(() => {
    if (!selectedEmail) return

    // If linked to a customer, fetch customer data + history
    if (selectedEmail.customer_id) {
      getCustomerForQuote(selectedEmail.customer_id).then((res) => {
        if (res.success && res.data) {
          setCustomer(res.data)
        }
      })

      // Fetch previous offer data for auto-fill
      getCustomerQuoteHistory(selectedEmail.customer_id).then((res) => {
        if (res.success && res.data && res.data.totalOffers > 0) {
          // Auto-fill title and description from last offer
          if (res.data.lastOfferTitle && !title) {
            setTitle(res.data.lastOfferTitle)
          }
          if (res.data.lastOfferDescription && !description) {
            setDescription(res.data.lastOfferDescription)
          }
          if (res.data.lastOfferNotes && !notes) {
            setNotes(res.data.lastOfferNotes)
          }
          // Auto-fill line items from last offer
          if (res.data.lastLineItems && res.data.lastLineItems.length > 0) {
            setLineItems(res.data.lastLineItems)
          }
        }
      })
    } else {
      // Pre-fill email from sender
      const senderEmail = selectedEmail.original_sender_email || selectedEmail.sender_email
      const senderDisplayName = selectedEmail.original_sender_name || selectedEmail.sender_name || ''
      setCustomer((prev) => ({
        ...prev,
        email: senderEmail,
        contactPerson: senderDisplayName,
      }))
    }
  }, [selectedEmail]) // eslint-disable-line react-hooks/exhaustive-deps

  // Financials
  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const discountAmount = subtotal * (discountPercentage / 100)
  const afterDiscount = subtotal - discountAmount
  const taxAmount = afterDiscount * (taxPercentage / 100)
  const total = afterDiscount + taxAmount

  const handleSend = async () => {
    setIsSending(true)
    setError(null)

    const input: GenerateQuoteInput = {
      templateType,
      customer,
      customerId: selectedEmail?.customer_id || undefined,
      title,
      description: description || undefined,
      lineItems,
      notes: notes || undefined,
      validityDays,
      taxPercentage,
      discountPercentage,
      senderName,
      solarData: templateType === 'sales' ? solarData : undefined,
    }

    const res = await sendQuoteAction(input, selectedEmail?.id)

    if (res.success && res.data) {
      setResult({ quoteReference: res.data.quoteReference, pdfUrl: res.data.pdfUrl, sentQuoteId: res.data.sentQuoteId })
    } else {
      setError(res.error || 'Ukendt fejl')
    }

    setIsSending(false)
  }

  const canProceed = () => {
    switch (step) {
      case 0: return customer.email && customer.contactPerson && customer.companyName
      case 1: return lineItems.length > 0 && lineItems.some((li) => li.description && li.unitPrice > 0)
      case 2: return title && senderName
      case 3: return true
      default: return false
    }
  }

  const templateLabel = templateType === 'sales' ? 'Salgstilbud' : 'Monteringstilbud'
  const accentColor = templateType === 'sales' ? 'blue' : 'green'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b bg-${accentColor}-50`}>
          <div>
            <h2 className="text-lg font-semibold">
              {result ? 'Tilbud sendt!' : `Nyt ${templateLabel}`}
            </h2>
            {!result && (
              <div className="flex items-center gap-1 mt-1">
                {STEPS.map((s, i) => (
                  <div key={s} className="flex items-center">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        i === step
                          ? `bg-${accentColor}-600 text-white`
                          : i < step
                            ? `bg-${accentColor}-100 text-${accentColor}-700`
                            : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {i + 1}. {s}
                    </span>
                    {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-gray-300 mx-0.5" />}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {result ? (
            /* Success screen */
            <div className="text-center py-8">
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Tilbud sendt!</h3>
              <p className="text-gray-600 mb-1">
                Tilbudsnummer: <strong>{result.quoteReference}</strong>
              </p>
              <p className="text-gray-500 text-sm mb-6">
                PDF er sendt til {customer.email}
              </p>
              <div className="flex justify-center gap-3 flex-wrap">
                <a
                  href={result.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-gray-50 text-sm"
                >
                  <Download className="w-4 h-4" /> Download PDF
                </a>
                {result.sentQuoteId && !sharedToPortal && (
                  <button
                    onClick={async () => {
                      setIsSharing(true)
                      const res = await shareQuoteToPortal(result.sentQuoteId!)
                      if (res.success) {
                        setSharedToPortal(true)
                      } else {
                        setError(res.error || 'Kunne ikke dele til portal')
                      }
                      setIsSharing(false)
                    }}
                    disabled={isSharing}
                    className="inline-flex items-center gap-2 px-4 py-2 border border-purple-300 text-purple-700 rounded-md hover:bg-purple-50 text-sm disabled:opacity-50"
                  >
                    {isSharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                    Del til portal
                  </button>
                )}
                {sharedToPortal && (
                  <span className="inline-flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-700 rounded-md text-sm">
                    <CheckCircle2 className="w-4 h-4" /> Delt til kundeportal
                  </span>
                )}
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 text-sm"
                >
                  Luk
                </button>
              </div>
              {error && (
                <p className="text-red-600 text-sm mt-3">{error}</p>
              )}
            </div>
          ) : (
            <>
              {/* Step 1: Customer */}
              {step === 0 && (
                <div className="space-y-4">
                  <h3 className="font-medium mb-3">Kundeinformation</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Firmanavn *</label>
                      <input
                        type="text"
                        value={customer.companyName}
                        onChange={(e) => setCustomer({ ...customer, companyName: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        placeholder="Firmanavn"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Kontaktperson *</label>
                      <input
                        type="text"
                        value={customer.contactPerson}
                        onChange={(e) => setCustomer({ ...customer, contactPerson: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        placeholder="Kontaktperson"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
                      <input
                        type="email"
                        value={customer.email}
                        onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        placeholder="email@firma.dk"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Telefon</label>
                      <input
                        type="tel"
                        value={customer.phone || ''}
                        onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        placeholder="12 34 56 78"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Adresse</label>
                      <input
                        type="text"
                        value={customer.address || ''}
                        onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        placeholder="Vejnavn 123"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Postnummer</label>
                      <input
                        type="text"
                        value={customer.postalCode || ''}
                        onChange={(e) => setCustomer({ ...customer, postalCode: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        placeholder="1234"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">By</label>
                      <input
                        type="text"
                        value={customer.city || ''}
                        onChange={(e) => setCustomer({ ...customer, city: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        placeholder="København"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Line items */}
              {step === 1 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium">Tilbudslinjer</h3>
                    {selectedEmail?.customer_id && lineItems.some((li) => li.unitPrice > 0) && (
                      <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                        Auto-udfyldt fra kundehistorik
                      </span>
                    )}
                  </div>
                  <QuoteLineItemsEditor items={lineItems} onChange={setLineItems} />
                </div>
              )}

              {/* Step 3: Details */}
              {step === 2 && (
                <div className="space-y-4">
                  <h3 className="font-medium mb-3">Tilbudsdetaljer</h3>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Tilbudstitel *</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      placeholder={templateType === 'sales' ? 'Solcelleanlæg 10 kWp' : 'Montage af solcelleanlæg'}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Beskrivelse</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      placeholder="Omfangsbeskrivelse..."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Bemærkninger</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      placeholder="Eventuelle bemærkninger..."
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Gyldighedsdage</label>
                      <input
                        type="number"
                        value={validityDays}
                        onChange={(e) => setValidityDays(parseInt(e.target.value) || 30)}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        min={1}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Moms %</label>
                      <input
                        type="number"
                        value={taxPercentage}
                        onChange={(e) => setTaxPercentage(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        min={0}
                        step={0.5}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Rabat %</label>
                      <input
                        type="number"
                        value={discountPercentage}
                        onChange={(e) => setDiscountPercentage(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        min={0}
                        step={0.5}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Afsender {senderName ? '(auto-udfyldt)' : '*'}
                    </label>
                    <input
                      type="text"
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      placeholder="Indlæser dit navn..."
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Email sendes som &quot;{senderName || 'Dit navn'} | Elta Solar&quot;
                    </p>
                  </div>

                  {/* Solar data — only for sales */}
                  {templateType === 'sales' && (
                    <div className="border-t pt-4 mt-4">
                      <h4 className="text-sm font-medium text-blue-700 mb-3">Solcelledata</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Systemstørrelse (kWp) *</label>
                          <input
                            type="number"
                            value={solarData.systemSizeKwp || ''}
                            onChange={(e) => setSolarData({ ...solarData, systemSizeKwp: parseFloat(e.target.value) || 0 })}
                            className="w-full px-3 py-2 border rounded-md text-sm"
                            step={0.1}
                            min={0}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Årsproduktion (kWh) *</label>
                          <input
                            type="number"
                            value={solarData.estimatedAnnualProductionKwh || ''}
                            onChange={(e) => setSolarData({ ...solarData, estimatedAnnualProductionKwh: parseFloat(e.target.value) || 0 })}
                            className="w-full px-3 py-2 border rounded-md text-sm"
                            step={100}
                            min={0}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Paneltype</label>
                          <input
                            type="text"
                            value={solarData.panelType || ''}
                            onChange={(e) => setSolarData({ ...solarData, panelType: e.target.value })}
                            className="w-full px-3 py-2 border rounded-md text-sm"
                            placeholder="F.eks. JA Solar 450W"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Inverter</label>
                          <input
                            type="text"
                            value={solarData.inverterType || ''}
                            onChange={(e) => setSolarData({ ...solarData, inverterType: e.target.value })}
                            className="w-full px-3 py-2 border rounded-md text-sm"
                            placeholder="F.eks. Huawei SUN2000"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Batteri</label>
                          <input
                            type="text"
                            value={solarData.batteryType || ''}
                            onChange={(e) => setSolarData({ ...solarData, batteryType: e.target.value })}
                            className="w-full px-3 py-2 border rounded-md text-sm"
                            placeholder="F.eks. Huawei LUNA2000"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Tagtype</label>
                          <input
                            type="text"
                            value={solarData.roofType || ''}
                            onChange={(e) => setSolarData({ ...solarData, roofType: e.target.value })}
                            className="w-full px-3 py-2 border rounded-md text-sm"
                            placeholder="F.eks. Tegltag, Trapeztag"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Estimeret årlig besparelse (DKK)</label>
                          <input
                            type="number"
                            value={solarData.estimatedSavingsPerYear || ''}
                            onChange={(e) => setSolarData({ ...solarData, estimatedSavingsPerYear: parseFloat(e.target.value) || undefined })}
                            className="w-full px-3 py-2 border rounded-md text-sm"
                            step={100}
                            min={0}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 4: Summary */}
              {step === 3 && (
                <div className="space-y-4">
                  <h3 className="font-medium mb-3">Opsummering</h3>

                  {/* Template badge */}
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      templateType === 'sales'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {templateLabel}
                    </span>
                  </div>

                  {/* Customer */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-xs font-medium text-gray-500 mb-2">KUNDE</h4>
                    <p className="font-medium">{customer.companyName}</p>
                    <p className="text-sm text-gray-600">{customer.contactPerson}</p>
                    <p className="text-sm text-gray-600">{customer.email}</p>
                    {customer.phone && <p className="text-sm text-gray-600">Tlf: {customer.phone}</p>}
                  </div>

                  {/* Solar data */}
                  {templateType === 'sales' && solarData.systemSizeKwp > 0 && (
                    <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-500">
                      <h4 className="text-xs font-medium text-blue-700 mb-2">SOLCELLEANLÆG</h4>
                      <div className="grid grid-cols-2 gap-1 text-sm">
                        <span className="text-gray-600">System:</span>
                        <span className="font-medium">{solarData.systemSizeKwp} kWp</span>
                        <span className="text-gray-600">Årsproduktion:</span>
                        <span className="font-medium">{solarData.estimatedAnnualProductionKwh.toLocaleString('da-DK')} kWh</span>
                        {solarData.panelType && (<><span className="text-gray-600">Panel:</span><span>{solarData.panelType}</span></>)}
                        {solarData.inverterType && (<><span className="text-gray-600">Inverter:</span><span>{solarData.inverterType}</span></>)}
                      </div>
                    </div>
                  )}

                  {/* Title */}
                  <div>
                    <h4 className="text-xs font-medium text-gray-500">TITEL</h4>
                    <p className="font-medium">{title}</p>
                    {description && <p className="text-sm text-gray-600 mt-1">{description}</p>}
                  </div>

                  {/* Line items summary */}
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 mb-2">LINJER ({lineItems.length})</h4>
                    <div className="border rounded-md divide-y text-sm">
                      {lineItems.filter((li) => li.description).map((li) => (
                        <div key={li.id} className="flex justify-between px-3 py-2">
                          <span className="text-gray-700">{li.description}</span>
                          <span className="font-medium">{formatCurrency(li.quantity * li.unitPrice, 'DKK', 2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500">Subtotal:</span>
                      <span>{formatCurrency(subtotal, 'DKK', 2)}</span>
                    </div>
                    {discountPercentage > 0 && (
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-500">Rabat ({discountPercentage}%):</span>
                        <span className="text-red-600">-{formatCurrency(discountAmount, 'DKK', 2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500">Moms ({taxPercentage}%):</span>
                      <span>{formatCurrency(taxAmount, 'DKK', 2)}</span>
                    </div>
                    <div className={`flex justify-between font-bold text-lg mt-2 pt-2 border-t-2 border-${accentColor}-500`}>
                      <span>TOTAL:</span>
                      <span className={`text-${accentColor}-600`}>{formatCurrency(total, 'DKK', 2)}</span>
                    </div>
                  </div>

                  {/* Sender */}
                  <p className="text-xs text-gray-400">
                    Sendes af: {senderName} | Elta Solar
                  </p>

                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 rounded-md p-3 text-sm">
                      {error}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="border-t px-6 py-4 flex justify-between">
            <button
              onClick={() => step === 0 ? onClose() : setStep(step - 1)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm border rounded-md hover:bg-gray-50"
            >
              <ChevronLeft className="w-4 h-4" />
              {step === 0 ? 'Annuller' : 'Tilbage'}
            </button>

            {step < 3 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canProceed()}
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md text-white disabled:opacity-40 ${
                  templateType === 'sales'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                Næste
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={isSending}
                className="inline-flex items-center gap-2 px-6 py-2 text-sm rounded-md text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 font-medium shadow-sm"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Genererer...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Generér PDF & Send
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
