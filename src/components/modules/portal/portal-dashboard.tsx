'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  FileText,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  ChevronRight,
  Download,
  FolderOpen,
  Wrench,
  Receipt,
} from 'lucide-react'
import type { PortalSession, PortalOffer, PortalMessageWithRelations, PortalServiceCase, PortalInvoice } from '@/types/portal.types'
import type { PortalDocument } from '@/lib/actions/portal'
import { SERVICE_CASE_STATUS_LABELS, SERVICE_CASE_PRIORITY_LABELS } from '@/types/service-cases.types'
import type { CompanySettings } from '@/types/company-settings.types'
import type { FuldmagtData } from '@/lib/actions/fuldmagt'
import { PortalChat } from './portal-chat'
import { PortalBesigtigelseSection } from './portal-besigtigelse'
import { PortalFuldmagtSection } from './portal-fuldmagt'
import { formatDate as formatDateUtil } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils/format'
import { getSafeDocumentDescription } from '@/lib/documents/display-description'

interface PortalDashboardProps {
  token: string
  session: PortalSession
  offers: PortalOffer[]
  messages: PortalMessageWithRelations[]
  documents?: PortalDocument[]
  serviceCases?: PortalServiceCase[]
  invoices?: PortalInvoice[]
  fuldmagter?: FuldmagtData[]
  companySettings?: CompanySettings | null
}

export function PortalDashboard({
  token,
  session,
  offers,
  messages,
  documents = [],
  serviceCases = [],
  invoices = [],
  fuldmagter = [],
  companySettings,
}: PortalDashboardProps) {
  const [showChat, setShowChat] = useState(false)
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null)

  const handleDownloadInvoice = async (invoiceId: string, invoiceNumber: string) => {
    setDownloadingInvoiceId(invoiceId)
    try {
      const res = await fetch(
        `/api/portal/invoices/pdf?token=${encodeURIComponent(token)}&invoiceId=${invoiceId}`
      )
      if (!res.ok) throw new Error('PDF fejl')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${invoiceNumber || 'faktura'}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      alert('Kunne ikke downloade faktura. Prøv igen.')
    } finally {
      setDownloadingInvoiceId(null)
    }
  }

  const invoiceStatusLabel = (inv: PortalInvoice): string => {
    if (inv.is_credit_note) return 'Kreditnota'
    if (inv.status === 'paid' || inv.payment_status === 'paid') return 'Betalt'
    return 'Afventer betaling'
  }

  const invoiceStatusClass = (inv: PortalInvoice): string => {
    if (inv.is_credit_note) return 'bg-purple-100 text-purple-700'
    if (inv.status === 'paid' || inv.payment_status === 'paid')
      return 'bg-green-100 text-green-700'
    return 'bg-amber-100 text-amber-700'
  }

  const pendingOffers = offers.filter(
    (o) => o.status === 'sent' || o.status === 'viewed'
  )
  const acceptedOffers = offers.filter((o) => o.status === 'accepted')
  const unreadMessages = messages.filter(
    (m) => m.sender_type === 'employee' && !m.read_at
  )

  const currency = companySettings?.default_currency || 'DKK'

  const statCardCount =
    3 + (serviceCases.length > 0 ? 1 : 0) + (invoices.length > 0 ? 1 : 0)
  const statGridClass =
    statCardCount >= 5
      ? 'md:grid-cols-3 lg:grid-cols-5'
      : statCardCount === 4
      ? 'md:grid-cols-2 lg:grid-cols-4'
      : 'md:grid-cols-3'

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return <Clock className="w-4 h-4 text-blue-500" />
      case 'viewed':
        return <Eye className="w-4 h-4 text-yellow-500" />
      case 'accepted':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'rejected':
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return <Clock className="w-4 h-4 text-gray-400" />
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'sent':
        return 'Afventer svar'
      case 'viewed':
        return 'Set'
      case 'accepted':
        return 'Accepteret'
      case 'rejected':
        return 'Afvist'
      default:
        return status
    }
  }

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="bg-white rounded-xl border p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">
          Din kundeportal
        </p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">
          Velkommen, {session.customer.contact_person}
        </h1>
        <p className="text-gray-600 mt-1">
          {session.customer.company_name} ({session.customer.customer_number})
        </p>
        <p className="text-sm text-gray-500 mt-3">
          Her finder du dine tilbud, fakturaer, dokumenter, sager og beskeder samlet ét sted.
        </p>
      </div>

      {/* Stats */}
      <div className={`grid grid-cols-1 gap-4 ${statGridClass}`}>
        <div className="bg-white rounded-xl border p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{pendingOffers.length}</p>
              <p className="text-sm text-gray-600">Afventende tilbud</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{acceptedOffers.length}</p>
              <p className="text-sm text-gray-600">Accepterede tilbud</p>
            </div>
          </div>
        </div>

        <div
          className="bg-white rounded-xl border p-6 shadow-sm cursor-pointer hover:border-primary transition-colors"
          onClick={() => setShowChat(true)}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center relative">
              <MessageSquare className="w-6 h-6 text-purple-600" />
              {unreadMessages.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {unreadMessages.length}
                </span>
              )}
            </div>
            <div>
              <p className="text-2xl font-bold">{messages.length}</p>
              <p className="text-sm text-gray-600">Beskeder</p>
            </div>
          </div>
        </div>

        {serviceCases.length > 0 && (
          <div className="bg-white rounded-xl border p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-violet-100 rounded-lg flex items-center justify-center">
                <Wrench className="w-6 h-6 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{serviceCases.length}</p>
                <p className="text-sm text-gray-600">Serviceopgaver</p>
              </div>
            </div>
          </div>
        )}

        {invoices.length > 0 && (
          <div className="bg-white rounded-xl border p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                <Receipt className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{invoices.length}</p>
                <p className="text-sm text-gray-600">Fakturaer</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Besigtigelse Booking */}
      <PortalBesigtigelseSection
        token={token}
        customerName={session.customer.company_name}
      />

      {/* Fuldmagter */}
      <PortalFuldmagtSection token={token} fuldmagter={fuldmagter} />

      {/* Offers List */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Dine tilbud ({offers.length})</h2>
          {offers.length > 1 && (
            <p className="text-sm text-gray-500 mt-1">
              Du har flere tilbud samlet her. Åbn det enkelte tilbud for at se detaljer, acceptere eller afvise.
            </p>
          )}
        </div>

        {offers.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Du har ingen tilbud endnu</p>
          </div>
        ) : (
          <div className="divide-y">
            {offers.map((offer) => (
              <Link
                key={offer.id}
                href={`/portal/${token}/offers/${offer.id}`}
                className="flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                    {getStatusIcon(offer.status)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {offer.offer_number}
                    </p>
                    <p className="text-sm text-gray-600">{offer.title}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">
                      {formatCurrency(offer.final_amount, currency)}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formatDateUtil(offer.created_at)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        offer.status === 'accepted'
                          ? 'bg-green-100 text-green-700'
                          : offer.status === 'rejected'
                          ? 'bg-red-100 text-red-700'
                          : offer.status === 'viewed'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {getStatusText(offer.status)}
                    </span>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Service Cases */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="p-6 border-b">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold">Sager</h2>
            {serviceCases.length > 0 && (
              <span className="text-sm text-gray-500">({serviceCases.length})</span>
            )}
          </div>
        </div>
        {serviceCases.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">
            Der er endnu ingen aktive sager.
          </div>
        ) : (
          <div className="divide-y">
            {serviceCases.map((sc) => {
              const statusColor =
                sc.status === 'new'
                  ? 'bg-blue-100 text-blue-700'
                  : sc.status === 'in_progress'
                  ? 'bg-yellow-100 text-yellow-700'
                  : sc.status === 'pending'
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-gray-100 text-gray-700'

              return (
                <div
                  key={sc.id}
                  className="p-6"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-gray-500">{sc.case_number}</span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColor}`}>
                          {SERVICE_CASE_STATUS_LABELS[sc.status]}
                        </span>
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                          {SERVICE_CASE_PRIORITY_LABELS[sc.priority]}
                        </span>
                      </div>
                      <p className="font-medium text-gray-900 mt-1">{sc.title}</p>
                      {sc.status_note && (
                        <p className="text-sm text-purple-700 mt-1 italic">{sc.status_note}</p>
                      )}
                      {sc.description && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{sc.description}</p>
                      )}
                    </div>
                    <div className="text-right text-sm text-gray-500">
                      {formatDateUtil(sc.created_at)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Invoices */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="p-6 border-b">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-semibold">Fakturaer</h2>
            {invoices.length > 0 && (
              <span className="text-sm text-gray-500">({invoices.length})</span>
            )}
          </div>
        </div>
        {invoices.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">
            Der er endnu ingen fakturaer.
          </div>
        ) : (
          <div className="divide-y">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between p-6"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
                    <Receipt className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{inv.invoice_number}</p>
                    <p className="text-sm text-gray-500">
                      {formatDateUtil(inv.sent_at || inv.created_at)}
                      {inv.due_date && (
                        <span className="text-gray-400">
                          {' '}· forfald {formatDateUtil(inv.due_date)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">
                      {formatCurrency(inv.final_amount, currency)}
                    </p>
                    <span
                      className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full ${invoiceStatusClass(inv)}`}
                    >
                      {invoiceStatusLabel(inv)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDownloadInvoice(inv.id, inv.invoice_number)}
                    disabled={downloadingInvoiceId === inv.id}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 border rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    {downloadingInvoiceId === inv.id ? 'Henter…' : 'PDF'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Documents */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Dokumenter</h2>
        </div>
        {documents.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">
            Der er endnu ingen dokumenter tilgængelige.
          </div>
        ) : (
          <div className="divide-y">
            {documents.map((doc) => {
              const safeDesc = getSafeDocumentDescription(doc)
              return (
              <a
                key={doc.id}
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <FolderOpen className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{doc.title}</p>
                    {safeDesc && (
                      <p className="text-sm text-gray-500">{safeDesc}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-gray-400">
                    {formatDateUtil(doc.created_at)}
                  </span>
                  <Download className="w-4 h-4 text-gray-400" />
                </div>
              </a>
              )
            })}
          </div>
        )}
      </div>

      {/* Chat Modal */}
      {showChat && (
        <PortalChat
          token={token}
          session={session}
          messages={messages}
          onClose={() => setShowChat(false)}
        />
      )}
    </div>
  )
}
