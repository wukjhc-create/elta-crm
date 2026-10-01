'use client'

/**
 * Aflevering (N9a): afslutnings-tjekliste med fotos pr. punkt + kundens underskrift — på ordresiden, så montøren kan
 * afslutte på stedet. Samme data som Service-modulet. Adgang afgøres af serveren (kontor eller montør på egen sag).
 */
import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import { FileSignature, Loader2, ClipboardCheck } from 'lucide-react'
import { CompletionChecklist } from '@/components/shared/completion-checklist'
import { SignaturePad } from '@/components/shared/signature-pad'
import {
  getCaseHandoverAction, startCaseHandoverAction, toggleHandoverItemAction, uploadHandoverPhotoAction,
  deleteHandoverPhotoAction, signCaseHandoverAction, type CaseHandover,
} from '@/lib/actions/case-handover'

export function OrderHandoverTab({ caseId }: { caseId: string }) {
  const [data, setData] = useState<CaseHandover | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showSign, setShowSign] = useState(false)
  const [signerName, setSignerName] = useState('')

  const load = useCallback(async () => {
    const r = await getCaseHandoverAction(caseId)
    if (r.success && r.data) { setData(r.data); setError(null) } else setError(r.error ?? 'Kunne ikke hente aflevering')
  }, [caseId])
  useEffect(() => { load() }, [load])

  const run = async (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(true)
    const r = await fn()
    setBusy(false)
    if (!r.success) setError(r.error ?? 'Fejl')
    else setError(null)
    await load()
  }

  if (!data && !error) return <div className="bg-white rounded-lg border p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  if (!data) return <div className="bg-white rounded-lg border p-6 text-sm text-red-600">{error}</div>

  return (
    <div className="space-y-4" data-testid="order-handover-tab">
      {error && <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-800">{error}</div>}

      {data.checklist.length === 0 ? (
        <div className="bg-white rounded-lg border p-6 text-center">
          <ClipboardCheck className="w-8 h-8 mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-600 mb-3">Ingen afslutnings-tjekliste på sagen endnu.</p>
          {data.canEdit && (
            <button type="button" disabled={busy} onClick={() => run(() => startCaseHandoverAction(caseId))}
              className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50" data-testid="handover-start">
              Start aflevering
            </button>
          )}
        </div>
      ) : (
        <CompletionChecklist
          items={data.checklist}
          attachments={data.attachments}
          onToggle={async (key: string, completed: boolean) => { await run(() => toggleHandoverItemAction(caseId, key, completed)) }}
          onUpload={async (key: string, file: File) => {
            const fd = new FormData(); fd.append('file', file); fd.append('category', key)
            await run(() => uploadHandoverPhotoAction(caseId, fd))
          }}
          onDeleteAttachment={async (attachmentId: string) => { await run(() => deleteHandoverPhotoAction(caseId, attachmentId)) }}
          canClose={data.canClose}
          disabled={busy || !data.canEdit}
        />
      )}

      <div className="bg-white rounded-lg border p-5 space-y-4" data-testid="handover-signature">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
          <FileSignature className="w-4 h-4" /> Kundens underskrift ved aflevering
        </h2>
        {data.signature.image ? (
          <div className="space-y-2">
            <div className="border rounded-lg p-4 bg-gray-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.signature.image} alt="Underskrift" className="max-h-32" />
            </div>
            <p className="text-sm text-gray-600">
              Underskrevet af <strong>{data.signature.name}</strong>
              {data.signature.signed_at ? ` · ${format(new Date(data.signature.signed_at), 'd. MMMM yyyy HH:mm', { locale: da })}` : ''}
            </p>
          </div>
        ) : !data.canEdit ? (
          <p className="text-sm text-gray-500">Ikke underskrevet endnu.</p>
        ) : showSign ? (
          <SignaturePad
            onSign={(dataUrl) => run(() => signCaseHandoverAction(caseId, dataUrl, signerName)).then(() => setShowSign(false))}
            signerName={signerName}
            onNameChange={setSignerName}
            disabled={busy}
          />
        ) : (
          <button type="button" onClick={() => setShowSign(true)}
            className="inline-flex items-center gap-2 px-4 py-3 border-2 border-dashed rounded-lg text-sm text-gray-600 hover:bg-gray-50 w-full justify-center" data-testid="handover-open-signature">
            <FileSignature className="w-4 h-4" /> Åbn signaturfelt
          </button>
        )}
        <p className="text-[11px] text-gray-400">Underskriften lukker ikke sagen — kontoret lukker den, når alt er afleveret.</p>
      </div>
    </div>
  )
}
