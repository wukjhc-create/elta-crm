'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  setServiceCaseStatus,
  markServiceCaseDone,
  setServiceCaseLowProfit,
  setServiceCaseAutoInvoice,
} from '@/lib/actions/service-cases'
import {
  SERVICE_CASE_STATUSES,
  SERVICE_CASE_STATUS_LABELS,
  type ServiceCaseStatus,
  type ServiceCaseWithRelations,
} from '@/types/service-cases.types'

export function OrderActionsTab({ sag }: { sag: ServiceCaseWithRelations }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [nextStatus, setNextStatus] = useState<ServiceCaseStatus>(sag.status)
  const [statusNote, setStatusNote] = useState<string>('')

  const flash = (msg: string) => {
    setInfo(msg)
    setError(null)
    setTimeout(() => setInfo(null), 2500)
  }

  const handleError = (msg: string) => {
    setError(msg)
    setInfo(null)
  }

  const refreshAfter = () => {
    startTransition(() => {
      router.refresh()
    })
  }

  const onChangeStatus = async () => {
    if (nextStatus === sag.status && !statusNote.trim()) {
      handleError('Vælg en anden status, eller skriv en note.')
      return
    }
    const res = await setServiceCaseStatus(sag.id, nextStatus, statusNote.trim() || null)
    if (!res.success) {
      handleError(res.error || 'Kunne ikke ændre status')
      return
    }
    setStatusNote('')
    flash(`Status sat til "${SERVICE_CASE_STATUS_LABELS[nextStatus]}"`)
    refreshAfter()
  }

  const onMarkDone = async () => {
    const res = await markServiceCaseDone(sag.id)
    if (!res.success) {
      handleError(res.error || 'Kunne ikke afslutte sag')
      return
    }
    flash('Sag markeret som afsluttet')
    refreshAfter()
  }

  const onToggleLowProfit = async () => {
    const next = !sag.low_profit
    const res = await setServiceCaseLowProfit(sag.id, next)
    if (!res.success) {
      handleError(res.error || 'Kunne ikke opdatere "Lav DB"')
      return
    }
    flash(`Lav DB sat til ${next ? 'JA' : 'nej'}`)
    refreshAfter()
  }

  const onToggleAutoInvoice = async () => {
    const next = !sag.auto_invoice_on_done
    const res = await setServiceCaseAutoInvoice(sag.id, next)
    if (!res.success) {
      handleError(res.error || 'Kunne ikke opdatere auto-faktura')
      return
    }
    flash(`Auto-faktura sat til ${next ? 'JA' : 'nej'}`)
    refreshAfter()
  }

  const isClosed = sag.status === 'closed'

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-md bg-emerald-50 ring-1 ring-emerald-200 px-3 py-2 text-sm text-emerald-900">
          {info}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status change */}
        <ActionCard
          title="Skift status"
          description="Vælg ny status og tilføj evt. en kort note som gemmes på sagen."
        >
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={nextStatus}
                onChange={(e) => setNextStatus(e.target.value as ServiceCaseStatus)}
                disabled={isPending}
                className="w-full px-3 py-2 border rounded-md bg-white"
              >
                {SERVICE_CASE_STATUSES.map((s) => (
                  <option key={s} value={s}>{SERVICE_CASE_STATUS_LABELS[s]}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={onChangeStatus}
                disabled={isPending}
                className="px-3 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                {isPending ? 'Gemmer…' : 'Gem status'}
              </button>
            </div>
            <input
              type="text"
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              placeholder="Note (valgfri)"
              disabled={isPending}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
          </div>
        </ActionCard>

        {/* Mark done */}
        <ActionCard
          title="Markér som afsluttet"
          description="Sætter status til 'Lukket' og udfylder closed_at."
        >
          <button
            type="button"
            onClick={onMarkDone}
            disabled={isPending || isClosed}
            className="px-3 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
          >
            {isClosed ? 'Allerede afsluttet' : 'Markér afsluttet'}
          </button>
        </ActionCard>

        {/* Low profit */}
        <ActionCard
          title="Lav DB (lav dækningsbidrag)"
          description="Markér sagen som lav-margin så den dukker op i økonomi-overblikket."
        >
          <ToggleRow
            label="Lav DB markeret"
            value={sag.low_profit}
            disabled={isPending}
            onToggle={onToggleLowProfit}
          />
        </ActionCard>

        {/* Auto invoice */}
        <ActionCard
          title="Auto-faktura ved afsluttet"
          description="Hvis aktiveret, opretter systemet automatisk en fakturakladde når sagen markeres afsluttet."
        >
          <ToggleRow
            label="Auto-faktura aktiv"
            value={sag.auto_invoice_on_done}
            disabled={isPending}
            onToggle={onToggleAutoInvoice}
          />
        </ActionCard>
      </div>
    </div>
  )
}

function ActionCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-gray-50 rounded ring-1 ring-gray-200 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-gray-500 mt-1">{description}</p>
      </div>
      {children}
    </div>
  )
}

function ToggleRow({
  label,
  value,
  onToggle,
  disabled,
}: {
  label: string
  value: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">
        {label}: <strong>{value ? 'JA' : 'nej'}</strong>
      </span>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={`px-3 py-1.5 rounded-md text-sm ${
          value
            ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
            : 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
        } disabled:opacity-50`}
      >
        {value ? 'Slå fra' : 'Slå til'}
      </button>
    </div>
  )
}
