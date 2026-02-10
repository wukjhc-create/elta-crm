'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import { Breadcrumb } from '@/components/shared/breadcrumb'
import {
  Pencil,
  Trash2,
  Mail,
  Phone,
  Calendar,
  DollarSign,
  User,
  Building,
  Clock,
  MessageSquare,
} from 'lucide-react'
import { LeadStatusBadge } from '@/components/modules/leads/lead-status-badge'
import { LeadForm } from '@/components/modules/leads/lead-form'
import {
  deleteLead,
  updateLeadStatus,
  addLeadActivity,
} from '@/lib/actions/leads'
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  type LeadWithRelations,
  type LeadActivity,
  type LeadStatus,
} from '@/types/leads.types'
import { useToast } from '@/components/ui/toast'

interface LeadDetailClientProps {
  lead: LeadWithRelations
  activities: LeadActivity[]
}

export function LeadDetailClient({ lead, activities }: LeadDetailClientProps) {
  const router = useRouter()
  const toast = useToast()
  const [showEditForm, setShowEditForm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [isAddingNote, setIsAddingNote] = useState(false)

  const handleDelete = async () => {
    if (!confirm('Er du sikker på, at du vil slette denne lead?')) {
      return
    }

    setIsDeleting(true)
    const result = await deleteLead(lead.id)

    if (result.success) {
      toast.success('Lead slettet')
      router.push('/dashboard/leads')
    } else {
      toast.error('Kunne ikke slette lead', result.error)
      setIsDeleting(false)
    }
  }

  const handleStatusChange = async (newStatus: LeadStatus) => {
    setIsUpdatingStatus(true)
    const result = await updateLeadStatus(lead.id, newStatus)

    if (result.success) {
      toast.success('Status opdateret')
    } else {
      toast.error('Kunne ikke opdatere status', result.error)
    }

    setIsUpdatingStatus(false)
    router.refresh()
  }

  const handleAddNote = async () => {
    if (!newNote.trim()) return

    setIsAddingNote(true)
    const result = await addLeadActivity(lead.id, 'note', newNote.trim())

    if (result.success) {
      toast.success('Note tilføjet')
      setNewNote('')
      router.refresh()
    } else {
      toast.error('Kunne ikke tilføje note', result.error)
    }

    setIsAddingNote(false)
  }

  const formatValue = (value: number | null) => {
    if (value === null) return '-'
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
      maximumFractionDigits: 0,
    }).format(value)
  }

  return (
    <>
      <div className="space-y-6">
        <Breadcrumb items={[
          { label: 'Leads', href: '/dashboard/leads' },
          { label: lead.company_name },
        ]} />

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900">
                {lead.company_name}
              </h1>
              <LeadStatusBadge status={lead.status} />
            </div>
            <p className="text-gray-600 mt-1">{lead.contact_person}</p>
          </div>
          <div className="flex items-center gap-2">
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
                {LEAD_STATUSES.map((status) => (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(status)}
                    disabled={isUpdatingStatus || lead.status === status}
                    className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                      lead.status === status
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'hover:bg-gray-50 disabled:opacity-50'
                    }`}
                  >
                    {LEAD_STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
            </div>

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
                    <p className="font-medium">{lead.company_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <User className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Kontaktperson</p>
                    <p className="font-medium">{lead.contact_person}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Mail className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">E-mail</p>
                    <a
                      href={`mailto:${lead.email}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {lead.email}
                    </a>
                  </div>
                </div>
                {lead.phone && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <Phone className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Telefon</p>
                      <a
                        href={`tel:${lead.phone}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {lead.phone}
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            {lead.notes && (
              <div className="bg-white rounded-lg border p-6">
                <h2 className="text-lg font-semibold mb-4">Noter</h2>
                <p className="text-gray-700 whitespace-pre-wrap">{lead.notes}</p>
              </div>
            )}

            {/* Add note */}
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Tilføj note</h2>
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Skriv en note..."
                rows={3}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
              <div className="flex justify-end mt-3">
                <button
                  onClick={handleAddNote}
                  disabled={isAddingNote || !newNote.trim()}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                >
                  {isAddingNote ? 'Tilføjer...' : 'Tilføj note'}
                </button>
              </div>
            </div>

            {/* Activity log */}
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Aktivitetslog</h2>
              {activities.length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  Ingen aktiviteter endnu
                </p>
              ) : (
                <div className="space-y-4">
                  {activities.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 pb-4 border-b last:border-0"
                    >
                      <div className="p-2 bg-gray-100 rounded-full">
                        {activity.activity_type === 'note' ? (
                          <MessageSquare className="w-4 h-4 text-gray-600" />
                        ) : (
                          <Clock className="w-4 h-4 text-gray-600" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-gray-900">{activity.description}</p>
                        <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                          <span>
                            {activity.performed_by_profile?.full_name ||
                              activity.performed_by_profile?.email ||
                              'Ukendt'}
                          </span>
                          <span>•</span>
                          <span>
                            {format(
                              new Date(activity.created_at),
                              'd. MMM yyyy HH:mm',
                              { locale: da }
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Deal info */}
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Salgsdetaljer</h2>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <DollarSign className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Forventet værdi</p>
                    <p className="font-semibold text-lg">
                      {formatValue(lead.value)}
                    </p>
                  </div>
                </div>

                {lead.probability !== null && (
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Sandsynlighed</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full"
                          style={{ width: `${lead.probability}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">
                        {lead.probability}%
                      </span>
                    </div>
                  </div>
                )}

                {lead.expected_close_date && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Calendar className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Forventet lukkedato</p>
                      <p className="font-medium">
                        {format(
                          new Date(lead.expected_close_date),
                          'd. MMMM yyyy',
                          { locale: da }
                        )}
                      </p>
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-sm text-gray-500 mb-1">Kilde</p>
                  <p className="font-medium">
                    {LEAD_SOURCE_LABELS[lead.source]}
                  </p>
                </div>
              </div>
            </div>

            {/* Assignment */}
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Tildeling</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Tildelt til</p>
                  <p className="font-medium">
                    {lead.assigned_to_profile?.full_name ||
                      lead.assigned_to_profile?.email ||
                      'Ikke tildelt'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Oprettet af</p>
                  <p className="font-medium">
                    {lead.created_by_profile?.full_name ||
                      lead.created_by_profile?.email ||
                      'Ukendt'}
                  </p>
                </div>
              </div>
            </div>

            {/* Metadata */}
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Metadata</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Oprettet</span>
                  <span>
                    {format(new Date(lead.created_at), 'd. MMM yyyy HH:mm', {
                      locale: da,
                    })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Opdateret</span>
                  <span>
                    {format(new Date(lead.updated_at), 'd. MMM yyyy HH:mm', {
                      locale: da,
                    })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showEditForm && (
        <LeadForm
          lead={lead}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => router.refresh()}
        />
      )}
    </>
  )
}
