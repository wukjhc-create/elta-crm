'use client'

/**
 * Sprint Ø4.4 — Betalingsstatus-badge på kundekortets header.
 *
 * Viser med det samme om kunden skylder penge, har forfaldne fakturaer
 * og typisk betaler til tiden — uden at åbne Fakturaer-fanen.
 * Selvhentende via getCustomerPaymentHealthAction. Cost-free.
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, BadgeCheck, Clock, Receipt } from 'lucide-react'
import {
  getCustomerPaymentHealthAction,
  type CustomerPaymentHealthResult,
} from '@/lib/actions/invoices'
import { PAYMENT_STATUS_SKIN } from '@/lib/invoices/payment-health'
import { formatCurrency } from '@/lib/utils/format'

function kr(n: number): string {
  return formatCurrency(n, 'DKK', 0)
}

export function CustomerPaymentBadge({
  customerId,
  onOpenInvoices,
}: {
  customerId: string
  onOpenInvoices?: () => void
}) {
  const [res, setRes] = useState<CustomerPaymentHealthResult | null>(null)

  useEffect(() => {
    let cancelled = false
    getCustomerPaymentHealthAction(customerId).then((r) => {
      if (!cancelled) setRes(r)
    })
    return () => {
      cancelled = true
    }
  }, [customerId])

  // Skjul pænt hvis ingen adgang / endnu ikke hentet / fejl.
  if (!res || !res.permitted || !res.ok || !res.health) return null

  const h = res.health
  const skin = PAYMENT_STATUS_SKIN[h.status].cls

  // Penge-chip: forfaldne → rose, udestående → amber, ellers grøn.
  const money =
    h.overdue_count > 0
      ? {
          cls: 'bg-rose-100 text-rose-800 ring-rose-200',
          icon: <AlertTriangle className="w-3 h-3" />,
          text: `${h.overdue_count} forfalden${h.overdue_count === 1 ? '' : 'e'} · ${kr(h.overdue_total)}`,
        }
      : h.outstanding_total > 0
        ? {
            cls: 'bg-amber-100 text-amber-800 ring-amber-200',
            icon: <Receipt className="w-3 h-3" />,
            text: `Udestående ${kr(h.outstanding_total)}`,
          }
        : {
            cls: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
            icon: <BadgeCheck className="w-3 h-3" />,
            text: 'Ingen udestående',
          }

  // Adfærd-chip kun når der er betalingshistorik (on_time / late_payer).
  const showBehavior = h.status === 'on_time' || h.status === 'late_payer'
  const Wrapper: React.ElementType = onOpenInvoices ? 'button' : 'span'

  return (
    <Wrapper
      type={onOpenInvoices ? 'button' : undefined}
      onClick={onOpenInvoices}
      title={h.human_summary}
      className="inline-flex items-center gap-1.5"
    >
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ${money.cls}`}
      >
        {money.icon}
        {money.text}
      </span>
      {showBehavior && (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ${skin}`}
        >
          <Clock className="w-3 h-3" />
          {h.human_label}
        </span>
      )}
    </Wrapper>
  )
}
