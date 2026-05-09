'use client'

/**
 * Sprint 8D-1: Dokumenter-tab på orders/[id]-detalje.
 *
 * Viser alle customer_documents koblet til denne service_case (via
 * service_case_id). Inkluderer mail-vedhæftninger (source_email_id sat)
 * + manuelt uploadede docs der er flyttet til sagen.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileText, Mail, Download, Loader2, FolderOpen } from 'lucide-react'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import { getDocumentsForCase, type CaseDocument } from '@/lib/actions/service-cases'

function isImage(mime: string | null | undefined, filename: string | null | undefined): boolean {
  if (mime?.startsWith('image/')) return true
  if (!filename) return false
  return /\.(jpe?g|png|webp|gif|bmp|svg|heic)$/i.test(filename)
}

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

export function OrderDocumentsTab({ caseId }: { caseId: string }) {
  const [documents, setDocuments] = useState<CaseDocument[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    getDocumentsForCase(caseId)
      .then((data) => {
        if (!cancelled) setDocuments(data)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [caseId])

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border p-12 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-12 text-center text-gray-500">
        <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Ingen dokumenter på denne sag</p>
        <p className="text-sm mt-1">
          Dokumenter dukker op her når mail-vedhæftninger downloades fra mails koblet til denne sag,
          eller når brugeren manuelt flytter dokumenter til sagen.
        </p>
      </div>
    )
  }

  // Split mail-vedhæftninger fra øvrige
  const mailDocs = documents.filter((d) => d.source_email_id)
  const otherDocs = documents.filter((d) => !d.source_email_id)

  return (
    <div className="space-y-4">
      {/* Mail-vedhæftninger */}
      {mailDocs.length > 0 && (
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-600" />
            <h3 className="font-semibold text-sm">Mail-vedhæftninger</h3>
            <span className="text-xs text-gray-400 ml-1">({mailDocs.length})</span>
          </div>
          <div className="divide-y">
            {mailDocs.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} fromMail />
            ))}
          </div>
        </div>
      )}

      {/* Øvrige dokumenter */}
      {otherDocs.length > 0 && (
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-gray-600" />
            <h3 className="font-semibold text-sm">Øvrige dokumenter</h3>
            <span className="text-xs text-gray-400 ml-1">({otherDocs.length})</span>
          </div>
          <div className="divide-y">
            {otherDocs.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} fromMail={false} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DocumentRow({ doc, fromMail }: { doc: CaseDocument; fromMail: boolean }) {
  const isImg = isImage(doc.mime_type, doc.file_name)
  return (
    <div className="p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center ${
          fromMail ? 'bg-blue-100' : 'bg-gray-100'
        }`}>
          {isImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={doc.file_url} alt={doc.file_name} className="w-full h-full object-cover rounded-lg" />
          ) : (
            <FileText className={`w-5 h-5 ${fromMail ? 'text-blue-600' : 'text-gray-600'}`} />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{doc.file_name}</p>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <p className="text-xs text-gray-500">
              {format(new Date(doc.created_at), 'd. MMM yyyy', { locale: da })}
              {doc.file_size ? ` — ${formatSize(doc.file_size)}` : ''}
              {doc.mime_type ? ` — ${doc.mime_type.split('/')[1]?.toUpperCase() || doc.mime_type}` : ''}
            </p>
            {fromMail && doc.source_email_id && (
              <Link
                href={`/dashboard/mail?emailId=${doc.source_email_id}`}
                className="inline-flex items-center gap-1 text-[10px] font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 px-1.5 py-0.5 rounded"
                title="Åbn mail"
              >
                <Mail className="w-3 h-3" />
                Fra mail
              </Link>
            )}
          </div>
        </div>
      </div>
      {doc.file_url && (
        <a
          href={doc.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 active:scale-95 transition-transform"
        >
          <Download className="w-3.5 h-3.5" /> Åbn
        </a>
      )}
    </div>
  )
}
