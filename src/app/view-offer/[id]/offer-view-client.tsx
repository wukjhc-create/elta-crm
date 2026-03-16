'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import { CheckCircle, FileText, Shield, Clock, Loader2, ChevronDown } from 'lucide-react'
import { acceptPublicOffer, type PublicOffer } from '@/lib/actions/public-offer'

interface OfferViewClientProps {
  offer: PublicOffer
}

export function OfferViewClient({ offer }: OfferViewClientProps) {
  const [accepterName, setAccepterName] = useState('')
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(offer.status === 'accepted')
  const [error, setError] = useState<string | null>(null)
  const [showTerms, setShowTerms] = useState(false)

  const handleAccept = async () => {
    if (!accepterName.trim()) {
      setError('Indtast dit navn for at acceptere')
      return
    }
    setAccepting(true)
    setError(null)
    const result = await acceptPublicOffer(offer.id, accepterName)
    setAccepting(false)
    if (result.success) {
      setAccepted(true)
    } else {
      setError(result.error || 'Kunne ikke acceptere tilbuddet')
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('da-DK', { style: 'currency', currency: offer.currency || 'DKK' }).format(amount)
  }

  const isExpired = offer.valid_until && new Date(offer.valid_until) < new Date()

  // Group line items by section
  const sections: { name: string | null; items: PublicOffer['line_items'] }[] = []
  let currentSection: string | null = null
  for (const item of offer.line_items || []) {
    if (item.section !== currentSection) {
      currentSection = item.section
      sections.push({ name: currentSection, items: [] })
    }
    sections[sections.length - 1]?.items.push(item)
  }
  if (sections.length === 0) {
    sections.push({ name: null, items: offer.line_items || [] })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Hero Header */}
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-white" />
          <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full bg-white" />
        </div>
        <div className="relative max-w-4xl mx-auto px-6 py-12 md:py-16">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <span className="text-blue-200 text-sm font-medium tracking-wider uppercase">
                  Tilbud {offer.offer_number}
                </span>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
                {offer.title}
              </h1>
              {offer.description && (
                <p className="text-blue-100 text-lg max-w-2xl">{offer.description}</p>
              )}
              {offer.customer && (
                <p className="text-blue-200 mt-3">
                  Til: {offer.customer.company_name} — {offer.customer.contact_person}
                </p>
              )}
            </div>
            <div className="hidden md:block text-right">
              <div className="text-3xl font-bold text-white">
                {formatCurrency(offer.final_amount)}
              </div>
              <div className="text-blue-200 text-sm mt-1">inkl. moms</div>
            </div>
          </div>

          {/* Status Bar */}
          <div className="mt-8 flex flex-wrap items-center gap-4">
            {accepted ? (
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/20 border border-green-400/30 rounded-full text-green-100">
                <CheckCircle className="w-4 h-4" />
                Accepteret
              </div>
            ) : isExpired ? (
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/20 border border-red-400/30 rounded-full text-red-100">
                <Clock className="w-4 h-4" />
                Udløbet
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/20 rounded-full text-white">
                <Clock className="w-4 h-4" />
                {offer.valid_until
                  ? `Gyldig til ${format(new Date(offer.valid_until), 'd. MMMM yyyy', { locale: da })}`
                  : 'Intet udløb'}
              </div>
            )}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/20 rounded-full text-white text-sm">
              <Shield className="w-4 h-4" />
              Krypteret forbindelse
            </div>
          </div>
        </div>
      </div>

      {/* Mobile price card */}
      <div className="md:hidden max-w-4xl mx-auto px-6 -mt-6">
        <div className="bg-white rounded-2xl shadow-lg border p-6 text-center">
          <div className="text-3xl font-bold text-gray-900">{formatCurrency(offer.final_amount)}</div>
          <div className="text-gray-500 text-sm mt-1">inkl. moms</div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        {/* Line Items */}
        {sections.map((section, sIdx) => (
          <div key={sIdx} className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            {section.name && (
              <div className="px-6 py-4 bg-gray-50 border-b">
                <h3 className="font-semibold text-gray-900">{section.name}</h3>
              </div>
            )}
            {!section.name && (
              <div className="px-6 py-4 border-b">
                <h3 className="font-semibold text-gray-900">Specifikation</h3>
              </div>
            )}
            <div className="divide-y">
              {section.items.map((item) => (
                <div key={item.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{item.description}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {item.quantity} {item.unit} × {formatCurrency(item.unit_price)}
                      {item.discount_percentage > 0 && (
                        <span className="ml-2 text-green-600">(-{item.discount_percentage}%)</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="font-semibold text-gray-900">{formatCurrency(item.total)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Totals Card */}
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h3 className="font-semibold text-gray-900">Opsummering</h3>
          </div>
          <div className="px-6 py-4 space-y-3">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{formatCurrency(offer.total_amount)}</span>
            </div>
            {offer.discount_amount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Rabat ({offer.discount_percentage}%)</span>
                <span>-{formatCurrency(offer.discount_amount)}</span>
              </div>
            )}
            {offer.tax_amount > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Moms ({offer.tax_percentage}%)</span>
                <span>{formatCurrency(offer.tax_amount)}</span>
              </div>
            )}
            <div className="border-t pt-3 flex justify-between">
              <span className="text-xl font-bold text-gray-900">I alt</span>
              <span className="text-xl font-bold text-gray-900">{formatCurrency(offer.final_amount)}</span>
            </div>
          </div>
        </div>

        {/* Terms */}
        {offer.terms_and_conditions && (
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            <button
              onClick={() => setShowTerms(!showTerms)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <h3 className="font-semibold text-gray-900">Betingelser</h3>
              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${showTerms ? 'rotate-180' : ''}`} />
            </button>
            {showTerms && (
              <div className="px-6 pb-4">
                <p className="text-gray-600 whitespace-pre-wrap text-sm">{offer.terms_and_conditions}</p>
              </div>
            )}
          </div>
        )}

        {/* Accept Section */}
        {!accepted && !isExpired && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl border-2 border-green-200 p-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Acceptér tilbuddet</h2>
              <p className="text-gray-600">
                Indtast dit fulde navn herunder og klik acceptér for at godkende tilbuddet.
              </p>
            </div>
            <div className="max-w-md mx-auto space-y-4">
              <input
                type="text"
                value={accepterName}
                onChange={(e) => setAccepterName(e.target.value)}
                placeholder="Dit fulde navn"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-center text-lg focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-colors"
              />
              {error && (
                <p className="text-red-500 text-sm text-center">{error}</p>
              )}
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-lg font-semibold rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all shadow-lg shadow-green-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {accepting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Behandler...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Acceptér tilbud — {formatCurrency(offer.final_amount)}
                  </>
                )}
              </button>
              <p className="text-xs text-gray-500 text-center">
                Ved at klikke acceptér bekræfter du, at du har læst og accepterer tilbuddet og dets betingelser.
              </p>
            </div>
          </div>
        )}

        {/* Already accepted */}
        {accepted && (
          <div className="bg-green-50 rounded-2xl border-2 border-green-200 p-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-green-900 mb-2">Tilbuddet er accepteret!</h2>
            <p className="text-green-700">
              Tak for din bekræftelse. Vi kontakter dig snarest med næste skridt.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-8 text-sm text-gray-400">
          <p>Elta Solar ApS — Professionelle el- og solcelleinstallationer</p>
          <p className="mt-1">Dette tilbud er fortroligt og kun beregnet til modtageren.</p>
        </div>
      </div>
    </div>
  )
}
