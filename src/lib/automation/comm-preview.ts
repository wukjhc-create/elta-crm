/**
 * Forhåndsvisning af kommunikationsregler. Sender aldrig.
 * `wouldSend` er altid false. Et tændt live-flag andre steder ændrer ikke denne funktion.
 */
export type CommChannel = 'email' | 'sms' | 'both'

export type CommRuleId = 'offer.followup' | 'inspection.reminder' | 'poa.reminder' | 'missing_info.reminder' | 'callback.reminder'

export interface CommPreviewRule {
  id: CommRuleId
  channel: CommChannel
  delayDays: number
  paused: boolean
  template: string
}

export interface CommCandidate {
  ruleId: CommRuleId
  entityId: string
  customerId: string | null
  label: string
  ageDays: number
  reason: string
}

export interface CommPreviewItem {
  key: string
  ruleId: CommRuleId
  channel: CommChannel
  template: string
  label: string
  reason: string
  customerId: string | null
  paused: boolean
  dryRun: true
  wouldSend: false
  followUp: string
}

export const DEFAULT_COMM_RULES: CommPreviewRule[] = [
  { id: 'offer.followup', channel: 'email', delayDays: 4, paused: false, template: 'Opfølgning på tilbuddet {label}.' },
  { id: 'inspection.reminder', channel: 'both', delayDays: 1, paused: false, template: 'Påmindelse om besigtigelse: {label}.' },
  { id: 'poa.reminder', channel: 'email', delayDays: 3, paused: false, template: 'Vi mangler fuldmagt på {label}.' },
  { id: 'missing_info.reminder', channel: 'email', delayDays: 2, paused: false, template: 'Vi mangler oplysninger om {label}.' },
  { id: 'callback.reminder', channel: 'sms', delayDays: 0, paused: false, template: 'Ring tilbage vedrørende {label}.' },
]

export function previewCommunication(
  candidates: CommCandidate[],
  rules: CommPreviewRule[] = DEFAULT_COMM_RULES,
  opts?: { pausedAll?: boolean },
): CommPreviewItem[] {
  const byId = new Map(rules.map((r) => [r.id, r]))
  return candidates
    .filter((c) => byId.has(c.ruleId) && c.ageDays >= (byId.get(c.ruleId)?.delayDays ?? 0))
    .map((c) => {
      const rule = byId.get(c.ruleId) as CommPreviewRule
      const paused = !!opts?.pausedAll || rule.paused
      return {
        key: `${rule.id}:${c.entityId}`,
        ruleId: rule.id,
        channel: rule.channel,
        template: rule.template.split('{label}').join(c.label),
        label: c.label,
        reason: c.reason,
        customerId: c.customerId,
        paused,
        dryRun: true as const,
        wouldSend: false as const,
        followUp: paused ? 'Reglen er på pause. Intet sendes.' : 'Forhåndsvisning. Intet sendes, før en eksisterende godkendt afsendelse bruges.',
      }
    })
    .sort((a, b) => a.key.localeCompare(b.key))
}
