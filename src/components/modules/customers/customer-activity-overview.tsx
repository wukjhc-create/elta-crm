'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  FolderKanban,
  BarChart3,
  Send,
  ExternalLink,
} from 'lucide-react'
import {
  getCustomerOffers,
  getCustomerProjects,
  getCustomerLeads,
  getCustomerSentQuotes,
} from '@/lib/actions/customer-relations'
import type {
  CustomerOffer,
  CustomerProject,
  CustomerLead,
  CustomerSentQuote,
} from '@/lib/actions/customer-relations'

interface CustomerActivityOverviewProps {
  customerId: string
  customerEmail: string
}

export function CustomerActivityOverview({ customerId, customerEmail }: CustomerActivityOverviewProps) {
  const [offers, setOffers] = useState<CustomerOffer[]>([])
  const [projects, setProjects] = useState<CustomerProject[]>([])
  const [leads, setLeads] = useState<CustomerLead[]>([])
  const [sentQuotes, setSentQuotes] = useState<CustomerSentQuote[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadAll() {
      setIsLoading(true)
      const [o, p, l, sq] = await Promise.all([
        getCustomerOffers(customerId),
        getCustomerProjects(customerId),
        getCustomerLeads(customerEmail),
        getCustomerSentQuotes(customerId),
      ])
      setOffers(o)
      setProjects(p)
      setLeads(l)
      setSentQuotes(sq)
      setIsLoading(false)
    }
    loadAll()
  }, [customerId, customerEmail])

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">Aktivitetsoversigt</h2>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center gap-2 px-3 py-2">
                <div className="h-4 w-4 bg-muted animate-pulse rounded" />
                <div className="h-4 w-4 bg-muted animate-pulse rounded" />
                <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                <div className="h-4 w-6 bg-muted animate-pulse rounded" />
              </div>
              <div className="ml-6 space-y-1.5">
                <div className="flex items-center gap-2 py-2 px-3 bg-gray-50 rounded">
                  <div className="h-4 w-40 bg-muted animate-pulse rounded" />
                  <div className="h-5 w-14 bg-muted animate-pulse rounded-full ml-auto" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const totalItems = offers.length + projects.length + leads.length + sentQuotes.length
  if (totalItems === 0) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">Aktivitetsoversigt</h2>
        <p className="text-gray-500 text-center py-4">Ingen aktivitet endnu</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="text-lg font-semibold mb-4">Aktivitetsoversigt</h2>
      <div className="space-y-3">
        <ActivitySection
          icon={<BarChart3 className="w-4 h-4" />}
          title="Leads"
          count={leads.length}
          defaultOpen={leads.length > 0}
        >
          {leads.map((lead) => (
            <div key={lead.id} className="flex items-center justify-between py-2 px-3 text-sm bg-gray-50 rounded">
              <div className="min-w-0 flex-1">
                <span className="font-medium">{lead.company_name}</span>
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                  <StatusBadge status={lead.status} />
                  {lead.source && <span>{lead.source}</span>}
                  <span>{format(new Date(lead.created_at), 'd. MMM yyyy', { locale: da })}</span>
                </div>
              </div>
            </div>
          ))}
        </ActivitySection>

        <ActivitySection
          icon={<FileText className="w-4 h-4" />}
          title="Tilbud"
          count={offers.length}
          defaultOpen={offers.length > 0}
        >
          {offers.map((offer) => (
            <Link
              key={offer.id}
              href={`/dashboard/offers/${offer.id}`}
              className="flex items-center justify-between py-2 px-3 text-sm bg-gray-50 rounded hover:bg-blue-50 transition-colors group"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{offer.title}</span>
                  <ExternalLink className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100" />
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                  {offer.offer_number && <span>{offer.offer_number}</span>}
                  <StatusBadge status={offer.status} />
                  {offer.total != null && (
                    <span className="font-medium">
                      {Number(offer.total).toLocaleString('da-DK', { minimumFractionDigits: 2 })} kr.
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </ActivitySection>

        <ActivitySection
          icon={<FolderKanban className="w-4 h-4" />}
          title="Projekter"
          count={projects.length}
          defaultOpen={projects.length > 0}
        >
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/dashboard/projects/${project.id}`}
              className="flex items-center justify-between py-2 px-3 text-sm bg-gray-50 rounded hover:bg-blue-50 transition-colors group"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{project.name}</span>
                  <ExternalLink className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100" />
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                  {project.project_number && <span>{project.project_number}</span>}
                  <StatusBadge status={project.status} />
                </div>
              </div>
            </Link>
          ))}
        </ActivitySection>

        <ActivitySection
          icon={<Send className="w-4 h-4" />}
          title="Sendte Tilbud"
          count={sentQuotes.length}
          defaultOpen={sentQuotes.length > 0}
        >
          {sentQuotes.map((sq) => (
            <div key={sq.id} className="flex items-center justify-between py-2 px-3 text-sm bg-gray-50 rounded">
              <div className="min-w-0 flex-1">
                <span className="font-medium">{sq.title}</span>
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                  <span>{sq.quote_reference}</span>
                  {sq.total != null && (
                    <span className="font-medium">
                      {Number(sq.total).toLocaleString('da-DK', { minimumFractionDigits: 2 })} kr.
                    </span>
                  )}
                  <span>{format(new Date(sq.created_at), 'd. MMM yyyy', { locale: da })}</span>
                </div>
              </div>
            </div>
          ))}
        </ActivitySection>
      </div>
    </div>
  )
}

// =====================================================
// Collapsible Section
// =====================================================

function ActivitySection({
  icon,
  title,
  count,
  defaultOpen,
  children,
}: {
  icon: React.ReactNode
  title: string
  count: number
  defaultOpen: boolean
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen && count > 0)

  if (count === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400">
        {icon}
        <span>{title}</span>
        <span className="text-xs">(0)</span>
        <span className="text-xs italic ml-auto">Ingen {title.toLowerCase()} endnu</span>
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded transition-colors"
      >
        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        {icon}
        <span>{title}</span>
        <span className="text-xs text-gray-400 font-normal">({count})</span>
      </button>
      {isOpen && (
        <div className="ml-6 space-y-1.5 mt-1">
          {children}
        </div>
      )}
    </div>
  )
}

// =====================================================
// Status Badge
// =====================================================

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    new: 'bg-blue-100 text-blue-800',
    contacted: 'bg-cyan-100 text-cyan-800',
    qualified: 'bg-purple-100 text-purple-800',
    proposal: 'bg-indigo-100 text-indigo-800',
    won: 'bg-green-100 text-green-800',
    lost: 'bg-red-100 text-red-800',
    draft: 'bg-gray-100 text-gray-600',
    sent: 'bg-blue-100 text-blue-800',
    accepted: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    active: 'bg-green-100 text-green-800',
    completed: 'bg-emerald-100 text-emerald-800',
    cancelled: 'bg-red-100 text-red-800',
    planning: 'bg-amber-100 text-amber-800',
    in_progress: 'bg-blue-100 text-blue-800',
    on_hold: 'bg-yellow-100 text-yellow-800',
  }

  const color = colorMap[status] || 'bg-gray-100 text-gray-600'

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${color}`}>
      {status}
    </span>
  )
}
