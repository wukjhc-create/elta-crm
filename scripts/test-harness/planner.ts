/**
 * Test Harness — deterministisk simulerings-PLAN (ren, ingen DB).
 * buildPlan(config) => alle syntetiske entiteter med timeline + relationer.
 * Selve DB-insert sker i apply.ts (guard-gated, mod staging).
 */
import { Rng } from './rng'
import { SYNTHETIC_TAG, type GeneratorConfig } from './types'
import { makeSeedRunId } from './generator-util'

export interface PlannedEntity {
  kind: string
  ref: string
  parentRef?: string
  month: number
  createdAt: string
  synthetic: typeof SYNTHETIC_TAG
  data: Record<string, unknown>
}

export interface HarnessPlan {
  seedRunId: string
  months: number
  entities: PlannedEntity[]
  counts: Record<string, number>
}

const FIRST_NAMES = ['Anders', 'Bo', 'Camilla', 'Dorte', 'Erik', 'Frank', 'Gitte', 'Henrik', 'Ida', 'Jens', 'Karin', 'Lars', 'Mette', 'Niels', 'Ole', 'Pia']
const LAST_NAMES = ['Hansen', 'Jensen', 'Nielsen', 'Pedersen', 'Andersen', 'Christensen', 'Larsen', 'Sørensen', 'Rasmussen', 'Madsen']
const OFFER_STATUSES = [
  { item: 'accepted', weight: 4 },
  { item: 'rejected', weight: 2 },
  { item: 'expired', weight: 1 },
  { item: 'sent', weight: 2 },
  { item: 'draft', weight: 1 },
] as const
const CASE_STATUSES = ['new', 'in_progress', 'pending', 'closed'] as const

function isoInMonth(baseYear: number, baseMonth: number, monthOffset: number, rng: Rng): string {
  const d = new Date(Date.UTC(baseYear, baseMonth + monthOffset, 1 + rng.int(0, 27), rng.int(6, 18), rng.int(0, 59)))
  return d.toISOString()
}

export function buildPlan(config: GeneratorConfig): HarnessPlan {
  const rng = new Rng(config.seed)
  const seedRunId = makeSeedRunId(config.seed)
  const entities: PlannedEntity[] = []
  const counts: Record<string, number> = {}
  const bump = (k: string) => { counts[k] = (counts[k] ?? 0) + 1 }

  const now = new Date()
  const baseYear = now.getUTCFullYear()
  const baseMonth = now.getUTCMonth() - config.months + 1

  let custN = 0
  let offerN = 0
  for (let m = 0; m < config.months; m++) {
    for (let i = 0; i < config.customersPerMonth; i++) {
      custN++
      const fn = rng.pick(FIRST_NAMES)
      const ln = rng.pick(LAST_NAMES)
      const cref = `cust-${custN}`
      const email = `${fn}.${ln}.${custN}@harness.test`.toLowerCase()
      const createdAt = isoInMonth(baseYear, baseMonth, m, rng)
      const fromLead = rng.chance(config.mix.leadToCustomer)
      if (fromLead) {
        entities.push({ kind: 'lead', ref: `lead-${custN}`, month: m, createdAt, synthetic: SYNTHETIC_TAG, data: { name: `${fn} ${ln}`, email, status: 'converted', tag: SYNTHETIC_TAG } })
        bump('lead')
      }
      entities.push({ kind: 'customer', ref: cref, month: m, createdAt, synthetic: SYNTHETIC_TAG, data: { company_name: `${fn} ${ln}`, email, phone: `+45${rng.int(20000000, 39999999)}`, tag: SYNTHETIC_TAG, notes: SYNTHETIC_TAG } })
      bump('customer')

      // mails
      const mails = rng.int(0, config.mix.emailsPerCustomer * 2)
      for (let e = 0; e < mails; e++) {
        const mref = `mail-${custN}-${e}`
        entities.push({ kind: 'incoming_email', ref: mref, parentRef: cref, month: m, createdAt: isoInMonth(baseYear, baseMonth, m, rng), synthetic: SYNTHETIC_TAG, data: { subject: `[${SYNTHETIC_TAG}] Forespørgsel ${custN}-${e}`, sender_email: email, tag: SYNTHETIC_TAG } })
        bump('incoming_email')
        // agent proposal fra mail
        if (rng.chance(config.mix.agentProposalRate)) {
          const runRef = `run-${mref}`
          entities.push({ kind: 'agent_run', ref: runRef, parentRef: mref, month: m, createdAt, synthetic: SYNTHETIC_TAG, data: { agent_type: 'mail', trigger: 'manual', safety_mode: 'suggest', status: 'awaiting_approval' } })
          entities.push({ kind: 'agent_task', ref: `task-${mref}`, parentRef: runRef, month: m, createdAt, synthetic: SYNTHETIC_TAG, data: { kind: 'triage_email' } })
          entities.push({ kind: 'agent_action', ref: `act-${mref}`, parentRef: runRef, month: m, createdAt, synthetic: SYNTHETIC_TAG, data: { capability: 'mail.draft_reply', side_effect_class: 'read', status: 'planned', idempotency_key: `mail-reply:${mref}` } })
          bump('agent_run'); bump('agent_task'); bump('agent_action')
          if (rng.chance(0.5)) { entities.push({ kind: 'agent_approval', ref: `appr-${mref}`, parentRef: `act-${mref}`, month: m, createdAt, synthetic: SYNTHETIC_TAG, data: { decision: 'approved' } }); bump('agent_approval') }
        }
      }

      // portal-aktivitet
      if (rng.chance(config.mix.portalActivityRate)) { entities.push({ kind: 'portal_activity', ref: `portal-${custN}`, parentRef: cref, month: m, createdAt, synthetic: SYNTHETIC_TAG, data: { tag: SYNTHETIC_TAG } }); bump('portal_activity') }

      // sager
      if (rng.chance(config.mix.customerToCase)) {
        const caseRef = `case-${custN}`
        entities.push({ kind: 'service_case', ref: caseRef, parentRef: cref, month: m, createdAt, synthetic: SYNTHETIC_TAG, data: { status: rng.pick(CASE_STATUSES), tag: SYNTHETIC_TAG } })
        bump('service_case')
        // dokumenter
        const docs = rng.int(0, config.mix.documentsPerCase * 2)
        for (let d = 0; d < docs; d++) { entities.push({ kind: 'document', ref: `doc-${custN}-${d}`, parentRef: caseRef, month: m, createdAt, synthetic: SYNTHETIC_TAG, data: { tag: SYNTHETIC_TAG } }); bump('document') }
        // medarbejder-handling + statusændring
        entities.push({ kind: 'employee_action', ref: `emp-${caseRef}`, parentRef: caseRef, month: m, createdAt, synthetic: SYNTHETIC_TAG, data: { action: 'update_status', tag: SYNTHETIC_TAG } })
        entities.push({ kind: 'status_change', ref: `sc-${caseRef}`, parentRef: caseRef, month: m, createdAt, synthetic: SYNTHETIC_TAG, data: { from: 'new', to: 'in_progress' } })
        bump('employee_action'); bump('status_change')
        // tilbud
        if (rng.chance(config.mix.caseToOffer)) {
          offerN++
          const status = rng.weighted(OFFER_STATUSES as unknown as ReadonlyArray<{ item: string; weight: number }>)
          entities.push({ kind: 'offer', ref: `offer-${offerN}`, parentRef: caseRef, month: m, createdAt, synthetic: SYNTHETIC_TAG, data: { offer_number: `HARNESS-${config.seed}-${offerN}`, status, total: rng.int(5000, 200000), tag: SYNTHETIC_TAG } })
          bump(`offer_${status}`); bump('offer')
        }
      }

      // fejlscenarie + samtidighed (markeres til scenario-runner)
      if (rng.chance(config.mix.errorScenarioRate)) { entities.push({ kind: 'error_scenario', ref: `err-${custN}`, parentRef: cref, month: m, createdAt, synthetic: SYNTHETIC_TAG, data: { kind: rng.pick(['retry', 'timeout', 'conflict']) } }); bump('error_scenario') }
      if (rng.chance(config.mix.concurrentActionRate)) { entities.push({ kind: 'concurrent_marker', ref: `conc-${custN}`, parentRef: cref, month: m, createdAt, synthetic: SYNTHETIC_TAG, data: {} }); bump('concurrent_marker') }
    }
  }

  return { seedRunId, months: config.months, entities, counts }
}
