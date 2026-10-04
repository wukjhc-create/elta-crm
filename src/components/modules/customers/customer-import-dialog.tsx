'use client'

/**
 * N60: importér kunder fra CSV — vælg fil → forhåndsvisning (nye / dubletter / ugyldige, kolonne-mapping) → importér
 * kun nye. Serveren genparser og genvaliderer filen ved import (forhåndsvisningen er kun til visning).
 */
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Upload, X } from 'lucide-react'
import { importCustomersAction, previewCustomerImportAction, type CustomerImportPreview } from '@/lib/actions/customer-import'

const FIELD_LABEL: Record<string, string> = {
  company_name: 'Firmanavn', contact_person: 'Kontaktperson', email: 'E-mail', phone: 'Telefon', mobile: 'Mobil', vat_number: 'CVR',
  billing_address: 'Adresse', billing_postal_code: 'Postnr.', billing_city: 'By', external_number: 'Tidl. kundenr.', notes: 'Note',
}

async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf)
  // e-conomic/Excel-eksport er ofte Windows-1252: æøå bliver til "�" i UTF-8 → prøv igen som latin1
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf8
}

export function CustomerImportDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [text, setText] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<CustomerImportPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ created: number; skipped: number; failed: number } | null>(null)

  const pick = async (file?: File) => {
    if (!file) return
    setError(null); setPreview(null); setResult(null); setBusy(true)
    const t = await readText(file)
    setText(t); setFileName(file.name)
    const res = await previewCustomerImportAction(t)
    setBusy(false)
    if (!res.success || !res.data) { setError(res.error ?? 'Kunne ikke læse filen'); return }
    setPreview(res.data)
  }

  const doImport = async () => {
    if (!text) return
    setBusy(true); setError(null)
    const res = await importCustomersAction(text)
    setBusy(false)
    if (!res.success || !res.data) { setError(res.error ?? 'Import fejlede'); return }
    setResult(res.data)
    router.refresh()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-labelledby="customer-import-title">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="customer-import-dialog">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 id="customer-import-title" className="text-lg font-semibold">Importér kunder fra CSV</h2>
          <button type="button" onClick={onClose} aria-label="Luk" className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            Fx en eksport fra e-conomic eller et regneark. Kræver kolonner for <strong>firmanavn</strong> og <strong>e-mail</strong>;
            kontaktperson, telefon, CVR, adresse, postnr., by og kundenr. bruges hvis de findes. Kunder der allerede findes (samme
            e-mail, CVR eller telefon) springes over.
          </p>
          <div className="flex items-center gap-3">
            <input ref={input} type="file" accept=".csv,text/csv,text/plain" className="hidden" data-testid="customer-import-input" onChange={(e) => void pick(e.target.files?.[0])} />
            <button type="button" onClick={() => input.current?.click()} disabled={busy}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50">
              <Upload className="w-4 h-4" /> Vælg CSV-fil
            </button>
            {fileName && <span className="text-sm text-gray-600 truncate">{fileName}</span>}
            {busy && <Loader2 className="w-4 h-4 animate-spin text-gray-500" />}
          </div>
          {error && <p className="text-sm text-red-700" data-testid="customer-import-error">{error}</p>}

          {preview && !result && (
            <>
              <div className="grid grid-cols-3 gap-3 text-center text-sm" data-testid="customer-import-counts">
                <div className="rounded-md bg-emerald-50 ring-1 ring-emerald-200 p-2"><div className="text-xl font-semibold text-emerald-800" data-testid="import-count-new">{preview.counts.new}</div>nye</div>
                <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 p-2"><div className="text-xl font-semibold text-amber-800" data-testid="import-count-duplicate">{preview.counts.duplicate}</div>findes allerede</div>
                <div className="rounded-md bg-red-50 ring-1 ring-red-200 p-2"><div className="text-xl font-semibold text-red-800" data-testid="import-count-invalid">{preview.counts.invalid}</div>ugyldige</div>
              </div>
              <p className="text-xs text-gray-500">
                Kolonner: {Object.entries(preview.mapped).map(([f, h]) => `${h} → ${FIELD_LABEL[f] ?? f}`).join(' · ')}
                {preview.unmapped.length > 0 && <> · ignoreres: {preview.unmapped.join(', ')}</>}
              </p>
              <div className="max-h-64 overflow-y-auto ring-1 ring-gray-200 rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500 sticky top-0">
                    <tr><th className="px-2 py-1 text-left">Linje</th><th className="px-2 py-1 text-left">Firmanavn</th><th className="px-2 py-1 text-left">E-mail</th><th className="px-2 py-1 text-left">Status</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.rows.map((r) => (
                      <tr key={r.line} data-testid="customer-import-row" data-status={r.status}>
                        <td className="px-2 py-1 tabular-nums">{r.line}</td>
                        <td className="px-2 py-1">{r.company_name || '—'}</td>
                        <td className="px-2 py-1">{r.email || '—'}</td>
                        <td className={`px-2 py-1 ${r.status === 'new' ? 'text-emerald-700' : r.status === 'duplicate' ? 'text-amber-700' : 'text-red-700'}`}>
                          {r.status === 'new' ? 'Ny' : r.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="px-3 py-2 text-sm rounded-md border hover:bg-gray-50">Annullér</button>
                <button type="button" onClick={() => void doImport()} disabled={busy || preview.counts.new === 0} data-testid="customer-import-confirm"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  Importér {preview.counts.new} nye kunder
                </button>
              </div>
            </>
          )}

          {result && (
            <div className="rounded-md bg-emerald-50 ring-1 ring-emerald-200 p-3 text-sm text-emerald-900" data-testid="customer-import-result">
              {result.created} kunder oprettet · {result.skipped} sprunget over{result.failed ? ` · ${result.failed} fejlede` : ''}.
              <div className="mt-2"><button type="button" onClick={onClose} className="text-emerald-800 underline">Luk</button></div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
