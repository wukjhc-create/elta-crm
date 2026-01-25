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
} from 'lucide-react'
import type { PortalSession, PortalOffer, PortalMessageWithRelations } from '@/types/portal.types'
import { PortalChat } from './portal-chat'

interface PortalDashboardProps {
  token: string
  session: PortalSession
  offers: PortalOffer[]
  messages: PortalMessageWithRelations[]
}

export function PortalDashboard({
  token,
  session,
  offers,
  messages,
}: PortalDashboardProps) {
  const [showChat, setShowChat] = useState(false)

  const pendingOffers = offers.filter(
    (o) => o.status === 'sent' || o.status === 'viewed'
  )
  const acceptedOffers = offers.filter((o) => o.status === 'accepted')
  const unreadMessages = messages.filter(
    (m) => m.sender_type === 'employee' && !m.read_at
  )

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('da-DK', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

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
        <h1 className="text-2xl font-bold text-gray-900">
          Velkommen, {session.customer.contact_person}
        </h1>
        <p className="text-gray-600 mt-1">
          {session.customer.company_name} ({session.customer.customer_number})
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
      </div>

      {/* Offers List */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Dine tilbud</h2>
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
                      {formatCurrency(offer.final_amount)}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formatDate(offer.created_at)}
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
