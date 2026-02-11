'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  FileText,
  Calendar,
  User,
  Mail,
  Phone,
  CheckCircle,
  XCircle,
  MessageSquare,
  Download,
  Clock,
} from 'lucide-react'
import type { PortalSession, PortalOffer, PortalMessageWithRelations } from '@/types/portal.types'
import type { CompanySettings } from '@/types/company-settings.types'
import { SignatureDialog } from './signature-dialog'
import { RejectDialog } from './reject-dialog'
import { PortalChat } from './portal-chat'
import { formatDateLongDK, formatCurrency } from '@/lib/utils/format'

interface OfferDetailProps {
  token: string
  session: PortalSession
  offer: PortalOffer
  messages: PortalMessageWithRelations[]
  companySettings?: CompanySettings | null
}

export function OfferDetail({
  token,
  session,
  offer,
  messages,
  companySettings,
}: OfferDetailProps) {
  const [showSignature, setShowSignature] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [showChat, setShowChat] = useState(false)

  const currency = companySettings?.default_currency || 'DKK'

  const formatDate = (dateStr: string | null) => {
    return formatDateLongDK(dateStr) || '-'
  }

  const isExpired = offer.valid_until && new Date(offer.valid_until) < new Date()
  const canRespond = (offer.status === 'sent' || offer.status === 'viewed') && !isExpired

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Link
        href={`/portal/${token}`}
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="w-4 h-4" />
        Tilbage til oversigt
      </Link>

      {/* Header */}
      <div className="bg-white rounded-xl border p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {offer.offer_number}
              </h1>
              <p className="text-gray-600">{offer.title}</p>
              {offer.description && (
                <p className="text-sm text-gray-500 mt-1">{offer.description}</p>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <span
              className={`px-3 py-1 text-sm font-medium rounded-full ${
                offer.status === 'accepted'
                  ? 'bg-green-100 text-green-700'
                  : offer.status === 'rejected'
                  ? 'bg-red-100 text-red-700'
                  : isExpired
                  ? 'bg-gray-100 text-gray-700'
                  : 'bg-blue-100 text-blue-700'
              }`}
            >
              {offer.status === 'accepted'
                ? 'Accepteret'
                : offer.status === 'rejected'
                ? 'Afvist'
                : isExpired
                ? 'Udløbet'
                : 'Afventer svar'}
            </span>
            {offer.valid_until && (
              <span className="text-sm text-gray-500 flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Gyldig til: {formatDate(offer.valid_until)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Line Items */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="p-6 border-b">
              <h2 className="text-lg font-semibold">Tilbuddets indhold</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 text-sm">
                  <tr>
                    <th className="text-left px-6 py-3 font-medium text-gray-600">
                      Beskrivelse
                    </th>
                    <th className="text-right px-6 py-3 font-medium text-gray-600">
                      Antal
                    </th>
                    <th className="text-right px-6 py-3 font-medium text-gray-600">
                      Enhedspris
                    </th>
                    <th className="text-right px-6 py-3 font-medium text-gray-600">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(offer.line_items || []).map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 text-gray-900">
                        {item.description}
                      </td>
                      <td className="px-6 py-4 text-right text-gray-600">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="px-6 py-4 text-right text-gray-600">
                        {formatCurrency(item.unit_price, currency, 2)}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-gray-900">
                        {formatCurrency(item.total, currency, 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="bg-gray-50 p-6 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="text-gray-900">
                  {formatCurrency(offer.total_amount, currency, 2)}
                </span>
              </div>
              {offer.discount_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    Rabat ({offer.discount_percentage}%)
                  </span>
                  <span className="text-green-600">
                    -{formatCurrency(offer.discount_amount, currency, 2)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">
                  Moms ({offer.tax_percentage}%)
                </span>
                <span className="text-gray-900">
                  {formatCurrency(offer.tax_amount, currency, 2)}
                </span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-2 border-t">
                <span>Total</span>
                <span className="text-primary">
                  {formatCurrency(offer.final_amount, currency, 2)}
                </span>
              </div>
            </div>
          </div>

          {/* Terms */}
          {offer.terms_and_conditions && (
            <div className="bg-white rounded-xl border p-6 shadow-sm">
              <h2 className="text-lg font-semibold mb-4">Betingelser</h2>
              <div className="prose prose-sm max-w-none text-gray-600">
                {offer.terms_and_conditions.split('\n').map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </div>
          )}

          {/* Signature Info */}
          {offer.signature && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <CheckCircle className="w-6 h-6 text-green-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-green-900">
                    Tilbud accepteret
                  </h3>
                  <p className="text-sm text-green-700 mt-1">
                    Underskrevet af {offer.signature.signer_name} (
                    {offer.signature.signer_email}) den{' '}
                    {formatDate(offer.signature.signed_at)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Actions */}
          {canRespond && (
            <div className="bg-white rounded-xl border p-6 shadow-sm space-y-3">
              <h2 className="font-semibold mb-4">Svar på tilbud</h2>
              <button
                onClick={() => setShowSignature(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
              >
                <CheckCircle className="w-5 h-5" />
                Accepter tilbud
              </button>
              <button
                onClick={() => setShowReject(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 font-medium"
              >
                <XCircle className="w-5 h-5" />
                Afvis tilbud
              </button>
            </div>
          )}

          {/* Contact */}
          <div className="bg-white rounded-xl border p-6 shadow-sm">
            <h2 className="font-semibold mb-4">Din kontaktperson</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-gray-400" />
                <span className="text-gray-900">
                  {offer.sales_person.full_name || 'Sælger'}
                </span>
              </div>
              {offer.sales_person.email && (
                <a
                  href={`mailto:${offer.sales_person.email}`}
                  className="flex items-center gap-3 text-primary hover:underline"
                >
                  <Mail className="w-5 h-5" />
                  {offer.sales_person.email}
                </a>
              )}
              {offer.sales_person.phone && (
                <a
                  href={`tel:${offer.sales_person.phone}`}
                  className="flex items-center gap-3 text-primary hover:underline"
                >
                  <Phone className="w-5 h-5" />
                  {offer.sales_person.phone}
                </a>
              )}
            </div>

            <button
              onClick={() => setShowChat(true)}
              className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 font-medium"
            >
              <MessageSquare className="w-5 h-5" />
              Send besked
            </button>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-xl border p-6 shadow-sm">
            <h2 className="font-semibold mb-4">Tidslinje</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                  <FileText className="w-4 h-4 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Tilbud oprettet</p>
                  <p className="text-xs text-gray-500">
                    {formatDate(offer.created_at)}
                  </p>
                </div>
              </div>

              {offer.sent_at && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <Mail className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Tilbud sendt</p>
                    <p className="text-xs text-gray-500">
                      {formatDate(offer.sent_at)}
                    </p>
                  </div>
                </div>
              )}

              {offer.viewed_at && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                    <Clock className="w-4 h-4 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Tilbud set</p>
                    <p className="text-xs text-gray-500">
                      {formatDate(offer.viewed_at)}
                    </p>
                  </div>
                </div>
              )}

              {offer.accepted_at && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Tilbud accepteret</p>
                    <p className="text-xs text-gray-500">
                      {formatDate(offer.accepted_at)}
                    </p>
                  </div>
                </div>
              )}

              {offer.rejected_at && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                    <XCircle className="w-4 h-4 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Tilbud afvist</p>
                    <p className="text-xs text-gray-500">
                      {formatDate(offer.rejected_at)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      {showSignature && (
        <SignatureDialog
          token={token}
          offer={offer}
          session={session}
          companySettings={companySettings}
          onClose={() => setShowSignature(false)}
        />
      )}

      {showReject && (
        <RejectDialog
          token={token}
          offerId={offer.id}
          onClose={() => setShowReject(false)}
        />
      )}

      {showChat && (
        <PortalChat
          token={token}
          session={session}
          messages={messages}
          offerId={offer.id}
          onClose={() => setShowChat(false)}
        />
      )}
    </div>
  )
}
