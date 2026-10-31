/**
 * Opkaldskort til CRM. Viser match og foreslåede handlinger.
 * Click-to-call og SMS er altid slået fra i selve kortet: udbyderen ringer ikke.
 * Flere kunder er tvetydigt — kortet vælger ikke en af dem.
 */
import type { CallerLookup } from '@/lib/integrations/relatel/lookup'
import { formatPhoneForDisplay } from '@/lib/integrations/relatel/phone'
import { RELATEL_FLAG_OFF } from './flags'

export type CallMatchStatus = 'invalid' | 'none' | 'lead' | 'unique' | 'ambiguous'

export interface CallCardAction {
  id: 'open_customer' | 'open_case' | 'open_lead' | 'create_callback' | 'add_note' | 'click_to_call' | 'send_sms'
  label: string
  enabled: boolean
  blockedReason: string | null
  href: string | null
  /** Skrivende handlinger kræver et ekstra tryk i UI. Eksterne kald er aldrig enabled. */
  requiresConfirmation: boolean
}

export interface CallCard {
  number: string | null
  displayNumber: string | null
  matchStatus: CallMatchStatus
  reason: string
  customerId: string | null
  customerLabel: string | null
  matches: CallerLookup['matches']
  openCases: CallerLookup['openCases']
  actions: CallCardAction[]
}

function blocked(id: CallCardAction['id'], label: string, reason: string): CallCardAction {
  return { id, label, enabled: false, blockedReason: reason, href: null, requiresConfirmation: true }
}

export function buildCallCard(
  lookup: CallerLookup,
  flags: { liveCall: boolean; sms: boolean },
): CallCard {
  const displayNumber = lookup.number ? formatPhoneForDisplay(lookup.number) : null
  const customerIds = [...new Set(lookup.matches.map((m) => m.customer_id).filter(Boolean) as string[])]
  const base = { number: lookup.number, displayNumber, matches: lookup.matches, openCases: lookup.openCases }

  if (!lookup.number) {
    return {
      ...base,
      matchStatus: 'invalid',
      reason: 'Nummeret kan ikke bruges.',
      customerId: null,
      customerLabel: null,
      actions: [],
    }
  }

  const callReason = flags.liveCall ? RELATEL_FLAG_OFF.noClient : RELATEL_FLAG_OFF.liveCall
  const smsReason = flags.sms ? RELATEL_FLAG_OFF.noClient : RELATEL_FLAG_OFF.sms
  const external = [
    blocked('click_to_call', 'Ring op', callReason),
    blocked('send_sms', 'Send SMS', smsReason),
  ]

  if (customerIds.length > 1) {
    return {
      ...base,
      matchStatus: 'ambiguous',
      reason: `${customerIds.length} kunder har nummeret. Vælg en — CRM gætter ikke.`,
      customerId: null,
      customerLabel: null,
      actions: external,
    }
  }

  if (customerIds.length === 1) {
    const customerId = customerIds[0]
    const label = lookup.matches.find((m) => m.customer_id === customerId)?.label ?? 'Kunde'
    const caseHref = lookup.openCases.find((c) => c.customer_id === customerId)
    return {
      ...base,
      matchStatus: 'unique',
      reason: lookup.matches.length > 1
        ? 'Nummeret peger på én kunde (flere rækker, samme kunde).'
        : 'Nummeret matcher én kunde.',
      customerId,
      customerLabel: label,
      actions: [
        { id: 'open_customer', label: 'Åbn kunde', enabled: true, blockedReason: null, href: `/dashboard/customers/${customerId}`, requiresConfirmation: false },
        caseHref
          ? { id: 'open_case', label: `Åbn sag ${caseHref.case_number ?? ''}`.trim(), enabled: true, blockedReason: null, href: `/dashboard/orders/${caseHref.id}`, requiresConfirmation: false }
          : blocked('open_case', 'Åbn sag', 'Kunden har ingen åben sag i det, du kan se.'),
        { id: 'create_callback', label: 'Opret tilbageringning', enabled: true, blockedReason: null, href: null, requiresConfirmation: true },
        { id: 'add_note', label: 'Gem opkaldsnote', enabled: true, blockedReason: null, href: null, requiresConfirmation: true },
        ...external,
      ],
    }
  }

  const lead = lookup.matches.find((m) => m.kind === 'lead')
  if (lead) {
    return {
      ...base,
      matchStatus: 'lead',
      reason: 'Nummeret matcher et lead, ikke en kunde.',
      customerId: null,
      customerLabel: lead.label,
      actions: [
        { id: 'open_lead', label: 'Åbn lead', enabled: true, blockedReason: null, href: `/dashboard/leads/${lead.id}`, requiresConfirmation: false },
        ...external,
      ],
    }
  }

  return {
    ...base,
    matchStatus: 'none',
    reason: 'Ingen kunde, kontakt eller lead har nummeret.',
    customerId: null,
    customerLabel: null,
    actions: external,
  }
}
