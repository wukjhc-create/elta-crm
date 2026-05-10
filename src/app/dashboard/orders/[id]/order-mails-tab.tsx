'use client'

/**
 * Sprint 8D-1: Mails-tab på orders/[id]-detalje.
 *
 * Liste over alle incoming_emails koblet til service_case (via
 * service_case_id). Klik på row expander INLINE og viser hele mailen
 * + vedhæftninger + "Arkivér på sag"-knap. Brugeren forlader IKKE
 * sagsiden.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Mail,
  Paperclip,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  CheckSquare,
  Image as ImageIcon,
  X,
} from 'lucide-react'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import {
  getEmailsForCase,
  getCaseEmailDetail,
  archiveEmailAttachmentsToCase,
  type CaseEmail,
  type CaseEmailDetail,
} from '@/lib/actions/service-cases'
import { backfillEmailAttachments } from '@/lib/actions/incoming-emails'
import { getRequiresResponseStatus } from '@/lib/actions/email-response-status'
import { sanitizeEmailHtml } from '@/lib/utils/sanitize-email-html'

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: typeof Mail }> = {
  linked:       { label: 'Koblet',         cls: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  unidentified: { label: 'Uidentificeret', cls: 'bg-amber-100 text-amber-800', icon: AlertCircle },
  pending:      { label: 'Afventer',       cls: 'bg-gray-100 text-gray-600',   icon: Clock },
  ignored:      { label: 'Ignoreret',      cls: 'bg-gray-100 text-gray-400',   icon: XCircle },
}

function isImage(mime: string | null | undefined, filename: string | null | undefined): boolean {
  if (mime?.startsWith('image/')) return true
  if (!filename) return false
  return /\.(jpe?g|png|webp|gif|bmp|svg|heic)$/i.test(filename)
}

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return ''
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

// Sprint 8E-1A: badge-formatter for "kræver svar" på sagsside
function rrBadge(ageHours: number | null): { label: string; cls: string } {
  if (ageHours == null) return { label: 'Kræver svar', cls: 'bg-yellow-100 text-yellow-800 border-yellow-300' }
  if (ageHours < 4) {
    const m = Math.max(1, Math.floor(ageHours * 60))
    return { label: `Ubesvaret ${m} min`, cls: 'bg-yellow-100 text-yellow-800 border-yellow-300' }
  }
  if (ageHours < 24) {
    return { label: `Ubesvaret ${Math.floor(ageHours)} t`, cls: 'bg-orange-100 text-orange-800 border-orange-300' }
  }
  const days = Math.floor(ageHours / 24)
  return { label: `Ubesvaret ${days} ${days === 1 ? 'dag' : 'dage'}`, cls: 'bg-red-100 text-red-800 border-red-300' }
}

export function OrderMailsTab({ caseId }: { caseId: string }) {
  const [emails, setEmails] = useState<CaseEmail[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // Sprint 8E-1A: requires_response status pr. mail
  const [requiresResponseMap, setRequiresResponseMap] = useState<Record<string, { requiresResponse: boolean; ageHours: number | null }>>({})

  const fetchRequiresResponse = async (emailList: CaseEmail[]) => {
    if (emailList.length === 0) {
      setRequiresResponseMap({})
      return
    }
    try {
      const map = await getRequiresResponseStatus(emailList.map((e) => e.id))
      const compact: Record<string, { requiresResponse: boolean; ageHours: number | null }> = {}
      for (const [id, info] of Object.entries(map)) {
        if (info.requiresResponse) {
          compact[id] = { requiresResponse: true, ageHours: info.ageHours }
        }
      }
      setRequiresResponseMap(compact)
    } catch {
      /* non-critical */
    }
  }

  const loadEmails = async () => {
    const data = await getEmailsForCase(caseId)
    setEmails(data)
    await fetchRequiresResponse(data)
  }

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    getEmailsForCase(caseId)
      .then(async (data) => {
        if (!cancelled) {
          setEmails(data)
          await fetchRequiresResponse(data)
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId])

  const requiresResponseCount = Object.keys(requiresResponseMap).length

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border p-12 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (emails.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-12 text-center text-gray-500">
        <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Ingen mails koblet til denne sag</p>
        <p className="text-sm mt-1">
          Mails kobles til sagen via &quot;Vælg sag&quot;-dropdown i mail-detail på{' '}
          <Link href="/dashboard/mail" className="text-blue-600 hover:underline">/dashboard/mail</Link>.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border">
      <div className="p-4 border-b flex items-center gap-2">
        <Mail className="w-4 h-4 text-blue-600" />
        <h3 className="font-semibold text-sm">Mails</h3>
        <span className="text-xs text-gray-400 ml-1">({emails.length})</span>
        {/* Sprint 8E-1A: counter for ubesvarede */}
        {requiresResponseCount > 0 && (
          <span
            className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800"
            title="Antal mails der kræver svar"
          >
            <AlertCircle className="w-3 h-3" />
            {requiresResponseCount} kræver svar
          </span>
        )}
      </div>
      <div className="divide-y">
        {emails.map((email) => {
          const status = STATUS_CONFIG[email.link_status] || STATUS_CONFIG.pending
          const StatusIcon = status.icon
          const isExpanded = expandedId === email.id
          return (
            <div key={email.id}>
              {/* Header row — clickable */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : email.id)}
                className={`w-full text-left flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors ${
                  isExpanded ? 'bg-blue-50/50' : ''
                }`}
              >
                <div className="pt-1 w-8 shrink-0">
                  {!email.is_read && (
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-600 ring-2 ring-blue-200" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className={`text-sm truncate ${!email.is_read ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
                      {email.sender_name || email.sender_email}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">
                      {format(new Date(email.received_at), 'd. MMM yyyy HH:mm', { locale: da })}
                    </span>
                  </div>
                  <p className={`text-sm truncate ${!email.is_read ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                    {email.subject || '(Intet emne)'}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {/* Sprint 8E-1A: kræver svar-badge */}
                    {requiresResponseMap[email.id]?.requiresResponse && (() => {
                      const { label, cls } = rrBadge(requiresResponseMap[email.id].ageHours)
                      return (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}
                          title="Denne mail kræver et svar fra os"
                        >
                          <AlertCircle className="w-3 h-3" />
                          {label}
                        </span>
                      )
                    })()}
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.cls}`}>
                      <StatusIcon className="w-3 h-3" />
                      {status.label}
                    </span>
                    {email.has_attachments && (
                      <Paperclip className="w-3.5 h-3.5 text-gray-400" />
                    )}
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-gray-400 shrink-0 self-center" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 self-center" />
                )}
              </button>

              {/* Inline mail-detail */}
              {isExpanded && (
                <ExpandedMailDetail
                  emailId={email.id}
                  caseId={caseId}
                  onArchived={loadEmails}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ExpandedMailDetail({
  emailId,
  caseId,
  onArchived,
}: {
  emailId: string
  caseId: string
  onArchived: () => void
}) {
  const [detail, setDetail] = useState<CaseEmailDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isArchiving, setIsArchiving] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [archiveResult, setArchiveResult] = useState<{
    success: boolean
    msg: string
  } | null>(null)
  // Sprint 8D-1 polish: lightbox til billed-thumbnails
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null)

  const refetchDetail = async () => {
    const data = await getCaseEmailDetail(emailId, caseId)
    setDetail(data)
  }

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setArchiveResult(null)
    getCaseEmailDetail(emailId, caseId)
      .then((data) => {
        if (!cancelled) setDetail(data)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [emailId, caseId])

  // ESC lukker lightbox
  useEffect(() => {
    if (!lightbox) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [lightbox])

  // Sprint 8D-1: kombineret "Download fra Graph + arkivér på sag" i ét klik.
  // Bruger eksisterende backfillEmailAttachments som henter contentBytes
  // fra Graph, uploader til Storage, opdaterer incoming_emails.attachment_urls
  // OG kalder processEmailAttachments → archiveAttachmentsToCustomerDocuments
  // (commit 750570e). Da mailen allerede har service_case_id sat, oprettes
  // customer_documents-rows automatisk med korrekt sag-tilknytning.
  const handleDownloadAndArchive = async () => {
    setIsDownloading(true)
    setArchiveResult(null)
    try {
      const result = await backfillEmailAttachments(emailId)
      if (result.success) {
        await refetchDetail()
        setArchiveResult({
          success: true,
          msg: result.count > 0
            ? `Downloadet ${result.count} fil${result.count === 1 ? '' : 'er'} og arkiveret på sagen`
            : 'Ingen filer at downloade',
        })
        onArchived()
      } else {
        setArchiveResult({ success: false, msg: result.error || 'Download fejlede' })
      }
    } catch {
      setArchiveResult({ success: false, msg: 'Uventet fejl ved download' })
    } finally {
      setIsDownloading(false)
    }
  }

  const handleArchive = async () => {
    setIsArchiving(true)
    setArchiveResult(null)
    try {
      const result = await archiveEmailAttachmentsToCase(emailId)
      if (result.success) {
        const archived = result.archivedCount ?? 0
        const skipped = result.skippedCount ?? 0
        setArchiveResult({
          success: true,
          msg: archived > 0
            ? `Arkiveret ${archived} fil${archived === 1 ? '' : 'er'}${skipped > 0 ? ` (${skipped} allerede arkiveret)` : ''}`
            : `Allerede arkiveret (${skipped} fil${skipped === 1 ? '' : 'er'})`,
        })
        onArchived()
      } else if (result.needsDownload) {
        setArchiveResult({
          success: false,
          msg: 'Vedhæftninger ikke downloadet endnu — åbn mailen i mailmodulet og klik "Download vedhæftninger"',
        })
      } else {
        setArchiveResult({ success: false, msg: result.error || 'Ukendt fejl' })
      }
    } catch {
      setArchiveResult({ success: false, msg: 'Uventet fejl' })
    } finally {
      setIsArchiving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="bg-gray-50 px-12 py-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="bg-gray-50 px-12 py-6 text-center text-sm text-gray-500">
        Kunne ikke hente mail-indhold
      </div>
    )
  }

  const attachments = detail.attachment_urls || []
  const downloadedCount = attachments.filter((a) => a.url && a.storagePath).length

  return (
    <div className="bg-gray-50 border-t p-5 space-y-4">
      {/* Meta */}
      <div className="text-xs text-gray-600 space-y-0.5">
        <div><span className="text-gray-500">Fra:</span> <span className="font-medium">{detail.sender_name || detail.sender_email}</span> &lt;{detail.sender_email}&gt;</div>
        {detail.to_email && (
          <div><span className="text-gray-500">Til:</span> {detail.to_email}</div>
        )}
        <div><span className="text-gray-500">Modtaget:</span> {format(new Date(detail.received_at), 'd. MMM yyyy HH:mm', { locale: da })}</div>
      </div>

      {/* Body */}
      <div className="bg-white border rounded-md p-4 max-h-[500px] overflow-y-auto">
        {detail.body_html ? (
          <div
            className="prose prose-sm max-w-none text-sm"
            dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(detail.body_html) }}
          />
        ) : detail.body_text ? (
          <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">{detail.body_text}</pre>
        ) : (
          <p className="text-sm text-gray-400 italic">{detail.body_preview || 'Ingen brødtekst'}</p>
        )}
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="bg-white border rounded-md p-3">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-gray-500" />
              <h4 className="font-semibold text-sm">Vedhæftninger ({attachments.length})</h4>
            </div>
            <div className="flex items-center gap-2">
              {/* Sprint 8D-1: hvis attachments mangler download → vis kombineret
                  download+arkiv-knap (Graph fetch → Storage → customer_documents) */}
              {downloadedCount < attachments.length && (
                <button
                  onClick={handleDownloadAndArchive}
                  disabled={isDownloading || isArchiving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Henter vedhæftninger fra Outlook og arkiverer dem på sagen i ét klik"
                >
                  {isDownloading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  Download og arkivér
                </button>
              )}
              {/* Hvis nogle attachments allerede er downloadet men måske ikke arkiveret —
                  re-arkivér for at sikre customer_documents er up-to-date (idempotent) */}
              {downloadedCount > 0 && (
                <button
                  onClick={handleArchive}
                  disabled={isArchiving || isDownloading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Sikrer at downloadede vedhæftninger findes i customer_documents (idempotent)"
                >
                  {isArchiving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckSquare className="w-3.5 h-3.5" />
                  )}
                  Arkivér på sag
                </button>
              )}
            </div>
          </div>
          {/* Sprint 8D-1 polish: split images (thumbnail-grid) fra files (rows) */}
          {(() => {
            const imageDownloaded = attachments.filter(
              (a) => isImage(a.contentType, a.filename) && a.url && a.storagePath
            )
            const imageMissing = attachments.filter(
              (a) => isImage(a.contentType, a.filename) && (!a.url || !a.storagePath)
            )
            const nonImages = attachments.filter(
              (a) => !isImage(a.contentType, a.filename)
            )

            return (
              <>
                {/* Billed-thumbnails grid — klik åbner lightbox */}
                {imageDownloaded.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-3">
                    {imageDownloaded.map((att, idx) => (
                      <button
                        key={`img-${att.filename}-${idx}`}
                        type="button"
                        onClick={() => setLightbox({ url: att.url!, name: att.filename })}
                        className="group relative block rounded-lg overflow-hidden border bg-gray-50 hover:ring-2 hover:ring-blue-500 transition-all text-left"
                        title={`${att.filename} — ${formatSize(att.size)} (klik for stort billede)`}
                      >
                        <div className="relative aspect-square">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={att.url!}
                            alt={att.filename}
                            loading="lazy"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                            <ExternalLink className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 drop-shadow" />
                          </div>
                        </div>
                        <div className="p-1.5 text-[11px] text-gray-700 truncate">{att.filename}</div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Billeder uden storage — placeholders */}
                {imageMissing.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-3">
                    {imageMissing.map((att, idx) => (
                      <div
                        key={`imgm-${att.filename}-${idx}`}
                        className="rounded-lg border border-dashed bg-amber-50/50 p-3 flex flex-col items-center justify-center text-center"
                      >
                        <ImageIcon className="w-6 h-6 text-amber-500 mb-1" />
                        <p className="text-[11px] text-amber-800 font-medium truncate w-full">{att.filename}</p>
                        <p className="text-[10px] text-amber-600 mt-0.5">Ikke downloadet</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Filer (ikke-billeder) — rows */}
                {nonImages.length > 0 && (
                  <div className="divide-y">
                    {nonImages.map((att, idx) => {
                      const isDownloaded = !!(att.url && att.storagePath)
                      return (
                        <div key={`file-${att.filename}-${idx}`} className="flex items-center justify-between gap-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="w-4 h-4 text-gray-500 shrink-0" />
                            <span className="text-sm truncate">{att.filename}</span>
                            <span className="text-xs text-gray-400 shrink-0">{formatSize(att.size)}</span>
                            {!isDownloaded && (
                              <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                                Ikke downloadet
                              </span>
                            )}
                          </div>
                          {isDownloaded && att.url && (
                            <a
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 inline-flex items-center gap-1 text-xs text-gray-600 hover:text-blue-600"
                            >
                              <Download className="w-3.5 h-3.5" /> Åbn
                            </a>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )
          })()}
          {archiveResult && (
            <div className={`mt-2 text-xs px-2 py-1.5 rounded ${
              archiveResult.success ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'
            }`}>
              {archiveResult.msg}
            </div>
          )}
        </div>
      )}

      {/* Sekundær link til fuld mailmodul */}
      <div className="text-right">
        <Link
          href={`/dashboard/mail?emailId=${emailId}`}
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600"
        >
          <ExternalLink className="w-3 h-3" /> Åbn i mailmodul
        </Link>
      </div>

      {/* Sprint 8D-1 polish: lightbox modal til billed-thumbnails */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            // Klik udenfor billedet lukker modal
            if (e.target === e.currentTarget) setLightbox(null)
          }}
        >
          <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center">
            <div className="flex items-center justify-between w-full mb-2 px-1 gap-2">
              <span className="text-sm text-white/80 truncate max-w-[60%]" title={lightbox.name}>
                {lightbox.name}
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={lightbox.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-full bg-white/10 hover:bg-white/20"
                  title="Åbn i ny fane / Download"
                >
                  <Download className="w-4 h-4 text-white" />
                </a>
                <button
                  onClick={() => setLightbox(null)}
                  className="p-1.5 rounded-full bg-white/10 hover:bg-white/20"
                  title="Luk (Esc)"
                  aria-label="Luk billede-visning"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.url}
              alt={lightbox.name}
              className="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain bg-white"
            />
          </div>
        </div>
      )}
    </div>
  )
}
