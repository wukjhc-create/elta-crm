'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import {
  ArrowLeft,
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
} from 'lucide-react'
import { CustomerForm } from '@/components/modules/customers/customer-form'
import { ContactForm } from '@/components/modules/customers/contact-form'
import { PortalAccess } from '@/components/modules/customers/portal-access'
import {
  deleteCustomer,
  toggleCustomerActive,
  deleteCustomerContact,
} from '@/lib/actions/customers'
import type { CustomerWithRelations, CustomerContact } from '@/types/customers.types'
import type { PortalAccessToken } from '@/types/portal.types'

interface CustomerDetailClientProps {
  customer: CustomerWithRelations
  portalTokens: PortalAccessToken[]
}

export function CustomerDetailClient({ customer, portalTokens }: CustomerDetailClientProps) {
  const router = useRouter()
  const [showEditForm, setShowEditForm] = useState(false)
  const [showContactForm, setShowContactForm] = useState(false)
  const [editingContact, setEditingContact] = useState<CustomerContact | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null)

  const handleDelete = async () => {
    if (!confirm('Er du sikker på, at du vil slette denne kunde?')) {
      return
    }

    setIsDeleting(true)
    const result = await deleteCustomer(customer.id)

    if (result.success) {
      router.push('/dashboard/customers')
    } else {
      alert(result.error || 'Kunne ikke slette kunde')
      setIsDeleting(false)
    }
  }

  const handleToggleActive = async () => {
    const result = await toggleCustomerActive(customer.id, !customer.is_active)

    if (!result.success) {
      alert(result.error || 'Kunne ikke opdatere status')
    }

    router.refresh()
  }

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm('Er du sikker på, at du vil slette denne kontakt?')) {
      return
    }

    setDeletingContactId(contactId)
    const result = await deleteCustomerContact(contactId, customer.id)

    if (!result.success) {
      alert(result.error || 'Kunne ikke slette kontakt')
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
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/customers"
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-gray-900">
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
              <p className="text-gray-600 mt-1">
                Kundenr. {customer.customer_number}
                {customer.vat_number && ` • CVR: ${customer.vat_number}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleActive}
              className="inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-gray-50"
            >
              {customer.is_active ? (
                <>
                  <XCircle className="w-4 h-4" />
                  Deaktiver
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Aktiver
                </>
              )}
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

            {/* Portal Access */}
            <PortalAccess
              customerId={customer.id}
              customerEmail={customer.email}
              tokens={portalTokens}
            />
          </div>
        </div>
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
    </>
  )
}
