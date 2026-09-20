/**
 * Agent Core — confidence-model for Mailagent-forslag (ren logik, ingen DB).
 *
 * Konservativ per design:
 *  - Flere kandidater => ALTID 'low' (kraever manuel udvaelgelse), uanset signaler.
 *  - Enkelt entydigt email-match => 'high'.
 *  - Kun svage signaler (navn) => 'low'.
 *  - Ingen match => 'low' + "ingen match".
 * Confidence styrer IKKE automatisk execution — kun review-prioritering/visning.
 */

export type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface MatchSignal {
  kind: 'email' | 'phone' | 'name' | 'relation'
  detail: string
  strong: boolean
}

export interface CustomerCandidate {
  id: string
  company_name: string
  customer_number: string | null
  email: string | null
  phone?: string | null
  signals: MatchSignal[]
}

export interface LinkConfidence {
  level: ConfidenceLevel
  score: number // 0..1
  rationale: string
  conflicts: boolean
  candidateCount: number
}

function hasStrong(c: CustomerCandidate, kind: MatchSignal['kind']): boolean {
  return c.signals.some((s) => s.kind === kind && s.strong)
}
function hasAny(c: CustomerCandidate, kind: MatchSignal['kind']): boolean {
  return c.signals.some((s) => s.kind === kind)
}

/**
 * Beregn confidence for et link_customer-forslag ud fra kandidater.
 */
export function scoreLinkConfidence(candidates: CustomerCandidate[]): LinkConfidence {
  const candidateCount = candidates.length

  if (candidateCount === 0) {
    return { level: 'low', score: 0, rationale: 'Ingen kundematch fundet', conflicts: false, candidateCount: 0 }
  }

  if (candidateCount > 1) {
    // Tvetydigt -> altid manuel udvaelgelse.
    return {
      level: 'low',
      score: 0.3,
      rationale: `${candidateCount} mulige kunder matcher — kraever manuel udvaelgelse`,
      conflicts: true,
      candidateCount,
    }
  }

  const c = candidates[0]
  if (hasStrong(c, 'email')) {
    return { level: 'high', score: 0.95, rationale: 'Entydig email-match', conflicts: false, candidateCount }
  }
  if (hasStrong(c, 'phone')) {
    return { level: 'medium', score: 0.7, rationale: 'Telefon-match (ikke email)', conflicts: false, candidateCount }
  }
  if (hasAny(c, 'name')) {
    return { level: 'low', score: 0.4, rationale: 'Kun navne-lignende match — verificér manuelt', conflicts: false, candidateCount }
  }
  return { level: 'low', score: 0.3, rationale: 'Svagt match — verificér manuelt', conflicts: false, candidateCount }
}

/**
 * Validér en reviewer's kandidat-valg mod forslagets kandidater + friske kandidater.
 * Tamper: valgt id skal vaere blandt forslagets gemte kandidater.
 * Stale: den friske kandidatliste skal matche den gemte (ellers kraev nyt review).
 * Ren funktion (ingen DB) — kaldere leverer id-listerne.
 */
export function validateCandidateSelection(
  storedCandidateIds: string[],
  freshCandidateIds: string[],
  customerId: string,
): { ok: boolean; reason?: string } {
  if (!customerId) return { ok: false, reason: 'intet kunde-valg' }
  if (!storedCandidateIds.includes(customerId)) {
    return { ok: false, reason: 'valgt kunde er ikke blandt forslagets kandidater' }
  }
  const a = [...storedCandidateIds].sort()
  const b = [...freshCandidateIds].sort()
  const sameSet = a.length === b.length && a.every((v, i) => v === b[i])
  if (!sameSet) {
    return { ok: false, reason: 'kandidatlisten er aendret (stale) — kraever nyt review' }
  }
  if (!freshCandidateIds.includes(customerId)) {
    return { ok: false, reason: 'valgt kunde findes ikke laengere' }
  }
  return { ok: true }
}

/** Højere tal = større behov for review (bruges til sortering i Agent Inbox). */
export function reviewPriority(level: ConfidenceLevel, conflicts: boolean): number {
  if (conflicts) return 3
  if (level === 'low') return 2
  if (level === 'medium') return 1
  return 0
}
