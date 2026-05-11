'use client'

/**
 * Sprint 8F — Attachment Picker.
 *
 * Genbrugelig komponent til mail-reply og task-mail-dialog.
 * Lader brugeren vælge filer, validere klient-side, uploade via
 * uploadOutboundAttachmentsAction og holde liste af uploaded
 * customer_documents-IDs som parent kan sende videre til
 * sendQuickReply / sendTaskEmail.
 *
 * Filer uploades FØR Send. Når brugeren trykker Send sendes blot IDs.
 * Hvis brugeren fortryder en upload, kaldes deleteOutboundAttachmentAction.
 */

import { useRef, useState } from 'react'
import { Paperclip, X, Loader2, AlertCircle, FileText } from 'lucide-react'
import {
  uploadOutboundAttachmentsAction,
  deleteOutboundAttachmentAction,
} from '@/lib/actions/outbound-attachments'
import {
  MAX_OUTBOUND_FILE_BYTES,
  MAX_OUTBOUND_TOTAL_BYTES,
  MAX_OUTBOUND_FILES,
  ALLOWED_OUTBOUND_MIME_TYPES,
  ALLOWED_OUTBOUND_EXTENSIONS,
  BLOCKED_OUTBOUND_EXTENSIONS,
} from '@/lib/services/outbound-attachments'

export interface PickerAttachment {
  document_id: string
  file_name: string
  mime_type: string
  size: number
}

interface AttachmentPickerProps {
  customerId: string | null
  serviceCaseId?: string | null
  /** Disabled fra parent (fx mens mail sendes). */
  disabled?: boolean
  /** Aktuelle vedhæftninger. Parent ejer state — vi kalder onChange. */
  attachments: PickerAttachment[]
  onChange: (next: PickerAttachment[]) => void
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function extensionOf(filename: string): string {
  const lower = filename.toLowerCase()
  const idx = lower.lastIndexOf('.')
  return idx >= 0 && idx < lower.length - 1 ? lower.substring(idx + 1) : ''
}

/** Klient-side validering — server validerer igen for sikkerhed. */
function validateClientFile(file: File): { ok: boolean; error?: string } {
  if (file.size > MAX_OUTBOUND_FILE_BYTES) {
    return {
      ok: false,
      error: `"${file.name}" er for stor (max ${Math.round(MAX_OUTBOUND_FILE_BYTES / 1024 / 1024)} MB pr. fil)`,
    }
  }
  if (file.size <= 0) {
    return { ok: false, error: `"${file.name}" er tom` }
  }
  const ext = extensionOf(file.name)
  if (BLOCKED_OUTBOUND_EXTENSIONS.has(ext)) {
    return { ok: false, error: `Filtypen .${ext} er blokeret af sikkerhedshensyn` }
  }
  if (!ALLOWED_OUTBOUND_EXTENSIONS.has(ext)) {
    return { ok: false, error: `Filtypen .${ext || '(ukendt)'} er ikke tilladt` }
  }
  if (!ALLOWED_OUTBOUND_MIME_TYPES.has(file.type)) {
    return {
      ok: false,
      error: `MIME-typen ${file.type || '(ukendt)'} er ikke tilladt for "${file.name}"`,
    }
  }
  return { ok: true }
}

export function AttachmentPicker({
  customerId,
  serviceCaseId,
  disabled = false,
  attachments,
  onChange,
}: AttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const totalBytes = attachments.reduce((s, a) => s + a.size, 0)
  const remainingFiles = MAX_OUTBOUND_FILES - attachments.length
  const remainingBytes = MAX_OUTBOUND_TOTAL_BYTES - totalBytes

  const acceptAttribute = Array.from(ALLOWED_OUTBOUND_EXTENSIONS)
    .map((e) => `.${e}`)
    .join(',')

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError(null)

    if (!customerId) {
      setError('Mail er ikke koblet til en kunde — kan ikke vedhæfte filer')
      return
    }

    const arr = Array.from(files)

    // Antal-tjek
    if (arr.length > remainingFiles) {
      setError(`Max ${MAX_OUTBOUND_FILES} filer pr. mail (${remainingFiles} plads tilbage)`)
      return
    }

    // Per-fil + total validering
    let runningTotal = totalBytes
    for (const f of arr) {
      const v = validateClientFile(f)
      if (!v.ok) {
        setError(v.error || 'Ugyldig fil')
        return
      }
      runningTotal += f.size
      if (runningTotal > MAX_OUTBOUND_TOTAL_BYTES) {
        setError(
          `Samlet størrelse overskrider ${Math.round(MAX_OUTBOUND_TOTAL_BYTES / 1024 / 1024)} MB`
        )
        return
      }
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.set('customerId', customerId)
      if (serviceCaseId) formData.set('serviceCaseId', serviceCaseId)
      for (const f of arr) formData.append('files', f)

      const result = await uploadOutboundAttachmentsAction(formData)
      if (!result.success || !result.attachments) {
        setError(result.error || 'Upload fejlede')
        return
      }

      const newItems: PickerAttachment[] = result.attachments.map((a) => ({
        document_id: a.document_id,
        file_name: a.file_name,
        mime_type: a.mime_type,
        size: a.size,
      }))
      onChange([...attachments, ...newItems])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uventet fejl ved upload')
    } finally {
      setUploading(false)
      // Nulstil input så samme fil kan vælges igen efter sletning
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async (documentId: string) => {
    setError(null)
    setRemoving(documentId)
    try {
      // Optimistisk fjern fra liste — selv hvis server-delete fejler, er
      // brugerens intention klar. Filen kan ryddes op senere via cron.
      onChange(attachments.filter((a) => a.document_id !== documentId))
      await deleteOutboundAttachmentAction(documentId)
    } catch (err) {
      // Bevarer den optimistiske fjernelse — log kun fejl
      setError(err instanceof Error ? err.message : 'Sletning fejlede (filen er fjernet fra liste)')
    } finally {
      setRemoving(null)
    }
  }

  const noCustomer = !customerId
  const isBusy = uploading || removing !== null || disabled

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={acceptAttribute}
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
          disabled={isBusy || noCustomer || remainingFiles <= 0}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isBusy || noCustomer || remainingFiles <= 0}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border bg-gray-50 text-gray-700 border-gray-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
          title={
            noCustomer
              ? 'Kobl mailen til en kunde først'
              : remainingFiles <= 0
                ? `Max ${MAX_OUTBOUND_FILES} filer pr. mail`
                : 'Vedhæft filer (PDF, billeder, Word, Excel)'
          }
        >
          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
          Vedhæft filer
        </button>
        <span className="text-[11px] text-gray-500">
          {attachments.length}/{MAX_OUTBOUND_FILES} filer · {formatBytes(totalBytes)} /{' '}
          {formatBytes(MAX_OUTBOUND_TOTAL_BYTES)}
          {remainingBytes < 0 && <span className="text-red-600 font-medium ml-1">(for stor)</span>}
        </span>
      </div>

      {/* Filliste */}
      {attachments.length > 0 && (
        <ul className="space-y-1">
          {attachments.map((a) => (
            <li
              key={a.document_id}
              className="flex items-center gap-2 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-xs"
            >
              <FileText className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              <span className="font-medium text-gray-800 truncate flex-1" title={a.file_name}>
                {a.file_name}
              </span>
              <span className="text-gray-500 shrink-0">{formatBytes(a.size)}</span>
              <button
                type="button"
                onClick={() => handleRemove(a.document_id)}
                disabled={isBusy}
                className="p-0.5 text-gray-400 hover:text-red-600 disabled:opacity-50"
                aria-label={`Fjern ${a.file_name}`}
                title="Fjern fil"
              >
                {removing === a.document_id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <X className="w-3 h-3" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="text-xs text-red-600 flex items-start gap-1">
          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}
