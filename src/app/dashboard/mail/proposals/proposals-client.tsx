'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { CheckCircle2, XCircle, FileText, Wrench, Mail, ArrowLeft, Loader2 } from 'lucide-react'
import {
  getProposals,
  promoteCaseProposal,
  promoteOfferProposal,
  rejectCaseProposal,
  rejectOfferProposal,
  type CaseProposal,
  type OfferProposal,
} from '@/lib/actions/proposals'
import { formatDate } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils/format'
import { useToast } from '@/components/ui/toast'

type TabKey = 'all' | 'cases' | 'offers'

export function ProposalsClient() {
  const [cases, setCases] = useState<CaseProposal[]>([])
  const [offers, setOffers] = useState<OfferProposal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const toast = useToast()

  const load = async () => {
    setLoading(true)
    const res = await getProposals()
    if (!res.success || !res.data) {
      setError(res.error || 'Kunne ikke hente forslag')
      setLoading(false)
      return
    }
    setCases(res.data.cases)
    setOffers(res.data.offers)
    setError(null)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const onPromoteCase = async (id: string) => {
    if (!confirm('Godkend dette sag-forslag? Den flyttes til den aktive sagsliste.')) return
    setBusyId(id)
    const res = await promoteCaseProposal(id)
    setBusyId(null)
    if (res.success) {
      toast.success('Sag godkendt')
      startTransition(load)
    } else {
      toast.error(res.error || 'Fejl')
    }
  }

  const onRejectCase = async (id: string) => {
    if (!confirm('Slet dette sag-forslag permanent?')) return
    setBusyId(id)
    const res = await rejectCaseProposal(id)
    setBusyId(null)
    if (res.success) {
      toast.success('Sag-forslag slettet')
      startTransition(load)
    } else {
      toast.error(res.error || 'Fejl')
    }
  }

  const onPromoteOffer = async (id: string) => {
    if (!confirm('Godkend dette tilbud-forslag? Det flyttes til den aktive tilbudsliste.')) return
    setBusyId(id)
    const res = await promoteOfferProposal(id)
    setBusyId(null)
    if (res.success) {
      toast.success('Tilbud godkendt')
      startTransition(load)
    } else {
      toast.error(res.error || 'Fejl')
    }
  }

  const onRejectOffer = async (id: string) => {
    if (!confirm('Slet dette tilbud-forslag permanent?')) return
    setBusyId(id)
    const res = await rejectOfferProposal(id)
    setBusyId(null)
    if (res.success) {
      toast.success('Tilbud-forslag slettet')
      startTransition(load)
    } else {
      toast.error(res.error || 'Fejl')
    }
  }

  const totalCount = cases.length + offers.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/dashboard/mail"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Tilbage til mail
          </Link>
          <h1 className="text-2xl font-bold mt-1">Forslag fra mails</h1>
          <p className="text-gray-500 text-sm">
            AI-genererede sag- og tilbudsforslag. Godkend for at flytte til aktive lister, eller afvis for at slette.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50"
          >
            Opdater
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(
          [
            { key: 'all', label: `Alle (${totalCount})` },
            { key: 'cases', label: `Sager (${cases.length})` },
            { key: 'offers', label: `Tilbud (${offers.length})` },
          ] as { key: TabKey; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-white border rounded-lg p-12 text-center text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          Indlæser forslag...
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && totalCount === 0 && (
        <div className="bg-white border rounded-lg p-12 text-center text-gray-500">
          <Mail className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="font-medium">Ingen forslag i øjeblikket</p>
          <p className="text-sm mt-1">
            Når AI/mail-flow genererer forslag, vil de dukke op her.
          </p>
        </div>
      )}

      {/* Cases */}
      {!loading && (tab === 'all' || tab === 'cases') && cases.length > 0 && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="px-6 py-3 border-b bg-gray-50 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-purple-600" />
            <h2 className="font-semibold">Sag-forslag ({cases.length})</h2>
          </div>
          <div className="divide-y">
            {cases.map((c) => (
              <div key={c.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                      <span className="font-mono">{c.case_number}</span>
                      <span className="px-2 py-0.5 rounded-full bg-gray-100">{c.priority}</span>
                      <span>{formatDate(c.created_at)}</span>
                    </div>
                    <p className="font-medium text-gray-900 line-clamp-1">{c.title}</p>
                    {c.customer_name && (
                      <p className="text-sm text-gray-600 mt-1">Kunde: {c.customer_name}</p>
                    )}
                    {c.description && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{c.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      disabled={busyId === c.id}
                      onClick={() => onPromoteCase(c.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Godkend
                    </button>
                    <button
                      disabled={busyId === c.id}
                      onClick={() => onRejectCase(c.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-red-200 text-red-700 rounded-md hover:bg-red-50 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      Afvis
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Offers */}
      {!loading && (tab === 'all' || tab === 'offers') && offers.length > 0 && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="px-6 py-3 border-b bg-gray-50 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            <h2 className="font-semibold">Tilbud-forslag ({offers.length})</h2>
          </div>
          <div className="divide-y">
            {offers.map((o) => (
              <div key={o.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                      <span className="font-mono">{o.offer_number}</span>
                      <span>{formatDate(o.created_at)}</span>
                    </div>
                    <p className="font-medium text-gray-900 line-clamp-1">{o.title}</p>
                    {o.customer_name && (
                      <p className="text-sm text-gray-600 mt-1">Kunde: {o.customer_name}</p>
                    )}
                    {o.description && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{o.description}</p>
                    )}
                    <p className="text-sm font-semibold text-gray-900 mt-1">
                      {formatCurrency(o.final_amount, 'DKK')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      disabled={busyId === o.id}
                      onClick={() => onPromoteOffer(o.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Godkend
                    </button>
                    <button
                      disabled={busyId === o.id}
                      onClick={() => onRejectOffer(o.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-red-200 text-red-700 rounded-md hover:bg-red-50 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      Afvis
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
