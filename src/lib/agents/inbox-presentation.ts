/**
 * Agent Inbox — praesentationsregler (P2 #14). Rene funktioner, ingen React/DB, saa de kan unit-testes.
 *
 * Baggrund (konkrete fund fra P2 #11–#13):
 *  - "Udfør" var aktiv foer godkendelse og naar agenten var slaaet fra -> altid en teknisk afvisning.
 *  - "Godkend" blev vist igen efter godkendelse (en ekstra approval fra samme admin taeller ikke).
 *  - Fejlede forslag viste kun "failed" — aarsagen (fx "forældet forslag: …") var skjult.
 *  - needs_verification / haengende 'executing' havde ingen advarsel om IKKE at gentage.
 *  - Titler/status/aarsager var raa noegler paa engelsk.
 */

export const CAPABILITY_LABELS: Record<string, string> = {
  'mail.draft_reply': 'Svarudkast til mail',
  'mail.link_customer': 'Kobl mail til kunde',
  'case.propose_from_email': 'Sagsforslag fra mail',
  'mail.send_reply': 'Send svar til kunde',
  'offer.propose_draft_from_case': 'Tilbudsudkast fra sag',
  'followup.draft_offer_reminder': 'Påmindelsesudkast (tilbud)',
  'followup.create_task': 'Opfølgningsopgave (tilbud)',
  'planning.propose_work_order': 'Arbejdsordre (planlægning)',
}

export const STATUS_LABELS: Record<string, string> = {
  planned: 'klar',
  awaiting_approval: 'afventer godkendelse',
  approved: 'godkendt — klar til udførelse',
  executing: 'udføres…',
  executed: 'udført',
  rejected: 'afvist',
  failed: 'ikke udført',
  rolled_back: 'rullet tilbage',
  needs_verification: 'kræver manuel kontrol',
}

export const AGENT_LABELS: Record<string, string> = {
  mail: 'Mailagent', offer: 'Tilbudsagent', followup: 'Opfølgningsagent', planning: 'Planlægningsagent',
  purchase: 'Indkøbsagent', economy: 'Økonomiagent', director: 'Direktøragent',
}

const TERMINAL = ['executed', 'rejected', 'failed', 'rolled_back']
const HARD_BLOCKED = ['send_external', 'push_external', 'finance', 'delete']
/** En 'executing'-action der ikke er rørt i så lang tid, er formentlig hængt (proces-crash). */
export const STUCK_EXECUTING_MS = 15 * 60_000

export interface InboxActionLite {
  status: string
  side_effect_class: string
  requires_approval: boolean
  updated_at?: string | null
}

export interface ActionControls {
  canApprove: boolean
  canReject: boolean
  canExecute: boolean
  /** Hvorfor "Udfør" er slået fra (vises som hjælpetekst). */
  executeHint: string | null
  /** Advarsel der skal ses før nogen handling (fx manuel kontrol). */
  warning: string | null
}

export function actionControls(a: InboxActionLite, agentEnabled: boolean, now = Date.now()): ActionControls {
  const needsApproval = a.requires_approval || HARD_BLOCKED.includes(a.side_effect_class)
  if (a.status === 'needs_verification') {
    return { canApprove: false, canReject: false, canExecute: false, executeHint: null,
      warning: 'Resultatet er uvist. Kontrollér manuelt om handlingen skete (fx i sendt post) — gentag den ikke.' }
  }
  if (a.status === 'executing') {
    const stuck = a.updated_at ? now - new Date(a.updated_at).getTime() > STUCK_EXECUTING_MS : false
    return { canApprove: false, canReject: false, canExecute: false, executeHint: null,
      warning: stuck ? 'Udførelsen er gået i stå. Kontrollér manuelt om effekten skete, før noget gentages.' : null }
  }
  if (TERMINAL.includes(a.status)) return { canApprove: false, canReject: false, canExecute: false, executeHint: null, warning: null }

  const approved = a.status === 'approved' || !needsApproval
  const canApprove = needsApproval && a.status !== 'approved'
  let executeHint: string | null = null
  if (!agentEnabled) executeHint = 'Agenten er slået fra — udførelse afvises, indtil den aktiveres.'
  else if (!approved) executeHint = 'Kræver godkendelse før udførelse.'
  return { canApprove, canReject: needsApproval, canExecute: agentEnabled && approved, executeHint, warning: null }
}

/** Oversæt Executor-/handler-årsager til reviewer-sprog. Ukendte årsager returneres uændret. */
export function reviewerReason(reason: string | null | undefined): string {
  if (!reason) return ''
  const r = reason.replace(/^Afvist:\s*/, '')
  if (/agent disabled/.test(r)) return 'Agenten er slået fra — intet er udført.'
  if (/mangler gyldig\(e\) approval/.test(r)) return 'Mangler godkendelse — intet er udført.'
  if (/allerede executed/.test(r)) return 'Forslaget er allerede udført — intet nyt er sket.'
  if (/terminal status: rejected/.test(r)) return 'Forslaget er afvist — det kan ikke udføres.'
  if (/terminal status: (failed|rolled_back)/.test(r)) return 'Forslaget blev ikke udført tidligere — kør agenten igen for et nyt forslag.'
  if (/kunne ikke claime/.test(r)) return 'Forslaget bliver eller er allerede udført et andet sted — intet dobbelt.'
  if (/approval ikke laengere gyldig/.test(r)) return 'Godkendelsen blev trukket tilbage undervejs — intet er udført.'
  if (/budget/.test(r)) return `Agentens dagsbudget er brugt op — intet er udført (${r}).`
  if (/klasse-mismatch|tilhoerer ikke agenten|ukendt capability|uden handler/.test(r)) return `Forslaget er ugyldigt og blev afvist af sikkerhedstjekket — intet er udført (${r}).`
  if (/^forældet forslag:/.test(r)) return r.replace(/^forældet forslag:\s*/, 'Forslaget er forældet: ')
  return r
}
