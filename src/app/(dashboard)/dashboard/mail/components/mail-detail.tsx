'use client'

import { useState, useEffect } from 'react'
import {
  Mail,
  MailOpen,
  Archive,
  EyeOff,
  ExternalLink,
  UserPlus,
  Link2,
  Paperclip,
  Download,
  FileText,
  X,
  MessageCircle,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react'
import { checkCustomerPortalAccess } from '@/lib/actions/quote-actions'
import { backfillEmailAttachments, sendQuickReply, findCustomerSuggestions } from '@/lib/actions/incoming-emails'
import type { IncomingEmailWithCustomer, EmailLinkStatus } from '@/types/mail-bridge.types'

// =====================================================
// Props
// =====================================================

interface MailDetailProps {
  email: IncomingEmailWithCustomer
  onArchive: () => void
  onIgnore: () => void
  onLink: () => void
  onCreateCustomer: () => void
  onToggleRead: () => void
  onAttachmentsBackfilled: () => void
  onLinkToCustomer?: (customerId: string) => void
  isCreatingCustomer: boolean
  existingLeadId?: string
  existingLeadStatus?: string
}

// =====================================================
// Helpers
// =====================================================

function isImageFile(contentType?: string, filename?: string): boolean {
  if (contentType?.startsWith('image/')) return true
  if (!filename) return false
  return /\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(filename)
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 KB'
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('da-DK', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function statusBadge(status: EmailLinkStatus) {
  const map: Record<EmailLinkStatus, { icon: typeof Mail; label: string; cls: string }> = {
    linked: { icon: CheckCircle2, label: 'Koblet', cls: 'bg-green-100 text-green-800' },
    unidentified: { icon: AlertCircle, label: 'Uidentificeret', cls: 'bg-amber-100 text-amber-800' },
    pending: { icon: Clock, label: 'Afventer', cls: 'bg-gray-100 text-gray-600' },
    ignored: { icon: XCircle, label: 'Ignoreret', cls: 'bg-gray-100 text-gray-400' },
  }
  const c = map[status]
  if (!c) return null
  const Icon = c.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.cls}`}>
      <Icon className="w-3 h-3" /> {c.label}
    </span>
  )
}

// =====================================================
// Component
// =====================================================

export function MailDetail({
  email,
  onArchive,
  onIgnore,
  onLink,
  onCreateCustomer,
  onToggleRead,
  onAttachmentsBackfilled,
  onLinkToCustomer,
  isCreatingCustomer,
  existingLeadId,
  existingLeadStatus,
}: MailDetailProps) {
  const [portalAccess, setPortalAccess] = useState<{ hasPortal: boolean } | null>(null)
  const [isBackfilling, setIsBackfilling] = useState(false)
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [lightboxName, setLightboxName] = useState('')

  // Quick reply state
  const [isSendingReply, setIsSendingReply] = useState<string | null>(null)
  const [replyMsg, setReplyMsg] = useState<string | null>(null)

  // Smart suggestion state
  const [suggestions, setSuggestions] = useState<Array<{ id: string; company_name: string; customer_number: string; email: string; matchReason: string }>>([])
  const [detectedPhone, setDetectedPhone] = useState<string | null>(null)
  const [detectedOrderId, setDetectedOrderId] = useState<string | null>(null)

  const attachments = (email.attachment_urls || []) as Array<{
    url?: string; filename: string; contentType?: string; size: number; storagePath?: string
  }>
  const realAttachments = attachments.filter((a) => a.url && a.url.length > 0)
  const imageAttachments = realAttachments.filter((a) => isImageFile(a.contentType, a.filename))
  const fileAttachments = realAttachments.filter((a) => !isImageFile(a.contentType, a.filename))

  useEffect(() => {
    setPortalAccess(null)
    setBackfillMsg(null)
    setReplyMsg(null)
    setSuggestions([])
    setDetectedPhone(null)
    setDetectedOrderId(null)

    if (email.link_status === 'linked' && email.customer_id) {
      checkCustomerPortalAccess(email.customer_id).then((res) => {
        if (res.success && res.data) setPortalAccess(res.data)
      })
    }

    // Smart suggestion: detect phone/order ID and find matching customers
    if (email.link_status !== 'linked') {
      findCustomerSuggestions(email.id).then((res) => {
        setSuggestions(res.suggestions)
        setDetectedPhone(res.detectedPhone)
        setDetectedOrderId(res.detectedOrderId)
      })
    }
  }, [email.id, email.link_status, email.customer_id])

  const handleQuickReply = async (template: string) => {
    setIsSendingReply(template)
    setReplyMsg(null)
    try {
      const result = await sendQuickReply(email.id, template)
      if (result.success) {
        setReplyMsg('Svar sendt!')
      } else {
        setReplyMsg(`Fejl: ${result.error || 'Ukendt'}`)
      }
    } catch {
      setReplyMsg('Fejl ved afsendelse')
    } finally {
      setIsSendingReply(null)
    }
  }

  const handleBackfill = async () => {
    setIsBackfilling(true)
    setBackfillMsg(null)
    try {
      const res = await backfillEmailAttachments(email.id)
      if (res.success && res.count > 0) {
        setBackfillMsg(`${res.count} fil(er) downloadet`)
        onAttachmentsBackfilled()
      } else if (res.error) {
        setBackfillMsg(`Fejl: ${res.error}`)
      } else {
        setBackfillMsg('Ingen filer fundet')
      }
    } catch {
      setBackfillMsg('Uventet fejl')
    } finally {
      setIsBackfilling(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ============================================== */}
      {/* HEADER: Subject + meta + action buttons        */}
      {/* ============================================== */}
      <div className="border-b p-5 space-y-4">
        {/* Subject + badges */}
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold text-gray-900">{email.subject || '(Intet emne)'}</h2>
          <div className="flex items-center gap-2 shrink-0">
            {!email.is_read && (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Ulæst</span>
            )}
            {statusBadge(email.link_status)}
          </div>
        </div>

        {/* Sender + date */}
        <div className="flex items-center justify-between text-sm">
          <div className="text-gray-600">
            <span className="font-medium text-gray-800">{email.sender_name || email.sender_email}</span>
            {email.sender_name && <span className="ml-1 text-gray-400">&lt;{email.sender_email}&gt;</span>}
            {email.is_forwarded && email.original_sender_email && (
              <span className="ml-2 text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                Videresendt fra: {email.original_sender_name || email.original_sender_email}
              </span>
            )}
          </div>
          <span className="text-xs text-gray-400">{formatDate(email.received_at)}</span>
        </div>

        {/* Customer link */}
        {email.link_status === 'linked' && email.customers && (
          <div className="flex items-center gap-2 text-sm bg-green-50 border border-green-200 p-2.5 rounded-md">
            <Link2 className="w-4 h-4 text-green-600" />
            <span>Koblet til: <strong>{email.customers.company_name}</strong> ({email.customers.customer_number})</span>
            <a href={`/dashboard/customers/${email.customers.id}`} className="ml-auto text-blue-600 hover:underline inline-flex items-center gap-1 text-xs">
              Åbn kunde <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {/* Portal */}
        {portalAccess?.hasPortal && email.customers && (
          <div className="flex items-center gap-2 text-sm bg-purple-50 border border-purple-200 p-2.5 rounded-md">
            <MessageCircle className="w-4 h-4 text-purple-600" />
            <span className="text-purple-700">Kunden har en aktiv portal</span>
            <a href={`/dashboard/customers/${email.customers.id}#chat`} className="ml-auto text-purple-600 hover:underline inline-flex items-center gap-1 text-xs font-medium">
              Hop til Chat <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {/* ========== ACTION BUTTONS — large, clear, styled like Leads ========== */}
        <div className="flex items-center gap-2 pt-2 flex-wrap">
          {/* Promote / View Lead */}
          {existingLeadId ? (
            <a
              href={`/dashboard/leads/${existingLeadId}`}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700"
            >
              <ExternalLink className="w-4 h-4" />
              Se Lead
              {existingLeadStatus && (
                <span className="bg-amber-500/40 text-white px-1.5 py-0.5 rounded text-[10px] uppercase">{existingLeadStatus}</span>
              )}
            </a>
          ) : (
            <button
              onClick={onCreateCustomer}
              disabled={isCreatingCustomer}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50"
            >
              {isCreatingCustomer ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Forfrem til Lead
            </button>
          )}

          {/* Link to customer */}
          {email.link_status !== 'linked' && !existingLeadId && (
            <button
              onClick={onLink}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Link2 className="w-4 h-4" />
              Kobl til kunde
            </button>
          )}

          {/* ===== MARK AS UNREAD / READ ===== */}
          <button
            onClick={onToggleRead}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border-2 transition-colors ${
              email.is_read
                ? 'border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {email.is_read ? (
              <><Mail className="w-4 h-4" /> Markér som ulæst</>
            ) : (
              <><MailOpen className="w-4 h-4" /> Markér som læst</>
            )}
          </button>

          {/* Archive */}
          <button
            onClick={onArchive}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-md hover:bg-gray-50"
          >
            <Archive className="w-4 h-4" /> Arkivér
          </button>

          {/* Ignore */}
          {email.link_status === 'unidentified' && (
            <button
              onClick={onIgnore}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-md hover:bg-gray-50 text-gray-500"
            >
              <EyeOff className="w-4 h-4" /> Ignorér
            </button>
          )}
        </div>

        {/* ========== QUICK REPLY BUTTONS ========== */}
        <div className="pt-2 border-t space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Hurtigt svar</p>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { label: 'Bekræft modtagelse', text: 'Tak for din henvendelse. Vi har modtaget din email og vender tilbage hurtigst muligt.\n\nMed venlig hilsen,\nElta Solar' },
              { label: 'Mangler info', text: 'Tak for din henvendelse. Vi mangler lidt yderligere information for at kunne hjælpe dig. Kan du venligst sende os følgende:\n\n- [Udfyld manglende information]\n\nMed venlig hilsen,\nElta Solar' },
              { label: 'Tak for ordren', text: 'Mange tak for din ordre! Vi bekræfter hermed modtagelsen og går i gang med at behandle den.\n\nDu vil høre fra os inden for kort tid med næste skridt.\n\nMed venlig hilsen,\nElta Solar' },
            ].map((tpl) => (
              <button
                key={tpl.label}
                onClick={() => handleQuickReply(tpl.text)}
                disabled={isSendingReply !== null}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-md hover:bg-blue-50 hover:text-blue-700 border border-gray-200 hover:border-blue-300 transition-colors disabled:opacity-50"
              >
                {isSendingReply === tpl.text ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                {tpl.label}
              </button>
            ))}
          </div>
          {replyMsg && (
            <p className={`text-xs ${replyMsg.startsWith('Fejl') ? 'text-red-600' : 'text-green-600 font-medium'}`}>
              {replyMsg}
            </p>
          )}
        </div>

        {/* ========== SMART SUGGESTION — detected phone/order, customer matches ========== */}
        {suggestions.length > 0 && (
          <div className="pt-2 border-t">
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 space-y-2">
              <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                Smart forslag — kunde fundet
              </p>
              {detectedPhone && (
                <p className="text-xs text-blue-700">Telefon fundet i email: <strong>{detectedPhone}</strong></p>
              )}
              {detectedOrderId && (
                <p className="text-xs text-blue-700">Ordre/ref fundet i email: <strong>{detectedOrderId}</strong></p>
              )}
              <div className="space-y-1">
                {suggestions.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 bg-white rounded px-2.5 py-2 border border-blue-100">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{s.company_name}</p>
                      <p className="text-xs text-gray-500">{s.customer_number} — {s.matchReason}</p>
                    </div>
                    <button
                      onClick={() => onLinkToCustomer?.(s.id)}
                      className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors ring-2 ring-blue-300 ring-offset-1"
                    >
                      <Link2 className="w-3 h-3" />
                      Kobl
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ============================================== */}
      {/* EMAIL BODY                                     */}
      {/* ============================================== */}
      <div className="flex-1 overflow-y-auto p-5">
        {email.body_html ? (
          <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: email.body_html }} />
        ) : (
          <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">
            {email.body_text || email.body_preview || '(Tom email)'}
          </pre>
        )}

        {/* ============================================ */}
        {/* ATTACHMENTS — always at bottom of body area  */}
        {/* ============================================ */}
        {email.has_attachments && (
          <div className="mt-6 pt-4 border-t">
            <div className="flex items-center gap-2 mb-3">
              <Paperclip className="w-5 h-5 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-700">
                Vedhæftede filer
                {realAttachments.length > 0 && <span className="text-gray-400 font-normal ml-1">({realAttachments.length})</span>}
              </h3>
            </div>

            {realAttachments.length > 0 ? (
              <div className="space-y-3">
                {/* Image gallery */}
                {imageAttachments.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {imageAttachments.map((att, i) => (
                      <button
                        key={`img-${i}`}
                        onClick={() => { setLightboxUrl(att.url!); setLightboxName(att.filename) }}
                        className="group relative aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all bg-gray-100"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={att.url} alt={att.filename} className="w-full h-full object-cover" />
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
                          <p className="text-[11px] text-white truncate">{att.filename}</p>
                          <p className="text-[10px] text-white/70">{formatFileSize(att.size)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* File download list */}
                {fileAttachments.length > 0 && (
                  <div className="space-y-1.5">
                    {fileAttachments.map((att, i) => {
                      const isPdf = att.contentType === 'application/pdf'
                      const Icon = isPdf ? FileText : Paperclip
                      return (
                        <a
                          key={`file-${i}`}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-center gap-3 px-3 py-2.5 border rounded-md bg-gray-50 hover:bg-blue-50 hover:border-blue-200 transition-colors"
                        >
                          <Icon className="w-5 h-5 text-gray-400 group-hover:text-blue-500 shrink-0" />
                          <span className="truncate flex-1 text-sm text-gray-700 group-hover:text-blue-700 font-medium">
                            {att.filename}
                          </span>
                          <span className="text-xs text-gray-400 shrink-0">{formatFileSize(att.size)}</span>
                          <Download className="w-4 h-4 text-gray-300 group-hover:text-blue-500 shrink-0" />
                        </a>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* No stored URLs yet — offer backfill */
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-2">
                <p className="text-sm text-amber-800">
                  Vedhæftningerne er ikke downloadet endnu.
                </p>
                <button
                  onClick={handleBackfill}
                  disabled={isBackfilling}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50"
                >
                  {isBackfilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {isBackfilling ? 'Downloader...' : 'Download vedhæftninger nu'}
                </button>
                {backfillMsg && (
                  <p className={`text-sm ${backfillMsg.startsWith('Fejl') ? 'text-red-600' : 'text-green-700'}`}>{backfillMsg}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center">
            <div className="flex items-center justify-between w-full mb-2 px-1">
              <span className="text-sm text-white/80 truncate max-w-[60%]">{lightboxName}</span>
              <div className="flex items-center gap-2">
                <a href={lightboxUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-full bg-white/10 hover:bg-white/20" title="Download">
                  <Download className="w-4 h-4 text-white" />
                </a>
                <button onClick={() => setLightboxUrl(null)} className="p-1.5 rounded-full bg-white/10 hover:bg-white/20" title="Luk">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightboxUrl} alt={lightboxName} className="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain" />
          </div>
        </div>
      )}
    </div>
  )
}
