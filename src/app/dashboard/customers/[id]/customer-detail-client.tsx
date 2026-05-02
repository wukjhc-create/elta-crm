'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import { Breadcrumb } from '@/components/shared/breadcrumb'
import { CopyButton } from '@/components/shared/copy-button'
import { useConfirm } from '@/components/shared/confirm-dialog'
import {
  Pencil,
  Trash2,
  Mail,
  Phone,
  Globe,
  Building,
  MapPin,
  User,
  Plus,
  Star,
  CheckCircle,
  XCircle,
  MessageSquare,
  CalendarCheck,
  Navigation,
  ClipboardCheck,
  FileSignature,
  FolderOpen,
  GitBranch,
} from 'lucide-react'
import { BookBesigtigelseModal } from '@/components/modules/customers/book-besigtigelse-modal'
import { CustomerForm } from '@/components/modules/customers/customer-form'
import { ContactForm } from '@/components/modules/customers/contact-form'
import { PortalAccess } from '@/components/modules/customers/portal-access'
import { CustomerPricing } from '@/components/modules/customers/customer-pricing'
import { EmployeeChat } from '@/components/modules/customers/employee-chat'
import { CustomerTasks } from '@/components/modules/customers/customer-tasks'
import { CustomerActivityOverview } from '@/components/modules/customers/customer-activity-overview'
import { CustomerEmailTimeline } from '@/components/modules/customers/customer-email-timeline'
import { BesigtigelsesNotat } from '@/components/modules/customers/besigtigelse-notat'
import { CustomerDocumentsTab } from '@/components/modules/customers/customer-documents-tab'
import { CustomerStatusFlow } from '@/components/modules/customers/customer-status-flow'
import {
  deleteCustomer,
  toggleCustomerActive,
  deleteCustomerContact,
} from '@/lib/actions/customers'
import { createFuldmagt } from '@/lib/actions/fuldmagt'
import type { CustomerWithRelations, CustomerContact } from '@/types/customers.types'
import type { PortalAccessToken } from '@/types/portal.types'
import { useToast } from '@/components/ui/toast'

interface CustomerDetailClientProps {
  customer: CustomerWithRelations
  portalTokens: PortalAccessToken[]
}

export function CustomerDetailClient({ customer, portalTokens }: CustomerDetailClientProps) {
  const router = useRouter()
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [showEditForm, setShowEditForm] = useState(false)
  const [showContactForm, setShowContactForm] = useState(false)
  const [editingContact, setEditingContact] = useState<CustomerContact | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null)
  const [showChat, setShowChat] = useState(false)
  const [showBesigtigelse, setShowBesigtigelse] = useState(false)
  const [activeTab, setActiveTab] = useState<'oversigt' | 'besigtigelse' | 'dokumenter' | 'status'>('oversigt')
  const [showFuldmagtModal, setShowFuldmagtModal] = useState(false)
  const [fuldmagtOrderNr, setFuldmagtOrderNr] = useState('')
  const [isSendingFuldmagt, setIsSendingFuldmagt] = useState(false)

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Slet kunde',
      description: `Er du sikker på, at du vil slette "${customer.company_name}"? Dette kan ikke fortrydes.`,
      confirmLabel: 'Slet',
    })
    if (!ok) return

    setIsDeleting(true)
    const result = await deleteCustomer(customer.id)

    if (result.success) {
      toast.success('Kunde slettet')
      router.push('/dashboard/customers')
    } else {
      toast.error('Kunne ikke slette kunde', result.error)
      setIsDeleting(false)
    }
  }

  const handleToggleActive = async () => {
    const result = await toggleCustomerActive(customer.id, !customer.is_active)

    if (result.success) {
      toast.success(customer.is_active ? 'Kunde deaktiveret' : 'Kunde aktiveret')
    } else {
      toast.error('Kunne ikke opdatere status', result.error)
    }

    router.refresh()
  }

  const handleDeleteContact = async (contactId: string) => {
    const ok = await confirm({
      title: 'Slet kontakt',
      description: 'Er du sikker på, at du vil slette denne kontakt?',
      confirmLabel: 'Slet',
    })
    if (!ok) return

    setDeletingContactId(contactId)
    const result = await deleteCustomerContact(contactId, customer.id)

    if (result.success) {
      toast.success('Kontakt slettet')
    } else {
      toast.error('Kunne ikke slette kontakt', result.error)
    }

    setDeletingContactId(null)
    router.refresh()
  }

  const formatAddress = (
    address: string | null,
    postalCode: string | null,
    city: string | null,
    country: string | null
  ) => {
    const parts = [address, [postalCode, city].filter(Boolean).join(' '), country]
      .filter(Boolean)
    return parts.length > 0 ? parts : null
  }

  const getGoogleMapsUrl = (address: string | null, postalCode: string | null, city: string | null) => {
    const parts = [address, postalCode, city].filter(Boolean).join(', ')
    return parts ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(parts)}` : null
  }

  const billingAddress = formatAddress(
    customer.billing_address,
    customer.billing_postal_code,
    customer.billing_city,
    customer.billing_country
  )

  const shippingAddress = formatAddress(
    customer.shipping_address,
    customer.shipping_postal_code,
    customer.shipping_city,
    customer.shipping_country
  )

  const contacts = customer.contacts || []

  return (
    <>
      <div className="space-y-6">
        <Breadcrumb items={[
          { label: 'Kunder', href: '/dashboard/customers' },
          { label: customer.company_name },
        ]} />

        {/* Header */}
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                {customer.company_name}
              </h1>
              {customer.is_active ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  <CheckCircle className="w-3 h-3" />
                  Aktiv
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                  <XCircle className="w-3 h-3" />
                  Inaktiv
                </span>
              )}
            </div>
            <p className="text-gray-600 mt-1 inline-flex items-center gap-1 text-sm">
              Kundenr. {customer.customer_number}
              <CopyButton value={customer.customer_number} label="kundenummer" />
              {customer.vat_number && ` • CVR: ${customer.vat_number}`}
            </p>
          </div>
          {/* Action buttons — scrollable on mobile */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            <button
              onClick={() => setShowFuldmagtModal(true)}
              className="shrink-0 inline-flex items-center gap-2 px-4 min-h-[44px] bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium active:scale-95 transition-transform touch-manipulation"
            >
              <FileSignature className="w-4 h-4" />
              Fuldmagt
            </button>
            <button
              onClick={() => setShowBesigtigelse(true)}
              className="shrink-0 inline-flex items-center gap-2 px-4 min-h-[44px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium active:scale-95 transition-transform touch-manipulation"
            >
              <CalendarCheck className="w-4 h-4" />
              Besigtigelse
            </button>
            <button
              onClick={handleToggleActive}
              className="shrink-0 inline-flex items-center gap-2 px-4 min-h-[44px] border rounded-lg hover:bg-gray-50 text-sm active:scale-95 transition-transform touch-manipulation"
            >
              {customer.is_active ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
              <span className="hidden sm:inline">{customer.is_active ? 'Deaktiver' : 'Aktiver'}</span>
            </button>
            <button
              onClick={() => setShowEditForm(true)}
              className="shrink-0 inline-flex items-center gap-2 px-4 min-h-[44px] border rounded-lg hover:bg-gray-50 text-sm active:scale-95 transition-transform touch-manipulation"
            >
              <Pencil className="w-4 h-4" />
              <span className="hidden sm:inline">Rediger</span>
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="shrink-0 inline-flex items-center gap-2 px-4 min-h-[44px] border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 text-sm active:scale-95 transition-transform touch-manipulation"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">{isDeleting ? 'Sletter...' : 'Slet'}</span>
            </button>
          </div>
        </div>

        {/* Tabs — scrollable on mobile */}
        <div className="flex items-center gap-1 border-b overflow-x-auto -mx-1 px-1">
          <button
            onClick={() => setActiveTab('oversigt')}
            className={`shrink-0 px-4 py-3 sm:py-2.5 text-sm font-medium border-b-2 transition-colors touch-manipulation ${
              activeTab === 'oversigt'
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Oversigt
          </button>
          <button
            onClick={() => setActiveTab('besigtigelse')}
            className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-3 sm:py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap touch-manipulation ${
              activeTab === 'besigtigelse'
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            Besigtigelse
          </button>
          <button
            onClick={() => setActiveTab('dokumenter')}
            className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-3 sm:py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap touch-manipulation ${
              activeTab === 'dokumenter'
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            Dokumenter
          </button>
          <button
            onClick={() => setActiveTab('status')}
            className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-3 sm:py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap touch-manipulation ${
              activeTab === 'status'
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <GitBranch className="w-4 h-4" />
            Status
          </button>
        </div>

        {/* Tab: Besigtigelse */}
        {activeTab === 'besigtigelse' && (
          <BesigtigelsesNotat customer={customer} />
        )}

        {/* Tab: Dokumenter & Billeder */}
        {activeTab === 'dokumenter' && (
          <CustomerDocumentsTab customerId={customer.id} />
        )}

        {/* Tab: Status & Flow */}
        {activeTab === 'status' && (
          <CustomerStatusFlow
            customerId={customer.id}
            customerEmail={customer.email}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {/* Tab: Oversigt */}
        {activeTab === 'oversigt' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contact info */}
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Kontaktoplysninger</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Building className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Firma</p>
                    <p className="font-medium">{customer.company_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <User className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Kontaktperson</p>
                    <p className="font-medium">{customer.contact_person}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Mail className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">E-mail</p>
                    <a
                      href={`mailto:${customer.email}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {customer.email}
                    </a>
                  </div>
                </div>
                {customer.phone && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <Phone className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Telefon</p>
                      <a
                        href={`tel:${customer.phone}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {customer.phone}
                      </a>
                    </div>
                  </div>
                )}
                {customer.mobile && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <Phone className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Mobil</p>
                      <a
                        href={`tel:${customer.mobile}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {customer.mobile}
                      </a>
                    </div>
                  </div>
                )}
                {customer.website && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <Globe className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Hjemmeside</p>
                      <a
                        href={customer.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary hover:underline"
                      >
                        {customer.website}
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Addresses */}
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Adresser</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="w-4 h-4 text-gray-500" />
                    <h3 className="font-medium text-gray-700">
                      Faktureringsadresse
                    </h3>
                  </div>
                  {billingAddress ? (
                    <div className="text-gray-600 space-y-1">
                      {billingAddress.map((line, i) => (
                        <p key={i}>{line}</p>
                      ))}
                      {getGoogleMapsUrl(customer.billing_address, customer.billing_postal_code, customer.billing_city) && (
                        <a
                          href={getGoogleMapsUrl(customer.billing_address, customer.billing_postal_code, customer.billing_city)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition-colors"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          Åbn rutevejledning
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="text-gray-400 italic">Ikke angivet</p>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="w-4 h-4 text-gray-500" />
                    <h3 className="font-medium text-gray-700">
                      Leveringsadresse
                    </h3>
                  </div>
                  {shippingAddress ? (
                    <div className="text-gray-600 space-y-1">
                      {shippingAddress.map((line, i) => (
                        <p key={i}>{line}</p>
                      ))}
                      {getGoogleMapsUrl(customer.shipping_address, customer.shipping_postal_code, customer.shipping_city) && (
                        <a
                          href={getGoogleMapsUrl(customer.shipping_address, customer.shipping_postal_code, customer.shipping_city)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition-colors"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          Åbn rutevejledning
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="text-gray-400 italic">Ikke angivet</p>
                  )}
                </div>
              </div>
            </div>

            {/* Contacts */}
            <div className="bg-white rounded-lg border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Kontaktpersoner</h2>
                <button
                  onClick={() => setShowContactForm(true)}
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <Plus className="w-4 h-4" />
                  Tilføj kontakt
                </button>
              </div>
              {contacts.length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  Ingen ekstra kontaktpersoner
                </p>
              ) : (
                <div className="space-y-3">
                  {contacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex items-start justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-white rounded-full">
                          <User className="w-4 h-4 text-gray-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{contact.name}</p>
                            {contact.is_primary && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800">
                                <Star className="w-3 h-3" />
                                Primær
                              </span>
                            )}
                          </div>
                          {contact.title && (
                            <p className="text-sm text-gray-500">{contact.title}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                            {contact.email && (
                              <a
                                href={`mailto:${contact.email}`}
                                className="hover:text-primary"
                              >
                                {contact.email}
                              </a>
                            )}
                            {contact.phone && (
                              <a
                                href={`tel:${contact.phone}`}
                                className="hover:text-primary"
                              >
                                {contact.phone}
                              </a>
                            )}
                            {contact.mobile && (
                              <a
                                href={`tel:${contact.mobile}`}
                                className="hover:text-primary"
                              >
                                {contact.mobile}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingContact(contact)}
                          className="p-1 hover:bg-gray-200 rounded"
                        >
                          <Pencil className="w-4 h-4 text-gray-500" />
                        </button>
                        <button
                          onClick={() => handleDeleteContact(contact.id)}
                          disabled={deletingContactId === contact.id}
                          className="p-1 hover:bg-red-100 rounded disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Email Timeline */}
            <CustomerEmailTimeline customerId={customer.id} customerEmail={customer.email} />

            {/* Tasks */}
            <CustomerTasks customerId={customer.id} />

            {/* Activity Overview */}
            <CustomerActivityOverview customerId={customer.id} customerEmail={customer.email} />

            {/* Notes */}
            {customer.notes && (
              <div className="bg-white rounded-lg border p-6">
                <h2 className="text-lg font-semibold mb-4">Noter</h2>
                <p className="text-gray-700 whitespace-pre-wrap">
                  {customer.notes}
                </p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Metadata */}
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Information</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500">Kundenummer</p>
                  <p className="font-mono font-medium">
                    {customer.customer_number}
                  </p>
                </div>
                {customer.vat_number && (
                  <div>
                    <p className="text-sm text-gray-500">CVR-nummer</p>
                    <p className="font-medium">{customer.vat_number}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-500">Oprettet af</p>
                  <p className="font-medium">
                    {customer.created_by_profile?.full_name ||
                      customer.created_by_profile?.email ||
                      'Ukendt'}
                  </p>
                </div>
              </div>
            </div>

            {/* Timestamps */}
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Tidsstempler</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Oprettet</span>
                  <span>
                    {format(new Date(customer.created_at), 'd. MMM yyyy HH:mm', {
                      locale: da,
                    })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Opdateret</span>
                  <span>
                    {format(new Date(customer.updated_at), 'd. MMM yyyy HH:mm', {
                      locale: da,
                    })}
                  </span>
                </div>
              </div>
            </div>

            {/* Customer Pricing */}
            <CustomerPricing
              customerId={customer.id}
              customerName={customer.company_name}
            />

            {/* Portal Access */}
            <PortalAccess
              customerId={customer.id}
              customerEmail={customer.email}
              tokens={portalTokens}
            />

            {/* Portal Chat */}
            <div className="bg-white rounded-lg border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Portal Chat
                </h2>
                <button
                  onClick={() => setShowChat(true)}
                  className="text-sm text-primary hover:underline"
                >
                  Åbn chat
                </button>
              </div>
              <p className="text-sm text-gray-500">
                Send beskeder til kunden via kundeportalen. Kunden kan svare når de er logget ind.
              </p>
              <button
                onClick={() => setShowChat(true)}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
              >
                <MessageSquare className="w-4 h-4" />
                Start chat
              </button>
            </div>
          </div>
        </div>
        )}
      </div>

      {showEditForm && (
        <CustomerForm
          customer={customer}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => router.refresh()}
        />
      )}

      {showContactForm && (
        <ContactForm
          customerId={customer.id}
          onClose={() => setShowContactForm(false)}
          onSuccess={() => router.refresh()}
        />
      )}

      {editingContact && (
        <ContactForm
          customerId={customer.id}
          contact={editingContact}
          onClose={() => setEditingContact(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      {showChat && (
        <EmployeeChat
          customerId={customer.id}
          customerName={customer.company_name}
          isModal={true}
          onClose={() => setShowChat(false)}
        />
      )}
      {showBesigtigelse && (
        <BookBesigtigelseModal
          customerId={customer.id}
          customerName={customer.company_name}
          customerEmail={customer.email}
          onClose={() => setShowBesigtigelse(false)}
          onSuccess={() => router.refresh()}
        />
      )}
      {showFuldmagtModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowFuldmagtModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-bold mb-4">Send Fuldmagt til kunde</h3>
            <p className="text-sm text-gray-600 mb-4">
              Opret en fuldmagt som kunden kan underskrive i portalen. Fuldmagten giver {customer.company_name} mulighed for at underskrive digitalt.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Ordrenummer</label>
              <input
                type="text"
                value={fuldmagtOrderNr}
                onChange={(e) => setFuldmagtOrderNr(e.target.value)}
                placeholder="f.eks. ORD-2026-001"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowFuldmagtModal(false)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 font-medium">
                Annuller
              </button>
              <button
                onClick={async () => {
                  if (!fuldmagtOrderNr.trim()) {
                    toast.error('Ordrenummer er påkrævet')
                    return
                  }
                  setIsSendingFuldmagt(true)
                  const result = await createFuldmagt(customer.id, fuldmagtOrderNr)
                  setIsSendingFuldmagt(false)
                  if (result.success) {
                    toast.success('Fuldmagt oprettet — kunden kan nu underskrive i portalen')
                    setShowFuldmagtModal(false)
                    setFuldmagtOrderNr('')
                    router.refresh()
                  } else {
                    toast.error(result.error || 'Kunne ikke oprette fuldmagt')
                  }
                }}
                disabled={isSendingFuldmagt}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSendingFuldmagt ? 'Opretter...' : <><FileSignature className="w-4 h-4" /> Opret Fuldmagt</>}
              </button>
            </div>
          </div>
        </div>
      )}
      {ConfirmDialog}
    </>
  )
}
