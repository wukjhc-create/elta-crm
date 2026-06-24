import { Briefcase, MapPin, Calendar, User, FileText, Download, FolderOpen } from 'lucide-react'
import {
  SERVICE_CASE_STATUS_LABELS,
  SERVICE_CASE_STATUS_COLORS,
} from '@/types/service-cases.types'
import { formatDateLongDK } from '@/lib/utils/format'
import type {
  PartnerSession,
  PartnerServiceCase,
  PartnerDocument,
} from '@/types/partner-portal.types'

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  quote: 'Tilbud',
  invoice: 'Faktura',
  contract: 'Kontrakt',
  besigtigelse: 'Besigtigelse',
}

interface PartnerDashboardProps {
  token: string
  session: PartnerSession
  serviceCases: PartnerServiceCase[]
  documents: PartnerDocument[]
}

export function PartnerDashboard({
  token,
  session,
  serviceCases,
  documents,
}: PartnerDashboardProps) {
  const activeCount = serviceCases.filter((c) => c.status !== 'closed').length
  const inProgressCount = serviceCases.filter((c) => c.status === 'in_progress').length

  // Dokumenter grupperet pr. sag (titel-opslag fra sagslisten)
  const caseTitleById = new Map(
    serviceCases.map((c) => [c.id, `${c.title} · ${c.case_number}`])
  )
  const docsByCase = new Map<string, PartnerDocument[]>()
  for (const doc of documents) {
    const key = doc.service_case_id ?? 'ukendt'
    const list = docsByCase.get(key) ?? []
    list.push(doc)
    docsByCase.set(key, list)
  }

  return (
    <div className="space-y-8">
      {/* Welcome banner */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Velkommen, {session.partner.company_name}
        </h1>
        <p className="text-gray-600 mt-1">
          Her kan du se alle sager hvor I er betaler og hente dokumentation.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{serviceCases.length}</p>
              <p className="text-sm text-gray-500">Sager i alt</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{inProgressCount}</p>
              <p className="text-sm text-gray-500">I gang</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeCount}</p>
              <p className="text-sm text-gray-500">Aktive</p>
            </div>
          </div>
        </div>
      </div>

      {/* Service cases */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Sager</h2>
        </div>

        {serviceCases.length === 0 ? (
          <div className="text-center py-12">
            <Briefcase className="w-10 h-10 mx-auto text-gray-300 mb-2" />
            <p className="text-gray-500 text-sm">Ingen sager fundet</p>
          </div>
        ) : (
          <ul className="divide-y">
            {serviceCases.map((c) => (
              <li key={c.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 truncate">
                        {c.title}
                      </span>
                      <span className="text-xs text-gray-400">
                        {c.case_number}
                      </span>
                    </div>

                    {c.description && (
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                        {c.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-gray-500 mt-2 flex-wrap">
                      {c.end_customer_name && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {c.end_customer_name}
                        </span>
                      )}
                      {(c.address || c.city) && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {[c.address, c.postal_code, c.city]
                            .filter(Boolean)
                            .join(', ')}
                        </span>
                      )}
                      {c.start_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDateLongDK(c.start_date)}
                        </span>
                      )}
                    </div>
                  </div>

                  <span
                    className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${
                      SERVICE_CASE_STATUS_COLORS[c.status] ?? 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {SERVICE_CASE_STATUS_LABELS[c.status] ?? c.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Documents */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="px-6 py-4 border-b flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Dokumenter</h2>
        </div>

        {documents.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-10 h-10 mx-auto text-gray-300 mb-2" />
            <p className="text-gray-500 text-sm">Ingen dokumenter tilgængelige</p>
          </div>
        ) : (
          <div className="divide-y">
            {Array.from(docsByCase.entries()).map(([caseId, docs]) => (
              <div key={caseId} className="px-6 py-4">
                <p className="text-xs font-medium text-gray-500 mb-3">
                  {caseTitleById.get(caseId) ?? 'Øvrige dokumenter'}
                </p>
                <ul className="space-y-2">
                  {docs.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center justify-between gap-4 p-2 rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-5 h-5 text-gray-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {doc.title || doc.file_name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {DOCUMENT_TYPE_LABELS[doc.document_type] ?? doc.document_type}
                          </p>
                        </div>
                      </div>
                      <a
                        href={`/api/partner/documents?token=${encodeURIComponent(token)}&documentId=${encodeURIComponent(doc.id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <Download className="w-4 h-4" />
                        Hent
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
