'use client'

/**
 * Phase B1 — status-pille + expander-liste for document_confirmations
 * paa en besigtigelsesrapport-raekke.
 *
 * Defensiv: hvis listConfirmationsForDocument fejler eller returnerer
 * tomt, vises INGENTING. Dokumentlisten i parent crasher aldrig pga.
 * confirmation-state.
 */

import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Ban,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react'
import { listConfirmationsForDocument } from '@/lib/actions/document-confirmations'
import { sendReadyChainStep } from '@/lib/actions/besigtigelse'
import { useToast } from '@/components/ui/toast'
import {
  RECIPIENT_ROLE_LABELS,
  type ConfirmationListItem,
} from '@/types/document-confirmations.types'

interface Props {
  documentId: string
  /** Trigger refresh fra parent ved en counter-aendring (fx efter send) */
  refreshKey?: number
}

interface AggregateStatus {
  total: number
  confirmed: number
  pendingActive: number    // sent/opened, not expired, not revoked
  expired: number
  revoked: number
  failed: number
}

function aggregate(items: ConfirmationListItem[]): AggregateStatus {
  const agg: AggregateStatus = {
    total: items.length,
    confirmed: 0,
    pendingActive: 0,
    expired: 0,
    revoked: 0,
    failed: 0,
  }
  for (const it of items) {
    if (it.status === 'confirmed') agg.confirmed++
    else if (it.status === 'revoked') agg.revoked++
    else if (it.status === 'failed') agg.failed++
    else if (it.isExpired) agg.expired++
    else if (it.status === 'sent' || it.status === 'opened' || it.status === 'pending') agg.pendingActive++
  }
  return agg
}

function pillFor(agg: AggregateStatus): {
  label: string
  bg: string
  text: string
  icon: React.ReactNode
} | null {
  if (agg.total === 0) return null

  if (agg.failed > 0 && agg.confirmed === 0 && agg.pendingActive === 0) {
    return {
      label: `Mail fejlede${agg.total > 1 ? ` (${agg.failed}/${agg.total})` : ''}`,
      bg: 'bg-red-50 border-red-200',
      text: 'text-red-700',
      icon: <AlertCircle className="w-3.5 h-3.5" />,
    }
  }
  if (agg.confirmed === agg.total) {
    return {
      label: agg.total === 1 ? 'Bekræftet' : `Bekræftet ${agg.confirmed}/${agg.total}`,
      bg: 'bg-green-50 border-green-200',
      text: 'text-green-700',
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    }
  }
  if (agg.pendingActive > 0) {
    return {
      label: `Afventer ${agg.confirmed}/${agg.total}`,
      bg: 'bg-amber-50 border-amber-200',
      text: 'text-amber-800',
      icon: <Clock className="w-3.5 h-3.5" />,
    }
  }
  if (agg.expired > 0) {
    return {
      label: `Udløbet ${agg.confirmed}/${agg.total}`,
      bg: 'bg-gray-100 border-gray-200',
      text: 'text-gray-700',
      icon: <Clock className="w-3.5 h-3.5" />,
    }
  }
  if (agg.revoked === agg.total) {
    return {
      label: 'Trukket tilbage',
      bg: 'bg-gray-100 border-gray-200',
      text: 'text-gray-700',
      icon: <Ban className="w-3.5 h-3.5" />,
    }
  }
  // Blandet (fx nogle confirmed, nogle revoked)
  return {
    label: `Bekræftet ${agg.confirmed}/${agg.total}`,
    bg: 'bg-gray-100 border-gray-200',
    text: 'text-gray-700',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  }
}

export function DocumentConfirmationStatus({ documentId, refreshKey = 0 }: Props) {
  const [items, setItems] = useState<ConfirmationListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  // Fase 2a — lokal refresh efter "send videre" uden at parent skal involveres.
  const [localRefresh, setLocalRefresh] = useState(0)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setHasError(false)
    listConfirmationsForDocument(documentId)
      .then((result) => {
        if (cancelled) return
        if (result.success && result.data) {
          setItems(result.data)
        } else {
          // Stille fejl — vis ingen pille
          setHasError(true)
          setItems([])
        }
      })
      .catch(() => {
        if (cancelled) return
        setHasError(true)
        setItems([])
      })
      .finally(() => {
        if (cancelled) return
        setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [documentId, refreshKey, localRefresh])

  // Defensiv: ved fejl eller ingen confirmations vises ingenting
  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
        <Loader2 className="w-3 h-3 animate-spin" />
      </span>
    )
  }
  if (hasError || items.length === 0) return null

  const agg = aggregate(items)
  const pill = pillFor(agg)
  if (!pill) return null

  return (
    <div className="w-full">
      <button
        onClick={() => setIsExpanded((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border ${pill.bg} ${pill.text} hover:brightness-95 active:scale-95 transition-transform`}
        aria-expanded={isExpanded}
        aria-label="Vis modtager-status"
        type="button"
      >
        {pill.icon}
        {pill.label}
        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {isExpanded && (
        <div className="mt-2 bg-white border rounded-lg divide-y">
          {items.map((it) => (
            <RecipientRow key={it.id} item={it} onSent={() => setLocalRefresh((v) => v + 1)} />
          ))}
        </div>
      )}
    </div>
  )
}

function RecipientRow({ item, onSent }: { item: ConfirmationListItem; onSent?: () => void }) {
  const roleLabel = RECIPIENT_ROLE_LABELS[item.recipientRole] || 'Modtager'
  const statusBadge = statusBadgeFor(item)
  const toast = useToast()
  const [isSending, setIsSending] = useState(false)

  // Fase 2a — trin frigivet til manuelt videresend (kunden har godkendt forrige trin).
  const canSendNext = item.status === 'pending' && item.readyToSend

  const handleSendNext = async () => {
    setIsSending(true)
    try {
      const res = await sendReadyChainStep(item.id)
      if (res.success && res.data) {
        toast.success(`Sendt videre til ${res.data.sentTo}`)
        onSent?.()
      } else {
        toast.error('Kunne ikke sende videre', res.error)
      }
    } catch {
      toast.error('Kunne ikke sende videre')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">
            {item.recipientName || item.recipientEmail}
          </p>
          {item.recipientName && (
            <p className="text-xs text-gray-500 truncate">{item.recipientEmail}</p>
          )}
          <p className="text-xs text-gray-500 mt-0.5">{roleLabel}</p>
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded ${statusBadge.bg} ${statusBadge.text} text-[11px] font-medium`}
        >
          {canSendNext ? 'Klar til at sende' : statusBadge.label}
        </span>
      </div>

      {canSendNext && (
        <div className="mt-2 rounded-md border border-green-200 bg-green-50 p-2">
          <p className="text-[11px] text-green-800 mb-1.5">
            Kunden har godkendt. Send rapporten videre til denne part, når du er klar.
          </p>
          <button
            type="button"
            onClick={handleSendNext}
            disabled={isSending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-600 text-white text-[11px] font-semibold hover:bg-green-700 disabled:opacity-50"
          >
            {isSending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            Send videre til partner
          </button>
        </div>
      )}

      <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-gray-600">
        {item.mailSentAt && (
          <KV label="Mail sendt" value={formatDateTime(item.mailSentAt)} />
        )}
        {item.firstOpenedAt && (
          <KV
            label={item.openCount > 1 ? `Åbnet (${item.openCount} gange)` : 'Åbnet'}
            value={formatDateTime(item.firstOpenedAt)}
          />
        )}
        {item.confirmedAt && (
          <KV label="Bekræftet" value={formatDateTime(item.confirmedAt)} />
        )}
        {item.confirmedAt && item.confirmedByName && (
          <KV
            label="Af"
            value={`${item.confirmedByName}${
              item.confirmedByEmail ? ` (${item.confirmedByEmail})` : ''
            }`}
          />
        )}
        {item.revokedAt && (
          <KV label="Trukket tilbage" value={formatDateTime(item.revokedAt)} />
        )}
        {!item.confirmedAt && !item.revokedAt && (
          <KV
            label={item.isExpired ? 'Udløbet' : 'Udløber'}
            value={formatDate(item.expiresAt)}
            valueClass={item.isExpired ? 'text-gray-500 line-through' : ''}
          />
        )}
        {item.mailError && (
          <div className="sm:col-span-2">
            <dt className="text-[11px] font-semibold text-red-600 uppercase tracking-wider">
              Mail-fejl
            </dt>
            <dd className="text-[11px] text-red-700">{item.mailError}</dd>
          </div>
        )}
        {item.confirmationNote && (
          <div className="sm:col-span-2 mt-1">
            <dt className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Bemærkning
            </dt>
            <dd className="text-[11px] text-gray-700 whitespace-pre-wrap">
              {item.confirmationNote}
            </dd>
          </div>
        )}
        {item.revokedReason && (
          <div className="sm:col-span-2 mt-1">
            <dt className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Årsag til annullering
            </dt>
            <dd className="text-[11px] text-gray-700">{item.revokedReason}</dd>
          </div>
        )}
      </dl>
    </div>
  )
}

function statusBadgeFor(item: ConfirmationListItem): {
  label: string
  bg: string
  text: string
} {
  if (item.status === 'confirmed') {
    return { label: 'Bekræftet', bg: 'bg-green-100', text: 'text-green-700' }
  }
  if (item.status === 'revoked') {
    return { label: 'Trukket tilbage', bg: 'bg-gray-200', text: 'text-gray-700' }
  }
  if (item.status === 'failed') {
    return { label: 'Mail fejlede', bg: 'bg-red-100', text: 'text-red-700' }
  }
  if (item.isExpired) {
    return { label: 'Udløbet', bg: 'bg-gray-200', text: 'text-gray-700' }
  }
  if (item.status === 'opened') {
    return { label: 'Åbnet', bg: 'bg-blue-100', text: 'text-blue-700' }
  }
  if (item.status === 'sent') {
    return { label: 'Sendt', bg: 'bg-amber-100', text: 'text-amber-800' }
  }
  // 'pending'
  return { label: 'Afventer', bg: 'bg-gray-100', text: 'text-gray-600' }
}

function KV({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <dt className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider shrink-0">
        {label}:
      </dt>
      <dd className={`text-[11px] text-gray-700 truncate ${valueClass ?? ''}`}>{value}</dd>
    </div>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('da-DK', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    return ''
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('da-DK', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}
