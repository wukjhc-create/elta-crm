'use client'

/**
 * Trin 1 — besigtigelse FRA sagen ("sagen som omdrejningspunkt").
 *
 * Renderer den eksisterende BesigtigelsesNotat-komponent med sagen
 * forudvalgt og LÅST (lockCase), så montøren ikke skal vælge sag: sagen
 * er konteksten. Parterne (underskriver=anlægsejer, leveringsadresse,
 * betaler) auto-resolves fra sagens parter via komponentens egen
 * getCaseSignerSummary-opslag.
 *
 * BesigtigelsesNotat kræver et fuldt CustomerWithRelations-objekt (læser
 * bl.a. adresse + mobil), men sagens indlejrede customer-join er smal
 * (kun id/navn/kontakt/email/telefon). Derfor henter vi den fulde
 * primær-kunde her via getCustomer. Dokumentet forankres på sagens
 * primære customer_id (låst beslutning); signer/adresse styres af sagen.
 */

import { useCallback, useEffect, useState } from 'react'
import { Loader2, AlertTriangle, FileSignature, FileText, Send } from 'lucide-react'
import { getCustomer } from '@/lib/actions/customers'
import type { CustomerWithRelations } from '@/types/customers.types'
import { getDocumentsForCase, type CaseDocument } from '@/lib/actions/service-cases'
import { BesigtigelsesNotat } from '@/components/modules/customers/besigtigelse-notat'
import { FuldmagtModal } from '@/components/modules/customers/fuldmagt-modal'
import { SendBesigtigelsesreportDialog } from '@/components/modules/customers/send-besigtigelsesreport-dialog'

/** Er dokumentet en besigtigelsesrapport? (spejler isBesigtigelseDocument serverside) */
function isBesigtigelseReport(d: CaseDocument): boolean {
  if (d.document_type === 'besigtigelse') return true
  return d.document_type === 'other' && (d.title || '').toLowerCase().includes('besigtigelse')
}

export function OrderInspectionTab({
  caseId,
  customerId,
}: {
  caseId: string
  customerId: string | null
}) {
  const [customer, setCustomer] = useState<CustomerWithRelations | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showFuldmagt, setShowFuldmagt] = useState(false)
  const [reports, setReports] = useState<CaseDocument[]>([])
  const [sendDoc, setSendDoc] = useState<CaseDocument | null>(null)

  // Sagens besigtigelsesrapporter → "Send rapport" pr. rapport (Dialog B).
  const loadReports = useCallback(() => {
    let active = true
    getDocumentsForCase(caseId).then((docs) => {
      if (active) setReports(docs.filter(isBesigtigelseReport))
    })
    return () => {
      active = false
    }
  }, [caseId])

  useEffect(() => loadReports(), [loadReports])

  useEffect(() => {
    if (!customerId) {
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    getCustomer(customerId)
      .then((res) => {
        if (!active) return
        if (res.success && res.data) setCustomer(res.data)
        else setError(res.error || 'Kunne ikke hente kunde')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [customerId])

  if (!customerId) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-medium">Sagen har ingen primær kunde.</p>
          <p className="mt-1">
            Knyt en kunde til sagen for at kunne oprette en besigtigelse herfra.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-12 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error || !customer) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-sm text-red-800">
        {error || 'Kunne ikke hente kunde'}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Trin 2 — fuldmagt fra sagen. createFuldmagt håndhæver serverside
          signer=end_customer + at anlægsejeren har aktivt portal-token. */}
      <div className="bg-white rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <FileSignature className="w-4 h-4 text-purple-600" /> Fuldmagt
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Opret en fuldmagt til sagens anlægsejer (slutkunde), som underskrives i portalen.
          </p>
        </div>
        <button
          onClick={() => setShowFuldmagt(true)}
          className="shrink-0 inline-flex items-center justify-center gap-2 px-4 min-h-[44px] bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
        >
          <FileSignature className="w-4 h-4" />
          Opret fuldmagt
        </button>
      </div>

      <BesigtigelsesNotat
        customer={customer}
        serviceCaseId={caseId}
        lockCase
        onSaved={() => loadReports()}
      />

      {/* Send rapport fra sagen — samme modtager-vælger som kundekortet
          (underskriver default, + kontaktperson på stedet + samarbejdspartner). */}
      {reports.length > 0 && (
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b flex items-center gap-2">
            <FileText className="w-4 h-4 text-green-600" />
            <h3 className="font-semibold text-sm text-gray-800">Besigtigelsesrapporter på sagen</h3>
            <span className="text-xs text-gray-400 ml-1">({reports.length})</span>
          </div>
          <div className="divide-y">
            {reports.map((doc) => (
              <div key={doc.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{doc.title || doc.file_name}</p>
                  <p className="text-xs text-gray-500 truncate">{doc.file_name}</p>
                </div>
                <button
                  onClick={() => setSendDoc(doc)}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 min-h-[40px] bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                >
                  <Send className="w-4 h-4" /> Send rapport
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showFuldmagt && (
        <FuldmagtModal
          customerId={customer.id}
          customerName={customer.company_name}
          serviceCaseId={caseId}
          lockCase
          onClose={() => setShowFuldmagt(false)}
        />
      )}

      {sendDoc && (
        <SendBesigtigelsesreportDialog
          isOpen
          documentId={sendDoc.id}
          documentTitle={sendDoc.title || sendDoc.file_name}
          documentFileName={sendDoc.file_name}
          documentCustomerId={customer.id}
          documentServiceCaseId={caseId}
          onClose={() => setSendDoc(null)}
          onSent={() => {
            setSendDoc(null)
            loadReports()
          }}
        />
      )}
    </div>
  )
}
